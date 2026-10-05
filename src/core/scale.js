/** Pixeldaten zwischen 64 und 128 umrechnen. Hoch: Nearest Neighbour. Runter: häufigste deckende Farbe. */
export function rescale(pixels, from, to) {
  if (from === to) return new Uint8ClampedArray(pixels);
  const out = new Uint8ClampedArray(to * to * 4);
  if (to > from) {
    const f = to / from;
    for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) {
      const si = ((x / f | 0) + (y / f | 0) * from) * 4;
      out.set(pixels.subarray(si, si + 4), (x + y * to) * 4);
    }
    return out;
  }
  const f = from / to;
  for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) {
    const counts = new Map();
    let opaque = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const si = ((x * f + dx) + (y * f + dy) * from) * 4;
      if (pixels[si + 3] !== 255) continue;
      opaque++;
      const key = (pixels[si] << 16) | (pixels[si + 1] << 8) | pixels[si + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (opaque * 2 < f * f) continue;
    let best = 0, bestN = -1;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    out.set([best >> 16 & 255, best >> 8 & 255, best & 255, 255], (x + y * to) * 4);
  }
  return out;
}
