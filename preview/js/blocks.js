// Preview-only city blocks: 2×2 lots with streets, civic square around house #1.
// Display layout only — does not rewrite residents.json. House #1 stays at (160, 65).
import * as THREE from 'three';
import { isDryAt } from './plots.js';

export const LOT = 24;
export const STREET_W = 12;
export const CELL = LOT * 2 + STREET_W; // 60
export const ORIGIN = { x: 10, z: 35 };
export const HOME = { x: 160, z: 65 };
export const PLAZA = { x: 216, z: -144, r: 36 };

const LOT_OFF = [LOT * 0.5, LOT + LOT * 0.5]; // 12, 36

export function cellIndex(x, z) {
  return {
    i: Math.floor((x - ORIGIN.x) / CELL),
    j: Math.floor((z - ORIGIN.z) / CELL),
  };
}

export function cellOrigin(i, j) {
  return { x: ORIGIN.x + i * CELL, z: ORIGIN.z + j * CELL };
}

export function homeCell() {
  return cellIndex(HOME.x, HOME.z);
}

function nearPlaza(x, z) {
  const dx = x - PLAZA.x, dz = z - PLAZA.z;
  return dx * dx + dz * dz < (PLAZA.r + 6) ** 2;
}

function nearHome(x, z) {
  const dx = x - HOME.x, dz = z - HOME.z;
  return dx * dx + dz * dz < 22 ** 2;
}

function inHomeCell(i, j) {
  const h = homeCell();
  return i === h.i && j === h.j;
}

export function blockLots(data, want = 400) {
  const lots = [];
  const h = homeCell();
  // Spiral out from the civic square so we only test nearby dry land.
  for (let ring = 0; lots.length < want && ring < 24; ring++) {
    for (let i = h.i - ring; i <= h.i + ring; i++) {
      for (let j = h.j - ring; j <= h.j + ring; j++) {
        if (ring > 0 && Math.max(Math.abs(i - h.i), Math.abs(j - h.j)) !== ring) continue;
        if (inHomeCell(i, j)) continue;
        const o = cellOrigin(i, j);
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const x = o.x + LOT_OFF[a];
            const z = o.z + LOT_OFF[b];
            if (nearHome(x, z) || nearPlaza(x, z)) continue;
            if (!isDryAt(data, x, z, 8)) continue;
            lots.push({ x, z, i, j, slot: a * 2 + b });
          }
        }
      }
    }
  }
  lots.sort((A, B) => {
    const da = (A.x - HOME.x) ** 2 + (A.z - HOME.z) ** 2;
    const db = (B.x - HOME.x) ** 2 + (B.z - HOME.z) ** 2;
    return da - db || A.i - B.i || A.j - B.j || A.slot - B.slot;
  });
  return lots;
}

// Remap every resident except house #1 / owner onto deterministic block lots (by id).
export function assignBlockPlots(residents, data) {
  const lots = blockLots(data);
  const used = new Set();
  const others = residents.filter((r) => !(r && (r.id === 1 || r.owner)));
  others.sort((a, b) => (a.id || 0) - (b.id || 0));
  let k = 0;
  for (const r of others) {
    while (k < lots.length && used.has(k)) k++;
    if (k >= lots.length) break;
    const p = lots[k++];
    r.x = p.x;
    r.z = p.z;
    r.kind = 'block';
    r.block = { i: p.i, j: p.j, slot: p.slot };
    used.add(k - 1);
  }
  // house #1 stays
  for (const r of residents) {
    if (r && (r.id === 1 || r.owner)) {
      r.x = HOME.x;
      r.z = HOME.z;
    }
  }
  const occupied = residents
    .filter((r) => r && r.x != null)
    .map((r) => ({ x: r.x, z: r.z, i: r.block && r.block.i, j: r.block && r.block.j }));
  const cells = new Set();
  for (const r of residents) {
    if (r && r.block) cells.add(r.block.i + ',' + r.block.j);
  }
  const h = homeCell();
  cells.add(h.i + ',' + h.j);
  // include a cell toward the wedding plaza so streets reach it
  const w = cellIndex(PLAZA.x, PLAZA.z);
  cells.add(w.i + ',' + w.j);
  return {
    lots,
    nextIndex: k,
    cells,
    bounds: boundsOf(occupied, cells),
  };
}

