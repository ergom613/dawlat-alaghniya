// Preview-only compact neighbourhood: houses next to each other in 6×2-lot
// blocks, narrow streets, a civic square around house #1, and access roads to
// the university and the dabke plaza. Display layout only — residents.json is
// not rewritten (the live site keeps its stored x/z). House #1 stays at (160, 65).
import * as THREE from 'three';
import { isDryAt } from './plots.js';
import {
  HOME, LOT, COLS, ROWS, STREET, BLOCK_W, BLOCK_D, PITCH_X, PITCH_Z, CIVIC,
  UNIVERSITY, DABKE, RESTAURANT, blockOrigin, isCivic, compactLayout, nextCompactLot,
} from './layout.js';

export { HOME, LOT, STREET, UNIVERSITY, DABKE, RESTAURANT, nextCompactLot };
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

  for (const s of segs) {
    const cx = (s.x1 + s.x2) / 2;
    const cz = (s.z1 + s.z2) / 2;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const ew = s.kind === 'ew';
    root.add(drapeStrip(groundY, cx, cz, ew ? len : ROAD, ew ? ROAD : len, 0.12, roadMat));
    const off = ROAD / 2 + WALK / 2;
    if (ew) {
      root.add(drapeStrip(groundY, cx, cz - off, len, WALK, 0.16, walkMat));
      root.add(drapeStrip(groundY, cx, cz + off, len, WALK, 0.16, walkMat));
    } else {
      root.add(drapeStrip(groundY, cx - off, cz, WALK, len, 0.16, walkMat));
      root.add(drapeStrip(groundY, cx + off, cz, WALK, len, 0.16, walkMat));
    }
    root.add(drapeStrip(groundY, cx, cz, ew ? len * 0.9 : 0.22, ew ? 0.22 : len * 0.9, 0.14, lineMat));
  }

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

  // Access roads: nearest street corner → university gate and dabke plaza edge.
  const cs = corners(layout);
  const targets = [
    { x: UNIVERSITY.x, z: UNIVERSITY.z + UNIVERSITY.d / 2 + 1 },
    { x: DABKE.x + DABKE.size / 2 + 1, z: DABKE.z },
    { x: RESTAURANT.x - RESTAURANT.w / 2 - 1, z: RESTAURANT.z },
  ];
  const access = [];
  for (const t of targets) {
    let best = null, bd = Infinity;
    for (const [x, z] of cs) {
      const d = (x - t.x) ** 2 + (z - t.z) ** 2;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (!best) continue;
    // L-shaped: along x first, then z — keeps it on the grid look.
    const a = { x: best[0], z: best[1] };
    const mid = Math.abs(t.z - a.z) > Math.abs(t.x - a.x) ? { x: t.x, z: a.z } : { x: a.x, z: t.z };
    for (const [p, q] of [[a, mid], [mid, t]]) {
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len < 1) continue;
      const ew = Math.abs(q.x - p.x) > Math.abs(q.z - p.z);
      const cx = (p.x + q.x) / 2, cz = (p.z + q.z) / 2;
      const L = len + ROAD;
      root.add(drapeStrip(groundY, cx, cz, ew ? L : ROAD, ew ? ROAD : L, 0.12, roadMat));
      root.add(drapeStrip(groundY, cx, cz, ew ? L * 0.9 : 0.22, ew ? 0.22 : L * 0.9, 0.14, lineMat));
      access.push({ x1: p.x, z1: p.z, x2: q.x, z2: q.z, kind: ew ? 'ew' : 'ns' });
    }
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
