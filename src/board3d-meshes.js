const TAU = Math.PI * 2;

export function buildMeshes(gl, quality = "high") {
  const radialSegments = quality === "high" ? 64 : 44;
  const sphereLongitude = quality === "high" ? 36 : 26;
  const sphereLatitude = quality === "high" ? 22 : 16;

  const base = [
    [0, 0], [.245, 0], [.31, .012], [.36, .04], [.377, .074],
    [.365, .103], [.332, .129], [.292, .149], [.286, .177],
    [.258, .205], [.225, .226], [.214, .258],
  ];

  const profiles = {
    Pawn: [
      ...base, [.195, .282], [.177, .326], [.151, .388], [.137, .445],
      [.146, .478], [.188, .498], [.192, .526], [.15, .548], [0, .551],
    ],
    Rook: [
      ...base, [.218, .292], [.205, .38], [.198, .505], [.212, .555],
      [.264, .584], [.276, .622], [.257, .657], [0, .66],
    ],
    Bishop: [
      ...base, [.193, .294], [.162, .369], [.132, .474], [.126, .548],
      [.151, .59], [.211, .615], [.215, .649], [.166, .674], [0, .68],
    ],
    Queen: [
      ...base, [.198, .3], [.164, .386], [.135, .505], [.128, .573],
      [.154, .616], [.222, .646], [.224, .682], [.176, .708],
      [.188, .745], [.17, .779], [0, .782],
    ],
    King: [
      ...base, [.202, .3], [.168, .395], [.138, .522], [.132, .596],
      [.16, .642], [.226, .67], [.229, .707], [.175, .738],
      [.15, .79], [.105, .825], [0, .828],
    ],
  };

  const result = {};
  for (const [name, profile] of Object.entries(profiles)) {
    result[name] = [withRole(lathe(gl, profile, radialSegments), "body")];
  }

  result.Pawn.push(
    withRole(torus(gl, .157, .022, radialSegments, 12, { y: .522 }), "body"),
    withRole(sphere(gl, .158, sphereLongitude, sphereLatitude, { y: .681 }), "body"),
  );

  result.Rook.push(
    withRole(lathe(gl, [
      [0, .635], [.255, .635], [.27, .657], [.278, .72],
      [.294, .75], [.288, .785], [0, .79],
    ], radialSegments), "body"),
    ...rookCrenellations(gl, 6),
  );

  result.Bishop.push(
    withRole(torus(gl, .178, .025, radialSegments, 12, { y: .648 }), "body"),
    withRole(sphere(gl, 1, sphereLongitude, sphereLatitude, {
      y: .805, sy: .205, sx: .137, sz: .137,
    }), "body"),
    withRole(sphere(gl, .057, 20, 12, { y: .99 }), "body"),
    withRole(box(gl, .034, .252, .175, {
      x: .031, y: .835, z: -.035, rz: -.39,
    }), "cut"),
  );

  result.Queen.push(
    withRole(torus(gl, .19, .028, radialSegments, 12, { y: .778 }), "body"),
    withRole(torus(gl, .168, .018, radialSegments, 10, { y: .827 }), "accent"),
    ...queenCrown(gl, .152, .848, 8, sphereLongitude),
    withRole(sphere(gl, .061, 22, 14, { y: .976 }), "accent"),
  );

  result.King.push(
    withRole(torus(gl, .155, .026, radialSegments, 12, { y: .823 }), "body"),
    withRole(sphere(gl, .075, 24, 16, { y: .893 }), "body"),
    withRole(beveledBox(gl, .074, .25, .074, .014, { y: 1.035 }), "accent"),
    withRole(beveledBox(gl, .266, .075, .075, .014, { y: 1.077 }), "accent"),
  );

  result.Knight = [
    withRole(lathe(gl, base, radialSegments), "body"),
    withRole(loft(gl, [
      { y: .242, z: .02, rx: .218, rz: .2 },
      { y: .33, z: .018, rx: .205, rz: .185 },
      { y: .43, z: .012, rx: .184, rz: .17 },
      { y: .54, z: -.006, rx: .164, rz: .157 },
      { y: .65, z: -.052, rx: .15, rz: .15 },
      { y: .755, z: -.126, rx: .158, rz: .16 },
      { y: .835, z: -.195, rx: .151, rz: .151 },
    ], quality === "high" ? 28 : 20), "body"),
    withRole(sphere(gl, 1, sphereLongitude, sphereLatitude, {
      y: .82, z: -.225, sx: .172, sy: .205, sz: .244, rx: -.31,
    }), "body"),
    withRole(sphere(gl, 1, 28, 18, {
      y: .738, z: -.435, sx: .142, sy: .112, sz: .235, rx: -.22,
    }), "body"),
    withRole(sphere(gl, 1, 24, 14, {
      y: .698, z: -.514, sx: .128, sy: .075, sz: .13,
    }), "muzzle"),
    withRole(cone(gl, .068, .235, 18, { x: -.074, y: .93, z: -.15, rx: -.19, rz: .11 }), "body"),
    withRole(cone(gl, .065, .224, 18, { x: .074, y: .925, z: -.145, rx: -.17, rz: -.11 }), "body"),
    ...knightMane(gl),
    withRole(sphere(gl, .024, 14, 10, { x: -.135, y: .84, z: -.376 }), "eye"),
    withRole(sphere(gl, .024, 14, 10, { x: .135, y: .84, z: -.376 }), "eye"),
  ];

  result.Shadow = [withRole(disc(gl, .39, quality === "high" ? 48 : 32), "shadow")];

  Object.defineProperty(result, "metrics", {
    enumerable: false,
    value: meshMetrics(result),
  });
  return result;
}

