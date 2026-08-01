import fs from 'node:fs';
import vm from 'node:vm';

const errors = [];
const fail = (message) => errors.push(message);
const soundtrack = fs.readFileSync('src/premium-soundtrack.js', 'utf8');
const app = fs.readFileSync('src/app-stable.js', 'utf8');
const feedback = fs.readFileSync('src/feedback.js', 'utf8');
const cinematic = fs.readFileSync('src/cinematic-director.js', 'utf8');

for (const [name, pattern] of [
  ['Living Crown identity', /The Living Crown/],
  ['54 BPM score clock', /const\s+BPM\s*=\s*54/],
  ['single adaptive event channel', /crownforge:audio/],
  ['ambience stem', /ambienceInput/],
  ['strategy stem', /strategyInput/],
  ['tension stem', /tensionInput/],
  ['master compressor', /createDynamicsCompressor\s*\(/],
  ['soft limiter', /createWaveShaper\s*\(/],
  ['music ducking', /function\s+duckMusic\s*\(/],
  ['checkmate cinematic', /function\s+playCheckmateCue\s*\(/],
  ['draw resolution', /function\s+playDrawCue\s*\(/],
  ['visibility lifecycle', /visibilitychange/],
  ['Android retry prompt', /Tap for Sound/],
  ['versioned mute-state recovery', /crownforge\.soundtrack\.enabled\.v2/],
  ['trusted-gesture output prime', /function\s+primeDeviceOutput\s*\(/],
]) {
  if (!pattern.test(soundtrack)) fail(`soundtrack contract missing: ${name}`);
}

for (const piece of ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King']) {
  if (!new RegExp(`function\\s+play${piece}Cue\\s*\\(`).test(soundtrack)) {
    fail(`piece identity is missing: ${piece}`);
  }
}

for (const situation of ['Capture', 'EnPassant', 'Castle', 'Promotion', 'Check', 'Illegal', 'Checkmate', 'Draw']) {
  if (!new RegExp(`function\\s+play${situation}Cue\\s*\\(`).test(soundtrack)) {
    fail(`situation cue is missing: ${situation}`);
  }
}

const masterGain = Number(soundtrack.match(/const\s+MASTER_GAIN\s*=\s*([\d.]+)/)?.[1]);
if (!Number.isFinite(masterGain) || masterGain < 0.3 || masterGain > 0.4) {
  fail(`master gain must be audibly raised but limiter-safe; found ${masterGain}`);
}
if (/ChessGame|game\.play|makeMove|getLegalMoves|applyLegalMove|generateLegalMoves/.test(soundtrack)) {
  fail('audio director attempted to own chess state');
}
if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//.test(soundtrack)) {
  fail('audio director must remain original, local and offline-only');
}
if (/AudioContext|createOscillator/.test(feedback) || /AudioContext|createOscillator/.test(cinematic)) {
  fail('legacy presentation modules still create duplicate audio contexts');
}

const playIndex = app.indexOf('game.play(move)');
const audioPublishIndex = app.indexOf('publishAudioEvent("move"');
if (playIndex < 0 || audioPublishIndex <= playIndex) {
  fail('audio move events must publish only after the authoritative engine accepts the move');
}
for (const contract of [
  ['immutable audio payload', /Object\.freeze\(\{[\s\S]*?version:\s*1/],
  ['capture flag', /capture:\s*move\.isCapture/],
  ['en-passant flag', /MoveFlags\.EnPassant/],
  ['castling flags', /MoveFlags\.CastleKingSide[\s\S]*MoveFlags\.CastleQueenSide/],
  ['promotion identity', /pieceName\(move\.promotion\)/],
  ['terminal state', /terminal:\s*game\.outcome\.isTerminal/],
]) {
  if (!contract[1].test(app)) fail(`engine-to-audio bridge missing: ${contract[0]}`);
}

if (errors.length) {
  for (const error of errors) console.error(`Living Crown verification failure: ${error}`);
  process.exit(1);
}

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  record(kind, value, time) { this.value = value; this.events.push({ kind, value, time }); }
  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exponential', value, time); }
  cancelScheduledValues(time) { this.events = this.events.filter((event) => event.time < time); }
}

class AudioNode {
  connect(destination) { return destination; }
}

class Gain extends AudioNode {
  constructor() { super(); this.gain = new Param(1); }
}

class Filter extends AudioNode {
  constructor() { super(); this.frequency = new Param(); this.Q = new Param(); this.type = ''; }
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

class Oscillator extends AudioNode {
  constructor(context) {
    super();
    this.context = context;
    this.frequency = new Param();
    this.detune = new Param();
    this.type = 'sine';
    this.onended = null;
  }
  setPeriodicWave() { this.periodicWave = true; }
  start(time) { this.context.starts.push(time); }
  stop(time) { this.context.stops.push(time); this.onended?.(); }
}

class Buffer {
  constructor(channels, length) {
    this.numberOfChannels = channels;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(index) { return this.channels[index]; }
}

const contexts = [];
class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 4000;
    this.destination = new AudioNode();
    this.starts = [];
    this.stops = [];
    this.operations = [];
    contexts.push(this);
  }
  createGain() { return new Gain(); }
  createBuffer(channels, length) { return new Buffer(channels, length); }
  createConvolver() {
    this.operations.push('create-convolver');
    const node = new AudioNode();
    node.buffer = null;
    return node;
  }
  createBiquadFilter() { return new Filter(); }
  createDynamicsCompressor() { return new Compressor(); }
  createWaveShaper() { const node = new AudioNode(); node.curve = null; node.oversample = 'none'; return node; }
  createPeriodicWave() { return {}; }
  createOscillator() { return new Oscillator(this); }
  createStereoPanner() { const node = new AudioNode(); node.pan = new Param(); return node; }
  async resume() { this.operations.push('resume'); this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
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
  click() { for (const listener of this.listeners.click ?? []) listener({ target: this }); }
}

const button = new HTMLButtonElement();
const windowListeners = {};
const documentListeners = {};
const storage = new Map();
let intervalId = 0;
const addListener = (registry, type, listener) => { (registry[type] ??= []).push(listener); };
const windowObject = {
  AudioContext: FakeAudioContext,
  webkitAudioContext: null,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  setInterval: () => ++intervalId,
  clearInterval: () => {},
  addEventListener: (type, listener) => addListener(windowListeners, type, listener),
  navigator: { userActivation: { isActive: false } },
};
const documentObject = {
  visibilityState: 'visible',
  querySelector: (selector) => selector === '#soundtrack-toggle' ? button : null,
  addEventListener: (type, listener) => addListener(documentListeners, type, listener),
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
  console,
});
// A mute saved by an older preview must not silently disable this new score.
storage.set('crownforge.soundtrack.enabled.v1', 'off');
vm.runInContext(soundtrack, sandbox);

const flush = () => new Promise((resolve) => setImmediate(resolve));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const emitWindow = (type, event = {}) => {
  for (const listener of windowListeners[type] ?? []) listener(event);
};
const emitDocument = (type, event = {}) => {
  for (const listener of documentListeners[type] ?? []) listener(event);
};
const voiceCount = () => contexts.reduce((total, context) => total + context.starts.length, 0);
const waitForAudio = async () => { await flush(); await flush(); };

assert(button.dataset.score === 'living-crown', 'runtime score identity was not exposed');
assert(button.dataset.audioState === 'waiting', 'soundtrack must wait for user activation');
assert(button.textContent === '♫ Tap for Sound', 'locked audio must show a truthful tap-to-unlock prompt');
assert(button.attributes['aria-pressed'] === 'true', 'an obsolete v1 mute state leaked into the v2 score');
emitWindow('pointerdown', { target: button });
await waitForAudio();
button.click();
await waitForAudio();
assert(contexts.length === 1, `expected one AudioContext, got ${contexts.length}`);
assert(button.dataset.audioState === 'playing', 'soundtrack did not start after activation');
assert(button.attributes['aria-pressed'] === 'true', 'first unlock tap immediately toggled music off');
assert(button.textContent === '♫ Music On', 'running audio did not expose its real state');
assert(voiceCount() >= 56, `expected adaptive voices plus an audible ready cue, got ${voiceCount()}`);
const resumeIndex = contexts[0].operations.indexOf('resume');
const graphIndex = contexts[0].operations.indexOf('create-convolver');
assert(resumeIndex >= 0 && graphIndex > resumeIndex, 'audio graph was built before Android resume accepted the gesture');

let sequence = 0;
const move = async (overrides) => {
  sequence += 1;
  const before = voiceCount();
  emitWindow('crownforge:audio', {
    detail: {
      version: 1,
      kind: 'move',
      sequence,
      phase: 'strategy',
      intensity: 0.42,
      piece: 'pawn',
      side: sequence % 2 ? 'white' : 'black',
      from: 'e2',
      to: 'e4',
      capture: false,
      enPassant: false,
      castle: null,
      promotion: null,
      check: false,
      terminal: false,
      draw: false,
      outcome: 'inprogress',
      winner: null,
      ...overrides,
    },
  });
  await waitForAudio();
  assert(voiceCount() > before, `cue scheduled no voices: ${JSON.stringify(overrides)}`);
  return voiceCount() - before;
};

for (const piece of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
  await move({ piece });
}
assert(await move({ piece: 'king', from: 'e1', to: 'g1', castle: 'king-side' }) >= 6, 'castling cue is incomplete');
assert(await move({ capture: true }) >= 4, 'capture layering is incomplete');
assert(await move({ capture: true, enPassant: true }) >= 6, 'en-passant layering is incomplete');
assert(await move({ promotion: 'queen', to: 'e8' }) >= 10, 'promotion layering is incomplete');
assert(await move({ check: true, phase: 'tension', intensity: 0.86 }) >= 5, 'check cue is incomplete');
assert(await move({
  piece: 'queen',
  capture: true,
  check: true,
  terminal: true,
  phase: 'terminal',
  intensity: 1,
  outcome: 'checkmate',
  winner: 'black',
}) >= 18, 'checkmate cinematic is incomplete');

const beforeDraw = voiceCount();
emitWindow('crownforge:audio', {
  detail: { version: 1, kind: 'terminal', phase: 'terminal', intensity: 1, outcome: 'stalemate', draw: true },
});
await waitForAudio();
assert(voiceCount() - beforeDraw >= 5, 'draw resolution is incomplete');

button.click();
await flush();
assert(button.dataset.audioState === 'off' && button.attributes['aria-pressed'] === 'false', 'music toggle failed');
assert(contexts.length === 1 && contexts[0].state === 'running', 'music off must keep one context for cues');
const beforeIllegal = voiceCount();
emitWindow('crownforge:audio', { detail: { version: 1, kind: 'illegal', phase: 'strategy', intensity: 0.38 } });
await waitForAudio();
assert(voiceCount() > beforeIllegal, 'music off incorrectly disabled feedback cues');

emitWindow('crownforge:audio', { detail: { version: 1, kind: 'restart', phase: 'opening', intensity: 0.2 } });
await waitForAudio();
assert(button.dataset.intensity === '0.20', 'restart did not restore opening intensity');

button.click();
await waitForAudio();
assert(button.dataset.audioState === 'playing', 'music did not resume');
assert(contexts.length === 1, 'music resume created a duplicate AudioContext');
documentObject.visibilityState = 'hidden';
emitDocument('visibilitychange');
await flush();
assert(contexts[0].state === 'suspended' && button.dataset.audioState === 'paused', 'visibility pause failed');
documentObject.visibilityState = 'visible';
emitDocument('visibilitychange');
await waitForAudio();
assert(contexts[0].state === 'running' && contexts.length === 1, 'visibility resume failed');

const decibelIncrease = 20 * Math.log10(masterGain / 0.11);
console.log(
  `The Living Crown verification passed: one AudioContext, six piece identities, eight situation cues, ` +
  `${voiceCount()} scheduled voices and +${decibelIncrease.toFixed(1)} dB master increase with limiter protection.`,
);
