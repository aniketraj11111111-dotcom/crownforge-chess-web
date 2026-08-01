(() => {
  "use strict";

  const board = document.querySelector("#board");
  if (!board) return;

  const sync = () => {
    const cells = [...board.querySelectorAll("button[data-square]")];
    if (cells.length !== 64) return;

    for (const cell of cells) {
      const isSelected = cell.classList.contains("selected");
      const isLegal = cell.classList.contains("legal-target");
      const isCapture = cell.classList.contains("capture-target");
      const baseLabel = cell.getAttribute("aria-label") || cell.dataset.square || "Chess square";
      const state = isSelected
        ? "selected"
        : isCapture
          ? "legal capture destination"
          : isLegal
            ? "legal move destination"
            : "";

      cell.setAttribute("aria-selected", String(isSelected));
      cell.dataset.moveTarget = isCapture ? "capture" : isLegal ? "move" : "none";

      const previousState = cell.dataset.semanticState || "";
      if (state !== previousState) {
        cell.dataset.semanticState = state;
      }

      const normalizedBase = baseLabel.replace(/, (?:selected|legal capture destination|legal move destination)$/, "");
      cell.setAttribute("aria-label", state ? `${normalizedBase}, ${state}` : normalizedBase);
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(board, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  sync();
  window.CROWNFORGE_BOARD_SEMANTICS = Object.freeze({ sync });
})();
