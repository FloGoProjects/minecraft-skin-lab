import { createLayer, composite, setPixel, thresholdAlpha, floodFillFace } from './core/layers.js';
import { History } from './core/history.js';
import { mirrorPixel } from './core/mirror.js';
import { rescale } from './core/scale.js';
import { findGaps, makeGapFillLayer, hasArmPixels, guessModel } from './core/gaps.js';
import { writeMeta, readMeta } from './core/pngmeta.js';
import { serializeProject, deserializeProject } from './core/project.js';
import { layerPixelIndices, texPixelInfo, PART_NAMES } from './core/layout.js';
import { Viewer } from './ui/viewer.js';
import { icon, hydrateIcons } from './ui/icons.js';

// ---------------------------------------------------------------- Konstanten
const S = 8; // Anzeige-Pixel pro Texel in der 3D-Textur
const AUTOSAVE_KEY = 'skinlab.autosave';
const BG_KEY = 'skinlab.background';
const CATEGORIES = [
  { group: 'Untere Schicht', prefix: 'unten', items: ['Schuhe', 'Hose', 'T-Shirt', 'Kopf'] },
  { group: 'Obere Schicht', prefix: 'oben', items: ['Schuhe', 'Hose', 'Oberteil', 'Kopf'] },
];
const PART_LABEL = { head: 'Kopf', body: 'Körper', rightArm: 'R-Arm', leftArm: 'L-Arm', rightLeg: 'R-Bein', leftLeg: 'L-Bein' };
const PART_LONG = { head: 'Kopf', body: 'Körper', rightArm: 'Rechter Arm', leftArm: 'Linker Arm', rightLeg: 'Rechtes Bein', leftLeg: 'Linkes Bein' };
const FACE_LABEL = { top: 'oben', bottom: 'unten', front: 'vorne', back: 'hinten', right: 'rechts', left: 'links' };
const MODEL_LABEL = { classic: 'Classic', slim: 'Slim' };
const PALETTE = ['#ffffff', '#1b1b1b', '#c8a27a', '#8d5a3b', '#e23b3b', '#f59e2b', '#f7d84a', '#5bc236', '#2f8f4e', '#3cf0ff', '#2f6fe0', '#7a3fd1', '#e85fb7', '#7d7d86'];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hexToRgba = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const rgbaToHex = (p) => '#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join('');
const catLabel = (c) => c ? c.replace('unten/', 'unten · ').replace('oben/', 'oben · ') : 'ohne Kategorie';
const slug = (s) => String(s).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').replace(/·/g, '') || 'teil';

// ---------------------------------------------------------------- Zustand
const state = {
  resolution: 64, model: 'classic', layers: [], activeId: null, projectName: 'mein-skin',
  tool: 'pencil', color: '#3cf0ff', target: 'inner', mirror: false,
  showInner: true, showOuter: true, grid: true,
  parts: Object.fromEntries(PART_NAMES.map(p => [p, true])),
  settings: { fillColor: '#c8a27a' },
  recent: [],
};
const history = new History(150);
let saveTimer = null;
let previewing = false; // Neu-Dialog zeigt Vorschau → nicht autosaven
let comp = new Uint8ClampedArray(64 * 64 * 4);
let hover = null;
let gapHighlight = null;
let stroke = null;

const texCanvas = document.createElement('canvas');
const viewer = new Viewer($('#viewport'), texCanvas);

const activeLayer = () => state.layers.find(l => l.id === state.activeId) || state.layers[state.layers.length - 1];

// ---------------------------------------------------------------- Verlauf
const snapshot = () => ({ layers: state.layers.map(l => ({ ...l })), activeId: state.activeId });
function commit() { history.push(snapshot()); }
function restore(s) { state.layers = s.layers.map(l => ({ ...l })); state.activeId = s.activeId; }
function undo() { const s = history.undo(snapshot()); if (s) { restore(s); refresh(); } }
function redo() { const s = history.redo(snapshot()); if (s) { restore(s); refresh(); } }

// ---------------------------------------------------------------- Rendering
let outerIdx = [];
function setupProjectView() {
  texCanvas.width = texCanvas.height = state.resolution * S;
  viewer.setModel(state.model, state.resolution);
  outerIdx = layerPixelIndices(state.model, state.resolution, 'outer');
  $('#projInfo').textContent = `${state.resolution}×${state.resolution} · ${MODEL_LABEL[state.model]}${state.resolution === 128 ? ' · nur Bedrock' : ''}`;
  const pc = $('#previewCanvas');
  pc.width = pc.height = state.resolution;
  applyVisibility();
}

