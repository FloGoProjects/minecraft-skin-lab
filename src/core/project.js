// Projektdatei (.skinproj): JSON mit allen Ebenen als Base64-RGBA.
const FORMAT = 'mc-skin-editor-project';

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serializeProject({ resolution, model, settings = {}, layers, activeId }) {
  return JSON.stringify({
    format: FORMAT, version: 1, resolution, model, settings, activeId,
    layers: layers.map(l => ({ id: l.id, name: l.name, category: l.category, model: l.model, visible: l.visible, pixels: toB64(l.pixels) })),
  });
}

export function deserializeProject(json) {
  let d;
  try { d = JSON.parse(json); } catch { throw new Error('Keine gültige Projektdatei (kein JSON).'); }
  if (d.format !== FORMAT || !Array.isArray(d.layers)) throw new Error('Keine gültige Projektdatei.');
  const res = d.resolution;
  if (res !== 64 && res !== 128) throw new Error('Projektdatei: unbekannte Auflösung ' + res);
  return {
    resolution: res,
    model: d.model === 'slim' ? 'slim' : 'classic',
    settings: d.settings || {},
    activeId: d.activeId,
    layers: d.layers.map(l => {
      const pixels = fromB64(l.pixels);
      if (pixels.length !== res * res * 4) throw new Error('Projektdatei: Ebene "' + l.name + '" hat falsche Größe.');
      return { id: l.id, name: l.name, category: l.category || '', model: l.model || null, visible: l.visible !== false, pixels };
    }),
  };
}
