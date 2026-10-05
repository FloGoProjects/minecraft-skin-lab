// Skin-Layout (64er-Einheiten). Modell schaut nach +Z, rechte Körperseite = -X, Füße bei y=0.
// Flächen-Zuordnung nach minecraft.wiki / Java-ModelPart; Bodenfläche ist vertikal gespiegelt.

const PARTS = {
  head:     { size: [8, 8, 8],  min: [-4, 24, -4], inner: [0, 0],   outer: [32, 0],  inflate: 0.5 },
  body:     { size: [8, 12, 4], min: [-4, 12, -2], inner: [16, 16], outer: [16, 32], inflate: 0.25 },
  rightArm: { size: [4, 12, 4], min: [-8, 12, -2], inner: [40, 16], outer: [40, 32], inflate: 0.25 },
  leftArm:  { size: [4, 12, 4], min: [4, 12, -2],  inner: [32, 48], outer: [48, 48], inflate: 0.25 },
  rightLeg: { size: [4, 12, 4], min: [-4, 0, -2],  inner: [0, 16],  outer: [0, 32],  inflate: 0.25 },
  leftLeg:  { size: [4, 12, 4], min: [0, 0, -2],   inner: [16, 48], outer: [0, 48],  inflate: 0.25 },
};

export const PART_NAMES = Object.keys(PARTS);
export const FACES = ['top', 'bottom', 'right', 'front', 'left', 'back'];
export const MIRROR_PART = { head: 'head', body: 'body', rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' };
export const MIRROR_FACE = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };

export function getBoxes(model, layer) {
  return PART_NAMES.map(part => {
    const p = PARTS[part];
    let [w, h, d] = p.size;
    let [x0, y0, z0] = p.min;
    if (model === 'slim' && part.endsWith('Arm')) {
      w = 3;
      if (part === 'rightArm') x0 = -7;
    }
    const [u, v] = p[layer];
    return { part, layer, u, v, w, h, d, min: [x0, y0, z0], inflate: layer === 'outer' ? p.inflate : 0 };
  });
}

/** Rechteck einer Fläche in 64er-Texturkoordinaten. */
export function faceRect(box, face) {
  const { u, v, w, h, d } = box;
  switch (face) {
    case 'top':    return { x: u + d,         y: v,     w, h: d };
    case 'bottom': return { x: u + d + w,     y: v,     w, h: d };
    case 'right':  return { x: u,             y: v + d, w: d, h };
    case 'front':  return { x: u + d,         y: v + d, w, h };
    case 'left':   return { x: u + d + w,     y: v + d, w: d, h };
    case 'back':   return { x: u + 2 * d + w, y: v + d, w, h };
  }
  throw new Error('Unbekannte Fläche ' + face);
}

/**
 * 3D-Lage einer Fläche: Ecke am Textur-Pixel (0,0) = tl, Richtung Textur-x = U, Textur-y = V.
 * Inklusive Aufblähung der äußeren Schicht.
 */
export function faceGeometry(box, face) {
  const e = box.inflate;
  const x0 = box.min[0] - e, y0 = box.min[1] - e, z0 = box.min[2] - e;
  const x1 = box.min[0] + box.w + e, y1 = box.min[1] + box.h + e, z1 = box.min[2] + box.d + e;
  const W = x1 - x0, H = y1 - y0, D = z1 - z0;
  switch (face) {
    case 'front':  return { tl: [x0, y1, z1], U: [W, 0, 0],  V: [0, -H, 0], n: [0, 0, 1] };
    case 'back':   return { tl: [x1, y1, z0], U: [-W, 0, 0], V: [0, -H, 0], n: [0, 0, -1] };
    case 'right':  return { tl: [x0, y1, z0], U: [0, 0, D],  V: [0, -H, 0], n: [-1, 0, 0] };
    case 'left':   return { tl: [x1, y1, z1], U: [0, 0, -D], V: [0, -H, 0], n: [1, 0, 0] };
    case 'top':    return { tl: [x0, y1, z0], U: [W, 0, 0],  V: [0, 0, D],  n: [0, 1, 0] };
    case 'bottom': return { tl: [x0, y0, z1], U: [W, 0, 0],  V: [0, 0, -D], n: [0, -1, 0] };
  }
  throw new Error('Unbekannte Fläche ' + face);
}

const lookupCache = new Map();

/** Tabelle Pixelindex → Flächeninfo für (model, res). */
function lookup(model, res) {
  const key = model + res;
  if (lookupCache.has(key)) return lookupCache.get(key);
  const k = res / 64;
  const table = new Array(res * res).fill(null);
  for (const layer of ['inner', 'outer']) {
    for (const box of getBoxes(model, layer)) {
      for (const face of FACES) {
        const r = faceRect(box, face);
        const rect = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
        for (let t = 0; t < rect.h; t++) for (let s = 0; s < rect.w; s++) {
          table[(rect.x + s) + (rect.y + t) * res] = { part: box.part, layer, face, s, t, rect };
        }
      }
    }
  }
  lookupCache.set(key, table);
  return table;
}

/** Welcher Körperteil/welche Fläche liegt an Texturpixel (x,y)? null = unbenutzt. */
export function texPixelInfo(x, y, model, res) {
  if (x < 0 || y < 0 || x >= res || y >= res) return null;
  return lookup(model, res)[x + y * res];
}

/** Texturpixel einer Fläche an Position (s,t) (echte Pixel). */
export function facePixel(model, res, part, layer, face, s, t) {
  const k = res / 64;
  const box = getBoxes(model, layer).find(b => b.part === part);
  const r = faceRect(box, face);
  return [r.x * k + s, r.y * k + t];
}

export function usedPixelCount(model, layer, res) {
  return lookup(model, res).filter(i => i && i.layer === layer).length;
}

/** Indizes aller Pixel, die zu Armen gehören (beide Schichten). */
export function armPixelSet(model, res) {
  const set = new Set();
  lookup(model, res).forEach((info, i) => { if (info && info.part.endsWith('Arm')) set.add(i); });
  return set;
}

export function layerPixelIndices(model, res, layer) {
  const out = [];
  lookup(model, res).forEach((info, i) => { if (info && info.layer === layer) out.push(i); });
  return out;
}

export const innerPixelIndices = (model, res) => layerPixelIndices(model, res, 'inner');
