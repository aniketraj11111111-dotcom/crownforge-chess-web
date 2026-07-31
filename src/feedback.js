(() => {
  const history = document.querySelector('#history');
  const victory = document.querySelector('#victory');
  const status = document.querySelector('#status');
  if (!history || !victory || !status) return;

  let audioContext = null;
  let lastHistoryCount = history.children.length;
  let lastStatus = status.textContent || '';

  function getAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioContext ??= new AudioContextCtor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  }

  function tone(frequency, duration, gain = 0.04, delay = 0, type = 'sine') {
    const context = getAudioContext();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function vibrate(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function playMoveFeedback(isCheck) {
    tone(190, 0.09, 0.035, 0, 'triangle');
    tone(255, 0.08, 0.025, 0.045, 'triangle');
    if (isCheck) {
      tone(520, 0.14, 0.045, 0.11, 'sine');
      vibrate([18, 28, 34]);
    } else {
      vibrate(16);
    }
  }

  function playTerminalFeedback() {
    tone(220, 0.18, 0.045, 0, 'triangle');
    tone(330, 0.22, 0.05, 0.12, 'triangle');
    tone(440, 0.42, 0.055, 0.27, 'sine');
    vibrate([35, 45, 55, 45, 90]);
  }

  document.addEventListener('pointerdown', () => {
    const context = getAudioContext();
    if (context?.state === 'suspended') void context.resume();
  }, { once: true, passive: true });

  const historyObserver = new MutationObserver(() => {
    const count = history.children.length;
    const nextStatus = status.textContent || '';
    if (count > lastHistoryCount) playMoveFeedback(/check/i.test(nextStatus));
    lastHistoryCount = count;
    lastStatus = nextStatus;
  });
  historyObserver.observe(history, { childList: true });

  const statusObserver = new MutationObserver(() => {
    lastStatus = status.textContent || '';
  });
  statusObserver.observe(status, { childList: true, characterData: true, subtree: true });

  const victoryObserver = new MutationObserver(() => {
    if (victory.classList.contains('show')) playTerminalFeedback();
  });
  victoryObserver.observe(victory, { attributes: true, attributeFilter: ['class'] });
})();
