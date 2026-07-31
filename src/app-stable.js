import {
  ChessGame,
  DrawClaimType,
  GameStatus,
  MoveFlags,
  PieceType,
  Side,
  Square,
  pieceGlyph,
} from "./engine-stable.js";

const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const substatusEl = document.querySelector("#substatus");
const historyEl = document.querySelector("#history");
const restartBtn = document.querySelector("#restart");
const claimDrawBtn = document.querySelector("#claim-draw");
const promotionDialog = document.querySelector("#promotion-dialog");
const victory = document.querySelector("#victory");
const victoryTitle = document.querySelector("#victory-title");
const victoryText = document.querySelector("#victory-text");
const rematchBtn = document.querySelector("#rematch");

if (!boardEl || !statusEl || !substatusEl || !historyEl || !restartBtn ||
    !claimDrawBtn || !promotionDialog || !victory || !victoryTitle ||
    !victoryText || !rematchBtn) {
  throw new Error("Crownforge UI bootstrap failed: required element missing.");
}

statusEl.setAttribute("aria-live", "polite");
statusEl.setAttribute("aria-atomic", "true");

let game = new ChessGame();
let selected = null;
let selectedMoves = [];
let lastMove = null;
let inputLocked = false;

const statusNames = {
  [GameStatus.InProgress]: "Game in progress",
  [GameStatus.Check]: "Check",
  [GameStatus.Checkmate]: "Checkmate",
  [GameStatus.Stalemate]: "Stalemate",
  [GameStatus.DrawInsufficientMaterial]: "Draw — insufficient material",
  [GameStatus.DrawThreefoldRepetition]: "Draw — threefold repetition",
  [GameStatus.DrawFiftyMoveRule]: "Draw — 50-move rule",
  [GameStatus.DrawFivefoldRepetition]: "Draw — fivefold repetition",
  [GameStatus.DrawSeventyFiveMoveRule]: "Draw — 75-move rule",
};

// Permanent orientation contract: White is always at the bottom.
function visualSquares() {
  const squares = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    for (let file = 0; file < 8; file += 1) {
      squares.push(Square.fromFileRank(file, rank));
    }
  }
  return squares;
}

function render() {
  boardEl.replaceChildren();
  boardEl.dataset.orientation = "white";
  const legalTargets = new Set(selectedMoves.map((move) => move.to.index));

  for (const square of visualSquares()) {
    const piece = game.position.at(square);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `square ${(square.file + square.rank) % 2 ? "light" : "dark"}`;
    cell.dataset.square = square.toString();
    cell.setAttribute(
      "aria-label",
      `${square}${piece ? ` ${Side[piece.side]} ${PieceType[piece.type]}` : " empty"}`,
    );

    if (lastMove?.from.index === square.index) cell.classList.add("last-from");
    if (lastMove?.to.index === square.index) cell.classList.add("last-to");
    if (selected?.index === square.index) cell.classList.add("selected");
    if (legalTargets.has(square.index)) {
      cell.classList.add(piece ? "capture-target" : "legal-target");
    }

    if (piece) {
      const span = document.createElement("span");
      span.className = `piece ${piece.side === Side.White ? "white" : "black"}`;
      span.textContent = pieceGlyph(piece);
      cell.append(span);
    }

    if (square.file === 0) {
      const rankLabel = document.createElement("small");
      rankLabel.className = "rank-label";
      rankLabel.textContent = String(square.rank + 1);
      cell.append(rankLabel);
    }

    if (square.rank === 0) {
      const fileLabel = document.createElement("small");
      fileLabel.className = "file-label";
      fileLabel.textContent = String.fromCharCode(97 + square.file);
      cell.append(fileLabel);
    }

    cell.addEventListener("click", () => void onSquare(square));
    boardEl.append(cell);
  }

  const side = game.position.sideToMove === Side.White ? "White" : "Black";
  const turnKey = game.position.sideToMove === Side.White ? "white" : "black";
  document.body.dataset.turn = game.outcome.isTerminal ? "terminal" : turnKey;
  boardEl.dataset.turn = game.outcome.isTerminal ? "terminal" : turnKey;

  statusEl.textContent = game.outcome.isTerminal
    ? statusNames[game.outcome.status]
    : `${side} to move${game.outcome.isCheck ? " — CHECK" : ""}`;
  substatusEl.textContent = `Move ${game.position.fullmoveNumber} · ${game.moveHistory.length} half-moves · Engine-authoritative`;

  claimDrawBtn.disabled = !(
    game.outcome.canClaimThreefoldRepetition ||
    game.outcome.canClaimFiftyMoveRule
  );
  claimDrawBtn.textContent = game.outcome.canClaimThreefoldRepetition
    ? "Claim 3× Draw"
    : game.outcome.canClaimFiftyMoveRule
      ? "Claim 50-Move Draw"
      : "Claim Draw";

  historyEl.replaceChildren();
  for (let index = 0; index < game.moveHistory.length; index += 2) {
    const item = document.createElement("li");
    const whiteMove = game.moveHistory[index]?.toString() ?? "";
    const blackMove = game.moveHistory[index + 1]?.toString();
    item.textContent = blackMove ? `${whiteMove}  ${blackMove}` : whiteMove;
    historyEl.append(item);
  }
}

