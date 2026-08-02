import fs from "node:fs";
import {
  ChessGame,
  GameStatus,
  PieceType,
  Side,
  Square,
} from "../../src/engine-stable.js";
import {
  LEGACY_SESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  encodeSession,
  restoreSession,
} from "../../src/session-state.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function playToken(game, token) {
  assert(!game.outcome.isTerminal, `timeline continued after terminal state before ${token}`);
  const move = game.getLegalMoves().find((candidate) => candidate.toString() === token);
  assert(move, `canonical timeline contains an illegal move: ${token}`);
  game.play(move);
  return move;
}

function buildGame(tokens) {
  const game = new ChessGame();
  for (const token of tokens) playToken(game, token);
  return game;
}

function moveTokens(game) {
  return game.moveHistory.map((move) => move.toString());
}

function pieceAt(game, square) {
  return game.position.at(Square.parse(square));
}

function assertPiece(game, square, side, type, label) {
  const piece = pieceAt(game, square);
  assert(piece?.side === side && piece.type === type, `${label}: unexpected piece on ${square}`);
}

function assertEmpty(game, square, label) {
  assert(pieceAt(game, square) === null, `${label}: expected ${square} to be empty`);
}

function restoreAtEveryCursor(label, tokens) {
  const fullGame = buildGame(tokens);

  for (let cursor = 0; cursor <= tokens.length; cursor += 1) {
    const prefixGame = buildGame(tokens.slice(0, cursor));
    const raw = encodeSession(prefixGame, null, { moves: tokens, cursor });
    const payload = JSON.parse(raw);
    assert(payload.version === SESSION_SCHEMA_VERSION, `${label}: session was not encoded as schema v2`);
    assert(payload.cursor === cursor, `${label}: cursor was not persisted at ${cursor}`);

    const restored = restoreSession(raw);
    assert(!restored.discarded, `${label}: valid cursor ${cursor} was discarded`);
    assert(restored.timelineCursor === cursor, `${label}: cursor ${cursor} did not restore`);
    assert(restored.timelineMoves.join(" ") === tokens.join(" "), `${label}: forward timeline changed`);
    assert(moveTokens(restored.game).join(" ") === tokens.slice(0, cursor).join(" "), `${label}: authoritative prefix changed at cursor ${cursor}`);
  }

  return fullGame;
}

const CASTLING = ["e2e4", "a7a6", "g1f3", "a6a5", "f1e2", "a5a4", "e1g1"];
const castled = restoreAtEveryCursor("castling", CASTLING);
assertPiece(castled, "g1", Side.White, PieceType.King, "castling replay");
assertPiece(castled, "f1", Side.White, PieceType.Rook, "castling replay");
assertEmpty(castled, "e1", "castling replay");
assertEmpty(castled, "h1", "castling replay");
const beforeCastle = buildGame(CASTLING.slice(0, -1));
assertPiece(beforeCastle, "e1", Side.White, PieceType.King, "castling undo");
assertPiece(beforeCastle, "h1", Side.White, PieceType.Rook, "castling undo");

const EN_PASSANT = ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"];
const enPassant = restoreAtEveryCursor("en passant", EN_PASSANT);
assertPiece(enPassant, "d6", Side.White, PieceType.Pawn, "en-passant replay");
assertEmpty(enPassant, "d5", "en-passant replay");
assertEmpty(enPassant, "e5", "en-passant replay");
const beforeEnPassant = buildGame(EN_PASSANT.slice(0, -1));
assertPiece(beforeEnPassant, "e5", Side.White, PieceType.Pawn, "en-passant undo");
assertPiece(beforeEnPassant, "d5", Side.Black, PieceType.Pawn, "en-passant undo");

const PROMOTION = ["a2a4", "b7b5", "a4b5", "a7a6", "b5a6", "h7h6", "a6a7", "h6h5", "a7b8q"];
const promoted = restoreAtEveryCursor("promotion", PROMOTION);
assertPiece(promoted, "b8", Side.White, PieceType.Queen, "promotion replay");
assertEmpty(promoted, "a7", "promotion replay");
const beforePromotion = buildGame(PROMOTION.slice(0, -1));
assertPiece(beforePromotion, "a7", Side.White, PieceType.Pawn, "promotion undo");
assertPiece(beforePromotion, "b8", Side.Black, PieceType.Knight, "promotion undo");