const small = document.createElement('canvas');
function drawTexture() {
  const res = state.resolution;
  small.width = small.height = res;
  small.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(comp), res, res), 0, 0);
  const ctx = texCanvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, texCanvas.width, texCanvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, res * S, res * S);
  if (state.target === 'outer') { // leere Pixel der oberen Schicht als „Geist“ zeigen, damit man sie trifft
    ctx.fillStyle = 'rgba(140, 235, 255, 0.16)';
    for (const i of outerIdx) if (comp[i * 4 + 3] === 0) ctx.fillRect((i % res) * S, (i / res | 0) * S, S, S);
  }
  if (gapHighlight) {
    ctx.fillStyle = '#ff2fd0';
    for (const i of gapHighlight) ctx.fillRect((i % res) * S, (i / res | 0) * S, S, S);
  }
  if (state.grid) { // nur auf vorhandenem Inhalt, sonst entstünden schwebende Linien
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let i = 0; i <= res; i++) { ctx.fillRect(i * S, 0, 1, res * S); ctx.fillRect(0, i * S, res * S, 1); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (hover) {
    const marks = [[hover.x, hover.y, '#3cf0ff']];
    if (state.mirror) { const m = mirrorPixel(hover.x, hover.y, state.model, res); if (m) marks.push([m[0], m[1], '#b26bff']); }
    ctx.lineWidth = 2;
    for (const [x, y, c] of marks) {
      ctx.strokeStyle = c; ctx.strokeRect(x * S + 1, y * S + 1, S - 2, S - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
    }
  }
  viewer.textureChanged();
}

function drawPreview() {
  const pc = $('#previewCanvas');
  pc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(comp), state.resolution, state.resolution), 0, 0);
}

let rafPending = false;
function requestTextureRedraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; drawTexture(); });
}

function refresh(full = true) {
  comp = composite(state.layers, state.resolution);
  drawTexture();
  drawPreview();
  if (full) { renderLayers(); updateUndoButtons(); }
  else updateActiveThumb();
  scheduleAutosave();
}

function applyVisibility() {
  viewer.setVisibility({
    parts: state.parts, inner: state.showInner, outer: state.showOuter,
    outerOpacity: state.target === 'inner' ? 0.4 : 1,
  });
}

// ---------------------------------------------------------------- Ebenenliste
function drawThumb(canvas, layer) {
  canvas.width = canvas.height = state.resolution;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(layer.pixels), state.resolution, state.resolution), 0, 0);
}
function updateActiveThumb() {
  const l = activeLayer();
  const c = l && document.querySelector(`.layer[data-id="${l.id}"] canvas`);
  if (c) drawThumb(c, l);
}

function modelWarning(l) {
  return l.model && l.model !== state.model && hasArmPixels(l.pixels, l.model, state.resolution);
}

function renderLayers() {
  const list = $('#layerList');
  list.innerHTML = '';
  const ordered = [...state.layers].reverse();
  for (const l of ordered) {
    const li = document.createElement('li');
    li.className = 'layer' + (l.id === state.activeId ? ' active' : '') + (l.visible ? '' : ' hidden-layer');
    li.dataset.id = l.id;
    li.draggable = true;
    li.innerHTML = `
      <button class="ibtn eye ${l.visible ? '' : 'off'}" data-a="vis" title="Ein-/Ausblenden">${icon(l.visible ? 'eye' : 'eyeOff')}</button>
      <canvas class="thumb"></canvas>
      <div class="meta">
        <div class="name" title="Doppelklick zum Umbenennen">${esc(l.name)}</div>
        <div class="cat">${esc(catLabel(l.category))}${modelWarning(l) ? ` <span class="warn" title="Für ${MODEL_LABEL[l.model]} gemalt – Arme passen evtl. nicht">⚠ ${MODEL_LABEL[l.model]}</span>` : ''}</div>
      </div>
      <div class="acts">
        <button class="ibtn" data-a="save" title="Als Teil speichern (PNG)">${icon('save')}</button>
        <button class="ibtn" data-a="dup" title="Duplizieren">${icon('copy')}</button>
        <button class="ibtn del" data-a="del" title="Löschen">${icon('trash')}</button>
      </div>`;
    drawThumb(li.querySelector('canvas'), l);
    list.appendChild(li);
  }
}

$('#layerList').addEventListener('click', (e) => {
  const li = e.target.closest('.layer');
  if (!li) return;
  const l = state.layers.find(x => x.id === li.dataset.id);
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'vis') { commit(); l.visible = !l.visible; refresh(); return; }
  if (a === 'save') { savePartDialog(l); return; }
  if (a === 'dup') {
    commit();
    const copy = createLayer(state.resolution, { name: l.name + ' Kopie', category: l.category, model: l.model, pixels: l.pixels });
    state.layers.splice(state.layers.indexOf(l) + 1, 0, copy);
    state.activeId = copy.id; refresh(); return;
  }
  if (a === 'del') { deleteLayer(l); return; }
  if (state.activeId !== l.id) { state.activeId = l.id; renderLayers(); }
});