function choosePromotion(candidates) {
  return new Promise((resolve) => {
    const buttons = promotionDialog.querySelectorAll("[data-promotion]");
    const cleanup = () => buttons.forEach((button) => { button.onclick = null; });

    buttons.forEach((button) => {
      button.onclick = () => {
        const type = Number(button.dataset.promotion);
        cleanup();
        promotionDialog.close();
        resolve(candidates.find((move) => move.promotion === type) ?? null);
      };
    });

    promotionDialog.addEventListener(
      "cancel",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    promotionDialog.showModal();
  });
}

async function onSquare(square) {
  if (inputLocked || game.outcome.isTerminal) return;

  const piece = game.position.at(square);

  if (!selected) {
    if (piece?.side === game.position.sideToMove) {
      selected = square;
      selectedMoves = game.getLegalMoves().filter(
        (move) => move.from.index === square.index,
      );
      render();
    }
    return;
  }

  if (piece?.side === game.position.sideToMove) {
    selected = square;
    selectedMoves = game.getLegalMoves().filter(
      (move) => move.from.index === square.index,
    );
    render();
    return;
  }

  const candidates = selectedMoves.filter(
    (move) => move.to.index === square.index,
  );

  if (!candidates.length) {
    boardEl.classList.remove("illegal");
    void boardEl.offsetWidth;
    boardEl.classList.add("illegal");
    selected = null;
    selectedMoves = [];
    render();
    return;
  }

  let move = candidates[0];
  if (candidates.some((candidate) => candidate.flags & MoveFlags.Promotion)) {
    const chosen = await choosePromotion(candidates);
    if (!chosen) return;
    move = chosen;
  }

  inputLocked = true;
  try {
    game.play(move);
    lastMove = move;
    selected = null;
    selectedMoves = [];

    boardEl.classList.remove("move-impact");
    void boardEl.offsetWidth;
    boardEl.classList.add("move-impact");
    setTimeout(() => boardEl.classList.remove("move-impact"), 260);

    render();
    if (game.outcome.isTerminal) await showTerminal();
  } finally {
    inputLocked = false;
  }
}

async function showTerminal() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  document.body.classList.add("cinematic");
  const winner = game.outcome.winner === null
    ? null
    : game.outcome.winner === Side.White
      ? "WHITE"
      : "BLACK";

  victoryTitle.textContent = game.outcome.status === GameStatus.Checkmate
    ? "CHECKMATE"
    : "GAME OVER";
  victoryText.textContent = winner
    ? `${winner} WINS`
    : statusNames[game.outcome.status].toUpperCase();
  victory.classList.add("show");
}

function restart() {
  game = new ChessGame();
  selected = null;
  selectedMoves = [];
  lastMove = null;
  inputLocked = false;
  victory.classList.remove("show");
  document.body.classList.remove("cinematic");
  render();
}

restartBtn.addEventListener("click", restart);
rematchBtn.addEventListener("click", restart);
claimDrawBtn.addEventListener("click", () => {
  if (game.outcome.canClaimThreefoldRepetition) {
    game.claimDraw(DrawClaimType.ThreefoldRepetition);
  } else if (game.outcome.canClaimFiftyMoveRule) {
    game.claimDraw(DrawClaimType.FiftyMoveRule);
  } else {
    return;
  }
  render();
  void showTerminal();
});

render();
window.CROWNFORGE_READY = boardEl.children.length === 64;
