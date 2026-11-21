// Preview-only compact neighbourhood: houses next to each other in 6×2-lot
// blocks, narrow streets, a civic square around house #1, and access roads to
// the mosque, the dabke plaza, the restaurant and the souq. Display layout only — residents.json is
// not rewritten (the live site keeps its stored x/z). House #1 stays at (160, 65).
import * as THREE from 'three';
import { isDryAt } from './plots.js';
import {
  HOME, LOT, COLS, ROWS, STREET, BLOCK_W, BLOCK_D, PITCH_X, PITCH_Z, CIVIC,
  UNIVERSITY, DABKE, RESTAURANT, SOUQ, blockOrigin, isCivic, compactLayout, nextCompactLot,
} from './layout.js';

export { HOME, LOT, STREET, UNIVERSITY, DABKE, RESTAURANT, SOUQ, nextCompactLot };
export const STREET_W = STREET;
export const PLAZA = { x: DABKE.x, z: DABKE.z, r: DABKE.size * 0.72 };

// Remap every resident except house #1 / owner onto the compact lots (by id).
export function assignBlockPlots(residents, data) {
  const lay = compactLayout(residents, data);
  for (const r of residents) {
    if (!r) continue;
    if (r.id === 1 || r.owner) {
      r.x = HOME.x;
      r.z = HOME.z;
      continue;
    }
    const p = lay.place.get(r.id);
    if (!p) continue;
    r.x = p.x;
    r.z = p.z;
    r.kind = 'block';
    r.block = p.block;
  }
  const cells = new Set();
  for (const b of lay.usedBlocks) cells.add(b.i + ',' + b.j);
  for (const [i, j] of CIVIC) cells.add(i + ',' + j);
  return {
    cells,
    usedBlocks: lay.usedBlocks,
    nextIndex: lay.place.size,
    bounds: boundsOf(cells),
  };
}

function boundsOf(cells) {
  let minX = HOME.x, maxX = HOME.x, minZ = HOME.z, maxZ = HOME.z;
  for (const key of cells) {
    const [i, j] = key.split(',').map(Number);
    const o = blockOrigin(i, j);
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x + BLOCK_W);
    minZ = Math.min(minZ, o.z);
    maxZ = Math.max(maxZ, o.z + BLOCK_D);
  }
  return { minX, maxX, minZ, maxZ };
}

// Street segments around every used block (shared edges de-duplicated).
export function streetPlan(layout, data) {
  const segs = [];
  const seen = new Set();
  const h = STREET / 2;
  function add(x1, z1, x2, z2, kind) {
    const key = [x1, z1, x2, z2].map((n) => n.toFixed(1)).join(',');
    if (seen.has(key)) return;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    if (!isDryAt(data, mx, mz, 2)) return;
    seen.add(key);
    segs.push({ x1, z1, x2, z2, kind });
  }
  // the street between the two civic blocks becomes part of the square
  const c0 = blockOrigin(CIVIC[0][0], CIVIC[0][1]);
  const skip = [c0.x - h, c0.z + BLOCK_D + h, c0.x + BLOCK_W + h, c0.z + BLOCK_D + h].map((n) => n.toFixed(1)).join(',');
  seen.add(skip);
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    const o = blockOrigin(i, j);
    add(o.x - h, o.z - h, o.x + BLOCK_W + h, o.z - h, 'ew');
    add(o.x - h, o.z + BLOCK_D + h, o.x + BLOCK_W + h, o.z + BLOCK_D + h, 'ew');
    add(o.x - h, o.z - h, o.x - h, o.z + BLOCK_D + h, 'ns');
    add(o.x + BLOCK_W + h, o.z - h, o.x + BLOCK_W + h, o.z + BLOCK_D + h, 'ns');
  }
  return segs;
}

// Street corners (intersections) of the used blocks — for access roads.
function corners(layout) {
  const out = [];
  const h = STREET / 2;
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    const o = blockOrigin(i, j);
    out.push([o.x - h, o.z - h], [o.x + BLOCK_W + h, o.z - h], [o.x - h, o.z + BLOCK_D + h], [o.x + BLOCK_W + h, o.z + BLOCK_D + h]);
  }
  return out;
}

