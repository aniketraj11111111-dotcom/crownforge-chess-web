import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 48_000;
const GAP_SECONDS = 0.024;
const OUTPUT_DIR = path.resolve('public/audio');
const WAV_PATH = path.join(OUTPUT_DIR, 'crownforge-sonic-forge-v33.wav');
const META_PATH = path.join(OUTPUT_DIR, 'crownforge-sonic-forge-v33.json');
const CHECK_ONLY = process.argv.includes('--check');

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

function randomSource(seedText) {
  let state = hashText(seedText) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const secondsToSamples = (seconds) => Math.max(1, Math.ceil(seconds * SAMPLE_RATE));
const createClip = (seconds) => new Float64Array(secondsToSamples(seconds));

function addModalBank(samples, options) {
  const {
    start = 0,
    duration,
    amplitude,
    modes,
    decay = 0.18,
    attack = 0.0015,
    seed = 'modal',
    sweep = 0,
  } = options;
  const random = randomSource(seed);
  const startSample = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.min(secondsToSamples(duration), samples.length - startSample);
  const phases = modes.map(() => random() * Math.PI * 2);
  const weights = modes.map((_frequency, index) => Math.pow(index + 1, -0.58) * (0.86 + random() * 0.28));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const attackEnvelope = Math.min(1, time / Math.max(0.0005, attack));
    const envelope = attackEnvelope * Math.exp(-time / decay) * Math.pow(Math.max(0, 1 - time / duration), 0.32);
    let value = 0;
    for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
      const bend = 1 + sweep * (time / duration);
      value += Math.sin(Math.PI * 2 * modes[modeIndex] * bend * time + phases[modeIndex]) * weights[modeIndex];
    }
    samples[startSample + index] += (value / weightSum) * amplitude * envelope;
  }
}

function addBandNoise(samples, options) {
  const {
    start = 0,
    duration,
    amplitude,
    lowCut = 180,
    highCut = 4_800,
    decay = 0.08,
    attack = 0.001,
    seed = 'noise',
    reverse = false,
  } = options;
  const random = randomSource(seed);
  const startSample = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.min(secondsToSamples(duration), samples.length - startSample);
  const highCoefficient = 1 - Math.exp(-2 * Math.PI * highCut / SAMPLE_RATE);
  const lowCoefficient = 1 - Math.exp(-2 * Math.PI * lowCut / SAMPLE_RATE);
  let highState = 0;
  let lowState = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = Math.min(1, time / duration);
    const white = random() * 2 - 1;
    highState += highCoefficient * (white - highState);
    lowState += lowCoefficient * (white - lowState);
    const band = highState - lowState;
    const attackEnvelope = Math.min(1, time / Math.max(0.0005, attack));
    const normalEnvelope = attackEnvelope * Math.exp(-time / decay);
    const reverseEnvelope = Math.pow(progress, 1.7) * Math.pow(1 - progress, 0.2);
    samples[startSample + index] += band * amplitude * (reverse ? reverseEnvelope : normalEnvelope);
  }
}

function addKnock(samples, options) {
  const { start = 0, weight = 1, brightness = 1, seed = 'knock' } = options;
  addBandNoise(samples, {
    start,
    duration: 0.045,
    amplitude: 0.88 * weight,
    lowCut: 520 * brightness,
    highCut: 6_800 * brightness,
    decay: 0.008,
    seed: `${seed}:click`,
  });
  addModalBank(samples, {
    start,
    duration: 0.34,
    amplitude: 0.92 * weight,
    modes: [185, 418, 905, 1_720, 3_150].map((frequency) => frequency * brightness),
    decay: 0.115 + weight * 0.075,
    seed: `${seed}:body`,
  });
}