export function buildBoardMeshes(gl, quality = "high") {
  const parts = [];

  parts.push(
    withMaterial(beveledBox(gl, 7.98, 7.98, .34, .085, { z: -.235 }), "frame"),
    withMaterial(beveledBox(gl, 7.82, 7.82, .18, .045, { z: -.075 }), "frame-inner"),
  );

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      parts.push(withMaterial(beveledBox(gl, .988, .988, .092, .018, {
        x: file - 3.5,
        y: rank - 3.5,
        z: .006,
      }), (file + rank) % 2 ? "light" : "dark"));
    }
  }

  const railZ = .079;
  parts.push(
    withMaterial(beveledBox(gl, 7.9, .092, .105, .018, { y: 3.942, z: railZ }), "frame"),
    withMaterial(beveledBox(gl, 7.9, .092, .105, .018, { y: -3.942, z: railZ }), "frame"),
    withMaterial(beveledBox(gl, .092, 7.72, .105, .018, { x: 3.942, z: railZ }), "frame"),
    withMaterial(beveledBox(gl, .092, 7.72, .105, .018, { x: -3.942, z: railZ }), "frame"),
    withMaterial(box(gl, 7.77, .021, .018, { y: 3.884, z: .137 }), "brass"),
    withMaterial(box(gl, 7.77, .021, .018, { y: -3.884, z: .137 }), "brass"),
    withMaterial(box(gl, .021, 7.74, .018, { x: 3.884, z: .137 }), "brass"),
    withMaterial(box(gl, .021, 7.74, .018, { x: -3.884, z: .137 }), "brass"),
  );

  const studSegments = quality === "high" ? 18 : 12;
  for (const x of [-3.91, 3.91]) {
    for (const y of [-3.91, 3.91]) {
      parts.push(withMaterial(sphere(gl, .033, studSegments, 10, { x, y, z: .15 }), "brass"));
    }
  }

  Object.defineProperty(parts, "metrics", {
    enumerable: false,
    value: meshMetrics({ Board: parts }),
  });
  return parts;
}

function withRole(mesh, role) {
  mesh.role = role;
  return mesh;
}

function withMaterial(mesh, material) {
  mesh.material = material;
  return mesh;
}

function rookCrenellations(gl, count) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * TAU;
    const radius = .205;
    parts.push(withRole(beveledBox(gl, .205, .145, .145, .025, {
      x: Math.sin(angle) * radius,
      y: .847,
      z: Math.cos(angle) * radius,
      ry: angle,
    }), "body"));
  }
  return parts;
}

function queenCrown(gl, radius, y, count, sphereSegments) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * TAU;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    parts.push(
      withRole(cone(gl, .031, .145, 14, { x, y, z, rz: Math.cos(angle) * .08, rx: Math.sin(angle) * .08 }), "body"),
      withRole(sphere(gl, .041, Math.min(18, sphereSegments), 10, { x, y: y + .137, z }), "accent"),
    );
  }
  return parts;
}