function boundsOf(occupied, cells) {
  let minX = HOME.x, maxX = HOME.x, minZ = HOME.z, maxZ = HOME.z;
  for (const key of cells) {
    const [i, j] = key.split(',').map(Number);
    const o = cellOrigin(i, j);
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x + CELL);
    minZ = Math.min(minZ, o.z);
    maxZ = Math.max(maxZ, o.z + CELL);
  }
  return { minX, maxX, minZ, maxZ };
}

function segmentOnLand(data, x1, z1, x2, z2) {
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  if (nearPlaza(mx, mz)) return false;
  return isDryAt(data, mx, mz, 2);
}

export function streetPlan(layout, data) {
  const segs = [];
  const cells = [];
  for (const key of layout.cells) {
    const [i, j] = key.split(',').map(Number);
    cells.push({ i, j });
  }
  // Also add neighbor cells so the outer ring of streets is complete
  const extra = new Set(layout.cells);
  for (const { i, j } of cells) {
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      extra.add((i + di) + ',' + (j + dj));
    }
  }
  const seen = new Set();
  function add(x1, z1, x2, z2, kind) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 2) return;
    if (!segmentOnLand(data, x1, z1, x2, z2)) return;
    const key = [x1, z1, x2, z2].map((n) => n.toFixed(1)).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    segs.push({ x1, z1, x2, z2, kind });
  }
  for (const key of extra) {
    const [i, j] = key.split(',').map(Number);
    const o = cellOrigin(i, j);
    // East-west street along the south edge of the cell (z = o.z+48..60, center +54)
    const zs = o.z + LOT * 2 + STREET_W / 2;
    add(o.x - STREET_W / 2, zs, o.x + CELL + STREET_W / 2, zs, 'ew');
    // North-south street along the east edge (x = o.x+48..60, center +54)
    const xs = o.x + LOT * 2 + STREET_W / 2;
    add(xs, o.z - STREET_W / 2, xs, o.z + CELL + STREET_W / 2, 'ns');
  }
  return segs;
}

