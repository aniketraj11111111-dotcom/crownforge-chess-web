export function buildMeshes(gl) {
  const base = [
    [.355, 0], [.372, .035], [.36, .075], [.325, .11], [.285, .145],
    [.245, .19], [.218, .235], [.205, .285],
  ];

  const profiles = {
    Pawn: [...base, [.175, .335], [.142, .405], [.112, .495], [.15, .555], [.112, .595], [0, .61]],
    Rook: [...base, [.205, .34], [.19, .48], [.185, .57], [.235, .625], [.248, .69], [0, .705]],
    Bishop: [...base, [.17, .355], [.135, .49], [.112, .595], [.17, .655], [.125, .72], [.082, .805], [0, .835]],
    Queen: [...base, [.18, .36], [.142, .50], [.12, .59], [.195, .65], [.16, .715], [.205, .765], [.13, .815], [0, .835]],
    King: [...base, [.185, .36], [.145, .51], [.122, .61], [.205, .67], [.155, .735], [.095, .79], [0, .81]],
  };

  const result = {};
  for (const [name, profile] of Object.entries(profiles)) {
    result[name] = [lathe(gl, profile, 40)];
  }

  result.Pawn.push(
    sphere(gl, .145, 24, 14, { y: .742 }),
    torus(gl, .142, .024, 28, 8, { y: .615 }),
  );

  result.Bishop.push(
    sphere(gl, .112, 24, 14, { y: .91 }),
    box(gl, .032, .205, .145, { x: .03, y: .91, z: .005, rz: -.34 }),
  );

  result.Queen.push(
    torus(gl, .16, .026, 30, 8, { y: .858 }),
    sphere(gl, .075, 20, 12, { y: .93 }),
    ...crownOrbs(gl, .145, .885, .038, 8),
  );

  result.Rook.push(
    box(gl, .48, .105, .48, { y: .752 }),
    box(gl, .15, .13, .15, { x: .17, y: .862, z: .17 }),
    box(gl, .15, .13, .15, { x: -.17, y: .862, z: .17 }),
    box(gl, .15, .13, .15, { x: .17, y: .862, z: -.17 }),
    box(gl, .15, .13, .15, { x: -.17, y: .862, z: -.17 }),
  );

  result.King.push(
    torus(gl, .11, .024, 26, 8, { y: .85 }),
    sphere(gl, .068, 18, 10, { y: .885 }),
    box(gl, .072, .245, .072, { y: 1.005 }),
    box(gl, .255, .072, .072, { y: 1.045 }),
  );

  result.Knight = [
    lathe(gl, base, 40),
    extrude(gl, [
      [-.245, .285], [.16, .285], [.205, .34], [.155, .41], [.115, .48],
      [.205, .56], [.19, .64], [.135, .72], [.085, .82], [.015, .91],
      [-.055, .935], [-.12, .885], [-.17, .80], [-.185, .70], [-.145, .63],
      [-.205, .57], [-.182, .485], [-.252, .41],
    ], .27),
    sphere(gl, .034, 12, 8, { x: .052, y: .79, z: .144 }),
    box(gl, .048, .145, .052, { x: -.018, y: .943, z: .075, rz: -.16 }),
    box(gl, .048, .14, .052, { x: -.082, y: .92, z: -.065, rz: .18 }),
  ];

  const shadow = sphere(gl, .34, 24, 10);
  shadow.transform = scale(1, .22, .075);
  result.Shadow = [shadow];

  return result;
}

export function buildBoardMeshes(gl) {
  const parts = [];

  parts.push({
    ...box(gl, 7.98, 7.98, .28, { z: -.19 }),
    material: "frame",
  });

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      parts.push({
        ...box(gl, .982, .982, .095, {
          x: file - 3.5,
          y: rank - 3.5,
          z: -.035,
        }),
        material: (file + rank) % 2 ? "light" : "dark",
      });
    }
  }

  const railDepth = .15;
  const railZ = .045;
  parts.push(
    { ...box(gl, 7.98, .14, railDepth, { y: 3.93, z: railZ }), material: "frame" },
    { ...box(gl, 7.98, .14, railDepth, { y: -3.93, z: railZ }), material: "frame" },
    { ...box(gl, .14, 7.72, railDepth, { x: 3.93, z: railZ }), material: "frame" },
    { ...box(gl, .14, 7.72, railDepth, { x: -3.93, z: railZ }), material: "frame" },
  );

  return parts;
}

function crownOrbs(gl, radius, y, size, count) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    parts.push(sphere(gl, size, 14, 8, {
      x: Math.cos(angle) * radius,
      y: y + (index % 2) * .015,
      z: Math.sin(angle) * radius,
    }));
  }
  return parts;
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

  return { vao, count: indices.length, transform };
}

function lathe(gl, profile, segments = 36) {
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
      const angle = segment / segments * Math.PI * 2;
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

  return upload(gl, positions, normals, indices);
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
      const theta = x / longitude * Math.PI * 2;
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
    const u = major / majorSegments * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let minor = 0; minor <= minorSegments; minor += 1) {
      const v = minor / minorSegments * Math.PI * 2;
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

function extrude(gl, points, depth) {
  const positions = [];
  const normals = [];
  const indices = [];
  const z = depth / 2;
  const length = points.length;

  for (const side of [z, -z]) {
    for (const [x, y] of points) {
      positions.push(x, y, side);
      normals.push(0, 0, side > 0 ? 1 : -1);
    }
  }

  for (let index = 1; index < length - 1; index += 1) {
    indices.push(0, index, index + 1, length, length + index + 1, length + index);
  }

  for (let index = 0; index < length; index += 1) {
    const nextIndex = (index + 1) % length;
    const [x1, y1] = points[index];
    const [x2, y2] = points[nextIndex];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const edgeLength = Math.hypot(dx, dy) || 1;
    const nx = dy / edgeLength;
    const ny = -dx / edgeLength;
    const offset = positions.length / 3;

    positions.push(x1,y1,z, x2,y2,z, x2,y2,-z, x1,y1,-z);
    for (let vertex = 0; vertex < 4; vertex += 1) normals.push(nx, ny, 0);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  return upload(gl, positions, normals, indices);
}

function composeTransform(transform) {
  let result = translate(transform.x || 0, transform.y || 0, transform.z || 0);
  if (transform.rz) result = multiply(result, rotateZ(transform.rz));
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

export function ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return new Float32Array([
    -2 * lr,0,0,0,
    0,-2 * bt,0,0,
    0,0,2 * nf,0,
    (left + right) * lr,(top + bottom) * bt,(far + near) * nf,1,
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
