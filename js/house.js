// Procedural follower house, levels 1–30. Original geometry.
// Progression: tent → hut → house → villa → apartment → tower → glass skyscraper.
// Per-follower style is a deterministic hash of the username.
import * as THREE from 'three';

export function pointsToLevel(points, levels) {
  let lv = 1;
  for (const L of levels) {
    if (points >= L.points) lv = L.level;
  }
  return lv;
}

export function floorsForLevel(L) {
  if (L < 20) return L >= 11 || L === 10 ? 2 : 1;
  if (L === 20) return 4;
  if (L === 21) return 6;
  if (L === 22) return 7;
  if (L === 23) return 9;
  if (L === 24) return 11;
  if (L === 25) return 14;
  if (L === 26) return 17;
  if (L === 27) return 20;
  if (L === 28) return 24;
  if (L === 29) return 28;
  return 32;
}

export function heightForLevel(L) {
  if (L <= 1) return 3.2;
  if (L <= 5) return 4.2;
  if (L <= 9) return 5.2;
  if (L === 10) return 6.4;
  if (L <= 15) return 8.4;
  if (L <= 19) return 10.2;
  const floors = floorsForLevel(L);
  const spire = L >= 30 ? 16 : L >= 29 ? 10 : L >= 28 ? 6 : 0;
  return 0.2 + floors * FLOOR_H + spire;
}

export const FLOOR_H = 3.2;

export function hashString(s) {
  let h = 2166136261 >>> 0;
  const str = String(s || 'mohammad_1').toLowerCase();
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTES = [
  { id: 'sand', wall: 0xefe4d0, trim: 0xe8d9b8, roof: 0xc45b36, shutter: 0x3d6a4a, wood: 0x8a5a36, tent: 0xd7b07a, glass: 0x7ec8de, cladding: 0xf2ebe0, mullion: 0xcfc4b4, lit: 0xffe09a, accent: 0xb8894e, body: 0xc45b36 },
  { id: 'slate', wall: 0xe8eaee, trim: 0xffffff, roof: 0x3e4a55, shutter: 0x2c3a4a, wood: 0x6a5340, tent: 0xc5c0b4, glass: 0x7fa8c8, cladding: 0xdde2e8, mullion: 0x2a3036, lit: 0xffd27a, accent: 0x8aa0b4, body: 0x3e4a55 },
  { id: 'teal', wall: 0xe6f0ee, trim: 0xf7fffe, roof: 0x2f6f74, shutter: 0x1e4f54, wood: 0x6b5340, tent: 0xb7cfc8, glass: 0x6fd0c8, cladding: 0xd5e6e4, mullion: 0x1b3a3c, lit: 0xffefb0, accent: 0xd4a017, body: 0x2f6f74 },
  { id: 'blush', wall: 0xf6e4dc, trim: 0xfff4ee, roof: 0x8a3a3a, shutter: 0x5a2a2a, wood: 0x7a4a32, tent: 0xe0b8a8, glass: 0x9ad0e0, cladding: 0xf3e6e0, mullion: 0x5a3a36, lit: 0xffd8a0, accent: 0xc9a03a, body: 0x8a3a3a },
  { id: 'navy', wall: 0xe6eaf2, trim: 0xf4f7fb, roof: 0x243656, shutter: 0x1a2740, wood: 0x5a4636, tent: 0xb8c0d0, glass: 0x6a9ad0, cladding: 0xd4dbe8, mullion: 0x1a2436, lit: 0xffe8b0, accent: 0xd4a017, body: 0x1e3a6e },
  { id: 'olive', wall: 0xeee8d4, trim: 0xf7f3e4, roof: 0x5a6a3a, shutter: 0x3a4a28, wood: 0x6a4a28, tent: 0xc8c090, glass: 0x8ec8b0, cladding: 0xe6e0cc, mullion: 0x3a4030, lit: 0xffe8a0, accent: 0xb8894e, body: 0x5a6a3a },
  { id: 'ivory', wall: 0xf4f0e6, trim: 0xffffff, roof: 0x8a7a6a, shutter: 0x4a3a2a, wood: 0x8a5a36, tent: 0xe8dcc0, glass: 0x9ed0e8, cladding: 0xf0ece4, mullion: 0x4a4640, lit: 0xffefc0, accent: 0xc9a03a, body: 0x9a8a7a },
  { id: 'copper', wall: 0xf0e0d0, trim: 0xf8ece0, roof: 0x8a4a28, shutter: 0x5a3020, wood: 0x6a3a22, tent: 0xd0a070, glass: 0x7eb8d0, cladding: 0xead8c8, mullion: 0x4a2e22, lit: 0xffd090, accent: 0xd4a017, body: 0x8a4a28 },
];

const ROOFS = ['pitched', 'hipped', 'shed', 'flat'];
const SECTIONS = ['square', 'rect', 'round', 'twisted', 'stepped'];
const FACADES = ['grid', 'bands', 'stripes', 'checker', 'offset'];
const CROWNS = ['needle', 'ball', 'fins', 'helipad', 'pyramid', 'antenna'];

export function styleFromName(name) {
  const rng = mulberry32(hashString(name));
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const palette = pick(PALETTES);
  return {
    name: String(name || 'mohammad_1'),
    palette,
    roof: pick(ROOFS),
    section: pick(SECTIONS),
    facade: pick(FACADES),
    crown: pick(CROWNS),
    squat: 0.88 + rng() * 0.28,
    stretch: 0.9 + rng() * 0.28,
    twist: 0.35 + rng() * 0.55, // turns over the full shaft (radians * floors factor later)
    windowWarmth: rng(),
    litJitter: rng(),
    carHue: rng(),
  };
}

function hexCol(n) {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

function makeMats(palette) {
  const L = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
  const S = (color, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });
  const p = palette || PALETTES[0];
  return {
    tent: L(p.tent),
    tentDark: L(0xb89060),
    tentStripe: L(p.accent),
    wood: L(p.wood),
    woodDark: L(0x6a4024),
    woodLight: L(0xc4a574),
    door: L(0x5a3318),
    pane: new THREE.MeshLambertMaterial({ color: p.glass, transparent: true, opacity: 0.72 }),
    stone: L(p.wall),
    stoneDark: L(0x9a948a),
    stucco: L(p.wall),
    stuccoWarm: L(p.trim),
    roof: L(p.roof),
    roofDark: L(p.roof),
    chimney: L(0x8a7a6a),
    soot: L(0x4a4440),
    smoke: new THREE.MeshLambertMaterial({ color: 0xdedede, transparent: true, opacity: 0.35, depthWrite: false }),
    path: L(0xc8c0b4),
    dirt: L(0x9a8a6a),
    soil: L(0x6b5a3a),
    grass: L(0x6ea34a),
    grassDark: L(0x4f7d36),
    flowerR: L(0xd23a4a),
    flowerY: L(0xe8c547),
    flowerP: L(0xd07ab5),
    hedge: L(0x3f7a38),
    leaf: L(0x4f8a3a),
    leafDark: L(0x2f6a2a),
    trunk: L(0x5a3a22),
    fence: L(0x7a4e2e),
    awningA: L(p.trim),
    awningB: L(p.accent),
    column: L(p.trim),
    marble: L(0xece8e0),
    pool: new THREE.MeshStandardMaterial({ color: 0x2aa8c4, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }),
    poolEdge: L(0xe8e4dc),
    deck: L(0xb8894e),
    iron: L(0x2a2a2e),
    lantern: L(0xe8c84a),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.45, depthWrite: false }),
    gold: S(0xd4a017, { roughness: 0.35, metalness: 0.7 }),
    waterFoam: L(0xd6f0f4),
    pad: L(0xd8cbb3),
    padStone: L(0xcac3b6),
    shutter: L(p.shutter),
    cornice: L(p.trim),
    wall: L(p.wall),
    trim: L(p.trim),
    cladding: L(p.cladding),
    mullion: L(p.mullion),
    glassSolid: S(p.glass, { roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.7 }),
    rubber: L(0x1a1a1c),
    chrome: S(0xc8c8d0, { roughness: 0.25, metalness: 0.85 }),
    carBody: L(p.body),
    carDark: L(0x1c1c20),
    carGlass: new THREE.MeshLambertMaterial({ color: 0x89c4dc, transparent: true, opacity: 0.75 }),
    hull: L(0xf2f0ea),
    hullAccent: L(p.accent),
    hullDark: L(0x2a3a48),
    sea: new THREE.MeshStandardMaterial({ color: 0x2a8cb0, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.85 }),
    asphalt: L(0x6a6a6e),
    waterLite: L(0x3a9ec0),
  };
}

