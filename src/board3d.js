import {
  buildMeshes,
  translate,
  scale,
  multiply,
  ortho,
  normal3,
} from "./board3d-meshes.js";

const canvas = document.querySelector("#board-3d");
const board = document.querySelector("#board");
const stage = document.querySelector(".board-stage");

if (!canvas || !board || !stage) {
  throw new Error("Crownforge WebGL elements missing");
}

const gl = canvas.getContext("webgl2", {
  alpha: true,
  antialias: true,
  depth: true,
  premultipliedAlpha: true,
  powerPreference: "high-performance",
});

if (!gl) {
  activateFallback("webgl2-unavailable");
} else {
  try {
    start(gl);
  } catch (error) {
    console.warn("Crownforge WebGL disabled", error);
    activateFallback("webgl-startup-failed");
  }
}

function activateFallback(reason) {
  document.documentElement.classList.remove("webgl-3d-ready");
  document.documentElement.classList.add("webgl-3d-unavailable");
  canvas.dataset.ready = "false";
  canvas.dataset.aligned = "false";
  canvas.dataset.fallbackReason = reason;
  window.CROWNFORGE_WEBGL_READY = false;
}

function start(g) {
  const vertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec3 p;
layout(location=1) in vec3 n;
uniform mat4 M;
uniform mat4 VP;
uniform mat3 N;
out vec3 vN;
out vec3 vP;
void main(){
  vec4 world=M*vec4(p,1.0);
  vP=world.xyz;
  vN=normalize(N*n);
  gl_Position=VP*world;
}`;

  const fragmentShader = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vP;
uniform vec3 base;
uniform vec3 shine;
uniform float gloss;
out vec4 outColor;
void main(){
  vec3 normal=normalize(vN);
  vec3 lightDirection=normalize(vec3(-0.48,0.72,1.15));
  vec3 viewDirection=vec3(0.0,0.0,1.0);
  vec3 halfDirection=normalize(lightDirection+viewDirection);
  float diffuse=max(dot(normal,lightDirection),0.0);
  float specular=pow(max(dot(normal,halfDirection),0.0),mix(18.0,58.0,gloss));
  float rim=pow(1.0-max(dot(normal,viewDirection),0.0),2.2);
  vec3 color=base*(0.34+0.72*diffuse)+shine*(specular*(0.25+0.55*gloss)+0.08*rim);
  outColor=vec4(color,1.0);
}`;

  const shaderProgram = createProgram(g, vertexShader, fragmentShader);
  const uniforms = {
    model: g.getUniformLocation(shaderProgram, "M"),
    viewProjection: g.getUniformLocation(shaderProgram, "VP"),
    normal: g.getUniformLocation(shaderProgram, "N"),
    base: g.getUniformLocation(shaderProgram, "base"),
    shine: g.getUniformLocation(shaderProgram, "shine"),
    gloss: g.getUniformLocation(shaderProgram, "gloss"),
  };
  const meshes = buildMeshes(g);
  const viewProjection = ortho(-4, 4, -4, 4, -8, 8);

  let lastStateKey = "";
  let layoutVersion = 0;
  let renderedLayoutVersion = -1;
  let frameQueued = false;

  g.enable(g.DEPTH_TEST);
  g.depthFunc(g.LEQUAL);
  g.enable(g.BLEND);
  g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
  g.clearColor(0, 0, 0, 0);

  function syncCanvasToBoard() {
    if (board.dataset.geometryLocked !== "true") return false;

    const width = board.offsetWidth;
    const height = board.offsetHeight;
    const left = board.offsetLeft;
    const top = board.offsetTop;

    if (!(width > 0 && height > 0)) return false;

    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const bufferWidth = Math.round(width * pixelRatio);
    const bufferHeight = Math.round(height * pixelRatio);

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      g.viewport(0, 0, bufferWidth, bufferHeight);
      layoutVersion += 1;
    }

    const boardRect = board.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const tolerance = 1.25;
    const aligned =
      Math.abs(boardRect.left - canvasRect.left) <= tolerance &&
      Math.abs(boardRect.top - canvasRect.top) <= tolerance &&
      Math.abs(boardRect.width - canvasRect.width) <= tolerance &&
      Math.abs(boardRect.height - canvasRect.height) <= tolerance;

    canvas.dataset.geometryLocked = "true";
    canvas.dataset.aligned = aligned ? "true" : "false";

    if (!aligned) {
      document.documentElement.classList.remove("webgl-3d-ready");
      window.CROWNFORGE_WEBGL_READY = false;
    }

    return aligned;
  }

  function readBoardState() {
    const pieces = [];
    let lastMoveDestination = null;

    for (const cell of board.querySelectorAll(".square[data-square]")) {
      const square = cell.dataset.square;
      const pieceElement = cell.querySelector(".piece");

      if (cell.classList.contains("last-to")) lastMoveDestination = square;
      if (!square || !pieceElement || pieceElement.hidden || !pieceElement.textContent) continue;

      const type = pieceTypeFromGlyph(pieceElement.textContent.trim());
      if (!type) continue;

      pieces.push({
        square,
        file: square.charCodeAt(0) - 97,
        rank: Number(square[1]) - 1,
        type,
        side: pieceElement.classList.contains("white") ? "White" : "Black",
      });
    }

    return { pieces, lastMoveDestination };
  }

  function draw() {
    frameQueued = false;

    if (!syncCanvasToBoard()) {
      window.requestAnimationFrame(scheduleDraw);
      return;
    }

    const state = readBoardState();
    if (!state.pieces.length) return;

    const stateKey = JSON.stringify(state);
    if (stateKey === lastStateKey && renderedLayoutVersion === layoutVersion) {
      verifyReadyAlignment();
      return;
    }

    lastStateKey = stateKey;
    renderedLayoutVersion = layoutVersion;

    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.useProgram(shaderProgram);
    g.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);

    for (const piece of state.pieces) {
      const pieceScale = ({
        Pawn: 0.73,
        Knight: 0.82,
        Rook: 0.78,
        Bishop: 0.80,
        Queen: 0.83,
        King: 0.85,
      })[piece.type] || 0.78;

      const pieceTransform = multiply(
        translate(
          piece.file - 3.5,
          piece.rank - 3.85,
          state.lastMoveDestination === piece.square ? 0.08 : 0,
        ),
        scale(pieceScale, pieceScale, pieceScale),
      );

      const palette = piece.side === "White"
        ? [[0.88, 0.77, 0.55], [1.0, 0.96, 0.82], 0.72]
        : [[0.055, 0.042, 0.032], [0.48, 0.34, 0.20], 0.88];

      for (const part of meshes[piece.type] || meshes.Pawn) {
        const model = multiply(pieceTransform, part.transform);
        g.uniformMatrix4fv(uniforms.model, false, model);
        g.uniformMatrix3fv(uniforms.normal, false, normal3(model));
        g.uniform3fv(uniforms.base, palette[0]);
        g.uniform3fv(uniforms.shine, palette[1]);
        g.uniform1f(uniforms.gloss, palette[2]);
        g.bindVertexArray(part.vao);
        g.drawElements(g.TRIANGLES, part.count, g.UNSIGNED_SHORT, 0);
      }
    }

    g.bindVertexArray(null);
    verifyReadyAlignment();
  }

  function verifyReadyAlignment() {
    if (!syncCanvasToBoard()) return;

    const boardRect = board.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const tolerance = 1.25;
    const aligned =
      Math.abs(boardRect.left - canvasRect.left) <= tolerance &&
      Math.abs(boardRect.top - canvasRect.top) <= tolerance &&
      Math.abs(boardRect.width - canvasRect.width) <= tolerance &&
      Math.abs(boardRect.height - canvasRect.height) <= tolerance;

    if (!aligned) {
      document.documentElement.classList.remove("webgl-3d-ready");
      canvas.dataset.ready = "false";
      canvas.dataset.aligned = "false";
      window.CROWNFORGE_WEBGL_READY = false;
      return;
    }

    document.documentElement.classList.remove("webgl-3d-unavailable");
    document.documentElement.classList.add("webgl-3d-ready");
    canvas.dataset.ready = "true";
    canvas.dataset.aligned = "true";
    window.CROWNFORGE_WEBGL_READY = true;
  }

  function scheduleDraw() {
    if (frameQueued) return;
    frameQueued = true;
    window.requestAnimationFrame(draw);
  }

  const mutationObserver = new MutationObserver(scheduleDraw);
  mutationObserver.observe(board, {
    attributes: true,
    attributeFilter: ["class", "hidden", "data-geometry-locked"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  const resizeObserver = new ResizeObserver(() => {
    layoutVersion += 1;
    scheduleDraw();
  });
  resizeObserver.observe(board);
  resizeObserver.observe(stage);

  window.addEventListener("resize", () => {
    layoutVersion += 1;
    scheduleDraw();
  }, { passive: true });

  window.addEventListener("orientationchange", () => {
    layoutVersion += 1;
    window.setTimeout(scheduleDraw, 120);
  }, { passive: true });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      layoutVersion += 1;
      scheduleDraw();
    });
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    activateFallback("webgl-context-lost");
  });

  scheduleDraw();
}

