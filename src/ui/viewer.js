// 3D-Ansicht: Figur aus Boxen mit eigener UV-Zuordnung, Kamera, Picking. 1 Einheit = 1 Skin-Pixel (64er).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getBoxes, FACES, faceGeometry, faceRect } from '../core/layout.js';
import { buildWorld } from './world.js';

function boxGeometry(box) {
  const pos = [], nor = [], uv = [], idx = [];
  FACES.forEach((face, f) => {
    const { tl, U, V, n } = faceGeometry(box, face);
    const r = faceRect(box, face);
    const corners = [
      [tl, r.x, r.y],
      [[tl[0] + U[0], tl[1] + U[1], tl[2] + U[2]], r.x + r.w, r.y],
      [[tl[0] + V[0], tl[1] + V[1], tl[2] + V[2]], r.x, r.y + r.h],
      [[tl[0] + U[0] + V[0], tl[1] + U[1] + V[1], tl[2] + U[2] + V[2]], r.x + r.w, r.y + r.h],
    ];
    for (const [p, tx, ty] of corners) {
      pos.push(...p); nor.push(...n); uv.push(tx / 64, 1 - ty / 64);
    }
    const b = f * 4;
    idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Viewer {
  constructor(container, textureCanvas) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
    this.camera.position.set(34, 32, 80);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 16, 0);
    this.controls.zoomToCursor = true; // Mausrad zoomt zum Zeiger (verschiebt auch den Drehpunkt; ⟲ setzt zurück)
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 160;
    this.controls.maxPolarAngle = Math.PI * 0.93;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6b5a48, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(40, 90, 60);
    this.scene.add(sun);
    // Figur bekommt eigenes, gleichmäßiges Licht, damit Farben beim Malen stimmen
    this.charLight = new THREE.DirectionalLight(0xffffff, 0.55);
    this.charLight.position.set(0.3, 0.6, 1);
    this.camera.add(this.charLight);
    this.scene.add(this.camera);

    this.textureCanvas = textureCanvas;
    this.texture = this.makeTexture();

    this.innerMat = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5 });
    this.outerMat = new THREE.MeshLambertMaterial({ map: this.texture, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false });

    this.character = new THREE.Group();
    this.scene.add(this.character);
    this.meshes = [];
    this.world = buildWorld(this.scene);
    this.raycaster = new THREE.Raycaster();

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container);
    this.resize();
    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      this.controls.update();
      this.world.update(t, this.camera);
      this.renderer.render(this.scene, this.camera);
    });
  }

  makeTexture() {
    const t = new THREE.CanvasTexture(this.textureCanvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    t.userData.size = this.textureCanvas.width;
    return t;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setModel(model, res) {
    this.model = model; this.res = res;
    for (const m of this.meshes) { this.character.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    for (const layer of ['inner', 'outer']) {
      for (const box of getBoxes(model, layer)) {
        const mesh = new THREE.Mesh(boxGeometry(box), layer === 'inner' ? this.innerMat : this.outerMat);
        mesh.userData = { box, part: box.part, layer };
        mesh.renderOrder = layer === 'outer' ? 1 : 0;
        this.character.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  /** Sichtbarkeit: parts = {head:true,...}, inner/outer = bool, outerOpacity 0..1 */
  setVisibility({ parts, inner, outer, outerOpacity }) {
    this.partsVisible = parts;
    for (const m of this.meshes) {
      const layerOn = m.userData.layer === 'inner' ? inner : outer;
      m.visible = layerOn && parts[m.userData.part];
    }
    this.outerMat.opacity = outerOpacity;
  }

  textureChanged() {
    // WebGL2 reserviert Texturspeicher fest (texStorage) → bei neuer Canvas-Größe Textur neu anlegen
    if (this.texture.userData.size !== this.textureCanvas.width) {
      this.texture.dispose();
      this.texture = this.makeTexture();
      this.innerMat.map = this.texture;
      this.outerMat.map = this.texture;
    }
    this.texture.needsUpdate = true;
  }

  /** Texturpixel unter dem Mauszeiger auf der gewünschten Schicht oder null. */
  pick(clientX, clientY, layer) {
    const cr = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - cr.left) / cr.width) * 2 - 1, -((clientY - cr.top) / cr.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Raycaster prüft keine Sichtbarkeit → selbst filtern (Körperteile), Schicht nach Malziel
    const candidates = this.meshes.filter(m => m.userData.layer === layer && this.partsVisible[m.userData.part]);
    const hit = this.raycaster.intersectObjects(candidates, false)[0];
    if (!hit) return null;
    const { box } = hit.object.userData;
    const face = FACES[Math.floor(hit.faceIndex / 2)];
    const k = this.res / 64;
    const r = faceRect(box, face);
    const rect = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const x = clamp(Math.floor(hit.uv.x * this.res), rect.x, rect.x + rect.w - 1);
    const y = clamp(Math.floor((1 - hit.uv.y) * this.res), rect.y, rect.y + rect.h - 1);
    return { x, y, part: box.part, face, layer, rect };
  }

  /** Trifft der Zeiger irgendeinen sichtbaren Körperteil? (zum Entscheiden: malen oder drehen) */
  hitsCharacter(clientX, clientY, layer) { return !!this.pick(clientX, clientY, layer); }

  resetCamera() {
    this.camera.position.set(34, 32, 80);
    this.controls.target.set(0, 16, 0);
  }

  screenshot() { return this.renderer.domElement.toDataURL('image/png'); }

  setWorldVisible(v) { this.world.group.visible = v; }
}
