import { ChessGame, DrawClaimType, GameStatus, MoveFlags, PieceType, Side, Square, pieceGlyph } from "./engine.js";
const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const substatusEl = document.querySelector("#substatus");
const historyEl = document.querySelector("#history");
const restartBtn = document.querySelector("#restart");
const rotateBtn = document.querySelector("#rotate");
const autoRotateInput = document.querySelector("#auto-rotate");
const claimDrawBtn = document.querySelector("#claim-draw");
const promotionDialog = document.querySelector("#promotion-dialog");
const victory = document.querySelector("#victory");
const victoryTitle = document.querySelector("#victory-title");
const victoryText = document.querySelector("#victory-text");
const rematchBtn = document.querySelector("#rematch");
let game = new ChessGame();
let selected = null;
let selectedMoves = [];
let whiteBottom = true;
let inputLocked = false;
const statusNames = {
    [GameStatus.InProgress]: "Game in progress", [GameStatus.Check]: "Check",
    [GameStatus.Checkmate]: "Checkmate", [GameStatus.Stalemate]: "Stalemate",
    [GameStatus.DrawInsufficientMaterial]: "Draw — insufficient material",
    [GameStatus.DrawThreefoldRepetition]: "Draw — threefold repetition",
    [GameStatus.DrawFiftyMoveRule]: "Draw — 50-move rule",
    [GameStatus.DrawFivefoldRepetition]: "Draw — fivefold repetition",
    [GameStatus.DrawSeventyFiveMoveRule]: "Draw — 75-move rule",
};
function visualSquares() {
    const squares = [];
    if (whiteBottom)
        for (let rank = 7; rank >= 0; rank--)
            for (let file = 0; file < 8; file++)
                squares.push(Square.fromFileRank(file, rank));
    else
        for (let rank = 0; rank < 8; rank++)
            for (let file = 7; file >= 0; file--)
                squares.push(Square.fromFileRank(file, rank));
    return squares;
}
function render() {
    boardEl.innerHTML = "";
    const legalTargets = new Set(selectedMoves.map(m => m.to.index));
    for (const square of visualSquares()) {
        const piece = game.position.at(square);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `square ${(square.file + square.rank) % 2 ? "light" : "dark"}`;
        cell.dataset.square = square.toString();
        cell.setAttribute("aria-label", `${square}${piece ? ` ${Side[piece.side]} ${PieceType[piece.type]}` : " empty"}`);
        if (selected?.index === square.index)
            cell.classList.add("selected");
        if (legalTargets.has(square.index))
            cell.classList.add(piece ? "capture-target" : "legal-target");
        if (piece) {
            const span = document.createElement("span");
            span.className = `piece ${piece.side === Side.White ? "white" : "black"}`;
            span.textContent = pieceGlyph(piece);
            cell.append(span);
        }
        if ((whiteBottom && square.file === 0) || (!whiteBottom && square.file === 7)) {
            const rank = document.createElement("small");
            rank.className = "rank-label";
            rank.textContent = String(square.rank + 1);
            cell.append(rank);
        }
        if ((whiteBottom && square.rank === 0) || (!whiteBottom && square.rank === 7)) {
            const file = document.createElement("small");
            file.className = "file-label";
            file.textContent = String.fromCharCode(97 + square.file);
            cell.append(file);
        }
        cell.addEventListener("click", () => void onSquare(square));
        boardEl.append(cell);
    }
    const side = game.position.sideToMove === Side.White ? "White" : "Black";
    statusEl.textContent = game.outcome.isTerminal ? statusNames[game.outcome.status] : `${side} to move${game.outcome.isCheck ? " — CHECK" : ""}`;
    substatusEl.textContent = `Move ${game.position.fullmoveNumber} · ${game.moveHistory.length} half-moves · Engine-authoritative`;
    claimDrawBtn.disabled = !(game.outcome.canClaimThreefoldRepetition || game.outcome.canClaimFiftyMoveRule);
    claimDrawBtn.textContent = game.outcome.canClaimThreefoldRepetition ? "Claim 3× Draw" : game.outcome.canClaimFiftyMoveRule ? "Claim 50-Move Draw" : "Claim Draw";
    historyEl.innerHTML = "";
    for (let i = 0; i < game.moveHistory.length; i += 2) {
        const li = document.createElement("li");
        li.textContent = `${game.moveHistory[i]?.toString() ?? ""}${game.moveHistory[i + 1] ? `  ${game.moveHistory[i + 1].toString()}` : ""}`;
        historyEl.append(li);
    }
}
function choosePromotion(candidates) {
    return new Promise(resolve => {
        const cleanup = () => promotionDialog.querySelectorAll("[data-promotion]").forEach(b => b.onclick = null);
        promotionDialog.querySelectorAll("[data-promotion]").forEach(button => {
            button.onclick = () => { const type = Number(button.dataset.promotion); cleanup(); promotionDialog.close(); resolve(candidates.find(m => m.promotion === type) ?? null); };
        });
        promotionDialog.addEventListener("cancel", () => { cleanup(); resolve(null); }, { once: true });
        promotionDialog.showModal();
    });
}
async function onSquare(square) {
    if (inputLocked || game.outcome.isTerminal)
        return;
    const piece = game.position.at(square);
    if (!selected) {
        if (piece?.side === game.position.sideToMove) {
            selected = square;
            selectedMoves = game.getLegalMoves().filter(m => m.from.index === square.index);
            render();
        }
        return;
    }
    if (piece?.side === game.position.sideToMove) {
        selected = square;
        selectedMoves = game.getLegalMoves().filter(m => m.from.index === square.index);
        render();
        return;
    }
    let candidates = selectedMoves.filter(m => m.to.index === square.index);
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
    if (candidates.some(m => m.flags & MoveFlags.Promotion)) {
        const chosen = await choosePromotion(candidates);
        if (!chosen)
            return;
        move = chosen;
    }
    inputLocked = true;
    game.play(move);
    selected = null;
    selectedMoves = [];
    boardEl.classList.add("move-impact");
    setTimeout(() => boardEl.classList.remove("move-impact"), 260);
    if (autoRotateInput.checked && !game.outcome.isTerminal)
        whiteBottom = !whiteBottom;
    render();
    if (game.outcome.isTerminal)
        await showTerminal();
    inputLocked = false;
}
async function showTerminal() {
    await new Promise(r => setTimeout(r, 350));
    document.body.classList.add("cinematic");
    const winner = game.outcome.winner === null ? null : game.outcome.winner === Side.White ? "WHITE" : "BLACK";
    victoryTitle.textContent = game.outcome.status === GameStatus.Checkmate ? "CHECKMATE" : "GAME OVER";
    victoryText.textContent = winner ? `${winner} WINS` : statusNames[game.outcome.status].toUpperCase();
    victory.classList.add("show");
}
function restart() { game = new ChessGame(); selected = null; selectedMoves = []; whiteBottom = true; inputLocked = false; victory.classList.remove("show"); document.body.classList.remove("cinematic"); render(); }
restartBtn.addEventListener("click", restart);
rematchBtn.addEventListener("click", restart);
rotateBtn.addEventListener("click", () => { whiteBottom = !whiteBottom; render(); });
claimDrawBtn.addEventListener("click", () => { if (game.outcome.canClaimThreefoldRepetition)
    game.claimDraw(DrawClaimType.ThreefoldRepetition);
else if (game.outcome.canClaimFiftyMoveRule)
    game.claimDraw(DrawClaimType.FiftyMoveRule);
else
    return; render(); void showTerminal(); });
render();
if ("serviceWorker" in navigator)
    window.addEventListener("load", () => void navigator.serviceWorker.register("./service-worker.js"));
