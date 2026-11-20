// Instanced crowd of follower houses with LOD. Full procedural mesh only for the selected/near plot.
import * as THREE from 'three';
import { PALETTES, styleFromName, heightForLevel } from './house.js';
import { getHeight } from './terrain.js';

const NEAR_FULL = 1; // how many full procedural houses besides the hero
const LABEL_N = 10;

function paletteOf(seed) {
  return styleFromName(seed).palette;
}

export function createCrowd(scene, residents, data) {
  const n = residents.length;
  const group = new THREE.Group();
  group.name = 'crowd';

  // No fake island disk: houses are only placed on existing Monaco land.
  let island = null;

  // Four height tiers as instanced boxes (cheap, one draw each).
  const tiers = [
    { min: 1, max: 9, w: 7, d: 6.5, h: 5, geom: null },
    { min: 10, max: 19, w: 8.5, d: 7.5, h: 9, geom: null },
    { min: 20, max: 25, w: 10, d: 9, h: 28, geom: null },
    { min: 26, max: 30, w: 11, d: 10, h: 72, geom: null },
  ];
  const mats = [];
  const meshes = [];
  const buckets = tiers.map(() => []);
  for (let i = 0; i < n; i++) {
    const lv = residents[i].level;
    let t = 0;
    if (lv >= 26) t = 3;
    else if (lv >= 20) t = 2;
    else if (lv >= 10) t = 1;
    buckets[t].push(i);
  }

  for (let t = 0; t < 4; t++) {
    const ids = buckets[t];
    const T = tiers[t];
    const geom = new THREE.BoxGeometry(T.w, T.h, T.d);
    // slight roof cap baked as a second box? keep one box for speed.
    const mat = n >= 5000 ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, ids.length));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.userData.base = [];
    const color = new THREE.Color();
    const dummy = new THREE.Object3D();
    mesh.count = ids.length;
    for (let k = 0; k < ids.length; k++) {
      const r = residents[ids[k]];
      const pal = paletteOf(r.seed);
      const hh = Math.min(T.h, heightForLevel(r.level) * (r.level >= 20 ? 0.7 : 1));
      dummy.position.set(r.x, getHeight(r.x, r.z) + hh / 2 + 0.1, r.z);
      dummy.scale.set(1, hh / T.h, 1);
      dummy.rotation.set(0, (ids[k] * 1.7) % 0.4 - 0.2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      mesh.userData.base[k] = dummy.matrix.clone();
      color.setHex(r.level >= 20 ? pal.glass : pal.wall);
      if (mesh.setColorAt) mesh.setColorAt(k, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.ids = ids;
    mesh.userData.tier = t;
    group.add(mesh);
    meshes.push(mesh);
    mats.push(mat);
  }

  // Tiny roof caps for low-rise (tiers 0-1). Skip at huge counts.
  const roofMesh = [];
  for (const t of n >= 20000 ? [] : [0, 1]) {
    const ids = buckets[t];
    if (!ids.length) continue;
    const geom = new THREE.ConeGeometry(6.2, 2.4, 4);
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshLambertMaterial({ color: 0xa85a38 }), ids.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let k = 0; k < ids.length; k++) {
      const r = residents[ids[k]];
      const pal = paletteOf(r.seed);
      const h = tiers[t].h * (heightForLevel(r.level) / tiers[t].h);
      const hh = Math.min(tiers[t].h, heightForLevel(r.level));
      dummy.position.set(r.x, getHeight(r.x, r.z) + hh + 1.1, r.z);
      dummy.rotation.set(0, Math.PI / 4, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      color.setHex(pal.roof);
      if (mesh.setColorAt) mesh.setColorAt(k, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.ids = ids;
    mesh.userData.base = [];
    const dummy2 = new THREE.Object3D();
    // re-read bases (already set above); store for visibility toggling
    const tmp = new THREE.Matrix4();
    for (let k = 0; k < ids.length; k++) {
      mesh.getMatrixAt(k, tmp);
      mesh.userData.base[k] = tmp.clone();
    }
    group.add(mesh);
    roofMesh.push(mesh);
  }

  scene.add(group);

  const index = new Map();
  for (const r of residents) index.set(r.name.toLowerCase(), r);

  // Spatial grid for nearby queries
  const CELL = 80;
  const grid = new Map();
  function cellKey(x, z) {
    return (Math.floor(x / CELL)) + ':' + (Math.floor(z / CELL));
  }
  for (const r of residents) {
    const k = cellKey(r.x, r.z);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(r);
  }

  function nearby(x, z, maxN, radius) {
    const r0 = radius || 160;
    const out = [];
    const c0 = Math.floor(x / CELL), d0 = Math.floor(z / CELL);
    const span = Math.ceil(r0 / CELL);
    for (let a = -span; a <= span; a++) {
      for (let b = -span; b <= span; b++) {
        const arr = grid.get((c0 + a) + ':' + (d0 + b));
        if (!arr) continue;
        for (const r of arr) {
          const d2 = (r.x - x) ** 2 + (r.z - z) ** 2;
          if (d2 <= r0 * r0) out.push({ r, d2 });
        }
      }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out.slice(0, maxN || LABEL_N).map((o) => o.r);
  }

  function find(name) {
    if (!name) return null;
    const s = String(name).trim().toLowerCase();
    if (index.has(s)) return index.get(s);
    // prefix / includes scan (ok for 100k once per search)
    for (const [k, r] of index) {
      if (k.includes(s)) return r;
    }
    return null;
  }

  function setNight(night) {
    // slightly lift emissive feel via material color — Lambert has no emissive instancing cheaply
    for (const mesh of meshes) {
      if (mesh.material) {
        if (mesh.material.emissive && mesh.material.emissive.isColor) {
          const e = 0.04 + night * 0.18;
          mesh.material.emissive.setRGB(e, e * 0.85, e * 0.5);
        }
      }
    }
  }

  function hideIndex(i, hide) {
    const dummy = new THREE.Object3D();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const mesh of meshes) {
      const ids = mesh.userData.ids;
      const k = ids.indexOf(i);
      if (k < 0) continue;
      const base = mesh.userData.base && mesh.userData.base[k];
      if (hide) {
        mesh.setMatrixAt(k, zero);
      } else if (base) {
        mesh.setMatrixAt(k, base);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Distance-from-hero order so a promo can grow the city outward.
  const origin = residents[0] || { x: 0, z: 0 };
  const order = residents.map((r) => r.i).sort((a, b) => {
    const ra = residents[a], rb = residents[b];
    const da = (ra.x - origin.x) ** 2 + (ra.z - origin.z) ** 2;
    const db = (rb.x - origin.x) ** 2 + (rb.z - origin.z) ** 2;
    return da - db;
  });
  const rank = new Array(n);
  for (let k = 0; k < order.length; k++) rank[order[k]] = k;
  const loc = []; // {mesh, k, i}
  for (const mesh of [...meshes, ...roofMesh]) {
    const ids = mesh.userData.ids || [];
    for (let k = 0; k < ids.length; k++) loc.push({ mesh, k, i: ids[k] });
  }
  let lastVisible = n;
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  function setVisibleCount(c) {
    c = Math.max(0, Math.min(n, Math.floor(c)));
    if (c === lastVisible) return;
    const lo = Math.min(c, lastVisible);
    const hi = Math.max(c, lastVisible);
    const show = c > lastVisible;
    const dirty = new Set();
    for (const item of loc) {
      const r = rank[item.i];
      if (r === undefined || r < lo || r >= hi) continue;
      // never show the hero slot (i===0); it has a full procedural house
      const on = show && item.i !== 0;
      const base = item.mesh.userData.base && item.mesh.userData.base[item.k];
      if (on && base) item.mesh.setMatrixAt(item.k, base);
      else item.mesh.setMatrixAt(item.k, zeroMat);
      dirty.add(item.mesh);
    }
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    lastVisible = c;
  }

  return {
    group,
    island,
    residents,
    count: n,
    find,
    nearby,
    setNight,
    hideIndex,
    setVisibleCount,
    index,
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
