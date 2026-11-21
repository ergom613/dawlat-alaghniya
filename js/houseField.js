// Preview perf: every follower house (except the selected "hero" house, which
// stays a full scene-graph model) is baked once into shared InstancedMeshes.
//  - near the camera: the exact procedural model (same geometry, colours,
//    materials), drawn as one instanced draw call per geometry × material kind;
//  - far away: a cheap 2–3 box stand-in (pad, body, roof colour).
// Each house keeps a light proxy {group, getHeight, getPad, …} so existing code
// (labels, celebrations, tour, meteor wreck animation) keeps working: the field
// re-reads proxy transforms + tint when told the houses are moving.
import * as THREE from 'three';
import { buildHouseAtLevel, bakeMatsFor, styleFromName, heightForLevel, setBakeMode, UNIT_BOX } from './house.js';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _c = new THREE.Color();

function geoHash(g) {
  const p = g.attributes.position;
  if (!p) return g.uuid;
  const a = p.array;
  let s = 0, s2 = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; s2 += a[i] * ((i % 7) + 1); }
  return `${g.type}|${a.length}|${g.index ? g.index.count : 0}|${s.toFixed(3)}|${s2.toFixed(3)}`;
}

function matKey(mat, role) {
  const hex = (c) => (c ? c.getHexString() : '-');
  return [
    mat.type, role, mat.transparent ? 1 : 0, (mat.opacity ?? 1).toFixed(3), mat.side, mat.depthWrite ? 1 : 0,
    mat.map ? mat.map.uuid : '-', mat.emissiveMap ? mat.emissiveMap.uuid : '-',
    hex(mat.emissive), (mat.emissiveIntensity ?? 0).toFixed(3),
    (mat.roughness ?? 0).toFixed(2), (mat.metalness ?? 0).toFixed(2), mat.blending,
  ].join('|');
}

