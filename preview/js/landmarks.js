// Preview landmarks: جامعة دولة الأغنياء (old dabke spot), مطعم البحر (east
// promenade) and a suggested-stadium marker. All procedural three.js geometry.
import * as THREE from 'three';
import { UNIVERSITY, RESTAURANT } from './layout.js';

export const STADIUM_SPOT = { x: -80, z: -190, rx: 80, rz: 55 };

const ARABIC_FONT = '"Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, sans-serif';

// ---------- small helpers ----------
const L = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const P = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 40, ...o });
function box(parent, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}
function cyl(parent, mat, rt, rb, h, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function shadowize(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transparent || m.isMeshBasicMaterial || m.isSpriteMaterial)) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

let _haloTex = null;
function haloTexture() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.25, 'rgba(255,210,140,0.55)');
  gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _haloTex = new THREE.CanvasTexture(c);
  _haloTex.colorSpace = THREE.SRGBColorSpace;
  return _haloTex;
}

// Halo sprites + bulbs that brighten at night.
function makeGlowSet() {
  const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const bulbDay = new THREE.Color(0xd8d2c4), bulbNight = new THREE.Color(0xfff0c8);
  return {
    haloMat, bulbMat,
    halo(parent, x, y, z, s = 3) {
      const sp = new THREE.Sprite(haloMat);
      sp.position.set(x, y, z);
      sp.scale.set(s, s, 1);
      parent.add(sp);
      return sp;
    },
    setNight(n) {
      haloMat.opacity = 0.05 + 0.85 * n;
      bulbMat.color.copy(bulbDay).lerp(bulbNight, Math.min(1, n * 1.4));
    },
  };
}

function lampPost(parent, glow, x, z, y0, h = 4.6, style = 'classic') {
  const pole = L(0x2e2a26);
  cyl(parent, pole, 0.09, 0.14, h, x, y0 + h / 2, z, 8);
  if (style === 'classic') {
    cyl(parent, pole, 0.22, 0.28, 0.2, x, y0 + 0.1, z, 8);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glow.bulbMat);
    lantern.position.set(x, y0 + h + 0.15, z);
    parent.add(lantern);
    cyl(parent, pole, 0.05, 0.36, 0.22, x, y0 + h + 0.55, z, 8);
  } else {
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), glow.bulbMat);
    lantern.position.set(x, y0 + h + 0.2, z);
    parent.add(lantern);
  }
  glow.halo(parent, x, y0 + h + 0.2, z, 3.2);
}

