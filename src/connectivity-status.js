(() => {
  "use strict";

  const status = document.querySelector("#connection-status");
  if (!status) return;

  const setStatus = (label, state) => {
    status.textContent = label;
    status.dataset.connection = state;
  };

  const render = () => {
    if (!navigator.onLine) {
      setStatus("Offline mode", "offline");
      return;
    }

    if (!("serviceWorker" in navigator)) {
      setStatus("Online mode", "online");
      return;
    }

    if (navigator.serviceWorker.controller) {
      setStatus("Offline ready", "ready");
      return;
    }

    setStatus("Preparing offline play", "preparing");
  };

  window.addEventListener("online", render);
  window.addEventListener("offline", render);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", render);
    navigator.serviceWorker.ready.then(render).catch(render);
  }

  render();
})();
