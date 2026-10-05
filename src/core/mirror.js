import { texPixelInfo, facePixel, MIRROR_PART, MIRROR_FACE } from './layout.js';

/** Spiegelpixel an der Körpermitte (links ↔ rechts). null für unbenutzte Pixel. */
export function mirrorPixel(x, y, model, res) {
  const info = texPixelInfo(x, y, model, res);
  if (!info) return null;
  const s = info.rect.w - 1 - info.s; // gilt für alle Flächen (rechts↔links: Tiefe gespiegelt)
  return facePixel(model, res, MIRROR_PART[info.part], info.layer, MIRROR_FACE[info.face], s, info.t);
}
