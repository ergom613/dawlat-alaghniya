// Low-poly people matching the approved concepts:
// thobe+keffiyeh, hijab+dress, hoodie+jeans, child with yellow cap.
// Hero (one Group) + InstancedMesh pools for crowds. Shared geometries.
import * as THREE from 'three';

export const TYPES = ['thobe', 'hijab', 'hoodie', 'child'];

const SKINS = [0xd4a574, 0xc68642, 0xe0ac7e, 0xb07a4a, 0xe8c4a0, 0xc4a07a];
const HAIRS = [0x2a2018, 0x1a1410, 0x3a2a20, 0x4a3020, 0x1c1410];
const HIJAB = [
  { hijab: 0xe07a4a, hijab2: 0x1f8a8c, dress: 0x1c7f82, dress2: 0xe07a4a, gold: 0xd4a84a, shoe: 0xe07a4a },
  { hijab: 0xc45c6a, hijab2: 0x2a5c6e, dress: 0x2a5c6e, dress2: 0xc45c6a, gold: 0xd4a84a, shoe: 0xc45c6a },
  { hijab: 0xd9a03a, hijab2: 0x2e6b4a, dress: 0x2e6b4a, dress2: 0xd9a03a, gold: 0xe8c45a, shoe: 0xd9a03a },
  { hijab: 0x7a4a8c, hijab2: 0xe8d5b0, dress: 0x7a4a8c, dress2: 0xe8d5b0, gold: 0xd4a84a, shoe: 0x5a3068 },
];
const HOODIE = [
  { cloth: 0x7a9a8a, jeans: 0x3d5a7a, shoe: 0xf2f0ea, accent: 0xe8e4d8 },
  { cloth: 0x6a7a9a, jeans: 0x3a3f4a, shoe: 0xf2f0ea, accent: 0xe8e4d8 },
  { cloth: 0xb86a4a, jeans: 0x3d5a7a, shoe: 0xf2f0ea, accent: 0xe8e4d8 },
  { cloth: 0x4a4f55, jeans: 0x2a3340, shoe: 0xe8e4d8, accent: 0xd0ccc4 },
];
const ROBE = [0xf4f1ea, 0xe8e4d8, 0xf7f4ee, 0xeee8dc];

const FEMALE_RE = /\b(ays?ha|aisha|sara[h]?|lina|noor|nour|hanaa?|fatim|maryam|mariam|sawsan|rania|layla|leila|laila|nada|dina|reem|rim\b|yasmin|amal|hala|heba|hibah|salma|yara|zeinab|zaynab|aya\b|ayat|rana|rawan|maha|maya|mona|muna|rima|huda|iman|eman|farah|jamila|noura|hind|dalal|wafa|sumaya|somaya|rahaf|raghad|lama|dana|rama|batoul|ghada|ikram|ahlam|ola\b|olaa|nadine|nardeen|rasha|ruba|ruwaida|samar|samira|shirin|sofia|salwa|siham|suha|widad|yasmeen|zainab|zahra|layan|lujain|tamar|inass|elham)\b/i;

export function qualityTier() {
  const q = (new URLSearchParams(location.search).get('q') || 'mid').toLowerCase();
  if (q === 'low' || q === 'phone' || q === 'l') return 'low';
  if (q === 'high' || q === 'hi' || q === 'h') return 'high';
  return 'mid';
}

function hashStr(s) {
  let h = 2166136261;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function pickType(name, { allowChild = true } = {}) {
  const raw = String(name || '');
  const s = raw.toLowerCase().replace(/[._0-9]+/g, ' ').replace(/@/g, '').trim();
  if (FEMALE_RE.test(s) || /[ةى]$/.test(raw.trim())) return 'hijab';
  const h = hashStr(s || raw || 'x');
  const bag = allowChild
    ? ['thobe', 'hoodie', 'hijab', 'thobe', 'hoodie', 'child']
    : ['thobe', 'hoodie', 'hijab', 'thobe', 'hoodie'];
  return bag[h % bag.length];
}

export function paletteFor(type, seed) {
  const h = hashStr(seed || type);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >>> 3) % HAIRS.length];
  if (type === 'hijab') return { skin, hair, ...HIJAB[(h >>> 5) % HIJAB.length] };
  if (type === 'hoodie') return { skin, hair, ...HOODIE[(h >>> 5) % HOODIE.length] };
  if (type === 'child') {
    return { skin, hair, shirt: 0x5aaa3a, shorts: 0xc4a46a, cap: 0xf2d04a, capDark: 0xd4b03a, shoe: 0xf2f0ea, shoeRed: 0xc43a3a };
  }
  return { skin, hair, robe: ROBE[(h >>> 5) % ROBE.length], agal: 0x1a1410, sandal: 0x6a4a32 };
}