function knightMane(gl) {
  const parts = [];
  const points = [
    { y: .47, z: .145, scale: .92 },
    { y: .56, z: .135, scale: .9 },
    { y: .65, z: .105, scale: .84 },
    { y: .74, z: .05, scale: .76 },
    { y: .82, z: -.015, scale: .66 },
  ];
  for (const point of points) {
    parts.push(withRole(cone(gl, .054 * point.scale, .16 * point.scale, 12, {
      y: point.y,
      z: point.z,
      rx: .72,
    }), "mane"));
  }
  return parts;
}

function meshMetrics(collection) {
  let drawParts = 0;
  let triangles = 0;
  for (const parts of Object.values(collection)) {
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      drawParts += 1;
      triangles += part.triangles || 0;
    }
  }
  return Object.freeze({ drawParts, triangles });
}

function upload(gl, positions, normals, indices, transform = identity()) {
  const vao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vao || !positionBuffer || !normalBuffer || !indexBuffer) {
    throw new Error("WebGL mesh allocation failed");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return {
    vao,
    count: indices.length,
    triangles: Math.floor(indices.length / 3),
    transform,
  };
}

function uploadComputed(gl, positions, indices, transform = identity()) {
  const normals = new Array(positions.length).fill(0);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const offset of [ia, ib, ic]) {
      normals[offset] += nx;
      normals[offset + 1] += ny;
      normals[offset + 2] += nz;
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return upload(gl, positions, normals, indices, transform);
}

function lathe(gl, profile, segments = 48, transform = identity()) {
  const positions = [];
  const normals = [];
  const indices = [];
  const stride = segments + 1;

  for (let row = 0; row < profile.length; row += 1) {
    const [radius, y] = profile[row];
    const previous = profile[Math.max(0, row - 1)];
    const next = profile[Math.min(profile.length - 1, row + 1)];
    const dr = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dy, dr) || 1;
    const radialNormal = dy / length;
    const yNormal = -dr / length;

    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * TAU;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      positions.push(radius * cosine, y, radius * sine);
      normals.push(radialNormal * cosine, yNormal, radialNormal * sine);
    }
  }

  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = row * stride + segment;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return upload(gl, positions, normals, indices, transform);
}

function loft(gl, rings, segments = 24) {
  const positions = [];
  const indices = [];
  const stride = segments + 1;

  for (const ring of rings) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * TAU;
      positions.push(
        (ring.x || 0) + Math.cos(angle) * ring.rx,
        ring.y,
        (ring.z || 0) + Math.sin(angle) * ring.rz,
      );
    }
  }

  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = row * stride + segment;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return uploadComputed(gl, positions, indices);
}

function sphere(gl, radius, longitude, latitude, transform = {}) {
  const positions = [];
  const normals = [];
  const indices = [];
  const stride = longitude + 1;

  for (let y = 0; y <= latitude; y += 1) {
    const phi = y / latitude * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let x = 0; x <= longitude; x += 1) {
      const theta = x / longitude * TAU;
      const nx = Math.cos(theta) * sinPhi;
      const nz = Math.sin(theta) * sinPhi;
      positions.push(nx * radius, cosPhi * radius, nz * radius);
      normals.push(nx, cosPhi, nz);
    }
  }

  for (let y = 0; y < latitude; y += 1) {
    for (let x = 0; x < longitude; x += 1) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return upload(gl, positions, normals, indices, composeTransform(transform));
}

function torus(gl, majorRadius, minorRadius, majorSegments, minorSegments, transform = {}) {
  const positions = [];
  const normals = [];
  const indices = [];
  const stride = minorSegments + 1;

  for (let major = 0; major <= majorSegments; major += 1) {
    const u = major / majorSegments * TAU;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let minor = 0; minor <= minorSegments; minor += 1) {
      const v = minor / minorSegments * TAU;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const radius = majorRadius + minorRadius * cv;
      positions.push(radius * cu, minorRadius * sv, radius * su);
      normals.push(cv * cu, sv, cv * su);
    }
  }

  for (let major = 0; major < majorSegments; major += 1) {
    for (let minor = 0; minor < minorSegments; minor += 1) {
      const a = major * stride + minor;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return upload(gl, positions, normals, indices, composeTransform(transform));
}

function disc(gl, radius, segments) {
  const positions = [0, 0, 0];
  const normals = [0, 0, 1];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * TAU;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    normals.push(0, 0, 1);
  }
  for (let index = 1; index <= segments; index += 1) {
    indices.push(0, index, index + 1);
  }
  return upload(gl, positions, normals, indices);
}