function pieceTypeFromGlyph(glyph) {
  return ({
    "♙": "Pawn",
    "♟": "Pawn",
    "♖": "Rook",
    "♜": "Rook",
    "♘": "Knight",
    "♞": "Knight",
    "♗": "Bishop",
    "♝": "Bishop",
    "♕": "Queen",
    "♛": "Queen",
    "♔": "King",
    "♚": "King",
  })[glyph];
}

function compileShader(g, type, source) {
  const shader = g.createShader(type);
  g.shaderSource(shader, source);
  g.compileShader(shader);
  if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) {
    throw new Error(g.getShaderInfoLog(shader) || "shader compilation failed");
  }
  return shader;
}

function createProgram(g, vertexSource, fragmentSource) {
  const shaderProgram = g.createProgram();
  const vertex = compileShader(g, g.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(g, g.FRAGMENT_SHADER, fragmentSource);
  g.attachShader(shaderProgram, vertex);
  g.attachShader(shaderProgram, fragment);
  g.linkProgram(shaderProgram);
  if (!g.getProgramParameter(shaderProgram, g.LINK_STATUS)) {
    throw new Error(g.getProgramInfoLog(shaderProgram) || "shader linking failed");
  }
  g.deleteShader(vertex);
  g.deleteShader(fragment);
  return shaderProgram;
}
