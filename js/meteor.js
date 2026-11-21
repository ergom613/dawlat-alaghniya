// Big-gift "meteor" event for owner mode / TikTok LIVE hooks.
// Temporary visuals only — residents data is never written.
// Procedural meshes and particles (no external models).
import * as THREE from 'three';

export const METEOR_FLIGHT = 3.2;
export const METEOR_WRECK = 10.0;
export const METEOR_REBUILD = 4.6;
export const METEOR_TOTAL = METEOR_FLIGHT + METEOR_WRECK + METEOR_REBUILD + 2.2;

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,230,160,0.95)');
  grd.addColorStop(0.55, 'rgba(255,120,40,0.4)');
  grd.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(80,70,60,0.8)');
  grd.addColorStop(0.45, 'rgba(60,52,44,0.45)');
  grd.addColorStop(1, 'rgba(40,36,32,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makePoints(max, size, additive, map) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size,
    map: map || glowTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  return {
    geo, pos, col, mat, pts,
    vel: new Float32Array(max * 3),
    life: new Float32Array(max),
    maxL: new Float32Array(max),
    max,
  };
}

function alloc(sys, n, fn) {
  let got = 0;
  for (let i = 0; i < sys.max && got < n; i++) {
    if (sys.life[i] > 0) continue;
    fn(i);
    got++;
  }
  return got;
}

