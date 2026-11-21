// سوق دولة الأغنياء — long covered Hamidiyeh-style souq on the reserved
// inland plot west of the dabke plaza (preview only). Procedural geometry,
// InstancedMesh shop repeats, interiors built lazily on first enter.
//
// Public hooks (no edits to app.js required):
//   window.cityPlaces.souq = { position, entrance, inside }
//   «📍 أماكن» gains a «🛍️ السوق» stop that flies the camera inside
//   first-person walk: WASD / arrows on desktop, on-screen pad on mobile
import * as THREE from 'three';
import * as layout from './layout.js';
import { palm } from './landmarks.js';

const SOUQ = layout.SOUQ || { x: -360, z: 30, w: 32, d: 168 };

const ARABIC_FONT = '"Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, sans-serif';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);

const L = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const P = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 40, ...o });
const B = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

function box(parent, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function cyl(parent, mat, rt, rb, h, x, y, z, seg = 12, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; parent.add(m); return m;
}
function shadowize(g, on) {
  if (!on) return;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transparent || m.isMeshBasicMaterial || m.isSpriteMaterial)) return;
    o.castShadow = true; o.receiveShadow = true;
  });
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function signTexture(text, { w = 1024, h = 192, bg = '#6b1d1d', size = 96, border = '#d9a92a' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
    g.font = `800 ${size}px ${ARABIC_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grd.addColorStop(0, '#fff1b8'); grd.addColorStop(0.5, '#f3cf6a'); grd.addColorStop(1, '#b8862a');
    g.fillStyle = grd; g.fillText(text, w / 2, h / 2 + 6); tex.needsUpdate = true;
  };
  draw();
  try { if (document.fonts && document.fonts.load) document.fonts.load(`800 ${size}px Cairo`, text).then(draw).catch(() => {}); } catch { /* */ }
  return tex;
}

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.3, 'rgba(255,210,140,0.5)');
  gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = new THREE.CanvasTexture(c); _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}
function makeGlowSet() {
  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture(), color: 0xffd9a0, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const day = new THREE.Color(0xd8d2c4), night = new THREE.Color(0xfff0c8);
  return {
    haloMat, bulbMat,
    halo(parent, x, y, z, s = 3) {
      const sp = new THREE.Sprite(haloMat); sp.position.set(x, y, z); sp.scale.set(s, s, 1); parent.add(sp); return sp;
    },
    setNight(n) {
      haloMat.opacity = 0.04 + 0.82 * n;
      bulbMat.color.copy(day).lerp(night, Math.min(1, n * 1.4));
    },
  };
}

function instanced(geo, mat, poses, parent) {
  const mesh = new THREE.InstancedMesh(geo, mat, poses.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion();
  const s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < poses.length; i++) {
    const t = poses[i];
    p.set(t.x, t.y, t.z);
    e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    q.setFromEuler(e);
    s.set(t.sx || 1, t.sy || 1, t.sz || 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (t.color) mesh.setColorAt(i, t.color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  if (parent) parent.add(mesh);
  return mesh;
}

function vaultTexture() {
  // Stone barrel with circular light-holes (Hamidiyeh-style light spots).
  const map = canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#cbb89a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = i % 2 ? '#d8c7a8' : '#bda887';
      g.fillRect((i / 80) * w + 4, 0, 10, h);
    }
    g.fillStyle = '#b39a78';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 6, h);
    const holes = 22;
    for (let i = 0; i < holes; i++) {
      const x = ((i + 0.5) / holes) * w;
      for (const y of [h * 0.35, h * 0.65]) {
        g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2);
        g.fillStyle = '#1a120c'; g.fill();
        g.beginPath(); g.arc(x - 1, y - 1, 6, 0, Math.PI * 2);
        g.fillStyle = '#6a5a40'; g.fill();
      }
    }
  }, [1, 1]);
  const alpha = canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const holes = 22;
    for (let i = 0; i < holes; i++) {
      const x = ((i + 0.5) / holes) * w;
      for (const y of [h * 0.35, h * 0.65]) {
        g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2);
        g.fillStyle = '#000'; g.fill();
      }
    }
  }, [1, 1]);
  return { map, alpha };
}

function awningTexture(a, b) {
  return canvasTex(256, 64, (g, w, h) => {
    const n = 10;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i / n) * w, 0, w / n + 1, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 8, w, 8);
  });
}

function carpetTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6b1d1d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a2a2a';
    for (let i = 0; i < 16; i++) g.fillRect(i * 16, 0, 6, h);
    g.strokeStyle = '#d9a92a'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#c9a227';
    for (let x = 24; x < w; x += 48) {
      g.beginPath(); g.moveTo(x, h / 2); g.arc(x, h / 2, 8, 0, Math.PI * 2); g.fill();
    }
  }, [8, 1]);
}

const SHOP_KINDS = [
  { key: 'spices', name: 'بهارات', awn: ['#8a1e1e', '#f3e6c8'], acc: 0xb85a1a },
  { key: 'fabric', name: 'أقمشة', awn: ['#1f6b47', '#f3e6c8'], acc: 0x2a6b8c },
  { key: 'sweets', name: 'حلويات', awn: ['#a33a6a', '#f3e6c8'], acc: 0xe8c4d0 },
  { key: 'gold', name: 'ذهب', awn: ['#8a6a12', '#f7efd2'], acc: 0xd9a92a },
  { key: 'coffee', name: 'بن', awn: ['#5a3a22', '#f3e6c8'], acc: 0x6b3f24 },
  { key: 'carpet', name: 'سجاد', awn: ['#6b1d1d', '#e8d5a0'], acc: 0x7a2a2a },
  { key: 'copper', name: 'نحاس', awn: ['#8a4a12', '#f3e6c8'], acc: 0xb87333 },
  { key: 'perfume', name: 'عطور', awn: ['#2e4a6b', '#f3e6c8'], acc: 0xc8a0d0 },
  { key: 'soap', name: 'صابون', awn: ['#2e6b4a', '#f3e6c8'], acc: 0xd0e0c8 },
  { key: 'lamps', name: 'فوانيس', awn: ['#4a2a6b', '#f3e6c8'], acc: 0xd9a92a },
];

// ---- geometry constants (fits the reserved 32 × 168 m plot, street along Z)
const HALF_L = 78;          // covered half-length along Z
const STREET_W = 8.6;       // clear street width (X)
const SHOP_D = 6.0;         // shop depth
const SHOP_W = 8.2;         // shop front width
const PITCH = 9.2;          // shop pitch along the street
const N_SIDE = 15;
const LINTEL = 4.35;
const WALL_H = 5.5;
const VAULT_R = STREET_W / 2 + 0.15; // ~4.45
const EAST = STREET_W / 2;  // shop fronts at ±EAST

function shopSlots() {
  // 15 shops on the west row, 14 on the east row (the mid bay is the city-facing
  // gate) — 29 fronts, about the 30 asked for. East shops skip z≈0 so the gate stays clear.
  const slots = [];
  let n = 1;
  const mid = (N_SIDE - 1) / 2;
  const zs = [];
  for (let i = 0; i < N_SIDE; i++) zs.push((i - mid) * PITCH);
  const push = (side, z) => {
    slots.push({
      n, side, z,
      ry: side < 0 ? -Math.PI / 2 : Math.PI / 2,
      kind: SHOP_KINDS[(n - 1) % SHOP_KINDS.length],
    });
    n += 1;
  };
  for (const z of zs) push(-1, z);
  for (const z of zs) {
    if (Math.abs(z) < 0.01) continue;
    push(1, z);
  }
  return slots;
}

function shopFrontX(side) { return side * EAST; }
function shopCenterX(side) { return side * (EAST + SHOP_D / 2); }

// =====================================================================
export function createSouq({ scene, groundY, quality }) {
  const qs = quality || {};
  const low = qs === 'low' || qs.pixelRatio === 1 && qs.shadows === false || (typeof qs === 'string' && qs === 'low');
  const qName = typeof qs === 'string' ? qs : (qs.shadows === false && qs.pixelRatio <= 1 ? 'low' : (qs.bloom ? 'high' : 'mid'));
  const isLow = qName === 'low' || low;

  const root = new THREE.Group();
  root.name = 'souq';
  const y0 = typeof groundY === 'function' ? groundY(SOUQ.x, SOUQ.z) : 2.6;
  root.position.set(SOUQ.x, y0, SOUQ.z);
  if (scene) scene.add(root);

  const glow = makeGlowSet();
  const slots = shopSlots();
  const warmMats = [];

  const stone = L(0xe6d6b4);
  const stone2 = L(0xd4c19a);
  const stoneDark = L(0xc4b08a);
  const cobble = L(0xc9b89a);
  const runnerM = L(0x6b1d1d, { map: carpetTex() });
  const wood = L(0x5a3a22);
  const wood2 = L(0x7a5230);
  const gold = P(0xd9a92a, { shininess: 80, specular: 0x886622 });
  const plaster = L(0xf0e4c8);
  const trim = L(0x6b1d1d);

  // Ground pad + cobbled street + carpet runner
  box(root, stoneDark, SOUQ.w + 6, 0.28, SOUQ.d + 8, 0, 0.12, 0);
  box(root, cobble, STREET_W + 0.4, 0.08, HALF_L * 2 + 2, 0, 0.28, 0);
  box(root, runnerM, 2.2, 0.03, HALF_L * 2 - 6, 0, 0.33, 0);

  // Shop floors (instanced)
  const floorPos = slots.map((s) => ({
    x: shopCenterX(s.side), y: 0.32, z: s.z,
    sx: SHOP_D, sy: 1, sz: SHOP_W + 0.4,
  }));
  instanced(new THREE.BoxGeometry(1, 0.12, 1), L(0xb89a72), floorPos, root);

  // Back walls, side piers, lintels (instanced)
  const backPos = slots.map((s) => ({
    x: s.side * (EAST + SHOP_D - 0.2), y: WALL_H / 2, z: s.z,
    sx: 0.45, sy: 1, sz: SHOP_W + 0.6,
  }));
  instanced(new THREE.BoxGeometry(1, WALL_H, 1), stone, backPos, root);

  const pierPos = [];
  for (const s of slots) {
    for (const dz of [-SHOP_W / 2 - 0.25, SHOP_W / 2 + 0.25]) {
      pierPos.push({
        x: shopCenterX(s.side), y: WALL_H / 2 + 0.05, z: s.z + dz,
        sx: SHOP_D + 0.2, sy: 1, sz: 0.5,
      });
    }
  }
  instanced(new THREE.BoxGeometry(1, WALL_H + 0.1, 1), stone2, pierPos, root);

  const lintelPos = slots.map((s) => ({
    x: shopCenterX(s.side), y: LINTEL + 0.55, z: s.z,
    sx: SHOP_D + 0.2, sy: 1, sz: SHOP_W + 0.7,
  }));
  instanced(new THREE.BoxGeometry(1, 1.3, 1), stoneDark, lintelPos, root);

  // Cornice along both shop rows
  for (const side of [-1, 1]) {
    box(root, stone2, 0.7, 0.35, HALF_L * 2 + 2, side * (EAST + SHOP_D + 0.15), WALL_H + 0.15, 0);
    // merlons on the outer parapet
    const merlonPos = [];
    for (let z = -HALF_L + 2; z <= HALF_L - 2; z += 3.2) {
      merlonPos.push({ x: side * (EAST + SHOP_D + 0.15), y: WALL_H + 0.7, z, sx: 0.55, sy: 1, sz: 1.1 });
    }
    instanced(new THREE.BoxGeometry(1, 0.8, 1), stone, merlonPos, root);
  }

  // Front arch frames (instanced extruded arch)
  {
    const archW = 5.6, archH = 3.9, depth = 0.45, frame = 0.35;
    const s = new THREE.Shape();
    s.moveTo(-archW / 2 - frame, 0);
    s.lineTo(archW / 2 + frame, 0);
    s.lineTo(archW / 2 + frame, archH + frame);
    s.lineTo(-archW / 2 - frame, archH + frame);
    s.closePath();
    const hole = new THREE.Path();
    const r = archW / 2;
    hole.moveTo(-r, 0); hole.lineTo(-r, archH - r * 0.7);
    hole.quadraticCurveTo(-r, archH, 0, archH);
    hole.quadraticCurveTo(r, archH, r, archH - r * 0.7);
    hole.lineTo(r, 0); hole.closePath();
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: isLow ? 5 : 8 });
    geo.translate(0, 0, -depth / 2);
    const archPos = slots.map((sl) => ({
      x: shopFrontX(sl.side) + sl.side * 0.05, y: 0.3, z: sl.z, ry: sl.ry,
    }));
    instanced(geo, wood, archPos, root);
  }

  // Awnings (instanced, striped per-kind via a few materials)
  {
    const awnGeo = new THREE.BoxGeometry(1.7, 0.08, SHOP_W * 0.92);
    const byKind = new Map();
    for (const sl of slots) {
      const k = sl.kind.key;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k).push({
        x: shopFrontX(sl.side) - sl.side * 0.85, y: LINTEL - 0.15, z: sl.z,
        rz: sl.side * 0.28,
      });
    }
    for (const sl of slots) {
      if (byKind.get(sl.kind.key)._done) continue;
      const list = byKind.get(sl.kind.key);
      const tex = awningTexture(sl.kind.awn[0], sl.kind.awn[1]);
      instanced(awnGeo, L(0xffffff, { map: tex }), list, root);
      byKind.get(sl.kind.key)._done = true;
    }
  }

  // Counters (always present — cheap, helps the street read as a souq from outside)
  const counterPos = slots.map((s) => ({
    x: shopFrontX(s.side) + s.side * 1.15, y: 0.85, z: s.z,
    sx: 1.1, sy: 1, sz: SHOP_W * 0.72,
  }));
  instanced(new THREE.BoxGeometry(1, 1.1, 1), wood2, counterPos, root);

  // Signs «محل ١» … hanging in front of each shop
  const signGroup = new THREE.Group(); root.add(signGroup);
  for (const s of slots) {
    const tex = signTexture(`محل ${arNum(s.n)}`, {
      w: 768, h: 160, bg: '#5a1616', size: 92,
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    warmMats.push({ m: mat, day: 0xe6dccb, night: 0xffffff });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), mat);
    pl.position.set(shopFrontX(s.side) - s.side * 0.75, 3.45, s.z);
    pl.rotation.y = s.ry;
    signGroup.add(pl);
  }

  // Barrel vault: thin semicircle extruded along Z so the arch opens downward over the street.
  const vt = vaultTexture();
  const vaultMat = new THREE.MeshLambertMaterial({ map: vt.map, side: THREE.DoubleSide });
  const vaultLen = HALF_L * 2 + 1.2;
  const R = VAULT_R, thick = 0.22;
  const vShape = new THREE.Shape();
  // Upper semicircle (clockwise from left to right over +Y), then back along the inner arc.
  vShape.absarc(0, 0, R + thick, Math.PI, 0, true);
  vShape.absarc(0, 0, R, 0, Math.PI, false);
  vShape.closePath();
  const vaultGeo = new THREE.ExtrudeGeometry(vShape, {
    depth: vaultLen, bevelEnabled: false, curveSegments: isLow ? 12 : 20, steps: 1,
  });
  vaultGeo.translate(0, 0, -vaultLen / 2);
  const vault = new THREE.Mesh(vaultGeo, vaultMat);
  vault.position.y = LINTEL + 0.05;
  root.add(vault);

  // Vault ribs
  const ribPos = [];
  for (let z = -HALF_L + 1; z <= HALF_L - 1; z += 9.2) {
    ribPos.push({ x: 0, y: LINTEL + 0.05, z, rx: Math.PI / 2 });
  }
  const ribGeo = new THREE.TorusGeometry(VAULT_R + 0.04, 0.08, 6, isLow ? 12 : 20, Math.PI);
  instanced(ribGeo, stoneDark, ribPos, root);

  // End walls + grand pointed arches (north / south portals)
  function portal(zSign, label) {
    const z = zSign * HALF_L;
    const g = new THREE.Group(); g.position.z = z; root.add(g);
    const thick = 2.4;
    // wall slab with an arch hole
    const W = STREET_W + SHOP_D * 2 + 1.2, H = 9.2;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path();
    const aw = 6.4, ah = 7.0, r = aw / 2;
    hole.moveTo(-r, 0); hole.lineTo(-r, ah - r * 0.85);
    hole.quadraticCurveTo(-r, ah, 0, ah);
    hole.quadraticCurveTo(r, ah, r, ah - r * 0.85);
    hole.lineTo(r, 0); hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: isLow ? 6 : 10 });
    geo.translate(0, 0, -thick / 2);
    g.add(new THREE.Mesh(geo, stone));
    // gold band + name
    box(g, gold, W - 1, 0.18, thick + 0.1, 0, 8.15, 0);
    const tex = signTexture(label, { w: 1536, h: 192, size: 108, bg: '#6b1d1d' });
    const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    warmMats.push({ m: sm, day: 0xe8dcc0, night: 0xffffff });
    for (const dir of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), sm);
      pl.position.set(0, 8.55, dir * (thick / 2 + 0.04));
      if (dir === 1) pl.rotation.y = Math.PI;
      g.add(pl);
    }
    // corner towers / finials
    for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) {
      cyl(g, stone2, 0.55, 0.65, 10.2, x, 5.1, 0, 10);
      cyl(g, gold, 0.18, 0.02, 0.8, x, 10.55, 0, 8);
      box(g, stone, 1.3, 0.7, 1.3, x, 10.0, 0);
    }
    return g;
  }
  portal(-1, 'سوق دولة الأغنياء');
  portal(1, 'سوق دولة الأغنياء');

  // East city-facing gate (mid, z=0) — a pointed arch through the east shop row
  {
    const x = EAST + SHOP_D * 0.35;
    const thick = 2.2, W = 8.4, H = 8.2;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path();
    const aw = 5.4, ah = 6.3, r = aw / 2;
    hole.moveTo(-r, 0); hole.lineTo(-r, ah - r * 0.8);
    hole.quadraticCurveTo(-r, ah, 0, ah);
    hole.quadraticCurveTo(r, ah, r, ah - r * 0.8);
    hole.lineTo(r, 0); hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: isLow ? 6 : 10 });
    geo.translate(0, 0, -thick / 2);
    const gate = new THREE.Mesh(geo, stone);
    gate.position.set(x, 0, 0);
    gate.rotation.y = Math.PI / 2;
    root.add(gate);
    const tex = signTexture('سوق دولة الأغنياء', { w: 1536, h: 192, size: 100, bg: '#6b1d1d' });
    const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    warmMats.push({ m: sm, day: 0xe8dcc0, night: 0xffffff });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 1.15), sm);
    pl.position.set(x + 1.2, 7.15, 0);
    pl.rotation.y = Math.PI / 2;
    root.add(pl);
    box(root, gold, 0.2, 0.16, 8.6, x + 1.2, 6.5, 0);
  }

  // East plaza + fountain + palms + path toward the dabke / city
  box(root, stone2, 14, 0.2, 16, EAST + SHOP_D + 5.5, 0.16, 0);
  {
    const fx = EAST + SHOP_D + 5.2;
    cyl(root, stoneDark, 2.1, 2.3, 0.45, fx, 0.45, 0, 10);
    cyl(root, stone, 1.5, 1.7, 0.55, fx, 0.75, 0, 10);
    cyl(root, L(0x6aa0c8), 1.15, 1.15, 0.12, fx, 1.0, 0, 12);
    cyl(root, stone2, 0.18, 0.22, 1.1, fx, 1.5, 0, 8);
    const spout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), L(0x8ec4e0, { transparent: true, opacity: 0.7 }));
    spout.position.set(fx, 2.15, 0); root.add(spout);
    if (typeof palm === 'function') {
      palm(root, fx + 4.2, 5.2, 0.2, 0.85, 0.1);
      palm(root, fx + 4.4, -5.4, 0.2, 0.9, -0.08);
      palm(root, fx + 1.5, 7.2, 0.2, 0.7, 0.14);
    }
  }
  // stone path east toward the wedding plaza
  {
    const path = L(0xc2b08c);
    box(root, path, 70, 0.12, 3.2, EAST + SHOP_D + 42, 0.14, 0);
    box(root, stoneDark, 70, 0.08, 3.6, EAST + SHOP_D + 42, 0.08, 0);
  }

  // Hanging lanterns along the vault (instanced + glow sprites)
  const lanterns = new THREE.Group(); root.add(lanterns);
  const step = isLow ? 16 : 9.2;
  const lanternPos = [];
  for (let z = -HALF_L + 6; z <= HALF_L - 6; z += step) lanternPos.push(z);
  const lanternBody = new THREE.BoxGeometry(0.32, 0.5, 0.32);
  const lanternCap = new THREE.ConeGeometry(0.22, 0.22, 8);
  const lanternMat = P(0x3a2a18, { shininess: 30 });
  const bodyIM = instanced(lanternBody, lanternMat, lanternPos.map((z) => ({ x: 0, y: LINTEL + VAULT_R - 1.15, z })), lanterns);
  instanced(lanternCap, gold, lanternPos.map((z) => ({ x: 0, y: LINTEL + VAULT_R - 0.82, z })), lanterns);
  // chain
  instanced(
    new THREE.CylinderGeometry(0.015, 0.015, 1.0, 5),
    L(0x3a3a3a),
    lanternPos.map((z) => ({ x: 0, y: LINTEL + VAULT_R - 0.45, z })),
    lanterns,
  );
  const bulbs = [];
  for (const z of lanternPos) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow.bulbMat);
    bulb.position.set(0, LINTEL + VAULT_R - 1.15, z);
    lanterns.add(bulb);
    glow.halo(lanterns, 0, LINTEL + VAULT_R - 1.25, z, isLow ? 2.2 : 3.2);
    bulbs.push(bulb);
  }
  void bodyIM;

  // Lazy interior (goods) — built once when the camera enters
  const interior = new THREE.Group();
  interior.name = 'souqInterior';
  interior.visible = false;
  root.add(interior);
  let interiorBuilt = false;

  function buildGoods() {
    if (interiorBuilt) return;
    interiorBuilt = true;
    const maxItems = isLow ? 3 : 6;
    const sackGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const jarGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.38, 8);
    const rollGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8);
    const trayGeo = new THREE.BoxGeometry(0.7, 0.06, 0.5);
    const crateGeo = new THREE.BoxGeometry(0.55, 0.32, 0.4);
    const potGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.28, 8);
    const bottleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.32, 6);
    const colors = {
      spices: [0xb85a1a, 0xc9a227, 0x8a1e1e, 0xd4a84a, 0x5a7a2a, 0x6b3f24],
      fabric: [0x8a1e1e, 0x1f6b47, 0x2a6b8c, 0xd9a92a, 0x6b1d5a, 0xe8d5a0],
      sweets: [0xf2d0c8, 0xe8c45a, 0xd4a0b0, 0xf0e6c8, 0xc07040],
      gold: [0xd9a92a, 0xf3cf6a, 0xb8862a],
      coffee: [0x6b3f24, 0x4a2a18, 0xc4a07a],
      carpet: [0x6b1d1d, 0x1f6b47, 0x2a4a6b, 0xd9a92a],
      copper: [0xb87333, 0xc4893f, 0x8a4a12],
      perfume: [0xc8a0d0, 0xe8d5b0, 0x6a8ab0, 0xd9a92a],
      soap: [0xd0e0c8, 0xf0e6c8, 0xc8dce0, 0xe8c4d0],
      lamps: [0xd9a92a, 0x3a2a18, 0xb8862a],
    };
    const matCache = new Map();
    const M = (hex) => {
      if (matCache.has(hex)) return matCache.get(hex);
      const m = L(hex); matCache.set(hex, m); return m;
    };
    for (const s of slots) {
      const cols = colors[s.kind.key] || colors.spices;
      const baseX = shopFrontX(s.side) + s.side * 1.15;
      const facing = s.side; // +1 east shops (goods sit further east / into the shop)
      const inward = -facing; // toward the street is not used for placement
      void inward;
      const gx = baseX + facing * 0.2;
      const place = (mesh, dx, y, dz) => {
        mesh.position.set(gx + facing * dx, y, s.z + dz);
        interior.add(mesh);
        return mesh;
      };
      if (s.kind.key === 'fabric') {
        for (let i = 0; i < maxItems; i++) {
          const m = new THREE.Mesh(rollGeo, M(cols[i % cols.length]));
          m.rotation.z = Math.PI / 2;
          place(m, 0.3 + (i % 3) * 0.2, 1.55 + Math.floor(i / 3) * 0.34, (i % 3 - 1) * 0.7);
        }
      } else if (s.kind.key === 'gold') {
        const caseM = new THREE.MeshLambertMaterial({ color: 0x9fd2e4, transparent: true, opacity: 0.28, depthWrite: false });
        place(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.4), caseM), 0.1, 1.7, 0);
        for (let i = 0; i < 4; i++) {
          place(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), M(cols[i % cols.length])), 0.1, 1.48, (i - 1.5) * 0.28);
        }
      } else if (s.kind.key === 'carpet') {
        for (let i = 0; i < Math.min(maxItems, 4); i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.7), M(cols[i % cols.length]));
          m.rotation.y = 0.15 * i;
          place(m, 0.8, 1.5 + i * 0.13, (i - 1) * 0.15);
        }
      } else if (s.kind.key === 'lamps') {
        for (let i = 0; i < maxItems; i++) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow.bulbMat);
          const cage = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(cols[0]));
          cage.material = P(0xd9a92a, { shininess: 70, wireframe: false, transparent: true, opacity: 0.85 });
          g.add(body); g.add(cage);
          place(g, 0.2, 1.7, (i - (maxItems - 1) / 2) * 0.55);
        }
      } else if (s.kind.key === 'sweets') {
        for (let i = 0; i < maxItems; i++) {
          place(new THREE.Mesh(trayGeo, M(0x8a5a2a)), 0.05, 1.46, (i - (maxItems - 1) / 2) * 0.55);
          for (let k = 0; k < 5; k++) {
            const sw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), M(cols[k % cols.length]));
            place(sw, 0.05 + (k % 3 - 1) * 0.12, 1.54, (i - (maxItems - 1) / 2) * 0.55 + (Math.floor(k / 3) - 0.5) * 0.12);
          }
        }
      } else if (s.kind.key === 'perfume' || s.kind.key === 'soap') {
        const geo = s.kind.key === 'perfume' ? bottleGeo : crateGeo;
        for (let i = 0; i < maxItems + 2; i++) {
          place(new THREE.Mesh(geo, M(cols[i % cols.length])), (i % 3) * 0.2, s.kind.key === 'soap' ? 1.6 : 1.62, (Math.floor(i / 3) - 1) * 0.45);
        }
      } else if (s.kind.key === 'copper') {
        for (let i = 0; i < maxItems; i++) {
          place(new THREE.Mesh(potGeo, M(cols[i % cols.length])), (i % 2) * 0.35, 1.58, (Math.floor(i / 2) - 1) * 0.5);
        }
      } else {
        // spices / coffee / default: sacks + jars
        for (let i = 0; i < maxItems; i++) {
          const sack = new THREE.Mesh(sackGeo, M(cols[i % cols.length]));
          sack.scale.set(1, 0.75, 1);
          place(sack, 0.4 + (i % 2) * 0.35, 1.15, (Math.floor(i / 2) - 1) * 0.55);
        }
        for (let i = 0; i < Math.min(4, maxItems); i++) {
          place(new THREE.Mesh(jarGeo, M(cols[(i + 2) % cols.length])), 0.05, 1.6, (i - 1.5) * 0.4);
        }
      }
      void crateGeo;
    }
    interior.visible = true;
    shadowize(interior, !isLow && qs && qs.shadows);
  }

  function ensureInterior(force) {
    const app = window.MonacoApp;
    if (!app || !app.camera) { if (force) buildGoods(); return; }
    const c = app.camera.position;
    const dx = c.x - SOUQ.x, dz = c.z - SOUQ.z;
    const near = force || (dx * dx + dz * dz) < 90 * 90;
    if (near) buildGoods();
    interior.visible = near || interiorBuilt;
  }

  // Night sync
  let lastNight = 0;
  function setNight(n) {
    n = Math.max(0, Math.min(1, n || 0));
    if (Math.abs(n - lastNight) < 0.015) return;
    lastNight = n;
    glow.setNight(n);
    for (const w of warmMats) {
      const col = w.day.clone ? undefined : null;
      void col;
      if (typeof w.day === 'number') {
        const c = new THREE.Color(w.day).lerp(new THREE.Color(w.night), n);
        w.m.color.copy(c);
      }
    }
    runnerM.emissive = runnerM.emissive || new THREE.Color(0x000000);
    if (runnerM.emissive) runnerM.emissive.setHex(0x3a1010).multiplyScalar(n * 0.25);
    vaultMat.emissive = vaultMat.emissive || new THREE.Color(0x000000);
    if (vaultMat.emissive) vaultMat.emissive.setRGB(0.15 * n, 0.08 * n, 0.02 * n);
  }
  setNight(0);

  shadowize(root, !isLow && qs && qs.shadows !== false);

  // The blocks layer left a temporary backwards «السوق» billboard on this lot;
  // hide it now that the real souq stands here.
  if (scene) {
    const sx = SOUQ.x + SOUQ.w / 2 + 0.2, sz = SOUQ.z;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.position;
      if (Math.abs(p.x - sx) < 0.8 && Math.abs(p.z - sz) < 0.8 && Math.abs(p.y - (y0 + 4.2)) < 2) {
        if (o.geometry && o.geometry.type === 'PlaneGeometry') o.visible = false;
      }
    });
  }

  // Camera views (world space)
  const gy = y0;
  const views = {
    aerial: {
      pos: new THREE.Vector3(SOUQ.x + 70, gy + 55, SOUQ.z + 90),
      target: new THREE.Vector3(SOUQ.x, gy + 4, SOUQ.z),
    },
    entrance: {
      pos: new THREE.Vector3(SOUQ.x + EAST + SHOP_D + 13, gy + 2.5, SOUQ.z + 4.2),
      target: new THREE.Vector3(SOUQ.x + 2, gy + 3.2, SOUQ.z),
    },
    inside: {
      pos: new THREE.Vector3(SOUQ.x, gy + 1.7, SOUQ.z + 22),
      target: new THREE.Vector3(SOUQ.x, gy + 1.85, SOUQ.z - 18),
    },
    insideNorth: {
      pos: new THREE.Vector3(SOUQ.x, gy + 1.7, SOUQ.z - 22),
      target: new THREE.Vector3(SOUQ.x, gy + 1.85, SOUQ.z + 18),
    },
    shop: {
      pos: new THREE.Vector3(SOUQ.x + 0.4, gy + 1.65, SOUQ.z + PITCH * 2.4),
      target: new THREE.Vector3(SOUQ.x + shopFrontX(-1) * 0.7, gy + 1.45, SOUQ.z + PITCH * 2.55),
    },
  };

  const entrance = { x: SOUQ.x + EAST + SHOP_D + 3.5, y: gy, z: SOUQ.z };
  const insidePt = { x: SOUQ.x, y: gy, z: SOUQ.z };
  const position = { x: SOUQ.x, y: gy, z: SOUQ.z };

  return {
    root, setNight, views, center: new THREE.Vector3(SOUQ.x, gy, SOUQ.z),
    kind: 'souq', ensureInterior, buildGoods, glow,
    entrance, inside: insidePt, position, y0, slots, isLow,
    bounds: { halfL: HALF_L, streetW: STREET_W, y0 },
  };
}

// =====================================================================
// Boot + hooks (tour, cityPlaces, walk mode) — self-contained.
// =====================================================================
const PLACE_LABEL = '🛍️ السوق';

function v3ground(x, z, lift = 0) {
  const app = window.MonacoApp;
  const y = (app && typeof app.groundY === 'function' ? app.groundY(x, z) : 2.6) + lift;
  return { x, y, z };
}

function registerCityPlace(souq) {
  const rec = {
    key: 'souq',
    name: 'سوق دولة الأغنياء',
    position: v3ground(SOUQ.x, SOUQ.z),
    entrance: v3ground(souq.entrance.x, souq.entrance.z),
    inside: v3ground(souq.inside.x, souq.inside.z, 0),
  };
  if (!window.cityPlaces) window.cityPlaces = {};
  window.cityPlaces.souq = rec;
  return rec;
}

function injectWalkUI() {
  if (document.getElementById('souqWalk')) return;
  const css = document.createElement('style');
  css.textContent = `
    #souqWalk { position: fixed; inset: 0; pointer-events: none; z-index: 8; font-family: Cairo, "Noto Naskh Arabic", Tahoma, sans-serif; }
    #souqWalk .pad { pointer-events: auto; position: absolute; right: 14px; bottom: 128px; display: grid; grid-template-columns: 56px 56px 56px; grid-template-rows: 56px 56px 56px; gap: 6px; direction: ltr; }
    #souqWalk .pad .l { grid-column: 1; grid-row: 2; }
    #souqWalk .pad .r { grid-column: 3; grid-row: 2; }
    #souqWalk .pad .f { grid-column: 2; grid-row: 1; }
    #souqWalk .pad .b { grid-column: 2; grid-row: 3; }
    #souqWalk .pad button, #souqEnter, #souqExit {
      pointer-events: auto; border: 1px solid rgba(217,169,42,0.55); background: rgba(18,16,12,0.72);
      color: #f3efdf; font-weight: 800; border-radius: 14px; min-width: 56px; min-height: 56px;
      font-size: 22px; backdrop-filter: blur(8px); cursor: pointer;
    }
    #souqEnter, #souqExit {
      position: absolute; padding: 0 16px; height: 46px;
      font-size: 16px; white-space: nowrap; min-width: 0;
    }
    #souqEnter { left: 50%; transform: translateX(-50%); bottom: 200px; }
    #souqExit { right: 14px; bottom: 340px; }
    #souqWalk.hidden, #souqWalk .pad.hidden, #souqEnter.hidden, #souqExit.hidden { display: none !important; }
    @media (min-width: 900px) {
      #souqWalk .pad, #souqExit { left: 18px; right: auto; }
    }
  `;
  document.head.appendChild(css);
  const wrap = document.createElement('div');
  wrap.id = 'souqWalk';
  wrap.className = 'hidden';
  wrap.innerHTML = `
    <button id="souqEnter" type="button" class="hidden">امشي بالسوق</button>
    <button id="souqExit" type="button" class="hidden">خروج من السوق</button>
    <div class="pad hidden" id="souqPad">
      <button class="f" type="button" data-dir="f" aria-label="قدام">▲</button>
      <button class="l" type="button" data-dir="l" aria-label="يسار">◄</button>
      <button class="r" type="button" data-dir="r" aria-label="يمين">►</button>
      <button class="b" type="button" data-dir="b" aria-label="ورا">▼</button>
    </div>
  `;
  document.body.appendChild(wrap);
  return wrap;
}

function boot() {
  const start = () => {
    if (!window.__ready || !window.MonacoApp || !window.MonacoApp.scene) {
      setTimeout(start, 120); return;
    }
    try { initSouq(); } catch (e) { console.warn('souq init', e); }
  };
  start();
}

let _souq = null;
let walking = false;
let walkYaw = 0; // 0 looks north (−Z) down the covered street
const keys = Object.create(null);
const hold = { f: 0, b: 0, l: 0, r: 0 };
let fly = null;
let ui = null;
let atSouq = false;

function qualityOf(app) {
  if (app.getQuality) return app.getQuality();
  return app.quality || 'mid';
}

function initSouq() {
  if (_souq) return _souq;
  const app = window.MonacoApp;
  const souq = createSouq({
    scene: app.scene,
    groundY: app.groundY,
    quality: qualityOf(app),
  });
  _souq = souq;
  registerCityPlace(souq);
  // Re-apply if the other add-ons rebuild cityPlaces after us.
  const recapture = () => { if (!window.cityPlaces || !window.cityPlaces.souq) registerCityPlace(souq); };
  setTimeout(recapture, 600);
  setTimeout(recapture, 2000);
  setTimeout(recapture, 5000);

  app.souq = souq;
  window.__souq = souq;

  ui = injectWalkUI();
  bindWalk(souq, app);
  hookPlacesButton(souq, app);
  hookNightAndLoop(souq, app);
  return souq;
}

function setFound(text, show) {
  const el = document.getElementById('foundMsg');
  if (!el) return;
  if (show === false) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false;
}

function flyCam(app, pos, target, dur) {
  if (app.tour && app.tour.pause) app.tour.pause();
  if (typeof app.setCamMode === 'function') app.setCamMode('free', true);
  const cam = app.camera, ctl = app.controls;
  if (!cam || !ctl) return;
  if (!dur || dur <= 0) {
    cam.position.copy(pos); ctl.target.copy(target); ctl.update(); fly = null; return;
  }
  fly = {
    t0: performance.now(), dur: dur * 1000,
    fromP: cam.position.clone(), fromT: ctl.target.clone(),
    toP: pos.clone ? pos.clone() : new THREE.Vector3().copy(pos),
    toT: target.clone ? target.clone() : new THREE.Vector3().copy(target),
  };
}

function updateFly(app, now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.dur);
  const s = k * k * (3 - 2 * k);
  app.camera.position.lerpVectors(fly.fromP, fly.toP, s);
  app.controls.target.lerpVectors(fly.fromT, fly.toT, s);
  app.controls.update();
  if (k >= 1) fly = null;
}

export function viewSouq(which = 'inside', instant = false) {
  const app = window.MonacoApp;
  if (!_souq || !app) return;
  const v = _souq.views[which] || _souq.views.inside;
  atSouq = true;
  window.__interiorCam = true;
  _souq.ensureInterior(true);
  flyCam(app, v.pos, v.target, instant ? 0 : 1.6);
  setFound('📍 ' + PLACE_LABEL, true);
  showEnter(true);
  showExit(walking);
}

function showEnter(on) {
  const b = document.getElementById('souqEnter');
  if (b) b.classList.toggle('hidden', !on || walking);
  if (ui) ui.classList.toggle('hidden', !(on || walking));
}
function showExit(on) {
  const b = document.getElementById('souqExit');
  if (b) b.classList.toggle('hidden', !on);
  const pad = document.getElementById('souqPad');
  if (pad) pad.classList.toggle('hidden', !on);
}

function enterWalk() {
  const app = window.MonacoApp;
  if (!_souq || !app) return;
  walking = true;
  atSouq = true;
  window.__interiorCam = true;
  fly = null;
  _souq.ensureInterior(true);
  if (app.tour && app.tour.pause) app.tour.pause();
  if (typeof app.setCamMode === 'function') app.setCamMode('free', true);
  if (app.controls) app.controls.enabled = false;
  const gy = _souq.y0;
  // Start just inside the east gate, looking west into the crossing, then the street is N/S.
  // Better: start in the nave looking south along +Z? People approaching from the city
  // come in from the east and should be able to turn. Face west first.
  walkYaw = 0;
  const start = new THREE.Vector3(SOUQ.x, gy + 1.65, SOUQ.z + 6);
  app.camera.position.copy(start);
  const look = lookPoint(start, walkYaw);
  app.controls.target.copy(look);
  app.controls.update();
  setFound(('ontouchstart' in window) ? '📍 امشي بالسوق — استخدم الأسهم' : '📍 امشي بالسوق — WASD أو الأسهم', true);
  showEnter(false);
  showExit(true);
  if (ui) ui.classList.remove('hidden');
}

function lookPoint(pos, yaw, dist = 6) {
  // yaw 0 looks −Z (north), PI/2 looks −X (west), PI looks +Z (south), −PI/2 looks +X (east)
  return new THREE.Vector3(pos.x - Math.sin(yaw) * dist, pos.y - 0.1, pos.z - Math.cos(yaw) * dist);
}

function exitWalk(toOverview = false) {
  const app = window.MonacoApp;
  walking = false;
  if (app && app.controls) app.controls.enabled = true;
  showExit(false);
  showEnter(atSouq && !toOverview);
  if (toOverview) {
    atSouq = false;
    window.__interiorCam = false;
    if (ui) ui.classList.add('hidden');
    if (app && app.viewPlace) app.viewPlace(-1);
    setFound('📍 الخريطة', true);
  } else {
    window.__interiorCam = !!atSouq;
  }
}

function clampWalk(x, z) {
  // Stay in the covered street, or a little way out the three gates.
  const maxX = STREET_W / 2 - 0.7;
  const inNave = Math.abs(x - SOUQ.x) <= maxX && Math.abs(z - SOUQ.z) <= HALF_L - 1.2;
  const inEastGate = Math.abs(z - SOUQ.z) <= 2.6 && (x - SOUQ.x) >= -maxX && (x - SOUQ.x) <= EAST + SHOP_D + 6;
  const inEnds = Math.abs(x - SOUQ.x) <= maxX && Math.abs(z - SOUQ.z) <= HALF_L + 4;
  if (inNave || inEastGate || inEnds) return { x, z, ok: true };
  // clamp to nave
  return {
    x: Math.max(SOUQ.x - maxX, Math.min(SOUQ.x + maxX, x)),
    z: Math.max(SOUQ.z - (HALF_L - 1.2), Math.min(SOUQ.z + (HALF_L - 1.2), z)),
    ok: false,
  };
}

function tickWalk(dt, app) {
  if (!walking || !app || !app.camera) return;
  const turn = ((keys.ArrowLeft || keys.KeyQ || hold.l) ? 1 : 0) - ((keys.ArrowRight || keys.KeyE || hold.r) ? 1 : 0);
  // RTL pad: the «يسار» button sits on the right visually (►) and should turn the
  // camera toward world west/east depending on facing; treat l/r as yaw.
  walkYaw += turn * 1.8 * dt;
  let fwd = 0, strafe = 0;
  if (keys.KeyW || keys.ArrowUp || hold.f) fwd += 1;
  if (keys.KeyS || keys.ArrowDown || hold.b) fwd -= 1;
  if (keys.KeyA) strafe += 1;
  if (keys.KeyD) strafe -= 1;
  const spd = (keys.ShiftLeft || keys.ShiftRight ? 9 : 5.6);
  const cam = app.camera;
  const dx = (-Math.sin(walkYaw) * fwd + -Math.cos(walkYaw) * strafe) * spd * dt;
  const dz = (-Math.cos(walkYaw) * fwd + Math.sin(walkYaw) * strafe) * spd * dt;
  const next = clampWalk(cam.position.x + dx, cam.position.z + dz);
  const gy = (typeof app.groundY === 'function' ? app.groundY(next.x, next.z) : _souq.y0);
  cam.position.set(next.x, gy + 1.65, next.z);
  const look = lookPoint(cam.position, walkYaw);
  app.controls.target.copy(look);
  app.controls.update();
}

function bindWalk(souq, app) {
  const wrap = document.getElementById('souqWalk');
  if (!wrap) return;
  document.getElementById('souqEnter').addEventListener('click', (e) => { e.preventDefault(); enterWalk(); });
  document.getElementById('souqExit').addEventListener('click', (e) => { e.preventDefault(); exitWalk(false); atSouq = true; showEnter(true); if (app.controls) app.controls.enabled = true; });
  const pad = document.getElementById('souqPad');
  const setDir = (dir, v) => { if (dir && dir in hold) hold[dir] = v; };
  pad.addEventListener('pointerdown', (e) => {
    const d = e.target && e.target.dataset && e.target.dataset.dir;
    if (!d) return;
    e.preventDefault();
    setDir(d, 1);
    try { e.target.setPointerCapture(e.pointerId); } catch { /* */ }
  });
  pad.addEventListener('pointerup', (e) => { const d = e.target && e.target.dataset && e.target.dataset.dir; setDir(d, 0); });
  pad.addEventListener('pointercancel', (e) => { const d = e.target && e.target.dataset && e.target.dataset.dir; setDir(d, 0); });
  pad.addEventListener('pointerleave', (e) => { const d = e.target && e.target.dataset && e.target.dataset.dir; setDir(d, 0); });
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (!walking) {
      if (atSouq && (e.code === 'KeyW' || e.code === 'ArrowUp')) enterWalk();
      return;
    }
    if (e.code === 'Escape') { exitWalk(false); showEnter(true); return; }
    if (/^Arrow|Key[WASDQE]|Shift/.test(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  // drag-to-look while walking
  let drag = null;
  const canvas = app.renderer && app.renderer.domElement;
  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!walking) return;
      drag = { x: e.clientX, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!walking || !drag || e.pointerId !== drag.id) return;
      walkYaw -= (e.clientX - drag.x) * 0.005;
      drag.x = e.clientX;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
}

function hookPlacesButton(souq, app) {
  const btn = document.getElementById('btnPlaces');
  if (!btn || btn.__souqHooked) return;
  btn.__souqHooked = true;
  btn.addEventListener('click', (e) => {
    const names = (app.placeNames && app.placeNames()) || [];
    const found = document.getElementById('foundMsg');
    const cur = found && !found.hidden ? (found.textContent || '') : '';
    const onSouq = cur.indexOf('السوق') !== -1 || cur.indexOf('امشي بالسوق') !== -1;
    const last = names.length ? names[names.length - 1] : '';
    const onLast = last && cur.indexOf(last) !== -1;
    if (onSouq) {
      e.stopImmediatePropagation();
      e.preventDefault();
      exitWalk(true);
      return;
    }
    if (onLast) {
      e.stopImmediatePropagation();
      e.preventDefault();
      viewSouq('inside', false);
      return;
    }
  }, true);
}

function guessNight(app) {
  if (typeof window.__lockTod === 'number') {
    const t = window.__lockTod;
    // 0 night, 0.25 dawn, 0.5 noon, 0.75 dusk, 1 night
    const day = Math.max(0, 1 - Math.abs(((t % 1) - 0.45) * 2.2));
    return Math.max(0, Math.min(1, 1 - day));
  }
  if (!app || !app.scene) return 0;
  let sun = null;
  app.scene.traverse((o) => { if (o.isDirectionalLight && (!sun || o.intensity >= sun.intensity)) sun = o; });
  if (!sun) return 0;
  const y = sun.position.y;
  const k = Math.max(0, Math.min(1, 1 - (y / 400)));
  return k;
}

function hookNightAndLoop(souq, app) {
  if (typeof app.setTod === 'function') {
    const orig = app.setTod.bind(app);
    app.setTod = (t) => {
      const sky = orig(t);
      const n = sky && typeof sky.night === 'number' ? sky.night : guessNight(app);
      souq.setNight(n);
      return sky;
    };
  }
  let last = performance.now();
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateFly(app, now);
    tickWalk(dt, app);
    souq.setNight(guessNight(app));
    if (app && app.camera) {
      const dx = app.camera.position.x - SOUQ.x, dz = app.camera.position.z - SOUQ.z;
      const inside = Math.abs(dx) < 18 && Math.abs(dz) < HALF_L + 6;
      if (inside) souq.ensureInterior(false);
      if (walking || atSouq) window.__interiorCam = true;
      else if (inside && app.camera.position.y < souq.y0 + 6) window.__interiorCam = true;
      const lab = document.getElementById('labels');
      if (lab) lab.style.visibility = window.__interiorCam ? 'hidden' : '';
    }
  };
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { SOUQ, PLACE_LABEL, enterWalk, exitWalk };
