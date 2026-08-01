(() => {
  "use strict";

  const installButton = document.querySelector("#install-app");
  if (!(installButton instanceof HTMLButtonElement)) return;

  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const hideInstall = () => {
    installButton.hidden = true;
    installButton.disabled = false;
    installButton.removeAttribute("aria-busy");
    deferredPrompt = null;
  };

  const showInstall = () => {
    if (isStandalone() || !deferredPrompt) {
      hideInstall();
      return;
    }
    installButton.hidden = false;
    installButton.disabled = false;
    installButton.removeAttribute("aria-busy");
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstall();
  });

  window.addEventListener("appinstalled", hideInstall);

  window.matchMedia("(display-mode: standalone)")
    .addEventListener?.("change", () => {
      if (isStandalone()) hideInstall();
    });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt || isStandalone()) {
      hideInstall();
      return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    installButton.disabled = true;
    installButton.setAttribute("aria-busy", "true");

    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Installation remains optional; browser rejection must never block play.
    } finally {
      hideInstall();
    }
  });

  if (isStandalone()) hideInstall();
})();
