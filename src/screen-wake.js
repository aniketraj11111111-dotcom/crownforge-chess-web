(() => {
  "use strict";

  const body = document.body;
  if (!body || !("wakeLock" in navigator)) return;

  let wakeLock = null;
  let requesting = false;
  let userActivated = false;

  const gameIsActive = () => body.dataset.turn !== "terminal";

  async function releaseWakeLock() {
    const current = wakeLock;
    wakeLock = null;
    if (!current) return;
    try {
      await current.release();
    } catch {
      // The browser may already have released the sentinel.
    }
  }

  async function requestWakeLock() {
    if (!userActivated || requesting || wakeLock || document.hidden || !gameIsActive()) return;

    requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLock = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLock === sentinel) wakeLock = null;
      }, { once: true });
    } catch {
      // Wake lock is an enhancement; gameplay remains fully available without it.
    } finally {
      requesting = false;
    }
  }

  function activate() {
    userActivated = true;
    void requestWakeLock();
  }

  for (const eventName of ["pointerdown", "keydown"]) {
    window.addEventListener(eventName, activate, { once: true, passive: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      void releaseWakeLock();
    } else {
      void requestWakeLock();
    }
  });

  new MutationObserver(() => {
    if (gameIsActive()) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }).observe(body, { attributes: true, attributeFilter: ["data-turn"] });

  window.addEventListener("pagehide", () => void releaseWakeLock());
})();