const CHECKMATE = ["f2f3", "e7e5", "g2g4", "d8h4"];
const checkmate = restoreAtEveryCursor("checkmate", CHECKMATE);
assert(checkmate.outcome.status === GameStatus.Checkmate, "checkmate redo did not restore checkmate");
assert(checkmate.outcome.winner === Side.Black, "checkmate redo restored the wrong winner");
const beforeMate = buildGame(CHECKMATE.slice(0, -1));
assert(!beforeMate.outcome.isTerminal, "checkmate undo did not unlock the prior position");

const originalLine = ["e2e4", "e7e5", "g1f3", "b8c6"];
const branchCursor = 2;
const branchGame = buildGame(originalLine.slice(0, branchCursor));
const branchMove = "f1c4";
playToken(branchGame, branchMove);
const branchedLine = [...originalLine.slice(0, branchCursor), branchMove];
const branchedRaw = encodeSession(branchGame, null, {
  moves: branchedLine,
  cursor: branchedLine.length,
});
const branched = restoreSession(branchedRaw);
assert(!branched.discarded, "valid branched timeline was discarded");
assert(branched.timelineMoves.join(" ") === branchedLine.join(" "), "new move did not replace forward history");
assert(!branched.timelineMoves.includes("g1f3"), "stale forward history survived a new branch");

const legacyRaw = JSON.stringify({
  version: LEGACY_SESSION_SCHEMA_VERSION,
  moves: ["e2e4", "e7e5"],
  claimedDraw: null,
  savedAt: 1,
});
const legacy = restoreSession(legacyRaw);
assert(!legacy.discarded, "valid v1 session migration failed");
assert(legacy.timelineCursor === 2 && legacy.timelineMoves.length === 2, "v1 session did not migrate to an end cursor");

for (const [label, payload] of [
  ["cursor overflow", { version: 2, moves: ["e2e4"], cursor: 2, claimedDraw: null }],
  ["illegal forward move", { version: 2, moves: ["e2e4", "e1e8"], cursor: 1, claimedDraw: null }],
  ["terminal continuation", { version: 2, moves: [...CHECKMATE, "a2a3"], cursor: 3, claimedDraw: null }],
]) {
  assert(restoreSession(JSON.stringify(payload)).discarded, `${label}: corrupt history was accepted`);
}

const index = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("src/app-stable.js", "utf8");
const controls = fs.readFileSync("history-controls.css", "utf8");

for (const id of ["timeline-controls", "undo-move", "redo-move", "history-position", "history-depth", "undo-terminal"]) {
  assert(new RegExp(`id=["']${id}["']`).test(index), `history UI is missing #${id}`);
}
for (const [label, pattern] of [
  ["fresh authoritative replay", /function\s+rebuildAuthoritativeGame[\s\S]*new\s+ChessGame\s*\(/],
  ["engine legal-move replay", /function\s+rebuildAuthoritativeGame[\s\S]*getLegalMoves\s*\(\)/],
  ["engine-approved replay transition", /function\s+rebuildAuthoritativeGame[\s\S]*rebuiltGame\.play\(replayMove\)/],
  ["forward-branch truncation", /moveTimeline\.slice\(0,\s*historyCursor\)/],
  ["terminal back control", /terminalUndoBtn\.addEventListener/],
  ["input lock", /const\s+busy\s*=\s*inputLocked\s*\|\|\s*promotionDialog\.open/],
]) {
  assert(pattern.test(app), `history app contract missing: ${label}`);
}
assert(!/ChessGame|game\.play|getLegalMoves/.test(controls), "history CSS attempted to own chess state");
assert(/min-block-size:\s*54px/.test(controls), "history controls do not meet the premium touch target");
assert(/prefers-reduced-motion/.test(controls), "history controls lack reduced-motion support");

const cursorChecks = CASTLING.length + EN_PASSANT.length + PROMOTION.length + CHECKMATE.length + 4;
console.log(
  `History navigation verification passed: ${cursorChecks} authoritative cursor positions, ` +
  "castling, en passant, promotion, checkmate, branch replacement, v1 migration and corruption rejection.",
);