function add(mesh, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(mat, w, h, d, parent, x, y, z, rx, ry, rz) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), parent, x, y, z, rx, ry, rz);
}

function cyl(mat, rTop, rBot, h, segs, parent, x, y, z, rx, ry, rz) {
  return add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat), parent, x, y, z, rx, ry, rz);
}

function sph(mat, r, segs, parent, x, y, z) {
  return add(new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs), mat), parent, x, y, z);
}

function cone(mat, r, h, segs, parent, x, y, z) {
  return add(new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), mat), parent, x, y, z);
}

function pitchedRoof(mat, w, d, rise, parent, x, y, z) {
  const thick = 0.18;
  const len = Math.hypot(d / 2, rise);
  const ang = Math.atan2(rise, d / 2);
  box(mat, w + 0.3, thick, len, parent, x, y + rise / 2, z - d / 4, ang, 0, 0);
  box(mat, w + 0.3, thick, len, parent, x, y + rise / 2, z + d / 4, -ang, 0, 0);
  box(mat, 0.12, rise + 0.1, d + 0.15, parent, x - w / 2 - 0.05, y + rise / 2, z);
  box(mat, 0.12, rise + 0.1, d + 0.15, parent, x + w / 2 + 0.05, y + rise / 2, z);
}

function hippedRoof(mat, w, d, rise, parent, x, y, z) {
  const thick = 0.18;
  const lenZ = Math.hypot(d / 2, rise);
  const angZ = Math.atan2(rise, d / 2);
  const lenX = Math.hypot(w / 2, rise);
  const angX = Math.atan2(rise, w / 2);
  box(mat, w * 0.72, thick, lenZ, parent, x, y + rise / 2, z - d / 4, angZ, 0, 0);
  box(mat, w * 0.72, thick, lenZ, parent, x, y + rise / 2, z + d / 4, -angZ, 0, 0);
  box(mat, lenX, thick, d * 0.72, parent, x - w / 4, y + rise / 2, z, 0, 0, -angX);
  box(mat, lenX, thick, d * 0.72, parent, x + w / 4, y + rise / 2, z, 0, 0, angX);
}

function shedRoof(mat, w, d, rise, parent, x, y, z) {
  const thick = 0.18;
  const len = Math.hypot(d, rise);
  const ang = Math.atan2(rise, d);
  box(mat, w + 0.3, thick, len, parent, x, y + rise / 2, z, ang, 0, 0);
  box(mat, 0.12, rise + 0.1, d + 0.15, parent, x - w / 2 - 0.05, y + rise / 2, z);
  box(mat, 0.12, rise + 0.1, d + 0.15, parent, x + w / 2 + 0.05, y + rise / 2, z);
}

function flatRoof(mat, trimMat, w, d, parent, x, y, z, parapet = 0.45) {
  box(mat, w + 0.2, 0.16, d + 0.2, parent, x, y + 0.08, z);
  if (parapet > 0) {
    const t = 0.16;
    box(trimMat, w + 0.28, parapet, t, parent, x, y + parapet / 2, z - d / 2);
    box(trimMat, w + 0.28, parapet, t, parent, x, y + parapet / 2, z + d / 2);
    box(trimMat, t, parapet, d + 0.28, parent, x - w / 2, y + parapet / 2, z);
    box(trimMat, t, parapet, d + 0.28, parent, x + w / 2, y + parapet / 2, z);
  }
}

function styleRoof(style, mats, w, d, rise, parent, x, y, z) {
  if (style.roof === 'hipped') hippedRoof(mats.roof, w, d, rise, parent, x, y, z);
  else if (style.roof === 'shed') shedRoof(mats.roof, w, d, rise * 0.85, parent, x, y, z);
  else if (style.roof === 'flat') flatRoof(mats.roof, mats.trim, w, d, parent, x, y, z, 0.4);
  else pitchedRoof(mats.roof, w, d, rise, parent, x, y, z);
}

function windowPane(mats, parent, x, y, z, w = 0.7, h = 0.9) {
  box(mats.woodDark, w + 0.1, h + 0.1, 0.12, parent, x, y, z);
  const pane = box(mats.pane, w, h, 0.08, parent, x, y, z + 0.03);
  pane.userData.windowLite = true;
}

function shutteredWindow(mats, parent, x, y, z, w = 0.7, h = 0.9) {
  windowPane(mats, parent, x, y, z, w, h);
  box(mats.shutter, 0.22, h, 0.08, parent, x - w / 2 - 0.14, y, z + 0.06);
  box(mats.shutter, 0.22, h, 0.08, parent, x + w / 2 + 0.14, y, z + 0.06);
}

function railing(mat, parent, x, y, z, w, d) {
  const h = 0.55, t = 0.07;
  box(mat, w, t, t, parent, x, y + h, z - d / 2);
  box(mat, w, t, t, parent, x, y + h, z + d / 2);
  box(mat, t, t, d, parent, x - w / 2, y + h, z);
  box(mat, t, t, d, parent, x + w / 2, y + h, z);
  const n = Math.max(2, Math.round(w / 0.45));
  for (let i = 0; i <= n; i++) {
    const px = x - w / 2 + (i / n) * w;
    cyl(mat, 0.03, 0.03, h, 6, parent, px, y + h / 2, z - d / 2);
    cyl(mat, 0.03, 0.03, h, 6, parent, px, y + h / 2, z + d / 2);
  }
}

