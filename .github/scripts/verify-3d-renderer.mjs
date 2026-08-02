import fs from 'node:fs';
import {
  boardProjection,
  buildBoardMeshes,
  buildMeshes,
} from '../../src/board3d-meshes.js';
import {
  CROWNFORGE_VISUAL_CONTRACT,
  boardPalette,
  linearLuminance,
  piecePalette,
  piecePartPalette,
} from '../../src/board3d-materials.js';

const errors = [];
const fail = (message) => errors.push(message);

function mockWebGL2() {
  return {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    createVertexArray: () => ({}),
    createBuffer: () => ({}),
    bindVertexArray: () => {},
    bindBuffer: () => {},
    bufferData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
  };
}

function project(matrix, x, y, z) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

const gl = mockWebGL2();
const pieces = buildMeshes(gl, 'high');
const board = buildBoardMeshes(gl, 'high');

for (const piece of ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King']) {
  if (!Array.isArray(pieces[piece]) || pieces[piece].length === 0) {
    fail(`production mesh missing for ${piece}`);
  }
}

if (!pieces.Knight.some((part) => part.role === 'eye')) fail('Knight eye detail mesh is missing');
if (!pieces.Knight.some((part) => part.role === 'mane')) fail('Knight mane definition is missing');
if (!pieces.Queen.some((part) => part.role === 'accent')) fail('Queen crown accent is missing');
if (!pieces.King.some((part) => part.role === 'accent')) fail('King cross accent is missing');
if (!pieces.Bishop.some((part) => part.role === 'cut')) fail('Bishop mitre definition is missing');
if (!pieces.Rook.some((part) => part.role === 'battlement')) fail('Rook battlement definition is missing');
if (!pieces.MoveTile?.some((part) => part.role === 'move-highlight')) fail('under-piece move highlight mesh is missing');

if (pieces.metrics.triangles < 25_000) {
  fail(`piece mesh detail budget is unexpectedly low: ${pieces.metrics.triangles} triangles`);
}
if (pieces.metrics.triangles > 180_000) {
  fail(`piece mesh detail budget exceeds the mobile-safe ceiling: ${pieces.metrics.triangles} triangles`);
}
if (pieces.metrics.drawParts > 80) {
  fail(`piece material-part budget exceeds the mobile-safe ceiling: ${pieces.metrics.drawParts}`);
}
if (board.length < 72) fail(`board mesh is incomplete: ${board.length} draw parts`);
if (board.length > 100) fail(`board draw-part budget exceeds the mobile-safe ceiling: ${board.length}`);
if (!board.some((part) => part.material === 'brass')) fail('board brass inlay is missing');
if (!board.some((part) => part.material === 'brass-soft')) fail('secondary board inlay is missing');
if (!board.some((part) => part.material === 'frame-bed')) fail('recessed board bed is missing');

const white = piecePalette('White', false, false, false);
const black = piecePalette('Black', false, false, false);
const darkSquare = boardPalette('dark');
const lightSquare = boardPalette('light');
const blackLuminance = linearLuminance(black.base);
const darkSquareLuminance = linearLuminance(darkSquare.base);

if (CROWNFORGE_VISUAL_CONTRACT.blackMaterial !== 'royal-smoked-ebony') {
  fail('smoked-ebony visual contract is missing');
}
if (!(blackLuminance >= .032 && blackLuminance <= .065)) {
  fail(`black material is outside the readable ebony luminance window: ${blackLuminance}`);
}
if (!(darkSquareLuminance - blackLuminance >= .045)) {
  fail('dark squares do not preserve enough luminance separation from black pieces');
}
if (!(black.roughness >= .25 && black.metallic <= .04 && black.alpha === 1)) {
  fail('black material is not solid broad-highlight ebony');
}
if (!(linearLuminance(white.base) > linearLuminance(lightSquare.base))) {
  fail('ivory pieces no longer separate from light squares');
}
const blackCut = piecePartPalette('cut', black);
const blackMane = piecePartPalette('mane', black);
if (!(linearLuminance(blackCut.base) > blackLuminance)) {
  fail('black bishop mitre lacks readable material separation');
}
if (!(linearLuminance(blackMane.base) > blackLuminance)) {
  fail('black knight mane lacks readable material separation');
}

for (const parts of [...Object.values(pieces).filter(Array.isArray), board]) {
  for (const part of parts) {
    if (!(part.count > 0) || part.count % 3 !== 0) fail('mesh contains an invalid triangle index count');
    if (![...part.transform].every(Number.isFinite)) fail('mesh contains a non-finite transform');
  }
}

const projection = boardProjection();
const lowerLeft = project(projection, -4, -4, 0);
const upperRight = project(projection, 4, 4, 0);
const grounded = project(projection, 0, 0, 0);
const upright = project(projection, 0, 0, 1);

if (Math.abs(lowerLeft.x + 1) > 0.0001 || Math.abs(lowerLeft.y + 1) > 0.0001) {
  fail('board projection no longer maps the lower-left corner to the fixed grid');
}
if (Math.abs(upperRight.x - 1) > 0.0001 || Math.abs(upperRight.y - 1) > 0.0001) {
  fail('board projection no longer maps the upper-right corner to the fixed grid');
}
if (!(upright.y > grounded.y && upright.z < grounded.z)) {
  fail('vertical 3D geometry is not lifted and depth-sorted above the board plane');
}

const renderer = fs.readFileSync(new URL('../../src/board3d.js', import.meta.url), 'utf8');
const webglStyles = fs.readFileSync(new URL('../../webgl-phase2.css', import.meta.url), 'utf8');
for (const contract of [
  ['PBR microfacet lighting', /distributionGGX/],
  ['procedural per-square wood grain', /vec2\s+cell=floor\(vP\.xy/],
  ['smoked-ebony contour lighting', /float\s+ebonyRim=/],
  ['true upright piece transform', /rotateX\(Math\.PI\s*\/\s*2\)/],
  ['fixed DOM hit-grid declaration', /hitGrid:\s*["']fixed-dom-64["']/],
  ['mobile quality tier', /selectQualityTier/],
  ['under-piece highlight order', /drawBoard\(\);\s*drawMoveHighlights\(state\);\s*drawShadows\(state,\s*timestamp\);\s*drawPieces\(state,\s*timestamp\);/],
]) {
  if (!contract[1].test(renderer)) fail(`renderer contract missing: ${contract[0]}`);
}
if (!/\.webgl-3d-ready\s+\.square\.last-to::before[\s\S]*background:\s*transparent\s*!important/.test(webglStyles)) {
  fail('DOM last-move wash can still veil the solid WebGL piece');
}
if (/new\s+ChessGame|game\.play|applyLegalMove|generateLegalMoves/.test(renderer)) {
  fail('presentation renderer attempted to own chess state');
}

if (errors.length) {
  for (const error of errors) console.error(`3D renderer verification failure: ${error}`);
  process.exit(1);
}

console.log(
  `Crownforge 3D renderer verification passed: ${pieces.metrics.triangles} unique piece triangles, ` +
  `${board.metrics.triangles} board triangles, ${pieces.metrics.drawParts + board.metrics.drawParts} unique draw parts, ` +
  `fixed 64-square hit-grid preserved.`,
);