function drapeStrip(groundY, x, z, sx, sz, yLift, mat, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), mat);
  const y = (typeof groundY === 'function' ? groundY(x, z) : 2.6) + yLift;
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// Rectangles (x,z centre + w,d) that must stay clear of OSM trees / lamps / roads.
export function clearRects(layout) {
  const rects = [];
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    const o = blockOrigin(i, j);
    rects.push({ x: o.x + BLOCK_W / 2, z: o.z + BLOCK_D / 2, w: BLOCK_W + STREET * 2, d: BLOCK_D + STREET * 2 });
  }
  rects.push({ x: UNIVERSITY.x, z: UNIVERSITY.z, w: UNIVERSITY.w + 6, d: UNIVERSITY.d + 6 });
  rects.push({ x: DABKE.x, z: DABKE.z, w: DABKE.size + 6, d: DABKE.size + 6 });
  rects.push({ x: RESTAURANT.x, z: RESTAURANT.z, w: RESTAURANT.w + 4, d: RESTAURANT.d + 4 });
  rects.push({ x: SOUQ.x, z: SOUQ.z, w: SOUQ.w + 6, d: SOUQ.d + 6 });
  return rects;
}

function inAny(x, z, rects) {
  for (const r of rects) if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return true;
  return false;
}

// Hide OSM trees / lamp posts (instanced) that would poke through houses or landmarks.
function clearInstancesIn(scene, rects) {
  const roots = [scene.getObjectByName('mapRoot'), scene.getObjectByName('lamps')].filter(Boolean);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let n = 0;
  for (const root of roots) {
    root.traverse((o) => {
      if (!o.isInstancedMesh) return;
      let dirty = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if (inAny(p.x, p.z, rects)) { o.setMatrixAt(i, zero); dirty = true; n++; }
      }
      if (dirty) o.instanceMatrix.needsUpdate = true;
    });
  }
  return n;
}

function hideOsmRoadsIn(scene, rects) {
  scene.traverse((o) => {
    const g = o.parent;
    if (!o.isMesh || !g || !g.userData || !g.userData.roads) return;
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    if (inAny(c.x, c.z, rects)) o.visible = false;
  });
}


function nk(x, z) { return x.toFixed(1) + ',' + z.toFixed(1); }

// Paint a continuous road network: shortened segments + intersection pads so
// boxes no longer overlap, plus sidewalks and dashed centre lines.
function paintNetwork(root, groundY, segs, ROAD, WALK, mats) {
  const nodes = new Map();
  const addN = (x, z) => { const k = nk(x, z); if (!nodes.has(k)) nodes.set(k, { x, z }); };
  const clean = [];
  const seen = new Set();
  for (const s of segs) {
    const a = nk(s.x1, s.z1) + '>' + nk(s.x2, s.z2);
    const b = nk(s.x2, s.z2) + '>' + nk(s.x1, s.z1);
    if (seen.has(a) || seen.has(b)) continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 0.6) continue;
    seen.add(a);
    const ew = s.kind ? s.kind === 'ew' : Math.abs(s.x2 - s.x1) >= Math.abs(s.z2 - s.z1);
    clean.push({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2, kind: ew ? 'ew' : 'ns', len });
    addN(s.x1, s.z1); addN(s.x2, s.z2);
  }
  const inset = ROAD * 0.5;
  for (const s of clean) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const inv = 1 / s.len;
    const ux = dx * inv, uz = dz * inv;
    const ix1 = s.x1 + ux * inset, iz1 = s.z1 + uz * inset;
    const ix2 = s.x2 - ux * inset, iz2 = s.z2 - uz * inset;
    const slen = Math.hypot(ix2 - ix1, iz2 - iz1);
    if (slen < 0.2) continue;
    const cx = (ix1 + ix2) / 2, cz = (iz1 + iz2) / 2;
    const ew = s.kind === 'ew';
    root.add(drapeStrip(groundY, cx, cz, ew ? slen : ROAD, ew ? ROAD : slen, 0.12, mats.road));
    const off = ROAD / 2 + WALK / 2;
    if (ew) {
      root.add(drapeStrip(groundY, cx, cz - off, slen, WALK, 0.16, mats.walk));
      root.add(drapeStrip(groundY, cx, cz + off, slen, WALK, 0.16, mats.walk));
    } else {
      root.add(drapeStrip(groundY, cx - off, cz, WALK, slen, 0.16, mats.walk));
      root.add(drapeStrip(groundY, cx + off, cz, WALK, slen, 0.16, mats.walk));
    }
    // dashed centre line
    const dash = 2.2, gap = 1.6, period = dash + gap;
    const n = Math.max(0, Math.floor((slen - 0.8) / period));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * period / slen;
      const lx = ix1 + (ix2 - ix1) * t, lz = iz1 + (iz2 - iz1) * t;
      root.add(drapeStrip(groundY, lx, lz, ew ? dash : 0.22, ew ? 0.22 : dash, 0.15, mats.line));
    }
  }
  for (const n of nodes.values()) {
    root.add(drapeStrip(groundY, n.x, n.z, ROAD, ROAD, 0.12, mats.road));
  }
  return clean;
}

