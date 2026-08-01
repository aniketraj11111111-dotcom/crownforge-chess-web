(() => {
  const board = document.querySelector("#board");
  if (!board) return;

  const FILES = 8;
  const RANKS = 8;

  function squares() {
    return [...board.querySelectorAll("button[data-square]")];
  }

  function focusSquare(index) {
    const cells = squares();
    if (cells.length !== 64) return;
    const nextIndex = Math.max(0, Math.min(63, index));
    cells.forEach((cell, cellIndex) => {
      cell.tabIndex = cellIndex === nextIndex ? 0 : -1;
    });
    cells[nextIndex].focus({ preventScroll: true });
  }

  function initializeRovingTabIndex() {
    const cells = squares();
    if (cells.length !== 64) return false;
    const focusedIndex = cells.indexOf(document.activeElement);
    const activeIndex = focusedIndex >= 0 ? focusedIndex : 56;
    cells.forEach((cell, index) => {
      cell.tabIndex = index === activeIndex ? 0 : -1;
    });
    board.setAttribute("role", "grid");
    board.setAttribute("aria-rowcount", String(RANKS));
    board.setAttribute("aria-colcount", String(FILES));
    cells.forEach((cell) => cell.setAttribute("role", "gridcell"));
    return true;
  }

  board.addEventListener("focusin", (event) => {
    const cell = event.target.closest("button[data-square]");
    if (!cell) return;
    for (const square of squares()) square.tabIndex = square === cell ? 0 : -1;
  });

  board.addEventListener("keydown", (event) => {
    const cell = event.target.closest("button[data-square]");
    if (!cell) return;

    const cells = squares();
    const index = cells.indexOf(cell);
    if (index < 0) return;

    const row = Math.floor(index / FILES);
    const column = index % FILES;
    let nextIndex = null;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex = row * FILES + Math.max(0, column - 1);
        break;
      case "ArrowRight":
        nextIndex = row * FILES + Math.min(FILES - 1, column + 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(0, row - 1) * FILES + column;
        break;
      case "ArrowDown":
        nextIndex = Math.min(RANKS - 1, row + 1) * FILES + column;
        break;
      case "Home":
        nextIndex = event.ctrlKey ? 0 : row * FILES;
        break;
      case "End":
        nextIndex = event.ctrlKey ? 63 : row * FILES + (FILES - 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    focusSquare(nextIndex);
  });

  if (!initializeRovingTabIndex()) {
    const observer = new MutationObserver(() => {
      if (initializeRovingTabIndex()) observer.disconnect();
    });
    observer.observe(board, { childList: true });
  }
})();
