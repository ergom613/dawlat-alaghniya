// Day/night cycle: sun, moon, sky, fog, water, and plot/harbour lamps.
import * as THREE from 'three';

const DAY_TOP = new THREE.Color(0x7eb7e0);
const DAY_BOT = new THREE.Color(0xeff4e8);
const DUSK_TOP = new THREE.Color(0x2a3a6a);
const DUSK_BOT = new THREE.Color(0xe8894a);
const NIGHT_TOP = new THREE.Color(0x0a1020);
const NIGHT_BOT = new THREE.Color(0x1a2440);
const DAY_FOG = new THREE.Color(0x9ec9e0);
const NIGHT_FOG = new THREE.Color(0x0c1424);
const DAY_CLEAR = new THREE.Color(0x8ec7e8);
const NIGHT_CLEAR = new THREE.Color(0x0b1220);
const WATER_DAY_A = new THREE.Color(0x156a96);
const WATER_DAY_B = new THREE.Color(0x3aa8c0);
const WATER_NIGHT_A = new THREE.Color(0x0a2a40);
const WATER_NIGHT_B = new THREE.Color(0x163a58);

function mixC(a, b, t, out) {
  out.copy(a).lerp(b, t);
  return out;
}

// tod: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset, 1 midnight
export function nightFactorFromTod(tod) {
  const t = ((tod % 1) + 1) % 1;
  // 1 at night, 0 at day. Soft around dusk/dawn.
  const dayness = Math.cos((t - 0.5) * Math.PI * 2); // 1 noon, -1 midnight
  const n = THREE.MathUtils.clamp((-dayness + 0.15) / 1.15, 0, 1);
  return n * n; // stay darker longer at the bottom
}

export function createDayNight(ctx) {
  const { scene, renderer, hemi, sun, fill, sky, fog } = ctx;
  const skyU = sky.material.uniforms;

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1c0 })
  );
  scene.add(sunMesh);
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(32, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xdde6f4 })
  );
  scene.add(moonMesh);

  const starGeo = new THREE.BufferGeometry();
  const starN = 900;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(Math.min(1, Math.max(0, Math.random() * 0.95))); // upper hemisphere
    const r = 6200;
    starPos[i * 3] = Math.sin(b) * Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.abs(Math.cos(b)) * r + 200;
    starPos[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xf4f0e0, size: 6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  let mode = 'auto'; // auto | day | night
  let autoTod = 0.42; // late morning start
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  function resolveTod(forcedTod, dt) {
    if (forcedTod != null) return ((forcedTod % 1) + 1) % 1;
    if (mode === 'day') return 0.5;
    if (mode === 'night') return 0.0;
    autoTod = (autoTod + (dt || 0) / 720) % 1; // 12 min full cycle, slow walk into night
    return autoTod;
  }

  function apply(tod) {
    const t = ((tod % 1) + 1) % 1;
    const night = nightFactorFromTod(t);
    const dayness = 1 - night;
    // sun angle: t=0.25 horizon east, 0.5 zenith, 0.75 west
    const ang = (t - 0.25) * Math.PI * 2;
    const rad = 2200;
    const sx = Math.cos(ang) * rad;
    const sy = Math.sin(ang) * rad;
    const sz = 800;
    sun.position.set(sx, Math.max(-200, sy), sz);
    sunMesh.position.set(sx, sy, sz);
    sunMesh.visible = sy > -80;
    moonMesh.position.set(-sx, -sy, -sz * 0.4);
    moonMesh.visible = -sy > -40;
    stars.rotation.y = t * Math.PI * 2 * 0.15;
    starMat.opacity = Math.max(0, night - 0.25) * 0.95;

    const dusk = Math.max(0, 1 - Math.abs((t > 0.5 ? t : t + 1) - 0.75) / 0.12);
    const dawn = Math.max(0, 1 - Math.abs((t < 0.5 ? t : t - 1) - 0.25) / 0.12);
    const glow = Math.max(dusk, dawn);

    mixC(DAY_TOP, NIGHT_TOP, night, tmpA);
    if (glow > 0) tmpA.lerp(DUSK_TOP, glow * 0.7);
    mixC(DAY_BOT, NIGHT_BOT, night, tmpB);
    if (glow > 0) tmpB.lerp(DUSK_BOT, glow * 0.85);
    skyU.top.value.copy(tmpA);
    skyU.bot.value.copy(tmpB);

    mixC(DAY_FOG, NIGHT_FOG, night, tmpA);
    if (fog) fog.color.copy(tmpA);
    mixC(DAY_CLEAR, NIGHT_CLEAR, night, tmpB);
    if (glow > 0.2) tmpB.lerp(new THREE.Color(0xc86a3a), glow * 0.35);
    renderer.setClearColor(tmpB, 1);

    hemi.color.setHex(night > 0.6 ? 0x8aa0c8 : 0xfff2d8);
    hemi.groundColor.setHex(night > 0.6 ? 0x1a2430 : 0x7a9a6a);
    hemi.intensity = 0.28 + dayness * 0.7;
    sun.color.setHex(glow > 0.3 ? 0xffc088 : (night > 0.6 ? 0x8899bb : 0xfff5e6));
    sun.intensity = Math.max(0.08, dayness * 1.35 + glow * 0.35);
    fill.color.setHex(night > 0.5 ? 0x334466 : 0xb7d4ea);
    fill.intensity = 0.12 + dayness * 0.25;

    if (ctx.waterUniforms) {
      mixC(WATER_DAY_A, WATER_NIGHT_A, night, ctx.waterUniforms.uColor.value);
      mixC(WATER_DAY_B, WATER_NIGHT_B, night, ctx.waterUniforms.uColor2.value);
    }
    return { tod: t, night, glow };
  }

  return {
    getMode: () => mode,
    setMode(m) { mode = m; if (m === 'day') autoTod = 0.5; if (m === 'night') autoTod = 0.02; },
    cycleMode() {
      mode = mode === 'auto' ? 'day' : mode === 'day' ? 'night' : 'auto';
      if (mode === 'day') autoTod = 0.5;
      if (mode === 'night') autoTod = 0.02;
      return mode;
    },
    setAutoTod(t) { autoTod = t; },
    update(dt, forcedTod) {
      const tod = resolveTod(forcedTod, dt);
      return apply(tod);
    },
  };
}

