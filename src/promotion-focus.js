(() => {
  const board = document.querySelector("#board");
  const dialog = document.querySelector("#promotion-dialog");
  if (!board || !(dialog instanceof HTMLDialogElement)) return;

  const heading = dialog.querySelector("h2");
  const buttons = [...dialog.querySelectorAll("button[data-promotion]")];
  if (!heading || buttons.length !== 4) return;

  heading.id ||= "promotion-title";
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.setAttribute("aria-modal", "true");
  buttons.forEach((button) => {
    const label = button.querySelector("span")?.textContent?.trim();
    if (label) button.setAttribute("aria-label", `Promote pawn to ${label}`);
  });

  let returnTarget = null;

  board.addEventListener("focusin", (event) => {
    const square = event.target.closest("button[data-square]");
    if (square) returnTarget = square;
  });

  const observer = new MutationObserver(() => {
    if (!dialog.open) return;
    const activeSquare = document.activeElement?.closest?.("button[data-square]");
    if (activeSquare) returnTarget = activeSquare;
    window.requestAnimationFrame(() => buttons[0]?.focus({ preventScroll: true }));
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

  dialog.addEventListener("close", () => {
    const target = returnTarget;
    returnTarget = null;
    if (target?.isConnected) {
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  });
})();