$('#layerList').addEventListener('dblclick', (e) => {
  const nameEl = e.target.closest('.name');
  if (!nameEl) return;
  const l = state.layers.find(x => x.id === nameEl.closest('.layer').dataset.id);
  nameEl.innerHTML = `<input value="${esc(l.name)}">`;
  const inp = nameEl.querySelector('input');
  inp.focus(); inp.select();
  const done = (ok) => {
    if (ok && inp.value.trim() && inp.value.trim() !== l.name) { commit(); l.name = inp.value.trim(); }
    renderLayers();
  };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
  inp.addEventListener('blur', () => done(true));
});

// Drag & Drop zum Umsortieren
let dragId = null;
$('#layerList').addEventListener('dragstart', (e) => {
  const li = e.target.closest('.layer');
  if (!li) return;
  dragId = li.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-layer', dragId);
});
$('#layerList').addEventListener('dragover', (e) => {
  if (!dragId) return;
  e.preventDefault();
  document.querySelectorAll('.drop-above,.drop-below').forEach(x => x.classList.remove('drop-above', 'drop-below'));
  const li = e.target.closest('.layer');
  if (!li || li.dataset.id === dragId) return;
  const r = li.getBoundingClientRect();
  li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
});
$('#layerList').addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault(); e.stopPropagation();
  const li = e.target.closest('.layer');
  const above = li?.classList.contains('drop-above');
  if (li && li.dataset.id !== dragId) {
    commit();
    const visual = [...state.layers].reverse();
    const moved = visual.splice(visual.findIndex(l => l.id === dragId), 1)[0];
    let idx = visual.findIndex(l => l.id === li.dataset.id);
    if (!above) idx++;
    visual.splice(idx, 0, moved);
    state.layers = visual.reverse();
    refresh();
  }
  dragId = null;
});
$('#layerList').addEventListener('dragend', () => { dragId = null; renderLayers(); });

function deleteLayer(l) {
  commit();
  const i = state.layers.indexOf(l);
  state.layers.splice(i, 1);
  if (!state.layers.length) state.layers.push(createLayer(state.resolution, { name: 'Ebene 1' }));
  if (state.activeId === l.id) state.activeId = state.layers[Math.max(0, i - 1)].id;
  refresh();
  toast(`Ebene „${l.name}“ gelöscht – Strg+Z holt sie zurück.`);
}

$('#addLayer').addEventListener('click', () => {
  commit();
  const l = createLayer(state.resolution, { name: 'Ebene ' + (state.layers.length + 1) });
  const i = state.layers.indexOf(activeLayer());
  state.layers.splice(i + 1, 0, l);
  state.activeId = l.id;
  refresh();
});

// ---------------------------------------------------------------- Malen
function paintPixel(x, y, rgba) {
  const l = activeLayer();
  setPixel(l, state.resolution, x, y, rgba);
  if (state.mirror) {
    const m = mirrorPixel(x, y, state.model, state.resolution);
    if (m) setPixel(l, state.resolution, m[0], m[1], rgba);
  }
}

function paintLine(a, b, rgba) {
  // Bresenham innerhalb derselben Fläche (Flächen sind zusammenhängende Rechtecke)
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    paintPixel(x0, y0, rgba);
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const sameFace = (a, b) => a && b && a.part === b.part && a.face === b.face && a.layer === b.layer;

function ensureActiveVisible() {
  const l = activeLayer();
  if (!l.visible) { l.visible = true; toast('Die aktive Ebene war ausgeblendet – sie ist jetzt wieder sichtbar.', 'warn'); }
}

function pickColorAt(p) {
  const i = (p.x + p.y * state.resolution) * 4;
  if (comp[i + 3] !== 255) { toast('Dort ist kein Pixel zum Aufnehmen.', 'warn'); return; }
  setColor(rgbaToHex(comp.slice(i, i + 4)));
}

const viewport = $('#viewport');
// Capture-Phase am Container: läuft vor OrbitControls. Treffer auf der Figur = malen, sonst drehen.
viewport.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || $('#modalRoot').children.length) return; // bei offenem Dialog nur drehen
  const p = viewer.pick(e.clientX, e.clientY, state.target);
  if (!p) return;
  e.stopPropagation();
  const tool = e.altKey ? 'picker' : state.tool;
  if (tool === 'picker') { pickColorAt(p); return; }
  const rgba = tool === 'eraser' ? [0, 0, 0, 0] : hexToRgba(state.color);
  commit();
  const l = activeLayer();
  l.pixels = l.pixels.slice(); // Copy-on-Write: Schnappschuss behält alte Pixel
  ensureActiveVisible();
  if (tool === 'fill') {
    floodFillFace(l, state.resolution, p.x, p.y, rgba, p.rect);
    if (state.mirror) {
      const m = mirrorPixel(p.x, p.y, state.model, state.resolution);
      const info = m && texPixelInfo(m[0], m[1], state.model, state.resolution);
      if (info) floodFillFace(l, state.resolution, m[0], m[1], rgba, info.rect);
    }
    addRecent(state.color);
    refresh();
    return;
  }
  stroke = { last: p, rgba, cx: e.clientX, cy: e.clientY };
  viewer.renderer.domElement.setPointerCapture(e.pointerId);
  paintPixel(p.x, p.y, rgba);
  refresh(false);
}, { capture: true });

