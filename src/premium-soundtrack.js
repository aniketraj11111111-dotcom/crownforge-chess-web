(() => {
  "use strict";

  const button = document.querySelector("#soundtrack-toggle");
  if (!(button instanceof HTMLButtonElement)) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const AUDIO_EVENT_NAME = "crownforge:audio";
  // v2 deliberately starts enabled instead of inheriting an old preview's muted
  // state. The previous v1 key was shared across preview builds and could make a
  // newly deployed soundtrack appear permanently silent on a real device.
  const STORAGE_KEY = "crownforge.soundtrack.enabled.v2";
  const SCORE_NAME = "The Living Crown";
  const MASTER_GAIN = 0.36;
  const MUSIC_GAIN = 0.92;
  const CUE_GAIN = 1.06;
  const MIN_GAIN = 0.0001;
  const BPM = 54;
  const BEAT_SECONDS = 60 / BPM;
  const CHORD_SECONDS = BEAT_SECONDS * 8;
  const SCHEDULE_AHEAD_SECONDS = 10.5;
  const SCHEDULER_INTERVAL_MS = 1800;

  const PIECES = new Set(["pawn", "knight", "bishop", "rook", "queen", "king"]);
  const PHASE_INTENSITY = Object.freeze({
    opening: 0.2,
    strategy: 0.38,
    tension: 0.64,
    endgame: 0.76,
    terminal: 1,
  });

  // Original Crownforge harmony: Dm(add9) → Bbmaj7 → F(add9) → Csus2,
  // followed by a Gm / Dm-A / A7sus4 / A7(b9) tension arc.
  const SCORE = Object.freeze([
    { pad: [146.83, 174.61, 220.00, 261.63, 329.63], bass: 73.42, motif: [587.33, 659.26, 523.25, 440.00] },
    { pad: [116.54, 146.83, 174.61, 220.00, 261.63], bass: 58.27, motif: [523.25, 440.00, 349.23, 440.00] },
    { pad: [130.81, 164.81, 196.00, 261.63, 392.00], bass: 65.41, motif: [659.26, 587.33, 523.25, 392.00] },
    { pad: [130.81, 164.81, 196.00, 293.66, 392.00], bass: 65.41, motif: [587.33, 523.25, 392.00, 493.88] },
    { pad: [98.00, 116.54, 146.83, 174.61, 220.00], bass: 49.00, motif: [466.16, 523.25, 587.33, 440.00] },
    { pad: [110.00, 146.83, 174.61, 220.00, 329.63], bass: 55.00, motif: [659.26, 587.33, 523.25, 440.00] },
    { pad: [110.00, 146.83, 164.81, 196.00, 293.66], bass: 55.00, motif: [440.00, 493.88, 587.33, 659.26] },
    { pad: [110.00, 138.59, 164.81, 196.00, 233.08], bass: 55.00, motif: [587.33, 466.16, 415.30, 440.00] },
  ]);

  let musicEnabled = readPreference();
  let userActivated = false;
  let audioContext = null;
  let graph = null;
  let schedulerId = 0;
  let scoreRunning = false;
  let nextChordTime = 0;
  let chordIndex = 0;
  let targetIntensity = PHASE_INTENSITY.opening;
  let lastMoveSequence = 0;
  let startPromise = null;
  let operation = 0;
  let readyCuePlayed = false;
  let buttonUnlockGesture = false;
  const activeCueSources = new Set();
  const activeScoreSources = new Set();

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  }

  function savePreference() {
    try {
      window.localStorage.setItem(STORAGE_KEY, musicEnabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private modes; audio remains functional.
    }
  }

  function renderButton(state = musicEnabled ? "waiting" : "off") {
    button.dataset.audioState = state;
    button.dataset.score = "living-crown";
    button.dataset.intensity = targetIntensity.toFixed(2);
    button.setAttribute("aria-pressed", String(musicEnabled));
    if (!musicEnabled) button.textContent = "♫ Music Off";
    else if (state === "playing") button.textContent = "♫ Music On";
    else if (state === "starting") button.textContent = "♫ Starting Sound…";
    else if (state === "paused") button.textContent = "♫ Sound Paused";
    else button.textContent = "♫ Tap for Sound";

    button.title = !musicEnabled
      ? `Turn on ${SCORE_NAME}`
      : state === "playing"
        ? `${SCORE_NAME} — adaptive Crownforge score`
        : `Tap once to unlock ${SCORE_NAME}`;
  }

  if (!AudioContextClass) {
    button.disabled = true;
    button.textContent = "Music Unavailable";
    button.dataset.audioState = "unsupported";
    return;
  }

  function seededNoise(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state / 4294967296) * 2 - 1;
    };
  }

  function createReverb(context) {
    const seconds = 2.8;
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const random = seededNoise(0x4c495649);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const progress = index / data.length;
        const earlyReflection = index % 293 === 0 ? 0.17 * (1 - progress) : 0;
        data[index] = (random() * 0.53 + earlyReflection) * Math.pow(1 - progress, 3.35);
      }
    }

    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function createLimiterCurve() {
    const curve = new Float32Array(2048);
    const drive = 1.72;
    const normalizer = Math.tanh(drive);
    for (let index = 0; index < curve.length; index += 1) {
      const sample = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(sample * drive) / normalizer;
    }
    return curve;
  }

  function createAudioGraph(context) {
    const ambienceInput = context.createGain();
    const strategyInput = context.createGain();
    const tensionInput = context.createGain();
    const ambienceGain = context.createGain();
    const strategyGain = context.createGain();
    const tensionGain = context.createGain();
    const musicSum = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = createReverb(context);
    const musicTone = context.createBiquadFilter();
    const musicOutput = context.createGain();
    const cueInput = context.createGain();
    const cueDry = context.createGain();
    const cueWet = context.createGain();
    const cueReverb = createReverb(context);
    const cueOutput = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createWaveShaper();

    ambienceGain.gain.value = 0.95;
    strategyGain.gain.value = 0.24;
    tensionGain.gain.value = MIN_GAIN;
    dry.gain.value = 0.78;
    wet.gain.value = 0.34;
    cueDry.gain.value = 0.9;
    cueWet.gain.value = 0.22;
    musicTone.type = "lowpass";
    musicTone.frequency.value = 6200;
    musicTone.Q.value = 0.3;
    musicOutput.gain.value = MIN_GAIN;
    cueOutput.gain.value = CUE_GAIN;
    master.gain.value = MASTER_GAIN;
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.018;
    compressor.release.value = 0.42;
    limiter.curve = createLimiterCurve();
    limiter.oversample = "2x";

    ambienceInput.connect(ambienceGain).connect(musicSum);
    strategyInput.connect(strategyGain).connect(musicSum);
    tensionInput.connect(tensionGain).connect(musicSum);
    musicSum.connect(dry).connect(musicTone);
    musicSum.connect(convolver).connect(wet).connect(musicTone);
    musicTone.connect(musicOutput).connect(master);
    cueInput.connect(cueDry).connect(cueOutput);
    cueInput.connect(cueReverb).connect(cueWet).connect(cueOutput);
    cueOutput.connect(master);
    master.connect(compressor).connect(limiter).connect(context.destination);

    const real = new Float32Array(8);
    const imag = new Float32Array([0, 1, 0.38, 0.19, 0.095, 0.046, 0.022, 0.01]);
    const warmWave = context.createPeriodicWave(real, imag, { disableNormalization: false });

    return {
      ambienceInput,
      strategyInput,
      tensionInput,
      ambienceGain,
      strategyGain,
      tensionGain,
      musicOutput,
      cueInput,
      master,
      compressor,
      limiter,
      warmWave,
    };
  }

  function getOrCreateAudioContext() {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass({ latencyHint: "interactive" });
      graph = null;
    }
    return audioContext;
  }

  // Android Chrome requires resume() to happen immediately inside a trusted
  // user gesture. This tiny inaudible pulse primes the device output before the
  // heavier reverb graph is built, so transient activation is never lost.
  function primeDeviceOutput(context) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(220, now);
    gain.gain.setValueAtTime(MIN_GAIN, now);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.025);
  }

  function ramp(param, target, duration, start = audioContext.currentTime) {
    const safeTarget = Math.max(MIN_GAIN, target);
    const current = Math.max(MIN_GAIN, Number.isFinite(param.value) ? param.value : MIN_GAIN);
    param.cancelScheduledValues(start);
    param.setValueAtTime(current, start);
    param.exponentialRampToValueAtTime(safeTarget, start + Math.max(0.01, duration));
  }

  function connectWithPan(context, source, destination, panValue) {
    if (typeof context.createStereoPanner !== "function") {
      source.connect(destination);
      return;
    }
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(panValue, -0.38, 0.38);
    source.connect(panner).connect(destination);
  }

  function trackSource(source, collection) {
    collection.add(source);
    source.onended = () => collection.delete(source);
  }

  function scheduleVoice({
    frequency,
    start,
    duration,
    peak,
    destination,
    type = "sine",
    warm = false,
    attack = 0.02,
    release = 0.36,
    endFrequency = null,
    detune = 0,
    filterFrequency = null,
    pan = 0,
    cue = false,
  }) {
    if (!audioContext || !graph) return null;
    const context = audioContext;
    const safeStart = Math.max(context.currentTime + 0.004, start);
    const safeDuration = Math.max(0.08, duration);
    const stop = safeStart + safeDuration;
    const safeAttack = Math.min(Math.max(0.008, attack), safeDuration * 0.42);
    const safeRelease = Math.min(Math.max(0.04, release), safeDuration * 0.52);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    let sourceOutput = oscillator;

    if (warm) oscillator.setPeriodicWave(graph.warmWave);
    else oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), safeStart);
    oscillator.detune.setValueAtTime(detune, safeStart);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), stop);
    }

    if (filterFrequency) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFrequency, safeStart);
      filter.Q.value = 0.62;
      oscillator.connect(filter);
      sourceOutput = filter;
    }

    envelope.gain.setValueAtTime(MIN_GAIN, safeStart);
    envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak), safeStart + safeAttack);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.72),
      Math.max(safeStart + safeAttack + 0.01, stop - safeRelease),
    );
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, stop);
    sourceOutput.connect(envelope);
    connectWithPan(context, envelope, destination, pan);

    trackSource(oscillator, cue ? activeCueSources : activeScoreSources);
    oscillator.start(safeStart);
    oscillator.stop(stop + 0.05);
    return oscillator;
  }

  function schedulePad(frequency, start, voiceIndex, voiceCount) {
    scheduleVoice({
      frequency,
      start,
      duration: CHORD_SECONDS + 0.45,
      peak: 0.086 / Math.sqrt(voiceCount),
      destination: graph.ambienceInput,
      warm: true,
      attack: 2.2,
      release: 2.15,
      detune: (voiceIndex - (voiceCount - 1) / 2) * 1.7,
      filterFrequency: 1180 + voiceIndex * 120,
      pan: voiceCount === 1 ? 0 : (voiceIndex / (voiceCount - 1) - 0.5) * 0.56,
    });
  }

  function scheduleBass(frequency, start) {
    scheduleVoice({
      frequency,
      start,
      duration: CHORD_SECONDS + 0.35,
      peak: 0.12,
      destination: graph.ambienceInput,
      type: "sine",
      attack: 1.55,
      release: 1.8,
      filterFrequency: 340,
    });
    scheduleVoice({
      frequency: frequency * 2,
      start,
      duration: CHORD_SECONDS + 0.35,
      peak: 0.045,
      destination: graph.ambienceInput,
      type: "triangle",
      attack: 1.8,
      release: 1.9,
      detune: -3,
      filterFrequency: 520,
    });
  }

  function scheduleGlassMotif(frequency, start, pan) {
    scheduleVoice({
      frequency,
      start,
      duration: 3.6,
      peak: 0.052,
      destination: graph.strategyInput,
      type: "sine",
      attack: 0.018,
      release: 2.9,
      pan,
    });
    scheduleVoice({
      frequency: frequency * 2.005,
      start,
      duration: 3.1,
      peak: 0.011,
      destination: graph.strategyInput,
      type: "sine",
      attack: 0.014,
      release: 2.55,
      pan,
    });
  }

  function scheduleWarPulse(frequency, start) {
    scheduleVoice({
      frequency: frequency * 0.5,
      start,
      duration: 1.15,
      peak: 0.074,
      destination: graph.tensionInput,
      type: "sine",
      attack: 0.024,
      release: 0.92,
      endFrequency: Math.max(27, frequency * 0.34),
      filterFrequency: 180,
    });
  }

  function scheduleCelloOstinato(frequency, start, index) {
    scheduleVoice({
      frequency: frequency * (index % 4 === 3 ? 2 : 1.5),
      start,
      duration: 0.72,
      peak: index % 2 === 0 ? 0.056 : 0.042,
      destination: graph.tensionInput,
      warm: true,
      attack: 0.026,
      release: 0.54,
      endFrequency: frequency * (index % 4 === 3 ? 1.72 : 1.34),
      filterFrequency: 760,
      pan: index % 2 === 0 ? -0.14 : 0.14,
    });
  }

  function scheduleChord(chord, start) {
    chord.pad.forEach((frequency, index) => schedulePad(frequency, start, index, chord.pad.length));
    scheduleBass(chord.bass, start);

    const motifBeats = [1.05, 3.05, 5.05, 7.05];
    chord.motif.forEach((frequency, index) => {
      scheduleGlassMotif(
        frequency,
        start + motifBeats[index] * BEAT_SECONDS,
        index % 2 === 0 ? -0.2 : 0.2,
      );
    });

    for (let beat = 0; beat < 8; beat += 1) {
      if (beat % 2 === 0) scheduleWarPulse(chord.bass, start + beat * BEAT_SECONDS + 0.04);
      scheduleCelloOstinato(chord.bass, start + beat * BEAT_SECONDS + 0.18, beat);
    }
  }

  function fillSchedule() {
    if (!scoreRunning || !audioContext || audioContext.state !== "running" || !graph) return;
    if (nextChordTime < audioContext.currentTime + 0.05) {
      nextChordTime = audioContext.currentTime + 0.08;
    }
    while (nextChordTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
      scheduleChord(SCORE[chordIndex], nextChordTime);
      chordIndex = (chordIndex + 1) % SCORE.length;
      nextChordTime += CHORD_SECONDS;
    }
  }

  function applyIntensity(value, transition = 2.6) {
    targetIntensity = clamp(value);
    renderButton(
      !musicEnabled ? "off" : audioContext?.state === "running" && scoreRunning ? "playing" : "waiting",
    );
    if (!audioContext || !graph) return;

    const ambience = 1 - targetIntensity * 0.22;
    const strategy = 0.14 + targetIntensity * 0.86;
    const tension = clamp((targetIntensity - 0.34) / 0.66) * 1.04;
    ramp(graph.ambienceGain.gain, ambience, transition);
    ramp(graph.strategyGain.gain, strategy, transition);
    ramp(graph.tensionGain.gain, tension, transition);
  }

  function startScore() {
    if (!musicEnabled || !audioContext || audioContext.state !== "running" || !graph) return;
    if (!scoreRunning) {
      scoreRunning = true;
      nextChordTime = audioContext.currentTime + 0.08;
      window.clearInterval(schedulerId);
      fillSchedule();
      schedulerId = window.setInterval(fillSchedule, SCHEDULER_INTERVAL_MS);
    }
    ramp(graph.musicOutput.gain, MUSIC_GAIN, 1.65);
    applyIntensity(targetIntensity, 1.8);
    renderButton("playing");
  }

  function stopScore() {
    scoreRunning = false;
    window.clearInterval(schedulerId);
    schedulerId = 0;
    stopSources(activeScoreSources);
    if (audioContext && graph) ramp(graph.musicOutput.gain, MIN_GAIN, 0.42);
    renderButton("off");
  }

  function duckMusic(depth, hold, release, returnLevel = MUSIC_GAIN) {
    if (!musicEnabled || !scoreRunning || !audioContext || !graph) return;
    const now = audioContext.currentTime;
    const param = graph.musicOutput.gain;
    const current = Math.max(MIN_GAIN, Number.isFinite(param.value) ? param.value : MUSIC_GAIN);
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, MUSIC_GAIN * depth), now + 0.075);
    param.setValueAtTime(Math.max(MIN_GAIN, MUSIC_GAIN * depth), now + hold);
    param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, returnLevel), now + hold + release);
  }

  async function ensureAudio() {
    if (!userActivated || document.visibilityState === "hidden") return;
    if (audioContext?.state === "running" && graph) {
      if (musicEnabled) startScore();
      return true;
    }
    if (startPromise) return startPromise;

    const operationId = ++operation;
    const pendingStart = (async () => {
      try {
        const candidateContext = getOrCreateAudioContext();
        renderButton(musicEnabled ? "starting" : "off");
        if (candidateContext.state !== "running") await candidateContext.resume();
        if (operationId !== operation) {
          return false;
        }
        if (candidateContext.state !== "running") {
          renderButton(musicEnabled ? "blocked" : "off");
          return false;
        }

        // Build the expensive convolution graph only after Android has accepted
        // the user-gesture resume request.
        if (!graph) graph = createAudioGraph(candidateContext);
        applyIntensity(targetIntensity, 0.08);
        if (document.visibilityState === "hidden") {
          await audioContext.suspend();
          renderButton(musicEnabled ? "paused" : "off");
          return false;
        }
        if (musicEnabled) {
          if (!readyCuePlayed) {
            playAudioReadyCue(audioContext.currentTime + 0.018);
            readyCuePlayed = true;
          }
          startScore();
        }
        else renderButton("off");
        return true;
      } catch {
        if (operationId !== operation) return;
        graph = null;
        scoreRunning = false;
        window.clearInterval(schedulerId);
        schedulerId = 0;
        // A blocked resume is recoverable. Keep the button and future gesture
        // listeners alive so the user can retry instead of getting permanent
        // silence after one Android autoplay rejection.
        renderButton(musicEnabled ? "blocked" : "off");
        return false;
      }
    })();

    startPromise = pendingStart;
    try {
      return await pendingStart;
    } finally {
      if (startPromise === pendingStart) startPromise = null;
    }
  }

  function panForSquare(square) {
    if (typeof square !== "string" || !/^[a-h][1-8]$/.test(square)) return 0;
    return ((square.charCodeAt(0) - 97) / 7 - 0.5) * 0.58;
  }

  function sideRatio(side) {
    return side === "white" ? 1.045 : side === "black" ? 0.955 : 1;
  }

  function cueTone(frequency, start, duration, peak, options = {}) {
    return scheduleVoice({
      frequency,
      start,
      duration,
      peak,
      destination: graph.cueInput,
      cue: true,
      ...options,
    });
  }

  function cueChord(frequencies, start, duration, peak, options = {}) {
    frequencies.forEach((frequency, index) => {
      cueTone(frequency, start + index * 0.025, duration, peak / Math.sqrt(frequencies.length), {
        pan: (options.pan ?? 0) + (index - (frequencies.length - 1) / 2) * 0.045,
        warm: true,
        attack: 0.08,
        release: Math.min(duration * 0.68, 1.8),
        filterFrequency: 2200,
        ...options,
      });
    });
  }

  function playAudioReadyCue(start) {
    cueTone(659.26, start, 0.56, 0.105, {
      type: "sine",
      attack: 0.018,
      release: 0.43,
      filterFrequency: 4200,
      pan: -0.08,
    });
    cueTone(880, start + 0.095, 0.78, 0.09, {
      type: "sine",
      attack: 0.02,
      release: 0.64,
      filterFrequency: 4600,
      pan: 0.08,
    });
  }

  function playPawnCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    cueTone(146.83 * ratio, start, 0.4, 0.16, {
      warm: true,
      attack: 0.018,
      release: 0.32,
      endFrequency: 118 * ratio,
      filterFrequency: 680,
      pan,
    });
    cueTone(220 * ratio, start + 0.055, 0.24, 0.07, {
      type: "triangle",
      attack: 0.014,
      release: 0.18,
      filterFrequency: 920,
      pan,
    });
  }

  function playKnightCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    [293.66, 440, 349.23].forEach((frequency, index) => {
      cueTone(frequency * ratio, start + index * 0.105, 0.3, 0.115, {
        type: "triangle",
        attack: 0.012,
        release: 0.24,
        endFrequency: frequency * ratio * 0.92,
        filterFrequency: 1450,
        pan: pan + (index - 1) * 0.04,
      });
    });
  }

  function playBishopCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    cueChord([523.25, 659.26, 783.99].map((frequency) => frequency * ratio), start, 0.92, 0.17, {
      type: "sine",
      warm: false,
      attack: 0.035,
      release: 0.78,
      filterFrequency: 4200,
      pan,
    });
  }

  function playRookCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    cueTone(73.42 * ratio, start, 0.82, 0.19, {
      warm: true,
      attack: 0.024,
      release: 0.68,
      endFrequency: 61.74 * ratio,
      filterFrequency: 760,
      pan,
    });
    cueTone(146.83 * ratio, start + 0.035, 0.68, 0.105, {
      type: "triangle",
      attack: 0.02,
      release: 0.54,
      filterFrequency: 1050,
      pan,
    });
  }

  function playQueenCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    cueChord([440, 659.26, 880].map((frequency) => frequency * ratio), start, 1.12, 0.2, {
      type: "sine",
      warm: false,
      attack: 0.045,
      release: 0.94,
      filterFrequency: 5200,
      pan,
    });
    cueTone(1318.51 * ratio, start + 0.12, 1.25, 0.045, {
      type: "sine",
      attack: 0.012,
      release: 1.05,
      pan,
    });
  }

  function playKingCue(detail, start) {
    const ratio = sideRatio(detail.side);
    const pan = panForSquare(detail.to);
    cueChord([196, 293.66, 392].map((frequency) => frequency * ratio), start, 1.08, 0.22, {
      warm: true,
      attack: 0.075,
      release: 0.88,
      filterFrequency: 2400,
      pan,
    });
  }

  const pieceCuePlayers = Object.freeze({
    pawn: playPawnCue,
    knight: playKnightCue,
    bishop: playBishopCue,
    rook: playRookCue,
    queen: playQueenCue,
    king: playKingCue,
  });

  function playCaptureCue(detail, start) {
    const pan = panForSquare(detail.to);
    cueTone(96, start, 0.72, 0.2, {
      type: "sine",
      attack: 0.014,
      release: 0.58,
      endFrequency: 48,
      filterFrequency: 320,
      pan,
    });
    cueTone(860, start + 0.018, 0.34, 0.092, {
      type: "triangle",
      attack: 0.009,
      release: 0.27,
      endFrequency: 390,
      filterFrequency: 2600,
      pan,
    });
    duckMusic(0.52, 0.32, 1.05);
  }

  function playEnPassantCue(detail, start) {
    const pan = panForSquare(detail.to);
    cueTone(740, start, 0.78, 0.11, {
      type: "sine",
      attack: 0.03,
      release: 0.62,
      endFrequency: 370,
      pan,
    });
    cueTone(277.18, start + 0.08, 0.62, 0.075, {
      warm: true,
      attack: 0.045,
      release: 0.48,
      pan: -pan,
    });
  }

  function playCastleCue(detail, start) {
    playKingCue(detail, start);
    playRookCue(detail, start + 0.18);
    cueTone(110, start + 0.06, 1.05, 0.13, {
      warm: true,
      attack: 0.08,
      release: 0.82,
      filterFrequency: 820,
      pan: detail.castle === "king-side" ? 0.22 : -0.22,
    });
    duckMusic(0.66, 0.42, 1.2);
  }

  function playPromotionCue(detail, start) {
    cueTone(164.81, start, 1.45, 0.13, {
      warm: true,
      attack: 0.055,
      release: 0.72,
      endFrequency: 659.26,
      filterFrequency: 3200,
      pan: panForSquare(detail.to),
    });
    cueChord([329.63, 493.88, 659.26], start + 0.72, 1.2, 0.18, {
      attack: 0.06,
      release: 0.92,
      filterFrequency: 4300,
      pan: panForSquare(detail.to),
    });
    const promotedPlayer = PIECES.has(detail.promotion) ? pieceCuePlayers[detail.promotion] : null;
    if (promotedPlayer) promotedPlayer({ ...detail, piece: detail.promotion }, start + 0.88);
    duckMusic(0.44, 1.05, 1.4);
  }

  function playCheckCue(start) {
    cueChord([392, 415.3], start, 0.82, 0.2, {
      type: "sine",
      warm: false,
      attack: 0.022,
      release: 0.68,
      filterFrequency: 3600,
    });
    cueTone(587.33, start + 0.16, 0.9, 0.11, {
      type: "sine",
      attack: 0.03,
      release: 0.72,
      endFrequency: 554.37,
    });
    duckMusic(0.38, 0.72, 1.3);
  }

  function playIllegalCue(start) {
    cueTone(92.5, start, 0.24, 0.105, {
      type: "triangle",
      attack: 0.01,
      release: 0.19,
      endFrequency: 68,
      filterFrequency: 480,
    });
  }

  function playHistoryCue(detail, start) {
    const forward = detail.direction === "forward";
    const notes = forward ? [329.63, 493.88, 659.26] : [659.26, 493.88, 329.63];

    notes.forEach((frequency, index) => {
      cueTone(frequency, start + index * 0.07, 0.46 + index * 0.06, 0.086, {
        type: "sine",
        attack: 0.012,
        release: 0.35 + index * 0.05,
        filterFrequency: 3900,
        pan: forward ? -0.14 + index * 0.14 : 0.14 - index * 0.14,
      });
    });
    cueTone(forward ? 123.47 : 146.83, start, 0.5, 0.074, {
      warm: true,
      attack: 0.02,
      release: 0.39,
      endFrequency: forward ? 164.81 : 98,
      filterFrequency: 820,
    });
    duckMusic(0.76, 0.2, 0.62);
  }

  function playCheckmateCue(detail, start) {
    const winnerRatio = detail.winner === "white" ? 1.045 : 0.955;
    applyIntensity(1, 0.32);
    duckMusic(0.12, 4.35, 1.55, MUSIC_GAIN * 0.56);

    cueTone(58.27, start, 1.4, 0.24, {
      type: "sine",
      attack: 0.012,
      release: 1.12,
      endFrequency: 31,
      filterFrequency: 260,
    });
    cueTone(1180, start + 0.018, 0.58, 0.12, {
      type: "triangle",
      attack: 0.008,
      release: 0.48,
      endFrequency: 410,
      filterFrequency: 3200,
    });

    // Losing-king focus: an unresolved minor-second under the slow-motion beat.
    cueChord([138.59, 146.83], start + 0.26, 1.45, 0.19, {
      type: "sine",
      warm: false,
      attack: 0.12,
      release: 1.05,
      filterFrequency: 1250,
    });

    // Winning side reveal: royal horn/choir voicing, then a Picardy-third crown resolution.
    cueChord([146.83, 174.61, 220].map((note) => note * winnerRatio), start + 1.16, 2.35, 0.29, {
      warm: true,
      attack: 0.32,
      release: 1.48,
      filterFrequency: 2600,
      pan: detail.winner === "white" ? 0.1 : -0.1,
    });
    cueChord([146.83, 185, 220, 293.66].map((note) => note * winnerRatio), start + 2.74, 3.05, 0.34, {
      warm: true,
      attack: 0.28,
      release: 2.15,
      filterFrequency: 3200,
    });
    [587.33, 739.99, 880].forEach((frequency, index) => {
      cueTone(frequency * winnerRatio, start + 2.82 + index * 0.115, 2.25, 0.075, {
        type: "sine",
        attack: 0.012,
        release: 1.92,
        pan: (index - 1) * 0.2,
      });
    });
  }

  function playDrawCue(start) {
    applyIntensity(0.28, 0.5);
    duckMusic(0.34, 1.4, 1.5, MUSIC_GAIN * 0.62);
    cueChord([146.83, 174.61, 220, 329.63], start + 0.08, 2.7, 0.25, {
      warm: true,
      attack: 0.24,
      release: 1.95,
      filterFrequency: 2600,
    });
    cueTone(440, start + 0.36, 1.8, 0.06, {
      type: "sine",
      attack: 0.08,
      release: 1.48,
    });
  }

  function stopSources(collection) {
    if (!audioContext) return;
    for (const source of collection) {
      try {
        source.stop(audioContext.currentTime + 0.01);
      } catch {
        // A source that has already ended is harmless.
      }
    }
    collection.clear();
  }

  function stopActiveCues() {
    stopSources(activeCueSources);
  }

  function playMove(detail) {
    if (!audioContext || !graph) return;
    const start = audioContext.currentTime + 0.018;
    const player = PIECES.has(detail.piece) ? pieceCuePlayers[detail.piece] : null;

    if (detail.castle) playCastleCue(detail, start);
    else if (player) player(detail, start);

    if (detail.capture) playCaptureCue(detail, start + 0.035);
    if (detail.enPassant) playEnPassantCue(detail, start + 0.08);
    if (detail.promotion) playPromotionCue(detail, start + 0.14);

    if (detail.terminal) {
      if (detail.outcome === "checkmate") playCheckmateCue(detail, start + 0.08);
      else playDrawCue(start + 0.08);
    } else if (detail.check) {
      playCheckCue(start + 0.16);
    }
  }

  function playTerminal(detail) {
    if (!audioContext || !graph) return;
    const start = audioContext.currentTime + 0.02;
    if (detail.outcome === "checkmate") playCheckmateCue(detail, start);
    else playDrawCue(start);
  }

  function handleAudioEvent(event) {
    const detail = event?.detail;
    if (!detail || detail.version !== 1 || typeof detail.kind !== "string") return;

    const phaseLevel = PHASE_INTENSITY[detail.phase];
    const requestedIntensity = Number.isFinite(detail.intensity) ? detail.intensity : phaseLevel;
    if (Number.isFinite(requestedIntensity)) targetIntensity = clamp(requestedIntensity);

    if (detail.kind === "ready") {
      renderButton();
      return;
    }

    if (!userActivated && window.navigator?.userActivation?.isActive) userActivated = true;
    if (!userActivated) return;
    void ensureAudio().then(() => {
      if (!audioContext || !graph) return;
      applyIntensity(targetIntensity);

      if (detail.kind === "restart") {
        stopActiveCues();
        lastMoveSequence = 0;
        applyIntensity(PHASE_INTENSITY.opening, 1.25);
        if (musicEnabled) ramp(graph.musicOutput.gain, MUSIC_GAIN, 1.1);
        return;
      }

      if (detail.kind === "illegal") {
        playIllegalCue(audioContext.currentTime + 0.012);
        return;
      }

      if (detail.kind === "history") {
        stopActiveCues();
        if (Number.isInteger(detail.sequence) && detail.sequence >= 0) {
          lastMoveSequence = detail.sequence;
        }
        playHistoryCue(detail, audioContext.currentTime + 0.012);
        return;
      }

      if (detail.kind === "move") {
        if (!Number.isInteger(detail.sequence) || detail.sequence <= lastMoveSequence) return;
        lastMoveSequence = detail.sequence;
        playMove(detail);
        return;
      }

      if (detail.kind === "terminal") playTerminal(detail);
    });
  }

  function unlock(event) {
    const target = event?.target;
    if (
      musicEnabled &&
      button.dataset.audioState !== "playing" &&
      (target === button || (typeof button.contains === "function" && button.contains(target)))
    ) {
      // The click that follows this pointer/key gesture belongs to the unlock
      // action. It must not immediately toggle the freshly started score off.
      buttonUnlockGesture = true;
    }

    if (audioContext?.state === "running" && graph) return;
    userActivated = true;
    if (document.visibilityState === "hidden") return;

    try {
      const context = getOrCreateAudioContext();
      renderButton(musicEnabled ? "starting" : "off");
      primeDeviceOutput(context);
      // Calling resume synchronously here is the critical Android unlock. The
      // promise continuation may safely finish graph setup afterward.
      const resumePromise = context.state === "running" ? Promise.resolve() : context.resume();
      void resumePromise
        .then(() => ensureAudio())
        .catch(() => renderButton(musicEnabled ? "blocked" : "off"));
    } catch {
      renderButton(musicEnabled ? "blocked" : "off");
    }
  }

  function closeAudio() {
    operation += 1;
    startPromise = null;
    scoreRunning = false;
    window.clearInterval(schedulerId);
    schedulerId = 0;
    stopActiveCues();
    stopSources(activeScoreSources);
    const closingContext = audioContext;
    audioContext = null;
    graph = null;
    readyCuePlayed = false;
    if (closingContext && closingContext.state !== "closed") {
      closingContext.close().catch(() => {});
    }
  }

  button.addEventListener("click", () => {
    userActivated = true;

    // While audio is still locked, this control is an explicit retry action,
    // not an accidental request to mute the soundtrack.
    if (
      musicEnabled &&
      (buttonUnlockGesture || !audioContext || audioContext.state !== "running" || !graph)
    ) {
      buttonUnlockGesture = false;
      unlock();
      void ensureAudio();
      return;
    }

    buttonUnlockGesture = false;

    musicEnabled = !musicEnabled;
    savePreference();
    if (!musicEnabled) {
      stopScore();
      return;
    }
    renderButton("starting");
    unlock();
    void ensureAudio().then((started) => {
      if (started) startScore();
    });
  });

  // Do not make these one-shot: if Android rejects the first resume attempt,
  // every later trusted gesture remains a safe recovery opportunity.
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("touchend", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener(AUDIO_EVENT_NAME, handleAudioEvent);

  document.addEventListener("visibilitychange", () => {
    if (!audioContext) return;
    if (document.visibilityState === "hidden") {
      window.clearInterval(schedulerId);
      schedulerId = 0;
      scoreRunning = false;
      stopSources(activeScoreSources);
      audioContext.suspend().catch(() => {});
      renderButton(musicEnabled ? "paused" : "off");
    } else if (userActivated) {
      void ensureAudio();
    }
  });

  window.addEventListener("pagehide", closeAudio, { once: true });
  renderButton();
})();