function linkL(access, a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1) return;
  const mid = Math.abs(b.z - a.z) > Math.abs(b.x - a.x) ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
  for (const [p, q] of [[a, mid], [mid, b]]) {
    const L = Math.hypot(q.x - p.x, q.z - p.z);
    if (L < 1) continue;
    const ew = Math.abs(q.x - p.x) > Math.abs(q.z - p.z);
    access.push({ x1: p.x, z1: p.z, x2: q.x, z2: q.z, kind: ew ? 'ew' : 'ns' });
  }
}

export function createBlockStreets({ scene, groundY, data, layout, quality }) {
  const root = new THREE.Group();
  root.name = 'blockStreets';
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xa89c84 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xd8ccb4 });
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0xcfc3a8 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8dfc8 });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x9c8f76 });
  const yardMat = new THREE.MeshLambertMaterial({ color: 0xe4d6b8 });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x5f8f45 });

  const segs = streetPlan(layout, data);
  const ROAD = 5.4;
  const WALK = (STREET - ROAD) / 2;
  const mats = { road: roadMat, walk: walkMat, line: lineMat };

  // Access roads: nearest street corner → mosque / wedding / restaurant / souq.
  const cs = corners(layout);
  const access = [];
  const targets = [
    { x: UNIVERSITY.x, z: UNIVERSITY.z + UNIVERSITY.d / 2 + 1 },
    { x: DABKE.x + DABKE.size / 2 + 1, z: DABKE.z },
    { x: RESTAURANT.x - RESTAURANT.w / 2 - 1, z: RESTAURANT.z },
    { x: SOUQ.x + SOUQ.w / 2 + 1, z: SOUQ.z },
  ];
  for (const t of targets) {
    let best = null, bd = Infinity;
    for (const [x, z] of cs) {
      const d = (x - t.x) ** 2 + (z - t.z) ** 2;
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (best) linkL(access, best, t);
  }
  // Straight west corridor: wedding plaza → souq (same z).
  linkL(access,
    { x: DABKE.x - DABKE.size / 2 - 1, z: DABKE.z },
    { x: SOUQ.x + SOUQ.w / 2 + 1, z: SOUQ.z },
  );

  paintNetwork(root, groundY, [...segs, ...access], ROAD, WALK, mats);

  // Tidy yard pad under every block + a thin hedge line between the two rows.
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    if (isCivic(i, j)) continue;
    const o = blockOrigin(i, j);
    root.add(drapeStrip(groundY, o.x + BLOCK_W / 2, o.z + BLOCK_D / 2, BLOCK_W, BLOCK_D, 0.1, yardMat));
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_W - 1.5, 0.6, 0.45), hedgeMat);
    hedge.position.set(o.x + BLOCK_W / 2, groundY(o.x, o.z) + 0.45, o.z + BLOCK_D / 2);
    root.add(hedge);
  }

  // Civic square around house #1 (two civic blocks + the street between them)
  const c0 = blockOrigin(CIVIC[0][0], CIVIC[0][1]);
  const sqW = BLOCK_W, sqD = BLOCK_D * 2 + STREET;
  const sqX = c0.x + sqW / 2, sqZ = c0.z + sqD / 2;
  root.add(drapeStrip(groundY, sqX, sqZ, sqW - 0.6, sqD - 0.6, 0.11, plazaMat));
  root.add(drapeStrip(groundY, HOME.x, HOME.z, 34, 32, 0.13, walkMat));
  for (const [x, z, sx, sz] of [
    [sqX, c0.z + 0.3, sqW, 0.6], [sqX, c0.z + sqD - 0.3, sqW, 0.6],
    [c0.x + 0.3, sqZ, 0.6, sqD], [c0.x + sqW - 0.3, sqZ, 0.6, sqD],
  ]) root.add(drapeStrip(groundY, x, z, sx, sz, 0.18, curbMat));

  // Simple souq lot (a long paved street; stalls may be filled in later).
  root.add(drapeStrip(groundY, SOUQ.x, SOUQ.z, SOUQ.w, SOUQ.d, 0.11, plazaMat));
  root.add(drapeStrip(groundY, SOUQ.x, SOUQ.z, 6.4, SOUQ.d - 4, 0.13, walkMat));
  for (const side of [-1, 1]) {
    root.add(drapeStrip(groundY, SOUQ.x + side * 10, SOUQ.z, 8.5, SOUQ.d - 6, 0.17, yardMat));
  }
  {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1d3a40'; ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#d9a92a'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 144);
    ctx.fillStyle = '#f4e7b5';
    ctx.font = '700 72px Cairo, "Noto Naskh Arabic", Tahoma, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('السوق', 256, 84);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(SOUQ.x + SOUQ.w / 2 + 0.2, groundY(SOUQ.x, SOUQ.z) + 4.2, SOUQ.z);
    sign.rotation.y = -Math.PI / 2;
    root.add(sign);
  }


  // Street lamps along the streets (light-weight for mobile)
  const lampGroup = new THREE.Group();
  lampGroup.name = 'blockLamps';
  const poleG = new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6);
  const poleM = new THREE.MeshLambertMaterial({ color: 0x3a342c });
  const bulbG = new THREE.SphereGeometry(0.26, 8, 6);
  const bulbM = new THREE.MeshLambertMaterial({ color: 0xfff1c2, emissive: 0xffc870, emissiveIntensity: 0.3 });
  let nLamp = 0;
  const maxLamp = 90;
  const lampXZ = [];
  for (const s of [...segs, ...access]) {
    if (nLamp >= maxLamp) break;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const steps = Math.max(1, Math.floor(len / 36));
    for (let t = 1; t <= steps && nLamp < maxLamp; t++) {
      const u = t / (steps + 1);
      const x = s.x1 + (s.x2 - s.x1) * u;
      const z = s.z1 + (s.z2 - s.z1) * u;
      if (!isDryAt(data, x, z, 2)) continue;
      const side = ROAD / 2 + 0.55;
      const lx = s.kind === 'ew' ? x : x + side * (t % 2 ? 1 : -1);
      const lz = s.kind === 'ew' ? z + side * (t % 2 ? 1 : -1) : z;
      const y = groundY(lx, lz);
      lampXZ.push([lx, lz]);
      const pole = new THREE.Mesh(poleG, poleM);
      pole.position.set(lx, y + 2.1, lz);
      const bulb = new THREE.Mesh(bulbG, bulbM);
      bulb.position.set(lx, y + 4.25, lz);
      lampGroup.add(pole, bulb);
      nLamp++;
    }
  }
  root.add(lampGroup);

  const rects = clearRects(layout);
  root.add(streetGreenery({ groundY, data, layout, access, lampXZ, share: (quality && quality.streetTrees) || 1 }));
  hideOsmRoadsIn(scene, rects);
  const cleared = clearInstancesIn(scene, rects);

  scene.add(root);
  function setNight(n) {
    bulbM.emissiveIntensity = 0.3 + 1.6 * Math.max(0, Math.min(1, n || 0));
  }
  return { root, segs, access, layout, cleared, setNight };
}

