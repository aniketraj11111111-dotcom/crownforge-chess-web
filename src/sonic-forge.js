(() => {
  "use strict";

  const button = document.querySelector("#sound-toggle");
  if (!(button instanceof HTMLButtonElement)) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const AUDIO_EVENT_NAME = "crownforge:audio";
  const STORAGE_KEY = "crownforge.sound.enabled.v3";
  const BANK_WAV = "./public/audio/crownforge-sonic-forge-v33.wav";
  const BANK_META = "./public/audio/crownforge-sonic-forge-v33.json";
  const MASTER_GAIN = 0.72;
  const MIN_GAIN = 0.0001;
  const MAX_ACTIVE_VOICES = 20;
  const PIECES = new Set(["pawn", "knight", "bishop", "rook", "queen", "king"]);
  const HEAVY_PIECES = new Set(["rook", "queen"]);

  const PIECE_VARIANTS = Object.freeze({
    pawn: 4,
    knight: 4,
    bishop: 4,
    rook: 4,
    queen: 4,
    king: 4,
  });
  const SITUATION_VARIANTS = Object.freeze({
    "travel-short": 2,
    "travel-long": 2,
    "capture-light": 3,
    "capture-heavy": 3,
    "en-passant": 2,
    "castle-bridge": 2,
    promotion: 3,
    check: 3,
    checkmate: 2,
    draw: 2,
    illegal: 3,
    "history-back": 2,
    "history-forward": 2,
    restart: 2,
    ready: 1,
  });
  const PIECE_GAIN = Object.freeze({
    pawn: 0.88,
    knight: 0.92,
    bishop: 0.9,
    rook: 1,
    queen: 0.96,
    king: 1,
  });

  let soundEnabled = readPreference();
  let userActivated = false;
  let audioContext = null;
  let graph = null;
  let bankBuffer = null;
  let bankMetadata = null;
  let bankFetchPromise = null;
  let bankDecodePromise = null;
  let startPromise = null;
  let operation = 0;
  let lastMoveSequence = 0;
  let buttonUnlockGesture = false;
  let voiceSerial = 0;
  const activeVoices = [];
  const lastVariants = new Map();

  window.CROWNFORGE_SONIC_FORGE_DIAGNOSTICS = Object.freeze({
    version: 33,
    identity: "crownforge-sonic-forge",
    music: false,
    masterGain: MASTER_GAIN,
    sampleRate: 48000,
    engineAuthoritative: true,
    maxActiveVoices: MAX_ACTIVE_VOICES,
  });
  window.CROWNFORGE_SFX_READY = false;

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
      window.localStorage.setItem(STORAGE_KEY, soundEnabled ? "on" : "off");
    } catch {
      // Private browsing may reject storage; the live audio state still works.
    }
  }

  function renderButton(state = soundEnabled ? "waiting" : "off") {
    button.dataset.audioState = state;
    button.dataset.system = "sonic-forge-v33";
    button.dataset.music = "false";
    button.setAttribute("aria-pressed", String(soundEnabled));

    if (!soundEnabled) button.textContent = "🔇 Sound Off";
    else if (state === "ready") button.textContent = "🔊 Sound On";
    else if (state === "loading") button.textContent = "Loading Sound…";
    else if (state === "paused") button.textContent = "🔊 Sound Paused";
    else if (state === "error") button.textContent = "Tap to Retry Sound";
    else button.textContent = "Tap for Sound";

    button.title = !soundEnabled
      ? "Enable Crownforge piece and situation sounds"
      : state === "ready"
        ? "Crownforge Sonic Forge — piece and situation sounds enabled"
        : "Tap once to unlock Crownforge sound";
  }

  if (!AudioContextClass) {
    button.disabled = true;
    button.textContent = "Sound Unavailable";
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

  function createRoomImpulse(context) {
    const seconds = 0.64;
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const random = seededNoise(0x53465833);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const progress = index / data.length;
        const early = index % (channel ? 347 : 293) === 0 ? 0.12 * (1 - progress) : 0;
        data[index] = (random() * 0.36 + early) * Math.pow(1 - progress, 5.2);
      }
    }

    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function createLimiterCurve() {
    const curve = new Float32Array(4096);
    const drive = 1.42;
    const normalizer = Math.tanh(drive);
    for (let index = 0; index < curve.length; index += 1) {
      const sample = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(sample * drive) / normalizer;
    }
    return curve;
  }

  function createAudioGraph(context) {
    const pieceInput = context.createGain();
    const situationInput = context.createGain();
    const uiInput = context.createGain();
    const piecePresence = context.createBiquadFilter();
    const situationPresence = context.createBiquadFilter();
    const dry = context.createGain();
    const wet = context.createGain();
    const room = createRoomImpulse(context);
    const roomTone = context.createBiquadFilter();
    const sum = context.createGain();
    const speakerProtection = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createWaveShaper();
    const master = context.createGain();

    pieceInput.gain.value = 0.94;
    situationInput.gain.value = 1;
    uiInput.gain.value = 0.8;
    piecePresence.type = "peaking";
    piecePresence.frequency.value = 1850;
    piecePresence.Q.value = 0.72;
    piecePresence.gain.value = 2.2;
    situationPresence.type = "peaking";
    situationPresence.frequency.value = 1560;
    situationPresence.Q.value = 0.64;
    situationPresence.gain.value = 1.7;
    dry.gain.value = 0.94;
    wet.gain.value = 0.115;
    roomTone.type = "lowpass";
    roomTone.frequency.value = 5100;
    roomTone.Q.value = 0.35;
    speakerProtection.type = "highpass";
    speakerProtection.frequency.value = 82;
    speakerProtection.Q.value = 0.56;
    compressor.threshold.value = -13;
    compressor.knee.value = 8;
    compressor.ratio.value = 3.4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    limiter.curve = createLimiterCurve();
    limiter.oversample = "4x";
    master.gain.value = MASTER_GAIN;

    pieceInput.connect(piecePresence).connect(dry);
    situationInput.connect(situationPresence).connect(dry);
    uiInput.connect(dry);
    piecePresence.connect(room);
    situationPresence.connect(room);
    room.connect(roomTone).connect(wet);
    dry.connect(sum);
    wet.connect(sum);
    sum.connect(speakerProtection).connect(compressor).connect(limiter).connect(master).connect(context.destination);

    return {
      pieceInput,
      situationInput,
      uiInput,
      compressor,
      limiter,
      master,
    };
  }

  function getOrCreateAudioContext() {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass({ latencyHint: "interactive", sampleRate: 48000 });
      graph = null;
      bankBuffer = null;
      bankDecodePromise = null;
    }
    return audioContext;
  }

  function primeDeviceOutput(context) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(260, now);
    gain.gain.setValueAtTime(MIN_GAIN, now);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.022);
  }

  async function preloadBank(force = false) {
    if (!force && bankFetchPromise) return bankFetchPromise;
    const pending = Promise.all([
      fetch(BANK_META, { cache: "force-cache" }).then((response) => {
        if (!response.ok) throw new Error(`Sound metadata request failed: ${response.status}`);
        return response.json();
      }),
      fetch(BANK_WAV, { cache: "force-cache" }).then((response) => {
        if (!response.ok) throw new Error(`Sound bank request failed: ${response.status}`);
        return response.arrayBuffer();
      }),
    ]).then(([metadata, wave]) => {
      if (metadata?.version !== 33 || metadata?.identity !== "crownforge-sonic-forge" || metadata?.music !== false) {
        throw new Error("Unexpected Sonic Forge metadata contract.");
      }
      if (!metadata.clips || metadata.clipCount < 50 || metadata.sampleRate !== 48000) {
        throw new Error("Sonic Forge bank is incomplete.");
      }
      return { metadata, wave };
    });
    bankFetchPromise = pending;
    return pending;
  }

  void preloadBank().catch(() => { bankFetchPromise = null; });

  async function decodeBank(context) {
    if (bankBuffer && bankMetadata) return true;
    if (bankDecodePromise) return bankDecodePromise;

    const pending = (async () => {
      const { metadata, wave } = await preloadBank();
      const decoded = await context.decodeAudioData(wave.slice(0));
      if (decoded.numberOfChannels !== 1 || Math.abs(decoded.sampleRate - metadata.sampleRate) > 1) {
        throw new Error("Decoded Sonic Forge bank format does not match metadata.");
      }
      bankMetadata = metadata;
      bankBuffer = decoded;
      window.CROWNFORGE_SFX_READY = true;
      return true;
    })();

    bankDecodePromise = pending;
    try {
      return await pending;
    } finally {
      if (bankDecodePromise === pending && !bankBuffer) bankDecodePromise = null;
    }
  }

  function hashKey(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function chooseVariant(group, count, identity) {
    let variant = hashKey(`${group}:${identity}`) % count;
    if (count > 1 && lastVariants.get(group) === variant) variant = (variant + 1) % count;
    lastVariants.set(group, variant);
    return variant;
  }

  function panForSquare(square) {
    if (typeof square !== "string" || !/^[a-h][1-8]$/.test(square)) return 0;
    return ((square.charCodeAt(0) - 97) / 7 - 0.5) * 0.72;
  }

  function isDarkSquare(square) {
    if (typeof square !== "string" || !/^[a-h][1-8]$/.test(square)) return false;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return (file + rank) % 2 === 0;
  }

  function moveDistance(from, to) {
    if (!/^[a-h][1-8]$/.test(from || "") || !/^[a-h][1-8]$/.test(to || "")) return 1;
    return Math.max(
      Math.abs(from.charCodeAt(0) - to.charCodeAt(0)),
      Math.abs(Number(from[1]) - Number(to[1])),
    );
  }

  function pruneVoices() {
    if (!audioContext) return;
    for (let index = activeVoices.length - 1; index >= 0; index -= 1) {
      if (activeVoices[index].ended || activeVoices[index].endsAt <= audioContext.currentTime) {
        activeVoices.splice(index, 1);
      }
    }
  }

  function reserveVoice(priority) {
    pruneVoices();
    if (activeVoices.length < MAX_ACTIVE_VOICES) return true;

    let candidateIndex = -1;
    for (let index = 0; index < activeVoices.length; index += 1) {
      const voice = activeVoices[index];
      if (voice.priority > priority) continue;
      if (candidateIndex < 0 || voice.priority < activeVoices[candidateIndex].priority) candidateIndex = index;
    }
    if (candidateIndex < 0) return false;

    const [candidate] = activeVoices.splice(candidateIndex, 1);
    try {
      candidate.source.stop(audioContext.currentTime + 0.006);
    } catch {
      // An already-finished voice needs no further cleanup.
    }
    return true;
  }

  function playClip(name, options = {}) {
    if (!soundEnabled || !audioContext || !graph || !bankBuffer || !bankMetadata) return null;
    const clip = bankMetadata.clips[name];
    if (!clip) return null;

    const priority = options.priority ?? 1;
    if (!reserveVoice(priority)) return null;

    const context = audioContext;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const tone = context.createBiquadFilter();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const destination = options.bus === "piece"
      ? graph.pieceInput
      : options.bus === "ui"
        ? graph.uiInput
        : graph.situationInput;
    const when = Math.max(context.currentTime + 0.004, context.currentTime + (options.delay ?? 0));
    const rate = clamp(options.rate ?? 1, 0.78, 1.24);

    source.buffer = bankBuffer;
    source.playbackRate.setValueAtTime(rate, when);
    gain.gain.setValueAtTime(Math.max(MIN_GAIN, options.gain ?? 1), when);
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(clamp(options.filter ?? 7200, 900, 12000), when);
    tone.Q.value = 0.28;
    if (panner) panner.pan.value = clamp(options.pan ?? 0, -0.82, 0.82);

    source.connect(gain).connect(tone);
    if (panner) tone.connect(panner).connect(destination);
    else tone.connect(destination);

    const duration = clip.duration / rate;
    const voice = {
      source,
      priority,
      serial: ++voiceSerial,
      endsAt: when + duration + 0.05,
      ended: false,
    };
    source.onended = () => { voice.ended = true; };
    activeVoices.push(voice);
    source.start(when, clip.offset, clip.duration);
    source.stop(when + duration + 0.035);
    return voice;
  }

  function stopActiveVoices() {
    if (!audioContext) return;
    for (const voice of activeVoices.splice(0)) {
      try {
        voice.source.stop(audioContext.currentTime + 0.008);
      } catch {
        // A completed sound source is harmless.
      }
    }
  }

  function identityFor(detail, suffix = "") {
    return `${detail.sequence ?? 0}:${detail.from ?? "-"}:${detail.to ?? "-"}:${suffix}`;
  }

  function pieceProfile(detail, piece) {
    const white = detail.side === "white";
    const darkDestination = isDarkSquare(detail.to);
    return {
      gain: (PIECE_GAIN[piece] ?? 0.9) * (white ? 0.99 : 1.035),
      rate: white ? 1.022 : 0.978,
      filter: (white ? 7800 : 5250) * (darkDestination ? 0.92 : 1),
      pan: panForSquare(detail.to),
    };
  }

  function playPiece(detail, piece = detail.piece, delay = 0, gainScale = 1) {
    if (!PIECES.has(piece)) return null;
    const count = PIECE_VARIANTS[piece];
    const variant = chooseVariant(`piece.${piece}`, count, identityFor(detail, `${piece}:${delay}`));
    const profile = pieceProfile(detail, piece);
    return playClip(`piece.${piece}.${variant}`, {
      bus: "piece",
      delay,
      gain: profile.gain * gainScale,
      rate: profile.rate,
      filter: profile.filter,
      pan: profile.pan,
      priority: 2,
    });
  }

  function playSituation(name, detail, options = {}) {
    const count = SITUATION_VARIANTS[name] ?? 1;
    const variant = chooseVariant(`situation.${name}`, count, identityFor(detail, `${name}:${options.delay ?? 0}`));
    return playClip(`situation.${name}.${variant}`, {
      bus: options.bus ?? "situation",
      delay: options.delay ?? 0,
      gain: options.gain ?? 1,
      rate: options.rate ?? (detail.side === "white" ? 1.012 : detail.side === "black" ? 0.988 : 1),
      filter: options.filter ?? 7600,
      pan: options.pan ?? panForSquare(detail.to),
      priority: options.priority ?? 3,
    });
  }

  function playMove(detail) {
    const distance = Number.isFinite(detail.distance) ? detail.distance : moveDistance(detail.from, detail.to);
    const landingDelay = Math.min(0.225, 0.045 + distance * 0.024);

    if (distance >= 2 && !detail.castle) {
      playSituation(distance >= 4 ? "travel-long" : "travel-short", detail, {
        delay: 0.006,
        gain: distance >= 4 ? 0.46 : 0.34,
        filter: detail.side === "black" ? 4300 : 6400,
        priority: 1,
      });
    }

    if (detail.castle) {
      playPiece(detail, "king", landingDelay, 0.94);
      playSituation("castle-bridge", detail, {
        delay: landingDelay + 0.045,
        gain: 0.76,
        pan: detail.castle === "king-side" ? 0.28 : -0.28,
      });
      playPiece({ ...detail, to: detail.rookTo ?? detail.to }, "rook", landingDelay + 0.145, 1.04);
    } else {
      playPiece(detail, detail.piece, landingDelay);
    }

    if (detail.capture) {
      const captureName = HEAVY_PIECES.has(detail.capturedPiece) ? "capture-heavy" : "capture-light";
      playSituation(captureName, detail, {
        delay: landingDelay + 0.012,
        gain: captureName === "capture-heavy" ? 0.98 : 0.88,
        priority: 4,
      });
    }

    if (detail.enPassant) {
      playSituation("en-passant", detail, {
        delay: landingDelay + 0.045,
        gain: 0.84,
        pan: -panForSquare(detail.to) * 0.65,
        priority: 4,
      });
    }

    if (detail.promotion) {
      playSituation("promotion", detail, {
        delay: landingDelay + 0.075,
        gain: 0.96,
        priority: 5,
      });
      playPiece({ ...detail, piece: detail.promotion }, detail.promotion, landingDelay + 0.53, 0.72);
    }

    if (detail.terminal) {
      if (detail.outcome === "checkmate") {
        playSituation("checkmate", detail, {
          delay: landingDelay + 0.115,
          gain: 1.08,
          filter: 8600,
          pan: detail.winner === "white" ? 0.08 : detail.winner === "black" ? -0.08 : 0,
          priority: 10,
        });
      } else {
        playSituation("draw", detail, { delay: landingDelay + 0.12, gain: 0.86, priority: 8 });
      }
    } else if (detail.check) {
      playSituation("check", detail, {
        delay: landingDelay + 0.085,
        gain: 0.95,
        pan: 0,
        priority: 7,
      });
    }
  }

  function playTerminal(detail) {
    if (detail.outcome === "checkmate") {
      playSituation("checkmate", detail, { delay: 0.02, gain: 1.08, pan: 0, priority: 10 });
    } else {
      playSituation("draw", detail, { delay: 0.02, gain: 0.86, pan: 0, priority: 8 });
    }
  }

  async function ensureAudio() {
    if (!soundEnabled || !userActivated || document.visibilityState === "hidden") return false;
    if (audioContext?.state === "running" && graph && bankBuffer) {
      renderButton("ready");
      return true;
    }
    if (startPromise) return startPromise;

    const operationId = ++operation;
    const pending = (async () => {
      try {
        const context = getOrCreateAudioContext();
        renderButton("loading");
        if (context.state !== "running") await context.resume();
        if (operationId !== operation || !soundEnabled) return false;
        if (context.state !== "running") throw new Error("AudioContext did not enter running state.");
        if (!graph) graph = createAudioGraph(context);
        await decodeBank(context);
        if (operationId !== operation || !soundEnabled || document.visibilityState === "hidden") return false;
        renderButton("ready");
        return true;
      } catch {
        bankFetchPromise = null;
        bankDecodePromise = null;
        bankBuffer = null;
        bankMetadata = null;
        window.CROWNFORGE_SFX_READY = false;
        renderButton(soundEnabled ? "error" : "off");
        return false;
      }
    })();

    startPromise = pending;
    try {
      return await pending;
    } finally {
      if (startPromise === pending) startPromise = null;
    }
  }

  function handleAudioEvent(event) {
    const detail = event?.detail;
    if (!detail || detail.version !== 2 || typeof detail.kind !== "string") return;
    if (detail.kind === "ready") {
      renderButton(soundEnabled ? (bankBuffer ? "ready" : "waiting") : "off");
      return;
    }
    if (!soundEnabled) return;

    if (!userActivated && window.navigator?.userActivation?.isActive) userActivated = true;
    if (!userActivated) return;
    void ensureAudio().then((ready) => {
      if (!ready || !bankBuffer) return;

      if (detail.kind === "restart") {
        stopActiveVoices();
        lastMoveSequence = 0;
        playSituation("restart", detail, { delay: 0.012, gain: 0.76, pan: 0, priority: 6 });
        return;
      }
      if (detail.kind === "illegal") {
        playSituation("illegal", detail, { delay: 0.006, gain: 0.92, pan: panForSquare(detail.to), priority: 6 });
        return;
      }
      if (detail.kind === "history") {
        stopActiveVoices();
        if (Number.isInteger(detail.sequence) && detail.sequence >= 0) lastMoveSequence = detail.sequence;
        playSituation(detail.direction === "forward" ? "history-forward" : "history-back", detail, {
          delay: 0.008,
          gain: 0.72,
          pan: detail.direction === "forward" ? 0.16 : -0.16,
          priority: 6,
        });
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
      soundEnabled &&
      button.dataset.audioState !== "ready" &&
      (target === button || (typeof button.contains === "function" && button.contains(target)))
    ) {
      buttonUnlockGesture = true;
    }

    if (!soundEnabled || (audioContext?.state === "running" && graph && bankBuffer)) return;
    userActivated = true;
    if (document.visibilityState === "hidden") return;

    try {
      const context = getOrCreateAudioContext();
      renderButton("loading");
      primeDeviceOutput(context);
      const resumePromise = context.state === "running" ? Promise.resolve() : context.resume();
      void resumePromise.then(() => ensureAudio()).catch(() => renderButton("error"));
    } catch {
      renderButton("error");
    }
  }

  function closeAudio() {
    operation += 1;
    startPromise = null;
    stopActiveVoices();
    const closingContext = audioContext;
    audioContext = null;
    graph = null;
    bankBuffer = null;
    bankMetadata = null;
    bankDecodePromise = null;
    window.CROWNFORGE_SFX_READY = false;
    if (closingContext && closingContext.state !== "closed") closingContext.close().catch(() => {});
  }

  button.addEventListener("click", () => {
    userActivated = true;

    if (
      soundEnabled &&
      (buttonUnlockGesture || !audioContext || audioContext.state !== "running" || !graph || !bankBuffer)
    ) {
      buttonUnlockGesture = false;
      unlock({ target: button });
      // A real browser delivers click immediately after pointerdown, often
      // before the bank finishes decoding. unlock() can therefore mark this
      // same click again; consume that marker here so the next click always
      // performs the requested mute.
      buttonUnlockGesture = false;
      void ensureAudio().then((ready) => {
        if (ready) playSituation("ready", { sequence: 0, to: "e1" }, { bus: "ui", gain: 0.64, pan: 0, priority: 5 });
      });
      return;
    }

    buttonUnlockGesture = false;
    soundEnabled = !soundEnabled;
    savePreference();
    if (!soundEnabled) {
      operation += 1;
      stopActiveVoices();
      renderButton("off");
      return;
    }

    bankFetchPromise = preloadBank(true);
    renderButton("loading");
    unlock({ target: button });
    // The click that changes Sound Off to Sound On has already fulfilled the
    // unlock gesture. Do not carry that marker into the next click, otherwise
    // the first attempt to mute again would only replay the ready cue.
    buttonUnlockGesture = false;
    void ensureAudio().then((ready) => {
      if (ready) playSituation("ready", { sequence: 0, to: "e1" }, { bus: "ui", gain: 0.64, pan: 0, priority: 5 });
    });
  });

  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("touchend", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener(AUDIO_EVENT_NAME, handleAudioEvent);

  document.addEventListener("visibilitychange", () => {
    if (!audioContext) return;
    if (document.visibilityState === "hidden") {
      stopActiveVoices();
      audioContext.suspend().catch(() => {});
      renderButton(soundEnabled ? "paused" : "off");
    } else if (soundEnabled && userActivated) {
      void ensureAudio();
    }
  });

  window.addEventListener("pagehide", closeAudio, { once: true });
  renderButton();
})();
