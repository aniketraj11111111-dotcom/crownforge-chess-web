import {
  ChessGame,
  DrawClaimType,
} from "./engine-stable.js";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_STORAGE_KEY = "crownforge.session.v1";
export const CLAIMED_DRAW = Object.freeze({
  Threefold: "threefold",
  FiftyMove: "fifty-move",
});

const MAX_STORED_HALF_MOVES = 2048;
const MOVE_TOKEN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function freshSession(discarded = false) {
  return {
    game: new ChessGame(),
    lastMove: null,
    claimedDrawType: null,
    restored: false,
    discarded,
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Session payload must be an object.");
  }
  if (payload.version !== SESSION_SCHEMA_VERSION) {
    throw new Error("Unsupported session schema.");
  }
  if (!Array.isArray(payload.moves) || payload.moves.length > MAX_STORED_HALF_MOVES) {
    throw new Error("Invalid session move list.");
  }
  for (const token of payload.moves) {
    if (typeof token !== "string" || !MOVE_TOKEN.test(token)) {
      throw new Error(`Invalid stored move token: ${String(token)}`);
    }
  }
  if (payload.claimedDraw !== null &&
      payload.claimedDraw !== CLAIMED_DRAW.Threefold &&
      payload.claimedDraw !== CLAIMED_DRAW.FiftyMove) {
    throw new Error("Invalid claimed draw marker.");
  }
  return payload;
}

export function encodeSession(game, claimedDrawType = null) {
  return JSON.stringify({
    version: SESSION_SCHEMA_VERSION,
    moves: game.moveHistory.map((move) => move.toString()),
    claimedDraw: claimedDrawType,
    savedAt: Date.now(),
  });
}

export function restoreSession(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return freshSession(false);

  try {
    const payload = validatePayload(JSON.parse(raw));
    const game = new ChessGame();
    let lastMove = null;

    for (const token of payload.moves) {
      if (game.outcome.isTerminal) {
        throw new Error("Stored moves continue after a terminal position.");
      }
      const move = game.getLegalMoves().find((candidate) => candidate.toString() === token);
      if (!move) throw new Error(`Stored move is illegal in sequence: ${token}`);
      game.play(move);
      lastMove = move;
    }

    if (payload.claimedDraw === CLAIMED_DRAW.Threefold) {
      if (!game.outcome.canClaimThreefoldRepetition) {
        throw new Error("Stored threefold claim is unavailable.");
      }
      game.claimDraw(DrawClaimType.ThreefoldRepetition);
    } else if (payload.claimedDraw === CLAIMED_DRAW.FiftyMove) {
      if (!game.outcome.canClaimFiftyMoveRule) {
        throw new Error("Stored fifty-move claim is unavailable.");
      }
      game.claimDraw(DrawClaimType.FiftyMoveRule);
    }

    return {
      game,
      lastMove,
      claimedDrawType: payload.claimedDraw,
      restored: payload.moves.length > 0 || payload.claimedDraw !== null,
      discarded: false,
    };
  } catch {
    return freshSession(true);
  }
}

export function loadSession(storage = globalThis.localStorage) {
  try {
    const restored = restoreSession(storage?.getItem?.(SESSION_STORAGE_KEY) ?? null);
    if (restored.discarded) storage?.removeItem?.(SESSION_STORAGE_KEY);
    return restored;
  } catch {
    return freshSession(true);
  }
}

export function saveSession(game, claimedDrawType = null, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(SESSION_STORAGE_KEY, encodeSession(game, claimedDrawType));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