export function nextBlockLot(residents, data) {
  return nextCompactLot(residents, data);
}

// ---------- street trees & palms (instanced, cheap on phones) ----------
function mergeSimple(geoms) {
  let n = 0;
  const parts = geoms.map((g) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function frondGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = new THREE.ConeGeometry(0.42, 3.0, 4, 1);
    g.scale(1, 1, 0.22);
    g.rotateZ(-Math.PI / 2 - 0.45);
    g.translate(1.35, -0.45, 0);
    g.rotateY(-a);
    parts.push(g);
  }
  return mergeSimple(parts);
}

function hash2(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function streetGreenery({ groundY, data, layout, access, lampXZ, share }) {
  const group = new THREE.Group();
  group.name = 'streetGreenery';
  const trees = [], palms = [];
  const nearLamp = (x, z) => lampXZ.some(([lx, lz]) => (lx - x) ** 2 + (lz - z) ** 2 < 2.6 ** 2);
  const ok = (x, z) => isDryAt(data, x, z, 1) && !nearLamp(x, z) && hash2(x, z) < share;
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    const o = blockOrigin(i, j);
    if (isCivic(i, j)) {
      if (i !== CIVIC[0][0] || j !== CIVIC[0][1]) continue;
      // palms around the civic square
      const W = BLOCK_W, D = BLOCK_D * 2 + STREET;
      for (let k = 0; k <= 6; k++) {
        const x = o.x + (k / 6) * W;
        for (const z of [o.z + 1.5, o.z + D - 1.5]) if (ok(x, z)) palms.push([x, z]);
      }
      for (let k = 1; k < 5; k++) {
        const z = o.z + (k / 5) * D;
        for (const x of [o.x + 1.5, o.x + W - 1.5]) if (ok(x, z)) palms.push([x, z]);
      }
      continue;
    }
    for (const c of [1, 3, 5]) {
      const x = o.x + c * LOT;
      for (const z of [o.z - 0.65, o.z + BLOCK_D + 0.65]) if (ok(x, z)) trees.push([x, z]);
    }
    // block ends
    for (const x of [o.x - 0.65, o.x + BLOCK_W + 0.65]) if (ok(x, o.z + BLOCK_D / 2)) trees.push([x, o.z + BLOCK_D / 2]);
  }
  for (const s of access) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const steps = Math.floor(len / 12);
    for (let t = 1; t < steps; t++) {
      const u = t / steps;
      const x = s.x1 + (s.x2 - s.x1) * u, z = s.z1 + (s.z2 - s.z1) * u;
      const off = 4.4;
      const pts = s.kind === 'ew' ? [[x, z - off], [x, z + off]] : [[x - off, z], [x + off, z]];
      for (const [px, pz] of pts) if (ok(px, pz)) palms.push([px, pz]);
    }
  }
  const dummy = new THREE.Object3D();
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x6a4a2c }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshLambertMaterial({ color: 0x4f8f3a }), trees.length);
    trees.forEach(([x, z], k) => {
      const y = groundY(x, z);
      const s = 0.85 + hash2(z, x) * 0.35;
      dummy.position.set(x, y + 0.8 * s, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      trunk.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, y + 2.2 * s, z); dummy.scale.set(s, s * 1.1, s); dummy.rotation.y = k; dummy.updateMatrix();
      crown.setMatrixAt(k, dummy.matrix);
      crown.setColorAt(k, new THREE.Color().setHSL(0.27 + hash2(x, z) * 0.06, 0.45, 0.32 + hash2(z, z) * 0.1));
    });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
  }
  if (palms.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 6, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a44 }), palms.length);
    const fr = new THREE.InstancedMesh(frondGeometry(), new THREE.MeshLambertMaterial({ color: 0x3f8a3a, side: THREE.DoubleSide }), palms.length);
    palms.forEach(([x, z], k) => {
      const y = groundY(x, z);
      const s = 0.85 + hash2(x, z) * 0.3;
      dummy.position.set(x, y + 3 * s, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      trunk.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, y + 6 * s, z); dummy.rotation.set(0, k * 1.3, 0); dummy.updateMatrix();
      fr.setMatrixAt(k, dummy.matrix);
    });
    trunk.castShadow = fr.castShadow = true;
    group.add(trunk, fr);
  }
  group.userData.counts = { trees: trees.length, palms: palms.length };
  return group;
}