function fenceRect(mat, parent, w, d, y = 0.05) {
  const h = 0.85;
  const postsX = Math.round(w / 1.4);
  const postsZ = Math.round(d / 1.4);
  function run(len, px, pz, rotY) {
    box(mat, len, 0.07, 0.06, parent, px, y + h * 0.4, pz, 0, rotY, 0);
    box(mat, len, 0.07, 0.06, parent, px, y + h * 0.7, pz, 0, rotY, 0);
  }
  run(w, 0, -d / 2, 0);
  run(w, 0, d / 2, 0);
  run(d, -w / 2, 0, Math.PI / 2);
  run(d, w / 2, 0, Math.PI / 2);
  for (let i = 0; i <= postsX; i++) {
    const px = -w / 2 + (i / postsX) * w;
    cyl(mat, 0.07, 0.08, h, 6, parent, px, y + h / 2, -d / 2);
    cyl(mat, 0.07, 0.08, h, 6, parent, px, y + h / 2, d / 2);
  }
  for (let i = 1; i < postsZ; i++) {
    const pz = -d / 2 + (i / postsZ) * d;
    cyl(mat, 0.07, 0.08, h, 6, parent, -w / 2, y + h / 2, pz);
    cyl(mat, 0.07, 0.08, h, 6, parent, w / 2, y + h / 2, pz);
  }
}

function cypress(mats, parent, x, y, z, scale = 1) {
  cyl(mats.trunk, 0.12 * scale, 0.16 * scale, 0.8 * scale, 6, parent, x, y + 0.4 * scale, z);
  cone(mats.leafDark, 0.55 * scale, 2.6 * scale, 8, parent, x, y + 1.9 * scale, z);
  cone(mats.leaf, 0.4 * scale, 1.8 * scale, 8, parent, x, y + 2.5 * scale, z);
}

function olive(mats, parent, x, y, z, scale = 1) {
  cyl(mats.trunk, 0.14 * scale, 0.2 * scale, 1.1 * scale, 6, parent, x, y + 0.55 * scale, z);
  sph(mats.leaf, 0.85 * scale, 8, parent, x, y + 1.5 * scale, z);
  sph(mats.leafDark, 0.6 * scale, 8, parent, x + 0.4 * scale, y + 1.45 * scale, z + 0.15 * scale);
}

function flowerBed(mats, parent, x, z, w, d) {
  box(mats.soil, w, 0.18, d, parent, x, 0.1, z);
  const colors = [mats.flowerR, mats.flowerY, mats.flowerP, mats.flowerR];
  const n = Math.max(3, Math.round(w * d * 4));
  for (let i = 0; i < n; i++) {
    const fx = x + (Math.sin(i * 12.3) * 0.5) * (w - 0.3);
    const fz = z + (Math.cos(i * 9.1) * 0.5) * (d - 0.3);
    sph(colors[i % colors.length], 0.09, 6, parent, fx, 0.26, fz);
  }
}

function hedgeBox(mats, parent, x, y, z, w, h, d) {
  box(mats.hedge, w, h, d, parent, x, y + h / 2, z);
}

function loungeChair(mats, parent, x, y, z, ry = 0) {
  const g = new THREE.Group();
  box(mats.deck, 0.55, 0.08, 1.2, g, 0, 0.22, 0);
  box(mats.deck, 0.55, 0.08, 0.5, g, 0, 0.42, -0.45, 0.7, 0, 0);
  box(mats.woodDark, 0.06, 0.22, 0.06, g, -0.22, 0.11, 0.5);
  box(mats.woodDark, 0.06, 0.22, 0.06, g, 0.22, 0.11, 0.5);
  add(g, parent, x, y, z, 0, ry, 0);
}

function fountain(mats, parent, x, y, z, scale = 1) {
  const rim = mats.marble;
  cyl(rim, 0.9 * scale, 1.0 * scale, 0.25 * scale, 12, parent, x, y + 0.13 * scale, z);
  cyl(mats.pool, 0.7 * scale, 0.7 * scale, 0.12 * scale, 12, parent, x, y + 0.22 * scale, z);
  cyl(rim, 0.12 * scale, 0.16 * scale, 0.7 * scale, 8, parent, x, y + 0.5 * scale, z);
  sph(mats.pool, 0.18 * scale, 8, parent, x, y + 0.95 * scale, z);
  sph(mats.waterFoam, 0.1 * scale, 6, parent, x, y + 1.15 * scale, z);
}

function tentGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0);
  shape.lineTo(0, 2.15);
  shape.lineTo(1.5, 0);
  shape.lineTo(-1.5, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false });
  g.translate(0, 0, -1.3);
  g.rotateY(Math.PI / 2);
  return g;
}

/* Land vehicles (sedan, sports car, F1) are removed: no cars anywhere on the map.
   Yachts remain from level 15. */

export function yachtLengthForLevel(L) {
  if (L < 15) return 0;
  if (L <= 16) return 5;
  if (L <= 19) return 8;
  if (L <= 22) return 13;
  if (L <= 25) return 20;
  if (L <= 29) return 30;
  return 42;
}