viewport.addEventListener('pointermove', (e) => {
  const p = viewer.pick(e.clientX, e.clientY, state.target);
  viewport.classList.toggle('paint', !!p);
  if (stroke) {
    // Im Bildschirmraum abtasten, damit schnelle Striche über Flächenkanten keine Lücken lassen
    const dx = e.clientX - stroke.cx, dy = e.clientY - stroke.cy;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    for (let k = 1; k <= steps; k++) {
      const q = k === steps ? p : viewer.pick(stroke.cx + dx * k / steps, stroke.cy + dy * k / steps, state.target);
      if (!q) { stroke.last = null; continue; }
      if (sameFace(stroke.last, q)) paintLine(stroke.last, q, stroke.rgba);
      else paintPixel(q.x, q.y, stroke.rgba);
      stroke.last = q;
    }
    stroke.cx = e.clientX; stroke.cy = e.clientY;
    hover = p;
    refresh(false);
    return;
  }
  const changed = (hover?.x !== p?.x) || (hover?.y !== p?.y);
  hover = p;
  if (changed) { requestTextureRedraw(); showHoverInfo(p); }
});
viewport.addEventListener('pointerleave', () => { if (!stroke && hover) { hover = null; requestTextureRedraw(); showHoverInfo(null); } });
window.addEventListener('pointerup', () => {
  if (!stroke) return;
  stroke = null;
  if (state.tool === 'pencil') addRecent(state.color);
  refresh();
});

function showHoverInfo(p) {
  const el = $('#hoverInfo');
  if (!p) { el.innerHTML = 'Linke Maus auf Figur = malen · daneben ziehen / rechte Maus = drehen · Rad = Zoom'; return; }
  el.innerHTML = `<b>${PART_LONG[p.part]}</b> · ${FACE_LABEL[p.face]} · ${p.layer === 'inner' ? 'untere' : 'obere'} Schicht · Pixel ${p.x}, ${p.y}`;
}

// ---------------------------------------------------------------- Werkzeuge & Farbe
function setTool(t) {
  state.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

function setMirror(on) { state.mirror = on; $('#mirrorBtn').classList.toggle('on', on); requestTextureRedraw(); }
$('#mirrorBtn').addEventListener('click', () => setMirror(!state.mirror));

function setTarget(t) {
  state.target = t;
  document.querySelectorAll('[data-target]').forEach(b => b.classList.toggle('on', b.dataset.target === t));
  $('#targetSwitch').classList.toggle('outer', t === 'outer');
  if (t === 'outer' && !state.showOuter) setLayerVis('outer', true);
  if (t === 'inner' && !state.showInner) setLayerVis('inner', true);
  applyVisibility();
  hover = null;
  drawTexture();
}
document.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => setTarget(b.dataset.target)));

function setColor(hex) {
  state.color = hex.toLowerCase();
  $('#colorInput').value = state.color;
  $('#hexInput').value = state.color;
  $('#swatchFill').style.background = state.color;
  if (state.tool === 'picker' || state.tool === 'eraser') setTool('pencil');
}
$('#colorInput').addEventListener('input', (e) => setColor(e.target.value));
$('#hexInput').addEventListener('change', (e) => {
  let v = e.target.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v); else { toast('Bitte Farbe als #RRGGBB eingeben.', 'warn'); e.target.value = state.color; }
});
$('#hexInput').addEventListener('keydown', e => e.stopPropagation());

