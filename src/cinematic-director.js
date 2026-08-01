(() => {
  const board = document.querySelector("#board");
  const status = document.querySelector("#status");
  const victory = document.querySelector("#victory");
  if (!board || !status || !victory) return;

  let audioContext = null;
  let audioArmed = false;
  let lastMoveKey = "";
  let lastPieceCount = 32;
  let terminalAnnounced = false;
  let syncQueued = false;

  function armAudio() {
    if (audioArmed) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    audioContext.resume().catch(() => {});
    audioArmed = true;
  }

  window.addEventListener("pointerdown", armAudio, { once: true, capture: true, passive: true });
  window.addEventListener("keydown", armAudio, { once: true, capture: true });

  function tone(frequency, duration, delay = 0, volume = .025, type = "sine", endFrequency = null) {
    if (!audioContext || audioContext.state !== "running") return;
    const now = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .025);
  }

  function playMove(capture) {
    tone(capture ? 118 : 146, .12, 0, capture ? .042 : .03, "triangle", capture ? 62 : 96);
    tone(capture ? 760 : 520, .055, .012, .012, "sine", capture ? 430 : 390);
  }

  function playCheck() {
    tone(392, .16, 0, .024, "sine");
    tone(587, .22, .075, .022, "sine");
  }

  function playTerminal() {
    tone(196, .72, 0, .035, "triangle", 130);
    tone(392, .7, .08, .025, "sine");
    tone(493.88, .7, .16, .022, "sine");
    tone(659.25, .95, .24, .021, "sine");
  }

  function vibrate(pattern) {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(sync);
  }

  function sync() {
    syncQueued = false;

    const from = board.querySelector(".square.last-from")?.dataset.square || "";
    const to = board.querySelector(".square.last-to")?.dataset.square || "";
    const moveKey = from && to ? `${from}-${to}` : "";
    const pieceCount = [...board.querySelectorAll(".piece")]
      .filter((piece) => !piece.hidden && piece.textContent.trim()).length;

    if (moveKey && moveKey !== lastMoveKey) {
      const capture = pieceCount < lastPieceCount;
      playMove(capture);
      vibrate(capture ? [12, 18, 18] : 8);
    }

    if (moveKey) lastMoveKey = moveKey;
    lastPieceCount = pieceCount;

    const statusText = status.textContent || "";
    const activeCheck = /to move\s+—\s+CHECK/i.test(statusText);
    const terminal = /checkmate|stalemate|draw\s+—|game over/i.test(statusText);
    const previouslyChecked = board.dataset.check === "true";

    board.dataset.check = activeCheck ? "true" : "false";
    if (activeCheck && !previouslyChecked) {
      playCheck();
      vibrate([18, 28, 18]);
    }

    if (terminal && !terminalAnnounced) {
      terminalAnnounced = true;
      document.body.classList.add("terminal-strike");
      playTerminal();
      vibrate([35, 45, 55, 45, 80]);
    } else if (!terminal) {
      terminalAnnounced = false;
      document.body.classList.remove("terminal-strike");
    }
  }

  const observer = new MutationObserver(scheduleSync);
  observer.observe(board, { subtree: true, childList: true, attributes: true, characterData: true });
  observer.observe(status, { subtree: true, childList: true, characterData: true });
  observer.observe(victory, { subtree: true, childList: true, attributes: true, characterData: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  });

  scheduleSync();
})();
