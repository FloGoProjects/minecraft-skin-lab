import { describe, it, expect } from 'vitest';
import { createLayer, composite, setPixel, getPixel, thresholdAlpha, floodFillFace } from '../src/core/layers.js';
import { History } from '../src/core/history.js';

const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255];

describe('layers', () => {
  it('neue Ebene ist komplett transparent', () => {
    const l = createLayer(64, { name: 'A' });
    expect(l.pixels.length).toBe(64 * 64 * 4);
    expect(l.pixels.every(v => v === 0)).toBe(true);
    expect(l.visible).toBe(true);
    expect(l.id).toBeTruthy();
  });

  it('oberste Ebene überschreibt nur deckende Pixel', () => {
    const a = createLayer(64), b = createLayer(64);
    setPixel(a, 64, 1, 1, RED); setPixel(a, 64, 2, 2, RED);
    setPixel(b, 64, 1, 1, BLUE);
    const c = composite([a, b], 64); // a unten, b oben
    expect(getPixel(c, 64, 1, 1)).toEqual(BLUE);
    expect(getPixel(c, 64, 2, 2)).toEqual(RED);
    expect(getPixel(c, 64, 3, 3)[3]).toBe(0);
  });

  it('ausgeblendete Ebenen zählen nicht', () => {
    const a = createLayer(64), b = createLayer(64);
    setPixel(a, 64, 1, 1, RED); setPixel(b, 64, 1, 1, BLUE);
    b.visible = false;
    expect(getPixel(composite([a, b], 64), 64, 1, 1)).toEqual(RED);
  });

  it('thresholdAlpha setzt Alpha hart auf 0/255', () => {
    const px = new Uint8ClampedArray([1, 2, 3, 127, 1, 2, 3, 128]);
    thresholdAlpha(px);
    expect([...px]).toEqual([0, 0, 0, 0, 1, 2, 3, 255]);
  });

  it('Füllen bleibt innerhalb der Fläche', () => {
    const l = createLayer(64);
    // Kopf vorne = (8,8) 8x8; Füllen dort darf (16,8) (Kopf links) nicht treffen
    floodFillFace(l, 64, 10, 10, RED, { x: 8, y: 8, w: 8, h: 8 });
    expect(getPixel(l.pixels, 64, 8, 8)).toEqual(RED);
    expect(getPixel(l.pixels, 64, 15, 15)).toEqual(RED);
    expect(getPixel(l.pixels, 64, 16, 8)[3]).toBe(0);
  });

  it('Füllen ersetzt nur zusammenhängende gleiche Farbe', () => {
    const l = createLayer(64);
    for (let y = 8; y < 16; y++) setPixel(l, 64, 12, y, BLUE); // Trennwand
    floodFillFace(l, 64, 9, 9, RED, { x: 8, y: 8, w: 8, h: 8 });
    expect(getPixel(l.pixels, 64, 11, 9)).toEqual(RED);
    expect(getPixel(l.pixels, 64, 13, 9)[3]).toBe(0);
  });
});

describe('history', () => {
  it('undo/redo stellt Zustände wieder her', () => {
    const h = new History(10);
    let state = { v: 1 };
    h.push(state); state = { v: 2 };
    h.push(state); state = { v: 3 };
    state = h.undo(state); expect(state.v).toBe(2);
    state = h.undo(state); expect(state.v).toBe(1);
    expect(h.undo(state)).toBe(null);
    state = h.redo(state); expect(state.v).toBe(2);
    state = h.redo(state); expect(state.v).toBe(3);
  });

  it('neuer push verwirft Redo und Limit greift', () => {
    const h = new History(2);
    h.push({ v: 1 }); h.push({ v: 2 }); h.push({ v: 3 });
    let s = h.undo({ v: 4 }); s = h.undo(s);
    expect(s.v).toBe(2);
    expect(h.undo(s)).toBe(null);
    h.push(s);
    expect(h.redo({ v: 9 })).toBe(null);
  });
});