export function createYacht(level, styleOrName) {
  const style = typeof styleOrName === 'string' || !styleOrName ? styleFromName(styleOrName) : styleOrName;
  const mats = makeMats(style.palette);
  const g = new THREE.Group();
  const L = Math.max(0, level | 0);
  if (L < 15) {
    g.userData.length = 0;
    g.userData.height = 0;
    return { group: g, length: 0, height: 0, style, setLevel() {}, tick() {} };
  }
  const len = yachtLengthForLevel(L);
  const beam = Math.max(1.6, len * 0.22);
  const hullH = Math.max(0.7, len * 0.09);

  // hull: tapered box + bow
  box(mats.hull, beam, hullH, len * 0.82, g, 0, hullH * 0.45, -len * 0.04);
  // stripe
  box(mats.hullAccent, beam + 0.04, 0.12, len * 0.8, g, 0, hullH * 0.7, -len * 0.04);
  // bow wedge
  const bow = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.55, len * 0.28, 4), mats.hull);
  bow.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  add(bow, g, 0, hullH * 0.45, len * 0.42);

  // dark waterline
  box(mats.hullDark, beam + 0.02, 0.16, len * 0.84, g, 0, 0.12, -len * 0.02);

  if (L >= 17) {
    // cabin
    const cabH = Math.max(0.9, len * 0.08);
    const cabL = len * (L >= 25 ? 0.45 : 0.38);
    box(mats.hull, beam * 0.72, cabH, cabL, g, 0, hullH + cabH / 2, -len * 0.08);
    box(mats.carGlass, beam * 0.74, cabH * 0.5, cabL * 0.9, g, 0, hullH + cabH * 0.55, -len * 0.08);
  }
  if (L >= 20) {
    // flybridge
    const flyH = 0.55;
    box(mats.hull, beam * 0.55, flyH, len * 0.22, g, 0, hullH + 1.35, -len * 0.02);
    box(mats.carGlass, beam * 0.5, 0.35, len * 0.16, g, 0, hullH + 1.45, 0.02);
    cyl(mats.chrome, 0.04, 0.04, 1.6, 6, g, 0.3, hullH + 2.2, -len * 0.1);
    cyl(mats.chrome, 0.04, 0.04, 1.2, 6, g, -0.3, hullH + 2.0, -len * 0.1);
  }
  if (L >= 23) {
    // rear deck rail + seats
    railing(mats.chrome, g, 0, hullH, -len * 0.32, beam * 0.6, len * 0.16);
    box(mats.deck, beam * 0.5, 0.06, len * 0.18, g, 0, hullH + 0.04, -len * 0.32);
  }
  if (L >= 26) {
    // upper sundeck
    box(mats.hull, beam * 0.62, 0.1, len * 0.28, g, 0, hullH + 1.85, -len * 0.05);
    box(mats.pool, beam * 0.28, 0.12, len * 0.12, g, 0, hullH + 1.95, -len * 0.12);
    box(mats.poolEdge, beam * 0.34, 0.06, len * 0.15, g, 0, hullH + 1.9, -len * 0.12);
  }
  if (L >= 30) {
    // helipad at bow deck + radar + luxury bits
    const padY = hullH + 0.12;
    box(mats.padStone, beam * 0.55, 0.08, beam * 0.55, g, 0, padY, len * 0.18);
    const ring = new THREE.Mesh(new THREE.RingGeometry(beam * 0.14, beam * 0.18, 16), mats.hullAccent);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, padY + 0.05, len * 0.18);
    g.add(ring);
    // radar
    cyl(mats.chrome, 0.06, 0.06, 2.4, 6, g, 0, hullH + 3.2, -len * 0.08);
    box(mats.chrome, 1.1, 0.08, 0.35, g, 0, hullH + 4.4, -len * 0.08);
    sph(mats.gold, 0.16, 8, g, 0, hullH + 4.6, -len * 0.08);
    // jacuzzi glow
    sph(mats.glow, 0.35, 8, g, 0, hullH + 2.1, -len * 0.12);
  }

  // simple mast light
  if (L >= 20) {
    const lamp = sph(mats.lantern, 0.1, 8, g, 0, hullH + (L >= 30 ? 4.9 : 2.6), -len * 0.08);
    lamp.userData.glow = true;
  }

  const height = hullH + (L >= 30 ? 5.2 : L >= 26 ? 2.4 : L >= 20 ? 2.0 : L >= 17 ? 1.4 : 0.9);
  g.userData.length = len;
  g.userData.height = height;
  g.userData.beam = beam;

  return {
    group: g,
    length: len,
    height,
    style,
    tick(t) {
      if (g.userData.baseY == null) g.userData.baseY = g.position.y;
      g.position.y = g.userData.baseY + Math.sin(t * 1.2) * 0.12;
      g.rotation.z = Math.sin(t * 0.9) * 0.012;
      g.traverse((o) => {
        if (o.userData.glow && o.material) {
          o.material.opacity = 0.45 + 0.25 * Math.sin(t * 3);
        }
      });
    },
  };
}

/* ---------------- facade textures ---------------- */

const facadeCache = new Map();

function makeFacadeMaps(style, floors, bays, litBoost) {
  const p = style.palette;
  const key = [p.id, style.facade, floors, bays, litBoost.toFixed(2), style.litJitter.toFixed(3)].join('|');
  if (facadeCache.has(key)) return facadeCache.get(key);

  const pw = Math.max(128, bays * 24);
  const ph = Math.max(256, floors * 32);
  const albedo = document.createElement('canvas');
  albedo.width = pw;
  albedo.height = ph;
  const emissive = document.createElement('canvas');
  emissive.width = pw;
  emissive.height = ph;
  const a = albedo.getContext('2d');
  const e = emissive.getContext('2d');
  a.fillStyle = hexCol(p.cladding);
  a.fillRect(0, 0, pw, ph);
  e.fillStyle = '#000';
  e.fillRect(0, 0, pw, ph);

  const glass = hexCol(p.glass);
  const mullion = hexCol(p.mullion);
  const lit = hexCol(p.lit);
  const rng = mulberry32(hashString(style.name + ':' + floors + ':' + style.facade));

  for (let f = 0; f < floors; f++) {
    // Floor 0 at the BOTTOM of the canvas so v=0 is the ground floor.
    const y1 = ph - (f / floors) * ph;         // bottom of this floor in canvas
    const y0 = ph - ((f + 1) / floors) * ph;   // top of this floor in canvas
    const fh = y1 - y0;
    const spandrel = style.facade === 'bands' ? fh * 0.28 : style.facade === 'stripes' ? fh * 0.10 : fh * 0.18;
    a.fillStyle = hexCol(p.cladding);
    a.fillRect(0, y0, pw, spandrel);
    a.fillRect(0, y1 - Math.max(2, fh * 0.06), pw, Math.max(2, fh * 0.06));

    const winTop = y0 + spandrel;
    const winH = y1 - Math.max(2, fh * 0.06) - winTop;
    for (let b = 0; b < bays; b++) {
      let bx = (b / bays) * pw;
      if (style.facade === 'offset' && f % 2 === 1) bx += (pw / bays) * 0.5;
      const bw = pw / bays;
      const padX = style.facade === 'stripes' ? bw * 0.12 : bw * 0.18;
      const wx = bx + padX * 0.5;
      const ww = bw - padX;
      const checkerDark = style.facade === 'checker' && (f + b) % 2 === 0;
      const litChance = (0.12 + litBoost * 0.5 + (rng() - 0.5) * 0.08) * (checkerDark ? 0.5 : 1);
      const isLit = rng() < litChance;
      if (isLit) {
        a.fillStyle = lit;
        e.fillStyle = lit;
        a.fillRect(wx, winTop, ww, winH);
        e.fillRect(wx, winTop, ww, winH);
      } else {
        a.fillStyle = checkerDark ? '#1c2a36' : glass;
        a.fillRect(wx, winTop, ww, winH);
        a.fillStyle = 'rgba(20,30,40,0.28)';
        a.fillRect(wx, winTop + winH * 0.45, ww, winH * 0.55);
        a.fillStyle = 'rgba(255,255,255,0.28)';
        a.fillRect(wx, winTop, ww, winH * 0.28);
      }
      // mullions
      a.fillStyle = mullion;
      a.fillRect(bx, y0, Math.max(2, bw * 0.06), fh);
    }
  }
  // vertical edge mullions
  a.fillStyle = mullion;
  a.fillRect(0, 0, 3, ph);
  a.fillRect(pw - 3, 0, 3, ph);

  const map = new THREE.CanvasTexture(albedo);
  const emap = new THREE.CanvasTexture(emissive);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emap.wrapS = emap.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.32,
    metalness: 0.18,
    emissive: 0xffffff,
    emissiveMap: emap,
    emissiveIntensity: 0.7 + litBoost * 0.55,
  });
  const pack = { mat, map, emap };
  facadeCache.set(key, pack);
  return pack;
}

