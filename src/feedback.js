(() => {
  const history = document.querySelector('#history');
  const victory = document.querySelector('#victory');
  const status = document.querySelector('#status');
  if (!history || !victory || !status) return;

  let lastHistorySignature = history.textContent || '';

  function vibrate(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function playMoveFeedback(isCheck) {
    if (isCheck) {
      vibrate([18, 28, 34]);
    } else {
      vibrate(16);
    }
  }

  function playTerminalFeedback() {
    vibrate([35, 45, 55, 45, 90]);
  }

  // The history is rendered in full-move rows, so counting <li> elements misses
  // every Black move. Compare the rendered move signature instead, which changes
  // after every authoritative half-move while remaining unchanged on selection-only renders.
  const historyObserver = new MutationObserver(() => {
    const nextSignature = history.textContent || '';
    if (nextSignature && nextSignature !== lastHistorySignature) {
      playMoveFeedback(/check/i.test(status.textContent || ''));
    }
    lastHistorySignature = nextSignature;
  });
  historyObserver.observe(history, { childList: true, subtree: true, characterData: true });

  const victoryObserver = new MutationObserver(() => {
    if (victory.classList.contains('show')) playTerminalFeedback();
  });
  victoryObserver.observe(victory, { attributes: true, attributeFilter: ['class'] });
})();
