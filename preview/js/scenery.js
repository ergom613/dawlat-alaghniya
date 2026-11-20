// Distant horizon mountains and a few flocks of birds.
// Mountains stay far from the city and never sit on house plots.
import * as THREE from 'three';
import { LAND_H } from './terrain.js';

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRange({
  cx, cz, rotY = 0, length, depth, height, segsX = 72, segsZ = 16, seed = 1, palette,
}) {
  const geo = new THREE.PlaneGeometry(length, depth, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rnd = mulberry(seed);
  const peaks = [];
  const nPeaks = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < nPeaks; i++) {
    peaks.push({
      x: -0.85 + rnd() * 1.7,
      z: -0.35 + rnd() * 0.7,
      h: 0.45 + rnd() * 0.7,
      s: 0.08 + rnd() * 0.16,
    });
  }
  const low = new THREE.Color(palette.low);
  const mid = new THREE.Color(palette.mid);
  const high = new THREE.Color(palette.high);
  const snow = new THREE.Color(palette.snow);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const nx = x / (length * 0.5);
    const nz = z / (depth * 0.5);
    const edgeX = Math.pow(Math.cos(Math.min(1, Math.abs(nx)) * Math.PI * 0.5), 1.15);
    const edgeZ = 1 - Math.pow(Math.abs(nz), 1.05);
    const edge = Math.max(0, edgeX * edgeZ);
    let h = 0.22 * Math.sin((nx + seed * 0.01) * 3.7) + 0.14 * Math.sin(nx * 7.4 + nz * 2.8 + seed)
      + 0.07 * Math.sin(nx * 14.2 + nz * 6.1) + 0.04 * Math.sin((nx + nz) * 23.0);
    for (const p of peaks) {
      const dx = (nx - p.x) / p.s;
      const dz = (nz - p.z) / (p.s * 1.6);
      h += p.h * Math.exp(-(dx * dx + dz * dz));
    }
    h = Math.max(0, h) * height * edge;
    pos.setY(i, h);
    const k = height > 1 ? h / height : 0;
    if (k < 0.45) tmp.copy(low).lerp(mid, k / 0.45);
    else if (k < 0.88) tmp.copy(mid).lerp(high, (k - 0.45) / 0.43);
    else tmp.copy(high).lerp(snow, Math.max(0, (k - 0.90) / 0.10));
    // wash hard toward sky haze so ridges read as distant, not nearby earth
    const haze = 0.32 + k * 0.18;
    tmp.r = tmp.r * (1 - haze) + 0.55 * haze;
    tmp.g = tmp.g * (1 - haze) + 0.66 * haze;
    tmp.b = tmp.b * (1 - haze) + 0.78 * haze;
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    fog: true,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, LAND_H, cz);
  mesh.rotation.y = rotY;
  mesh.matrixAutoUpdate = true;
  mesh.name = 'horizon_range';
  return mesh;
}

export function createHorizonMountains() {
  const group = new THREE.Group();
  group.name = 'horizonMountains';
  // Inland, north of Monaco (negative Z). Nothing near the city or house plots
  // (plots sit roughly x 20..300, z -80..200; keep ranges several km away).
  // Thin, far, bluish-grey ridges — a horizon silhouette, not a nearby landmass.
  const ridges = [
    { cx: 80, cz: -5200, length: 16000, depth: 420, height: 260, segsX: 90, segsZ: 6, seed: 17,
      palette: { low: 0x6e7f8c, mid: 0x7d8d99, high: 0x8ea0ac, snow: 0xb8c6d0 } },
    { cx: -200, cz: -7000, length: 18000, depth: 480, height: 360, segsX: 100, segsZ: 6, seed: 31,
      palette: { low: 0x738592, mid: 0x84949f, high: 0x96a6b0, snow: 0xc0ccd4 } },
    { cx: 240, cz: -9000, length: 20000, depth: 520, height: 440, segsX: 110, segsZ: 6, seed: 53,
      palette: { low: 0x7a8b97, mid: 0x8b9aa4, high: 0x9eadb6, snow: 0xc8d2d8 } },
    { cx: -80, cz: -11400, length: 22000, depth: 560, height: 320, segsX: 110, segsZ: 6, seed: 71,
      palette: { low: 0x84939c, mid: 0x95a3ab, high: 0xa8b5bc, snow: 0xd0d8de } },
    { cx: 400, cz: -14000, length: 24000, depth: 500, height: 260, segsX: 100, segsZ: 5, seed: 97,
      palette: { low: 0x8a99a2, mid: 0x9ba8b0, high: 0xb0bcc2, snow: 0xd6dee2 } },
  ];
  for (const r of ridges) group.add(makeRange(r));

  return group;
}

function birdGeometry() {
  // A simple chevron / V wing, local +Y up, +Z forward.
  const g = new THREE.BufferGeometry();
  const span = 22;
  const back = 8;
  const verts = new Float32Array([
    0, 0, 0.4,
    -span, 0, -back,
    -0.2, 0, -0.2,
    0, 0, 0.4,
    0.2, 0, -0.2,
    span, 0, -back,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export function createBirds(scene) {
  const group = new THREE.Group();
  group.name = 'birds';
  const geo = birdGeometry();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a1714,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
    fog: false,
    depthWrite: false,
  });
  const flocks = [
    // Close flock in the public mobile view (camera ~z=720, y=195 looking toward z=20).
    { cx: 220, cz: 420, radius: 160, y: 145, n: 12, speed: 0.28, phase: 0.4 },
    { cx: 80, cz: 80, radius: 240, y: 120, n: 9, speed: 0.22, phase: 1.6 },
    { cx: 160, cz: -200, radius: 300, y: 180, n: 8, speed: 0.16, phase: 2.8 },
  ];
  const birds = [];
  for (const f of flocks) {
    for (let i = 0; i < f.n; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      group.add(mesh);
      birds.push({
        mesh,
        flock: f,
        offset: (i / f.n) * Math.PI * 2 + (i % 3) * 0.17,
        wobble: 0.4 + (i % 5) * 0.13,
        flap: 8 + (i % 4) * 1.4,
        yOff: ((i % 5) - 2) * 6,
        rOff: ((i % 3) - 1) * 28,
      });
    }
  }
  scene.add(group);

  return {
    group,
    tick(timeSec, night) {
      const hide = Math.max(0, 1 - Math.max(0, (night || 0) - 0.35) / 0.5);
      mat.opacity = 0.92 * hide;
      group.visible = hide > 0.05;
      if (!group.visible) return;
      for (const b of birds) {
        const f = b.flock;
        const a = f.phase + timeSec * f.speed + b.offset;
        const r = f.radius + b.rOff + Math.sin(timeSec * 0.35 + b.offset) * 18;
        const x = f.cx + Math.cos(a) * r;
        const z = f.cz + Math.sin(a) * r * 0.72;
        const y = f.y + b.yOff + Math.sin(timeSec * 0.7 + b.offset) * 5;
        b.mesh.position.set(x, y, z);
        // face along the tangent of the oval
        const tx = -Math.sin(a) * r;
        const tz = Math.cos(a) * r * 0.72;
        b.mesh.rotation.y = Math.atan2(tx, tz);
        const flap = Math.sin(timeSec * b.flap + b.offset) * 0.55;
        b.mesh.rotation.z = flap * 0.15;
        b.mesh.scale.set(1, 0.35 + Math.abs(flap) * 0.85, 1);
      }
    },
  };
}