function facadeBox(mat, w, h, d, parent, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  add(mesh, parent, x, y, z, 0, ry, 0);
  return mesh;
}

function tentAt(mats, g) {
  const tent = new THREE.Mesh(tentGeometry(), mats.tent);
  tent.castShadow = tent.receiveShadow = true;
  g.add(tent);
  box(mats.tentStripe, 0.08, 2.0, 0.08, g, 0, 1.05, 0);
  for (const sx of [-1.4, 1.4]) {
    for (const sz of [-1.1, 1.1]) {
      cyl(mats.woodDark, 0.04, 0.03, 0.35, 5, g, sx, 0.2, sz, 0.5, 0, 0);
    }
  }
  box(mats.woodLight, 1.2, 0.15, 0.5, g, 0, 0.18, 1.5);
}

function buildLowHouse(L, mats, style, g, padW, padD) {
  // L2–L19 house / villa. No castle features.
  if (L >= 2 && L <= 5) {
    const w = 3.6 * style.squat, d = 3.2 * style.stretch, h = 2.3;
    box(mats.wood, w, h, d, g, 0, h / 2, 0);
    box(mats.woodDark, w + 0.1, 0.1, d + 0.1, g, 0, 0.12, 0);
    if (L >= 3) {
      box(mats.door, 0.85, 1.7, 0.12, g, 0, 0.95, d / 2 + 0.05);
      windowPane(mats, g, -1.1, 1.4, d / 2 + 0.04, 0.6, 0.7);
      windowPane(mats, g, 0, 1.5, -d / 2 - 0.04, 0.7, 0.6);
    } else {
      box(mats.tentDark || mats.woodDark, 0.7, 1.5, 0.08, g, 0, 0.9, d / 2 + 0.05);
    }
    if (L >= 4) styleRoof(style, mats, w, d + 0.2, 1.15, g, 0, h, 0);
    else box(mats.woodDark, w + 0.3, 0.12, d + 0.3, g, 0, h + 0.06, 0);
    if (L >= 5) {
      box(mats.chimney, 0.45, 1.3, 0.45, g, -1.1, h + 1.1, -0.5);
      box(mats.soot, 0.52, 0.12, 0.52, g, -1.1, h + 1.75, -0.5);
      const smoke = sph(mats.smoke, 0.28, 8, g, -1.1, h + 2.15, -0.5);
      smoke.userData.smoke = true;
      const s2 = sph(mats.smoke, 0.22, 8, g, -0.95, h + 2.55, -0.45);
      s2.userData.smoke = true;
    }
    return { fw: w, fd: d, roofY: h + (L >= 4 && style.roof !== 'flat' ? 1.15 : 0.2) };
  }

  const villa = L >= 16;
  const wallMat = villa ? mats.stuccoWarm : L >= 6 ? mats.stone : mats.wood;
  const trimMat = mats.trim;
  const floors = L >= 10 ? 2 : 1;
  const completeFloors = L === 10 ? 1 : floors;
  const fw = (L >= 19 ? 11 : L >= 16 ? 9.5 : 6.4) * style.squat;
  const fd = (L >= 19 ? 9 : L >= 16 ? 7.8 : 5.6) * style.stretch;
  const fh = 3.05;
  const baseY = 0.12;

  for (let f = 0; f < (L === 10 ? 2 : completeFloors); f++) {
    const y0 = baseY + f * fh;
    const h = f === 1 && L === 10 ? 2.2 : fh;
    box(wallMat, fw, h, fd, g, 0, y0 + h / 2, 0);
    box(trimMat, fw + 0.25, 0.16, fd + 0.25, g, 0, y0 + h - 0.05, 0);
    if (villa) box(trimMat, fw + 0.2, 0.14, fd + 0.2, g, 0, y0 + 0.1, 0);
    const wy = y0 + (f === 1 && L === 10 ? 1.1 : 1.55);
    const win = (x, z, w = 0.7, hh = 0.95) => shutteredWindow(mats, g, x, wy, z, w, hh);
    if (f === 0) {
      win(-fw / 2 + 1.3, fd / 2 + 0.05);
      win(fw / 2 - 1.3, fd / 2 + 0.05);
      if (L >= 9) {
        win(-fw / 2 + 2.6, fd / 2 + 0.05, 0.6, 0.8);
        win(fw / 2 - 2.6, fd / 2 + 0.05, 0.6, 0.8);
      }
    } else {
      win(-fw / 2 + 1.6, fd / 2 + 0.05);
      win(0, fd / 2 + 0.05);
      win(fw / 2 - 1.6, fd / 2 + 0.05);
    }
    win(-fw / 2 - 0.05, 0);
    if (L >= 9) win(-fw / 2 - 0.05, fd / 4);
    win(fw / 2 + 0.05, 0);
    if (L >= 9) win(fw / 2 + 0.05, -fd / 4);
    win(0, -fd / 2 - 0.05);
    if (L >= 9) {
      win(-fw / 3, -fd / 2 - 0.05);
      win(fw / 3, -fd / 2 - 0.05);
    }
  }

  box(mats.door, 1.05, 2.1, 0.14, g, 0, 1.15, fd / 2 + 0.08);
  box(trimMat, 1.25, 2.25, 0.08, g, 0, 1.2, fd / 2 + 0.03);

  const roofY = baseY + (L === 10 ? 1 : completeFloors) * fh;
  if (L === 10) {
    // unfinished second-floor frame, no roof on top yet
    box(wallMat, 0.2, 2.2, 0.2, g, -fw / 2, roofY + 1.1, -fd / 2);
    box(wallMat, 0.2, 2.2, 0.2, g, fw / 2, roofY + 1.1, -fd / 2);
    box(wallMat, 0.2, 2.2, 0.2, g, -fw / 2, roofY + 1.1, fd / 2);
    box(wallMat, 0.2, 2.2, 0.2, g, fw / 2, roofY + 1.1, fd / 2);
    box(mats.woodDark, fw + 0.2, 0.12, 0.12, g, 0, roofY + 2.2, -fd / 2);
    box(mats.woodDark, fw + 0.2, 0.12, 0.12, g, 0, roofY + 2.2, fd / 2);
  } else {
    styleRoof(style, mats, fw, fd + 0.15, 1.6, g, 0, roofY, 0);
    if (L >= 5 && style.roof !== 'flat') {
      box(mats.chimney, 0.45, 1.2, 0.45, g, -fw / 3, roofY + 1.5, -fd / 5);
    }
  }

  if (L >= 9) {
    // striped awning over door
    for (let i = 0; i < 6; i++) {
      const m = i % 2 === 0 ? mats.awningA : mats.awningB;
      box(m, 0.32, 0.08, 1.1, g, -0.8 + i * 0.32, 2.35, fd / 2 + 0.55, 0.35, 0, 0);
    }
  }
  if (L >= 12) {
    box(mats.padStone, 3.2, 0.12, 1.4, g, 0, roofY * 0 + 3.2, fd / 2 + 0.55);
    // balcony floor at second storey
    box(mats.padStone, fw * 0.55, 0.12, 1.5, g, 0, baseY + fh + 0.06, fd / 2 + 0.55);
    railing(mats.iron, g, 0, baseY + fh + 0.06, fd / 2 + 0.55, fw * 0.55, 1.4);
  }
  if (L >= 16) {
    // villa columns at the door
    for (const sx of [-1.15, 1.15]) {
      cyl(mats.column, 0.18, 0.2, 2.4, 10, g, sx, 1.3, fd / 2 + 0.45);
      box(mats.marble, 0.4, 0.1, 0.4, g, sx, 2.55, fd / 2 + 0.45);
    }
    box(trimMat, 3.0, 0.18, 0.7, g, 0, 2.65, fd / 2 + 0.4);
  }
  if (L >= 19) {
    // extra side wing — modern, not a palace wing
    const ww = 4.2, wd = 5.5, wh = fh * (L >= 11 ? 2 : 1);
    box(wallMat, ww, wh, wd, g, fw / 2 + ww / 2 - 0.2, baseY + wh / 2, -0.4);
    box(trimMat, ww + 0.2, 0.14, wd + 0.2, g, fw / 2 + ww / 2 - 0.2, baseY + wh - 0.05, -0.4);
    styleRoof(style, mats, ww, wd, 1.2, g, fw / 2 + ww / 2 - 0.2, baseY + wh, -0.4);
    shutteredWindow(mats, g, fw / 2 + ww - 0.15, 1.55, 0.8);
    shutteredWindow(mats, g, fw / 2 + ww - 0.15, 1.55, -1.4);
  }

  return { fw, fd, roofY: roofY + (style.roof === 'flat' || L === 10 ? 0.5 : 1.6) };
}

