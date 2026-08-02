import path from 'node:path';
import { pathToFileURL } from 'node:url';

const errors = [];
const fail = (message) => errors.push(message);

function classList(...initial) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toString: () => [...values].join(' '),
  };
}

function fakeWebGL2() {
  let draws = 0;
  let uploads = 0;
  let currentDepthMask = true;
  const depthMasks = [];
  const drawLog = [];
  const shaders = [];
  const uniformValues = {};

  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    DEPTH_TEST: 0x0b71,
    BLEND: 0x0be2,
    LEQUAL: 0x0203,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
    createVertexArray: () => ({}),
    createBuffer: () => ({}),
    bindVertexArray: () => {},
    bindBuffer: () => {},
    bufferData: () => { uploads += 1; },
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    createShader: (type) => {
      const shader = { type, source: '', compiled: false };
      shaders.push(shader);
      return shader;
    },
    shaderSource: (shader, source) => { shader.source = source; },
    compileShader: (shader) => { shader.compiled = true; },
    getShaderParameter: (shader, flag) => flag === gl.COMPILE_STATUS && shader.compiled,
    getShaderInfoLog: () => '',
    createProgram: () => ({ attached: [], linked: false }),
    attachShader: (program, shader) => program.attached.push(shader),
    linkProgram: (program) => { program.linked = true; },
    getProgramParameter: (program, flag) => flag === gl.LINK_STATUS && program.linked,
    getProgramInfoLog: () => '',
    deleteShader: () => {},
    getUniformLocation: (_program, name) => ({ name }),
    enable: () => {},
    depthFunc: () => {},
    blendFunc: () => {},
    clearColor: () => {},
    viewport: () => {},
    clear: () => {},
    useProgram: () => {},
    uniformMatrix4fv: (location, _transpose, value) => {
      uniformValues[location.name] = [...value];
    },
    uniformMatrix3fv: () => {},
    uniform3fv: (location, value) => { uniformValues[location.name] = [...value]; },
    uniform1f: (location, value) => { uniformValues[location.name] = value; },
    depthMask: (enabled) => {
      currentDepthMask = enabled;
      depthMasks.push(enabled);
    },
    drawElements: (mode, count, type) => {
      if (mode !== gl.TRIANGLES || type !== gl.UNSIGNED_SHORT || count <= 0 || count % 3 !== 0) {
        fail('renderer issued an invalid indexed draw');
      }
      draws += 1;
      drawLog.push({
        alpha: uniformValues.alpha,
        base: uniformValues.base ? [...uniformValues.base] : null,
        count,
        depthMask: currentDepthMask,
        material: uniformValues.material,
      });
    },
  };

  Object.defineProperties(gl, {
    draws: { get: () => draws },
    uploads: { get: () => uploads },
    depthMasks: { get: () => [...depthMasks] },
    drawLog: { get: () => drawLog.map((entry) => ({ ...entry })) },
    shaders: { get: () => [...shaders] },
  });
  return gl;
}

const glyphs = new Map([
  ['e4', { glyph: '♙', side: 'white' }],
  ['a1', { glyph: '♖', side: 'white' }],
  ['b1', { glyph: '♘', side: 'white' }],
  ['c1', { glyph: '♗', side: 'white' }],
  ['d1', { glyph: '♕', side: 'white' }],
  ['e1', { glyph: '♔', side: 'white' }],
  ['a8', { glyph: '♜', side: 'black' }],
  ['b8', { glyph: '♞', side: 'black' }],
  ['c8', { glyph: '♝', side: 'black' }],
  ['d8', { glyph: '♛', side: 'black' }],
  ['e8', { glyph: '♚', side: 'black' }],
  ['e5', { glyph: '♟', side: 'black' }],
]);

const cells = [];
for (let rank = 8; rank >= 1; rank -= 1) {
  for (let file = 0; file < 8; file += 1) {
    const square = `${String.fromCharCode(97 + file)}${rank}`;
    const piece = glyphs.get(square);
    cells.push({
      dataset: { square },
      classList: classList(
        square === 'e7' ? 'last-from' : '',
        square === 'e5' ? 'last-to' : '',
      ),
      querySelector: (selector) => selector === '.piece' && piece
        ? {
            hidden: false,
            textContent: piece.glyph,
            classList: classList('piece', piece.side),
          }
        : null,
    });
  }
}

const gl = fakeWebGL2();
const rect = { left: 0, top: 0, width: 720, height: 720 };
const canvasListeners = new Map();
const canvas = {
  dataset: { ready: 'false', aligned: 'false' },
  style: {},
  width: 0,
  height: 0,
  getContext: (name) => name === 'webgl2' ? gl : null,
  getBoundingClientRect: () => rect,
  addEventListener: (name, listener) => canvasListeners.set(name, listener),
};
const board = {
  dataset: { geometryLocked: 'true', check: 'false', turn: 'white' },
  offsetWidth: rect.width,
  offsetHeight: rect.height,
  offsetLeft: rect.left,
  offsetTop: rect.top,
  querySelectorAll: (selector) => selector === '.square[data-square]' ? cells : [],
  getBoundingClientRect: () => rect,
};
const stage = {};
const htmlClasses = classList();
const bodyClasses = classList();
const frameQueue = [];
const windowListeners = new Map();
const warnings = [];

