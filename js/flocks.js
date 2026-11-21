// Village-bird flocks (parrot, stork, pigeon) — MIT / CC-BY. No paid flock mesh.
import * as THREE from 'three';
import { PERF } from './gfx.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';

const KINDS = [
  { id: 'parrot', url: './assets/birds/parrot.glb', size: 9.0, speed: 6.0, flap: 0.48 },
  { id: 'stork', url: './assets/birds/stork.glb', size: 12.0, speed: 5.2, flap: 0.36 },
  { id: 'pigeon', url: './assets/birds/pigeon.glb', size: 6.5, speed: 5.0, flap: 0.52 },
];

function meshBox(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone();
    b.applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

function normalize(root, target) {
  const box = meshBox(root);
  const size = box.getSize(new THREE.Vector3());
  const s = target / Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(s);
  const box2 = meshBox(root);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c); // center at origin
  root.updateMatrixWorld(true);
}

function loadKind(loader, kind) {
  return loader.loadAsync(kind.url).then((gltf) => {
    const proto = gltf.scene;
    proto.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = true;
        if (o.material) {
          o.material = o.material.clone();
          o.material.fog = true;
          o.material.metalness = Math.min(o.material.metalness || 0, 0.15);
          o.material.roughness = Math.max(o.material.roughness || 0.7, 0.55);
          if (o.material.emissive) o.material.emissive.setHex(0x222222);
        }
      }
    });
    normalize(proto, kind.size);
    return { kind, proto, clips: gltf.animations || [] };
  });
}

function makeBird(src, x, y, z, seed) {
  const obj = cloneSkinned(src.proto);
  const wrapper = new THREE.Group();
  wrapper.add(obj);
  wrapper.position.set(x, y, z);
  const mixer = new THREE.AnimationMixer(obj);
  if (src.clips.length) {
    const clip = src.clips[0];
    const action = mixer.clipAction(clip);
    action.play();
    action.time = (seed % 100) * 0.07;
    mixer.timeScale = src.kind.flap * (0.9 + (seed % 7) * 0.03);
  }
  return {
    wrapper,
    mixer,
    kind: src.kind,
    vel: new THREE.Vector3(
      Math.cos(seed) * src.kind.speed,
      0,
      Math.sin(seed) * src.kind.speed,
    ),
    wander: seed * 0.17,
  };
}