function addWhoosh(samples, options) {
  const { start = 0, duration = 0.18, amplitude = 0.18, seed = 'whoosh', reverse = false } = options;
  addBandNoise(samples, {
    start,
    duration,
    amplitude,
    lowCut: 360,
    highCut: 5_200,
    decay: reverse ? duration * 3 : duration * 0.38,
    attack: reverse ? duration * 0.35 : 0.006,
    reverse,
    seed,
  });
}

function removeDc(samples) {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  for (let index = 0; index < samples.length; index += 1) samples[index] -= mean;
}

function masterClip(samples, targetPeak) {
  removeDc(samples);
  const fadeSamples = Math.min(Math.floor(SAMPLE_RATE * 0.012), Math.floor(samples.length / 4));
  for (let index = 0; index < fadeSamples; index += 1) {
    const fade = index / fadeSamples;
    samples[samples.length - 1 - index] *= fade * fade;
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0 ? targetPeak / peak : 1;
  let squared = 0;
  let dc = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const shaped = Math.tanh(samples[index] * scale * 1.08) / Math.tanh(1.08);
    samples[index] = shaped;
    squared += shaped * shaped;
    dc += shaped;
  }
  const masteredPeak = samples.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  return {
    dc: dc / samples.length,
    peak: masteredPeak,
    rms: Math.sqrt(squared / samples.length),
  };
}

const pieceDefinitions = Object.freeze({
  pawn: {
    duration: 0.28, peak: 0.76, modes: [295, 735, 1_690, 3_420], decay: 0.105,
    render(samples, variant, seed) {
      addKnock(samples, { start: 0.016, weight: 0.66, brightness: 1.08 + variant * 0.012, seed });
      addModalBank(samples, { start: 0.021, duration: 0.23, amplitude: 0.48, modes: this.modes, decay: this.decay, seed: `${seed}:ivory` });
    },
  },
  knight: {
    duration: 0.42, peak: 0.79, modes: [238, 545, 1_260, 2_680], decay: 0.135,
    render(samples, variant, seed) {
      addKnock(samples, { start: 0.012, weight: 0.62, brightness: 0.94, seed: `${seed}:first` });
      addKnock(samples, { start: 0.082 + variant * 0.004, weight: 0.88, brightness: 1.02, seed: `${seed}:land` });
      addBandNoise(samples, { start: 0.055, duration: 0.15, amplitude: 0.12, lowCut: 720, highCut: 4_600, decay: 0.07, seed: `${seed}:leather` });
    },
  },
  bishop: {
    duration: 0.58, peak: 0.76, modes: [455, 1_105, 2_410, 4_530], decay: 0.25,
    render(samples, variant, seed) {
      addWhoosh(samples, { start: 0, duration: 0.14 + variant * 0.008, amplitude: 0.18, reverse: true, seed: `${seed}:glide` });
      addKnock(samples, { start: 0.105, weight: 0.54, brightness: 1.18, seed: `${seed}:land` });
      addModalBank(samples, { start: 0.108, duration: 0.45, amplitude: 0.5, modes: this.modes, decay: this.decay, seed: `${seed}:stone` });
    },
  },
  rook: {
    duration: 0.62, peak: 0.84, modes: [176, 402, 825, 1_560, 2_780], decay: 0.275,
    render(samples, variant, seed) {
      addWhoosh(samples, { start: 0, duration: 0.095, amplitude: 0.09, reverse: true, seed: `${seed}:push` });
      addKnock(samples, { start: 0.072, weight: 1.18, brightness: 0.82 + variant * 0.008, seed: `${seed}:block` });
      addModalBank(samples, { start: 0.074, duration: 0.51, amplitude: 0.52, modes: this.modes, decay: this.decay, seed: `${seed}:oak` });
    },
  },
  queen: {
    duration: 0.76, peak: 0.82, modes: [265, 638, 1_470, 3_080, 5_150], decay: 0.34,
    render(samples, variant, seed) {
      addWhoosh(samples, { start: 0, duration: 0.2, amplitude: 0.2, reverse: true, seed: `${seed}:silk` });
      addKnock(samples, { start: 0.15, weight: 0.86, brightness: 1.08, seed: `${seed}:land` });
      addModalBank(samples, { start: 0.152, duration: 0.58, amplitude: 0.55, modes: this.modes, decay: this.decay, seed: `${seed}:crown` });
      addBandNoise(samples, { start: 0.16, duration: 0.25, amplitude: 0.075, lowCut: 2_200, highCut: 7_600, decay: 0.12, seed: `${seed}:shimmer` });
    },
  },
  king: {
    duration: 0.72, peak: 0.85, modes: [202, 452, 970, 1_980, 3_760], decay: 0.315,
    render(samples, variant, seed) {
      addKnock(samples, { start: 0.04, weight: 1.08, brightness: 0.9 + variant * 0.009, seed: `${seed}:royal` });
      addModalBank(samples, { start: 0.043, duration: 0.62, amplitude: 0.58, modes: this.modes, decay: this.decay, seed: `${seed}:crown` });
      addBandNoise(samples, { start: 0.045, duration: 0.1, amplitude: 0.11, lowCut: 1_400, highCut: 6_400, decay: 0.035, seed: `${seed}:metal` });
    },
  },
});

