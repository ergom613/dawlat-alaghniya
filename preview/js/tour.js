// Public roaming tour: a slow cinematic glide over the city.
// Pauses on touch / drag / scroll / search, resumes after 60s idle (no snap-back sooner).
import * as THREE from 'three';

const IDLE_MS = 60000;
const RESUME_S = 2.6;
const MIN_CAM_Y = 16;

function smooth(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function createTour({ camera, controls, getHouses, groundY }) {
  let playing = true;
  let pausedAt = 0;
  let tourT = 0;
  let keys = [];
  let built = false;
  let resume = null; // { t0, fromP, fromT, toP, toT, dur }
  const _pos = new THREE.Vector3();
  const _tgt = new THREE.Vector3();

  function gy(x, z) {
    return typeof groundY === 'function' ? groundY(x, z) : 2.6;
  }

  function safeCam(x, y, z) {
    let px = x, py = y, pz = z;
    if (pz > 620) pz = 620;
    if (pz < -380) pz = -380;
    if (px < -180) px = -180;
    if (px > 480) px = 480;
    const minY = Math.max(MIN_CAM_Y, gy(px, pz) + 14);
    if (py < minY) py = minY;
    return new THREE.Vector3(px, py, pz);
  }

  function safeTgt(x, y, z) {
    let px = x, py = y, pz = z;
    if (pz > 280) pz = 280;
    if (pz < -300) pz = -300;
    if (px < -120) px = -120;
    if (px > 420) px = 420;
    const minY = gy(px, pz) + 2;
    if (py < minY) py = minY;
    return new THREE.Vector3(px, py, pz);
  }

  function houseOf(id, houses) {
    return (houses || []).find((h) => Number(h.id) === id) || null;
  }

  function celebrating(houses) {
    return (houses || []).filter((h) => (h.level || 1) >= 10);
  }

  function pushKey(list, pos, target, dur) {
    list.push({ pos, target, dur: dur || 10 });
  }

  function orbitKeys(list, cx, cz, ty, radius, height, fromAng, toAng, steps, durEach) {
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const a = fromAng + (toAng - fromAng) * u;
      const px = cx + Math.cos(a) * radius;
      const pz = cz + Math.sin(a) * radius * 0.92;
      pushKey(list, safeCam(px, height, pz), safeTgt(cx, ty, cz), durEach);
    }
  }

  function buildKeys() {
    const houses = (getHouses && getHouses()) || [];
    const h1 = houseOf(1, houses) || { x: 160, z: 65, height: 118, y: 120 };
    const h1h = h1.height || 118;
    const list = [];
    const tall = (typeof window !== 'undefined') && window.innerHeight > window.innerWidth * 1.15;

    // Start on the same public framing so the tour begins without a jump.
    if (tall) {
      pushKey(list, safeCam(285, 168, 560), safeTgt(150, gy(150, -20) + 10, -20), 0.01);
    } else {
      pushKey(list, safeCam(400, 250, 980), safeTgt(120, gy(120, 50) + 8, 50), 0.01);
    }

    // Glide in toward the city and house #1.
    pushKey(list, safeCam(260, 95, 340), safeTgt(155, 28, 60), 8);
    pushKey(list, safeCam(h1.x + 80, 20 + h1h * 0.35, h1.z + 90), safeTgt(h1.x, gy(h1.x, h1.z) + h1h * 0.32, h1.z), 11);

    // Slow orbit around the skyscraper.
    const orbitH = Math.max(48, 22 + h1h * 0.28);
    const orbitR = Math.max(70, 48 + h1h * 0.28);
    orbitKeys(list, h1.x, h1.z, gy(h1.x, h1.z) + h1h * 0.34, orbitR, orbitH, 0.85, 0.85 + Math.PI * 1.15, 5, 5.5);

    // Pass celebrating houses (hnoo_kassar L15, and any later milestone).
    const cele = celebrating(houses);
    for (const h of cele) {
      if (Number(h.id) === 1) continue;
      const hh = h.height || 8;
      pushKey(
        list,
        safeCam(h.x + 36, Math.max(18, 12 + hh * 1.4), h.z + 48),
        safeTgt(h.x, gy(h.x, h.z) + Math.max(5, hh * 0.45), h.z),
        9,
      );
    }

    // West district of tents, then a north look back at the city, then the harbour edge facing inland.
    pushKey(list, safeCam(40, 32, 150), safeTgt(90, 8, 40), 10);
    pushKey(list, safeCam(130, 70, -200), safeTgt(160, 18, 80), 13);
    pushKey(list, safeCam(300, 42, 80), safeTgt(200, 14, 70), 11);
    pushKey(list, safeCam(190, 36, 270), safeTgt(160, 16, 40), 12);

    // Rise back toward the opening framing so the loop is seamless.
    if (tall) {
      pushKey(list, safeCam(300, 150, 500), safeTgt(150, 16, 10), 12);
    } else {
      pushKey(list, safeCam(390, 230, 900), safeTgt(130, 16, 40), 12);
    }
    keys = list;
    built = keys.length > 2;
  }

  function totalDur() {
    let s = 0;
    for (let i = 1; i < keys.length; i++) s += keys[i].dur;
    if (keys.length) s += (keys[0].dur > 1 ? keys[0].dur : 12);
    return Math.max(1, s);
  }

  function poseAt(t) {
    if (!built) buildKeys();
    if (keys.length < 2) return null;
    const loop = keys.concat([{ pos: keys[0].pos, target: keys[0].target, dur: 12 }]);
    const T = totalDur();
    let u = ((t % T) + T) % T;
    for (let i = 1; i < loop.length; i++) {
      const d = loop[i].dur || 10;
      if (u > d) { u -= d; continue; }
      const a = loop[i - 1];
      const b = loop[i];
      const s = smooth(u / d);
      _pos.lerpVectors(a.pos, b.pos, s);
      _tgt.lerpVectors(a.target, b.target, s);
      const sc = safeCam(_pos.x, _pos.y, _pos.z);
      const st = safeTgt(_tgt.x, _tgt.y, _tgt.z);
      return { pos: sc, target: st };
    }
    return { pos: keys[0].pos, target: keys[0].target };
  }

  function applyPose(pose) {
    if (!pose || !camera || !controls) return;
    camera.position.copy(pose.pos);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
  }

  function pause() {
    playing = false;
    pausedAt = performance.now();
    resume = null;
  }

  function noteInput() {
    pause();
  }

  function attach() {
    if (!controls) return;
    const kick = () => noteInput();
    controls.addEventListener('start', kick);
    const el = controls.domElement;
    if (el) {
      el.addEventListener('pointerdown', kick, { passive: true });
      el.addEventListener('wheel', kick, { passive: true });
      el.addEventListener('touchstart', kick, { passive: true });
    }
  }

  function tick(dt, flyActive) {
    if (!built) buildKeys();
    const now = performance.now();
    if (!playing) {
      if (pausedAt && now - pausedAt >= IDLE_MS && !flyActive) {
        playing = true;
        const pose = poseAt(tourT);
        if (pose && camera && controls) {
          resume = {
            t0: now,
            dur: RESUME_S * 1000,
            fromP: camera.position.clone(),
            fromT: controls.target.clone(),
            toP: pose.pos.clone(),
            toT: pose.target.clone(),
          };
        }
      }
      return;
    }
    if (flyActive) return;
    if (resume) {
      const k = Math.min(1, (now - resume.t0) / resume.dur);
      const s = smooth(k);
      camera.position.lerpVectors(resume.fromP, resume.toP, s);
      controls.target.lerpVectors(resume.fromT, resume.toT, s);
      camera.lookAt(controls.target);
      if (k >= 1) resume = null;
      return;
    }
    tourT += Math.max(0, Math.min(0.05, dt || 0.016));
    const pose = poseAt(tourT);
    if (pose) applyPose(pose);
  }

  attach();

  return {
    tick,
    pause,
    noteInput,
    isPlaying: () => playing && !resume,
    isActive: () => playing,
    rebuild: () => { built = false; buildKeys(); },
    getTime: () => tourT,
    poseAt,
  };
}