export function createFlocks(scene) {
  const group = new THREE.Group();
  group.name = 'flocks';
  scene.add(group);
  const birds = [];
  let ready = false;
  let nightFade = 1;

  // Flock anchors: moving centers the birds steer toward
  const flocks = [
    { kind: 'pigeon', n: 16, cx: 180, cz: 80, y: 72, rx: 140, rz: 110, speed: 0.06, phase: 0.2 },
    { kind: 'parrot', n: 12, cx: 240, cz: -40, y: 110, rx: 180, rz: 140, speed: 0.045, phase: 1.8 },
    { kind: 'stork', n: 10, cx: 80, cz: 40, y: 150, rx: 240, rz: 180, speed: 0.033, phase: 3.1 },
    { kind: 'pigeon', n: 9, cx: 40, cz: -120, y: 88, rx: 120, rz: 90, speed: 0.066, phase: 4.4 },
  ];
  const singles = [
    { kind: 'stork', y: 170 },
    { kind: 'parrot', y: 130 },
    { kind: 'pigeon', y: 64 },
    { kind: 'parrot', y: 95 },
    { kind: 'stork', y: 190 },
  ];

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const acc = new THREE.Vector3();

  function anchorOf(f, t) {
    const a = f.phase + t * f.speed;
    return tmp.set(
      f.cx + Math.cos(a) * f.rx,
      f.y + Math.sin(t * 0.35 + f.phase) * 8,
      f.cz + Math.sin(a) * f.rz,
    );
  }

  function steerFlock(list, f, t, dt) {
    const center = anchorOf(f, t).clone();
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      acc.set(0, 0, 0);
      // cohesion / follow anchor, with a slot offset so they form a loose V/band
      const slot = (i / n) * Math.PI * 2;
      tmp2.set(
        center.x + Math.cos(slot + t * 0.2) * (8 + (i % 5) * 2.2),
        center.y + Math.sin(slot * 2) * 3,
        center.z + Math.sin(slot + t * 0.2) * (7 + (i % 4) * 1.8),
      );
      acc.add(tmp2.sub(b.wrapper.position).multiplyScalar(0.55));
      // separation
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        tmp.copy(b.wrapper.position).sub(list[j].wrapper.position);
        const d2 = tmp.lengthSq();
        if (d2 > 0.01 && d2 < 36) acc.add(tmp.multiplyScalar(4.5 / d2));
      }
      // mild alignment with flock tangent
      const a = f.phase + t * f.speed;
      acc.x += -Math.sin(a) * 2;
      acc.z += Math.cos(a) * 2;
      b.vel.addScaledVector(acc, dt);
      const maxS = b.kind.speed * (0.85 + (i % 5) * 0.04);
      const sp = b.vel.length();
      if (sp > maxS) b.vel.multiplyScalar(maxS / sp);
      if (sp < 2) b.vel.multiplyScalar(2 / Math.max(sp, 0.01));
    }
  }

  function steerSingle(b, t, dt) {
    const wx = 160 + Math.cos(t * 0.11 + b.wander) * 220;
    const wz = 20 + Math.sin(t * 0.09 + b.wander * 1.3) * 200;
    const wy = b.homeY + Math.sin(t * 0.4 + b.wander) * 16;
    tmp.set(wx, wy, wz).sub(b.wrapper.position).multiplyScalar(0.28);
    b.vel.addScaledVector(tmp, dt * 2.6);
    const maxS = b.kind.speed * 0.9;
    const sp = b.vel.length();
    if (sp > maxS) b.vel.multiplyScalar(maxS / sp);
  }

  function integrate(b, dt) {
    b.wrapper.position.addScaledVector(b.vel, dt);
    if (b.vel.lengthSq() > 0.01) {
      const yaw = Math.atan2(b.vel.x, b.vel.z);
      b.wrapper.rotation.y = yaw;
      const bank = THREE.MathUtils.clamp(-b.vel.x * 0.03, -0.28, 0.28);
      b.wrapper.rotation.z = THREE.MathUtils.lerp(b.wrapper.rotation.z, bank, 0.12);
      const pitch = THREE.MathUtils.clamp(-b.vel.y * 0.04, -0.35, 0.35);
      b.wrapper.rotation.x = THREE.MathUtils.lerp(b.wrapper.rotation.x, pitch, 0.12);
    }
    if (b.mixer) b.mixer.update(dt);
  }

  const loader = new GLTFLoader();
  Promise.all(KINDS.map((k) => loadKind(loader, k)))
    .then((loaded) => {
      const byId = Object.fromEntries(loaded.map((s) => [s.kind.id, s]));
      const groups = flocks.map((f) => []);
      flocks.forEach((f, fi) => {
        const src = byId[f.kind];
        if (!src) return;
        const nB = Math.max(2, Math.round(f.n * (PERF.birds || 1)));
        for (let i = 0; i < nB; i++) {
          const a = f.phase + (i / f.n) * Math.PI * 2;
          const b = makeBird(
            src,
            f.cx + Math.cos(a) * f.rx * 0.2,
            f.y,
            f.cz + Math.sin(a) * f.rz * 0.2,
            fi * 50 + i * 7,
          );
          group.add(b.wrapper);
          groups[fi].push(b);
          birds.push({ ...b, flock: fi, role: 'flock' });
        }
      });
      flocks._groups = groups;
      singles.forEach((s, i) => {
        if (i >= Math.ceil(singles.length * (PERF.birds || 1))) return;
        const src = byId[s.kind];
        if (!src) return;
        const b = makeBird(src, 100 + i * 30, s.y, i * 40, 900 + i * 13);
        b.homeY = s.y;
        b.role = 'single';
        group.add(b.wrapper);
        birds.push(b);
      });
      ready = true;
    })
    .catch((err) => {
      console.warn('flocks failed to load', err);
    });

  return {
    group,
    ready: () => ready,
    tick(timeSec, dt, night) {
      nightFade = Math.max(0, 1 - Math.max(0, (night || 0) - 0.45) / 0.5);
      group.visible = nightFade > 0.05;
      if (!ready || !group.visible) return;
      const t = timeSec;
      const groups = flocks._groups || [];
      for (let fi = 0; fi < groups.length; fi++) steerFlock(groups[fi], flocks[fi], t, dt);
      for (const b of birds) {
        if (b.role === 'single') steerSingle(b, t, dt);
        integrate(b, dt);
      }
    },
  };
}
