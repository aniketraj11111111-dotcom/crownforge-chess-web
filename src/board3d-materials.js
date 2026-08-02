const scaleColor = (color, multiplier) => color.map((value) => value * multiplier);

export const CROWNFORGE_VISUAL_CONTRACT = Object.freeze({
  release: "v32",
  blackMaterial: "royal-smoked-ebony",
  whiteMaterial: "champagne-ivory",
  boardMaterial: "hand-inlaid-maple-walnut",
  moveHighlightLayer: "below-piece-mesh",
});

export function boardPalette(material) {
  if (material === "light") {
    return {
      base: [.58, .405, .205], emission: [0, 0, 0], roughness: .34,
      metallic: 0, alpha: 1, material: 1,
    };
  }
  if (material === "dark") {
    return {
      base: [.185, .061, .017], emission: [0, 0, 0], roughness: .3,
      metallic: 0, alpha: 1, material: 2,
    };
  }
  if (material === "frame-inner" || material === "frame-bed") {
    return {
      base: [.058, .012, .0036], emission: [0, 0, 0], roughness: .27,
      metallic: 0, alpha: 1, material: 3,
    };
  }
  if (material === "brass" || material === "brass-soft") {
    return {
      base: material === "brass" ? [.58, .285, .048] : [.42, .17, .025],
      emission: material === "brass" ? [.016, .0065, .001] : [.008, .0025, 0],
      roughness: material === "brass" ? .18 : .25,
      metallic: material === "brass" ? .84 : .72,
      alpha: 1,
      material: 5,
    };
  }
  return {
    base: [.155, .041, .011], emission: [0, 0, 0], roughness: .24,
    metallic: 0, alpha: 1, material: 3,
  };
}

export function piecePalette(side, checkedKing, emphasized, cinematic) {
  const dim = cinematic ? .7 : 1;
  if (side === "White") {
    return {
      base: [.81 * dim, .625 * dim, .365 * dim],
      emission: checkedKing
        ? [.34, .012, .004]
        : emphasized ? [.082, .043, .009] : [0, 0, 0],
      roughness: .24,
      metallic: .018,
      alpha: 1,
      material: 6,
    };
  }
  return {
    base: [.072 * dim, .025 * dim, .0095 * dim],
    emission: checkedKing
      ? [.34, .009, .003]
      : emphasized ? [.052, .024, .006] : [0, 0, 0],
    roughness: .285,
    metallic: .018,
    alpha: 1,
    material: 7,
  };
}

export function piecePartPalette(role, body) {
  const blackBody = body.material === 7;

  if (role === "accent") {
    return {
      base: [.6, .29, .05], emission: [.015, .006, .001], roughness: .16,
      metallic: .86, alpha: 1, material: 5,
    };
  }
  if (role === "eye") {
    return {
      base: [.0015, .001, .0008], emission: [0, 0, 0], roughness: .12,
      metallic: .12, alpha: 1, material: 8,
    };
  }
  if (role === "cut") {
    return blackBody
      ? {
          base: [.118, .048, .014], emission: [.0035, .0014, .0003], roughness: .33,
          metallic: 0, alpha: 1, material: 7,
        }
      : {
          base: [.004, .0025, .0015], emission: [0, 0, 0], roughness: .16,
          metallic: .08, alpha: 1, material: 8,
        };
  }
  if (role === "collar") {
    return {
      ...body,
      base: scaleColor(body.base, blackBody ? 1.22 : .94),
      roughness: Math.min(1, body.roughness + .075),
    };
  }
  if (role === "battlement") {
    return {
      ...body,
      base: scaleColor(body.base, blackBody ? 1.16 : .96),
      roughness: Math.min(1, body.roughness + .055),
    };
  }
  if (role === "mane") {
    return {
      ...body,
      base: scaleColor(body.base, blackBody ? 1.38 : .74),
      roughness: Math.min(1, body.roughness + .1),
    };
  }
  if (role === "muzzle") {
    return {
      ...body,
      base: scaleColor(body.base, blackBody ? 1.2 : 1),
      roughness: Math.min(1, body.roughness + .08),
    };
  }
  return body;
}

export function linearLuminance(color) {
  return color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
}
