import {
  buildMeshes,
  buildBoardMeshes,
  translate,
  scale,
  multiply,
  rotateX,
  rotateY,
  boardProjection,
  normal3,
} from "./board3d-meshes.js?v=30";

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
out vec3 vLocal;
void main(){
  vec4 world=M*vec4(p,1.0);
  vP=world.xyz;
  vN=normalize(N*n);
  vLocal=p;
  gl_Position=VP*world;
}`;

  const fragmentShader = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vP;
in vec3 vLocal;
uniform vec3 base;
uniform vec3 emission;
uniform float roughness;
uniform float metallic;
uniform float alpha;
uniform float material;
out vec4 outColor;

const float PI=3.14159265359;

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}

float distributionGGX(vec3 Nn,vec3 H,float r){
  float a=r*r;
  float a2=a*a;
  float nDotH=max(dot(Nn,H),0.0);
  float denominator=nDotH*nDotH*(a2-1.0)+1.0;
  return a2/max(PI*denominator*denominator,0.0001);
}

float geometrySchlick(float nDotV,float r){
  float k=(r+1.0);
  k=(k*k)/8.0;
  return nDotV/max(nDotV*(1.0-k)+k,0.0001);
}

vec3 fresnelSchlick(float cosine,vec3 f0){
  return f0+(1.0-f0)*pow(clamp(1.0-cosine,0.0,1.0),5.0);
}

vec3 evaluateLight(vec3 Nn,vec3 V,vec3 L,vec3 radiance,vec3 albedo,float r,float metal){
  vec3 H=normalize(V+L);
  float nDotL=max(dot(Nn,L),0.0);
  float nDotV=max(dot(Nn,V),0.0);
  float hDotV=max(dot(H,V),0.0);
  vec3 f0=mix(vec3(0.045),albedo,metal);
  vec3 F=fresnelSchlick(hDotV,f0);
  float D=distributionGGX(Nn,H,r);
  float G=geometrySchlick(nDotV,r)*geometrySchlick(nDotL,r);
  vec3 specular=(D*G*F)/max(4.0*nDotV*nDotL,0.0001);
  vec3 diffuse=(1.0-F)*(1.0-metal)*albedo/PI;
  return (diffuse+specular)*radiance*nDotL;
}

vec3 acesToneMap(vec3 color){
  const float a=2.51;
  const float b=0.03;
  const float c=2.43;
  const float d=0.59;
  const float e=0.14;
  return clamp((color*(a*color+b))/(color*(c*color+d)+e),0.0,1.0);
}

void main(){
  if(material>3.5 && material<4.5){
    outColor=vec4(base,alpha);
    return;
  }

  vec3 albedo=base;
  if(material>0.5 && material<3.5){
    float longGrain=sin(vP.x*54.0+sin(vP.y*2.8)*2.2);
    float fineGrain=sin(vP.x*137.0+vP.y*9.0);
    float pores=hash21(floor(vP.xy*48.0));
    float grain=longGrain*.028+fineGrain*.009+(pores-.5)*.014;
    albedo*=1.0+grain;
  }else if(material>5.5 && material<6.5){
    float ivoryVein=sin((vLocal.y+vLocal.x*.24-vLocal.z*.18)*83.0);
    albedo*=1.0+ivoryVein*.012;
  }else if(material>6.5 && material<7.5){
    float ebonyVein=sin((vLocal.y+vLocal.z*.28)*96.0);
    albedo+=vec3(.008,.004,.002)*(ebonyVein*.5+.5);
  }

  vec3 Nn=normalize(vN);
  vec3 V=normalize(vec3(-.08,-.62,1.2));
  vec3 key=normalize(vec3(-.48,-.34,1.0));
  vec3 fill=normalize(vec3(.62,.42,.7));
  vec3 rim=normalize(vec3(-.18,.86,.42));
  float r=clamp(roughness,.075,.92);

  vec3 color=albedo*(.16+.12*max(Nn.z,0.0));
  color+=evaluateLight(Nn,V,key,vec3(2.75,2.3,1.72),albedo,r,metallic);
  color+=evaluateLight(Nn,V,fill,vec3(.48,.58,.78),albedo,min(.98,r+.1),metallic);
  color+=evaluateLight(Nn,V,rim,vec3(.58,.34,.18),albedo,min(.98,r+.18),metallic);

  if(material>5.5 && material<7.5){
    float grounding=.72+.28*smoothstep(.055,.58,vP.z);
    color*=grounding;
  }

  float edge=pow(1.0-max(dot(Nn,V),0.0),3.0);
  color+=emission*(.52+edge*.72);
  color=acesToneMap(color);
  color=pow(color,vec3(1.0/2.2));
  outColor=vec4(color,alpha);
}`;

  const shaderProgram = createProgram(g, vertexShader, fragmentShader);
  const uniforms = {
    model: g.getUniformLocation(shaderProgram, "M"),
    viewProjection: g.getUniformLocation(shaderProgram, "VP"),
    normal: g.getUniformLocation(shaderProgram, "N"),
    base: g.getUniformLocation(shaderProgram, "base"),
    emission: g.getUniformLocation(shaderProgram, "emission"),
    roughness: g.getUniformLocation(shaderProgram, "roughness"),
    metallic: g.getUniformLocation(shaderProgram, "metallic"),
    alpha: g.getUniformLocation(shaderProgram, "alpha"),
    material: g.getUniformLocation(shaderProgram, "material"),
  };

  const quality = selectQualityTier();
  const meshes = buildMeshes(g, quality);
  const boardMeshes = buildBoardMeshes(g, quality);
  const viewProjection = boardProjection();
  const triangleBudget = meshes.metrics.triangles + boardMeshes.metrics.triangles;
  const pixelRatioCap = quality === "high" ? 2 : 1.5;

  canvas.dataset.renderer = "staunton-pbr-oblique";
  canvas.dataset.quality = quality;
  canvas.dataset.meshTriangles = String(triangleBudget);
  window.CROWNFORGE_3D_DIAGNOSTICS = Object.freeze({
    renderer: "staunton-pbr-oblique",
    quality,
    uniqueMeshTriangles: triangleBudget,
    engineAuthoritative: true,
    hitGrid: "fixed-dom-64",
  });

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

    const pixelRatio = Math.min(pixelRatioCap, Math.max(1, window.devicePixelRatio || 1));
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
        translate(position.file - 3.5, position.rank - 3.5, .061),
        scale(piece.type === "Pawn" ? .76 : .94, piece.type === "Pawn" ? .76 : .94, 1),
      );
      for (const part of meshes.Shadow) {
        drawMeshPart(part, multiply(shadowTransform, part.transform), {
          base: [.006, .004, .003],
          emission: [0, 0, 0],
          roughness: 1,
          metallic: 0,
          alpha: state.cinematic ? .42 : .31,
          material: 4,
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
        Pawn: .82,
        Knight: .87,
        Rook: .84,
        Bishop: .84,
        Queen: .86,
        King: .87,
      })[piece.type] || .84;

      const motionLift = position.progress < 1 ? Math.sin(position.progress * Math.PI) * .17 : 0;
      const emphasis = selected ? 1.035 : recent ? 1.012 : 1;
      let pieceTransform = translate(
        position.file - 3.5,
        position.rank - 3.5,
        .064 + motionLift + (selected ? .055 : 0),
      );
      pieceTransform = multiply(pieceTransform, rotateX(Math.PI / 2));
      if (piece.type === "Knight" && piece.side === "Black") {
        pieceTransform = multiply(pieceTransform, rotateY(Math.PI));
      }
      pieceTransform = multiply(
        pieceTransform,
        scale(baseScale * emphasis, baseScale * emphasis, baseScale * emphasis),
      );

      const palette = piecePalette(piece.side, checkedKing, selected || recent, state.cinematic);
      for (const part of meshes[piece.type] || meshes.Pawn) {
        drawMeshPart(part, multiply(pieceTransform, part.transform), piecePartPalette(part.role, palette));
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
    g.uniform3fv(uniforms.emission, palette.emission ?? [0, 0, 0]);
    g.uniform1f(uniforms.roughness, palette.roughness);
    g.uniform1f(uniforms.metallic, palette.metallic ?? 0);
    g.uniform1f(uniforms.alpha, palette.alpha ?? 1);
    g.uniform1f(uniforms.material, palette.material ?? 0);
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
    return {
      base: [.51, .28, .115], emission: [0, 0, 0], roughness: .31,
      metallic: 0, alpha: 1, material: 1,
    };
  }
  if (material === "dark") {
    return {
      base: [.105, .028, .009], emission: [0, 0, 0], roughness: .25,
      metallic: 0, alpha: 1, material: 2,
    };
  }
  if (material === "frame-inner") {
    return {
      base: [.075, .015, .004], emission: [0, 0, 0], roughness: .2,
      metallic: 0, alpha: 1, material: 3,
    };
  }
  if (material === "brass") {
    return {
      base: [.59, .29, .052], emission: [.018, .008, .001], roughness: .16,
      metallic: .82, alpha: 1, material: 5,
    };
  }
  return {
    base: [.135, .034, .009], emission: [0, 0, 0], roughness: .19,
    metallic: 0, alpha: 1, material: 3,
  };
}

