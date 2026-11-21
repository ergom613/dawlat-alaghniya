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

// (The university that stood here was replaced by جامع دولة الأغنياء — see mosque.js.)

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
  if (qs.pointLights !== undefined ? !!qs.pointLights : (qs.pixelRatio === undefined || qs.pixelRatio > 1)) {
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