function renderSituation(name, variant) {
  const seed = `crownforge:${name}:${variant}`;
  let samples;
  let peak = 0.8;

  if (name === 'travel-short' || name === 'travel-long') {
    const duration = name === 'travel-long' ? 0.28 : 0.17;
    samples = createClip(duration);
    addWhoosh(samples, { duration: duration * 0.86, amplitude: name === 'travel-long' ? 0.24 : 0.17, reverse: true, seed });
    peak = 0.62;
  } else if (name === 'capture-light' || name === 'capture-heavy') {
    const heavy = name.endsWith('heavy');
    samples = createClip(heavy ? 0.72 : 0.53);
    addBandNoise(samples, { start: 0.005, duration: 0.08, amplitude: heavy ? 0.92 : 0.74, lowCut: 640, highCut: 7_800, decay: 0.016, seed: `${seed}:fracture` });
    addKnock(samples, { start: 0.017, weight: heavy ? 1.18 : 0.78, brightness: heavy ? 0.8 : 1.08, seed: `${seed}:impact` });
    addModalBank(samples, { start: 0.024, duration: heavy ? 0.62 : 0.42, amplitude: 0.64, modes: heavy ? [164, 355, 790, 1_640] : [315, 810, 1_880, 3_600], decay: heavy ? 0.3 : 0.18, seed: `${seed}:victim` });
    peak = heavy ? 0.91 : 0.86;
  } else if (name === 'en-passant') {
    samples = createClip(0.58);
    addWhoosh(samples, { duration: 0.24, amplitude: 0.26, seed: `${seed}:vanish` });
    addKnock(samples, { start: 0.14, weight: 0.7, brightness: 1.06, seed: `${seed}:pawn` });
    addBandNoise(samples, { start: 0.17, duration: 0.22, amplitude: 0.14, lowCut: 480, highCut: 3_600, decay: 0.11, seed: `${seed}:remove` });
    peak = 0.84;
  } else if (name === 'castle-bridge') {
    samples = createClip(0.43);
    addBandNoise(samples, { start: 0, duration: 0.18, amplitude: 0.18, lowCut: 220, highCut: 2_900, decay: 0.12, reverse: true, seed: `${seed}:slide` });
    addModalBank(samples, { start: 0.14, duration: 0.26, amplitude: 0.5, modes: [228, 515, 1_110, 2_260], decay: 0.13, seed: `${seed}:lock` });
    peak = 0.72;
  } else if (name === 'promotion') {
    samples = createClip(1.18);
    addWhoosh(samples, { start: 0, duration: 0.56, amplitude: 0.28, reverse: true, seed: `${seed}:rise` });
    addModalBank(samples, { start: 0.25, duration: 0.82, amplitude: 0.58, modes: [330, 742, 1_690, 3_740], decay: 0.37, sweep: 0.28, seed: `${seed}:forge` });
    addBandNoise(samples, { start: 0.49, duration: 0.2, amplitude: 0.22, lowCut: 1_800, highCut: 8_200, decay: 0.08, seed: `${seed}:flash` });
    peak = 0.88;
  } else if (name === 'check') {
    samples = createClip(0.68);
    addBandNoise(samples, { start: 0, duration: 0.052, amplitude: 0.92, lowCut: 1_150, highCut: 8_400, decay: 0.012, seed: `${seed}:warning` });
    addModalBank(samples, { start: 0.006, duration: 0.6, amplitude: 0.75, modes: [286, 602, 1_295, 2_735], decay: 0.24, seed: `${seed}:crown` });
    peak = 0.9;
  } else if (name === 'checkmate') {
    samples = createClip(2.86);
    addBandNoise(samples, { start: 0, duration: 0.08, amplitude: 1, lowCut: 260, highCut: 7_400, decay: 0.016, seed: `${seed}:impact` });
    addModalBank(samples, { start: 0, duration: 0.65, amplitude: 0.9, modes: [128, 275, 590, 1_260], decay: 0.24, seed: `${seed}:weight` });
    addWhoosh(samples, { start: 0.38, duration: 0.44, amplitude: 0.24, seed: `${seed}:fall` });
    addModalBank(samples, { start: 0.58, duration: 1.02, amplitude: 0.62, modes: [212, 472, 1_020, 2_180], decay: 0.41, seed: `${seed}:king` });
    addBandNoise(samples, { start: 1.25, duration: 0.15, amplitude: 0.28, lowCut: 1_900, highCut: 9_200, decay: 0.07, seed: `${seed}:reveal` });
    addModalBank(samples, { start: 1.28, duration: 1.48, amplitude: 0.72, modes: [238, 535, 1_160, 2_510, 5_060], decay: 0.57, seed: `${seed}:crown` });
    peak = 0.94;
  } else if (name === 'draw') {
    samples = createClip(0.92);
    addKnock(samples, { start: 0.04, weight: 0.62, brightness: 0.84, seed: `${seed}:close` });
    addModalBank(samples, { start: 0.05, duration: 0.78, amplitude: 0.48, modes: [218, 486, 1_045, 2_060], decay: 0.31, seed: `${seed}:neutral` });
    peak = 0.76;
  } else if (name === 'illegal') {
    samples = createClip(0.22);
    addKnock(samples, { start: 0.005, weight: 0.88, brightness: 0.76, seed: `${seed}:reject` });
    addBandNoise(samples, { start: 0.007, duration: 0.035, amplitude: 0.38, lowCut: 780, highCut: 4_200, decay: 0.009, seed: `${seed}:dry` });
    peak = 0.86;
  } else if (name === 'history-back' || name === 'history-forward') {
    const backwards = name.endsWith('back');
    samples = createClip(0.34);
    addWhoosh(samples, { start: 0, duration: 0.22, amplitude: 0.21, reverse: !backwards, seed: `${seed}:time` });
    addModalBank(samples, { start: backwards ? 0.02 : 0.15, duration: 0.18, amplitude: 0.42, modes: backwards ? [780, 410, 245] : [245, 410, 780], decay: 0.1, sweep: backwards ? -0.15 : 0.15, seed: `${seed}:direction` });
    peak = 0.7;
  } else if (name === 'restart') {
    samples = createClip(0.58);
    addWhoosh(samples, { duration: 0.22, amplitude: 0.15, reverse: true, seed: `${seed}:reset` });
    [0.13, 0.18, 0.23].forEach((start, index) => addKnock(samples, { start, weight: 0.52 + index * 0.1, brightness: 1.08 - index * 0.08, seed: `${seed}:piece:${index}` }));
    peak = 0.8;
  } else if (name === 'ready') {
    samples = createClip(0.24);
    addKnock(samples, { start: 0.012, weight: 0.5, brightness: 1.22, seed: `${seed}:unlock` });
    peak = 0.68;
  } else {
    throw new Error(`Unknown situation sound: ${name}`);
  }

  return { samples, metrics: masterClip(samples, peak) };
}

