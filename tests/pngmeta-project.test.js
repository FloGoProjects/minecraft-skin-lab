import { describe, it, expect } from 'vitest';
import { crc32, writeMeta, readMeta, META_KEY } from '../src/core/pngmeta.js';
import { serializeProject, deserializeProject } from '../src/core/project.js';
import { createLayer, setPixel } from '../src/core/layers.js';

// Minimal-PNG: Signatur + IHDR + IEND (Inhalt egal für Chunk-Tests)
function chunk(type, data) {
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, data.length);
  const td = new Uint8Array(4 + data.length); td.set([...type].map(c => c.charCodeAt(0))); td.set(data, 4);
  const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(td));
  return [...len, ...td, ...crc];
}
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const tinyPng = () => new Uint8Array([...SIG, ...chunk('IHDR', new Uint8Array(13)), ...chunk('IEND', new Uint8Array(0))]);

describe('pngmeta', () => {
  it('crc32 Referenzwert', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
  });
  it('Metadaten schreiben und lesen (inkl. Umlaute)', () => {
    const meta = { name: 'Grüner Schal', category: 'oben/Oberteil', model: 'slim', resolution: 64 };
    const out = writeMeta(tinyPng(), meta);
    expect(readMeta(out)).toEqual(meta);
    // IEND bleibt letzter Chunk
    const tail = String.fromCharCode(...out.slice(out.length - 8, out.length - 4));
    expect(tail).toBe('IEND');
  });
  it('erneutes Schreiben ersetzt alte Metadaten', () => {
    const once = writeMeta(tinyPng(), { name: 'A' });
    const twice = writeMeta(once, { name: 'B' });
    expect(readMeta(twice)).toEqual({ name: 'B' });
    const text = new TextDecoder('latin1').decode(twice);
    expect(text.split(META_KEY).length - 1).toBe(1);
  });
  it('PNG ohne Metadaten → null; Nicht-PNG → Fehler', () => {
    expect(readMeta(tinyPng())).toBeNull();
    expect(() => readMeta(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

describe('project', () => {
  it('Roundtrip erhält Ebenen, Reihenfolge, Pixel und Einstellungen', () => {
    const a = createLayer(64, { name: 'Basis', category: 'unten/T-Shirt' });
    const b = createLayer(64, { name: 'Gürtel' });
    setPixel(a, 64, 3, 4, [9, 8, 7, 255]); b.visible = false;
    const proj = { resolution: 64, model: 'slim', settings: { fillColor: '#ff00aa' }, layers: [a, b], activeId: b.id };
    const json = serializeProject(proj);
    const back = deserializeProject(json);
    expect(back.resolution).toBe(64);
    expect(back.model).toBe('slim');
    expect(back.settings.fillColor).toBe('#ff00aa');
    expect(back.layers.map(l => l.name)).toEqual(['Basis', 'Gürtel']);
    expect(back.layers[1].visible).toBe(false);
    expect(back.layers[0].category).toBe('unten/T-Shirt');
    expect([...back.layers[0].pixels]).toEqual([...a.pixels]);
    expect(back.activeId).toBe(b.id);
  });
  it('kaputte Datei → verständlicher Fehler', () => {
    expect(() => deserializeProject('{"foo":1}')).toThrow(/Projektdatei/);
  });
});
