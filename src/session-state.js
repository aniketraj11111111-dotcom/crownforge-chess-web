import {
  ChessGame,
  DrawClaimType,
} from "./engine-stable.js";

export const SESSION_SCHEMA_VERSION = 2;
export const LEGACY_SESSION_SCHEMA_VERSION = 1;
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
    timelineMoves: Object.freeze([]),
    timelineCursor: 0,
    claimedDrawType: null,
    restored: false,
    discarded,
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Session payload must be an object.");
  }
  if (payload.version !== SESSION_SCHEMA_VERSION &&
      payload.version !== LEGACY_SESSION_SCHEMA_VERSION) {
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
  const cursor = payload.version === LEGACY_SESSION_SCHEMA_VERSION
    ? payload.moves.length
    : payload.cursor;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > payload.moves.length) {
    throw new Error("Invalid session timeline cursor.");
  }
  if (payload.claimedDraw !== null &&
      payload.claimedDraw !== CLAIMED_DRAW.Threefold &&
      payload.claimedDraw !== CLAIMED_DRAW.FiftyMove) {
    throw new Error("Invalid claimed draw marker.");
  }
  if (payload.claimedDraw !== null && cursor !== payload.moves.length) {
    throw new Error("A claimed draw cannot have forward history.");
  }
  return {
    version: SESSION_SCHEMA_VERSION,
    moves: [...payload.moves],
    cursor,
    claimedDraw: payload.claimedDraw,
  };
}

function normalizeTimeline(game, timelineState) {
  const currentMoves = game.moveHistory.map((move) => move.toString());
  if (!timelineState) {
    return { moves: currentMoves, cursor: currentMoves.length };
  }

  if (!Array.isArray(timelineState.moves) ||
      timelineState.moves.length > MAX_STORED_HALF_MOVES) {
    throw new Error("Invalid timeline move list.");
  }
  const moves = timelineState.moves.map((token) => {
    if (typeof token !== "string" || !MOVE_TOKEN.test(token)) {
      throw new Error(`Invalid timeline move token: ${String(token)}`);
    }
    return token;
  });
  const cursor = timelineState.cursor;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > moves.length) {
    throw new Error("Invalid timeline cursor.");
  }
  const currentPrefix = moves.slice(0, cursor);
  if (currentPrefix.length !== currentMoves.length ||
      currentPrefix.some((token, index) => token !== currentMoves[index])) {
    throw new Error("Timeline cursor does not match the authoritative game state.");
  }
  if (claimedDrawTypePresent(game) && cursor !== moves.length) {
    throw new Error("A terminal claim cannot retain forward history.");
  }
  return { moves, cursor };
}

function claimedDrawTypePresent(game) {
  return Boolean(game?.outcome?.isTerminal && game?.outcome?.isDraw);
}

export function encodeSession(game, claimedDrawType = null, timelineState = null) {
  const timeline = normalizeTimeline(game, timelineState);
  if (claimedDrawType !== null && timeline.cursor !== timeline.moves.length) {
    throw new Error("A claimed draw cannot retain forward history.");
  }
  return JSON.stringify({
    version: SESSION_SCHEMA_VERSION,
    moves: timeline.moves,
    cursor: timeline.cursor,
    claimedDraw: claimedDrawType,
    savedAt: Date.now(),
  });
}

export function restoreSession(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return freshSession(false);

  try {
    const payload = validatePayload(JSON.parse(raw));
    const fullTimelineGame = new ChessGame();

    for (const token of payload.moves) {
      if (fullTimelineGame.outcome.isTerminal) {
        throw new Error("Stored moves continue after a terminal position.");
      }
      const move = fullTimelineGame.getLegalMoves()
        .find((candidate) => candidate.toString() === token);
      if (!move) throw new Error(`Stored move is illegal in sequence: ${token}`);
      fullTimelineGame.play(move);
    }

    let game = fullTimelineGame;
    let lastMove = game.moveHistory.at(-1) ?? null;
    if (payload.cursor < payload.moves.length) {
      game = new ChessGame();
      lastMove = null;
      for (const token of payload.moves.slice(0, payload.cursor)) {
        const move = game.getLegalMoves().find((candidate) => candidate.toString() === token);
        if (!move) throw new Error(`Stored cursor prefix is illegal: ${token}`);
        game.play(move);
        lastMove = move;
      }
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
      timelineMoves: Object.freeze([...payload.moves]),
      timelineCursor: payload.cursor,
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

export function saveSession(
  game,
  claimedDrawType = null,
  storage = globalThis.localStorage,
  timelineState = null,
) {
  try {
    storage?.setItem?.(
      SESSION_STORAGE_KEY,
      encodeSession(game, claimedDrawType, timelineState),
    );
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
