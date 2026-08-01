(() => {
  "use strict";

  const button = document.querySelector("#soundtrack-toggle");
  if (!(button instanceof HTMLButtonElement)) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const STORAGE_KEY = "crownforge.soundtrack.enabled.v1";
  const MASTER_GAIN = 0.11;
  const CHORD_SECONDS = 10;
  const SCHEDULE_AHEAD_SECONDS = 12;
  const SCHEDULER_INTERVAL_MS = 2000;

  // "The Crown at Dusk" is an original, deterministic Crownforge score.
  // It is synthesized locally so the installed PWA remains offline, compact,
  // copyright-safe and free from network/streaming dependencies.
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

  let enabled = readPreference();
  let userActivated = false;
  let audioContext = null;
  let graph = null;
  let schedulerId = 0;
  let nextChordTime = 0;
  let chordIndex = 0;
  let startPromise = null;
  let operation = 0;

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  }

  function savePreference() {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private modes; audio still works in-session.
    }
  }

  function renderButton(state = enabled ? "waiting" : "off") {
    button.dataset.audioState = state;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "♫ Music On" : "♫ Music Off";
    button.title = enabled
      ? "The Crown at Dusk — original Crownforge soundtrack"
      : "Turn on The Crown at Dusk soundtrack";
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
    const seconds = 2.6;
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const random = seededNoise(0x43524f57);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const progress = index / data.length;
        const earlyReflection = index % 317 === 0 ? 0.16 * (1 - progress) : 0;
        data[index] = (random() * 0.56 + earlyReflection) * Math.pow(1 - progress, 3.25);
      }
    }

    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function createAudioGraph(context) {
    const input = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = createReverb(context);
    const tone = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const master = context.createGain();

    dry.gain.value = 0.78;
    wet.gain.value = 0.34;
    tone.type = "lowpass";
    tone.frequency.value = 5800;
    tone.Q.value = 0.32;
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.48;
    master.gain.value = 0.0001;

    input.connect(dry).connect(tone);
    input.connect(convolver).connect(wet).connect(tone);
    tone.connect(master).connect(compressor).connect(context.destination);

    const real = new Float32Array(7);
    const imag = new Float32Array([0, 1, 0.34, 0.17, 0.08, 0.04, 0.018]);
    const warmWave = context.createPeriodicWave(real, imag, { disableNormalization: false });

    return { input, master, warmWave };
  }

  function connectWithPan(source, destination, panValue) {
    if (typeof audioContext.createStereoPanner !== "function") {
      source.connect(destination);
      return;
    }
    const panner = audioContext.createStereoPanner();
    panner.pan.value = Math.max(-0.32, Math.min(0.32, panValue));
    source.connect(panner).connect(destination);
  }

  function schedulePad(frequency, start, duration, voiceIndex, voiceCount) {
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const stop = start + duration;
    const peak = 0.082 / Math.sqrt(voiceCount);

    oscillator.setPeriodicWave(graph.warmWave);
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime((voiceIndex - (voiceCount - 1) / 2) * 1.8, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(820 + voiceIndex * 90, start);
    filter.frequency.linearRampToValueAtTime(1680 + voiceIndex * 110, start + duration * 0.52);
    filter.frequency.linearRampToValueAtTime(940 + voiceIndex * 75, stop);
    filter.Q.value = 0.72;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 2.4);
    envelope.gain.exponentialRampToValueAtTime(peak * 0.7, stop - 2.2);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(filter).connect(envelope);
    connectWithPan(envelope, graph.input, voiceCount === 1 ? 0 : (voiceIndex / (voiceCount - 1) - 0.5) * 0.52);
    oscillator.start(start);
    oscillator.stop(stop + 0.05);
  }

  function scheduleBass(frequency, start, duration) {
    const oscillator = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const stop = start + duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    overtone.type = "triangle";
    overtone.frequency.setValueAtTime(frequency * 2, start);
    overtone.detune.value = -3;
    filter.type = "lowpass";
    filter.frequency.value = 360;
    filter.Q.value = 0.55;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.11, start + 1.8);
    envelope.gain.exponentialRampToValueAtTime(0.072, stop - 1.9);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(envelope).connect(graph.input);
    oscillator.start(start);
    overtone.start(start);
    oscillator.stop(stop + 0.05);
    overtone.stop(stop + 0.05);
  }

  function scheduleBell(frequency, start, panValue) {
    const fundamental = audioContext.createOscillator();
    const harmonic = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const stop = start + 3.8;

    fundamental.type = "sine";
    fundamental.frequency.setValueAtTime(frequency, start);
    harmonic.type = "sine";
    harmonic.frequency.setValueAtTime(frequency * 2.005, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.052, start + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.016, start + 0.48);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    const harmonicGain = audioContext.createGain();
    harmonicGain.gain.value = 0.18;
    fundamental.connect(envelope);
    harmonic.connect(harmonicGain).connect(envelope);
    connectWithPan(envelope, graph.input, panValue);
    fundamental.start(start);
    harmonic.start(start);
    fundamental.stop(stop + 0.05);
    harmonic.stop(stop + 0.05);
  }

  function schedulePulse(frequency, start) {
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const stop = start + 1.25;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * 0.5, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, frequency * 0.36), stop);
    filter.type = "lowpass";
    filter.frequency.value = 190;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.052, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(filter).connect(envelope).connect(graph.input);
    oscillator.start(start);
    oscillator.stop(stop + 0.05);
  }

  function scheduleChord(chord, start) {
    const duration = CHORD_SECONDS + 0.35;
    chord.pad.forEach((frequency, index) => {
      schedulePad(frequency, start, duration, index, chord.pad.length);
    });
    scheduleBass(chord.bass, start, duration);
    schedulePulse(chord.bass, start + 0.05);
    schedulePulse(chord.bass, start + CHORD_SECONDS * 0.5);

    const motifOffsets = [1.2, 3.7, 6.2, 8.7];
    chord.motif.forEach((frequency, index) => {
      scheduleBell(frequency, start + motifOffsets[index], index % 2 === 0 ? -0.2 : 0.2);
    });
  }

  function fillSchedule() {
    if (!audioContext || audioContext.state !== "running" || !graph) return;
    if (nextChordTime < audioContext.currentTime + 0.05) {
      nextChordTime = audioContext.currentTime + 0.08;
    }
    while (nextChordTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
      scheduleChord(SCORE[chordIndex], nextChordTime);
      chordIndex = (chordIndex + 1) % SCORE.length;
      nextChordTime += CHORD_SECONDS;
    }
  }

  function startScheduler() {
    window.clearInterval(schedulerId);
    fillSchedule();
    schedulerId = window.setInterval(fillSchedule, SCHEDULER_INTERVAL_MS);
  }

  async function startSoundtrack() {
    if (!enabled || !userActivated || document.visibilityState === "hidden") return;
    if (audioContext?.state === "running") {
      renderButton("playing");
      return;
    }
    if (startPromise) return startPromise;

    const operationId = ++operation;
    const pendingStart = (async () => {
      let candidateContext = audioContext;
      let candidateGraph = graph;
      try {
        if (candidateContext?.state === "suspended") {
          await candidateContext.resume();
          if (operationId !== operation || !enabled) return;
          if (document.visibilityState === "hidden") {
            await candidateContext.suspend();
            renderButton("paused");
            return;
          }
          startScheduler();
          renderButton("playing");
          return;
        }

        candidateContext = new AudioContextClass({ latencyHint: "playback" });
        candidateGraph = createAudioGraph(candidateContext);
        await candidateContext.resume();
        if (operationId !== operation || !enabled) {
          await candidateContext.close();
          return;
        }

        audioContext = candidateContext;
        graph = candidateGraph;
        nextChordTime = candidateContext.currentTime + 0.08;
        chordIndex = 0;
        if (document.visibilityState === "hidden") {
          await candidateContext.suspend();
          renderButton("paused");
          return;
        }
        startScheduler();
        const now = candidateContext.currentTime;
        candidateGraph.master.gain.cancelScheduledValues(now);
        candidateGraph.master.gain.setValueAtTime(0.0001, now);
        candidateGraph.master.gain.exponentialRampToValueAtTime(MASTER_GAIN, now + 2.8);
        renderButton("playing");
      } catch {
        if (operationId !== operation) {
          candidateContext?.close().catch(() => {});
          return;
        }
        audioContext = null;
        graph = null;
        window.clearInterval(schedulerId);
        schedulerId = 0;
        button.disabled = true;
        button.textContent = "Music Unavailable";
        button.dataset.audioState = "unavailable";
      }
    })();

    startPromise = pendingStart;
    try {
      return await pendingStart;
    } finally {
      if (startPromise === pendingStart) startPromise = null;
    }
  }

  function stopSoundtrack() {
    operation += 1;
    startPromise = null;
    window.clearInterval(schedulerId);
    schedulerId = 0;
    const closingContext = audioContext;
    const closingGraph = graph;
    audioContext = null;
    graph = null;
    nextChordTime = 0;
    chordIndex = 0;

    if (!closingContext || closingContext.state === "closed") return;
    const now = closingContext.currentTime;
    if (closingGraph) {
      closingGraph.master.gain.cancelScheduledValues(now);
      closingGraph.master.gain.setValueAtTime(Math.max(0.0001, closingGraph.master.gain.value), now);
      closingGraph.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    }
    window.setTimeout(() => closingContext.close().catch(() => {}), 500);
  }

  function unlock(event) {
    userActivated = true;
    if (event.target !== button) void startSoundtrack();
  }

  button.addEventListener("click", () => {
    userActivated = true;
    enabled = !enabled;
    savePreference();
    renderButton(enabled ? "starting" : "off");
    if (enabled) void startSoundtrack();
    else stopSoundtrack();
  });

  window.addEventListener("pointerdown", unlock, { once: true, capture: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });

  document.addEventListener("visibilitychange", () => {
    if (!audioContext) return;
    if (document.visibilityState === "hidden") {
      window.clearInterval(schedulerId);
      schedulerId = 0;
      audioContext.suspend().catch(() => {});
      renderButton(enabled ? "paused" : "off");
    } else if (enabled && userActivated) {
      void startSoundtrack();
    }
  });

  window.addEventListener("pagehide", stopSoundtrack, { once: true });

  renderButton();
})();