function buildGarden(L, mats, style, g, padW, padD, fw, fd) {
  if (L >= 7) {
    box(mats.path, 1.4, 0.08, padD * 0.45, g, 0, 0.16, fd / 2 + (padD / 2 - fd / 2) * 0.45);
    flowerBed(mats, g, -fw / 2 - 1.1, fd / 2 - 0.6, 1.6, 0.7);
    flowerBed(mats, g, fw / 2 + 1.1, fd / 2 - 0.6, 1.6, 0.7);
  }
  if (L >= 8) fenceRect(mats.fence, g, padW - 0.8, padD - 0.8, 0.08);
  if (L >= 13) {
    cypress(mats, g, -padW * 0.35, 0, -padD * 0.32, 1.1);
    olive(mats, g, padW * 0.34, 0, -padD * 0.28, 1.0);
  }
  if (L >= 14 && L < 20) {
    // garage
    const gw = 3.4, gd = 5.0, gh = 2.4;
    box(mats.stone, gw, gh, gd, g, -fw / 2 - gw / 2 - 0.2, gh / 2, fd / 4);
    box(mats.woodDark, gw - 0.3, gh - 0.5, 0.1, g, -fw / 2 - gw / 2 - 0.2, gh / 2 - 0.1, fd / 4 + gd / 2 + 0.04);
    styleRoof(style, mats, gw, gd, 0.8, g, -fw / 2 - gw / 2 - 0.2, gh, fd / 4);
  }
  if (L >= 15) {
    const pw = L >= 17 ? 5.5 : 3.6;
    const pd = L >= 17 ? 3.2 : 2.2;
    const px = padW * 0.22;
    const pz = -padD * 0.28;
    box(mats.poolEdge, pw + 0.5, 0.2, pd + 0.5, g, px, 0.14, pz);
    box(mats.pool, pw, 0.16, pd, g, px, 0.2, pz);
    if (L >= 17) {
      box(mats.deck, pw + 1.6, 0.1, pd + 1.4, g, px, 0.12, pz);
      box(mats.poolEdge, pw + 0.5, 0.2, pd + 0.5, g, px, 0.16, pz);
      box(mats.pool, pw, 0.16, pd, g, px, 0.22, pz);
      loungeChair(mats, g, px - pw / 2 - 0.5, 0.16, pz, 0.4);
      loungeChair(mats, g, px - pw / 2 - 0.5, 0.16, pz + 1.2, 0.4);
    }
  }
  if (L >= 18) {
    fountain(mats, g, 0, 0.12, fd / 2 + 2.2, L >= 20 ? 1.15 : 1);
  }
}

function addCrown(mats, style, g, x, y, z, radius) {
  const kind = style.crown;
  const gold = mats.gold;
  const clad = mats.cladding;
  if (kind === 'ball') {
    cone(gold, radius * 0.35, 3.2, 8, g, x, y + 1.6, z);
    cyl(gold, 0.1, 0.1, 6.5, 6, g, x, y + 5.4, z);
    sph(gold, 0.55, 10, g, x, y + 9.0, z);
    cyl(gold, 0.06, 0.06, 3.2, 6, g, x, y + 11.2, z);
    sph(mats.lantern, 0.18, 8, g, x, y + 12.9, z);
  } else if (kind === 'fins') {
    box(clad, radius * 1.15, 2.2, radius * 1.15, g, x, y + 1.1, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fx = x + Math.cos(a) * radius * 0.55;
      const fz = z + Math.sin(a) * radius * 0.55;
      box(gold, 0.22, 9.5, 1.35, g, fx, y + 6.2, fz, 0, a, 0);
    }
    cyl(gold, 0.1, 0.1, 6.5, 6, g, x, y + 11.5, z);
    sph(gold, 0.38, 8, g, x, y + 15.0, z);
  } else if (kind === 'helipad') {
    box(clad, radius * 1.5, 0.35, radius * 1.5, g, x, y + 0.2, z);
    railing(mats.iron, g, x, y + 0.2, z, radius * 1.4, radius * 1.4);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.35, radius * 0.48, 20), gold);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.42, z);
    g.add(ring);
    box(gold, radius * 0.08, 0.05, radius * 0.7, g, x, y + 0.42, z);
    box(gold, radius * 0.7, 0.05, radius * 0.08, g, x, y + 0.42, z);
    cyl(mats.chrome, 0.07, 0.07, 6.5, 6, g, x + radius * 0.55, y + 3.5, z + radius * 0.55);
    sph(mats.lantern, 0.16, 8, g, x + radius * 0.55, y + 6.9, z + radius * 0.55);
  } else if (kind === 'pyramid') {
    cone(mats.glassSolid, radius * 0.85, 5.5, 4, g, x, y + 2.7, z);
    cyl(gold, 0.08, 0.08, 5.5, 6, g, x, y + 8.0, z);
    sph(gold, 0.32, 8, g, x, y + 10.9, z);
  } else if (kind === 'antenna') {
    box(clad, radius * 0.9, 1.4, radius * 0.9, g, x, y + 0.7, z);
    for (const [dx, dz, h] of [[0.2, 0.15, 14], [-0.25, 0.1, 10], [0.05, -0.22, 8]]) {
      cyl(mats.chrome, 0.05, 0.08, h, 6, g, x + dx, y + 1.4 + h / 2, z + dz);
    }
    sph(mats.lantern, 0.14, 8, g, x + 0.2, y + 15.6, z + 0.15);
    cyl(gold, 0.2, 0.2, 0.15, 8, g, x + 0.2, y + 15.2, z + 0.15);
  } else {
    // needle (default)
    cone(clad, radius * 0.55, 4.2, 8, g, x, y + 2.1, z);
    cyl(gold, 0.11, 0.22, 8.5, 8, g, x, y + 8.2, z);
    cyl(gold, 0.045, 0.1, 6.5, 6, g, x, y + 15.4, z);
    sph(gold, 0.22, 8, g, x, y + 18.8, z);
  }
}

