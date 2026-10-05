import { innerPixelIndices, armPixelSet } from './layout.js';
import { createLayer } from './layers.js';

/** Pixelindizes der unteren Schicht, die nicht deckend sind (im Spiel falsch dargestellt). */
export function findGaps(compositePixels, model, res) {
  return innerPixelIndices(model, res).filter(i => compositePixels[i * 4 + 3] !== 255);
}

/** Ebene, die alle Pixel der unteren Schicht in einer Farbe füllt (gehört ganz unten in den Stapel). */
export function makeGapFillLayer(model, res, rgba) {
  const l = createLayer(res, { name: 'Lückenfüller', category: 'Sonstiges', model });
  for (const i of innerPixelIndices(model, res)) l.pixels.set(rgba, i * 4);
  return l;
}

export function hasArmPixels(pixels, model, res) {
  for (const i of armPixelSet(model, res)) if (pixels[i * 4 + 3] === 255) return true;
  return false;
}

/** Rät das Modell eines fremden Skins: Pixel, die nur Classic-Arme nutzen, leer → Slim. null = keine Arme. */
export function guessModel(pixels, res) {
  const slimArms = armPixelSet('slim', res);
  const opaque = (i) => pixels[i * 4 + 3] === 255;
  let anyArm = false, classicOnly = false;
  for (const i of armPixelSet('classic', res)) {
    if (!opaque(i)) continue;
    anyArm = true;
    if (!slimArms.has(i)) { classicOnly = true; break; }
  }
  if (!anyArm) return null;
  return classicOnly ? 'classic' : 'slim';
}