function piecePalette(side, checkedKing, emphasized, cinematic) {
  const dim = cinematic ? .68 : 1;
  if (side === "White") {
    return {
      base: [.79 * dim, .59 * dim, .34 * dim],
      emission: checkedKing
        ? [.34, .012, .004]
        : emphasized ? [.095, .052, .012] : [0, 0, 0],
      roughness: .2,
      metallic: .03,
      alpha: 1,
      material: 6,
    };
  }
  return {
    base: [.028 * dim, .012 * dim, .0045 * dim],
    emission: checkedKing
      ? [.34, .009, .003]
      : emphasized ? [.075, .035, .007] : [0, 0, 0],
    roughness: .14,
    metallic: .08,
    alpha: 1,
    material: 7,
  };
}

function piecePartPalette(role, body) {
  if (role === "accent") {
    return {
      base: [.6, .29, .05], emission: [.015, .006, .001], roughness: .14,
      metallic: .86, alpha: 1, material: 5,
    };
  }
  if (role === "eye" || role === "cut") {
    return {
      base: [.002, .0015, .001], emission: [0, 0, 0], roughness: .08,
      metallic: .25, alpha: 1, material: 8,
    };
  }
  if (role === "mane") {
    return {
      ...body,
      base: body.base.map((value) => value * .74),
      roughness: Math.min(1, body.roughness + .08),
    };
  }
  if (role === "muzzle") {
    return { ...body, roughness: Math.min(1, body.roughness + .06) };
  }
  return body;
}

function selectQualityTier() {
  const memory = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return memory >= 6 && cores >= 6 && !reducedMotion ? "high" : "balanced";
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