function drapeStrip(groundY, x, z, sx, sz, yLift, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), mat);
  const y = (typeof groundY === 'function' ? groundY(x, z) : 2.6) + yLift;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export function createBlockStreets({ scene, groundY, data, layout }) {
  const root = new THREE.Group();
  root.name = 'blockStreets';
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb7a98e });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xd8ccb4 });
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0xcfc3a8 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8dfc8 });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x9c8f76 });

  const segs = streetPlan(layout, data);
  const ROAD = 7.2;
  const WALK = (STREET_W - ROAD) / 2;

  for (const s of segs) {
    const cx = (s.x1 + s.x2) / 2;
    const cz = (s.z1 + s.z2) / 2;
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz);
    const ew = s.kind === 'ew';
    // roadway
    const road = drapeStrip(groundY, cx, cz, ew ? len : ROAD, ew ? ROAD : len, 0.12, roadMat);
    root.add(road);
    // sidewalks
    const off = ROAD / 2 + WALK / 2;
    if (ew) {
      root.add(drapeStrip(groundY, cx, cz - off, len, WALK, 0.16, walkMat));
      root.add(drapeStrip(groundY, cx, cz + off, len, WALK, 0.16, walkMat));
    } else {
      root.add(drapeStrip(groundY, cx - off, cz, WALK, len, 0.16, walkMat));
      root.add(drapeStrip(groundY, cx + off, cz, WALK, len, 0.16, walkMat));
    }
    // faint center line
    root.add(drapeStrip(groundY, cx, cz, ew ? len * 0.92 : 0.28, ew ? 0.28 : len * 0.92, 0.14, lineMat));
  }

  // Civic square around house #1 (the reserved 48×48 interior of the home cell)
  const h = homeCell();
  const o = cellOrigin(h.i, h.j);
  const sqX = o.x + LOT;
  const sqZ = o.z + LOT;
  const square = drapeStrip(groundY, sqX, sqZ, LOT * 2 - 1.2, LOT * 2 - 1.2, 0.11, plazaMat);
  root.add(square);
  // inner ring
  const ring = drapeStrip(groundY, HOME.x, HOME.z, 22, 22, 0.13, walkMat);
  root.add(ring);
  // curb frame
  const frameW = LOT * 2 - 0.4;
  for (const [x, z, sx, sz] of [
    [sqX, o.z + 0.4, frameW, 0.7],
    [sqX, o.z + LOT * 2 - 0.4, frameW, 0.7],
    [o.x + 0.4, sqZ, 0.7, frameW],
    [o.x + LOT * 2 - 0.4, sqZ, 0.7, frameW],
  ]) {
    root.add(drapeStrip(groundY, x, z, sx, sz, 0.18, curbMat));
  }

  // Simple lamps along streets (keep it light for mobile)
  const lampGroup = new THREE.Group();
  const poleG = new THREE.CylinderGeometry(0.12, 0.16, 4.2, 6);
  const poleM = new THREE.MeshLambertMaterial({ color: 0x3a342c });
  const bulbG = new THREE.SphereGeometry(0.28, 8, 6);
  const bulbM = new THREE.MeshLambertMaterial({ color: 0xfff1c2, emissive: 0xaa8866, emissiveIntensity: 0.35 });
  let nLamp = 0;
  const maxLamp = 64;
  for (const s of segs) {
    if (nLamp >= maxLamp) break;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const steps = Math.max(1, Math.floor(len / 42));
    for (let t = 1; t <= steps && nLamp < maxLamp; t++) {
      const u = t / (steps + 1);
      const x = s.x1 + (s.x2 - s.x1) * u;
      const z = s.z1 + (s.z2 - s.z1) * u;
      if (nearPlaza(x, z) || !isDryAt(data, x, z, 2)) continue;
      // offset to the sidewalk
      const side = STREET_W * 0.42;
      const lx = s.kind === 'ew' ? x : x + side * (t % 2 ? 1 : -1);
      const lz = s.kind === 'ew' ? z + side * (t % 2 ? 1 : -1) : z;
      const y = (typeof groundY === 'function' ? groundY(lx, lz) : 2.6);
      const pole = new THREE.Mesh(poleG, poleM);
      pole.position.set(lx, y + 2.1, lz);
      const bulb = new THREE.Mesh(bulbG, bulbM);
      bulb.position.set(lx, y + 4.25, lz);
      lampGroup.add(pole, bulb);
      nLamp++;
    }
  }
  root.add(lampGroup);

  // Hide overlapping OSM roads inside the housing district
  hideOsmInDistrict(scene, layout.bounds);

  scene.add(root);
  return { root, segs, layout };
}

function hideOsmInDistrict(scene, bounds) {
  if (!bounds) return;
  const pad = 8;
  scene.traverse((o) => {
    const g = o.parent;
    if (!o.isMesh || !g || !g.userData || !g.userData.roads) return;
    // sample the mesh midpoint
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    if (c.x >= bounds.minX - pad && c.x <= bounds.maxX + pad
      && c.z >= bounds.minZ - pad && c.z <= bounds.maxZ + pad) {
      o.visible = false;
    }
  });
}

export function nextBlockLot(residents, data) {
  const lots = blockLots(data);
  const taken = new Set(
    (residents || []).filter((r) => r && r.x != null).map((r) => r.x.toFixed(1) + ',' + r.z.toFixed(1)),
  );
  for (const p of lots) {
    const key = p.x.toFixed(1) + ',' + p.z.toFixed(1);
    if (!taken.has(key)) return { x: p.x, z: p.z, kind: 'block' };
  }
  return null;
}