function stepParticles(sys, dt, gravity, drag) {
  let alive = 0;
  const g = gravity || 0;
  const d = drag || 0;
  for (let i = 0; i < sys.max; i++) {
    if (sys.life[i] <= 0) continue;
    sys.life[i] -= dt;
    if (sys.life[i] <= 0) {
      sys.pos[i * 3 + 1] = -9999;
      continue;
    }
    if (d) {
      sys.vel[i * 3] *= (1 - d * dt);
      sys.vel[i * 3 + 1] *= (1 - d * dt);
      sys.vel[i * 3 + 2] *= (1 - d * dt);
    }
    sys.vel[i * 3 + 1] += g * dt;
    sys.pos[i * 3] += sys.vel[i * 3] * dt;
    sys.pos[i * 3 + 1] += sys.vel[i * 3 + 1] * dt;
    sys.pos[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
    alive++;
  }
  sys.geo.attributes.position.needsUpdate = true;
  sys.geo.attributes.color.needsUpdate = true;
  sys.geo.setDrawRange(0, sys.max);
  return alive;
}

function ensureBanner() {
  let el = document.getElementById('meteorBanner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'meteorBanner';
  el.hidden = true;
  el.setAttribute('dir', 'rtl');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:16%', 'transform:translateX(-50%)',
    'z-index:30', 'pointer-events:none', 'text-align:center',
    'max-width:92vw', 'width:92vw', 'direction:rtl',
    'font-family:Cairo,"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,sans-serif',
    'font-weight:800', 'font-size:clamp(30px,8.2vw,78px)', 'line-height:1.35',
    'color:#fff6df',
    'text-shadow:0 2px 0 #2a1a00,0 0 28px rgba(255,110,30,0.9),0 8px 22px rgba(0,0,0,0.7)',
    'letter-spacing:0',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function setBanner(kind, name) {
  const el = ensureBanner();
  el.replaceChildren();
  const clean = String(name || 'متابع');
  const nameSpan = () => {
    const s = document.createElement('span');
    s.className = 'meteorName';
    s.dir = 'ltr';
    s.style.cssText = 'display:inline-block;color:#ffe08a;unicode-bidi:isolate;';
    s.textContent = clean;
    return s;
  };
  if (kind === 'gift') {
    const line = document.createElement('div');
    line.className = 'meteorLine';
    line.append('هدية ضخمة من ');
    line.append(nameSpan());
    line.append(' 🔥');
    el.append(line);
  } else if (kind === 'rebuild') {
    const a = document.createElement('div');
    a.className = 'meteorLine';
    a.textContent = 'المدينة رجعت تنبنى أحلى 🏗️';
    const b = document.createElement('div');
    b.className = 'meteorLine meteorSub';
    b.style.cssText = 'font-size:0.78em;margin-top:0.15em;';
    b.append('شكراً ');
    b.append(nameSpan());
    el.append(a, b);
  }
  el.hidden = !kind;
  el.classList.toggle('rebuild', kind === 'rebuild');
}

function hideBanner() {
  const el = document.getElementById('meteorBanner');
  if (el) {
    el.hidden = true;
    el.replaceChildren();
  }
}

export function createMeteorEvent({ scene, camera, controls, groundY, getHouses, onStart, onEnd }) {
  const root = new THREE.Group();
  root.name = 'meteorEvent';
  scene.add(root);

  const glowMap = glowTexture();
  const smokeMap = smokeTexture();
  const trail = makePoints(90, 22, true, glowMap);
  const sparks = makePoints(160, 34, true, glowMap);
  const smoke = makePoints(90, 86, false, smokeMap);
  const sparkles = makePoints(140, 22, true, glowMap);
  smoke.mat.opacity = 0.85;
  root.add(trail.pts, sparks.pts, smoke.pts, sparkles.pts);

  const meteorGrp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }),
  );
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(22, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff9a32, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff4a14, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }),
  );
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(16, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff6a18, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    }),
  );
  flame.position.y = -48;
  meteorGrp.add(core, shell, halo, flame);
  meteorGrp.visible = false;
  root.add(meteorGrp);

  const trailOrbs = [];
  const orbGeo = new THREE.SphereGeometry(1, 10, 10);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({
      color: i < 4 ? 0xfff2b0 : 0xff7a28,
      transparent: true,
      opacity: 0.7 - i * 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    m.visible = false;
    m.scale.setScalar(28 - i * 1.6);
    trailOrbs.push(m);
    root.add(m);
  }

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xfff4c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }),
  );
  flash.visible = false;
  root.add(flash);

  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffd080, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }),
  );
  shock.rotation.x = -Math.PI / 2;
  shock.visible = false;
  root.add(shock);

  const shock2 = shock.clone();
  shock2.material = shock.material.clone();
  shock2.material.color.setHex(0xff5a20);
  root.add(shock2);

  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMats = [
    new THREE.MeshLambertMaterial({ color: 0x6a5a48 }),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
    new THREE.MeshLambertMaterial({ color: 0x4a4036 }),
    new THREE.MeshLambertMaterial({ color: 0x9a7a55 }),
  ];
  const debris = [];
  for (let i = 0; i < 80; i++) {
    const m = new THREE.Mesh(debrisGeo, debrisMats[i % debrisMats.length]);
    m.visible = false;
    m.userData = { vx: 0, vy: 0, vz: 0, life: 0, spin: 0, ground: 0 };
    debris.push(m);
    root.add(m);
  }

  const tmpC = new THREE.Color();
  const impact = new THREE.Vector3();
  const startPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const lastShake = new THREE.Vector3();
  const cinemaFrom = new THREE.Vector3();
  const cinemaTo = new THREE.Vector3();
  const cinemaLook0 = new THREE.Vector3();
  const cinemaLook1 = new THREE.Vector3();

  let active = false;
  let t = 0;
  let gifter = '';
  let phase = 'idle';
  let damaged = false;
  let shakeAmp = 0;
  let houseStates = [];
  let bannerKind = '';
  let steer = true;
  let hitDone = false;

  function clearParticles(sys) {
    sys.life.fill(0);
    sys.pos.fill(0);
    for (let i = 0; i < sys.max; i++) sys.pos[i * 3 + 1] = -9999;
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.setDrawRange(0, 0);
  }

  function restoreHouses(instant) {
    for (const s of houseStates) {
      const g = s.group;
      if (!g) continue;
      if (instant) {
        g.position.copy(s.pos);
        g.rotation.copy(s.rot);
        g.scale.copy(s.scale);
      }
      for (const rec of s.mats) {
        if (!rec.mat) continue;
        if (rec.color && rec.mat.color) rec.mat.color.copy(rec.color);
        if (rec.emissive && rec.mat.emissive) rec.mat.emissive.copy(rec.emissive);
        if (rec.emiInt != null && rec.mat.emissiveIntensity != null) rec.mat.emissiveIntensity = rec.emiInt;
        if (rec.opacity != null && rec.mat.opacity != null) rec.mat.opacity = rec.opacity;
      }
    }
    if (instant) houseStates = [];
  }

  function resetAll() {
    restoreHouses(true);
    clearParticles(trail);
    clearParticles(sparks);
    clearParticles(smoke);
    clearParticles(sparkles);
    for (const m of trailOrbs) m.visible = false;
    for (const m of debris) m.visible = false;
    meteorGrp.visible = false;
    flash.visible = false;
    shock.visible = false;
    shock2.visible = false;
    flash.material.opacity = 0;
    shock.material.opacity = 0;
    shock2.material.opacity = 0;
    if (camera) camera.position.sub(lastShake);
    lastShake.set(0, 0, 0);
    shakeAmp = 0;
    damaged = false;
    hitDone = false;
    hideBanner();
    bannerKind = '';
  }

  function cityImpact() {
    const houses = (typeof getHouses === 'function' ? getHouses() : []) || [];
    // Hit beside the landmark tower (first / hero house) so the fall reads on camera,
    // slightly inland (lower z) so nothing lands on the sea.
    let hx = 160, hz = 40;
    if (houses.length && houses[0].group) {
      hx = houses[0].group.position.x;
      hz = houses[0].group.position.z;
    }
    const x = hx - 8;
    const z = hz - 22;
    const gy = typeof groundY === 'function' ? groundY(x, z) : 3;
    return new THREE.Vector3(x, gy + 1.2, z);
  }

  function damageHouses() {
    restoreHouses(true);
    houseStates = [];
    const houses = (typeof getHouses === 'function' ? getHouses() : []) || [];
    let idx = 0;
    for (const h of houses) {
      const g = h && h.group;
      if (!g) continue;
      const s = {
        group: g,
        pos: g.position.clone(),
        rot: { x: g.rotation.x, y: g.rotation.y, z: g.rotation.z, copy(o) { o.x = this.x; o.y = this.y; o.z = this.z; } },
        rotX: g.rotation.x,
        rotY: g.rotation.y,
        rotZ: g.rotation.z,
        scale: g.scale.clone(),
        mats: [],
      };
      // store as simple numbers too
      s.rx0 = g.rotation.x; s.ry0 = g.rotation.y; s.rz0 = g.rotation.z;
      const dx = g.position.x - impact.x;
      const dz = g.position.z - impact.z;
      const dist = Math.hypot(dx, dz);
      const fall = Math.max(0, 1 - dist / 320);
      const r1 = hash01(idx * 3.1 + 2);
      const r2 = hash01(idx * 5.7 + 9);
      const r3 = hash01(idx * 8.3 + 4);
      const amp = 0.18 + fall * 0.62;
      s.tx = s.pos.x + (r1 - 0.5) * 5.0 * fall;
      s.ty = s.pos.y - (0.45 + fall * 3.2 + r2 * 1.1);
      s.tz = s.pos.z + (r2 - 0.5) * 5.0 * fall;
      s.trx = s.rx0 + (r1 - 0.5) * amp * 1.6;
      s.try_ = s.ry0 + (r3 - 0.5) * amp * 0.7;
      s.trz = s.rz0 + (r2 - 0.5) * amp * 1.6;
      const dark = 0.28 + (1 - fall) * 0.32;
      g.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const mat of mats) {
          if (!mat || !mat.color) continue;
          const rec = {
            mat,
            color: mat.color.clone(),
            emissive: mat.emissive ? mat.emissive.clone() : null,
            emiInt: mat.emissiveIntensity,
            opacity: mat.opacity,
          };
          s.mats.push(rec);
          mat.color.multiplyScalar(dark);
          if (mat.emissive) mat.emissive.multiplyScalar(0.15 + (1 - fall) * 0.25);
          if (mat.emissiveIntensity != null) mat.emissiveIntensity *= 0.2;
        }
      });
      houseStates.push(s);
      idx++;
    }
    damaged = true;
  }

  function applyHouseMix(k) {
    // k=0 original, k=1 fully wrecked
    const u = Math.max(0, Math.min(1, k));
    for (const s of houseStates) {
      const g = s.group;
      if (!g) continue;
      g.position.set(
        s.pos.x + (s.tx - s.pos.x) * u,
        s.pos.y + (s.ty - s.pos.y) * u,
        s.pos.z + (s.tz - s.pos.z) * u,
      );
      g.rotation.x = s.rx0 + (s.trx - s.rx0) * u;
      g.rotation.y = s.ry0 + (s.try_ - s.ry0) * u;
      g.rotation.z = s.rz0 + (s.trz - s.rz0) * u;
    }
  }

  function tintTowardOriginal(u) {
    // u=0 wrecked colors (already applied), u=1 original
    const k = Math.max(0, Math.min(1, u));
    for (const s of houseStates) {
      for (const rec of s.mats) {
        if (!rec.mat || !rec.color) continue;
        if (rec.mat.color) {
          // we don't have wreck color stored; lerp from current is unstable.
          // store wreck color on first call
          if (!rec.wreck) rec.wreck = rec.mat.color.clone();
          rec.mat.color.copy(rec.wreck).lerp(rec.color, k);
        }
        if (rec.emissive && rec.mat.emissive) {
          if (!rec.wreckE) rec.wreckE = rec.mat.emissive.clone();
          rec.mat.emissive.copy(rec.wreckE).lerp(rec.emissive, k);
        }
        if (rec.emiInt != null && rec.mat.emissiveIntensity != null) {
          if (rec.wreckEi == null) rec.wreckEi = rec.mat.emissiveIntensity;
          rec.mat.emissiveIntensity = rec.wreckEi + (rec.emiInt - rec.wreckEi) * k;
        }
      }
    }
  }

  function burstImpact() {
    const x = impact.x, y = impact.y + 2, z = impact.z;
    alloc(sparks, 140, (i) => {
      const a = hash01(i * 1.7) * Math.PI * 2;
      const b = hash01(i * 3.3) * Math.PI * 0.62;
      const spd = 40 + hash01(i * 6.1) * 90;
      sparks.pos[i * 3] = x;
      sparks.pos[i * 3 + 1] = y + 4;
      sparks.pos[i * 3 + 2] = z;
      sparks.vel[i * 3] = Math.cos(a) * Math.sin(b) * spd;
      sparks.vel[i * 3 + 1] = Math.cos(b) * spd * 0.85 + 18;
      sparks.vel[i * 3 + 2] = Math.sin(a) * Math.sin(b) * spd;
      sparks.life[i] = 1.1 + hash01(i * 4.2) * 1.1;
      sparks.maxL[i] = sparks.life[i];
      const hot = hash01(i * 2.2);
      tmpC.setHex(hot > 0.66 ? 0xfff4c8 : hot > 0.33 ? 0xff9a32 : 0xff4a14);
      sparks.col[i * 3] = tmpC.r; sparks.col[i * 3 + 1] = tmpC.g; sparks.col[i * 3 + 2] = tmpC.b;
    });
    alloc(smoke, 90, (i) => {
      const a = hash01(i * 2.9) * Math.PI * 2;
      const r = hash01(i * 7.1) * 28;
      smoke.pos[i * 3] = x + Math.cos(a) * r;
      smoke.pos[i * 3 + 1] = y + 2;
      smoke.pos[i * 3 + 2] = z + Math.sin(a) * r;
      smoke.vel[i * 3] = Math.cos(a) * (6 + hash01(i) * 14);
      smoke.vel[i * 3 + 1] = 8 + hash01(i * 5.5) * 16;
      smoke.vel[i * 3 + 2] = Math.sin(a) * (6 + hash01(i * 1.4) * 14);
      smoke.life[i] = 2.4 + hash01(i * 8.8) * 2.2;
      smoke.maxL[i] = smoke.life[i];
      const k = 0.22 + hash01(i * 3) * 0.2;
      smoke.col[i * 3] = k * 1.1; smoke.col[i * 3 + 1] = k; smoke.col[i * 3 + 2] = k * 0.85;
    });
    sparks.geo.attributes.position.needsUpdate = true;
    sparks.geo.attributes.color.needsUpdate = true;
    smoke.geo.attributes.position.needsUpdate = true;
    smoke.geo.attributes.color.needsUpdate = true;

    // Debris near impact + around closer houses
    const houses = (typeof getHouses === 'function' ? getHouses() : []) || [];
    let d = 0;
    const throwOne = (px, py, pz, spd) => {
      if (d >= debris.length) return;
      const m = debris[d++];
      const a = Math.random() * Math.PI * 2;
      const up = 12 + Math.random() * 28;
      m.position.set(px, py + 2, pz);
      m.scale.set(2.4 + Math.random() * 6.5, 1.4 + Math.random() * 3.8, 2.0 + Math.random() * 5.0);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.userData.vx = Math.cos(a) * spd;
      m.userData.vy = up;
      m.userData.vz = Math.sin(a) * spd;
      m.userData.life = 2.8 + Math.random() * 2;
      m.userData.spin = (Math.random() - 0.5) * 8;
      m.userData.ground = (typeof groundY === 'function' ? groundY(px, pz) : py) + 0.3;
      m.visible = true;
    };
    for (let i = 0; i < 36; i++) throwOne(x, y, z, 18 + Math.random() * 46);
    for (const h of houses) {
      if (d >= debris.length) break;
      const g = h.group;
      const dist = Math.hypot(g.position.x - x, g.position.z - z);
      if (dist > 160) continue;
      if (hash01(d * 11.1 + dist) > 0.55) continue;
      throwOne(g.position.x, g.position.y + 3, g.position.z, 8 + Math.random() * 22);
    }

    flash.position.copy(impact);
    flash.position.y += 10;
    flash.scale.setScalar(16);
    flash.material.opacity = 1;
    flash.visible = true;
    shock.position.set(impact.x, impact.y + 0.9, impact.z);
    shock2.position.copy(shock.position);
    shock.scale.set(8, 8, 8);
    shock2.scale.set(5, 5, 5);
    shock.material.opacity = 1;
    shock2.material.opacity = 0.9;
    shock.visible = true;
    shock2.visible = true;
    shakeAmp = 14;
  }

  function spawnRebuildSparkles() {
    let iAlloc = 0;
    const spawnAt = (x, y, z, n) => {
      alloc(sparkles, n, (i) => {
        const a = hash01(iAlloc * 2.1 + i) * Math.PI * 2;
        const r = hash01(iAlloc * 4.4 + i) * 6;
        sparkles.pos[i * 3] = x + Math.cos(a) * r;
        sparkles.pos[i * 3 + 1] = y;
        sparkles.pos[i * 3 + 2] = z + Math.sin(a) * r;
        sparkles.vel[i * 3] = (hash01(i + 3) - 0.5) * 4;
        sparkles.vel[i * 3 + 1] = 6 + hash01(i + 9) * 14;
        sparkles.vel[i * 3 + 2] = (hash01(i + 7) - 0.5) * 4;
        sparkles.life[i] = 1.2 + hash01(i + 5) * 1.4;
        sparkles.maxL[i] = sparkles.life[i];
        tmpC.setHex(hash01(i) > 0.5 ? 0xffe08a : 0xfff6d0);
        sparkles.col[i * 3] = tmpC.r; sparkles.col[i * 3 + 1] = tmpC.g; sparkles.col[i * 3 + 2] = tmpC.b;
        iAlloc++;
      });
    };
    for (const s of houseStates) {
      const p = s.pos;
      spawnAt(p.x, p.y + 2, p.z, 2);
    }
    spawnAt(impact.x, impact.y + 2, impact.z, 24);
    sparkles.geo.attributes.position.needsUpdate = true;
    sparkles.geo.attributes.color.needsUpdate = true;
  }

  function emitTrail(px, py, pz, vx, vy, vz) {
    alloc(trail, 6, (i) => {
      trail.pos[i * 3] = px + (hash01(t * 40 + i) - 0.5) * 8;
      trail.pos[i * 3 + 1] = py + (hash01(t * 40 + i + 2) - 0.5) * 8;
      trail.pos[i * 3 + 2] = pz + (hash01(t * 40 + i + 4) - 0.5) * 8;
      trail.vel[i * 3] = -vx * 0.12 + (hash01(i + 1) - 0.5) * 10;
      trail.vel[i * 3 + 1] = -vy * 0.12 + (hash01(i + 3) - 0.5) * 8;
      trail.vel[i * 3 + 2] = -vz * 0.12 + (hash01(i + 5) - 0.5) * 10;
      trail.life[i] = 0.35 + hash01(i + t) * 0.35;
      trail.maxL[i] = trail.life[i];
      tmpC.setHex(hash01(i + 8) > 0.5 ? 0xfff2b0 : 0xff7a28);
      trail.col[i * 3] = tmpC.r; trail.col[i * 3 + 1] = tmpC.g; trail.col[i * 3 + 2] = tmpC.b;
    });
    trail.geo.attributes.position.needsUpdate = true;
    trail.geo.attributes.color.needsUpdate = true;
  }

  function trigger(name, opts) {
    opts = opts || {};
    if (active) resetAll();
    gifter = String(name == null ? '' : name).trim() || 'متابع';
    impact.copy(cityImpact());
    // Incoming from high sky, crossing the frame toward the city (not from the sea).
    startPos.set(impact.x + 150, impact.y + 330, impact.z + 80);
    dir.copy(impact).sub(startPos);
    meteorGrp.position.copy(startPos);
    meteorGrp.visible = true;
    meteorGrp.lookAt(impact);
    // Cone is built along +Y in local space; after lookAt the group's -Z faces the target.
    // Re-orient so the flame trails behind the motion (opposite velocity).
    meteorGrp.quaternion.identity();
    const up = dir.clone().normalize();
    meteorGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

    t = 0;
    active = true;
    phase = 'flight';
    hitDone = false;
    damaged = false;
    steer = opts.steerCamera !== false;
    setBanner('gift', gifter);
    bannerKind = 'gift';

    if (steer && camera && controls) {
      cinemaLook0.set(impact.x, impact.y + 80, impact.z);
      cinemaLook1.set(impact.x, impact.y + 10, impact.z);
      cinemaFrom.set(impact.x + 175, impact.y + 195, impact.z + 430);
      cinemaTo.set(impact.x + 130, impact.y + 125, impact.z + 310);
      camera.position.copy(cinemaFrom);
      controls.target.copy(cinemaLook0);
      if (controls.update) controls.update();
    }

    if (typeof onStart === 'function') onStart();
    return true;
  }

  function finish() {
    resetAll();
    active = false;
    phase = 'idle';
    t = 0;
    if (typeof onEnd === 'function') onEnd();
  }

  function tick(dt) {
    if (!active) return;
    if (!dt || dt < 0) dt = 0;
    if (dt > 0.08) dt = 0.08;
    t += dt;

    const flightU = Math.min(1, t / METEOR_FLIGHT);
    const ease = flightU * flightU * (3 - 2 * flightU);

    if (phase === 'flight' || (t < METEOR_FLIGHT && !hitDone)) {
      phase = 'flight';
      const px = startPos.x + (impact.x - startPos.x) * ease;
      const py = startPos.y + (impact.y - startPos.y) * ease;
      const pz = startPos.z + (impact.z - startPos.z) * ease;
      meteorGrp.position.set(px, py, pz);
      const pulse = 1 + 0.08 * Math.sin(t * 24);
      core.scale.setScalar(pulse);
      shell.scale.setScalar(pulse);
      flame.scale.set(0.85 + 0.2 * Math.sin(t * 30), 1 + 0.18 * Math.sin(t * 22), 0.85 + 0.2 * Math.cos(t * 30));
      meteorGrp.visible = true;

      const vx = (impact.x - startPos.x) / METEOR_FLIGHT;
      const vy = (impact.y - startPos.y) / METEOR_FLIGHT;
      const vz = (impact.z - startPos.z) / METEOR_FLIGHT;
      emitTrail(px, py, pz, vx, vy, vz);
      for (let i = 0; i < trailOrbs.length; i++) {
        const k = (i + 1) / trailOrbs.length;
        const u = Math.max(0, ease - k * 0.045);
        trailOrbs[i].position.set(
          startPos.x + (impact.x - startPos.x) * u,
          startPos.y + (impact.y - startPos.y) * u,
          startPos.z + (impact.z - startPos.z) * u,
        );
        trailOrbs[i].visible = u > 0.001;
      }

      if (steer && camera && controls) {
        const u = ease;
        camera.position.lerpVectors(cinemaFrom, cinemaTo, u * 0.45);
        controls.target.lerpVectors(cinemaLook0, cinemaLook1, u * 0.5);
      }
    }

    if (!hitDone && t >= METEOR_FLIGHT) {
      hitDone = true;
      phase = 'wreck';
      meteorGrp.visible = false;
      for (const m of trailOrbs) m.visible = false;
      clearParticles(trail);
      damageHouses();
      applyHouseMix(1);
      burstImpact();
    }

    const wreckStart = METEOR_FLIGHT;
    const rebuildStart = METEOR_FLIGHT + METEOR_WRECK;
    const rebuildEnd = rebuildStart + METEOR_REBUILD;

    if (hitDone && t < rebuildStart) {
      phase = 'wreck';
      if (bannerKind !== 'gift') { setBanner('gift', gifter); bannerKind = 'gift'; }
      // subtle residual settling
      const settle = Math.min(1, (t - wreckStart) / 0.45);
      applyHouseMix(0.88 + 0.12 * settle);
    }

    if (t >= rebuildStart && t < rebuildEnd) {
      if (phase !== 'rebuild') {
        phase = 'rebuild';
        setBanner('rebuild', gifter);
        bannerKind = 'rebuild';
        spawnRebuildSparkles();
      }
      const u = (t - rebuildStart) / METEOR_REBUILD;
      const e = 1 - Math.pow(1 - u, 3);
      applyHouseMix(1 - e);
      tintTowardOriginal(e);
    }

    if (t >= rebuildEnd) {
      applyHouseMix(0);
      tintTowardOriginal(1);
      restoreHouses(true);
      damaged = false;
    }

    // Lingering dust column after impact
    if (hitDone && t < METEOR_FLIGHT + 4.2) {
      const age = t - METEOR_FLIGHT;
      if (Math.floor(t * 24) !== Math.floor((t - dt) * 24)) {
        alloc(smoke, 3, (i) => {
          const a = hash01(t * 9 + i) * Math.PI * 2;
          const r = hash01(t * 5 + i) * (12 + age * 8);
          smoke.pos[i * 3] = impact.x + Math.cos(a) * r;
          smoke.pos[i * 3 + 1] = impact.y + 3 + hash01(t + i) * 10;
          smoke.pos[i * 3 + 2] = impact.z + Math.sin(a) * r;
          smoke.vel[i * 3] = Math.cos(a) * 4;
          smoke.vel[i * 3 + 1] = 10 + hash01(i + 2) * 14;
          smoke.vel[i * 3 + 2] = Math.sin(a) * 4;
          smoke.life[i] = 2.2 + hash01(i + 3) * 1.6;
          smoke.maxL[i] = smoke.life[i];
          const k = 0.35 + hash01(i) * 0.25;
          smoke.col[i * 3] = k; smoke.col[i * 3 + 1] = k * 0.92; smoke.col[i * 3 + 2] = k * 0.8;
        });
        smoke.geo.attributes.position.needsUpdate = true;
        smoke.geo.attributes.color.needsUpdate = true;
      }
    }

    // Flash + shockwaves
    if (flash.visible) {
      const age = t - METEOR_FLIGHT;
      if (age >= 0) {
        const hold = age < 0.12 ? 1 : Math.max(0, 1 - (age - 0.12) * 1.7);
        flash.scale.setScalar(16 + age * 160);
        flash.material.opacity = hold * 0.95;
        if (flash.material.opacity <= 0.01) flash.visible = false;
      }
    }
    if (shock.visible) {
      const age = t - METEOR_FLIGHT;
      if (age >= 0) {
        const r = 10 + age * 200;
        shock.scale.set(r, r, r);
        shock.material.opacity = Math.max(0, 1 - age * 0.55);
        const r2 = 6 + age * 140;
        shock2.scale.set(r2, r2, r2);
        shock2.material.opacity = Math.max(0, 0.85 - age * 0.7);
        if (shock.material.opacity <= 0.02 && shock2.material.opacity <= 0.02) {
          shock.visible = false;
          shock2.visible = false;
        }
      }
    }

    stepParticles(trail, dt, 0, 0.6);
    stepParticles(sparks, dt, -55, 0.15);
    stepParticles(smoke, dt, 2.5, 0.25);
    stepParticles(sparkles, dt, 1.5, 0.1);
    // fade smoke by shrinking its material a bit over time is ok (shared)

    // Debris physics
    for (const m of debris) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) { m.visible = false; continue; }
      m.userData.vy -= 38 * dt;
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.rotation.x += m.userData.spin * dt;
      m.rotation.z += m.userData.spin * 0.7 * dt;
      if (m.position.y <= m.userData.ground) {
        m.position.y = m.userData.ground;
        m.userData.vy *= -0.22;
        m.userData.vx *= 0.6;
        m.userData.vz *= 0.6;
        if (Math.abs(m.userData.vy) < 2) m.userData.vy = 0;
      }
    }

    // Camera shake — subtract previous offset, add a new decaying one
    if (camera) {
      camera.position.sub(lastShake);
      if (shakeAmp > 0.05) {
        const decay = Math.exp(-dt * 2.6);
        shakeAmp *= decay;
        const n1 = (hash01(t * 73.1) - 0.5) * 2;
        const n2 = (hash01(t * 91.7) - 0.5) * 2;
        const n3 = (hash01(t * 61.3) - 0.5) * 2;
        lastShake.set(n1 * shakeAmp, n2 * shakeAmp * 0.55, n3 * shakeAmp);
        camera.position.add(lastShake);
      } else {
        lastShake.set(0, 0, 0);
        shakeAmp = 0;
      }
    }

    if (steer && camera && controls && hitDone && t < rebuildEnd + 0.5) {
      // after subtracting shake we already applied new shake; steer under it
      // gently push in during wreck / rise during rebuild
      const baseT = Math.min(1, (t - METEOR_FLIGHT) / (METEOR_WRECK + METEOR_REBUILD));
      const pos = cinemaTo.clone();
      pos.y += baseT * 8;
      pos.z -= baseT * 20;
      // don't fight recording cameras: only when steer is on
      camera.position.sub(lastShake);
      camera.position.lerp(pos, 0.03);
      controls.target.lerp(cinemaLook1, 0.03);
      camera.position.add(lastShake);
    }

    if (t >= METEOR_TOTAL) finish();
  }

  return {
    trigger,
    tick,
    isActive: () => active,
    getTime: () => t,
    getPhase: () => phase,
    group: root,
    IMPACT_AT: METEOR_FLIGHT,
    REBUILD_AT: METEOR_FLIGHT + METEOR_WRECK,
    TOTAL: METEOR_TOTAL,
  };
}