const clips = [];
for (const [piece, definition] of Object.entries(pieceDefinitions)) {
  for (let variant = 0; variant < 4; variant += 1) {
    const samples = createClip(definition.duration);
    const seed = `crownforge:piece:${piece}:${variant}`;
    definition.render(samples, variant, seed);
    clips.push({ name: `piece.${piece}.${variant}`, samples, metrics: masterClip(samples, definition.peak) });
  }
}

for (const [name, variants] of [
  ['travel-short', 2], ['travel-long', 2],
  ['capture-light', 3], ['capture-heavy', 3],
  ['en-passant', 2], ['castle-bridge', 2], ['promotion', 3], ['check', 3],
  ['checkmate', 2], ['draw', 2], ['illegal', 3],
  ['history-back', 2], ['history-forward', 2], ['restart', 2], ['ready', 1],
]) {
  for (let variant = 0; variant < variants; variant += 1) {
    const rendered = renderSituation(name, variant);
    clips.push({ name: `situation.${name}.${variant}`, ...rendered });
  }
}

const gapSamples = secondsToSamples(GAP_SECONDS);
const totalSamples = clips.reduce((sum, clip) => sum + clip.samples.length + gapSamples, 0);
const sprite = new Float64Array(totalSamples);
const metadata = {
  version: 33,
  identity: 'crownforge-sonic-forge',
  sampleRate: SAMPLE_RATE,
  channels: 1,
  format: 'pcm-s16le',
  music: false,
  clips: {},
};

