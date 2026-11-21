// ~300 instanced dabke dancers + crowd. Arms hang down 30–45° from vertical,
// hands meet the neighbor at hip height. Never a T-pose.
import * as THREE from 'three';
import { PERF } from './gfx.js';

export const DANCE_RINGS = [
  { r: 6.6, n: 54, speed: 0.16, dir: 1 },
  { r: 10.0, n: 78, speed: 0.13, dir: -1 },
  { r: 13.6, n: 100, speed: 0.11, dir: 1 },
];
export const CROWD_N = 68; // 54+78+100+68 = 300

const SKINS = [0xd4a574, 0xc68642, 0xe0ac7e, 0xb07a4a, 0xe8c4a0, 0xc4a07a];
const CLOTHES = [0x8b1e1e, 0xc9a227, 0x1f6b4a, 0xf2efe6, 0x3b2a1a, 0xb43c6e, 0x2c4c8c, 0xd8b15a, 0x6b1d3a, 0xeee3c8, 0x4a6b3a, 0x8c3a2c];
const HAIR = [0x2a2018, 0x1a1410, 0x3a2a20, 0x4a3020];
const ARM_DOWN = 38 * Math.PI / 180;

export function createDabkeCrowd(plazaX, plazaZ) {
  const people = [];
  let idx = 0;
  for (const ring of DANCE_RINGS) {
    for (let i = 0; i < ring.n; i++) {
      people.push({
        kind: 'dance',
        ringR: ring.r,
        base: (i / ring.n) * Math.PI * 2,
        speed: ring.speed,
        dir: ring.dir,
        phase: i * 0.37 + ring.r,
        skirt: i % 2 === 0,
        skin: SKINS[idx % SKINS.length],
        cloth: CLOTHES[idx % CLOTHES.length],
        hair: HAIR[idx % HAIR.length],
      });
      idx++;
    }
  }
  for (let i = 0; i < CROWD_N; i++) {
    const a = (i / CROWD_N) * Math.PI * 2 + 0.11;
    const r = 17.4 + (i % 5) * 0.85 + (i % 3) * 0.25;
    people.push({
      kind: 'crowd',
      ringR: r,
      base: a,
      speed: 0,
      dir: 1,
      phase: i * 0.53,
      skirt: i % 3 !== 1,
      skin: SKINS[idx % SKINS.length],
      cloth: CLOTHES[idx % CLOTHES.length],
      hair: HAIR[idx % HAIR.length],
    });
    idx++;
  }
  const N = people.length;

  const armG = new THREE.BoxGeometry(0.11, 0.48, 0.11);
  armG.translate(0, -0.24, 0);
  const legG = new THREE.BoxGeometry(0.13, 0.52, 0.15);
  legG.translate(0, -0.26, 0);
  const handG = new THREE.SphereGeometry(0.075, 5, 4);

  const geos = {
    head: new THREE.SphereGeometry(0.20, 7, 5),
    hair: new THREE.SphereGeometry(0.21, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
    torso: new THREE.BoxGeometry(0.42, 0.58, 0.26),
    skirt: new THREE.CylinderGeometry(0.28, 0.34, 0.46, 7),
    legL: legG,
    legR: legG.clone(),
    armL: armG,
    armR: armG.clone(),
    handL: handG,
    handR: handG.clone(),
  };

  const meshes = {};
  const group = new THREE.Group();
  group.name = 'dabkeCrowd';
  for (const [name, geo] of Object.entries(geos)) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    meshes[name] = mesh;
    group.add(mesh);
  }
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const p = people[i];
    col.setHex(p.skin);
    meshes.head.setColorAt(i, col);
    meshes.armL.setColorAt(i, col);
    meshes.armR.setColorAt(i, col);
    meshes.handL.setColorAt(i, col);
    meshes.handR.setColorAt(i, col);
    col.setHex(p.hair);
    meshes.hair.setColorAt(i, col);
    col.setHex(p.cloth);
    meshes.torso.setColorAt(i, col);
    meshes.skirt.setColorAt(i, col);
    meshes.legL.setColorAt(i, col);
    meshes.legR.setColorAt(i, col);
  }
  for (const m of Object.values(meshes)) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  function placePart(mesh, i, x, y, z, yaw, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    const base = dummy.matrix.clone();
    dummy.position.set(px, py, pz);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    dummy.matrix.premultiply(base);
    mesh.setMatrixAt(i, dummy.matrix);
  }

  let frame = 0;
  function update(dt, t, camera) {
    const time = t != null ? t : performance.now() / 1000;
    frame++;
    let lod = 0;
    if (camera) {
      const d = Math.hypot(camera.position.x - plazaX, camera.position.z - plazaZ, camera.position.y - 4);
      if (d > 200) lod = 2;
      else if (d > 110) lod = 1;
    }
    // far away (or the whole city view on phones) the dancers are sub-pixel: skip them
    const hideD = PERF.mobile ? 420 : 900;
    if (camera) {
      const d = Math.hypot(camera.position.x - plazaX, camera.position.z - plazaZ, camera.position.y - 4);
      const far = d > hideD;
      if (group.visible === far) group.visible = !far;
      if (far) return;
    }
    if (lod === 2 && frame % 3 !== 0) return;
    if (lod === 1 && PERF.mobile && frame % 2 !== 0) return;
    const skipLegs = lod >= 1;
    for (let i = 0; i < N; i++) {
      const p = people[i];
      const dance = p.kind === 'dance';
      const a = p.base + (dance ? time * p.speed * p.dir : 0);
      const x = Math.cos(a) * p.ringR;
      const z = Math.sin(a) * p.ringR;
      const beat = time * 2.13 + p.phase;
      const bob = dance ? Math.abs(Math.sin(beat)) * 0.07 : Math.sin(time * 1.1 + p.phase) * 0.02;
      // Face the center; local ±X follows the circle so lowered arms reach the neighbors.
      const yaw = -a - Math.PI / 2 + (dance ? p.dir * 0.10 : 0);
      const kick = dance ? Math.sin(beat) : 0;
      const legLX = skipLegs ? 0 : (dance ? Math.max(0, kick) * 0.45 : 0.05);
      const legRX = skipLegs ? 0 : (dance ? Math.max(0, -kick) * 0.35 : 0.04);
      const drop = dance ? ARM_DOWN : ARM_DOWN * 0.45;
      placePart(meshes.head, i, x, bob, z, yaw, 0, 1.42, 0, 0, 0, 0);
      placePart(meshes.hair, i, x, bob, z, yaw, 0, 1.50, 0, 0, 0, 0);
      placePart(meshes.torso, i, x, bob, z, yaw, 0, 1.04, 0, 0, 0, 0);
      if (p.skirt) placePart(meshes.skirt, i, x, bob, z, yaw, 0, 0.58, 0, 0, 0, 0);
      else placePart(meshes.skirt, i, x, bob, z, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      placePart(meshes.legL, i, x, bob, z, yaw, -0.11, 0.54, 0, legLX, 0, 0);
      placePart(meshes.legR, i, x, bob, z, yaw, 0.11, 0.54, 0, legRX, 0, 0);
      placePart(meshes.armL, i, x, bob, z, yaw, -0.23, 1.22, 0, 0.12, 0, -drop);
      placePart(meshes.armR, i, x, bob, z, yaw, 0.23, 1.22, 0, 0.12, 0, drop);
      const handY = 1.22 - Math.cos(drop) * 0.48;
      const handX = Math.sin(drop) * 0.48;
      placePart(meshes.handL, i, x, bob, z, yaw, -0.22 - handX, handY, 0.08, 0, 0, 0);
      placePart(meshes.handR, i, x, bob, z, yaw, 0.22 + handX, handY, 0.08, 0, 0, 0);
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  }

  return { group, update, count: N };
}
