// Ebenen: freie RGBA-Pixelmasken über die ganze Textur. Alpha ist immer 0 oder 255.

let counter = 0;
const newId = () => 'L' + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

export function createLayer(res, { name = 'Ebene', category = '', model = null, pixels = null } = {}) {
  return {
    id: newId(),
    name,
    category,
    model,
    visible: true,
    pixels: pixels ? new Uint8ClampedArray(pixels) : new Uint8ClampedArray(res * res * 4),
  };
}

const arr = (layerOrPixels) => (layerOrPixels.pixels ? layerOrPixels.pixels : layerOrPixels);

export function setPixel(layerOrPixels, res, x, y, rgba) {
  arr(layerOrPixels).set(rgba, (x + y * res) * 4);
}

export function getPixel(layerOrPixels, res, x, y) {
  const i = (x + y * res) * 4;
  return [...arr(layerOrPixels).slice(i, i + 4)];
}

/** Stapel unten → oben zusammenführen; deckende Pixel oberer Ebenen gewinnen. */
export function composite(layers, res) {
  const out = new Uint8ClampedArray(res * res * 4);
  for (const l of layers) {
    if (!l.visible) continue;
    const p = l.pixels;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 255) {
        out[i] = p[i]; out[i + 1] = p[i + 1]; out[i + 2] = p[i + 2]; out[i + 3] = 255;
      }
    }
  }
  return out;
}

export function thresholdAlpha(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] >= 128) pixels[i + 3] = 255;
    else pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
  }
  return pixels;
}

/** Flood-Fill (4er-Nachbarschaft) auf der Ebene, begrenzt auf das Flächenrechteck. */
export function floodFillFace(layer, res, x, y, rgba, rect) {
  const p = layer.pixels;
  const at = (xx, yy) => (xx + yy * res) * 4;
  const i0 = at(x, y);
  const target = [p[i0], p[i0 + 1], p[i0 + 2], p[i0 + 3]];
  const same = (i) => target[3] === 0 ? p[i + 3] === 0
    : p[i] === target[0] && p[i + 1] === target[1] && p[i + 2] === target[2] && p[i + 3] === target[3];
  if (target.every((v, k) => v === rgba[k])) return 0;
  const stack = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < rect.x || cy < rect.y || cx >= rect.x + rect.w || cy >= rect.y + rect.h) continue;
    const i = at(cx, cy);
    if (!same(i)) continue;
    p.set(rgba, i); n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}
