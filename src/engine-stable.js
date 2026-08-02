export var Side;
(function (Side) {
    Side[Side["White"] = 0] = "White";
    Side[Side["Black"] = 1] = "Black";
})(Side || (Side = {}));
export function opposite(side) {
    return side === Side.White ? Side.Black : Side.White;
}
export var PieceType;
(function (PieceType) {
    PieceType[PieceType["None"] = 0] = "None";
    PieceType[PieceType["Pawn"] = 1] = "Pawn";
    PieceType[PieceType["Knight"] = 2] = "Knight";
    PieceType[PieceType["Bishop"] = 3] = "Bishop";
    PieceType[PieceType["Rook"] = 4] = "Rook";
    PieceType[PieceType["Queen"] = 5] = "Queen";
    PieceType[PieceType["King"] = 6] = "King";
})(PieceType || (PieceType = {}));
export var CastlingRights;
(function (CastlingRights) {
    CastlingRights[CastlingRights["None"] = 0] = "None";
    CastlingRights[CastlingRights["WhiteKingSide"] = 1] = "WhiteKingSide";
    CastlingRights[CastlingRights["WhiteQueenSide"] = 2] = "WhiteQueenSide";
    CastlingRights[CastlingRights["BlackKingSide"] = 4] = "BlackKingSide";
    CastlingRights[CastlingRights["BlackQueenSide"] = 8] = "BlackQueenSide";
    CastlingRights[CastlingRights["All"] = 15] = "All";
})(CastlingRights || (CastlingRights = {}));
export var MoveFlags;
(function (MoveFlags) {
    MoveFlags[MoveFlags["None"] = 0] = "None";
    MoveFlags[MoveFlags["Capture"] = 1] = "Capture";
    MoveFlags[MoveFlags["DoublePawnPush"] = 2] = "DoublePawnPush";
    MoveFlags[MoveFlags["EnPassant"] = 4] = "EnPassant";
    MoveFlags[MoveFlags["CastleKingSide"] = 8] = "CastleKingSide";
    MoveFlags[MoveFlags["CastleQueenSide"] = 16] = "CastleQueenSide";
    MoveFlags[MoveFlags["Promotion"] = 32] = "Promotion";
})(MoveFlags || (MoveFlags = {}));
export class Square {
    static BoardSize = 8;
    static SquareCount = 64;
    index;
    constructor(index) {
        if (!Number.isInteger(index) || index < 0 || index >= Square.SquareCount) {
            throw new RangeError(`Square index must be 0..63; received ${index}.`);
        }
        this.index = index;
    }
    get file() { return this.index % 8; }
    get rank() { return Math.floor(this.index / 8); }
    get isLightSquare() { return ((this.file + this.rank) & 1) === 1; }
    static fromFileRank(file, rank) {
        if (!Number.isInteger(file) || file < 0 || file >= 8)
            throw new RangeError("File must be 0..7.");
        if (!Number.isInteger(rank) || rank < 0 || rank >= 8)
            throw new RangeError("Rank must be 0..7.");
        return new Square(rank * 8 + file);
    }
    static parse(algebraic) {
        if (!/^[a-hA-H][1-8]$/.test(algebraic))
            throw new Error(`Invalid square: ${algebraic}`);
        return Square.fromFileRank(algebraic.toLowerCase().charCodeAt(0) - 97, Number(algebraic[1]) - 1);
    }
    toString() { return `${String.fromCharCode(97 + this.file)}${this.rank + 1}`; }
}
export class Move {
    from;
    to;
    flags;
    promotion;
    constructor(from, to, flags = MoveFlags.None, promotion = PieceType.None) {
        if (from.index === to.index)
            throw new Error("A move must change squares.");
        const known = MoveFlags.Capture | MoveFlags.DoublePawnPush | MoveFlags.EnPassant |
            MoveFlags.CastleKingSide | MoveFlags.CastleQueenSide | MoveFlags.Promotion;
        if ((flags & ~known) !== 0)
            throw new Error("Unknown move flags.");
        const isPromotion = (flags & MoveFlags.Promotion) !== 0;
        const promotionValid = [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight].includes(promotion);
        if (isPromotion !== promotionValid)
            throw new Error("Invalid promotion contract.");
        if ((flags & MoveFlags.CastleKingSide) && (flags & MoveFlags.CastleQueenSide))
            throw new Error("Cannot castle both sides.");
        if ((flags & MoveFlags.EnPassant) && !(flags & MoveFlags.Capture))
            throw new Error("En passant must capture.");
        const isCastle = (flags & (MoveFlags.CastleKingSide | MoveFlags.CastleQueenSide)) !== 0;
        if (isCastle && flags !== MoveFlags.CastleKingSide && flags !== MoveFlags.CastleQueenSide)
            throw new Error("Invalid castle flags.");
        if ((flags & MoveFlags.DoublePawnPush) && flags !== MoveFlags.DoublePawnPush)
            throw new Error("Invalid double push flags.");
        if ((flags & MoveFlags.EnPassant) && flags !== (MoveFlags.EnPassant | MoveFlags.Capture))
            throw new Error("Invalid en passant flags.");
        this.from = from;
        this.to = to;
        this.flags = flags;
        this.promotion = promotion;
    }
    get isCapture() { return (this.flags & MoveFlags.Capture) !== 0; }
    get isPromotion() { return (this.flags & MoveFlags.Promotion) !== 0; }
    equals(other) {
        return this.from.index === other.from.index && this.to.index === other.to.index &&
            this.flags === other.flags && this.promotion === other.promotion;
    }
    toString() {
        const suffix = this.isPromotion ? {
            [PieceType.Queen]: "q", [PieceType.Rook]: "r", [PieceType.Bishop]: "b", [PieceType.Knight]: "n",
        }[this.promotion] ?? "" : "";
        return `${this.from}${this.to}${suffix}`;
    }
}
export class Position {
    board;
    sideToMove;
    castlingRights;
    enPassantTarget;
    halfmoveClock;
    fullmoveNumber;
    constructor(board, sideToMove, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber) {
        if (board.length !== 64)
            throw new Error("Board must contain 64 squares.");
        if ((castlingRights & ~CastlingRights.All) !== 0)
            throw new Error("Unknown castling rights.");
        if (enPassantTarget && enPassantTarget.rank !== 2 && enPassantTarget.rank !== 5)
            throw new Error("Invalid en passant rank.");
        if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0)
            throw new Error("Invalid halfmove clock.");
        if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1)
            throw new Error("Invalid fullmove number.");
        this.board = Object.freeze(board.map(p => p ? Object.freeze({ ...p }) : null));
        this.sideToMove = sideToMove;
        this.castlingRights = castlingRights;
        this.enPassantTarget = enPassantTarget;
        this.halfmoveClock = halfmoveClock;
        this.fullmoveNumber = fullmoveNumber;
    }
    at(square) { return this.board[square.index] ?? null; }
    copyBoard() { return this.board.map(p => p ? { ...p } : null); }
    findKing(side) {
        const index = this.board.findIndex(p => p?.side === side && p.type === PieceType.King);
        return index < 0 ? null : new Square(index);
    }
}
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function pieceFromFen(token) {
    const lower = token.toLowerCase();
    const typeByToken = {
        p: PieceType.Pawn, n: PieceType.Knight, b: PieceType.Bishop,
        r: PieceType.Rook, q: PieceType.Queen, k: PieceType.King,
    };
    const type = typeByToken[lower];
    if (!type)
        throw new Error(`Invalid FEN piece '${token}'.`);
    return { side: token === token.toUpperCase() ? Side.White : Side.Black, type };
}
export function parseFen(fen) {
    if (!fen.trim())
        throw new Error("FEN cannot be empty.");
    const fields = fen.trim().split(/\s+/);
    if (fields.length !== 6)
        throw new Error("FEN must contain exactly six fields.");
    const ranks = fields[0].split("/");
    if (ranks.length !== 8)
        throw new Error("FEN board must contain eight ranks.");
    const board = Array(64).fill(null);
    ranks.forEach((rankField, fenRank) => {
        let file = 0;
        for (const token of rankField) {
            if (/^[1-8]$/.test(token))
                file += Number(token);
            else {
                if (file >= 8)
                    throw new Error("FEN rank expands beyond eight files.");
                board[Square.fromFileRank(file, 7 - fenRank).index] = pieceFromFen(token);
                file++;
            }
            if (file > 8)
                throw new Error("FEN rank expands beyond eight files.");
        }
        if (file !== 8)
            throw new Error("FEN rank does not expand to eight files.");
    });
    const side = fields[1] === "w" ? Side.White : fields[1] === "b" ? Side.Black : (() => { throw new Error("Invalid active color."); })();
    let rights = CastlingRights.None;
    if (fields[2] !== "-") {
        if (!/^(?!.*(.).*\1)[KQkq]+$/.test(fields[2]))
            throw new Error("Malformed castling rights.");
        for (const c of fields[2])
            rights |= c === "K" ? CastlingRights.WhiteKingSide : c === "Q" ? CastlingRights.WhiteQueenSide : c === "k" ? CastlingRights.BlackKingSide : CastlingRights.BlackQueenSide;
    }
    let ep = null;
    if (fields[3] !== "-") {
        ep = Square.parse(fields[3]);
        if (fields[3] !== ep.toString())
            throw new Error("En passant square must be lowercase canonical algebraic.");
        if (ep.rank !== 2 && ep.rank !== 5)
            throw new Error("Invalid en passant rank.");
    }
    if (!/^\d+$/.test(fields[4]) || !/^\d+$/.test(fields[5]))
        throw new Error("Invalid move counters.");
    const half = Number(fields[4]);
    const full = Number(fields[5]);
    if (full < 1)
        throw new Error("Fullmove number must be at least one.");
    return new Position(board, side, rights, ep, half, full);
}
export function toFen(position) {
    const ranks = [];
    const tokens = {
        [PieceType.Pawn]: "p", [PieceType.Knight]: "n", [PieceType.Bishop]: "b",
        [PieceType.Rook]: "r", [PieceType.Queen]: "q", [PieceType.King]: "k",
    };
    for (let rank = 7; rank >= 0; rank--) {
        let out = "", empty = 0;
        for (let file = 0; file < 8; file++) {
            const piece = position.at(Square.fromFileRank(file, rank));
            if (!piece) {
                empty++;
                continue;
            }
            if (empty) {
                out += empty;
                empty = 0;
            }
            const token = tokens[piece.type];
            out += piece.side === Side.White ? token.toUpperCase() : token;
        }
        if (empty)
            out += empty;
        ranks.push(out);
    }
    let rights = "";
    if (position.castlingRights & CastlingRights.WhiteKingSide)
        rights += "K";
    if (position.castlingRights & CastlingRights.WhiteQueenSide)
        rights += "Q";
    if (position.castlingRights & CastlingRights.BlackKingSide)
        rights += "k";
    if (position.castlingRights & CastlingRights.BlackQueenSide)
        rights += "q";
    return `${ranks.join("/")} ${position.sideToMove === Side.White ? "w" : "b"} ${rights || "-"} ${position.enPassantTarget?.toString() ?? "-"} ${position.halfmoveClock} ${position.fullmoveNumber}`;
}
export function createInitialPosition() { return parseFen(INITIAL_FEN); }
export function validateForPlay(position) {
    let whiteKing = null, blackKing = null;
    let whiteCount = 0, blackCount = 0;
    for (let i = 0; i < 64; i++) {
        const square = new Square(i), piece = position.at(square);
        if (!piece)
            continue;
        if (piece.type === PieceType.Pawn && (square.rank === 0 || square.rank === 7))
            throw new Error(`Unpromoted pawn at ${square}.`);
        if (piece.type === PieceType.King) {
            if (piece.side === Side.White) {
                whiteCount++;
                whiteKing = square;
            }
            else {
                blackCount++;
                blackKing = square;
            }
        }
    }
    if (whiteCount !== 1 || blackCount !== 1 || !whiteKing || !blackKing)
        throw new Error("Position must contain exactly one king per side.");
    if (Math.abs(whiteKing.file - blackKing.file) <= 1 && Math.abs(whiteKing.rank - blackKing.rank) <= 1)
        throw new Error("Kings cannot be adjacent.");
}
const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const kingOffsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const bishopDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const onBoard = (file, rank) => file >= 0 && file < 8 && rank >= 0 && rank < 8;
export function isSquareAttacked(position, target, bySide) {
    const pawnDirection = bySide === Side.White ? 1 : -1;
    const pawnSourceRank = target.rank - pawnDirection;
    for (const df of [-1, 1]) {
        const file = target.file - df;
        if (onBoard(file, pawnSourceRank)) {
            const p = position.at(Square.fromFileRank(file, pawnSourceRank));
            if (p?.side === bySide && p.type === PieceType.Pawn)
                return true;
        }
    }
    for (const [df, dr] of knightOffsets) {
        const f = target.file + df, r = target.rank + dr;
        if (onBoard(f, r)) {
            const p = position.at(Square.fromFileRank(f, r));
            if (p?.side === bySide && p.type === PieceType.Knight)
                return true;
        }
    }
    for (const [df, dr] of kingOffsets) {
        const f = target.file + df, r = target.rank + dr;
        if (onBoard(f, r)) {
            const p = position.at(Square.fromFileRank(f, r));
            if (p?.side === bySide && p.type === PieceType.King)
                return true;
        }
    }
    const slider = (dirs, type) => {
        for (const [df, dr] of dirs) {
            let f = target.file + df, r = target.rank + dr;
            while (onBoard(f, r)) {
                const p = position.at(Square.fromFileRank(f, r));
                if (p) {
                    if (p.side === bySide && (p.type === type || p.type === PieceType.Queen))
                        return true;
                    break;
                }
                f += df;
                r += dr;
            }
        }
        return false;
    };
    return slider(rookDirs, PieceType.Rook) || slider(bishopDirs, PieceType.Bishop);
}
export function isInCheck(position, side) {
    const king = position.findKing(side);
    if (!king)
        throw new Error(`${Side[side]} king missing.`);
    return isSquareAttacked(position, king, opposite(side));
}
function addPawnMove(moves, from, to, capture, promotionRank) {
    const base = capture ? MoveFlags.Capture : MoveFlags.None;
    if (to.rank !== promotionRank) {
        moves.push(new Move(from, to, base));
        return;
    }
    for (const promotion of [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight])
        moves.push(new Move(from, to, base | MoveFlags.Promotion, promotion));
}
function addDestination(position, moves, from, target, side) {
    const p = position.at(target);
    if (!p)
        moves.push(new Move(from, target));
    else if (p.side !== side && p.type !== PieceType.King)
        moves.push(new Move(from, target, MoveFlags.Capture));
}
function pseudoLegalMoves(position) {
    const moves = [];
    const side = position.sideToMove;
    for (let index = 0; index < 64; index++) {
        const from = new Square(index), piece = position.at(from);
        if (!piece || piece.side !== side)
            continue;
        if (piece.type === PieceType.Pawn) {
            const direction = side === Side.White ? 1 : -1;
            const startRank = side === Side.White ? 1 : 6;
            const promotionRank = side === Side.White ? 7 : 0;
            const r1 = from.rank + direction;
            if (onBoard(from.file, r1)) {
                const one = Square.fromFileRank(from.file, r1);
                if (!position.at(one)) {
                    addPawnMove(moves, from, one, false, promotionRank);
                    const r2 = from.rank + 2 * direction;
                    if (from.rank === startRank && !position.at(Square.fromFileRank(from.file, r2)))
                        moves.push(new Move(from, Square.fromFileRank(from.file, r2), MoveFlags.DoublePawnPush));
                }
            }
            for (const df of [-1, 1]) {
                const f = from.file + df, r = from.rank + direction;
                if (!onBoard(f, r))
                    continue;
                const target = Square.fromFileRank(f, r), tp = position.at(target);
                if (tp && tp.side !== side && tp.type !== PieceType.King) {
                    addPawnMove(moves, from, target, true, promotionRank);
                    continue;
                }
                if (position.enPassantTarget?.index === target.index && !tp) {
                    const captured = position.at(Square.fromFileRank(f, from.rank));
                    if (captured?.side === opposite(side) && captured.type === PieceType.Pawn)
                        moves.push(new Move(from, target, MoveFlags.Capture | MoveFlags.EnPassant));
                }
            }
        }
        else if (piece.type === PieceType.Knight) {
            for (const [df, dr] of knightOffsets) {
                const f = from.file + df, r = from.rank + dr;
                if (onBoard(f, r))
                    addDestination(position, moves, from, Square.fromFileRank(f, r), side);
            }
        }
        else if ([PieceType.Bishop, PieceType.Rook, PieceType.Queen].includes(piece.type)) {
            const dirs = piece.type === PieceType.Bishop ? [...bishopDirs] : piece.type === PieceType.Rook ? [...rookDirs] : [...rookDirs, ...bishopDirs];
            for (const [df, dr] of dirs) {
                let f = from.file + df, r = from.rank + dr;
                while (onBoard(f, r)) {
                    const t = Square.fromFileRank(f, r), tp = position.at(t);
                    if (!tp)
                        moves.push(new Move(from, t));
                    else {
                        if (tp.side !== side && tp.type !== PieceType.King)
                            moves.push(new Move(from, t, MoveFlags.Capture));
                        break;
                    }
                    f += df;
                    r += dr;
                }
            }
        }
        else if (piece.type === PieceType.King) {
            for (const [df, dr] of kingOffsets) {
                const f = from.file + df, r = from.rank + dr;
                if (onBoard(f, r))
                    addDestination(position, moves, from, Square.fromFileRank(f, r), side);
            }
            const homeRank = side === Side.White ? 0 : 7;
            if (from.index === Square.fromFileRank(4, homeRank).index && !isSquareAttacked(position, from, opposite(side))) {
                const rookOk = (file) => { const r = position.at(Square.fromFileRank(file, homeRank)); return r?.side === side && r.type === PieceType.Rook; };
                const kRight = side === Side.White ? CastlingRights.WhiteKingSide : CastlingRights.BlackKingSide;
                const qRight = side === Side.White ? CastlingRights.WhiteQueenSide : CastlingRights.BlackQueenSide;
                if ((position.castlingRights & kRight) && rookOk(7) && !position.at(Square.fromFileRank(5, homeRank)) && !position.at(Square.fromFileRank(6, homeRank)) && !isSquareAttacked(position, Square.fromFileRank(5, homeRank), opposite(side)) && !isSquareAttacked(position, Square.fromFileRank(6, homeRank), opposite(side)))
                    moves.push(new Move(from, Square.fromFileRank(6, homeRank), MoveFlags.CastleKingSide));
                if ((position.castlingRights & qRight) && rookOk(0) && !position.at(Square.fromFileRank(1, homeRank)) && !position.at(Square.fromFileRank(2, homeRank)) && !position.at(Square.fromFileRank(3, homeRank)) && !isSquareAttacked(position, Square.fromFileRank(3, homeRank), opposite(side)) && !isSquareAttacked(position, Square.fromFileRank(2, homeRank), opposite(side)))
                    moves.push(new Move(from, Square.fromFileRank(2, homeRank), MoveFlags.CastleQueenSide));
            }
        }
    }
    return moves;
}
function removeRookRight(rights, side, square) {
    const homeRank = side === Side.White ? 0 : 7;
    if (square.rank !== homeRank)
        return rights;
    if (square.file === 0)
        return rights & ~(side === Side.White ? CastlingRights.WhiteQueenSide : CastlingRights.BlackQueenSide);
    if (square.file === 7)
        return rights & ~(side === Side.White ? CastlingRights.WhiteKingSide : CastlingRights.BlackKingSide);
    return rights;
}
export function applyUnchecked(position, move) {
    const board = position.copyBoard();
    const moving = board[move.from.index];
    if (!moving || moving.side !== position.sideToMove)
        throw new Error("Unchecked move has no side-to-move piece.");
    const captureSquare = (move.flags & MoveFlags.EnPassant) ? Square.fromFileRank(move.to.file, move.from.rank) : move.to;
    const captured = board[captureSquare.index] ?? null;
    const target = board[move.to.index] ?? null;
    if (move.isCapture) {
        if (!captured || captured.side === moving.side || captured.type === PieceType.King)
            throw new Error("Invalid capture contract.");
        if ((move.flags & MoveFlags.EnPassant) && (captured.type !== PieceType.Pawn || target))
            throw new Error("Invalid en passant contract.");
    }
    else if (target)
        throw new Error("Non-capture onto occupied square.");
    board[move.from.index] = null;
    if (move.isCapture)
        board[captureSquare.index] = null;
    board[move.to.index] = move.isPromotion ? { side: moving.side, type: move.promotion } : { ...moving };
    if (move.flags & (MoveFlags.CastleKingSide | MoveFlags.CastleQueenSide)) {
        const rank = moving.side === Side.White ? 0 : 7;
        const kingSide = (move.flags & MoveFlags.CastleKingSide) !== 0;
        const rf = Square.fromFileRank(kingSide ? 7 : 0, rank), rt = Square.fromFileRank(kingSide ? 5 : 3, rank);
        const rook = board[rf.index];
        if (!rook || rook.side !== moving.side || rook.type !== PieceType.Rook)
            throw new Error("Missing castling rook.");
        board[rf.index] = null;
        board[rt.index] = rook;
    }
    let rights = position.castlingRights;
    if (moving.type === PieceType.King)
        rights &= ~(moving.side === Side.White ? CastlingRights.WhiteKingSide | CastlingRights.WhiteQueenSide : CastlingRights.BlackKingSide | CastlingRights.BlackQueenSide);
    else if (moving.type === PieceType.Rook)
        rights = removeRookRight(rights, moving.side, move.from);
    if (captured?.type === PieceType.Rook)
        rights = removeRookRight(rights, captured.side, captureSquare);
    const ep = (move.flags & MoveFlags.DoublePawnPush) ? Square.fromFileRank(move.from.file, (move.from.rank + move.to.rank) / 2) : null;
    const half = moving.type === PieceType.Pawn || move.isCapture ? 0 : position.halfmoveClock + 1;
    const full = position.fullmoveNumber + (moving.side === Side.Black ? 1 : 0);
    return new Position(board, opposite(moving.side), rights, ep, half, full);
}
export function generateLegalMoves(position, from) {
    validateForPlay(position);
    const side = position.sideToMove;
    const legal = pseudoLegalMoves(position).filter(m => !isInCheck(applyUnchecked(position, m), side));
    return from ? legal.filter(m => m.from.index === from.index) : legal;
}
export function applyLegalMove(position, move) {
    const found = generateLegalMoves(position).find(m => m.equals(move));
    if (!found)
        throw new Error(`Illegal move: ${move}`);
    return applyUnchecked(position, found);
}
export function perft(position, depth) {
    if (!Number.isInteger(depth) || depth < 0)
        throw new RangeError("Depth must be non-negative.");
    if (depth === 0)
        return 1;
    const moves = generateLegalMoves(position);
    if (depth === 1)
        return moves.length;
    let total = 0;
    for (const move of moves)
        total += perft(applyUnchecked(position, move), depth - 1);
    return total;
}
export var GameStatus;
(function (GameStatus) {
    GameStatus[GameStatus["InProgress"] = 0] = "InProgress";
    GameStatus[GameStatus["Check"] = 1] = "Check";
    GameStatus[GameStatus["Checkmate"] = 2] = "Checkmate";
    GameStatus[GameStatus["Stalemate"] = 3] = "Stalemate";
    GameStatus[GameStatus["DrawInsufficientMaterial"] = 4] = "DrawInsufficientMaterial";
    GameStatus[GameStatus["DrawThreefoldRepetition"] = 5] = "DrawThreefoldRepetition";
    GameStatus[GameStatus["DrawFiftyMoveRule"] = 6] = "DrawFiftyMoveRule";
    GameStatus[GameStatus["DrawFivefoldRepetition"] = 7] = "DrawFivefoldRepetition";
    GameStatus[GameStatus["DrawSeventyFiveMoveRule"] = 8] = "DrawSeventyFiveMoveRule";
})(GameStatus || (GameStatus = {}));
export var DrawClaimType;
(function (DrawClaimType) {
    DrawClaimType[DrawClaimType["ThreefoldRepetition"] = 0] = "ThreefoldRepetition";
    DrawClaimType[DrawClaimType["FiftyMoveRule"] = 1] = "FiftyMoveRule";
})(DrawClaimType || (DrawClaimType = {}));
function outcome(status, winner = null, c3 = false, c50 = false) {
    const isTerminal = status !== GameStatus.InProgress && status !== GameStatus.Check;
    return Object.freeze({ status, winner, canClaimThreefoldRepetition: c3, canClaimFiftyMoveRule: c50, isTerminal,
        isCheck: status === GameStatus.Check || status === GameStatus.Checkmate,
        isDraw: [GameStatus.Stalemate, GameStatus.DrawInsufficientMaterial, GameStatus.DrawThreefoldRepetition, GameStatus.DrawFiftyMoveRule, GameStatus.DrawFivefoldRepetition, GameStatus.DrawSeventyFiveMoveRule].includes(status) });
}
export function isInsufficientMaterial(position) {
    validateForPlay(position);
    let minor = 0, onlyBishops = true, bishopColor = null;
    for (let i = 0; i < 64; i++) {
        const sq = new Square(i), p = position.at(sq);
        if (!p || p.type === PieceType.King)
            continue;
        if ([PieceType.Pawn, PieceType.Rook, PieceType.Queen].includes(p.type))
            return false;
        minor++;
        if (p.type === PieceType.Knight) {
            onlyBishops = false;
            continue;
        }
        if (bishopColor === null)
            bishopColor = sq.isLightSquare;
        else if (bishopColor !== sq.isLightSquare)
            return false;
    }
    return minor <= 1 || (onlyBishops && bishopColor !== null);
}
function hasLegalEnPassant(position) { return !!position.enPassantTarget && generateLegalMoves(position).some(m => (m.flags & MoveFlags.EnPassant) !== 0); }
export function repetitionKey(position) { validateForPlay(position); const f = toFen(position).split(" "); return `${f[0]} ${f[1]} ${f[2]} ${hasLegalEnPassant(position) ? position.enPassantTarget.toString() : "-"}`; }
export class RepetitionTracker {
    counts = new Map();
    record(position) { const k = repetitionKey(position), n = (this.counts.get(k) ?? 0) + 1; this.counts.set(k, n); return n; }
    count(position) { return this.counts.get(repetitionKey(position)) ?? 0; }
    clear() { this.counts.clear(); }
}
export function adjudicate(position, tracker) {
    validateForPlay(position);
    const legal = generateLegalMoves(position), check = isInCheck(position, position.sideToMove);
    if (!legal.length)
        return check ? outcome(GameStatus.Checkmate, opposite(position.sideToMove)) : outcome(GameStatus.Stalemate);
    if (isInsufficientMaterial(position))
        return outcome(GameStatus.DrawInsufficientMaterial);
    const reps = tracker.count(position);
    if (reps >= 5)
        return outcome(GameStatus.DrawFivefoldRepetition);
    if (position.halfmoveClock >= 150)
        return outcome(GameStatus.DrawSeventyFiveMoveRule);
    return outcome(check ? GameStatus.Check : GameStatus.InProgress, null, reps >= 3, position.halfmoveClock >= 100);
}
export class ChessGame {
    position;
    outcome;
    moveHistory = [];
    tracker = new RepetitionTracker();
    constructor(initial = createInitialPosition()) { validateForPlay(initial); this.position = initial; this.tracker.record(initial); this.outcome = adjudicate(initial, this.tracker); }
    get currentPositionOccurrences() { return this.tracker.count(this.position); }
    getLegalMoves() { return this.outcome.isTerminal ? [] : generateLegalMoves(this.position); }
    play(move) { if (this.outcome.isTerminal)
        throw new Error("Game is over."); this.position = applyLegalMove(this.position, move); this.moveHistory.push(move); this.tracker.record(this.position); this.outcome = adjudicate(this.position, this.tracker); return this.outcome; }
    claimDraw(type) { if (this.outcome.isTerminal)
        throw new Error("Game is over."); const ok = type === DrawClaimType.ThreefoldRepetition ? this.outcome.canClaimThreefoldRepetition : this.outcome.canClaimFiftyMoveRule; if (!ok)
        throw new Error("Draw claim unavailable."); this.outcome = outcome(type === DrawClaimType.ThreefoldRepetition ? GameStatus.DrawThreefoldRepetition : GameStatus.DrawFiftyMoveRule); return this.outcome; }
}
export const pieceGlyph = (piece) => ({
    [Side.White]: { [PieceType.Pawn]: "♙", [PieceType.Knight]: "♘", [PieceType.Bishop]: "♗", [PieceType.Rook]: "♖", [PieceType.Queen]: "♕", [PieceType.King]: "♔" },
    [Side.Black]: { [PieceType.Pawn]: "♟", [PieceType.Knight]: "♞", [PieceType.Bishop]: "♝", [PieceType.Rook]: "♜", [PieceType.Queen]: "♛", [PieceType.King]: "♚" },
}[piece.side][piece.type] ?? "");
