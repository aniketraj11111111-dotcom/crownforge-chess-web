(() => {
  const board = document.querySelector("#board");
  const status = document.querySelector("#status");
  const victory = document.querySelector("#victory");
  if (!board || !status || !victory) return;

  let lastMoveKey = "";
  let lastPieceCount = 32;
  let terminalAnnounced = false;
  let terminalStartedAt = 0;
  let victoryReleaseTimer = 0;
  let syncQueued = false;

  function vibrate(pattern) {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(sync);
  }

  function holdVictoryReveal() {
    if (!terminalAnnounced || !victory.classList.contains("show")) return;
    const minimumImpactTime = 880;
    const remaining = minimumImpactTime - (performance.now() - terminalStartedAt);
    if (remaining <= 0 || victoryReleaseTimer) return;

    victory.classList.remove("show");
    victoryReleaseTimer = window.setTimeout(() => {
      victoryReleaseTimer = 0;
      if (terminalAnnounced) {
        document.body.dataset.cinematicPhase = "reveal";
        victory.classList.add("show");
      }
    }, remaining);
  }

  function resetTerminalPresentation() {
    terminalAnnounced = false;
    terminalStartedAt = 0;
    document.body.classList.remove("terminal-strike");
    document.body.dataset.cinematicPhase = "play";
    if (victoryReleaseTimer) {
      window.clearTimeout(victoryReleaseTimer);
      victoryReleaseTimer = 0;
    }
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
      vibrate([18, 28, 18]);
    }

    if (terminal && !terminalAnnounced) {
      terminalAnnounced = true;
      terminalStartedAt = performance.now();
      document.body.classList.add("terminal-strike");
      document.body.dataset.cinematicPhase = "impact";
      vibrate([35, 45, 55, 45, 80]);
    } else if (!terminal && terminalAnnounced) {
      resetTerminalPresentation();
    }

    holdVictoryReveal();
  }

  const observer = new MutationObserver(scheduleSync);
  observer.observe(board, { subtree: true, childList: true, attributes: true, characterData: true });
  observer.observe(status, { subtree: true, childList: true, characterData: true });
  observer.observe(victory, { subtree: true, childList: true, attributes: true, characterData: true });

  document.body.dataset.cinematicPhase = "play";
  scheduleSync();
})();
