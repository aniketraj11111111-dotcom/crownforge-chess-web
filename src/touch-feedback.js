(() => {
  "use strict";

  const board = document.querySelector("#board");
  if (!board) return;

  const DRAG_CANCEL_DISTANCE = 12;
  let active = null;

  function clearPressed() {
    if (!active) return;
    active.cell.removeAttribute("data-pressed");
    active = null;
  }

  board.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const cell = event.target.closest("button[data-square]");
    if (!cell || !board.contains(cell) || cell.disabled) return;

    clearPressed();
    active = {
      pointerId: event.pointerId,
      cell,
      startX: event.clientX,
      startY: event.clientY,
    };
    cell.setAttribute("data-pressed", "true");
  });

  board.addEventListener("pointermove", (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const distance = Math.hypot(
      event.clientX - active.startX,
      event.clientY - active.startY,
    );
    if (distance > DRAG_CANCEL_DISTANCE) clearPressed();
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    board.addEventListener(type, (event) => {
      if (active && event.pointerId === active.pointerId) clearPressed();
    });
  }

  window.addEventListener("blur", clearPressed);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearPressed();
  });
})();