export function createHouseField({ scene, quality = {}, shadows = false }) {
  const root = new THREE.Group();
  root.name = 'houseField';
  scene.add(root);

  const geoCanon = new Map();   // hash -> geometry
  const batches = [];           // { key, geo, mat, role, mesh, cap, count, srcOpacity }
  const batchByKey = new Map();
  let houses = [];              // see bakeHouse()
  let nearSet = new Set();
  let frame = 0;
  let lastCam = new THREE.Vector3(1e9, 0, 0);
  let lastDir = new THREE.Vector3();
  let dynamicPrev = false;
  let night = 0;
  let nearR = quality.nearR || 600;
  let nearMax = quality.nearMax || 4000;
  const pulse = { value: 1 };

  const farMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const farBatch = makeBatch('far', UNIT_BOX, farMat, 'far');

  function makeBatch(key, geo, mat, role) {
    const b = { key, geo, mat, role, mesh: null, cap: 0, count: 0, base: null };
    if (role === 'glow') {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uPulse = pulse;
        sh.vertexShader = 'uniform float uPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uPulse;');
      };
      mat.customProgramCacheKey = () => 'housefield-glow';
    }
    batches.push(b);
    batchByKey.set(key, b);
    return b;
  }

  function batchFor(srcMat, geo, role) {
    const key = geoHashOf(geo) + '#' + matKey(srcMat, role);
    let b = batchByKey.get(key);
    if (b) return b;
    const mat = srcMat.clone();
    if (mat.color) mat.color.setRGB(1, 1, 1);
    if (role === 'pane') { mat.emissive = new THREE.Color(0xffc878); mat.emissiveIntensity = 0; }
    return makeBatch(key, geoCanonOf(geo), mat, role);
  }

  const geoHashCache = new WeakMap();
  function geoHashOf(g) {
    let h = geoHashCache.get(g);
    if (!h) { h = geoHash(g); geoHashCache.set(g, h); }
    return h;
  }
  function geoCanonOf(g) {
    const h = geoHashOf(g);
    let c = geoCanon.get(h);
    if (!c) { c = g; c.userData.shared = true; if (!c.boundingBox) c.computeBoundingBox(); geoCanon.set(h, c); }
    return c;
  }

  // Bake one resident's house into part records.
  function bakeHouse(rec) {
    const style = styleFromName(rec.seed);
    const mats = bakeMatsFor(style.palette);
    setBakeMode(true);
    const inner = buildHouseAtLevel(rec.level, mats, style);
    setBakeMode(false);
    inner.traverse((o) => { if (o.userData.localYacht || o.userData.localWater) o.visible = false; });
    inner.updateMatrixWorld(true);
    const parts = [];
    const bodyBox = new THREE.Box3(), padBox = new THREE.Box3();
    let domVol = -1, domCol = 0xd8cbb3, topY = -1, roofCol = 0x8a7a6a, padCol = 0xd8cbb3, padArea = -1;
    inner.traverseVisible((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const mat = o.material;
      const role = o.userData.windowLite ? 'pane' : o.userData.smoke ? 'smoke' : o.userData.glow ? 'glow' : '';
      const canon = geoCanonOf(o.geometry);
      const b = batchFor(mat, canon, role);
      const col = mat.color ? mat.color.getHex() : 0xffffff;
      parts.push({ b, m: o.matrixWorld.clone(), col });
      if (role) return;
      _box.copy(canon.boundingBox).applyMatrix4(o.matrixWorld);
      const sx = _box.max.x - _box.min.x, sy = _box.max.y - _box.min.y, sz = _box.max.z - _box.min.z;
      if (_box.max.y < 0.36) {
        padBox.union(_box);
        if (sx * sz > padArea) { padArea = sx * sz; padCol = col; }
      } else {
        bodyBox.union(_box);
        const v = sx * sy * sz;
        if (v > domVol && !mat.transparent) { domVol = v; domCol = mat.map && !o.userData.windowLite && mat.emissiveMap ? 0xb8c4cc : col; }
        if (_box.max.y > topY && !mat.transparent && sx * sz > 0.6) { topY = _box.max.y; roofCol = col; }
      }
    });
    // far stand-in
    const far = [];
    const addBox = (bx, col, shrink = 1) => {
      if (bx.isEmpty()) return;
      const c = bx.getCenter(new THREE.Vector3());
      const s = bx.getSize(new THREE.Vector3());
      far.push({ m: new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(Math.max(0.05, s.x * shrink), Math.max(0.05, s.y), Math.max(0.05, s.z * shrink))), col });
    };
    addBox(padBox, padCol);
    if (!bodyBox.isEmpty()) {
      const h = bodyBox.max.y - bodyBox.min.y;
      const roofH = Math.min(h * 0.25, 1.6);
      const body = bodyBox.clone(); body.max.y -= roofH;
      const roof = bodyBox.clone(); roof.min.y = body.max.y;
      addBox(body, domCol, 0.92);
      addBox(roof, roofCol, 0.96);
    }
    const height = Math.max(inner.userData.height || 0, heightForLevel(rec.level));
    const pad = { w: inner.userData.padW, d: inner.userData.padD };
    // free per-house geometries that were not kept as canonical
    inner.traverse((o) => { if (o.geometry && !o.geometry.userData.shared && o.geometry !== UNIT_BOX) o.geometry.dispose(); });
    return { parts, far, height, pad, radius: Math.max(pad.w || 6, pad.d || 6, height) * 0.75 };
  }

  function makeProxy(h) {
    const group = new THREE.Object3D();
    group.position.set(h.x, h.y, h.z);
    group.updateMatrix();
    const tint = new THREE.Object3D();
    tint.material = { color: new THREE.Color(1, 1, 1) }; // meteor darkens this
    group.add(tint);
    h.tint = tint.material.color;
    return {
      group,
      isInstancedHouse: true,
      getHeight: () => h.height,
      getPad: () => h.pad,
      getLevel: () => h.level,
      getSeed: () => h.seed,
      setNightFactor() {},
      setLocalExtrasVisible() {},
      tick() {},
      pop() {},
    };
  }

  // list: [{ i, seed, level, x, y, z }]
  function setHouses(list) {
    houses = [];
    for (const rec of list) {
      const baked = bakeHouse(rec);
      const h = { ...rec, ...baked, hidden: false };
      h.proxy = makeProxy(h);
      houses.push(h);
    }
    nearSet = new Set();
    lastCam.set(1e9, 0, 0);
    return houses.map((h) => h.proxy);
  }

  function ensureCap(b, n) {
    if (b.mesh && b.cap >= n) return;
    const cap = Math.max(8, Math.ceil(n * 1.3));
    if (b.mesh) { root.remove(b.mesh); b.mesh.dispose(); }
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const opaque = !(b.mat.transparent || b.mat.isMeshBasicMaterial);
    mesh.castShadow = shadows && opaque;
    mesh.receiveShadow = shadows && opaque;
    if (b.role === 'far') { mesh.castShadow = shadows; mesh.receiveShadow = shadows; }
    mesh.count = 0;
    b.mesh = mesh;
    b.cap = cap;
    b.base = new Float32Array(cap * 3);
    root.add(mesh);
  }

  function pack() {
    const counts = new Map();
    for (const b of batches) counts.set(b, 0);
    for (const h of houses) {
      if (h.hidden || !h.proxy.group.visible) continue;
      if (nearSet.has(h)) { for (const p of h.parts) counts.set(p.b, counts.get(p.b) + 1); }
      else counts.set(farBatch, counts.get(farBatch) + h.far.length);
    }
    for (const b of batches) { const n = counts.get(b); if (n) ensureCap(b, n); b.count = 0; }
    const paneNight = night > 0.3;
    for (const h of houses) {
      if (h.hidden || !h.proxy.group.visible) continue;
      const g = h.proxy.group;
      g.updateMatrix();
      const hm = g.matrix;
      const t = h.tint;
      const list = nearSet.has(h) ? h.parts : h.far;
      const isNear = list === h.parts;
      for (const p of list) {
        const b = isNear ? p.b : farBatch;
        const k = b.count++;
        _m.multiplyMatrices(hm, p.m);
        _m.toArray(b.mesh.instanceMatrix.array, k * 16);
        _c.setHex(p.col);
        const ca = b.base;
        ca[k * 3] = _c.r * t.r; ca[k * 3 + 1] = _c.g * t.g; ca[k * 3 + 2] = _c.b * t.b;
        const ic = b.mesh.instanceColor.array;
        if (b.role === 'pane' && paneNight) { _c.setHex(0xffe0a0); ic[k * 3] = _c.r * t.r; ic[k * 3 + 1] = _c.g * t.g; ic[k * 3 + 2] = _c.b * t.b; }
        else { ic[k * 3] = ca[k * 3]; ic[k * 3 + 1] = ca[k * 3 + 1]; ic[k * 3 + 2] = ca[k * 3 + 2]; }
      }
    }
    for (const b of batches) {
      if (!b.mesh) continue;
      b.mesh.count = b.count;
      b.mesh.visible = b.count > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.instanceColor.needsUpdate = true;
    }
    lastPaneNight = paneNight;
  }
  let lastPaneNight = false;

  function chooseNear(camera) {
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cp = camera.position;
    const cand = [];
    for (const h of houses) {
      if (h.hidden) continue;
      const g = h.proxy.group.position;
      const d = Math.hypot(g.x - cp.x, g.y - cp.y, g.z - cp.z);
      const lim = nearSet.has(h) ? nearR * 1.12 : nearR;
      if (d > lim + h.radius) continue;
      _sphere.center.copy(g); _sphere.center.y += h.height * 0.5;
      _sphere.radius = h.radius + 6;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      cand.push([d, h]);
    }
    if (cand.length > nearMax) { cand.sort((a, b) => a[0] - b[0]); cand.length = nearMax; }
    const next = new Set(cand.map((c) => c[1]));
    let same = next.size === nearSet.size;
    if (same) for (const h of next) if (!nearSet.has(h)) { same = false; break; }
    if (!same) nearSet = next;
    return !same;
  }

  // dynamic: houses are being moved (meteor) → re-read every frame.
  function update(camera, { dynamic = false, force = false } = {}) {
    frame++;
    if (!houses.length) return;
    let repack = force || dynamic || dynamicPrev;
    dynamicPrev = dynamic;
    camera.updateMatrixWorld();
    const moved = camera.position.distanceToSquared(lastCam) > 4;
    const dir = camera.getWorldDirection(_dirTmp);
    const turned = dir.dot(lastDir) < 0.995;
    if (force || ((moved || turned) && frame % 3 === 0) || frame % 30 === 0) {
      if (chooseNear(camera)) repack = true;
      lastCam.copy(camera.position);
      lastDir.copy(dir);
    }
    if (repack) pack();
  }
  const _dirTmp = new THREE.Vector3();

  function setHidden(i, on) {
    const h = houses.find((x) => x.i === i);
    if (!h || h.hidden === !!on) return;
    h.hidden = !!on;
    lastCam.set(1e9, 0, 0);
    pack();
  }

  function setOnlyHidden(i) {
    let changed = false;
    for (const h of houses) {
      const want = h.i === i;
      if (h.hidden !== want) { h.hidden = want; changed = true; }
    }
    if (changed) { if (houses.length) pack(); lastCam.set(1e9, 0, 0); }
  }

  function setNight(n) {
    night = n;
    const paneNight = n > 0.3;
    for (const b of batches) {
      const m = b.mat;
      if (b.role === 'pane') m.emissiveIntensity = n * 1.85;
      else if (m.emissiveMap) m.emissiveIntensity = 0.22 + n * 1.85;
    }
    if (paneNight !== lastPaneNight) {
      for (const b of batches) {
        if (b.role !== 'pane' || !b.mesh) continue;
        const ic = b.mesh.instanceColor.array;
        if (paneNight) {
          // keep meteor tint (already folded into base) by scaling the night colour by base luminance ratio
          _c.setHex(0xffe0a0);
          for (let k = 0; k < b.count; k++) { ic[k * 3] = _c.r; ic[k * 3 + 1] = _c.g; ic[k * 3 + 2] = _c.b; }
        } else ic.set(b.base.subarray(0, b.count * 3));
        b.mesh.instanceColor.needsUpdate = true;
      }
      lastPaneNight = paneNight;
    }
  }

  function tick(t) {
    const s = Math.sin(t * 3);
    pulse.value = 1 + 0.06 * s;
    for (const b of batches) {
      if (b.role === 'glow') b.mat.opacity = 0.35 + 0.2 * s;
      else if (b.role === 'smoke') b.mat.opacity = 0.22 + 0.14 * Math.sin(t * 1.7);
    }
  }

  function setLod(r, max) {
    if (r) nearR = r;
    if (max) nearMax = max;
    lastCam.set(1e9, 0, 0);
  }

  function setShadows(on) {
    shadows = !!on;
    for (const b of batches) {
      if (!b.mesh) continue;
      const opaque = !(b.mat.transparent || b.mat.isMeshBasicMaterial);
      b.mesh.castShadow = b.mesh.receiveShadow = shadows && (opaque || b.role === 'far');
    }
  }

  function stats() {
    let inst = 0, calls = 0;
    for (const b of batches) if (b.mesh && b.mesh.visible) { calls++; inst += b.count; }
    return { houses: houses.length, near: nearSet.size, batches: batches.length, drawCalls: calls, instances: inst, nearR, nearMax };
  }

  return { root, setHouses, update, setHidden, setOnlyHidden, setNight, tick, setLod, setShadows, stats, get houses() { return houses; } };
}