// Arabic sign texture; redraws once the web font has loaded.
function signTexture(text, { w = 1024, h = 192, bg = null, fg = '#f3cf6a', stroke = null, size = 120, border = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  function draw() {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }
    g.font = `800 ${size}px ${ARABIC_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 8; g.strokeText(text, w / 2, h / 2 + 6); }
    const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grd.addColorStop(0, '#fff1b8');
    grd.addColorStop(0.5, fg);
    grd.addColorStop(1, '#b8862a');
    g.fillStyle = grd;
    g.fillText(text, w / 2, h / 2 + 6);
    tex.needsUpdate = true;
  }
  draw();
  try {
    if (document.fonts && document.fonts.load) document.fonts.load(`800 ${size}px Cairo`, text).then(draw).catch(() => {});
  } catch { /* */ }
  return tex;
}

// Window grid texture: albedo + emissive (lit randomly) for facades.
function windowMaps(cols, rows, { wall = '#efe6d2', frame = '#cbbd9e', glass = '#5b7f99', lit = '#ffcf7a', seed = 1, litShare = 0.75 } = {}) {
  const cw = 32, rh = 48;
  const a = document.createElement('canvas'); a.width = cols * cw; a.height = rows * rh;
  const e = document.createElement('canvas'); e.width = a.width; e.height = a.height;
  const ga = a.getContext('2d'), ge = e.getContext('2d');
  ga.fillStyle = wall; ga.fillRect(0, 0, a.width, a.height);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, e.width, e.height);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 7, y = r * rh + 9, w = cw - 14, h = rh - 18;
      ga.fillStyle = frame; ga.fillRect(x - 2, y - 2, w + 4, h + 4);
      ga.fillStyle = glass; ga.fillRect(x, y, w, h);
      ga.fillStyle = 'rgba(255,255,255,0.18)'; ga.fillRect(x, y, w * 0.4, h);
      if (rnd() < litShare) { ge.fillStyle = lit; ge.fillRect(x, y, w, h); }
    }
  }
  const ta = new THREE.CanvasTexture(a); ta.colorSpace = THREE.SRGBColorSpace;
  const te = new THREE.CanvasTexture(e); te.colorSpace = THREE.SRGBColorSpace;
  return { map: ta, emissiveMap: te };
}

function facadeMat(cols, rows, opts) {
  const m = windowMaps(cols, rows, opts);
  return new THREE.MeshLambertMaterial({ map: m.map, emissiveMap: m.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.05 });
}

function tree(parent, x, z, y0, s = 1, kind = 'round') {
  const trunk = L(0x6a4a2c);
  cyl(parent, trunk, 0.14 * s, 0.22 * s, 2.2 * s, x, y0 + 1.1 * s, z, 6);
  if (kind === 'cone') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 4.2 * s, 8), L(0x2f6a2c));
    m.position.set(x, y0 + 3.6 * s, z);
    parent.add(m);
  } else {
    const leaf = L(0x4f8f3a);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * s, 1), leaf);
    m.position.set(x, y0 + 3.2 * s, z);
    parent.add(m);
    const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), L(0x5fa046));
    m2.position.set(x + 0.6 * s, y0 + 3.9 * s, z - 0.3 * s);
    parent.add(m2);
  }
}

export function palm(parent, x, z, y0, s = 1, lean = 0.12) {
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  const trunkM = L(0x8a6a44);
  const H = 7 * s;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s * (1 - t * 0.3), 0.26 * s * (1 - t * 0.3), H / segs + 0.05, 7), trunkM);
    seg.position.set(Math.sin(t * 1.4) * lean * H, (t + 0.5 / segs) * H, 0);
    g.add(seg);
  }
  const topX = Math.sin(1.4) * lean * H * 0.95;
  const leafM = new THREE.MeshLambertMaterial({ color: 0x3f8a3a, side: THREE.DoubleSide });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 3.6 * s, 4, 1, true), leafM);
    leaf.scale.set(1, 1, 0.25);
    leaf.position.set(topX + Math.cos(a) * 1.5 * s, H + 0.1, Math.sin(a) * 1.5 * s);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = -a;
    leaf.rotation.z = Math.PI / 2 + 0.35;
    leaf.rotation.x = 0;
    // point outward and droop
    const pivot = new THREE.Group();
    pivot.position.set(topX, H, 0);
    pivot.rotation.y = -a;
    const lf = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 3.8 * s, 4, 1, true), leafM);
    lf.scale.set(1, 1, 0.22);
    lf.rotation.z = -Math.PI / 2 - 0.45;
    lf.position.set(1.7 * s, -0.55 * s, 0);
    pivot.add(lf);
    g.add(pivot);
  }
  const coco = L(0x5a4020);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 6, 5), coco);
    c.position.set(topX + Math.cos(i * 2.1) * 0.3 * s, H - 0.3 * s, Math.sin(i * 2.1) * 0.3 * s);
    g.add(c);
  }
  parent.add(g);
  return g;
}

function bench(parent, x, z, y0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y0, z); g.rotation.y = ry;
  const wood = L(0x8a5a32), iron = L(0x2a2a2e);
  box(g, wood, 2.2, 0.12, 0.6, 0, 0.55, 0);
  box(g, wood, 2.2, 0.5, 0.1, 0, 0.85, -0.28);
  box(g, iron, 0.1, 0.55, 0.55, -0.95, 0.27, 0);
  box(g, iron, 0.1, 0.55, 0.55, 0.95, 0.27, 0);
  parent.add(g);
}

// =====================================================================
// University
// =====================================================================
export function createUniversity({ scene, groundY, quality }) {
  const qs = quality || {};
  const root = new THREE.Group();
  root.name = 'university';
  const U = UNIVERSITY;
  const y0 = typeof groundY === 'function' ? groundY(U.x, U.z) : 2.6;
  root.position.set(U.x, y0, U.z);
  const glow = makeGlowSet();
  const lights = [];

  const stone = P(0xf1e8d6, { shininess: 12 });
  const stoneDark = L(0xd8ccb2);
  const trim = L(0xfaf5ea);
  const paving = L(0xd9cfbb);
  const lawn = L(0x6aa84a);
  const path = L(0xe9dfc9);
  const gold = P(0xd9a92a, { shininess: 80, specular: 0x886622 });
  const domeM = P(0x2f7f86, { shininess: 60, specular: 0x335555 });
  const glass = new THREE.MeshPhongMaterial({ color: 0xa8d8ea, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false });
  const winMats = [];
  const clockMats = [];

  // ground
  box(root, paving, U.w, 0.3, U.d, 0, 0.15, 0);
  box(root, L(0xbfb39a), U.w + 1.2, 0.2, U.d + 1.2, 0, 0.05, 0);
  // central path + cross path
  box(root, path, 7, 0.08, 56, 0, 0.34, 12);
  box(root, path, 64, 0.08, 5, 0, 0.34, 8);
  // four lawns
  for (const [x, z, w, d] of [[-18, -1, 22, 12], [18, -1, 22, 12], [-18, 24, 22, 22], [18, 24, 22, 22]]) {
    box(root, lawn, w, 0.12, d, x, 0.36, z);
    box(root, stoneDark, w + 0.6, 0.2, 0.3, x, 0.35, z - d / 2);
    box(root, stoneDark, w + 0.6, 0.2, 0.3, x, 0.35, z + d / 2);
  }
  // fountain
  {
    cyl(root, stoneDark, 4.2, 4.4, 0.7, 0, 0.6, 8, 28);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.1, 28), P(0x3aa7c8, { shininess: 120, specular: 0xffffff }));
    water.position.set(0, 0.95, 8);
    root.add(water);
    cyl(root, trim, 0.5, 0.7, 2.2, 0, 1.6, 8, 12);
    cyl(root, trim, 1.4, 0.8, 0.3, 0, 2.7, 8, 16);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.55, depthWrite: false }));
    jet.position.set(0, 3.6, 8);
    root.add(jet);
  }

  // ---- main building (back), x -30..30, z -38..-20, interior visible through glass front ----
  const MB = { x0: -30, x1: 30, z0: -38, z1: -20, h: 10 };
  const mbW = MB.x1 - MB.x0, mbD = MB.z1 - MB.z0, mbCZ = (MB.z0 + MB.z1) / 2;
  box(root, stoneDark, mbW + 2, 1.2, mbD + 2, 0, 0.6, mbCZ); // plinth
  box(root, L(0xc9a77a), mbW - 1, 0.1, mbD - 1, 0, 1.25, mbCZ); // wood floor
  // back + side walls (solid, with window band texture on the outside)
  const backMat = facadeMat(20, 2, { seed: 3 }); winMats.push(backMat);
  box(root, backMat, mbW, MB.h, 0.6, 0, 1.2 + MB.h / 2, MB.z0 + 0.3);
  const sideMat = facadeMat(6, 2, { seed: 5 }); winMats.push(sideMat);
  box(root, sideMat, 0.6, MB.h, mbD, MB.x0 + 0.3, 1.2 + MB.h / 2, mbCZ);
  box(root, sideMat, 0.6, MB.h, mbD, MB.x1 - 0.3, 1.2 + MB.h / 2, mbCZ);
  // central partition (hall | library)
  box(root, stone, 0.5, MB.h, mbD - 1, 0, 1.2 + MB.h / 2, mbCZ);
  // glass front with stone piers between bays
  box(root, glass, mbW - 1, MB.h - 0.4, 0.15, 0, 1.2 + MB.h / 2, MB.z1 - 0.3);
  for (let x = MB.x0; x <= MB.x1 + 0.01; x += 6) box(root, stone, 1.0, MB.h, 0.9, x, 1.2 + MB.h / 2, MB.z1 - 0.3);
  box(root, stone, mbW, 0.6, 0.9, 0, 1.2 + 3.6, MB.z1 - 0.3); // transom band
  // interior ceiling (warm plaster, slightly self-lit so it does not read green)
  const ceil = new THREE.MeshLambertMaterial({ color: 0xf3ecdf, emissive: 0xc8bca6, emissiveIntensity: 0.75 });
  box(root, ceil, mbW - 1.2, 0.2, mbD - 1.2, 0, 1.2 + MB.h - 0.15, mbCZ);
  // roof + cornice
  const roofY = 1.2 + MB.h;
  box(root, trim, mbW + 2.4, 1.0, mbD + 2.4, 0, roofY + 0.5, mbCZ);
  box(root, stone, mbW + 1.2, 1.2, mbD + 1.2, 0, roofY + 1.6, mbCZ);
  // facade light strip under the cornice
  const stripM = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  box(root, stripM, mbW + 2.2, 0.12, 0.12, 0, roofY - 0.1, MB.z1 + 0.95);

  // ---- portico ----
  const PZ = MB.z1 + 5;
  box(root, stoneDark, 30, 0.4, 9, 0, 1.4, PZ - 0.5);
  for (let i = 0; i < 4; i++) box(root, stoneDark, 26, 0.3, 1, 0, 0.3 + i * 0.3, PZ + 4.5 + (3 - i) * 0.9); // steps
  const colH = MB.h - 0.6;
  for (let i = 0; i < 8; i++) {
    const x = -14 + i * 4;
    cyl(root, trim, 0.55, 0.62, colH, x, 1.6 + colH / 2, PZ + 2.5, 16);
    box(root, trim, 1.5, 0.4, 1.5, x, 1.8, PZ + 2.5);
    box(root, trim, 1.5, 0.45, 1.5, x, 1.6 + colH - 0.1, PZ + 2.5);
  }
  // entablature + sign frieze + pediment
  const entY = 1.6 + colH + 0.4;
  box(root, trim, 32, 1.6, 7.5, 0, entY + 0.5, PZ);
  const signTex = signTexture('جامعة دولة الأغنياء', { w: 1536, h: 192, size: 128, bg: '#1d3a40', border: '#d9a92a' });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), signMat);
  sign.position.set(0, entY + 0.5, PZ + 3.8);
  root.add(sign);
  {
    const shape = new THREE.Shape();
    shape.moveTo(-16.5, 0); shape.lineTo(16.5, 0); shape.lineTo(0, 4.4); shape.lineTo(-16.5, 0);
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 7.5, bevelEnabled: false }), trim);
    ped.position.set(0, entY + 1.3, PZ - 3.75);
    root.add(ped);
    const tri = new THREE.Shape();
    tri.moveTo(-13, 0.5); tri.lineTo(13, 0.5); tri.lineTo(0, 3.6); tri.lineTo(-13, 0.5);
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(tri), L(0x1d3a40));
    inner.position.set(0, entY + 1.3, PZ + 3.77);
    root.add(inner);
    // gold emblem in the pediment
    const emb = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 24), gold);
    emb.position.set(0, entY + 2.6, PZ + 3.85);
    root.add(emb);
  }
  // portico uplight beams
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.0, colH, 12, 1, true), beamMat);
    beam.position.set(-14 + i * 4, 1.6 + colH / 2, PZ + 3.3);
    beam.rotation.x = Math.PI; // wide at the top
    root.add(beam);
    const spot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), glow.bulbMat);
    spot.position.set(-14 + i * 4, 1.7, PZ + 3.3);
    root.add(spot);
  }

  // ---- dome on a drum over the central hall ----
  const domeY = roofY + 2.2;
  cyl(root, stone, 7.6, 7.6, 1.0, 0, domeY + 0.5, mbCZ, 32);
  const drumMat = facadeMat(24, 1, { seed: 9, wall: '#f1e8d6', glass: '#3f6577', litShare: 1 }); winMats.push(drumMat);
  cyl(root, drumMat, 6.8, 6.8, 3.4, 0, domeY + 2.7, mbCZ, 32);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.0, 0.3, 8, 40), trim);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, domeY + 4.45, mbCZ); root.add(ring);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
  dome.position.set(0, domeY + 4.4, mbCZ);
  root.add(dome);
  for (let i = 0; i < 12; i++) { // gold ribs
    const a = (i / 12) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(0, domeY + 4.4, mbCZ);
    holder.rotation.y = a;
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(6.85, 0.09, 4, 24, Math.PI / 2), gold);
    r2.rotation.y = Math.PI / 2;
    holder.add(r2);
    root.add(holder);
  }
  cyl(root, trim, 1.1, 1.3, 1.8, 0, domeY + 11.5, mbCZ, 12);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), gold);
  fin.position.set(0, domeY + 12.9, mbCZ); root.add(fin);
  cyl(root, gold, 0.08, 0.08, 2.0, 0, domeY + 14.2, mbCZ, 6);
  // dome flood light (halo) at night
  glow.halo(root, 0, domeY + 6, mbCZ + 7.5, 7);

  // ---- side wings (L-shape) with glowing windows ----
  const wingMat = facadeMat(12, 3, { seed: 11 }); winMats.push(wingMat);
  const wingEnd = facadeMat(4, 3, { seed: 13 }); winMats.push(wingEnd);
  for (const sx of [-1, 1]) {
    const wx = sx * 40;
    const g = new THREE.Group();
    g.position.set(wx, 0, -10);
    root.add(g);
    box(g, stoneDark, 13, 0.8, 42, 0, 0.4, 0);
    const mats = [wingMat, wingMat, trim, trim, wingEnd, wingEnd];
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 40), mats);
    body.position.set(0, 0.8 + 4.5, 0);
    g.add(body);
    box(g, trim, 13, 0.7, 41, 0, 10.2, 0);
    box(g, L(0xb24a32), 12.4, 0.5, 40.4, 0, 10.7, 0);
    // wing entrance canopy facing the courtyard
    box(g, trim, 1.6, 0.3, 5, -sx * 6.9, 3.6, 4);
    box(g, glow.bulbMat, 0.2, 0.12, 4.6, -sx * 6.9, 3.42, 4);
  }

  // ---- clock tower at the front-west corner of the courtyard ----
  {
    const t = new THREE.Group();
    t.position.set(-40, 0, 26);
    root.add(t);
    box(t, stoneDark, 7, 1, 7, 0, 0.5, 0);
    box(t, stone, 5.4, 22, 5.4, 0, 12, 0);
    for (let k = 0; k < 4; k++) box(t, trim, 0.5, 22, 0.5, (k % 2 ? 1 : -1) * 2.75, 12, (k < 2 ? 1 : -1) * 2.75);
    box(t, trim, 6.4, 0.8, 6.4, 0, 23.2, 0);
    box(t, stone, 5.8, 4.4, 5.8, 0, 25.8, 0);
    const clockC = document.createElement('canvas');
    clockC.width = clockC.height = 256;
    const cg = clockC.getContext('2d');
    cg.fillStyle = '#fff8e6'; cg.beginPath(); cg.arc(128, 128, 120, 0, Math.PI * 2); cg.fill();
    cg.strokeStyle = '#b8862a'; cg.lineWidth = 12; cg.stroke();
    cg.fillStyle = '#2a2a2a';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cg.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
    cg.strokeStyle = '#1a1a1a'; cg.lineCap = 'round';
    cg.lineWidth = 10; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 + 50, 128 - 30); cg.stroke();
    cg.lineWidth = 6; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 - 10, 128 - 85); cg.stroke();
    const clockTex = new THREE.CanvasTexture(clockC); clockTex.colorSpace = THREE.SRGBColorSpace;
    const clockMat = new THREE.MeshLambertMaterial({ map: clockTex, transparent: true, emissive: 0xffe6b0, emissiveMap: clockTex, emissiveIntensity: 0.05 });
    clockMats.push(clockMat);
    for (let k = 0; k < 4; k++) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), clockMat);
      const a = (k / 4) * Math.PI * 2;
      face.position.set(Math.sin(a) * 2.92, 25.8, Math.cos(a) * 2.92);
      face.rotation.y = a;
      t.add(face);
    }
    const roofT = new THREE.Mesh(new THREE.ConeGeometry(4.6, 5, 4), domeM);
    roofT.position.set(0, 30.5, 0); roofT.rotation.y = Math.PI / 4; t.add(roofT);
    const tf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), gold); tf.position.set(0, 33.2, 0); t.add(tf);
    glow.halo(t, 0, 25.8, 3.6, 6);
  }

  // ---- gate with sign ----
  {
    const gz = U.d / 2 - 1.2;
    for (const sx of [-1, 1]) {
      box(root, stone, 2.2, 6.5, 2.2, sx * 6.2, 3.25, gz);
      box(root, trim, 2.8, 0.5, 2.8, sx * 6.2, 6.7, gz);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), glow.bulbMat);
      lan.position.set(sx * 6.2, 7.4, gz); root.add(lan);
      glow.halo(root, sx * 6.2, 7.4, gz, 4);
      // perimeter railing
      for (let k = 0; k < 2; k++) {
        const x0 = sx * 7.4, x1 = sx * (U.w / 2 - 0.5);
        box(root, L(0x2a2a2e), Math.abs(x1 - x0), 0.15, 0.15, (x0 + x1) / 2, 1.0 + k * 0.6, gz + 0.6);
      }
    }
    box(root, trim, 15, 1.2, 1.6, 0, 6.4, gz);
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.1), new THREE.MeshBasicMaterial({ map: signTexture('جامعة دولة الأغنياء', { w: 1024, h: 128, size: 88, bg: '#1d3a40' }) }));
    gs.position.set(0, 6.4, gz + 0.82); root.add(gs);
  }

  // ---- trees, benches, lamps ----
  for (const [x, z] of [[-27, -1], [-9, -1], [9, -1], [27, -1], [-27, 14], [27, 14], [-27, 33], [27, 33], [-9, 34], [9, 34]]) {
    tree(root, x, z, 0.35, 1.05, (Math.abs(x) + z) % 3 ? 'round' : 'cone');
  }
  for (const [x, z] of [[-6, 18], [6, 18], [-6, 28], [6, 28]]) palm(root, x, z, 0.35, 0.8, 0.06);
  for (const [x, z, r] of [[-12, 13.5, 0], [12, 13.5, 0], [-12, 2.5, Math.PI], [12, 2.5, Math.PI]]) bench(root, x, z, 0.35, r);
  for (const z of [-8, 4, 16, 26, 36]) {
    lampPost(root, glow, -4.6, z, 0.35);
    lampPost(root, glow, 4.6, z, 0.35);
  }
  for (const x of [-46, -30, 30, 46]) lampPost(root, glow, x, 37, 0.35);

  // ---- INTERIOR: lecture hall (west half) ----
  const hall = new THREE.Group();
  hall.name = 'lectureHall';
  root.add(hall);
  {
    const fy = 1.3;
    // board on the west wall
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 256;
    const bg = bc.getContext('2d');
    bg.fillStyle = '#21463a'; bg.fillRect(0, 0, 512, 256);
    bg.strokeStyle = '#8a6a3a'; bg.lineWidth = 14; bg.strokeRect(0, 0, 512, 256);
    bg.fillStyle = '#f4f1e6'; bg.font = `700 44px ${ARABIC_FONT}`; bg.textAlign = 'center'; bg.direction = 'rtl';
    bg.fillText('أهلاً بطلاب دولة الأغنياء', 256, 70);
    bg.font = `500 32px ${ARABIC_FONT}`;
    bg.fillText('المحاضرة الأولى: كيف نبني مدينة', 256, 130);
    bg.strokeStyle = '#f4f1e6'; bg.lineWidth = 3;
    bg.beginPath(); bg.moveTo(80, 190); bg.lineTo(200, 160); bg.lineTo(300, 200); bg.lineTo(430, 150); bg.stroke();
    const boardTex = new THREE.CanvasTexture(bc); boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshLambertMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.15 }));
    board.position.set(MB.x0 + 0.75, fy + 4.3, mbCZ);
    board.rotation.y = Math.PI / 2;
    hall.add(board);
    box(hall, L(0x6a4a2c), 2.2, 1.1, 1.2, MB.x0 + 4, fy + 0.55, mbCZ + 3); // lectern desk
    box(hall, L(0x5a3a22), 0.9, 1.3, 0.7, MB.x0 + 4.2, fy + 0.65, mbCZ - 3); // podium
    // stepped seating rows facing the board
    const seatM = L(0x8a2f2f), deskM = L(0x9a7448), stepM = L(0xb08c62);
    for (let row = 0; row < 7; row++) {
      const x = MB.x0 + 9 + row * 2.6;
      const sy = fy + row * 0.35;
      box(hall, stepM, 2.6, row * 0.35 + 0.02, mbD - 3, x, fy + (row * 0.35) / 2, mbCZ);
      box(hall, deskM, 0.5, 0.08, mbD - 4.5, x - 0.9, sy + 0.95, mbCZ);
      for (let k = 0; k < 9; k++) {
        const z = MB.z0 + 2.6 + k * 1.55;
        box(hall, seatM, 0.6, 0.12, 0.6, x - 0.1, sy + 0.5, z);
        box(hall, seatM, 0.12, 0.65, 0.6, x + 0.2, sy + 0.82, z);
      }
    }
    // ceiling pendant lights
    for (let i = 0; i < 3; i++) {
      for (const z of [mbCZ - 4, mbCZ + 4]) {
        const x = MB.x0 + 8 + i * 8;
        cyl(hall, L(0x222222), 0.02, 0.02, 2.2, x, fy + MB.h - 1.4, z, 4);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 0.5, 12, 1, true), glow.bulbMat);
        lamp.position.set(x, fy + MB.h - 2.6, z); hall.add(lamp);
      }
    }
  }

  // ---- INTERIOR: library (east half) ----
  const lib = new THREE.Group();
  lib.name = 'library';
  root.add(lib);
  {
    const fy = 1.3;
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 256;
    const g = bc.getContext('2d');
    g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 256, 256);
    const cols = ['#8a2f2f', '#2f5a8a', '#3a7a4a', '#b8862a', '#6a3a7a', '#c8b89a', '#2a2a2a', '#a85a2a'];
    for (let shelf = 0; shelf < 5; shelf++) {
      const y = shelf * 51 + 6;
      let x = 4;
      let k = shelf * 3;
      while (x < 250) {
        const w = 6 + ((k * 7) % 9);
        const h = 34 + ((k * 13) % 10);
        g.fillStyle = cols[k % cols.length];
        g.fillRect(x, y + (44 - h), w, h);
        x += w + 1; k++;
      }
      g.fillStyle = '#3a2414'; g.fillRect(0, y + 44, 256, 7);
    }
    const shelfTex = new THREE.CanvasTexture(bc); shelfTex.colorSpace = THREE.SRGBColorSpace;
    const shelfFace = new THREE.MeshLambertMaterial({ map: shelfTex });
    const shelfWood = L(0x5a3a22);
    const shelfMats = [shelfWood, shelfWood, shelfWood, shelfWood, shelfFace, shelfFace];
    // tall shelves along the back wall
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(4.2, 6.5, 1.0), shelfMats);
      s.position.set(3.5 + i * 4.4, fy + 3.25, MB.z0 + 1.2);
      lib.add(s);
    }
    // freestanding shelf rows
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.6, 6.5), [shelfFace, shelfFace, shelfWood, shelfWood, shelfWood, shelfWood]);
      s.position.set(5 + i * 5.6, fy + 1.8, mbCZ - 1.5);
      lib.add(s);
    }
    // reading tables with green lamps near the glass
    const tableM = L(0x7a5232), chairM = L(0x4a2e1c);
    const lampShade = new THREE.MeshBasicMaterial({ color: 0x2f8a4a });
    for (let i = 0; i < 4; i++) {
      const x = 5 + i * 6.2;
      const z = MB.z1 - 3.2;
      box(lib, tableM, 4, 0.12, 1.6, x, fy + 0.8, z);
      for (const lx of [-1.7, 1.7]) box(lib, tableM, 0.15, 0.8, 1.4, x + lx, fy + 0.4, z);
      for (const cx of [-1.1, 1.1]) for (const cz of [-1.2, 1.2]) {
        box(lib, chairM, 0.55, 0.1, 0.55, x + cx, fy + 0.5, z + cz);
        box(lib, chairM, 0.55, 0.6, 0.08, x + cx, fy + 0.8, z + cz + Math.sign(cz) * 0.25);
      }
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.25, 10), lampShade);
      shade.position.set(x, fy + 1.3, z); lib.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow.bulbMat);
      bulb.position.set(x, fy + 1.18, z); lib.add(bulb);
    }
    // chandeliers
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 9;
      cyl(lib, gold, 0.02, 0.02, 2, x, fy + MB.h - 1.2, mbCZ, 4);
      const ringC = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 20), gold);
      ringC.rotation.x = Math.PI / 2; ringC.position.set(x, fy + MB.h - 2.3, mbCZ); lib.add(ringC);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow.bulbMat);
        b.position.set(x + Math.cos(a) * 0.9, fy + MB.h - 2.15, mbCZ + Math.sin(a) * 0.9); lib.add(b);
      }
    }
    // library sign above the inner door
    const ls = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.0), new THREE.MeshBasicMaterial({ map: signTexture('المكتبة', { w: 512, h: 96, size: 70, bg: '#3a2414' }) }));
    ls.position.set(15, fy + 7.4, MB.z0 + 1.75); lib.add(ls);
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.0), new THREE.MeshBasicMaterial({ map: signTexture('قاعة المحاضرات', { w: 512, h: 96, size: 56, bg: '#3a2414' }) }));
    hs.position.set(-15, fy + 8.6, MB.z0 + 0.65); hall.add(hs);
  }

  // ---- night lights (few, always present so shaders never recompile) ----
  const usePL = qs.shadows !== undefined ? (qs.pixelRatio > 1) : true;
  if (usePL) {
    for (const [x, y, z, d] of [[0, 8, PZ + 9, 46], [0, 4, 18, 40], [-15, 8, mbCZ, 24], [15, 8, mbCZ, 24]]) {
      const pl = new THREE.PointLight(0xffc98a, 0, d, 1.3);
      pl.position.set(x, y, z);
      root.add(pl);
      lights.push(pl);
    }
  }

  shadowize(root);
  scene.add(root);

  function setNight(n) {
    n = Math.max(0, Math.min(1, n || 0));
    glow.setNight(n);
    for (const m of winMats) m.emissiveIntensity = 0.04 + n * 1.5;
    for (const m of clockMats) m.emissiveIntensity = 0.05 + n * 0.45;
    beamMat.opacity = n * 0.22;
    stripM.color.setHex(n > 0.25 ? 0xffe2a8 : 0xf3ead8);
    for (const pl of lights) pl.intensity = n * 90;
  }
  setNight(0);

  const C = (x, y, z) => new THREE.Vector3(U.x + x, y0 + y, U.z + z);
  const views = {
    day: { pos: C(62, 46, 110), target: C(0, 6, -6) },
    front: { pos: C(18, 14, 58), target: C(0, 7, -18) },
    hall: { pos: C(-3, 6.6, mbCZ + 5), target: C(-26, 3.8, mbCZ - 0.6) },
    library: { pos: C(28, 6.2, MB.z1 - 1.6), target: C(6, 3, MB.z0 + 2) },
  };
  return { root, setNight, views, center: C(0, 0, 0) };
}

// =====================================================================
// مطعم البحر — glass restaurant, curved white roof, deck facing the sea (+x)
// =====================================================================
export function createRestaurant({ scene, groundY, quality }) {
  const qs = quality || {};
  const R = RESTAURANT;
  const root = new THREE.Group();
  root.name = 'seaRestaurant';
  const y0 = typeof groundY === 'function' ? groundY(R.x, R.z) : 2.6;
  root.position.set(R.x, y0, R.z);
  const glow = makeGlowSet();
  const lights = [];
  const warmMats = [];

  const white = P(0xf7f7f4, { shininess: 70, specular: 0x666666 });
  const pave = L(0xd9d0be);
  const deckM = L(0x9c7b5c, { map: null });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd2e4, transparent: true, opacity: 0.2, shininess: 140, specular: 0xffffff, depthWrite: false });
  const mull = L(0x2f3236);
  const gold = P(0xd9a92a, { shininess: 80, specular: 0x886622 });

  // promenade pad + deck
  box(root, pave, R.w, 0.3, R.d, 0, 0.15, 0);
  box(root, L(0xbfb39a), R.w + 1, 0.18, R.d + 1, 0, 0.05, 0);
  box(root, deckM, 26, 0.35, R.d - 2, 13.5, 0.45, 0);
  for (let z = -18; z <= 18; z += 1.2) box(root, L(0x8f633a), 26, 0.02, 0.06, 13.5, 0.64, z);

  // building: x -26..0, z -15..15
  const B = { x0: -26, x1: 0, z0: -15, z1: 15, h: 6.5 };
  const bw = B.x1 - B.x0, bd = B.z1 - B.z0, bcx = (B.x0 + B.x1) / 2;
  box(root, L(0x9a7b58), bw, 0.25, bd, bcx, 0.42, 0); // interior wooden floor
  // back service wall (kitchen) solid
  box(root, white, 0.6, B.h, bd, B.x0 + 0.3, 0.3 + B.h / 2, 0);
  // glass walls: front (sea, +x), north and south sides; west street side glass with entrance
  box(root, glass, 0.12, B.h, bd - 0.4, B.x1, 0.3 + B.h / 2, 0);
  box(root, glass, bw, B.h, 0.12, bcx, 0.3 + B.h / 2, B.z0);
  box(root, glass, bw, B.h, 0.12, bcx, 0.3 + B.h / 2, B.z1);
  for (let z = B.z0; z <= B.z1 + 0.01; z += 3) box(root, mull, 0.18, B.h, 0.18, B.x1, 0.3 + B.h / 2, z);
  for (let x = B.x0; x <= B.x1 + 0.01; x += 3.25) {
    box(root, mull, 0.18, B.h, 0.18, x, 0.3 + B.h / 2, B.z0);
    box(root, mull, 0.18, B.h, 0.18, x, 0.3 + B.h / 2, B.z1);
  }
  box(root, mull, 0.2, 0.2, bd, B.x1, 0.3 + B.h, 0);
  box(root, new THREE.MeshLambertMaterial({ color: 0xf6f1e6, emissive: 0x6a5c48, emissiveIntensity: 0.55 }), bw - 0.8, 0.15, bd - 0.4, bcx, 0.3 + B.h - 0.05, 0);
  box(root, mull, 0.2, 0.2, bd, B.x1, 2.9, 0);

  // curved white roof shell: side profile in x-y, extruded along z
  {
    const s = new THREE.Shape();
    const yb = 0.3 + B.h; // underside height at the back
    s.moveTo(B.x0 - 2, yb);
    s.bezierCurveTo(B.x0 + 8, yb + 1.0, B.x1 - 6, yb + 5.5, B.x1 + 3.5, yb + 3.2);
    s.bezierCurveTo(B.x1 + 6.5, yb + 2.0, B.x1 + 6.8, yb + 0.6, B.x1 + 5.6, yb - 0.2);
    s.bezierCurveTo(B.x1 + 5.2, yb + 1.2, B.x1 + 3, yb + 2.2, B.x1 - 1, yb + 2.3);
    s.bezierCurveTo(B.x1 - 8, yb + 2.6, B.x0 + 6, yb - 0.2, B.x0 - 2, yb - 0.6);
    s.lineTo(B.x0 - 2, yb);
    const geo = new THREE.ExtrudeGeometry(s, { depth: bd + 5, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.6, bevelSegments: 4, curveSegments: 24 });
    const roof = new THREE.Mesh(geo, white);
    roof.position.set(0, 0, -(bd + 5) / 2);
    root.add(roof);
    // glass clerestory filling the gap between the walls and the rising roof (front)
    const cs = new THREE.Shape();
    cs.moveTo(B.x0 + 4, yb - 0.1);
    cs.bezierCurveTo(B.x0 + 10, yb + 1.6, B.x1 - 7, yb + 2.4, B.x1, yb + 2.2);
    cs.lineTo(B.x1, yb - 0.1);
    cs.lineTo(B.x0 + 4, yb - 0.1);
    const cg = new THREE.ShapeGeometry(cs, 16);
    for (const z of [B.z0, B.z1]) {
      const c = new THREE.Mesh(cg, glass);
      c.position.set(0, 0, z);
      root.add(c);
    }
    box(root, glass, 0.12, 2.3, bd, B.x1, yb + 1.1, 0);
    // under-roof warm LED line
    const led = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    warmMats.push({ m: led, day: 0xf2ebe0, night: 0xffcf8a });
    box(root, led, 0.15, 0.12, bd + 4, B.x1 + 5.2, yb - 0.05, 0);
  }
  // supporting slim columns at the overhang
  for (const z of [-15, -5, 5, 15]) cyl(root, white, 0.18, 0.18, B.h + 2.5, B.x1 + 4.4, 0.3 + (B.h + 2.5) / 2, z, 10);

  // gold signs «مطعم البحر» — sea side (+x) and street side (-x)
  const signTex = signTexture('مطعم البحر', { w: 1024, h: 256, size: 170, stroke: 'rgba(60,40,10,0.65)' });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false, color: 0xffffff });
  warmMats.push({ m: signMat, day: 0xe6dccb, night: 0xffffff });
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), signMat);
  s1.position.set(B.x1 + 0.12, 4.9, 0); s1.rotation.y = Math.PI / 2; root.add(s1);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), signMat);
  s2.position.set(B.x0 - 0.05, 5.3, 0); s2.rotation.y = -Math.PI / 2; root.add(s2);
  box(root, gold, 0.2, 0.2, 12.5, B.x1 + 0.15, 3.3, 0);
  const s3 = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), signMat);
  s3.position.set(B.x1 + 7.45, 0.3 + B.h + 1.15, 0); s3.rotation.y = Math.PI / 2; s3.rotation.x = 0; root.add(s3);

  // ---- INTERIOR: tables, chairs, bar counter, pendant lamps ----
  const interior = new THREE.Group();
  interior.name = 'restaurantInterior';
  root.add(interior);
  {
    const fy = 0.55;
    const tableTop = L(0xf2ece0), tableLeg = L(0x2f3236), chairM = L(0x7a4a2a), cushion = L(0xc8a46a);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const x = B.x0 + 9 + i * 5.3;
        const z = B.z0 + 3.6 + j * 7.6;
        cyl(interior, tableTop, 0.9, 0.9, 0.08, x, fy + 0.78, z, 20);
        cyl(interior, tableLeg, 0.07, 0.25, 0.75, x, fy + 0.38, z, 8);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          const cx = x + Math.cos(a) * 1.35, cz = z + Math.sin(a) * 1.35;
          const ch = new THREE.Group(); ch.position.set(cx, fy, cz); ch.rotation.y = -a + Math.PI / 2;
          box(ch, cushion, 0.55, 0.1, 0.55, 0, 0.48, 0);
          box(ch, chairM, 0.55, 0.65, 0.07, 0, 0.82, -0.27);
          for (const lx of [-0.23, 0.23]) for (const lz of [-0.23, 0.23]) box(ch, tableLeg, 0.05, 0.46, 0.05, lx, 0.23, lz);
          interior.add(ch);
        }
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), glow.bulbMat);
        candle.position.set(x, fy + 0.92, z); interior.add(candle);
        // pendant lamp
        cyl(interior, tableLeg, 0.015, 0.015, 3.0, x, B.h - 0.9, z, 4);
        const shade = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold);
        shade.position.set(x, B.h - 2.4, z); interior.add(shade);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow.bulbMat);
        bulb.position.set(x, B.h - 2.45, z); interior.add(bulb);
        glow.halo(interior, x, B.h - 2.6, z, 2.2);
      }
    }
    // bar counter along the back (kitchen) wall
    const barX = B.x0 + 3.2;
    box(interior, L(0x3a2a1e), 1.4, 1.15, 18, barX, fy + 0.58, 0);
    box(interior, P(0xe8e4dc, { shininess: 90 }), 1.7, 0.1, 18.4, barX, fy + 1.2, 0);
    const barGlow = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    warmMats.push({ m: barGlow, day: 0x8a6a4a, night: 0xffb860 });
    box(interior, barGlow, 0.05, 0.08, 17.6, barX + 0.72, fy + 0.15, 0);
    for (let k = 0; k < 7; k++) {
      const z = -7.5 + k * 2.5;
      cyl(interior, tableLeg, 0.05, 0.12, 0.8, barX + 1.5, fy + 0.4, z, 8);
      cyl(interior, L(0x8a2f2f), 0.28, 0.28, 0.12, barX + 1.5, fy + 0.86, z, 12);
    }
    // back shelf with bottles
    box(interior, L(0x2a2420), 0.5, 3.2, 16, B.x0 + 0.9, fy + 2.6, 0);
    const bottleCols = [0x3a7a4a, 0x8a2f2f, 0xd9a92a, 0x2f5a8a, 0xe8e4dc];
    for (let sh = 0; sh < 3; sh++) {
      box(interior, L(0x6a4a2c), 0.6, 0.06, 16, B.x0 + 1.0, fy + 1.4 + sh * 0.95, 0);
      for (let k = 0; k < 18; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6), L(bottleCols[(k + sh) % 5]));
        b.position.set(B.x0 + 1.0, fy + 1.65 + sh * 0.95, -7.5 + k * 0.88);
        interior.add(b);
      }
    }
    // bar pendant row
    for (let k = 0; k < 4; k++) {
      const z = -6 + k * 4;
      cyl(interior, tableLeg, 0.015, 0.015, 2.6, barX + 0.3, B.h - 0.7, z, 4);
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 12, 1, true), gold);
      b.position.set(barX + 0.3, B.h - 2.1, z); interior.add(b);
      const bb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow.bulbMat);
      bb.position.set(barX + 0.3, B.h - 2.25, z); interior.add(bb);
    }
    // plants
    for (const [x, z] of [[-24, -13.5], [-24, 13.5], [-1.5, -13.5], [-1.5, 13.5]]) {
      cyl(interior, L(0xe8e4dc), 0.4, 0.3, 0.7, x, fy + 0.35, z, 10);
      const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), L(0x3f8a3a));
      pl.position.set(x, fy + 1.3, z); interior.add(pl);
    }
  }

  // ---- deck: umbrellas, tables, rail with lanterns, palms ----
  {
    const fy = 0.62;
    const canvas = [0xf4efe2, 0xf4efe2, 0xe9dcc0];
    const tableTop = L(0x8a5a32), chairM = L(0xd8cbb0), leg = L(0x2f3236);
    let k = 0;
    for (const x of [6, 13, 20]) {
      for (const z of [-12, -4, 4, 12]) {
        if (x === 20 && Math.abs(z) === 4) continue; // walkway to the steps
        k++;
        cyl(root, tableTop, 0.75, 0.75, 0.07, x, fy + 0.76, z, 16);
        cyl(root, leg, 0.06, 0.2, 0.74, x, fy + 0.37, z, 8);
        for (let c = 0; c < 4; c++) {
          const a = (c / 4) * Math.PI * 2;
          const ch = new THREE.Group(); ch.position.set(x + Math.cos(a) * 1.2, fy, z + Math.sin(a) * 1.2); ch.rotation.y = -a + Math.PI / 2;
          box(ch, chairM, 0.5, 0.08, 0.5, 0, 0.46, 0);
          box(ch, chairM, 0.5, 0.55, 0.06, 0, 0.75, -0.24);
          box(ch, leg, 0.45, 0.46, 0.05, 0, 0.23, 0);
          root.add(ch);
        }
        cyl(root, L(0xe8e4dc), 0.05, 0.05, 2.9, x, fy + 1.45, z, 6);
        const um = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8, 1, true), new THREE.MeshLambertMaterial({ color: canvas[k % 3], side: THREE.DoubleSide }));
        um.position.set(x, fy + 3.0, z); root.add(um);
        const ub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow.bulbMat);
        ub.position.set(x, fy + 2.55, z); root.add(ub);
      }
    }
    // rail along the sea edge and the deck sides, with lanterns
    const railM = L(0xe8e4dc);
    const ex = 26.4;
    box(root, railM, 0.15, 0.12, R.d - 2, ex, fy + 1.0, 0);
    box(root, glass, 0.06, 0.9, R.d - 2, ex, fy + 0.5, 0);
    for (const z of [-(R.d / 2 - 1), R.d / 2 - 1]) {
      box(root, railM, 26, 0.12, 0.15, 13.5, fy + 1.0, z);
      box(root, glass, 26, 0.9, 0.06, 13.5, fy + 0.5, z);
    }
    for (let z = -18; z <= 18; z += 4) {
      box(root, railM, 0.3, 1.2, 0.3, ex, fy + 0.6, z);
      const lan = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), glow.bulbMat);
      lan.position.set(ex, fy + 1.45, z); root.add(lan);
      glow.halo(root, ex, fy + 1.45, z, 2.2);
    }
    // planters + palms
    for (const [x, z] of [[2.5, -17.5], [2.5, 17.5], [25, -17.5], [25, 17.5], [-27, -18], [-27, 18], [13.5, 0]]) {
      box(root, L(0xd8cfbf), 1.8, 0.8, 1.8, x, fy + 0.4, z);
      palm(root, x, z, fy + 0.8, 0.95, 0.1);
    }
    // street-side entrance canopy, steps and lamps
    box(root, white, 4, 0.25, 5, B.x0 - 2, 3.4, 0);
    for (const z of [-2.2, 2.2]) cyl(root, white, 0.12, 0.12, 3.1, B.x0 - 3.7, 1.85, z, 8);
    for (const z of [-8, 8]) lampPost(root, glow, -27.5, z, 0.3, 4.2, 'modern');
  }

  // warm interior lights at night
  if (qs.pixelRatio === undefined || qs.pixelRatio > 1) {
    for (const [x, y, z, d] of [[-14, 4.5, -7, 22], [-14, 4.5, 7, 22], [14, 4, 0, 30]]) {
      const pl = new THREE.PointLight(0xffb870, 0, d, 1.3);
      pl.position.set(x, y, z);
      root.add(pl);
      lights.push(pl);
    }
  }

  shadowize(root);
  scene.add(root);

  function setNight(n) {
    n = Math.max(0, Math.min(1, (n || 0) * 3)); // restaurant switches its lights on early, at dusk
    glow.setNight(n);
    for (const w of warmMats) w.m.color.setHex(n > 0.2 ? w.night : w.day);
    for (const pl of lights) pl.intensity = 18 + n * 70;
  }
  setNight(0);

  const C = (x, y, z) => new THREE.Vector3(R.x + x, y0 + y, R.z + z);
  const views = {
    day: { pos: C(62, 26, 44), target: C(-2, 4, 0) },
    street: { pos: C(-55, 20, 30), target: C(-8, 4, 0) },
    interior: { pos: C(-21, 3.4, 11), target: C(8, 2.0, -3) },
    bar: { pos: C(-2, 3.2, 12.5), target: C(-20, 2.0, -4) },
  };
  return { root, setNight, views, center: C(0, 0, 0) };
}

// Suggested stadium spot: a faint oval outline + sign (not built yet).
export function createStadiumMarker({ scene, groundY }) {
  const S = STADIUM_SPOT;
  const y0 = typeof groundY === 'function' ? groundY(S.x, S.z) : 2.6;
  const g = new THREE.Group();
  g.name = 'stadiumMarker';
  g.position.set(S.x, y0 + 0.2, S.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.0, 64), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(S.rx, S.rz, 1);
  g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.94, 64), new THREE.MeshLambertMaterial({ color: 0x6aa84a, transparent: true, opacity: 0.14, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; fill.scale.set(S.rx, S.rz, 1); fill.position.y = 0.02;
  g.add(fill);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), L(0x5a4630));
  post.position.set(0, 2, S.rz * 0.95); g.add(post);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), new THREE.MeshLambertMaterial({ map: signTexture('مكان الملعب (مقترح)', { w: 1024, h: 200, size: 96, bg: '#1d2a1d', border: '#e8c45a' }), side: THREE.DoubleSide }));
  sign.position.set(0, 4.6, S.rz * 0.95); g.add(sign);
  scene.add(g);
  return { root: g };
}
