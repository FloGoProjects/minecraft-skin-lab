import { describe, it, expect } from 'vitest';
import { mirrorPixel } from '../src/core/mirror.js';
import { rescale } from '../src/core/scale.js';
import { findGaps, makeGapFillLayer, hasArmPixels } from '../src/core/gaps.js';
import { createLayer, setPixel, getPixel, composite } from '../src/core/layers.js';
import { usedPixelCount } from '../src/core/layout.js';

describe('mirror', () => {
  it('Kopf vorne spiegelt horizontal auf sich selbst', () => {
    expect(mirrorPixel(8, 8, 'classic', 64)).toEqual([15, 8]);
  });
  it('rechter Arm vorne ↔ linker Arm vorne', () => {
    // rechter Arm inner u=40,v=16 → front (44,20); linker Arm inner u=32,v=48 → front (36,52)
    expect(mirrorPixel(44, 20, 'classic', 64)).toEqual([39, 52]);
    expect(mirrorPixel(39, 52, 'classic', 64)).toEqual([44, 20]);
  });
  it('rechte Seite ↔ linke Seite mit gespiegeltem s', () => {
    // rechtes Bein inner u=0,v=16: right-Fläche (0,20) 4x12 ; linkes Bein inner u=16,v=48: left-Fläche (24,52)
    expect(mirrorPixel(0, 20, 'classic', 64)).toEqual([27, 52]);
  });
  it('Spiegeln zweimal = Identität für alle benutzten Pixel (slim, 128)', () => {
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const m = mirrorPixel(x, y, 'slim', 128);
      if (!m) continue;
      expect(mirrorPixel(m[0], m[1], 'slim', 128)).toEqual([x, y]);
    }
  });
  it('unbenutzte Pixel → null', () => {
    expect(mirrorPixel(0, 0, 'classic', 64)).toBeNull();
  });
});

describe('scale', () => {
  it('hochskalieren 64→128 ist verlustfrei', () => {
    const px = new Uint8ClampedArray(64 * 64 * 4);
    px.set([10, 20, 30, 255], (5 + 7 * 64) * 4);
    const up = rescale(px, 64, 128);
    for (const [x, y] of [[10, 14], [11, 14], [10, 15], [11, 15]])
      expect([...up.slice((x + y * 128) * 4, (x + y * 128) * 4 + 4)]).toEqual([10, 20, 30, 255]);
    expect([...rescale(up, 128, 64)]).toEqual([...px]);
  });
  it('herunterskalieren nimmt die häufigste deckende Farbe, sonst transparent', () => {
    const px = new Uint8ClampedArray(128 * 128 * 4);
    const put = (x, y, c) => px.set(c, (x + y * 128) * 4);
    put(0, 0, [1, 1, 1, 255]); put(1, 0, [2, 2, 2, 255]); put(0, 1, [2, 2, 2, 255]);
    put(2, 0, [9, 9, 9, 255]); // nur 1 von 4 deckend → transparent
    const d = rescale(px, 128, 64);
    expect([...d.slice(0, 4)]).toEqual([2, 2, 2, 255]);
    expect(d[4 + 3]).toBe(0);
  });
});

describe('gaps', () => {
  it('leere Ebene: alle inneren Pixel sind Lücken', () => {
    const c = composite([createLayer(64)], 64);
    expect(findGaps(c, 'classic', 64).length).toBe(usedPixelCount('classic', 'inner', 64));
  });
  it('Füll-Ebene schließt alle Lücken und färbt nur innere Pixel', () => {
    const fill = makeGapFillLayer('classic', 64, [100, 50, 0, 255]);
    const c = composite([fill], 64);
    expect(findGaps(c, 'classic', 64)).toHaveLength(0);
    expect(getPixel(c, 64, 40, 8)[3]).toBe(0);          // Hut (outer) bleibt leer
    expect(getPixel(c, 64, 8, 8)).toEqual([100, 50, 0, 255]);
  });
  it('hasArmPixels erkennt Armbereich', () => {
    const l = createLayer(64);
    expect(hasArmPixels(l.pixels, 'classic', 64)).toBe(false);
    setPixel(l, 64, 10, 10, [1, 2, 3, 255]);
    expect(hasArmPixels(l.pixels, 'classic', 64)).toBe(false);
    setPixel(l, 64, 44, 20, [1, 2, 3, 255]);
    expect(hasArmPixels(l.pixels, 'classic', 64)).toBe(true);
  });
});

import { guessModel } from '../src/core/gaps.js';
import { innerPixelIndices } from '../src/core/layout.js';
describe('guessModel', () => {
  const full = (model) => {
    const l = createLayer(64);
    for (const i of innerPixelIndices(model, 64)) l.pixels.set([5, 5, 5, 255], i * 4);
    return l.pixels;
  };
  it('erkennt Slim- und Classic-Skins', () => {
    expect(guessModel(full('slim'), 64)).toBe('slim');
    expect(guessModel(full('classic'), 64)).toBe('classic');
  });
  it('ohne Armpixel → null', () => {
    expect(guessModel(createLayer(64).pixels, 64)).toBeNull();
  });
});
