(() => {
  "use strict";

  const appShell = document.querySelector(".app-shell");
  const victory = document.querySelector("#victory");
  const rematch = document.querySelector("#rematch");

  if (!appShell || !victory || !rematch) return;

  victory.setAttribute("role", "dialog");
  victory.setAttribute("aria-modal", "true");
  victory.setAttribute("aria-labelledby", "victory-title");
  victory.setAttribute("aria-describedby", "victory-text");
  victory.setAttribute("aria-hidden", "true");

  let previousFocus = null;

  function setBackgroundInert(isInert) {
    if ("inert" in appShell) {
      appShell.inert = isInert;
    }

    if (isInert) {
      appShell.setAttribute("aria-hidden", "true");
    } else {
      appShell.removeAttribute("aria-hidden");
    }
  }

  function syncTerminalFocus() {
    const isOpen = victory.classList.contains("show");
    victory.setAttribute("aria-hidden", String(!isOpen));
    setBackgroundInert(isOpen);

    if (isOpen) {
      previousFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      window.requestAnimationFrame(() => rematch.focus({ preventScroll: true }));
      return;
    }

    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  const observer = new MutationObserver(syncTerminalFocus);
  observer.observe(victory, { attributes: true, attributeFilter: ["class"] });
  syncTerminalFocus();
})();