function shaftFootprint(style, L) {
  let w, d;
  if (style.section === 'rect') {
    w = 11.5 * style.squat;
    d = 8.2 * style.stretch;
  } else if (style.section === 'round') {
    w = d = 10.4 * ((style.squat + style.stretch) * 0.5);
  } else {
    // square, twisted, stepped start from a near-square
    w = 10.6 * style.squat;
    d = 10.6 * style.stretch;
    if (style.section === 'square') {
      const s = (w + d) * 0.5;
      w = d = s;
    }
  }
  // early apartment is a bit wider/shorter
  if (L < 24) {
    w *= 1.15;
    d *= 1.12;
  }
  return { w, d };
}

function buildTower(L, mats, style, g) {
  const floors = floorsForLevel(L);
  const { w: bw, d: bd } = shaftFootprint(style, L);
  const litBoost = L >= 27 ? 0.7 : L >= 24 ? 0.35 : 0.15;
  const bays = style.section === 'rect' ? 8 : 6;
  const facade = makeFacadeMaps(style, Math.max(4, floors), bays, litBoost);
  const podiumH = 3.4;
  const shaftH = floors * FLOOR_H;
  // wider podium / lobby
  box(mats.cladding, bw + 2.4, podiumH, bd + 2.0, g, 0, podiumH / 2, 0);
  box(mats.trim, bw + 2.6, 0.18, bd + 2.2, g, 0, podiumH - 0.05, 0);
  box(mats.trim, bw + 2.6, 0.18, bd + 2.2, g, 0, 0.12, 0);

  if (L >= 22) {
    // glass lobby
    box(mats.glassSolid, Math.min(6.5, bw * 0.7), 2.6, 1.6, g, 0, 1.5, bd / 2 + 1.15);
    box(mats.trim, Math.min(6.7, bw * 0.72), 0.14, 1.8, g, 0, 2.85, bd / 2 + 1.15);
    box(mats.door, 1.6, 2.2, 0.16, g, 0, 1.2, bd / 2 + 1.95);
    // canopy
    box(mats.cladding, 7.2, 0.16, 2.4, g, 0, 2.95, bd / 2 + 1.6);
    for (const sx of [-2.8, 2.8]) {
      cyl(mats.chrome, 0.1, 0.1, 2.8, 8, g, sx, 1.45, bd / 2 + 2.2);
    }
  } else {
    box(mats.door, 1.4, 2.2, 0.16, g, 0, 1.2, bd / 2 + 1.05);
  }

  const y0 = podiumH; // shaft sits on podium? or podium is first floor
  // Let podium be the ground floor of the shaft (shaft starts at 0 but cladding podium is wider).
  // Shaft from y=0.1, podium is just a wider base around floor 0-1.
  const shaftY = 0.1;
  const setback = L >= 26;

  function facadeSlice(floorStart, floorCount) {
    if (floorStart === 0 && floorCount === floors) return facade.mat;
    const mat = facade.mat.clone();
    const map = facade.map.clone();
    const emap = facade.emap.clone();
    const rep = floorCount / floors;
    const off = floorStart / floors;
    for (const tex of [map, emap]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, rep);
      tex.offset.set(0, off);
      tex.needsUpdate = true;
    }
    mat.map = map;
    mat.emissiveMap = emap;
    return mat;
  }

  function placeShaftSegment(ww, dd, hh, yBase, rot, floorStart, floorCount) {
    const mat = facadeSlice(floorStart, floorCount);
    if (style.section === 'round' && !rot) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ww / 2, ww / 2, hh, 24), mat);
      add(mesh, g, 0, yBase + hh / 2, 0);
      cyl(mats.cladding, ww / 2 + 0.05, ww / 2 + 0.05, 0.2, 24, g, 0, yBase + hh - 0.05, 0);
    } else {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), mat);
      mesh.rotation.y = rot || 0;
      add(mesh, g, 0, yBase + hh / 2, 0);
    }
  }

  if (style.section === 'twisted') {
    const turns = (0.55 + style.twist) * Math.PI;
    const segH = FLOOR_H;
    for (let i = 0; i < floors; i++) {
      const t = i / Math.max(1, floors - 1);
      const slim = setback ? 1 - t * 0.22 : 1;
      placeShaftSegment(bw * slim, bd * slim, segH + 0.04, shaftY + i * segH, t * turns, i, 1);
    }
  } else if (style.section === 'stepped' || setback) {
    const tiers = style.section === 'stepped' || L >= 26 ? (L >= 28 ? 4 : 3) : 1;
    let used = 0;
    const fractions = tiers === 4 ? [0.35, 0.25, 0.22, 0.18] : tiers === 3 ? [0.42, 0.32, 0.26] : [1];
    const slims = tiers === 4 ? [1, 0.86, 0.72, 0.58] : tiers === 3 ? [1, 0.82, 0.66] : [1];
    for (let t = 0; t < tiers; t++) {
      const n = Math.max(1, Math.round(floors * fractions[t]));
      const hh = n * FLOOR_H;
      placeShaftSegment(bw * slims[t], bd * slims[t], hh, shaftY + used * FLOOR_H, 0, used, n);
      used += n;
    }
    if (used < floors) {
      const left = floors - used;
      placeShaftSegment(bw * slims[slims.length - 1], bd * slims[slims.length - 1], left * FLOOR_H, shaftY + used * FLOOR_H, 0, used, left);
    }
  } else {
    placeShaftSegment(bw, bd, shaftH, shaftY, 0, 0, floors);
  }

  const topY = shaftY + shaftH;
  // roof slab
  const capW = style.section === 'round' ? bw : bw * (setback ? 0.62 : 1);
  const capD = style.section === 'round' ? bd : bd * (setback ? 0.62 : 1);
  if (style.section === 'round') {
    cyl(mats.cladding, capW / 2 + 0.15, capW / 2 + 0.15, 0.35, 24, g, 0, topY + 0.15, 0);
  } else {
    box(mats.cladding, capW + 0.4, 0.35, capD + 0.4, g, 0, topY + 0.15, 0);
  }

  let crownH = 0;
  if (L >= 28) {
    addCrown(mats, style, g, 0, topY + 0.4, 0, Math.min(capW, capD) * 0.5);
    crownH = L >= 30 ? 16 : L >= 29 ? 10 : 6;
  } else if (L >= 24) {
    // simple mechanical crown / tanks
    box(mats.cladding, capW * 0.35, 1.6, capD * 0.35, g, 0, topY + 1.0, 0);
    cyl(mats.chrome, 0.06, 0.06, 2.4, 6, g, 0.4, topY + 2.4, 0.3);
  }

  // penthouse ring of lights at L27+
  if (L >= 27) {
    const glow = sph(mats.glow, 0.8, 10, g, 0, topY + 0.6, 0);
    glow.userData.glow = true;
  }

  return { topY: topY + crownH, fw: bw, fd: bd };
}