globalThis.document = {
  querySelector: (selector) => ({ '#board-3d': canvas, '#board': board, '.board-stage': stage })[selector] ?? null,
  documentElement: { classList: htmlClasses },
  body: { classList: bodyClasses },
};
globalThis.window = {
  deviceMemory: 8,
  hardwareConcurrency: 8,
  devicePixelRatio: 1.5,
  requestAnimationFrame: (callback) => { frameQueue.push(callback); return frameQueue.length; },
  addEventListener: (name, listener) => windowListeners.set(name, listener),
  setTimeout: (callback) => { callback(); return 1; },
  matchMedia: () => ({ matches: false }),
};
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() {}
};
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() {}
};

const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(' '));
try {
  const projectRoot = path.resolve(process.argv[2] ?? '.');
  const rendererUrl = pathToFileURL(path.join(projectRoot, 'src', 'board3d.js'));
  rendererUrl.searchParams.set('runtime-gate', String(Date.now()));
  await import(rendererUrl.href);
  let timestamp = 1_000;
  while (frameQueue.length && timestamp <= 2_000) {
    const callback = frameQueue.shift();
    callback(timestamp);
    timestamp += 300;
  }
} finally {
  console.warn = originalWarn;
}

if (warnings.length) fail(`renderer emitted startup warnings: ${warnings.join(' | ')}`);
if (!window.CROWNFORGE_WEBGL_READY || !htmlClasses.contains('webgl-3d-ready')) {
  fail('renderer did not enter the ready state');
}
if (canvas.dataset.renderer !== 'crownforge-v32-ebony-walnut') {
  fail(`unexpected renderer identity: ${canvas.dataset.renderer}`);
}
if (canvas.dataset.blackMaterial !== 'royal-smoked-ebony') {
  fail('runtime diagnostics lost the smoked-ebony material contract');
}
if (canvas.dataset.boardMaterial !== 'hand-inlaid-maple-walnut') {
  fail('runtime diagnostics lost the premium board material contract');
}
if (canvas.width !== 1080 || canvas.height !== 1080) {
  fail(`high-tier canvas resolution is incorrect: ${canvas.width}x${canvas.height}`);
}
if (gl.shaders.length !== 2 || gl.shaders.some((shader) => !shader.compiled || !shader.source.includes('#version 300 es'))) {
  fail('GLSL ES 3.00 shader lifecycle did not complete');
}
if (gl.uploads < 250) fail(`mesh upload lifecycle is incomplete: ${gl.uploads}`);
if (gl.draws < 200) fail(`board/piece draw lifecycle is incomplete: ${gl.draws}`);
if (gl.depthMasks.length < 2 || gl.depthMasks[0] !== false || gl.depthMasks.at(-1) !== true) {
  fail(`move-highlight depth state was not safely restored: ${gl.depthMasks.join(',')}`);
}
const translucentHighlights = gl.drawLog.filter((draw) =>
  draw.material === 4 && draw.depthMask === false && draw.alpha > 0 && draw.alpha < 1,
);
const opaqueBlackDraws = gl.drawLog.filter((draw) =>
  draw.material === 7 && draw.depthMask === true && draw.alpha === 1,
);
const translucentBlackDraws = gl.drawLog.filter((draw) => draw.material === 7 && draw.alpha !== 1);
if (translucentHighlights.length < 2) {
  fail('under-piece last-move highlights were not rendered as translucent non-depth-writing geometry');
}
if (!opaqueBlackDraws.length || translucentBlackDraws.length) {
  fail('the moved Black piece was not rendered as fully opaque smoked ebony after the highlight layer');
}
const firstHighlightIndex = gl.drawLog.findIndex((draw) => draw.material === 4 && draw.depthMask === false);
const firstBlackIndex = gl.drawLog.findIndex((draw) => draw.material === 7 && draw.depthMask === true);
if (firstHighlightIndex < 0 || firstBlackIndex <= firstHighlightIndex) {
  fail('the moved Black piece did not render after the under-piece highlight layer');
}
if (window.CROWNFORGE_3D_DIAGNOSTICS?.engineAuthoritative !== true ||
    window.CROWNFORGE_3D_DIAGNOSTICS?.hitGrid !== 'fixed-dom-64') {
  fail('runtime diagnostics no longer preserve the engine-authoritative 64-square hit grid');
}
if (cells.length !== 64) fail(`runtime harness did not expose exactly 64 squares: ${cells.length}`);
if (!canvasListeners.has('webglcontextlost')) fail('WebGL context-loss recovery listener is missing');

if (errors.length) {
  for (const error of errors) console.error(`3D runtime verification failure: ${error}`);
  process.exit(1);
}

console.log(
  `Crownforge 3D runtime verification passed: ${cells.length} squares, ${gl.shaders.length} shaders, ` +
  `${gl.uploads} buffer uploads, ${gl.draws} indexed draws, safe move-highlight depth restoration and ` +
  `${opaqueBlackDraws.length} opaque smoked-ebony draws over a moved-Black-piece destination.`,
);