function geoBox(w, h, d, oy = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (oy) g.translate(0, oy, 0);
  return g;
}
function geoCyl(rt, rb, h, seg = 8, oy = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (oy) g.translate(0, oy, 0);
  return g;
}

let _cat = null;
function keffiyehTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f0ea';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#c43a3a';
  const s = 8;
  for (let y = 0; y < 64; y += s) {
    for (let x = 0; x < 64; x += s) {
      if (((x + y) / s) % 2 < 1) ctx.fillRect(x, y, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function catalog() {
  if (_cat) return _cat;
  const ktex = keffiyehTex();
  const mats = {
    skin: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    hair: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    cloth: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    cloth2: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    dark: new THREE.MeshLambertMaterial({ color: 0x1a1410 }),
    keffiyeh: new THREE.MeshLambertMaterial({ color: 0xffffff, map: ktex }),
    gold: new THREE.MeshLambertMaterial({ color: 0xd4a84a }),
  };
  const head = new THREE.IcosahedronGeometry(0.20, 1);
  const hairCap = new THREE.SphereGeometry(0.21, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const arm = geoBox(0.12, 0.50, 0.12, -0.25);
  const armS = geoBox(0.11, 0.44, 0.11, -0.22);
  const hand = new THREE.SphereGeometry(0.07, 5, 4);
  const leg = geoBox(0.15, 0.62, 0.16, -0.31);
  const legS = geoBox(0.13, 0.42, 0.14, -0.21);
  const shoe = geoBox(0.16, 0.08, 0.26, 0);
  const geos = {
    head,
    hair: hairCap,
    hairShort: new THREE.IcosahedronGeometry(0.21, 1),
    armL: arm, armR: arm.clone(),
    armLS: armS, armRS: armS.clone(),
    handL: hand, handR: hand.clone(),
    legL: leg, legR: leg.clone(),
    legLS: legS, legRS: legS.clone(),
    shoeL: shoe, shoeR: shoe.clone(),
    // thobe
    robe: geoCyl(0.22, 0.34, 1.18, 8, 0),
    collar: geoCyl(0.12, 0.13, 0.12, 8, 0),
    agal: geoCyl(0.20, 0.20, 0.05, 10, 0),
    keffiyehCap: new THREE.SphereGeometry(0.23, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62),
    keffiyehTail: geoBox(0.22, 0.55, 0.08, -0.22),
    sandal: geoBox(0.14, 0.05, 0.24, 0),
    strap: geoBox(0.13, 0.04, 0.04, 0),
    // hijab
    hijab: new THREE.SphereGeometry(0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.72),
    hijabDrape: geoCyl(0.20, 0.26, 0.42, 8, -0.12),
    dress: geoCyl(0.22, 0.36, 1.16, 8, 0),
    panel: geoBox(0.20, 0.70, 0.08, 0),
    sash: geoCyl(0.24, 0.24, 0.06, 8, 0),
    // hoodie
    torso: geoBox(0.50, 0.64, 0.34, 0),
    hem: geoBox(0.54, 0.14, 0.36, 0),
    hood: new THREE.SphereGeometry(0.22, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.7),
    pouch: geoBox(0.32, 0.16, 0.08, 0),
    // child
    cap: geoCyl(0.20, 0.21, 0.12, 8, 0),
    capBrim: geoCyl(0.26, 0.26, 0.035, 8, 0),
    shirt: geoBox(0.42, 0.42, 0.28, 0),
    shorts: geoBox(0.40, 0.22, 0.26, 0),
    childLeg: geoBox(0.12, 0.36, 0.13, -0.18),
    childArm: geoBox(0.10, 0.36, 0.10, -0.18),
    childShoe: geoBox(0.14, 0.08, 0.22, 0),
    shoeRed: geoBox(0.15, 0.06, 0.08, 0),
  };
  _cat = { geos, mats, ktex };
  return _cat;
}

// Rest-pose local joints + animation. Units in metres, y=0 at feet.
export function computePose(type, mode, phase, opt = {}) {
  const dance = mode === 'dabke' || mode === 'dance';
  const run = mode === 'run';
  const walk = mode === 'walk' || run;
  const idle = !dance && !walk;
  const amp = run ? 1.25 : 1;
  const s = walk ? Math.sin(phase) * amp : (dance ? Math.sin(phase) : 0);
  const bob = walk ? Math.abs(Math.cos(phase)) * (run ? 0.07 : 0.045) : (dance ? Math.abs(Math.sin(phase)) * 0.07 : Math.sin((opt.time || 0) * 1.1) * 0.015);
  const ARM_DOWN = 38 * Math.PI / 180;
  const out = { bob };
  const hide = (name) => { out[name] = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0 }; };

  if (type === 'thobe') {
    out.head = { x: 0, y: 1.52 + bob * 0.15, z: 0 };
    out.keffiyehCap = { x: 0, y: 1.58 + bob * 0.15, z: 0 };
    out.agal = { x: 0, y: 1.66 + bob * 0.15, z: 0 };
    out.keffiyehTailL = { x: -0.16, y: 1.48 + bob * 0.15, z: -0.02, rz: 0.15 };
    out.keffiyehTailR = { x: 0.16, y: 1.48 + bob * 0.15, z: -0.02, rz: -0.15 };
    out.robe = { x: 0, y: 0.66 + bob, z: 0, rx: walk ? s * 0.03 : 0 };
    out.collar = { x: 0, y: 1.28 + bob, z: 0.02 };
    const drop = dance ? ARM_DOWN : (walk ? 0.15 : 0.2);
    const ax = walk ? -s * 0.45 : (dance ? 0.12 : 0.08);
    out.armL = { x: -0.28, y: 1.24 + bob, z: 0, rx: ax, rz: -drop };
    out.armR = { x: 0.28, y: 1.24 + bob, z: 0, rx: walk ? s * 0.45 : (dance ? 0.12 : 0.08), rz: drop };
    const handY = 1.24 + bob - Math.cos(drop) * 0.50;
    const handX = Math.sin(drop) * 0.50;
    out.handL = { x: -0.28 - handX, y: handY, z: walk ? s * 0.05 : 0.04 };
    out.handR = { x: 0.28 + handX, y: handY, z: walk ? -s * 0.05 : 0.04 };
    // feet peek under the robe
    const kick = dance ? Math.max(0, s) * 0.35 : (walk ? s * 0.12 : 0);
    out.footL = { x: -0.10, y: 0.05, z: walk ? s * 0.16 : kick * 0.2 };
    out.footR = { x: 0.10, y: 0.05, z: walk ? -s * 0.16 : 0 };
    out.strapL = { x: -0.10, y: 0.09, z: walk ? s * 0.16 : 0 };
    out.strapR = { x: 0.10, y: 0.09, z: walk ? -s * 0.16 : 0 };
  } else if (type === 'hijab') {
    out.head = { x: 0, y: 1.50 + bob * 0.15, z: 0.02 };
    out.hijab = { x: 0, y: 1.54 + bob * 0.15, z: -0.01 };
    out.hijabDrape = { x: 0, y: 1.22 + bob * 0.15, z: -0.04 };
    out.dress = { x: 0, y: 0.66 + bob, z: 0, rx: walk ? s * 0.03 : 0 };
    out.panel = { x: 0.02, y: 0.55 + bob, z: 0.28, rx: walk ? s * 0.03 : 0 };
    out.sash = { x: 0, y: 0.92 + bob, z: 0 };
    const drop = dance ? ARM_DOWN : (walk ? 0.18 : 0.22);
    out.armL = { x: -0.26, y: 1.22 + bob, z: 0, rx: walk ? -s * 0.4 : (dance ? 0.12 : 0.08), rz: -drop };
    out.armR = { x: 0.26, y: 1.22 + bob, z: 0, rx: walk ? s * 0.4 : (dance ? 0.12 : 0.08), rz: drop };
    const handY = 1.22 + bob - Math.cos(drop) * 0.44;
    const handX = Math.sin(drop) * 0.44;
    out.handL = { x: -0.26 - handX, y: handY, z: 0.04 };
    out.handR = { x: 0.26 + handX, y: handY, z: 0.04 };
    out.shoeL = { x: -0.10, y: 0.05, z: walk ? s * 0.14 : 0 };
    out.shoeR = { x: 0.10, y: 0.05, z: walk ? -s * 0.14 : 0 };
  } else if (type === 'hoodie') {
    out.head = { x: 0, y: 1.50 + bob * 0.15, z: 0 };
    out.hair = { x: 0, y: 1.58 + bob * 0.15, z: -0.01 };
    out.hood = { x: 0, y: 1.56 + bob * 0.15, z: -0.10, rx: -0.35 };
    out.torso = { x: 0, y: 1.10 + bob, z: 0 };
    out.hem = { x: 0, y: 0.80 + bob, z: 0 };
    out.pouch = { x: 0, y: 0.92 + bob, z: 0.18 };
    const drop = dance ? ARM_DOWN : (walk ? 0.12 : 0.35);
    out.armL = { x: -0.30, y: 1.28 + bob, z: 0, rx: walk ? -s * 0.55 : (dance ? 0.12 : 0.15), rz: dance ? -drop : -0.08 };
    out.armR = { x: 0.30, y: 1.28 + bob, z: 0, rx: walk ? s * 0.55 : (dance ? 0.12 : 0.15), rz: dance ? drop : 0.08 };
    const armLen = 0.50;
    out.handL = { x: -0.30 - Math.sin(dance ? drop : 0.08) * armLen, y: 1.28 + bob - Math.cos(dance ? drop : 0.08) * armLen, z: walk ? s * 0.06 : 0 };
    out.handR = { x: 0.30 + Math.sin(dance ? drop : 0.08) * armLen, y: 1.28 + bob - Math.cos(dance ? drop : 0.08) * armLen, z: walk ? -s * 0.06 : 0 };
    if (dance && !walk) {
      // hands hang toward neighbors
    }
    const kick = dance ? Math.max(0, s) * 0.5 : 0;
    out.legL = { x: -0.11, y: 0.78 + bob * 0.2, z: 0, rx: walk ? s * 0.70 : kick };
    out.legR = { x: 0.11, y: 0.78 + bob * 0.2, z: 0, rx: walk ? -s * 0.70 : (dance ? Math.max(0, -s) * 0.4 : 0) };
    const footZ = (side) => {
      const swing = walk ? side * s * 0.55 : 0;
      return swing;
    };
    out.shoeL = { x: -0.11, y: 0.06, z: walk ? s * 0.28 : kick * 0.25, rx: walk ? Math.max(0, -s) * 0.2 : 0 };
    out.shoeR = { x: 0.11, y: 0.06, z: walk ? -s * 0.28 : 0, rx: walk ? Math.max(0, s) * 0.2 : 0 };
  } else { // child
    const sc = 1; // scale applied on root
    out.head = { x: 0, y: 1.10 + bob * 0.15, z: 0 };
    out.hair = { x: 0, y: 1.16 + bob * 0.15, z: -0.01 };
    out.cap = { x: 0, y: 1.26 + bob * 0.15, z: 0, rx: -0.12 };
    out.capBrim = { x: 0, y: 1.21 + bob * 0.15, z: 0.12, rx: -0.05 };
    out.shirt = { x: 0, y: 0.78 + bob, z: 0 };
    out.shorts = { x: 0, y: 0.54 + bob, z: 0 };
    const drop = dance ? ARM_DOWN * 0.8 : (walk ? 0.1 : 0.3);
    out.armL = { x: -0.24, y: 0.90 + bob, z: 0, rx: walk ? -s * 0.7 : (dance ? 0.1 : 0.1), rz: -drop };
    out.armR = { x: 0.24, y: 0.90 + bob, z: 0, rx: walk ? s * 0.7 : (dance ? 0.1 : 0.1), rz: drop };
    out.handL = { x: -0.24 - Math.sin(drop) * 0.36, y: 0.90 + bob - Math.cos(drop) * 0.36, z: 0 };
    out.handR = { x: 0.24 + Math.sin(drop) * 0.36, y: 0.90 + bob - Math.cos(drop) * 0.36, z: 0 };
    out.legL = { x: -0.09, y: 0.46 + bob * 0.2, z: 0, rx: walk ? s * 0.85 : 0 };
    out.legR = { x: 0.09, y: 0.46 + bob * 0.2, z: 0, rx: walk ? -s * 0.85 : 0 };
    out.shoeL = { x: -0.09, y: 0.05, z: walk ? s * 0.22 : 0 };
    out.shoeR = { x: 0.09, y: 0.05, z: walk ? -s * 0.22 : 0 };
    out.shoeRedL = { x: -0.09, y: 0.06, z: (walk ? s * 0.22 : 0) + 0.04 };
    out.shoeRedR = { x: 0.09, y: 0.06, z: (walk ? -s * 0.22 : 0) + 0.04 };
  }
  if (opt.lod >= 2) {
    for (const k of Object.keys(out)) {
      if (/^(arm|hand|leg|shoe|foot|strap|pouch|panel|hem)/.test(k)) hide(k);
    }
  } else if (opt.lod >= 1) {
    for (const k of Object.keys(out)) {
      if (/^(hand|strap|pouch|shoeRed|panel)/.test(k)) hide(k);
    }
  }
  return out;
}

const HERO_PARTS = {
  thobe: [
    ['head', 'head', 'skin'], ['keffiyehCap', 'keffiyehCap', 'keffiyeh'],
    ['agal', 'agal', 'dark'], ['keffiyehTailL', 'keffiyehTail', 'keffiyeh'],
    ['keffiyehTailR', 'keffiyehTail', 'keffiyeh'], ['robe', 'robe', 'robe'],
    ['collar', 'collar', 'robe'], ['armL', 'armL', 'skin'], ['armR', 'armR', 'skin'],
    ['handL', 'handL', 'skin'], ['handR', 'handR', 'skin'],
    ['footL', 'sandal', 'sandal'], ['footR', 'sandal', 'sandal'],
    ['strapL', 'strap', 'sandal'], ['strapR', 'strap', 'sandal'],
  ],
  hijab: [
    ['head', 'head', 'skin'], ['hijab', 'hijab', 'hijab'],
    ['hijabDrape', 'hijabDrape', 'hijab2'], ['dress', 'dress', 'dress'],
    ['panel', 'panel', 'dress2'], ['sash', 'sash', 'gold'],
    ['armL', 'armLS', 'skin'], ['armR', 'armRS', 'skin'],
    ['handL', 'handL', 'skin'], ['handR', 'handR', 'skin'],
    ['shoeL', 'shoe', 'shoe'], ['shoeR', 'shoe', 'shoe'],
  ],
  hoodie: [
    ['head', 'head', 'skin'], ['hair', 'hairShort', 'hair'],
    ['hood', 'hood', 'cloth'], ['torso', 'torso', 'cloth'],
    ['hem', 'hem', 'cloth'], ['pouch', 'pouch', 'cloth'],
    ['armL', 'armL', 'cloth'], ['armR', 'armR', 'cloth'],
    ['handL', 'handL', 'skin'], ['handR', 'handR', 'skin'],
    ['legL', 'legL', 'jeans'], ['legR', 'legR', 'jeans'],
    ['shoeL', 'shoe', 'shoe'], ['shoeR', 'shoe', 'shoe'],
  ],
  child: [
    ['head', 'head', 'skin'], ['hair', 'hairShort', 'hair'],
    ['cap', 'cap', 'cap'], ['capBrim', 'capBrim', 'cap'],
    ['shirt', 'shirt', 'shirt'], ['shorts', 'shorts', 'shorts'],
    ['armL', 'childArm', 'shirt'], ['armR', 'childArm', 'shirt'],
    ['handL', 'handL', 'skin'], ['handR', 'handR', 'skin'],
    ['legL', 'childLeg', 'skin'], ['legR', 'childLeg', 'skin'],
    ['shoeL', 'childShoe', 'shoe'], ['shoeR', 'childShoe', 'shoe'],
    ['shoeRedL', 'shoeRed', 'shoeRed'], ['shoeRedR', 'shoeRed', 'shoeRed'],
  ],
};

function colorOf(pal, key) {
  if (key === 'skin') return pal.skin;
  if (key === 'hair') return pal.hair;
  if (key === 'keffiyeh') return 0xffffff;
  if (key === 'dark') return pal.agal || 0x1a1410;
  if (key === 'robe') return pal.robe || 0xf4f1ea;
  if (key === 'sandal') return pal.sandal || 0x6a4a32;
  if (key === 'hijab') return pal.hijab;
  if (key === 'hijab2') return pal.hijab2;
  if (key === 'dress') return pal.dress;
  if (key === 'dress2') return pal.dress2;
  if (key === 'gold') return pal.gold || 0xd4a84a;
  if (key === 'shoe') return pal.shoe || 0xf2f0ea;
  if (key === 'cloth') return pal.cloth;
  if (key === 'jeans') return pal.jeans;
  if (key === 'cap') return pal.cap;
  if (key === 'shirt') return pal.shirt;
  if (key === 'shorts') return pal.shorts;
  if (key === 'shoeRed') return pal.shoeRed;
  return 0xffffff;
}

function makeMat(key, pal, shared) {
  if (key === 'keffiyeh') return new THREE.MeshLambertMaterial({ color: 0xffffff, map: shared.ktex });
  return new THREE.MeshLambertMaterial({ color: colorOf(pal, key) });
}

export function makeNamePlate(text) {
  const g = new THREE.Group();
  g.name = 'namePlate';
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const w = 512, h = 96, r = 22;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(r, 8); ctx.lineTo(w - r, 8); ctx.quadraticCurveTo(w - 8, 8, w - 8, r);
  ctx.lineTo(w - 8, h - r); ctx.quadraticCurveTo(w - 8, h - 8, w - r, h - 8);
  ctx.lineTo(r, h - 8); ctx.quadraticCurveTo(8, h - 8, 8, h - r);
  ctx.lineTo(8, r); ctx.quadraticCurveTo(8, 8, r, 8); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8c45a';
  ctx.fillRect(18, 16, w - 36, h - 36);
  ctx.fillStyle = '#3a2a10';
  ctx.font = '700 44px Cairo, "Noto Naskh Arabic", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(text || '').trim() || 'بيت';
  ctx.fillText(label.length > 22 ? label.slice(0, 21) + '…' : label, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.28), mat);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.30, 0.07), new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
  backing.position.z = -0.02;
  g.add(backing, plane);
  g.userData.setText = (t) => {
    ctx.fillStyle = '#e8c45a';
    ctx.fillRect(18, 16, w - 36, h - 36);
    ctx.fillStyle = '#3a2a10';
    ctx.font = '700 44px Cairo, "Noto Naskh Arabic", Tahoma, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const s = String(t || '').trim() || 'بيت';
    ctx.fillText(s.length > 22 ? s.slice(0, 21) + '…' : s, w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  };
  return g;
}

export function createHeroPerson({ type, name, seed } = {}) {
  const typ = type || pickType(name, { allowChild: false });
  const pal = paletteFor(typ, seed || name || typ);
  const cat = catalog();
  const root = new THREE.Group();
  root.name = 'walkerHero';
  const body = new THREE.Group();
  root.add(body);
  const parts = {};
  const list = HERO_PARTS[typ];
  for (const [nameK, geoK, matK] of list) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(cat.geos[geoK], makeMat(matK, pal, cat));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    pivot.add(mesh);
    body.add(pivot);
    parts[nameK] = pivot;
  }
  const plate = makeNamePlate(name || '');
  plate.position.y = typ === 'child' ? 1.72 : 2.08;
  root.add(plate);

  function applyPose({ x, y, z, yaw, phase = 0, mode = 'idle', lod = 0, time = 0 }) {
    root.position.set(x, y, z);
    body.rotation.y = yaw || 0;
    const pose = computePose(typ, mode, phase, { lod, time });
    for (const [k, p] of Object.entries(parts)) {
      const t = pose[k];
      if (!t) { p.visible = false; continue; }
      p.visible = !((t.sx === 0) || (t.sy === 0));
      p.position.set(t.x || 0, t.y || 0, t.z || 0);
      p.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    }
    plate.position.y = (typ === 'child' ? 1.62 : 1.95) + (pose.bob || 0);
    const cam = arguments[0] && arguments[0].camera;
    if (cam) {
      const dx = cam.position.x - root.position.x;
      const dz = cam.position.z - root.position.z;
      plate.rotation.set(0, Math.atan2(dx, dz), 0);
    }
  }
  return {
    root, type: typ, palette: pal,
    applyPose,
    setName: (t) => plate.userData.setText && plate.userData.setText(t),
    setPlateVisible: (v) => { plate.visible = !!v; },
    plate,
  };
}

const POOL_PARTS = HERO_PARTS;

export function createPeoplePool({ counts, name = 'peoplePool' } = {}) {
  const cat = catalog();
  const group = new THREE.Group();
  group.name = name;
  const dummy = new THREE.Object3D();
  const pools = {};
  for (const typ of TYPES) {
    const n = Math.max(0, counts[typ] | 0);
    const parts = {};
    for (const [nameK, geoK, matK] of POOL_PARTS[typ]) {
      const mat = (matK === 'keffiyeh')
        ? new THREE.MeshLambertMaterial({ color: 0xffffff, map: cat.ktex })
        : new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(cat.geos[geoK], mat, Math.max(1, n));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.count = n;
      mesh.name = typ + '_' + nameK;
      if (n === 0) mesh.visible = false;
      group.add(mesh);
      parts[nameK] = { mesh, matK };
    }
    pools[typ] = { n, parts, seeds: new Array(n) };
  }

  function setSeed(typ, i, seed, pal) {
    const p = pal || paletteFor(typ, seed);
    pools[typ].seeds[i] = p;
    const col = new THREE.Color();
    for (const { mesh, matK } of Object.values(pools[typ].parts)) {
      if (matK === 'keffiyeh') col.setHex(0xffffff);
      else col.setHex(colorOf(p, matK));
      if (mesh.setColorAt) mesh.setColorAt(i, col);
    }
  }
  function finishColors() {
    for (const typ of TYPES) {
      for (const { mesh } of Object.values(pools[typ].parts)) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  function place(typ, i, x, y, z, yaw, mode, phase, lod, time) {
    const pose = computePose(typ, mode, phase, { lod, time });
    const sy = typ === 'child' ? 1 : 1;
    for (const [k, rec] of Object.entries(pools[typ].parts)) {
      const t = pose[k];
      if (!t || t.sx === 0) {
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        rec.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw || 0, 0);
      dummy.scale.set(sy, sy, sy);
      dummy.updateMatrix();
      const base = dummy.matrix.clone();
      dummy.position.set(t.x || 0, t.y || 0, t.z || 0);
      dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      dummy.scale.set(t.sx == null ? 1 : t.sx, t.sy == null ? 1 : t.sy, t.sz == null ? 1 : t.sz);
      dummy.updateMatrix();
      dummy.matrix.premultiply(base);
      rec.mesh.setMatrixAt(i, dummy.matrix);
    }
  }
  function commit(typ) {
    if (typ) {
      for (const { mesh } of Object.values(pools[typ].parts)) mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    for (const t of TYPES) commit(t);
  }
  function hideAll(typ, i) {
    for (const { mesh } of Object.values(pools[typ].parts)) {
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  }
  return { group, pools, setSeed, finishColors, place, commit, hideAll, TYPES };
}

const _frustum = new THREE.Frustum();
const _proj = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 2);
export function updateFrustum(camera) {
  if (!camera) return null;
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_proj);
  return _frustum;
}
export function inFrustum(x, y, z, r = 2) {
  _sphere.center.set(x, y, z);
  _sphere.radius = r;
  return _frustum.intersectsSphere(_sphere);
}

export function hookOncePerFrame(renderer, fn) {
  if (!renderer || typeof fn !== 'function') return;
  if (!renderer.__peopleHooks) renderer.__peopleHooks = [];
  renderer.__peopleHooks.push(fn);
  if (renderer.__peopleHooked) return;
  renderer.__peopleHooked = true;
  const orig = renderer.render.bind(renderer);
  let last = performance.now();
  renderer.render = function (scene, camera) {
    const now = performance.now();
    if (now - last > 4) {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      for (const cb of renderer.__peopleHooks) {
        try { cb(dt, now / 1000, camera); } catch (e) { console.warn('people tick', e); }
      }
    }
    return orig(scene, camera);
  };
}
