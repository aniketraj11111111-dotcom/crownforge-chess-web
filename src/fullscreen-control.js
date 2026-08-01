(() => {
  const button = document.querySelector("#fullscreen-app");
  if (!button) return;

  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;

  if (!canFullscreen || standalone) {
    button.hidden = true;
    return;
  }

  const render = () => {
    const active = Boolean(document.fullscreenElement);
    button.hidden = false;
    button.disabled = false;
    button.textContent = active ? "Exit Fullscreen" : "Fullscreen";
    button.setAttribute("aria-pressed", String(active));
  };

  const toggle = async () => {
    button.disabled = true;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      render();
    }
  };

  button.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", render);
  document.addEventListener("fullscreenerror", render);
  render();
})();
