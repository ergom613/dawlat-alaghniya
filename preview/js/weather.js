// Preview weather: 5-day sun → rain → snow cycle, same for every visitor. All CC0/MIT.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { heightForLevel } from './house.js';

export const WEATHER_CYCLE = ['sun', 'rain', 'snow'];
export const WEATHER_AR = { auto: 'تلقائي', sun: 'شمس', rain: 'مطر', snow: 'تلج' };

export function berlinDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function weatherForDate(dateStr) {
  const [y, m, day] = String(dateStr).split('-').map(Number);
  const dayNum = Math.floor(Date.UTC(y, m - 1, day) / 86400000);
  return WEATHER_CYCLE[Math.floor(dayNum / 5) % 3];
}

function loadTex(loader, url, colorSpace) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      if (colorSpace) t.colorSpace = colorSpace;
      t.needsUpdate = true;
      resolve(t);
    }, undefined, reject);
  });
}

function normalize(root, target) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = target / Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(s);
}

export function createWeather({ scene, groundY, getResidents, getSunPosition }) {
  const root = new THREE.Group();
  root.name = 'weather';
  scene.add(root);

  let mode = 'auto'; // auto | sun | rain | snow
  let current = weatherForDate(berlinDateStr());
  let fade = 1;
  let targetKind = current;
  let ready = false;

  const clouds = [];
  const snowTrees = [];
  let rainMesh = null, snowPoints = [];
  let snowGround = null, snowRoofs = null;
  let flare = null, sunDisc = null;
  let rainVel, snowVel;

  const RAIN_N = 1600;
  const SNOW_N = 700;

  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  function resolveKind() {
    return mode === 'auto' ? weatherForDate(berlinDateStr()) : mode;
  }

  function setGroupVisible(obj, on) {
    if (obj) obj.visible = !!on;
  }

  const init = Promise.all([
    loader.loadAsync('./assets/weather/clouds/cloud_a.glb'),
    loader.loadAsync('./assets/weather/clouds/cloud_b.glb'),
    loader.loadAsync('./assets/weather/clouds/cloud_c.glb'),
    loader.loadAsync('./assets/weather/trees/pine_snow.glb'),
    loader.loadAsync('./assets/weather/trees/birch_snow.glb'),
    loadTex(texLoader, './assets/weather/fx/flare_01.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/fx/light_01.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/fx/trace_01.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/fx/trace_02.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/snow/snowflake1.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/snow/snowflake2.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/snow/snowflake7_alpha.png', THREE.SRGBColorSpace),
    loadTex(texLoader, './assets/weather/snow/snow_ground.png', THREE.SRGBColorSpace),
  ]).then((loaded) => {
    const [cloudA, cloudB, cloudC, pine, birch, flareTex, lightTex, tr1, tr2, sf1, sf2, sf7, snowTex] = loaded;

    // ---- clouds ----
    const protos = [cloudA.scene, cloudB.scene, cloudC.scene];
    protos.forEach((p, i) => normalize(p, [90, 70, 80][i]));
    const cloudSlots = [
      [40, 95, -80], [220, 88, 200], [320, 102, 40], [-40, 92, 120],
      [140, 110, -160], [280, 98, -60], [80, 105, 240], [180, 118, 80],
      [360, 94, 160], [0, 100, -200], [120, 86, 40], [260, 112, 260],
    ];
    cloudSlots.forEach((p, i) => {
      const src = protos[i % 3];
      const c = src.clone(true);
      c.position.set(p[0], p[1], p[2]);
      c.rotation.y = i * 0.7;
      c.traverse((o) => {
        if (o.isMesh) {
          const col = (o.material && o.material.color) ? o.material.color.clone() : new THREE.Color(0xf2f4f7);
          o.material = new THREE.MeshLambertMaterial({
            color: col, transparent: true, opacity: 0.92, fog: true, side: THREE.DoubleSide,
            emissive: new THREE.Color(0x8899aa), emissiveIntensity: 0.35,
          });
        }
      });
      root.add(c);
      clouds.push({ mesh: c, home: p, phase: i * 0.9 });
    });

    // ---- sun flare ----
    const flareMat = new THREE.SpriteMaterial({
      map: flareTex, color: 0xfff1c0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    flare = new THREE.Sprite(flareMat);
    flare.scale.set(420, 420, 1);
    flare.renderOrder = 2;
    root.add(flare);
    const discMat = new THREE.SpriteMaterial({
      map: lightTex, color: 0xffe8a0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    sunDisc = new THREE.Sprite(discMat);
    sunDisc.scale.set(180, 180, 1);
    sunDisc.renderOrder = 2;
    root.add(sunDisc);

    // ---- rain streaks (Kenney traces) ----
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_N * 3);
    rainVel = new Float32Array(RAIN_N);
    for (let i = 0; i < RAIN_N; i++) {
      rainPos[i * 3] = (Math.random() - 0.3) * 520;
      rainPos[i * 3 + 1] = 20 + Math.random() * 180;
      rainPos[i * 3 + 2] = (Math.random() - 0.4) * 480;
      rainVel[i] = 42 + Math.random() * 28;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      map: tr1, color: 0xb7c9dc, size: 9.5, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.08,
    });
    rainMesh = new THREE.Points(rainGeo, rainMat);
    rainMesh.visible = false;
    rainMesh.frustumCulled = false;
    root.add(rainMesh);
    rainMesh.userData.altMap = tr2;

    // ---- snow points ----
    const flakeMaps = [sf1, sf2, sf7];
    flakeMaps.forEach((m) => { m.needsUpdate = true; });
    snowVel = [];
    flakeMaps.forEach((map, k) => {
      const n = Math.floor(SNOW_N / flakeMaps.length);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const vel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.3) * 500;
        pos[i * 3 + 1] = 10 + Math.random() * 170;
        pos[i * 3 + 2] = (Math.random() - 0.4) * 460;
        vel[i] = 6 + Math.random() * 8;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map, color: 0xffffff, size: 5.2 + k * 0.7, transparent: true, opacity: 0.95,
        depthWrite: false, sizeAttenuation: true, alphaTest: 0.2,
      });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      root.add(pts);
      snowPoints.push(pts);
      snowVel.push(vel);
    });

    // ---- snow ground ----
    snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
    snowTex.repeat.set(18, 16);
    snowGround = new THREE.Mesh(
      new THREE.CircleGeometry(280, 48),
      new THREE.MeshLambertMaterial({
        map: snowTex, color: 0xf4f7fb, transparent: true, opacity: 0.0,
      }),
    );
    snowGround.rotation.x = -Math.PI / 2;
    snowGround.position.set(160, 2.9, 20);
    snowGround.visible = false;
    root.add(snowGround);

    // ---- snowy trees around the city edge ----
    const treeProtos = [pine.scene, birch.scene];
    treeProtos.forEach((p, i) => normalize(p, i === 0 ? 14 : 12));
    const treePos = [
      [-20, 200], [40, 230], [300, 220], [360, 180], [380, 40],
      [370, -80], [300, -160], [180, -190], [40, -180], [-20, -80],
      [-30, 40], [400, 100], [120, 240], [240, -180], [80, -200],
    ];
    treePos.forEach((p, i) => {
      const src = treeProtos[i % 2];
      const t = src.clone(true);
      const y = (typeof groundY === 'function' ? groundY(p[0], p[1]) : 2.6);
      t.position.set(p[0], y, p[1]);
      t.rotation.y = i * 1.1;
      t.visible = false;
      root.add(t);
      snowTrees.push(t);
    });

    ready = true;
    applyKind(current, true);
  }).catch((e) => console.warn('weather assets failed', e));

  function rebuildRoofs(residents) {
    if (snowRoofs) {
      root.remove(snowRoofs);
      if (snowRoofs.geometry) snowRoofs.geometry.dispose();
      snowRoofs = null;
    }
    const list = residents || (getResidents && getResidents()) || [];
    if (!list.length) return;
    const geo = new THREE.BoxGeometry(5.4, 0.38, 5.0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf3f6fb });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const dummy = new THREE.Object3D();
    list.forEach((r, i) => {
      const x = r.x, z = r.z;
      if (x == null || z == null) return;
      const h = heightForLevel(r.level || 3);
      const y = (typeof groundY === 'function' ? groundY(x, z) : 2.6) + h + 0.22;
      dummy.position.set(x, y, z);
      dummy.rotation.y = (i * 1.7) % 0.3;
      dummy.scale.set(r.level >= 20 ? 1.35 : 1, 1, r.level >= 20 ? 1.3 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = current === 'snow';
    mesh.frustumCulled = false;
    root.add(mesh);
    snowRoofs = mesh;
  }

  function applyKind(kind, instant) {
    current = kind;
    targetKind = kind;
    const isSun = kind === 'sun';
    const isRain = kind === 'rain';
    const isSnow = kind === 'snow';
    if (rainMesh) rainMesh.visible = isRain;
    snowPoints.forEach((p) => { p.visible = isSnow; });
    snowTrees.forEach((t) => { t.visible = isSnow; });
    if (snowGround) {
      snowGround.visible = isSnow;
      snowGround.material.opacity = isSnow ? 0.88 : 0;
    }
    if (snowRoofs) snowRoofs.visible = isSnow;
    if (flare) flare.visible = isSun;
    if (sunDisc) sunDisc.visible = isSun;
    clouds.forEach((c, i) => {
      if (cloudsHidden) {
        c.mesh.visible = false;
        return;
      }
      c.mesh.visible = true;
      const dark = isRain ? 0x6a7380 : isSnow ? 0xd8dde3 : 0xf2f4f7;
      c.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          o.material.color.setHex(dark);
          o.material.opacity = isSun ? (i < 6 ? 0.7 : 0.0) : 0.92;
          o.visible = !(isSun && i >= 6);
        }
      });
    });
  }

  function tickParticles(dt) {
    if (rainMesh && rainMesh.visible) {
      const pos = rainMesh.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        pos[i * 3 + 1] -= rainVel[i] * dt;
        pos[i * 3] -= dt * 7;
        if (pos[i * 3 + 1] < 2) {
          pos[i * 3] = 160 + (Math.random() - 0.5) * 520;
          pos[i * 3 + 1] = 140 + Math.random() * 80;
          pos[i * 3 + 2] = 20 + (Math.random() - 0.5) * 480;
        }
      }
      rainMesh.geometry.attributes.position.needsUpdate = true;
    }
    snowPoints.forEach((pts, k) => {
      if (!pts.visible) return;
      const pos = pts.geometry.attributes.position.array;
      const vel = snowVel[k];
      const n = vel.length;
      const t = performance.now() / 1000;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] -= vel[i] * dt;
        pos[i * 3] += Math.sin(t * 0.7 + i) * dt * 3;
        if (pos[i * 3 + 1] < 2.4) {
          pos[i * 3] = 160 + (Math.random() - 0.5) * 500;
          pos[i * 3 + 1] = 130 + Math.random() * 70;
          pos[i * 3 + 2] = 20 + (Math.random() - 0.5) * 460;
        }
      }
      pts.geometry.attributes.position.needsUpdate = true;
    });
  }

  function applySky(ctx) {
    // Soft light/fog shift. dayNight already ran this frame.
    if (!ctx) return;
    const kind = current;
    const { hemi, sun, fill, fog, renderer } = ctx;
    if (kind === 'rain') {
      if (sun) sun.intensity *= 0.32;
      if (hemi) hemi.intensity *= 0.62;
      if (fill) fill.intensity *= 0.7;
      if (fog) fog.color.lerp(new THREE.Color(0x6a7a88), 0.55);
      if (renderer) renderer.setClearColor(fog ? fog.color : 0x6a7a88, 1);
    } else if (kind === 'snow') {
      if (sun) sun.intensity *= 0.7;
      if (hemi) hemi.intensity *= 0.95;
      if (fog) fog.color.lerp(new THREE.Color(0xc5d0dc), 0.45);
      if (renderer) renderer.setClearColor(fog ? fog.color : 0xc5d0dc, 1);
    }
  }

  function update(dt, timeSec, lights) {
    const want = resolveKind();
    if (ready && want !== current) applyKind(want, false);
    if (!ready) return;

    // drift clouds
    clouds.forEach((c) => {
      if (!c.mesh.visible) return;
      const a = timeSec * 0.015 + c.phase;
      c.mesh.position.x = c.home[0] + Math.sin(a) * 14;
      c.mesh.position.z = c.home[2] + Math.cos(a * 0.8) * 10;
    });

    if (flare && sunDisc && typeof getSunPosition === 'function') {
      const s = getSunPosition();
      if (s && s.y > 40) {
        const dir = s.clone();
        const horiz = Math.max(Math.hypot(dir.x, dir.z), 1);
        dir.y = Math.min(dir.y, horiz * 0.72); // ~35° so it stays in frame
        dir.normalize();
        flare.position.copy(dir.multiplyScalar(1100));
        sunDisc.position.copy(flare.position);
        const day = current === 'sun';
        flare.visible = day;
        sunDisc.visible = day;
      } else {
        if (flare) flare.visible = false;
        if (sunDisc) sunDisc.visible = false;
      }
    }

    tickParticles(dt);
    applySky(lights);
  }

  function setMode(m) {
    if (!['auto', 'sun', 'rain', 'snow'].includes(m)) return mode;
    mode = m;
    const want = resolveKind();
    if (ready) applyKind(want, true);
    return mode;
  }

  let cloudsHidden = false;
  function setCloudsVisible(v) {
    cloudsHidden = !v;
    clouds.forEach((c) => {
      c.mesh.visible = !!v;
      c.mesh.traverse((o) => { if (o.isMesh) o.visible = !!v; });
    });
  }

  function cycleMode() {
    const order = ['auto', 'sun', 'rain', 'snow'];
    const i = order.indexOf(mode);
    return setMode(order[(i + 1) % order.length]);
  }

  return {
    root,
    ready: () => ready,
    getMode: () => mode,
    getKind: () => (ready ? current : resolveKind()),
    setMode,
    cycleMode,
    setCloudsVisible,
    rebuildRoofs,
    update,
    whenReady: init,
  };
}