export function createLamps(scene, data, getY) {
  const group = new THREE.Group();
  group.name = 'lamps';
  const yAt = (x, z) => (typeof getY === 'function' ? getY(x, z) : (getY || 2.6));
  const posts = [];
  const plot = data.plot || { x: 160, z: 65 };
  // Lamps along nearby roads and the harbour edge (not a ring on the house plot).
  let roadN = 0;
  for (const r of data.roads || []) {
    const pts = r.pts || [];
    for (let i = 0; i < pts.length; i += 8) {
      const p = pts[i];
      const d = Math.hypot(p[0] - plot.x, p[1] - plot.z);
      if (d > 420) continue;
      if ((roadN++ % 2) !== 0) continue;
      posts.push({ x: p[0], z: p[1], h: 4.2 });
      if (posts.length > 220) break;
    }
    if (posts.length > 220) break;
  }
  // Harbour edge lamps
  for (const h of data.harbours || []) {
    for (const rings of h.rings || []) {
      const ring = rings[0] || [];
      for (let i = 0; i < ring.length; i += 14) {
        posts.push({ x: ring[i][0], z: ring[i][1], h: 3.8 });
      }
    }
  }
  const n = posts.length;
  const poleG = new THREE.CylinderGeometry(0.07, 0.1, 1, 5);
  const poleM = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const pole = new THREE.InstancedMesh(poleG, poleM, n);
  const bulbG = new THREE.SphereGeometry(0.18, 8, 6);
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
  const bulb = new THREE.InstancedMesh(bulbG, bulbM, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const p = posts[i];
    dummy.position.set(p.x, yAt(p.x, p.z) + p.h / 2, p.z);
    dummy.scale.set(1, p.h, 1);
    dummy.updateMatrix();
    pole.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, yAt(p.x, p.z) + p.h, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulb.setMatrixAt(i, dummy.matrix);
  }
  group.add(pole, bulb);
  scene.add(group);

  // A couple of real point lights (cheap) at the plot and harbour.
  const p1 = new THREE.PointLight(0xffc878, 0, 70, 2);
  p1.position.set(plot.x, yAt(plot.x, plot.z) + 6, plot.z);
  const p2 = new THREE.PointLight(0xffc878, 0, 90, 2);
  p2.position.set(198, 6, 188);
  group.add(p1, p2);

  return {
    group,
    setNight(night) {
      bulbM.opacity = Math.max(0, night - 0.15) * 0.95;
      bulbM.color.setHex(0xffe08a);
      p1.intensity = night * 2.2;
      p2.intensity = night * 2.8;
      // poles stay; bulbs fade
    },
  };
}
