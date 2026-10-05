// Prozedurale Blockwelt als Hintergrund (eigene Pixel-Texturen, keine Mojang-Assets) + Holo-Plattform.
import * as THREE from 'three';

const B = 16;          // Blockgröße in Skin-Pixeln
const R = 30;          // Weltradius in Blöcken
const WATER = -2;      // Wasserspiegel (Oberkante in Blöcken)

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function pixelTexture(draw, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const col = draw(x, y, r);
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shade = (r, g, b, k) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
const noisy = (r, g, b, amt) => (x, y, rnd) => shade(r, g, b, 1 - amt + rnd() * amt * 2);

function makeMaterials() {
  const grassTop = pixelTexture(noisy(96, 168, 64, 0.18), 3);
  const dirt = pixelTexture(noisy(134, 96, 67, 0.2), 5);
  const grassSide = pixelTexture((x, y, r) => {
    const edge = 3 + ((x * 7 + 3) % 5 === 0 ? 1 : 0) + ((x * 3) % 4 === 0 ? 1 : 0);
    return y < edge ? shade(96, 168, 64, 0.85 + r() * 0.3) : shade(134, 96, 67, 0.8 + r() * 0.4);
  }, 7);
  const stone = pixelTexture(noisy(125, 125, 128, 0.16), 11);
  const sand = pixelTexture(noisy(219, 207, 160, 0.08), 13);
  const logSide = pixelTexture((x, y, r) => shade(104, 80, 50, (x % 4 === 0 ? 0.75 : 1) * (0.9 + r() * 0.2)), 17);
  const logTop = pixelTexture((x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d > 6.5 ? shade(104, 80, 50, 0.9) : shade(176, 140, 90, (Math.round(d) % 2 ? 0.9 : 1.05) * (0.95 + r() * 0.1));
  }, 19);
  const leaves = pixelTexture((x, y, r) => r() < 0.12 ? null : shade(58, 128, 44, 0.75 + r() * 0.5), 23);

  const L = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
  return {
    grass: [L(grassSide), L(grassSide), L(grassTop), L(dirt), L(grassSide), L(grassSide)],
    dirt: L(dirt),
    stone: L(stone),
    sand: L(sand),
    log: [L(logSide), L(logSide), L(logTop), L(logTop), L(logSide), L(logSide)],
    leaves: L(leaves, { alphaTest: 0.5 }),
    water: new THREE.MeshLambertMaterial({ color: 0x3a7bd5, transparent: true, opacity: 0.72, depthWrite: false }),
  };
}

function height(i, j) {
  const d = Math.hypot(i, j);
  if (d < 4.5) return 0; // flache Bühne für die Figur
  const n = Math.sin(i * 0.23) * 1.6 + Math.cos(j * 0.19) * 1.8 + Math.sin((i + j) * 0.11) * 2.2 + Math.cos((i - j) * 0.31) * 0.8;
  const rim = Math.max(0, d - 18) * 0.35;       // Hügel am Rand
  const blend = Math.min(1, (d - 4.5) / 5);
  return Math.round((n + rim) * blend);
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = makeMaterials();
  // Gelände blendet aus, wenn die Kamera unter den Boden schaut (sonst verdeckt es die Figur)
  const terrainMats = [...new Set(Object.values(mats).flat())];
  for (const m of terrainMats) m.userData.baseOpacity = m.transparent ? m.opacity : 1;
  let groundFade = 1;
  const setGroundFade = (f) => {
    if (f === groundFade || (f !== 1 && Math.abs(f - groundFade) < 0.005)) return;
    const wasOpaque = groundFade === 1, isOpaque = f === 1;
    groundFade = f;
    for (const m of terrainMats) {
      m.opacity = m.userData.baseOpacity * f;
      if (m.userData.baseOpacity === 1 && wasOpaque !== isOpaque) {
        m.transparent = !isOpaque;
        m.depthWrite = isOpaque;
        m.needsUpdate = true;
      }
    }
  };
  const lists = { grass: [], dirt: [], stone: [], sand: [], log: [], leaves: [], water: [] };
  const H = new Map();
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    if (Math.hypot(i, j) > R) continue;
    H.set(i + ',' + j, height(i, j));
  }
  const h = (i, j) => H.get(i + ',' + j);
  for (const [key, top] of H) {
    const [i, j] = key.split(',').map(Number);
    // so tief füllen, dass keine Löcher in Klippen sichtbar sind
    let low = top;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = h(i + di, j + dj);
      low = Math.min(low, n === undefined ? top - 3 : n);
    }
    for (let y = top - 1; y >= low - 1; y--) {
      let kind;
      if (y === top - 1) kind = top <= WATER ? 'sand' : 'grass';
      else kind = y > top - 4 ? 'dirt' : 'stone';
      lists[kind].push([i, y, j]);
    }
    for (let y = top; y < WATER; y++) lists.water.push([i, y, j]);
  }
  // Bäume
  const r = rng(42);
  for (let n = 0; n < 34; n++) {
    const a = r() * Math.PI * 2, d = 8 + r() * (R - 10);
    const i = Math.round(Math.cos(a) * d), j = Math.round(Math.sin(a) * d);
    const top = h(i, j);
    if (top === undefined || top <= WATER) continue;
    const trunk = 4 + Math.floor(r() * 2);
    for (let y = 0; y < trunk; y++) lists.log.push([i, top + y, j]);
    for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
      const rad = dy >= trunk ? 1 : 2;
      for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++) {
        if ((di === 0 && dj === 0 && dy < trunk) || (Math.abs(di) === 2 && Math.abs(dj) === 2 && r() < 0.6)) continue;
        lists.leaves.push([i + di, top + dy, j + dj]);
      }
    }
  }
  const geo = new THREE.BoxGeometry(B, B, B);
  const m4 = new THREE.Matrix4();
  for (const [kind, cells] of Object.entries(lists)) {
    if (!cells.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mats[kind], cells.length);
    cells.forEach(([i, y, j], k) => {
      m4.makeTranslation(i * B, y * B + B / 2, j * B);
      mesh.setMatrixAt(k, m4);
    });
    if (kind === 'water') mesh.renderOrder = 2;
    group.add(mesh);
  }

  // Wolken
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, emissive: 0x666666 });
  for (let n = 0; n < 14; n++) {
    const w = (3 + Math.floor(r() * 6)) * B, d = (2 + Math.floor(r() * 4)) * B;
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, B * 0.6, d), cloudMat);
    c.position.set((r() - 0.5) * R * B * 2.2, 15 * B + r() * 3 * B, (r() - 0.5) * R * B * 2.2);
    clouds.add(c);
  }
  group.add(clouds);

  // Holo-Plattform unter der Figur
  const holo = new THREE.Group();
  const ringMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring1 = new THREE.Mesh(new THREE.RingGeometry(17, 18, 96), ringMat(0x3cf0ff, 0.9));
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(20.5, 21, 6, 1), ringMat(0xb26bff, 0.8));
  const ticks = new THREE.Mesh(new THREE.RingGeometry(14, 15.5, 48, 1, 0, Math.PI * 2), ringMat(0x3cf0ff, 0.25));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(17, 64), ringMat(0x1a6a8a, 0.18));
  for (const m of [ring1, ring2, ticks, disc]) { m.rotation.x = -Math.PI / 2; holo.add(m); }
  holo.position.y = 0.15;
  group.add(holo);

  // aufsteigende Partikel
  const N = 120;
  const pts = new Float32Array(N * 3);
  const speed = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const a = r() * Math.PI * 2, d = 6 + r() * 14;
    pts.set([Math.cos(a) * d, r() * 40, Math.sin(a) * d], k * 3);
    speed[k] = 2 + r() * 5;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x7ff6ff, size: 0.6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(particles);

  scene.fog = new THREE.Fog(0xbfe3ff, 260, 900);

  let last = 0;
  return {
    group,
    update(t, camera) {
      // Kamera-Höhe in Skin-Pixeln, Bodenoberkante bei y=0: ab y<6 einblenden, ab y<-2 nur noch Hauch
      if (camera) {
        const k = Math.min(1, Math.max(0, (camera.position.y + 2) / 8));
        setGroundFade(k === 1 ? 1 : 0.1 + 0.9 * k * k);
      }
      const dt = Math.min(0.1, t - last); last = t;
      ring1.rotation.z = t * 0.25;
      ring2.rotation.z = -t * 0.15;
      ticks.rotation.z = t * 0.05;
      ring1.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
      clouds.position.x = ((t * 6) % (R * B * 2)) - R * B;
      const p = pgeo.attributes.position;
      for (let k = 0; k < N; k++) {
        let y = p.getY(k) + speed[k] * dt;
        if (y > 40) y = 0;
        p.setY(k, y);
      }
      p.needsUpdate = true;
    },
  };
}