function renderPalette(el, colors) {
  el.innerHTML = colors.map(c => `<button style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
}
$('#palette').addEventListener('click', e => { const c = e.target.dataset.c; if (c) setColor(c); });
$('#recent').addEventListener('click', e => { const c = e.target.dataset.c; if (c) setColor(c); });
function addRecent(c) {
  state.recent = [c, ...state.recent.filter(x => x !== c)].slice(0, 6);
  renderPalette($('#recent'), state.recent);
}

$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
function updateUndoButtons() {
  $('#undoBtn').disabled = !history.undoStack.length;
  $('#redoBtn').disabled = !history.redoStack.length;
}

// ---------------------------------------------------------------- Ansicht
const partBox = $('#partToggles');
partBox.innerHTML = PART_NAMES.map(p => `<button class="pill on" data-part="${p}" title="${PART_LONG[p]} ein-/ausblenden">${PART_LABEL[p]}</button>`).join('');
partBox.addEventListener('click', (e) => {
  const p = e.target.dataset.part;
  if (!p) return;
  state.parts[p] = !state.parts[p];
  e.target.classList.toggle('on', state.parts[p]);
  applyVisibility();
});
function setLayerVis(which, on) {
  if (which === 'inner') state.showInner = on; else state.showOuter = on;
  $(which === 'inner' ? '#showInner' : '#showOuter').classList.toggle('on', on);
  applyVisibility();
}
$('#showInner').addEventListener('click', () => setLayerVis('inner', !state.showInner));
$('#showOuter').addEventListener('click', () => setLayerVis('outer', !state.showOuter));
$('#gridBtn').addEventListener('click', () => { state.grid = !state.grid; $('#gridBtn').classList.toggle('on', state.grid); drawTexture(); });
$('#camBtn').addEventListener('click', () => viewer.resetCamera());
$('#previewToggle').addEventListener('click', () => {
  const c = $('#preview').classList.toggle('collapsed');
  $('#previewToggle').textContent = c ? '+' : '–';
});

// ---------------------------------------------------------------- Toasts & Dialoge
function toast(msg, kind = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/** see-through: Figur bleibt drehbar (Backdrop lässt Maus durch), Malen ist trotzdem gesperrt. */
/** side: Dialog links statt mittig (Figur bleibt frei). onChange(data): bei jeder Eingabe. */
function modal({ title, html, buttons, seeThrough = false, side = false, onChange = null }) {
  return new Promise((resolve) => {
    const root = $('#modalRoot');
    const back = document.createElement('div');
    back.className = 'backdrop' + (seeThrough ? ' see-through' : '') + (side ? ' side' : '');
    back.innerHTML = `<div class="modal glass"><h3 title="Zum Verschieben ziehen">${esc(title)}</h3>${html}<div class="buttons">${buttons.map((b, i) =>
      `<button class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    root.appendChild(back);
    const box = back.querySelector('.modal');
    makeDraggable(box, box.querySelector('h3'));
    const close = (value) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve({ value, box }); };
    const onKey = (e) => {
      if (e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter') {
        const prim = buttons.find(b => b.kind === 'primary');
        if (prim) { e.preventDefault(); e.stopPropagation(); close(prim.value); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) close(buttons[+b.dataset.i].value);
    });
    // Werte vor dem Schließen auslesen können
    box.read = () => Object.fromEntries([...box.querySelectorAll('[name]')].filter(i => i.type !== 'radio' || i.checked).map(i => [i.name, i.value]));
    if (onChange) box.addEventListener('input', () => onChange(box.read()));
    const first = box.querySelector('input[type=text], select');
    if (first) setTimeout(() => { first.focus(); first.select?.(); }, 30);
  }).then(({ value, box }) => ({ value, data: value === null ? null : box.read() }));
}

/** Dialog an der Titelleiste verschieben; bleibt mindestens teilweise im Fenster. */
function makeDraggable(box, handle) {
  let dx = 0, dy = 0, start = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX - dx, y: e.clientY - dy };
    handle.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = box.getBoundingClientRect();
    const baseL = r.left - dx, baseT = r.top - dy;
    // mindestens 60 px des Dialogs bleiben sichtbar, Titelleiste nie oberhalb des Fensters
    dx = Math.min(window.innerWidth - 60 - baseL, Math.max(60 - r.width - baseL, e.clientX - start.x));
    dy = Math.min(window.innerHeight - 40 - baseT, Math.max(-baseT, e.clientY - start.y));
    box.style.translate = `${dx}px ${dy}px`;
  });
  const end = () => { start = null; box.classList.remove('dragging'); };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function categorySelect(current) {
  return `<select name="category">
    ${CATEGORIES.map(g => `<optgroup label="${g.group}">${g.items.map(it => {
      const v = `${g.prefix}/${it}`; return `<option value="${v}" ${v === current ? 'selected' : ''}>${g.prefix} · ${it}</option>`;
    }).join('')}</optgroup>`).join('')}
    <option value="Sonstiges" ${current === 'Sonstiges' || !current ? 'selected' : ''}>Sonstiges</option>
  </select>`;
}

// ---------------------------------------------------------------- Dateien
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function pixelsToPng(pixels, res, meta) {
  const c = document.createElement('canvas');
  c.width = c.height = res;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), res, res), 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (meta) bytes = writeMeta(bytes, meta);
  return new Blob([bytes], { type: 'image/png' });
}

async function decodePng(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = readMeta(bytes); // wirft bei Nicht-PNG
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return { meta, width: bmp.width, height: bmp.height, pixels: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
}

async function savePartDialog(l) {
  if (!l.pixels.some((v, i) => i % 4 === 3 && v === 255)) { toast('Diese Ebene ist leer – nichts zu speichern.', 'warn'); return; }
  const { value, data } = await modal({
    title: 'Als Teil speichern',
    html: `<p>Die Ebene wird als PNG gespeichert. Name, Kategorie und Modell stecken in der Datei und werden beim Laden wieder erkannt.</p>
      <div class="row"><label class="lbl">Name</label><input type="text" name="name" value="${esc(l.name)}"></div>
      <div class="row"><label class="lbl">Kategorie</label>${categorySelect(l.category)}</div>`,
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', value: 'ok', kind: 'primary' }],
  });
  if (!value) return;
  const name = data.name.trim() || l.name;
  if (name !== l.name || data.category !== l.category) { commit(); l.name = name; l.category = data.category; }
  l.model = state.model;
  const blob = await pixelsToPng(l.pixels, state.resolution, { app: 'skin-lab', version: 1, name, category: data.category, model: state.model, resolution: state.resolution });
  download(blob, `${slug(data.category.replace('/', '-'))}_${slug(name)}.png`);
  refresh();
  toast(`Teil „${name}“ gespeichert.`, 'ok');
}

/** PNG-Dateien als neue Ebenen oben auf den Stapel legen (in Auswahlreihenfolge). */
async function importPngs(files) {
  const res = state.resolution;
  const added = [];
  for (const file of files) {
    let d;
    try { d = await decodePng(file); } catch { toast(`„${file.name}“ ist keine lesbare PNG-Datei.`, 'error'); continue; }
    const base = file.name.replace(/\.png$/i, '');
    if (d.width === 64 && d.height === 32) { toast(`„${base}“ hat das alte 64×32-Format – das wird (noch) nicht unterstützt.`, 'error', 6000); continue; }
    if (d.width !== d.height || (d.width !== 64 && d.width !== 128)) { toast(`„${base}“ ist ${d.width}×${d.height} – erwartet 64×64 oder 128×128.`, 'error', 6000); continue; }
    const label = d.meta?.name || base;
    let pixels = thresholdAlpha(new Uint8ClampedArray(d.pixels));
    const model = d.meta?.model || guessModel(pixels, d.width);
    if (d.width !== res) {
      pixels = rescale(pixels, d.width, res);
      if (d.width > res) toast(`„${label}“ war ${d.width}×${d.width} und wurde auf ${res}×${res} verkleinert – feine Details gehen dabei verloren.`, 'warn', 7000);
    }
    const l = createLayer(res, {
      name: label,
      category: d.meta?.category || 'Sonstiges',
      model, pixels,
    });
    if (modelWarning(l)) toast(`„${l.name}“ wurde für ${MODEL_LABEL[model]} gemalt, das Projekt ist ${MODEL_LABEL[state.model]} – die Arme passen evtl. nicht.`, 'warn', 7000);
    added.push(l);
  }
  if (!added.length) return;
  commit();
  state.layers.push(...added);
  state.activeId = added[added.length - 1].id;
  refresh();
  toast(added.length === 1 ? `„${added[0].name}“ als Ebene geladen.` : `${added.length} Teile geladen – das zuletzt geladene liegt oben. Reihenfolge per Drag & Drop änderbar.`, 'ok');
}

$('#loadParts').addEventListener('click', () => $('#filePng').click());
$('#filePng').addEventListener('change', (e) => { importPngs([...e.target.files]); e.target.value = ''; });
$('#fileSkin').addEventListener('change', (e) => { importPngs([...e.target.files]); e.target.value = ''; });
$('#fileProj').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openProjectFile(f); e.target.value = ''; });

// Drag & Drop von Dateien ins Fenster
let dragDepth = 0;
const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (isFileDrag(e)) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', (e) => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0; document.body.classList.remove('dragging');
  const files = [...e.dataTransfer.files];
  const proj = files.find(f => /\.(skinproj|json)$/i.test(f.name));
  if (proj) { openProjectFile(proj); return; }
  importPngs(files.filter(f => /\.png$/i.test(f.name) || f.type === 'image/png'));
});

// ---------------------------------------------------------------- Projekt
function loadProjectData(p, name) {
  state.resolution = p.resolution;
  state.model = p.model;
  state.layers = p.layers;
  state.activeId = p.layers.some(l => l.id === p.activeId) ? p.activeId : p.layers[p.layers.length - 1]?.id;
  state.settings = { ...state.settings, ...p.settings };
  if (p.settings?.projectName) state.projectName = p.settings.projectName;
  if (name) state.projectName = name;
  if (!state.layers.length) state.layers.push(createLayer(state.resolution, { name: 'Ebene 1' }));
  history.clear();
  setupProjectView();
  refresh();
}

async function openProjectFile(file) {
  try {
    const p = deserializeProject(await file.text());
    loadProjectData(p, file.name.replace(/\.(skinproj|json)$/i, ''));
    toast(`Projekt „${state.projectName}“ geöffnet.`, 'ok');
  } catch (err) { toast(err.message, 'error', 6000); }
}

function projectJson() {
  return serializeProject({ ...state, settings: { ...state.settings, projectName: state.projectName } });
}

async function saveProject() {
  const { value, data } = await modal({
    title: 'Projekt speichern',
    html: `<p>Speichert alle Ebenen mit Reihenfolge als <b>.skinproj</b>-Datei.</p>
      <div class="row"><label class="lbl">Dateiname</label><input type="text" name="name" value="${esc(state.projectName)}"></div>`,
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', value: 'ok', kind: 'primary' }],
  });
  if (!value) return;
  state.projectName = slug(data.name) || state.projectName;
  download(new Blob([projectJson()], { type: 'application/json' }), state.projectName + '.skinproj');
  toast('Projekt gespeichert.', 'ok');
}

/** Projekt nur zur Ansicht zeigen (kein Verlauf, kein Autosave) – für die Live-Vorschau im Neu-Dialog. */
function showPreviewProject(res, model, hex) {
  const base = makeGapFillLayer(model, res, hexToRgba(hex));
  base.name = 'Grundfarbe (Vorschau)';
  state.resolution = res; state.model = model;
  state.layers = [base]; state.activeId = base.id;
  setupProjectView();
  refresh();
}

async function newProjectDialog(first = false) {
  const saved = { resolution: state.resolution, model: state.model, layers: state.layers, activeId: state.activeId };
  previewing = true;
  clearTimeout(saveTimer);
  const preview = (d) => showPreviewProject(+d.res, d.model, d.base);
  preview({ res: state.resolution, model: state.model, base: state.settings.fillColor });
  const { value, data } = await modal({
    side: true, seeThrough: true, onChange: preview,
    title: first ? 'Willkommen – neuer Skin' : 'Neues Projekt',
    html: `${first ? '' : '<p>Das aktuelle Projekt wird ersetzt. Vorher speichern, falls du es behalten willst.</p>'}
      <div class="row"><label class="lbl">Auflösung</label><div class="choice">
        <label><input type="radio" name="res" value="64" ${state.resolution === 64 ? 'checked' : ''}><b>64 × 64</b><small>Java + Bedrock</small></label>
        <label><input type="radio" name="res" value="128" ${state.resolution === 128 ? 'checked' : ''}><b>128 × 128</b><small>nur Bedrock (HD)</small></label>
      </div></div>
      <div class="row"><label class="lbl">Modell</label><div class="choice">
        <label><input type="radio" name="model" value="classic" ${state.model === 'classic' ? 'checked' : ''}><b>Classic</b><small>Arme 4 Pixel breit</small></label>
        <label><input type="radio" name="model" value="slim" ${state.model === 'slim' ? 'checked' : ''}><b>Slim</b><small>Arme 3 Pixel breit</small></label>
      </div></div>
      <div class="row"><label class="lbl">Grundfarbe der unteren Schicht</label>
        <div class="inline"><input type="color" name="base" value="${state.settings.fillColor}"><small style="color:var(--muted)">wird zur Ebene „Grundfarbe“</small></div></div>
      <p class="note">Die Figur rechts zeigt deine Auswahl sofort – Raster und Armbreite. Ziehen dreht sie.</p>`,
    buttons: first ? [{ label: 'Los geht’s', value: 'ok', kind: 'primary' }]
      : [{ label: 'Abbrechen', value: null }, { label: 'Neu anlegen', value: 'ok', kind: 'primary' }],
  });
  previewing = false;
  if (!value) { // Abbrechen: altes Projekt unverändert zurück (Verlauf wurde nie angefasst)
    Object.assign(state, saved);
    setupProjectView();
    refresh();
    return;
  }
  const res = +data.res, model = data.model;
  const base = makeGapFillLayer(model, res, hexToRgba(data.base));
  base.name = 'Grundfarbe'; base.category = 'Sonstiges';
  const top = createLayer(res, { name: 'Ebene 1' });
  state.settings.fillColor = data.base;
  state.projectName = 'mein-skin';
  loadProjectData({ resolution: res, model, layers: [base, top], activeId: top.id, settings: state.settings });
}

async function exportSkin() {
  const gaps = findGaps(comp, state.model, state.resolution);
  if (gaps.length) {
    gapHighlight = new Set(gaps);
    drawTexture();
    const { value, data } = await modal({
      title: 'Lücken in der unteren Schicht',
      html: `<p><b>${gaps.length} Pixel</b> der unteren Schicht sind leer (in der Figur pink markiert – du kannst die Figur drehen und diesen Dialog an der Titelleiste verschieben). Minecraft zeigt die untere Schicht immer deckend an – leere Stellen erscheinen im Spiel meist schwarz.</p>
        <div class="row"><label class="lbl">Füllfarbe</label><div class="inline"><input type="color" name="fill" value="${state.settings.fillColor}"><small style="color:var(--muted)">legt eine Ebene „Lückenfüller“ ganz unten an</small></div></div>`,
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Trotzdem exportieren', value: 'raw' }, { label: 'Lücken füllen & exportieren', value: 'fill', kind: 'primary' }],
      seeThrough: true,
    });
    gapHighlight = null;
    if (!value) { drawTexture(); return; }
    if (value === 'fill') {
      commit();
      state.settings.fillColor = data.fill;
      state.layers.unshift(makeGapFillLayer(state.model, state.resolution, hexToRgba(data.fill)));
      refresh();
    } else drawTexture();
  }
  const blob = await pixelsToPng(comp, state.resolution, null);
  download(blob, `${state.projectName}.png`);
  toast('Skin exportiert.', 'ok');
}

async function settingsDialog() {
  const hasBg = !!readBg();
  const { value, data } = await modal({
    title: 'Einstellungen',
    html: `<div class="row"><label class="lbl">Standard-Füllfarbe für Lücken</label><div class="inline"><input type="color" name="fill" value="${state.settings.fillColor}"></div></div>
      <div class="row"><label class="lbl">Hintergrund</label><div class="inline">
        <button class="btn" data-bg="pick" type="button">Eigenes Bild wählen…</button>
        ${hasBg ? '<button class="btn" data-bg="reset" type="button">Blockwelt wiederherstellen</button>' : ''}
      </div><small style="color:var(--muted)">Das Bild wird nur in diesem Browser gemerkt, nicht mit Projekten weitergegeben.</small></div>`,
    buttons: [{ label: 'Schließen', value: 'ok', kind: 'primary' }],
  });
  if (value) state.settings.fillColor = data.fill;
  scheduleAutosave();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-bg]');
  if (!b) return;
  if (b.dataset.bg === 'pick') $('#fileBg').click();
  if (b.dataset.bg === 'reset') { try { localStorage.removeItem(BG_KEY); } catch { /* egal */ } applyBg(null); b.remove(); toast('Blockwelt ist zurück.', 'ok'); }
});
$('#fileBg').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    applyBg(r.result);
    try { localStorage.setItem(BG_KEY, r.result); } catch { toast('Bild ist zu groß, um es dauerhaft zu merken – gilt nur bis zum Neuladen.', 'warn', 6000); }
  };
  r.readAsDataURL(f);
});
function readBg() { try { return localStorage.getItem(BG_KEY); } catch { return null; } }
function applyBg(url) {
  document.body.style.backgroundImage = url ? `url("${url}")` : '';
  viewer.setWorldVisible(!url);
}

// ---------------------------------------------------------------- Autosave
function scheduleAutosave() {
  if (previewing) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(AUTOSAVE_KEY, projectJson()); } catch { /* Speicher voll oder gesperrt */ }
  }, 700);
}

// ---------------------------------------------------------------- Topbar & Tastatur
const actions = {
  new: () => newProjectDialog(false),
  open: () => $('#fileProj').click(),
  save: saveProject,
  import: () => $('#fileSkin').click(),
  export: exportSkin,
  settings: settingsDialog,
};
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => actions[b.dataset.act]()));

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || $('#modalRoot').children.length) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); saveProject(); }
    return;
  }
  if (k === 'b') setTool('pencil');
  else if (k === 'e') setTool('eraser');
  else if (k === 'i') setTool('picker');
  else if (k === 'g') setTool('fill');
  else if (k === 'm') setMirror(!state.mirror);
  else if (k === 'o') setTarget(state.target === 'inner' ? 'outer' : 'inner');
});

// ---------------------------------------------------------------- Start
hydrateIcons();
renderPalette($('#palette'), PALETTE);
setColor(state.color);
applyBg(readBg());

(function start() {
  let saved = null;
  try { saved = localStorage.getItem(AUTOSAVE_KEY); } catch { /* kein Speicher */ }
  if (saved) {
    try {
      loadProjectData(deserializeProject(saved));
      toast('Letzter Stand wiederhergestellt.', 'ok');
      return;
    } catch { /* kaputt → neu */ }
  }
  const base = makeGapFillLayer('classic', 64, hexToRgba(state.settings.fillColor));
  base.name = 'Grundfarbe'; base.category = 'Sonstiges';
  const top = createLayer(64, { name: 'Ebene 1' });
  loadProjectData({ resolution: 64, model: 'classic', layers: [base, top], activeId: top.id, settings: state.settings });
  newProjectDialog(true);
})();

// Für Tests/Debugging im Browser
window.__skinlab = { state, viewer, refresh, importPngs, pixelsToPng, exportSkin, undo, redo };