let cursor = gapSamples;
for (const clip of clips) {
  sprite.set(clip.samples, cursor);
  metadata.clips[clip.name] = {
    offset: Number((cursor / SAMPLE_RATE).toFixed(6)),
    duration: Number((clip.samples.length / SAMPLE_RATE).toFixed(6)),
    peak: Number(clip.metrics.peak.toFixed(6)),
    rms: Number(clip.metrics.rms.toFixed(6)),
    dc: Number(clip.metrics.dc.toFixed(8)),
  };
  cursor += clip.samples.length + gapSamples;
}

function encodeWave(samples) {
  const dataBytes = samples.length * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8);
  output.write('fmt ', 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(dataBytes, 40);

  const dither = randomSource('crownforge:pcm-dither:v33');
  for (let index = 0; index < samples.length; index += 1) {
    const tpdf = (dither() - dither()) / 65536;
    const value = Math.max(-1, Math.min(1, samples[index] + tpdf));
    output.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + index * 2);
  }
  return output;
}

const wave = encodeWave(sprite);
metadata.duration = Number((sprite.length / SAMPLE_RATE).toFixed(6));
metadata.clipCount = clips.length;
metadata.sha256 = crypto.createHash('sha256').update(wave).digest('hex');
const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;

if (CHECK_ONLY) {
  const existingWave = fs.readFileSync(WAV_PATH);
  const existingMetadata = fs.readFileSync(META_PATH, 'utf8');
  if (!existingWave.equals(wave)) throw new Error('Sonic Forge WAV is not reproducible; regenerate the bank.');
  if (existingMetadata !== metadataText) throw new Error('Sonic Forge metadata is stale; regenerate the bank.');
  console.log(`Sonic Forge bank verified: ${clips.length} clips, ${metadata.duration}s, ${wave.length} bytes, SHA-256 ${metadata.sha256}.`);
} else {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(WAV_PATH, wave);
  fs.writeFileSync(META_PATH, metadataText);
  console.log(`Sonic Forge bank generated: ${clips.length} clips, ${metadata.duration}s, ${wave.length} bytes, SHA-256 ${metadata.sha256}.`);
}
