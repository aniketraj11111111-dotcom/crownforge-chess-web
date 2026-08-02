import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(process.argv[2] ?? '.');
const readText = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readBinary = (relative) => fs.readFileSync(path.join(root, relative));
const errors = [];
const fail = (message) => errors.push(message);
const runtime = readText('src/sonic-forge.js');
const app = readText('src/app-stable.js');
const feedback = readText('src/feedback.js');
const cinematic = readText('src/cinematic-director.js');
const index = readText('index.html');
const worker = readText('service-worker.js');
const wave = readBinary('public/audio/crownforge-sonic-forge-v33.wav');
const metadataText = readText('public/audio/crownforge-sonic-forge-v33.json');
const metadata = JSON.parse(metadataText);

for (const [name, pattern] of [
  ['Sonic Forge identity', /crownforge-sonic-forge/],
  ['single authoritative event channel', /crownforge:audio/],
  ['48 kHz interactive context', /sampleRate:\s*48000/],
  ['AudioBuffer sprite playback', /createBufferSource\s*\(/],
  ['lossless bank decoding', /decodeAudioData\s*\(/],
  ['piece bus', /pieceInput/],
  ['situation bus', /situationInput/],
  ['presence equalization', /type\s*=\s*["']peaking["']/],
  ['small-speaker protection', /type\s*=\s*["']highpass["']/],
  ['master compressor', /createDynamicsCompressor\s*\(/],
  ['oversampled limiter', /oversample\s*=\s*["']4x["']/],
  ['short material room', /function\s+createRoomImpulse\s*\(/],
  ['Android trusted-gesture prime', /function\s+primeDeviceOutput\s*\(/],
  ['voice priority ceiling', /MAX_ACTIVE_VOICES\s*=\s*20/],
  ['versioned sound preference', /crownforge\.sound\.enabled\.v3/],
  ['visibility lifecycle', /visibilitychange/],
]) {
  if (!pattern.test(runtime)) fail(`Sonic Forge contract missing: ${name}`);
}

for (const forbidden of [
  ['BPM clock', /const\s+BPM\b/],
  ['music score', /const\s+SCORE\b/],
  ['chord scheduler', /scheduleChord|fillSchedule/],
  ['music ducking', /duckMusic/],
  ['music output bus', /musicOutput/],
  ['legacy score identity', /The Living Crown/],
]) {
  if (forbidden[1].test(runtime)) fail(`music-free runtime still contains: ${forbidden[0]}`);
}

for (const piece of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
  if (!new RegExp(`${piece}:\\s*4`).test(runtime)) fail(`${piece} does not expose four anti-repetition variants`);
  for (let variant = 0; variant < 4; variant += 1) {
    if (!metadata.clips[`piece.${piece}.${variant}`]) fail(`sound bank is missing piece.${piece}.${variant}`);
  }
}

for (const situation of [
  'travel-short', 'travel-long', 'capture-light', 'capture-heavy', 'en-passant',
  'castle-bridge', 'promotion', 'check', 'checkmate', 'draw', 'illegal',
  'history-back', 'history-forward', 'restart', 'ready',
]) {
  if (!new RegExp(`["']${situation}["']`).test(runtime)) fail(`runtime is missing situation cue: ${situation}`);
  if (!Object.keys(metadata.clips).some((name) => name.startsWith(`situation.${situation}.`))) {
    fail(`sound bank is missing situation family: ${situation}`);
  }
}

const masterGain = Number(runtime.match(/const\s+MASTER_GAIN\s*=\s*([\d.]+)/)?.[1]);
if (!Number.isFinite(masterGain) || masterGain < 0.68 || masterGain > 0.8) {
  fail(`master gain must be tablet-audible and limiter-safe; found ${masterGain}`);
}
if (/ChessGame|game\.play|makeMove|getLegalMoves|applyLegalMove|generateLegalMoves/.test(runtime)) {
  fail('Sonic Forge attempted to own chess state');
}
if (/\bhttps?:\/\//.test(runtime)) fail('Sonic Forge must remain local and offline-only');
if (/AudioContext|createOscillator/.test(feedback) || /AudioContext|createOscillator/.test(cinematic)) {
  fail('legacy presentation modules still create duplicate audio contexts');
}
if (!/id=["']sound-toggle["']/.test(index) || !/>🔊 Sound On</.test(index)) {
  fail('UI is not a truthful Sound On/Off control');
}
if (/Music On|Music Off|premium-soundtrack/.test(index)) fail('legacy music UI/assets remain in index.html');

const capturedIndex = app.indexOf('const capturedPiece');
const playIndex = app.indexOf('game.play(move)');
const audioPublishIndex = app.indexOf('publishAudioEvent("move"');
if (capturedIndex < 0 || playIndex <= capturedIndex || audioPublishIndex <= playIndex) {
  fail('captured-piece metadata or audio publication is outside the authoritative move boundary');
}
for (const contract of [
  ['audio payload V2', /Object\.freeze\(\{[\s\S]*?version:\s*2/],
  ['capture identity', /capturedPiece:\s*capturedPiece\s*\?/],
  ['captured side', /capturedSide:\s*capturedPiece\s*\?/],
  ['move distance', /distance:\s*audioMoveDistance/],
  ['destination material', /destinationMaterial:/],
  ['en-passant square', /Square\.fromFileRank\(move\.to\.file,\s*move\.from\.rank\)/],
  ['castling rook destination', /rookTo:/],
  ['terminal state', /terminal:\s*game\.outcome\.isTerminal/],
]) {
  if (!contract[1].test(app)) fail(`engine-to-SFX bridge missing: ${contract[0]}`);
}

if (metadata.version !== 33 || metadata.identity !== 'crownforge-sonic-forge' || metadata.music !== false) {
  fail('sound metadata identity/version/music contract is invalid');
}
if (metadata.sampleRate !== 48000 || metadata.channels !== 1 || metadata.format !== 'pcm-s16le') {
  fail('sound bank must be lossless 48 kHz mono PCM');
}
if (metadata.clipCount !== 58 || Object.keys(metadata.clips).length !== 58) {
  fail(`expected 58 mastered clips, found ${metadata.clipCount}`);
}
const waveHash = crypto.createHash('sha256').update(wave).digest('hex');
if (waveHash !== metadata.sha256) fail('sound bank SHA-256 does not match metadata');
if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE') {
  fail('sound bank is not a valid RIFF/WAVE container');
}
if (wave.readUInt32LE(24) !== 48000 || wave.readUInt16LE(22) !== 1 || wave.readUInt16LE(34) !== 16) {
  fail('WAV header is not 48 kHz mono PCM16');
}

for (const [name, clip] of Object.entries(metadata.clips)) {
  if (!(clip.duration > 0.15 && clip.duration < 3.2)) fail(`${name} duration is outside the mobile SFX budget`);
  if (!(clip.peak >= 0.62 && clip.peak < 0.99)) fail(`${name} peak is outside the mastered window: ${clip.peak}`);
  if (!(clip.rms >= 0.025 && clip.rms < 0.42)) fail(`${name} RMS is outside the audible window: ${clip.rms}`);
  if (Math.abs(clip.dc) >= 0.002) fail(`${name} has excessive DC offset: ${clip.dc}`);
}

function spectralFingerprint(name) {
  const clip = metadata.clips[name];
  const sampleRate = metadata.sampleRate;
  const start = Math.round(clip.offset * sampleRate);
  const count = Math.round(clip.duration * sampleRate);
  const coefficients = [300, 1200, 4000].map(
    (frequency) => 1 - Math.exp(-2 * Math.PI * frequency / sampleRate),
  );
  let low = 0;
  let lowMid = 0;
  let mid = 0;
  let previous = 0;
  let crossings = 0;
  const energy = [0, 0, 0, 0];

  for (let index = 0; index < count; index += 1) {
    const sample = wave.readInt16LE(44 + (start + index) * 2) / 32768;
    low += coefficients[0] * (sample - low);
    lowMid += coefficients[1] * (sample - lowMid);
    mid += coefficients[2] * (sample - mid);
    const bands = [low, lowMid - low, mid - lowMid, sample - mid];
    for (let band = 0; band < bands.length; band += 1) energy[band] += bands[band] * bands[band];
    if (index > 0 && Math.sign(sample) !== Math.sign(previous)) crossings += 1;
    previous = sample;
  }

  const total = energy.reduce((sum, value) => sum + value, 0);
  return [...energy.map((value) => value / total), crossings / count];
}

const pieceFingerprints = {};
for (const piece of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
  const variants = Array.from({ length: 4 }, (_, variant) => spectralFingerprint(`piece.${piece}.${variant}`));
  pieceFingerprints[piece] = variants[0].map(
    (_value, feature) => variants.reduce((sum, values) => sum + values[feature], 0) / variants.length,
  );
}
let minimumPieceDistance = Infinity;
const pieceNames = Object.keys(pieceFingerprints);
for (let left = 0; left < pieceNames.length; left += 1) {
  for (let right = left + 1; right < pieceNames.length; right += 1) {
    const distance = Math.sqrt(pieceFingerprints[pieceNames[left]].reduce(
      (sum, value, feature) => sum + Math.pow(value - pieceFingerprints[pieceNames[right]][feature], 2),
      0,
    ));
    minimumPieceDistance = Math.min(minimumPieceDistance, distance);
  }
}
if (minimumPieceDistance < 0.035) {
  fail(`piece material fingerprints collapsed into a generic timbre; minimum distance ${minimumPieceDistance}`);
}

for (const asset of [
  './src/sonic-forge.js?v=33',
  './sonic-forge.css?v=33',
  './public/audio/crownforge-sonic-forge-v33.wav',
  './public/audio/crownforge-sonic-forge-v33.json',
]) {
  if (!worker.includes(JSON.stringify(asset))) fail(`offline shell is missing Sonic Forge asset: ${asset}`);
}

if (errors.length) {
  for (const error of errors) console.error(`Sonic Forge verification failure: ${error}`);
  process.exit(1);
}

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'set', value, time }); }
}

class AudioNode {
  connect(destination) { this.destination = destination; return destination; }
}

class Gain extends AudioNode {
  constructor() { super(); this.gain = new Param(1); }
}

class Filter extends AudioNode {
  constructor() {
    super();
    this.frequency = new Param();
    this.gain = new Param();
    this.Q = new Param();
    this.type = '';
  }
}

class Compressor extends AudioNode {
  constructor() {
    super();
    this.threshold = new Param();
    this.knee = new Param();
    this.ratio = new Param();
    this.attack = new Param();
    this.release = new Param();
  }
}

class FakeBuffer {
  constructor(channels, length, sampleRate = 48000) {
    this.numberOfChannels = channels;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(index) { return this.channels[index]; }
}

class Oscillator extends AudioNode {
  constructor(context) {
    super();
    this.context = context;
    this.frequency = new Param();
    this.onended = null;
  }
  start(time) { this.context.primes.push({ time }); }
  stop() { this.onended?.(); }
}

class BufferSource extends AudioNode {
  constructor(context) {
    super();
    this.context = context;
    this.playbackRate = new Param(1);
    this.onended = null;
    this.buffer = null;
  }
  start(time, offset, duration) {
    this.context.bufferStarts.push({ time, offset, duration, rate: this.playbackRate.value });
  }
  stop() { this.onended?.(); }
}

const contexts = [];
class FakeAudioContext {
  constructor(options = {}) {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = options.sampleRate ?? 48000;
    this.destination = new AudioNode();
    this.primes = [];
    this.bufferStarts = [];
    this.operations = [];
    contexts.push(this);
  }
  createGain() { return new Gain(); }
  createBiquadFilter() { return new Filter(); }
  createDynamicsCompressor() { return new Compressor(); }
  createWaveShaper() { const node = new AudioNode(); node.curve = null; node.oversample = 'none'; return node; }
  createConvolver() { this.operations.push('create-convolver'); const node = new AudioNode(); node.buffer = null; return node; }
  createBuffer(channels, length, rate) { return new FakeBuffer(channels, length, rate); }
  createOscillator() { return new Oscillator(this); }
  createBufferSource() { return new BufferSource(this); }
  createStereoPanner() { const node = new AudioNode(); node.pan = new Param(); return node; }
  async decodeAudioData() { this.operations.push('decode-audio'); return new FakeBuffer(1, 48_000, 48_000); }
  async resume() { this.operations.push('resume'); this.state = 'running'; }
  async suspend() { this.operations.push('suspend'); this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

class HTMLButtonElement {
  constructor() {
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.disabled = false;
    this.textContent = '';
    this.title = '';
  }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(target) { return target === this; }
  click() { for (const listener of this.listeners.click ?? []) listener({ target: this }); }
}

const button = new HTMLButtonElement();
const windowListeners = {};
const documentListeners = {};
const storage = new Map();
const addListener = (registry, type, listener) => { (registry[type] ??= []).push(listener); };
const windowObject = {
  AudioContext: FakeAudioContext,
  webkitAudioContext: null,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  addEventListener: (type, listener) => addListener(windowListeners, type, listener),
  navigator: { userActivation: { isActive: false } },
};
const documentObject = {
  visibilityState: 'visible',
  querySelector: (selector) => selector === '#sound-toggle' ? button : null,
  addEventListener: (type, listener) => addListener(documentListeners, type, listener),
};
const fetchMock = async (url) => {
  if (url.endsWith('.json')) {
    return { ok: true, json: async () => JSON.parse(metadataText) };
  }
  if (url.endsWith('.wav')) {
    const data = wave.buffer.slice(wave.byteOffset, wave.byteOffset + wave.byteLength);
    return { ok: true, arrayBuffer: async () => data };
  }
  return { ok: false, status: 404 };
};

const sandbox = vm.createContext({
  window: windowObject,
  document: documentObject,
  HTMLButtonElement,
  Float32Array,
  Math,
  Number,
  Object,
  Promise,
  Set,
  Map,
  console,
  fetch: fetchMock,
});
vm.runInContext(runtime, sandbox);

const flush = () => new Promise((resolve) => setImmediate(resolve));
const waitForAudio = async () => { await flush(); await flush(); await flush(); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const emitWindow = (type, event = {}) => {
  for (const listener of windowListeners[type] ?? []) listener(event);
};
const emitDocument = (type, event = {}) => {
  for (const listener of documentListeners[type] ?? []) listener(event);
};
const bufferVoiceCount = () => contexts.reduce((total, context) => total + context.bufferStarts.length, 0);
const offsetNames = new Map(Object.entries(metadata.clips).map(([name, clip]) => [clip.offset.toFixed(6), name]));
const namesSince = (context, index) => context.bufferStarts.slice(index)
  .map((voice) => offsetNames.get(Number(voice.offset).toFixed(6)) ?? `unknown:${voice.offset}`);

assert(button.dataset.system === 'sonic-forge-v33', 'runtime identity was not exposed');
assert(button.dataset.music === 'false', 'runtime did not explicitly disable music');
assert(button.textContent === 'Tap for Sound', 'locked sound must expose a truthful unlock prompt');
assert(contexts.length === 0 && bufferVoiceCount() === 0, 'audio voices started before user activation');

emitWindow('pointerdown', { target: button });
button.click();
await waitForAudio();
assert(contexts.length === 1, `expected one AudioContext, got ${contexts.length}`);
assert(button.dataset.audioState === 'ready', 'Sonic Forge did not become ready after activation');
assert(button.attributes['aria-pressed'] === 'true', 'first unlock gesture immediately disabled sound');
assert(button.textContent === '🔊 Sound On', 'enabled runtime does not expose Sound On');
assert(windowObject.CROWNFORGE_SFX_READY === true, 'decoded sound bank readiness was not exposed');
assert(contexts[0].operations.indexOf('resume') < contexts[0].operations.indexOf('decode-audio'), 'bank decoded before Android resume');

let sequence = 0;
const move = async (overrides = {}) => {
  sequence += 1;
  const before = bufferVoiceCount();
  emitWindow('crownforge:audio', {
    detail: {
      version: 2,
      kind: 'move',
      sequence,
      piece: 'pawn',
      side: sequence % 2 ? 'white' : 'black',
      from: 'e2',
      to: 'e4',
      distance: 2,
      destinationMaterial: 'maple',
      capture: false,
      capturedPiece: null,
      capturedSide: null,
      enPassant: false,
      castle: null,
      rookTo: null,
      promotion: null,
      check: false,
      terminal: false,
      outcome: 'inprogress',
      winner: null,
      ...overrides,
    },
  });
  await waitForAudio();
  assert(bufferVoiceCount() > before, `move scheduled no SFX voices: ${JSON.stringify(overrides)}`);
  return { count: bufferVoiceCount() - before, names: namesSince(contexts[0], before) };
};

for (const piece of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
  const result = await move({ piece, from: 'd4', to: 'e5', distance: 1 });
  assert(result.names.some((name) => name.startsWith(`piece.${piece}.`)), `${piece} identity did not play`);
}

const lightCapture = await move({ capture: true, capturedPiece: 'pawn' });
assert(lightCapture.names.some((name) => name.startsWith('situation.capture-light.')), 'light capture layer is missing');
const heavyCapture = await move({ capture: true, capturedPiece: 'queen' });
assert(heavyCapture.names.some((name) => name.startsWith('situation.capture-heavy.')), 'heavy capture layer is missing');
const enPassant = await move({ capture: true, capturedPiece: 'pawn', enPassant: true });
assert(enPassant.names.some((name) => name.startsWith('situation.en-passant.')), 'en-passant layer is missing');
const castle = await move({ piece: 'king', from: 'e1', to: 'g1', distance: 2, castle: 'king-side', rookTo: 'f1' });
assert(castle.names.some((name) => name.startsWith('situation.castle-bridge.')) && castle.names.some((name) => name.startsWith('piece.rook.')), 'castling sequence is incomplete');
const promotion = await move({ promotion: 'queen', to: 'e8' });
assert(promotion.names.some((name) => name.startsWith('situation.promotion.')) && promotion.names.some((name) => name.startsWith('piece.queen.')), 'promotion transformation is incomplete');
const check = await move({ check: true });
assert(check.names.some((name) => name.startsWith('situation.check.')), 'check warning is missing');
const mate = await move({ piece: 'queen', capture: true, capturedPiece: 'rook', check: true, terminal: true, outcome: 'checkmate', winner: 'black' });
assert(mate.names.some((name) => name.startsWith('situation.checkmate.')), 'checkmate reveal is missing');

const beforeHistory = bufferVoiceCount();
emitWindow('crownforge:audio', { detail: { version: 2, kind: 'history', sequence: 2, direction: 'back', to: 'e4' } });
await waitForAudio();
assert(namesSince(contexts[0], beforeHistory).some((name) => name.startsWith('situation.history-back.')), 'Back cue is missing');
sequence = 2;
const forwardBranch = await move({ piece: 'bishop', from: 'f1', to: 'c4', distance: 3 });
assert(forwardBranch.names.some((name) => name.startsWith('piece.bishop.')), 'history branch did not resume piece SFX');

button.click();
await waitForAudio();
assert(button.dataset.audioState === 'off' && button.attributes['aria-pressed'] === 'false', 'Sound Off toggle failed');
const beforeMutedIllegal = bufferVoiceCount();
emitWindow('crownforge:audio', { detail: { version: 2, kind: 'illegal', to: 'a1' } });
await waitForAudio();
assert(bufferVoiceCount() === beforeMutedIllegal, 'Sound Off still emitted an audible cue');

button.click();
await waitForAudio();
assert(button.dataset.audioState === 'ready' && contexts.length === 1, 'Sound On did not reuse the original AudioContext');
button.click();
await waitForAudio();
assert(button.dataset.audioState === 'off', 'first click after re-enabling sound did not mute immediately');
button.click();
await waitForAudio();
assert(button.dataset.audioState === 'ready' && contexts.length === 1, 'second Sound On cycle did not reuse the original AudioContext');
const beforeRestart = bufferVoiceCount();
emitWindow('crownforge:audio', { detail: { version: 2, kind: 'restart', sequence: 0, to: 'e1' } });
await waitForAudio();
assert(namesSince(contexts[0], beforeRestart).some((name) => name.startsWith('situation.restart.')), 'restart cue is missing');

documentObject.visibilityState = 'hidden';
emitDocument('visibilitychange');
await flush();
assert(contexts[0].state === 'suspended' && button.dataset.audioState === 'paused', 'visibility pause failed');
documentObject.visibilityState = 'visible';
emitDocument('visibilitychange');
await waitForAudio();
assert(contexts[0].state === 'running' && contexts.length === 1, 'visibility resume created a duplicate AudioContext');

console.log(
  `Crownforge Sonic Forge verification passed: ${metadata.clipCount} original 48 kHz PCM clips, ` +
  `six four-variant piece identities, 15 situation families, ${bufferVoiceCount()} exercised buffer voices, ` +
  `minimum spectral distance=${minimumPieceDistance.toFixed(3)}, music=off and master=${masterGain.toFixed(2)} ` +
  `with one Android-safe AudioContext.`,
);
