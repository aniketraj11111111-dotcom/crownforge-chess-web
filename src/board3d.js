import {
  buildMeshes,
  buildBoardMeshes,
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
uniform float alpha;
uniform float material;
uniform float glow;
out vec4 outColor;
float hash(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
void main(){
  vec3 normal=normalize(vN);
  vec3 keyDirection=normalize(vec3(-0.52,0.78,1.18));
  vec3 fillDirection=normalize(vec3(0.72,-0.18,0.82));
  vec3 rimDirection=normalize(vec3(0.12,0.48,-1.0));
  vec3 viewDirection=vec3(0.0,0.0,1.0);
  vec3 halfDirection=normalize(keyDirection+viewDirection);
  float key=max(dot(normal,keyDirection),0.0);
  float fill=max(dot(normal,fillDirection),0.0);
  float rim=max(dot(normal,rimDirection),0.0);
  float specular=pow(max(dot(normal,halfDirection),0.0),mix(16.0,72.0,gloss));
  float fresnel=pow(1.0-max(dot(normal,viewDirection),0.0),2.4);
  vec3 adjustedBase=base;
  if(material>0.5 && material<3.5){
    float grain=sin(vP.x*37.0+sin(vP.y*8.0))*0.018+hash(floor(vP.xy*18.0))*0.012;
    adjustedBase*=1.0+grain;
  }
  vec3 color=adjustedBase*(0.27+0.68*key+0.16*fill)+shine*(specular*(0.18+0.82*gloss)+0.07*fresnel+0.035*rim);
  color+=shine*glow*(0.13+0.22*fresnel);
  if(material>3.5){
    color=base;
  }
  outColor=vec4(color,alpha);
}`;

  const shaderProgram = createProgram(g, vertexShader, fragmentShader);
  const uniforms = {
    model: g.getUniformLocation(shaderProgram, "M"),
    viewProjection: g.getUniformLocation(shaderProgram, "VP"),
    normal: g.getUniformLocation(shaderProgram, "N"),
    base: g.getUniformLocation(shaderProgram, "base"),
    shine: g.getUniformLocation(shaderProgram, "shine"),
    gloss: g.getUniformLocation(shaderProgram, "gloss"),
    alpha: g.getUniformLocation(shaderProgram, "alpha"),
    material: g.getUniformLocation(shaderProgram, "material"),
    glow: g.getUniformLocation(shaderProgram, "glow"),
  };

  const meshes = buildMeshes(g);
  const boardMeshes = buildBoardMeshes(g);
  const viewProjection = ortho(-4, 4, -4, 4, -8, 8);

  let lastStateKey = "";
  let lastMoveAnimationKey = "";
  let moveAnimation = null;
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
    let lastMoveFrom = null;
    let lastMoveTo = null;
    let selectedSquare = null;

    for (const cell of board.querySelectorAll(".square[data-square]")) {
      const square = cell.dataset.square;
      const pieceElement = cell.querySelector(".piece");

      if (cell.classList.contains("last-from")) lastMoveFrom = square;
      if (cell.classList.contains("last-to")) lastMoveTo = square;
      if (cell.classList.contains("selected")) selectedSquare = square;
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

    return {
      pieces,
      lastMoveFrom,
      lastMoveTo,
      selectedSquare,
      checkedSide: board.dataset.check === "true"
        ? (board.dataset.turn === "white" ? "White" : "Black")
        : null,
      cinematic: document.body.classList.contains("terminal-strike") || document.body.classList.contains("cinematic"),
    };
  }

  function beginMoveAnimation(state, now) {
    if (!state.lastMoveFrom || !state.lastMoveTo) return;
    const key = `${state.lastMoveFrom}-${state.lastMoveTo}`;
    if (key === lastMoveAnimationKey) return;

    lastMoveAnimationKey = key;
    moveAnimation = {
      fromFile: state.lastMoveFrom.charCodeAt(0) - 97,
      fromRank: Number(state.lastMoveFrom[1]) - 1,
      toSquare: state.lastMoveTo,
      startedAt: now,
      duration: 255,
    };
  }

  function draw(timestamp = performance.now()) {
    frameQueued = false;

    if (!syncCanvasToBoard()) {
      window.requestAnimationFrame(scheduleDraw);
      return;
    }

    const state = readBoardState();
    if (!state.pieces.length) return;

    const stateKey = JSON.stringify(state);
    if (stateKey !== lastStateKey) {
      beginMoveAnimation(state, timestamp);
      lastStateKey = stateKey;
    } else if (!moveAnimation && renderedLayoutVersion === layoutVersion) {
      verifyReadyAlignment();
      return;
    }

    renderedLayoutVersion = layoutVersion;

    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.useProgram(shaderProgram);
    g.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);

    drawBoard();
    drawShadows(state, timestamp);
    drawPieces(state, timestamp);

    g.bindVertexArray(null);
    verifyReadyAlignment();

    if (moveAnimation) scheduleDraw();
  }

  function drawBoard() {
    for (const part of boardMeshes) {
      const palette = boardPalette(part.material);
      drawMeshPart(part, part.transform, palette);
    }
  }

  function drawShadows(state, timestamp) {
    for (const piece of state.pieces) {
      const position = animatedPosition(piece, timestamp);
      const shadowTransform = multiply(
        translate(position.file - 3.5, position.rank - 3.79, .055),
        scale(piece.type === "Pawn" ? .72 : .9, .9, .9),
      );
      for (const part of meshes.Shadow) {
        drawMeshPart(part, multiply(shadowTransform, part.transform), {
          base: [0.012, 0.009, 0.007],
          shine: [0, 0, 0],
          gloss: 0,
          alpha: state.cinematic ? .36 : .24,
          material: 4,
          glow: 0,
        });
      }
    }
  }

  function drawPieces(state, timestamp) {
    for (const piece of state.pieces) {
      const position = animatedPosition(piece, timestamp);
      const selected = state.selectedSquare === piece.square;
      const checkedKing = state.checkedSide === piece.side && piece.type === "King";
      const recent = state.lastMoveTo === piece.square;

      const baseScale = ({
        Pawn: .71,
        Knight: .80,
        Rook: .75,
        Bishop: .78,
        Queen: .81,
        King: .83,
      })[piece.type] || .76;

      const motionLift = position.progress < 1 ? Math.sin(position.progress * Math.PI) * .065 : 0;
      const emphasis = selected ? 1.055 : recent ? 1.018 : 1;
      const pieceTransform = multiply(
        translate(
          position.file - 3.5,
          position.rank - 3.85 + motionLift,
          .10 + (selected ? .04 : 0),
        ),
        scale(baseScale * emphasis, baseScale * emphasis, baseScale * emphasis),
      );

      const palette = piecePalette(piece.side, checkedKing, selected || recent, state.cinematic);
      for (const part of meshes[piece.type] || meshes.Pawn) {
        drawMeshPart(part, multiply(pieceTransform, part.transform), palette);
      }
    }
  }

  function animatedPosition(piece, timestamp) {
    if (!moveAnimation || piece.square !== moveAnimation.toSquare) {
      return { file: piece.file, rank: piece.rank, progress: 1 };
    }

    const raw = Math.min(1, Math.max(0, (timestamp - moveAnimation.startedAt) / moveAnimation.duration));
    const eased = 1 - Math.pow(1 - raw, 3);
    const position = {
      file: moveAnimation.fromFile + (piece.file - moveAnimation.fromFile) * eased,
      rank: moveAnimation.fromRank + (piece.rank - moveAnimation.fromRank) * eased,
      progress: raw,
    };

    if (raw >= 1) moveAnimation = null;
    return position;
  }

  function drawMeshPart(part, model, palette) {
    g.uniformMatrix4fv(uniforms.model, false, model);
    g.uniformMatrix3fv(uniforms.normal, false, normal3(model));
    g.uniform3fv(uniforms.base, palette.base);
    g.uniform3fv(uniforms.shine, palette.shine);
    g.uniform1f(uniforms.gloss, palette.gloss);
    g.uniform1f(uniforms.alpha, palette.alpha ?? 1);
    g.uniform1f(uniforms.material, palette.material ?? 0);
    g.uniform1f(uniforms.glow, palette.glow ?? 0);
    g.bindVertexArray(part.vao);
    g.drawElements(g.TRIANGLES, part.count, g.UNSIGNED_SHORT, 0);
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
    attributeFilter: ["class", "hidden", "data-geometry-locked", "data-check", "data-turn"],
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

function boardPalette(material) {
  if (material === "light") {
    return { base: [.70, .48, .25], shine: [1.0, .86, .55], gloss: .44, alpha: 1, material: 1, glow: 0 };
  }
  if (material === "dark") {
    return { base: [.20, .085, .035], shine: [.66, .34, .14], gloss: .56, alpha: 1, material: 2, glow: 0 };
  }
  return { base: [.115, .045, .018], shine: [.82, .48, .19], gloss: .68, alpha: 1, material: 3, glow: 0 };
}

function piecePalette(side, checkedKing, emphasized, cinematic) {
  const dim = cinematic ? .72 : 1;
  if (side === "White") {
    return {
      base: [.90 * dim, .78 * dim, .56 * dim],
      shine: [1.0, .98, .86],
      gloss: .74,
      alpha: 1,
      material: 0,
      glow: checkedKing ? .95 : emphasized ? .34 : 0,
    };
  }
  return {
    base: [.052 * dim, .036 * dim, .025 * dim],
    shine: [.58, .34, .17],
    gloss: .9,
    alpha: 1,
    material: 0,
    glow: checkedKing ? .95 : emphasized ? .30 : 0,
  };
}

function pieceTypeFromGlyph(glyph) {
  return ({
    "♙": "Pawn", "♟": "Pawn",
    "♖": "Rook", "♜": "Rook",
    "♘": "Knight", "♞": "Knight",
    "♗": "Bishop", "♝": "Bishop",
    "♕": "Queen", "♛": "Queen",
    "♔": "King", "♚": "King",
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