function buildHouseAtLevel(level, mats, style) {
  const g = new THREE.Group();
  const L = Math.max(1, Math.min(30, level | 0));

  const padW = L >= 26 ? 28 : L >= 20 ? 24 : L >= 14 ? 18 : L >= 8 ? 12 : L >= 6 ? 9 : 6;
  const padD = L >= 26 ? 26 : L >= 20 ? 22 : L >= 14 ? 16 : L >= 8 ? 11 : L >= 6 ? 8.5 : 6;
  box(L >= 20 ? mats.padStone : mats.pad, padW, 0.12, padD, g, 0, 0.06, 0);
  if (L >= 7) box(mats.grass, padW - 0.4, 0.06, padD - 0.4, g, 0, 0.13, 0);
  // driveway / parking apron at the front from L10
  if (L >= 10) {
    box(mats.asphalt, Math.min(padW - 1, 14), 0.08, 5.2, g, 0, 0.14, padD / 2 - 2.2);
  }

  let fw = 4, fd = 4, topY = 3.2;
  if (L === 1) {
    tentAt(mats, g);
    topY = 3.2;
  } else if (L < 20) {
    const built = buildLowHouse(L, mats, style, g, padW, padD);
    fw = built.fw;
    fd = built.fd;
    topY = built.roofY;
    buildGarden(L, mats, style, g, padW, padD, fw, fd);
  } else {
    const built = buildTower(L, mats, style, g);
    fw = built.fw;
    fd = built.fd;
    topY = built.topY;
    buildGarden(L, mats, style, g, padW, padD, fw, fd);
  }

  // Cars are not placed by houses (race circuit postponed).

  // optional local yacht (for cell / sheet renders). Hidden on the map — the map places its own.
  if (L >= 15) {
    const local = createYacht(L, style);
    const water = box(mats.sea, local.length + 6, 0.2, Math.max(8, local.length * 0.5), g, padW / 2 + local.length * 0.5 + 4, -0.02, 0);
    water.userData.localWater = true;
    local.group.position.set(padW / 2 + local.length * 0.5 + 4, 0.1, 0);
    local.group.rotation.y = Math.PI / 2;
    local.group.userData.localYacht = true;
    g.add(local.group);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(padW * 0.38, padW * 0.38 + 0.35, 32),
    mats.glow
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  ring.userData.glow = true;
  g.add(ring);

  g.userData.height = Math.max(topY, heightForLevel(L));
  g.userData.padW = padW;
  g.userData.padD = padD;
  g.userData.floors = L >= 20 ? floorsForLevel(L) : L >= 11 ? 2 : 1;
  return g;
}

function disposeInner(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // do not dispose shared / cached materials
  });
}

export function createHouse(opts = {}) {
  const root = new THREE.Group();
  let seedName = opts.seed || opts.name || 'mohammad_1';
  let style = styleFromName(seedName);
  let mats = makeMats(style.palette);
  let level = 1;
  let inner = buildHouseAtLevel(level, mats, style);
  root.add(inner);

  function rebuild() {
    root.remove(inner);
    disposeInner(inner);
    mats = makeMats(style.palette);
    inner = buildHouseAtLevel(level, mats, style);
    root.add(inner);
  }

  function setLevel(n) {
    n = Math.max(1, Math.min(30, n | 0));
    if (n === level && inner) return n;
    level = n;
    rebuild();
    return level;
  }

  function setSeed(name) {
    seedName = String(name || 'mohammad_1');
    style = styleFromName(seedName);
    rebuild();
    return style;
  }

  let nightFactor = 0;

  function tick(t) {
    inner.traverse((o) => {
      if (o.userData.smoke) {
        o.position.y += Math.sin(t * 1.4 + o.id) * 0.003;
        if (o.material) o.material.opacity = 0.22 + 0.14 * Math.sin(t * 1.7 + o.id);
      }
      if (o.userData.glow && o.material) {
        const s = 1 + 0.06 * Math.sin(t * 3);
        o.scale.set(s, s, s);
        o.material.opacity = 0.35 + 0.2 * Math.sin(t * 3);
      }
    });
  }

  function setNightFactor(n) {
    nightFactor = Math.max(0, Math.min(1, n));
    if (mats.pane) {
      mats.pane.emissive = mats.pane.emissive || new THREE.Color(0x000000);
      mats.pane.emissive.setHex(0xffc878);
      mats.pane.emissiveIntensity = nightFactor * 1.85;
      mats.pane.color.setHex(nightFactor > 0.3 ? 0xffe0a0 : style.palette.glass);
    }
    inner.traverse((o) => {
      if (o.material && o.material.emissiveMap) {
        o.material.emissiveIntensity = 0.22 + nightFactor * 1.85;
      }
      if (o.userData.glow && o.material && o.material.color) {
        o.material.opacity = 0.25 + nightFactor * 0.55;
      }
    });
  }

  function setDrive(_on) { /* no cars on the map */ }

  function getHeroCarWorld() { return null; }

  function setLocalExtrasVisible(v) {
    inner.traverse((o) => {
      if (o.userData.localYacht || o.userData.localWater) o.visible = !!v;
    });
  }

  return {
    group: root,
    setLevel,
    setSeed,
    getSeed: () => seedName,
    getStyle: () => style,
    getLevel: () => level,
    getHeight: () => inner.userData.height || heightForLevel(level),
    getPad: () => ({ w: inner.userData.padW, d: inner.userData.padD }),
    setLocalExtrasVisible,
    setNightFactor,
    setDrive,
    getHeroCarWorld,
    hasCar: () => false,
    tick,
    pop() {
      root.scale.set(1.12, 1.16, 1.12);
    },
  };
}

// Kept for compatibility; HUD / CSS2D labels replace canvas name tags in the map view.
export function createNameSprite(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  function draw(label, subtitle) {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(20,18,14,0.82)';
    roundRect(ctx, 20, 20, 472, 120, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 196, 90, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#fff6df';
    ctx.font = 'bold 48px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 68);
    ctx.fillStyle = '#e8c45a';
    ctx.font = '24px "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(subtitle, 256, 112);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  draw(text, sub);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(8, 2.5, 1);
  spr.renderOrder = 10;
  return {
    sprite: spr,
    set(label, subtitle) {
      draw(label, subtitle);
      tex.needsUpdate = true;
    },
    setHeight(h) {
      spr.position.y = h + 2.2;
    },
  };
}

export function createLevelBadgeTexture() {}
