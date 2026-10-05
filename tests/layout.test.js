import { describe, it, expect } from 'vitest';
import { getBoxes, faceRect, texPixelInfo, usedPixelCount, armPixelSet } from '../src/core/layout.js';

describe('layout', () => {
  it('liefert 6 Körperteile pro Schicht', () => {
    expect(getBoxes('classic', 'inner').map(b => b.part).sort())
      .toEqual(['body', 'head', 'leftArm', 'leftLeg', 'rightArm', 'rightLeg']);
    expect(getBoxes('classic', 'outer')).toHaveLength(6);
  });

  it('nutzbare Pixel pro Schicht entsprechen minecraft.wiki (64x64)', () => {
    expect(usedPixelCount('classic', 'inner', 64)).toBe(1632);
    expect(usedPixelCount('classic', 'outer', 64)).toBe(1632);
    expect(usedPixelCount('slim', 'inner', 64)).toBe(1568);
  });

  it('nutzbare Pixel bei 128x128 sind das Vierfache', () => {
    expect(usedPixelCount('classic', 'inner', 128)).toBe(6528);
    expect(usedPixelCount('slim', 'inner', 128)).toBe(6272);
  });

  it('Kopf-Vorderseite liegt bei (8,8) 8x8', () => {
    const head = getBoxes('classic', 'inner').find(b => b.part === 'head');
    expect(faceRect(head, 'front')).toEqual({ x: 8, y: 8, w: 8, h: 8 });
    expect(faceRect(head, 'top')).toEqual({ x: 8, y: 0, w: 8, h: 8 });
    expect(faceRect(head, 'bottom')).toEqual({ x: 16, y: 0, w: 8, h: 8 });
    expect(faceRect(head, 'right')).toEqual({ x: 0, y: 8, w: 8, h: 8 });
    expect(faceRect(head, 'back')).toEqual({ x: 24, y: 8, w: 8, h: 8 });
  });

  it('Overlay-Offsets stimmen', () => {
    const o = Object.fromEntries(getBoxes('classic', 'outer').map(b => [b.part, [b.u, b.v]]));
    expect(o).toEqual({
      head: [32, 0], body: [16, 32], rightArm: [40, 32],
      leftArm: [48, 48], rightLeg: [0, 32], leftLeg: [0, 48],
    });
  });

  it('texPixelInfo ordnet Pixel Teil/Fläche/Schicht zu', () => {
    expect(texPixelInfo(10, 9, 'classic', 64)).toMatchObject({ part: 'head', face: 'front', layer: 'inner', s: 2, t: 1 });
    expect(texPixelInfo(40, 10, 'classic', 64)).toMatchObject({ part: 'head', layer: 'outer', face: 'front' });
    expect(texPixelInfo(0, 0, 'classic', 64)).toBeNull();
    // 128er: Fläche doppelt so groß, s/t zählen echte Pixel
    expect(texPixelInfo(20, 18, 'classic', 128)).toMatchObject({ part: 'head', face: 'front', s: 4, t: 2 });
  });

  it('Slim-Arm: Spalte 54..55 der rechten Arm-Rückseite ist bei Slim unbenutzt', () => {
    // Classic rechter Arm: back x=52..55, y=20..31 ; Slim: back x=51..53
    expect(texPixelInfo(55, 25, 'classic', 64)).not.toBeNull();
    expect(texPixelInfo(54, 25, 'slim', 64)).toBeNull();
  });

  it('armPixelSet enthält nur Armpixel', () => {
    const set = armPixelSet('classic', 64);
    expect(set.has(44 + 20 * 64)).toBe(true);   // rechter Arm vorne
    expect(set.has(10 + 9 * 64)).toBe(false);   // Kopf
  });
});