function cone(gl, radius, height, segments, transform = {}) {
  return lathe(gl, [
    [0, 0], [radius, 0], [radius * .96, height * .08],
    [radius * .36, height * .82], [0, height],
  ], segments, composeTransform(transform));
}

function box(gl, width, height, depth, transform = {}) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const positions = [
    -x,-y,z, x,-y,z, x,y,z, -x,y,z,
    x,-y,-z, -x,-y,-z, -x,y,-z, x,y,-z,
    -x,y,z, x,y,z, x,y,-z, -x,y,-z,
    -x,-y,-z, x,-y,-z, x,-y,z, -x,-y,z,
    x,-y,z, x,-y,-z, x,y,-z, x,y,z,
    -x,-y,-z, -x,-y,z, -x,y,z, -x,y,-z,
  ];
  const normals = [
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ];
  const indices = [];
  for (let face = 0; face < 6; face += 1) {
    const offset = face * 4;
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  return upload(gl, positions, normals, indices, composeTransform(transform));
}

function beveledBox(gl, width, height, depth, bevel, transform = {}) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const b = Math.max(0, Math.min(bevel, x * .45, y * .45, z * .45));
  if (b === 0) return box(gl, width, height, depth, transform);

  const positions = [];
  const indices = [];
  const rings = [
    { z: -z, x: x - b, y: y - b },
    { z: -z + b, x, y },
    { z: z - b, x, y },
    { z, x: x - b, y: y - b },
  ];
  const corners = [[-1,-1], [1,-1], [1,1], [-1,1]];

  for (const ring of rings) {
    for (const [sx, sy] of corners) positions.push(sx * ring.x, sy * ring.y, ring.z);
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const current = ring * 4;
    const next = current + 4;
    for (let side = 0; side < 4; side += 1) {
      const following = (side + 1) % 4;
      indices.push(current + side, next + side, current + following);
      indices.push(current + following, next + side, next + following);
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const top = (rings.length - 1) * 4;
  indices.push(top, top + 1, top + 2, top, top + 2, top + 3);
  return uploadComputed(gl, positions, indices, composeTransform(transform));
}

function composeTransform(transform) {
  let result = translate(transform.x || 0, transform.y || 0, transform.z || 0);
  if (transform.rz) result = multiply(result, rotateZ(transform.rz));
  if (transform.ry) result = multiply(result, rotateY(transform.ry));
  if (transform.rx) result = multiply(result, rotateX(transform.rx));
  if (transform.sx || transform.sy || transform.sz) {
    result = multiply(result, scale(transform.sx || 1, transform.sy || 1, transform.sz || 1));
  }
  return result;
}

export function identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

export function translate(x, y, z) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
}

export function scale(x, y, z) {
  return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]);
}

export function rotateX(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    1,0,0,0,
    0,cosine,sine,0,
    0,-sine,cosine,0,
    0,0,0,1,
  ]);
}

export function rotateY(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    cosine,0,-sine,0,
    0,1,0,0,
    sine,0,cosine,0,
    0,0,0,1,
  ]);
}

export function rotateZ(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    cosine,sine,0,0,
    -sine,cosine,0,0,
    0,0,1,0,
    0,0,0,1,
  ]);
}

export function multiply(a, b) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += a[index * 4 + row] * b[column * 4 + index];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

export function boardProjection() {
  return new Float32Array([
    .25, 0, 0, 0,
    0, .25, .078, 0,
    .012, .09, -.17, 0,
    0, 0, 0, 1,
  ]);
}

export function normal3(matrix) {
  const x = Math.hypot(matrix[0], matrix[1], matrix[2]) || 1;
  const y = Math.hypot(matrix[4], matrix[5], matrix[6]) || 1;
  const z = Math.hypot(matrix[8], matrix[9], matrix[10]) || 1;
  return new Float32Array([
    matrix[0] / x / x, matrix[1] / x / x, matrix[2] / x / x,
    matrix[4] / y / y, matrix[5] / y / y, matrix[6] / y / y,
    matrix[8] / z / z, matrix[9] / z / z, matrix[10] / z / z,
  ]);
}
