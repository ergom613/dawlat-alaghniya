// Hero walker: when someone finds their house, their character steps out of
// the door, asks «وين بدك تروح؟», then walks the roads to the mosque, the
// wedding plaza, or the restaurant — or «امشي بحرية» over the whole map —
// with a follow camera.
import * as THREE from 'three';
import { UNIVERSITY, DABKE, RESTAURANT, SOUQ } from './layout.js';
import { buildRoadGraph } from './roads.js';
import { createHeroPerson, pickType, hookOncePerFrame } from './people.js';
import { startCityLife } from './cityLife.js';
import { getHeight, LAND_H } from './terrain.js';

const ARRIVED = {
  mosque: 'وصلت عالجامع 🌹',
  wedding: 'وصلت عالعرس 🌹',
  restaurant: 'وصلت عالمطعم 🌹',
};
const PLACE_BTNS = [
  { key: 'mosque', label: '🕌 الجامع' },
  { key: 'wedding', label: '💃 العرس' },
  { key: 'restaurant', label: '🍽️ المطعم' },
  { key: 'free', label: '🚶 امشي بحرية', gold: true },
];

function app() { return window.MonacoApp; }
function gy(x, z) {
  if (window.cityRoads && window.cityRoads.groundY) return window.cityRoads.groundY(x, z);
  const a = app();
  return a && a.groundY ? a.groundY(x, z) : 2.6;
}
function isRecord() {
  return new URLSearchParams(location.search).get('record') === '1';
}

function fallbackPlaces() {
  const U = UNIVERSITY, R = RESTAURANT;
  const v3 = (x, z) => ({ x, y: gy(x, z), z });
  return {
    mosque: { key: 'mosque', name: 'جامع دولة الأغنياء', position: v3(U.x, U.z), entrance: v3(U.x, U.z + U.d / 2 + 1), inside: v3(U.x, U.z + 18) },
    wedding: { key: 'wedding', name: 'العرس · ساحة الدبكة', position: v3(DABKE.x, DABKE.z), entrance: v3(DABKE.x + DABKE.size / 2 + 1, DABKE.z), inside: v3(DABKE.x + 14, DABKE.z) },
    restaurant: { key: 'restaurant', name: 'مطعم البحر', position: v3(R.x, R.z), entrance: v3(R.x - R.w / 2 - 1, R.z), inside: v3(R.x - R.w / 2 + 6, R.z) },
  };
}
function places() {
  const c = window.cityPlaces;
  if (c && c.mosque && c.wedding && c.restaurant) return c;
  return fallbackPlaces();
}

function fallbackGraph() {
  const a = app();
  const segs = [];
  if (a && a.blockStreets) segs.push(...(a.blockStreets.segs || []), ...(a.blockStreets.access || []));
  if (!segs.length) {
    segs.push(
      { x1: 160, z1: 65, x2: UNIVERSITY.x, z2: UNIVERSITY.z + UNIVERSITY.d / 2 + 1 },
      { x1: 160, z1: 65, x2: DABKE.x + DABKE.size / 2 + 1, z2: DABKE.z },
      { x1: 160, z1: 65, x2: RESTAURANT.x - RESTAURANT.w / 2 - 1, z2: RESTAURANT.z },
      { x1: DABKE.x - DABKE.size / 2 - 1, z1: DABKE.z, x2: SOUQ.x + SOUQ.w / 2 + 1, z2: SOUQ.z },
    );
  }
  return buildRoadGraph(segs);
}

function waypoints(from, to) {
  if (window.cityRoads && window.cityRoads.waypoints) {
    const pts = window.cityRoads.waypoints(from, to);
    if (pts && pts.length >= 2) return pts;
  }
  const g = fallbackGraph();
  return g.waypoints(from, to).map((p) => ({ x: p.x, y: gy(p.x, p.z), z: p.z }));
}
function approachPlace(pts, key) {
  const pl = places()[key];
  if (!pl || !pl.entrance) return (pts || []).map((p) => ({ x: p.x, y: p.y != null ? p.y : gy(p.x, p.z), z: p.z }));
  const ent = pl.entrance, inn = pl.inside || pl.position || ent;
  const dx = inn.x - ent.x, dz = inn.z - ent.z;
  const L = Math.hypot(dx, dz) || 1;
  const step = Math.min(3.2, L);
  const goal = { x: ent.x + dx / L * step, z: ent.z + dz / L * step };
  const out = [];
  for (const p of pts || []) {
    const de = Math.hypot(p.x - ent.x, p.z - ent.z);
    const di = Math.hypot(p.x - inn.x, p.z - inn.z);
    if (di + 0.8 < de) break; // don't walk past the door into the building
    out.push(p);
  }
  if (!out.length) out.push({ x: fromSafe(pts).x, z: fromSafe(pts).z });
  out.push(goal);
  return out.map((p) => ({ x: p.x, y: p.y != null ? p.y : gy(p.x, p.z), z: p.z }));
}
function fromSafe(pts) {
  return (pts && pts[0]) || { x: 0, z: 0 };
}
function routeToPlace(from, key) {
  let pts = null;
  if (window.cityRoads && window.cityRoads.routeToPlace) {
    pts = window.cityRoads.routeToPlace(from, key);
  }
  if (!pts || pts.length < 2) {
    const pl = places()[key];
    if (!pl) return null;
    pts = waypoints(from, pl.entrance);
  }
  return approachPlace(pts, key);
}

/* ---------- UI ---------- */
function ensureUI() {
  if (document.getElementById('walkerPop')) return document.getElementById('walkerPop');
  const style = document.createElement('style');
  style.textContent = `
    #walkerPop {
      position: fixed; z-index: 85; left: 50%; bottom: calc(var(--safe-bottom, 10px) + 86px);
      transform: translateX(-50%);
      width: min(360px, calc(100vw - 24px));
      padding: 14px 14px 16px; text-align: center; direction: rtl;
    }
    #walkerPop[hidden] { display: none !important; }
    #walkerPop .wp-title { margin: 0 8px 12px; font-size: 18px; font-weight: 800; color: var(--text, #fff6df); }
    #walkerPop .wp-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    #walkerPop .wp-btns button {
      border: 1px solid var(--line, rgba(232,196,90,0.38));
      background: var(--btn, rgba(255,255,255,0.08));
      color: var(--text, #fff6df);
      font-weight: 800; font-family: inherit; font-size: 14px;
      border-radius: 999px; height: 44px; padding: 0 14px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
    }
    #walkerPop .wp-btns button.gold {
      background: linear-gradient(180deg, #f0d36a, #d4a84a); color: #2a1f0a; border-color: transparent;
    }
    #walkerPop .wp-btns button:active { transform: scale(0.97); }
  `;
  document.head.appendChild(style);
  const pop = document.createElement('div');
  pop.id = 'walkerPop';
  pop.className = 'panel';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.dir = 'rtl';
  document.body.appendChild(pop);
  return pop;
}
function setHouseCardHidden(hide) {
  const card = document.getElementById('houseCard');
  if (!card) return;
  if (hide) {
    if (card.dataset.walkerHid == null) card.dataset.walkerHid = card.hidden ? '1' : '0';
    card.hidden = true;
  } else if (card.dataset.walkerHid != null) {
    card.hidden = card.dataset.walkerHid === '1';
    delete card.dataset.walkerHid;
  }
}
function showChoose() {
  const pop = ensureUI();
  setHouseCardHidden(true);
  pop.innerHTML = `<p class="wp-title">وين بدك تروح؟</p><div class="wp-btns">${
    PLACE_BTNS.map((b) => `<button type="button"${b.gold ? ' class="gold"' : ''} data-place="${b.key}">${b.label}</button>`).join('')
  }</div>`;
  pop.hidden = false;
  pop.querySelectorAll('[data-place]').forEach((btn) => {
    btn.addEventListener('click', () => choose(btn.getAttribute('data-place')));
  });
}
function showArrived(key) {
  const pop = ensureUI();
  setHouseCardHidden(true);
  pop.innerHTML = `<p class="wp-title">${ARRIVED[key] || 'وصلت 🌹'}</p><div class="wp-btns">
    <button type="button" data-act="again">🔁 روح لمحل تاني</button>
    <button type="button" class="gold" data-act="home">🏠 رجوع عالبيت</button>
  </div>`;
  pop.hidden = false;
  pop.querySelector('[data-act="again"]').addEventListener('click', () => {
    state.mode = 'choose';
    holdFollow();
    showChoose();
  });
  pop.querySelector('[data-act="home"]').addEventListener('click', () => goHome());
}
function hidePop() {
  const pop = document.getElementById('walkerPop');
  if (pop) pop.hidden = true;
}

/* ---------- state ---------- */
const state = {
  mode: 'idle', // idle | exit | choose | walk | arrived
  hero: null,
  info: null,
  home: null,
  path: [],
  pi: 0,
  dist: 0,
  x: 0, z: 0, yaw: 0,
  phase: 0,
  speed: 6.2,
  timeScale: 1,
  follow: false,
  camFree: false,
  place: null,
  startedFor: null,
};
// If the visitor picks another camera action (أماكن, العرس, الخريطة, search…)
// while the follow camera is on, let go of the camera instead of fighting it.
function releaseFollowForUI(e) {
  if (!state.follow) return;
  const t = e && e.target;
  if (t && t.closest && t.closest('#walkerPop, #walkerFree, #walkerCamBtn')) return;
  state.follow = false;
  state.camFree = false;
  window.__walkerFollow = false;
  restoreOrbitDefaults();
  const a = app();
  if (a && a.controls) a.controls.enabled = true;
  hidePop();
  syncCamBtn();
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#dock button, #btnFindHouse, #btnPlaces, #btnWeddingCam, #btnOverview, #souqEnter') && !t.closest('#walkerFree, #walkerPop, #walkerCamBtn')) releaseFollowForUI(e);
  }, true);
}
function holdFollow(on) {
  state.follow = on !== false;
  const a = app();
  if (state.follow) {
    window.__walkerFollow = true;
    if (!state.camFree) {
      followSettled = false;
      followYaw = state.yaw || 0;
      applyLockedControls();
    }
  } else {
    state.camFree = false;
    window.__walkerFollow = false;
    restoreOrbitDefaults();
  }
  if (a && a.controls) {
    if (state.follow && !state.camFree) a.controls.enabled = false;
    else a.controls.enabled = true;
  }
  syncCamBtn();
}

function ensureHero(info) {
  const a = app();
  if (!a || !a.scene) return null;
  const name = (info && (info.name || info.username)) || 'ساكن';
  const typ = pickType(name, { allowChild: false });
  if (state.hero && state.hero._name === name && state.hero.type === typ) return state.hero;
  if (state.hero && state.hero.root && state.hero.root.parent) state.hero.root.parent.remove(state.hero.root);
  const hero = createHeroPerson({ type: typ, name, seed: name });
  hero._name = name;
  a.scene.add(hero.root);
  state.hero = hero;
  return hero;
}

function doorInfo(raw) {
  if (!raw) return null;
  const pos = raw.position || raw;
  const x = pos.x, z = pos.z;
  let door = raw.door || { x, z };
  let roadPoint = raw.roadPoint || null;
  let facing = raw.facing;
  if (facing == null && roadPoint) facing = Math.atan2(roadPoint.x - door.x, roadPoint.z - door.z);
  if (facing == null) facing = 0;
  if (!roadPoint) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    roadPoint = { x: door.x + fx * 4.2, z: door.z + fz * 4.2 };
  }
  return {
    id: raw.id || raw.num,
    name: raw.name || raw.username || ('بيت ' + (raw.id || '')),
    position: { x, z },
    door: { x: door.x, z: door.z },
    roadPoint: { x: roadPoint.x, z: roadPoint.z },
    facing,
    resident: raw.resident || raw,
  };
}

function placeAt(x, z, yaw, mode, dt) {
  state.x = x; state.z = z; state.yaw = yaw;
  if (mode === 'walk' || mode === 'run') state.phase += (dt || 0) * state.speed * 2.4 * state.timeScale;
  const hero = state.hero;
  if (!hero) return;
  const cam = app() && app().camera;
  hero.applyPose({
    x, y: gy(x, z), z, yaw, phase: state.phase,
    mode: mode || 'idle', time: performance.now() / 1000, camera: cam,
  });
}

function beginExit(info) {
  const d = doorInfo(info);
  if (!d) return;
  if (isRecord()) return;
  const a = app();
  if (a && a.tour && a.tour.pause) a.tour.pause();
  if (a && a.exitWeddingCam) a.exitWeddingCam();
  if (a && a.setCamMode) a.setCamMode('free', true);
  ensureHero(d);
  state.info = d;
  state.home = { x: d.door.x, z: d.door.z, facing: d.facing };
  state.startedFor = d.id;
  state.place = null;
  const fx = Math.sin(d.facing), fz = Math.cos(d.facing);
  const backX = d.door.x - fx * 0.6;
  const backZ = d.door.z - fz * 0.6;
  let outX = d.roadPoint.x, outZ = d.roadPoint.z;
  const outDist = Math.hypot(outX - d.door.x, outZ - d.door.z);
  if (!Number.isFinite(outDist) || outDist < 1.5 || outDist > 5) {
    const dOut = 3.8;
    outX = d.door.x + fx * dOut;
    outZ = d.door.z + fz * dOut;
  }
  state.path = [
    { x: backX, z: backZ },
    { x: d.door.x, z: d.door.z },
    { x: outX, z: outZ },
  ];
  state.pi = 0; state.dist = 0;
  state.mode = 'exit';
  state.speed = 3.2;
  holdFollow(true);
  hidePop();
  placeAt(backX, backZ, d.facing, 'walk', 0);
}

/* ---------- free walk over the whole map ---------- */
const freeKeys = Object.create(null);
const freeStick = { x: 0, y: 0, on: false };
let freeTarget = null;
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LAND_H);

function inBox(x, z, cx, cz, w, d) {
  return Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
}
function inSouqNaveOrGate(x, z) {
  const dx = x - SOUQ.x, dz = z - SOUQ.z;
  const inNave = Math.abs(dx) <= 3.6 && Math.abs(dz) <= 78;
  const inEastGate = Math.abs(dz) <= 2.8 && dx >= -3.6 && dx <= SOUQ.w / 2 + 8;
  const inEnds = Math.abs(dx) <= 3.6 && Math.abs(dz) <= 83;
  return inNave || inEastGate || inEnds;
}
function inSouqWall(x, z) {
  if (!inBox(x, z, SOUQ.x, SOUQ.z, SOUQ.w + 2, SOUQ.d + 2)) return false;
  return !inSouqNaveOrGate(x, z);
}
function isSea(x, z) {
  const h = getHeight(x, z);
  return !Number.isFinite(h) || h < 0.4;
}
function walkable(x, z) {
  if (isSea(x, z)) return false;
  if (inSouqWall(x, z)) return false;
  if (inBox(x, z, UNIVERSITY.x, UNIVERSITY.z, UNIVERSITY.w - 10, UNIVERSITY.d - 10)) return false;
  if (inBox(x, z, RESTAURANT.x, RESTAURANT.z, RESTAURANT.w - 6, RESTAURANT.d - 8)) return false;
  const pl = places();
  if (pl.mosque && pl.mosque.position && inBox(x, z, pl.mosque.position.x, pl.mosque.position.z, 52, 52)) return false;
  return true;
}

function ensureFreeUI() {
  if (document.getElementById('walkerFree')) return document.getElementById('walkerFree');
  const style = document.createElement('style');
  style.id = 'walkerFreeStyle';
  style.textContent = `
    #walkerFree { position: fixed; inset: 0; pointer-events: none; z-index: 86; font-family: Cairo, "Noto Naskh Arabic", Tahoma, sans-serif; }
    #walkerFree[hidden] { display: none !important; }
    #walkerFreeExit {
      pointer-events: auto; position: absolute; right: 14px; bottom: 250px;
      border: 1px solid rgba(217,169,42,0.55); background: rgba(18,16,12,0.72);
      color: #f3efdf; font-weight: 800; font-family: inherit; font-size: 15px;
      border-radius: 14px; padding: 10px 14px; cursor: pointer; backdrop-filter: blur(8px);
    }
    #walkerStick {
      pointer-events: auto; position: absolute; right: 16px; bottom: 110px;
      width: 118px; height: 118px; border-radius: 50%;
      background: rgba(18,16,12,0.42); border: 1px solid rgba(217,169,42,0.45);
      touch-action: none;
    }
    #walkerStick .knob {
      position: absolute; left: 50%; top: 50%; width: 54px; height: 54px;
      margin: -27px 0 0 -27px; border-radius: 50%;
      background: linear-gradient(180deg, #f0d36a, #d4a84a); box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    @media (min-width: 900px) { #walkerStick { display: none; } }
  `;
  document.head.appendChild(style);
  const wrap = document.createElement('div');
  wrap.id = 'walkerFree';
  wrap.hidden = true;
  wrap.innerHTML = `<button id="walkerFreeExit" type="button">خروج</button><div id="walkerStick"><div class="knob"></div></div>`;
  document.body.appendChild(wrap);
  document.getElementById('walkerFreeExit').addEventListener('click', (e) => {
    e.preventDefault();
    stopFree();
  });
  const stick = document.getElementById('walkerStick');
  const knob = stick.querySelector('.knob');
  const setStick = (cx, cy) => {
    const r = stick.getBoundingClientRect();
    const mx = r.left + r.width / 2, my = r.top + r.height / 2;
    let dx = cx - mx, dy = cy - my;
    const max = r.width * 0.36;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) { dx *= max / len; dy *= max / len; }
    freeStick.x = dx / max;
    freeStick.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const endStick = () => {
    freeStick.x = 0; freeStick.y = 0; freeStick.on = false;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    freeStick.on = true; freeTarget = null;
    try { stick.setPointerCapture(e.pointerId); } catch { /* */ }
    setStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (!freeStick.on) return;
    e.preventDefault();
    setStick(e.clientX, e.clientY);
  });
  const up = (e) => { if (freeStick.on) endStick(); };
  stick.addEventListener('pointerup', up);
  stick.addEventListener('pointercancel', up);
  return wrap;
}

function bindFreeInput() {
  if (bindFreeInput._done) return;
  bindFreeInput._done = true;
  window.addEventListener('keydown', (e) => {
    if (state.mode !== 'free') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    freeKeys[e.code] = true;
    if (/^Arrow|Key[WASD]|Shift/.test(e.code)) e.preventDefault();
    if (e.code === 'Escape') stopFree();
  });
  window.addEventListener('keyup', (e) => { freeKeys[e.code] = false; });
  const canvas = () => {
    const a = app();
    return a && a.renderer && a.renderer.domElement;
  };
  const onDown = (e) => {
    if (state.mode !== 'free') return;
    if (state.camFree) return; // drag is for orbiting, not walk-to
    if (e.target && e.target.closest && e.target.closest('#walkerFree, #walkerPop, #walkerCamBtn, #dock, button, input')) return;
    const el = canvas();
    if (!el || (e.target !== el && !el.contains(e.target))) return;
    const a = app();
    if (!a || !a.camera) return;
    const r = el.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, a.camera);
    _plane.constant = -gy(state.x, state.z);
    if (!_ray.ray.intersectPlane(_plane, _hit)) return;
    if (walkable(_hit.x, _hit.z)) {
      freeTarget = { x: _hit.x, z: _hit.z };
      freeStick.x = 0; freeStick.y = 0;
    }
  };
  window.addEventListener('pointerdown', onDown, true);
}

function startFree() {
  if (isRecord()) return;
  const a = app();
  if (a && a.tour && a.tour.pause) a.tour.pause();
  if (a && a.setCamMode) a.setCamMode('free', true);
  state.mode = 'free';
  state.place = 'free';
  state._after = null;
  freeTarget = null;
  freeStick.x = 0; freeStick.y = 0; freeStick.on = false;
  holdFollow(true);
  hidePop();
  setHouseCardHidden(true);
  const ui = ensureFreeUI();
  ui.hidden = false;
  bindFreeInput();
}

function stopFree() {
  const ui = document.getElementById('walkerFree');
  if (ui) ui.hidden = true;
  freeTarget = null;
  freeStick.on = false;
  state.mode = 'choose';
  placeAt(state.x, state.z, state.yaw, 'idle', 0);
  holdFollow(true);
  showChoose();
}

function tickFree(dt, ignoreScale) {
  const a = app();
  const cam = a && a.camera;
  const scale = ignoreScale ? 1 : state.timeScale;
  dt = (dt || 0) * scale;
  if (dt <= 0 && !ignoreScale) {
    // Frozen for capture: still pose/camera, don't step.
    if (state.hero) {
      state.hero.applyPose({
        x: state.x, y: gy(state.x, state.z), z: state.z, yaw: state.yaw,
        phase: state.phase, mode: 'idle', time: performance.now() / 1000,
        camera: cam,
      });
    }
    return;
  }
  let ix = 0, iy = 0;
  if (freeKeys.KeyW || freeKeys.ArrowUp) iy -= 1;
  if (freeKeys.KeyS || freeKeys.ArrowDown) iy += 1;
  if (freeKeys.KeyA || freeKeys.ArrowLeft) ix -= 1;
  if (freeKeys.KeyD || freeKeys.ArrowRight) ix += 1;
  if (freeStick.on && (Math.abs(freeStick.x) > 0.08 || Math.abs(freeStick.y) > 0.08)) {
    ix = freeStick.x;
    iy = freeStick.y;
  }
  const run = !!(freeKeys.ShiftLeft || freeKeys.ShiftRight);
  const spd = (run ? 9.2 : 5.8);
  let mx = 0, mz = 0;
  if (Math.abs(ix) > 0.04 || Math.abs(iy) > 0.04) {
    freeTarget = null;
    // Camera-relative: stick/keys move in the view direction, character turns to follow.
    let cyaw = state.yaw;
    if (cam) {
      const dx = state.x - cam.position.x, dz = state.z - cam.position.z;
      if (Math.hypot(dx, dz) > 0.2) cyaw = Math.atan2(dx, dz);
    }
    // iy < 0 is forward (W / stick up)
    const fwd = -iy, str = ix;
    mx = (Math.sin(cyaw) * fwd + Math.cos(cyaw) * str) * spd * dt;
    mz = (Math.cos(cyaw) * fwd - Math.sin(cyaw) * str) * spd * dt;
  } else if (freeTarget) {
    const dx = freeTarget.x - state.x, dz = freeTarget.z - state.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.45) {
      freeTarget = null;
    } else {
      const step = Math.min(len, spd * dt);
      mx = dx / len * step;
      mz = dz / len * step;
    }
  }
  if (mx || mz) {
    let nx = state.x + mx, nz = state.z + mz;
    if (!walkable(nx, nz)) {
      if (walkable(nx, state.z)) nz = state.z;
      else if (walkable(state.x, nz)) nx = state.x;
      else { nx = state.x; nz = state.z; }
    }
    if (nx !== state.x || nz !== state.z) {
      const yaw = Math.atan2(nx - state.x, nz - state.z);
      placeAt(nx, nz, yaw, 'walk', dt);
    } else {
      placeAt(state.x, state.z, state.yaw, 'idle', 0);
    }
  } else if (state.hero) {
    placeAt(state.x, state.z, state.yaw, 'idle', 0);
  }
}


function startPath(pts, then) {
  state.path = (pts || []).map((p) => ({ x: p.x, z: p.z }));
  if (state.path.length < 2) state.path = [{ x: state.x, z: state.z }, { x: state.x, z: state.z }];
  state.pi = 0; state.dist = 0;
  state.mode = 'walk';
  state.speed = 6.2;
  state._after = then;
  holdFollow(true);
  hidePop();
  setHouseCardHidden(true);
}

function choose(key) {
  if (key === 'free') { startFree(); return; }
  const from = { x: state.x, z: state.z };
  const pts = routeToPlace(from, key);
  if (!pts) return;
  state.place = key;
  startPath(pts, () => {
    state.mode = 'arrived';
    state.phase = 0;
    holdFollow(true);
    showArrived(key);
  });
}
function goHome() {
  if (!state.home) return;
  const pts = waypoints({ x: state.x, z: state.z }, state.home);
  state.place = null;
  startPath(pts, () => {
    state.mode = 'choose';
    placeAt(state.home.x, state.home.z, state.home.facing, 'idle', 0);
    holdFollow(true);
    showChoose();
  });
}

function advance(dt) {
  const path = state.path;
  if (!path || path.length < 2) return true;
  let left = state.speed * state.timeScale * dt;
  while (left > 0 && state.pi < path.length - 1) {
    const A = path[state.pi], B = path[state.pi + 1];
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz) || 0.0001;
    const remain = len - state.dist;
    if (left < remain) {
      state.dist += left;
      const t = state.dist / len;
      const x = A.x + dx * t, z = A.z + dz * t;
      const yaw = Math.atan2(dx, dz);
      placeAt(x, z, yaw, 'walk', dt);
      left = 0;
    } else {
      left -= remain;
      state.pi += 1;
      state.dist = 0;
      const yaw = Math.atan2(dx, dz);
      placeAt(B.x, B.z, yaw, 'walk', dt);
    }
  }
  return state.pi >= path.length - 1 && left >= 0;
}

/* ---- third-person camera: locked behind the back, or free orbit ---- */
let followYaw = 0;
let followSettled = false;
let _lastFollowX = null, _lastFollowZ = null;
const _wantP = new THREE.Vector3();
const _wantT = new THREE.Vector3();
let _savedTouches = null, _savedMouse = null;

function wrapPi(d) {
  return Math.atan2(Math.sin(d), Math.cos(d));
}
function orbitMaps() {
  const MOUSE = THREE.MOUSE || { ROTATE: 0, DOLLY: 1, PAN: 2 };
  const TOUCH = THREE.TOUCH || { ROTATE: 0, PAN: 1, DOLLY_PAN: 2, DOLLY_ROTATE: 3 };
  return { MOUSE, TOUCH };
}
function applyLockedControls() {
  const a = app();
  const ctl = a && a.controls;
  if (!ctl) return;
  ctl.enabled = false;
  ctl.enableDamping = false;
  if (ctl._sphericalDelta && ctl._sphericalDelta.set) ctl._sphericalDelta.set(0, 0, 0);
  if (ctl._panOffset && ctl._panOffset.set) ctl._panOffset.set(0, 0, 0);
}
function applyFreeCamControls() {
  const a = app();
  const ctl = a && a.controls;
  if (!ctl) return;
  const { MOUSE, TOUCH } = orbitMaps();
  if (!_savedTouches) {
    _savedTouches = Object.assign({}, ctl.touches);
    _savedMouse = Object.assign({}, ctl.mouseButtons);
  }
  ctl.enabled = true;
  ctl.enableDamping = true;
  ctl.dampingFactor = 0.12;
  ctl.enableRotate = true;
  ctl.enablePan = true;
  ctl.enableZoom = true;
  ctl.minDistance = 2.2;
  ctl.maxDistance = 48;
  ctl.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  ctl.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
}
function restoreOrbitDefaults() {
  const a = app();
  const ctl = a && a.controls;
  if (!ctl) return;
  const { MOUSE, TOUCH } = orbitMaps();
  ctl.touches = _savedTouches || { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
  ctl.mouseButtons = _savedMouse || { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
  ctl.minDistance = 6;
  ctl.maxDistance = 12000;
  ctl.enableDamping = true;
  ctl.dampingFactor = 0.08;
  ctl.enabled = true;
}
function toggleCamFree() {
  if (!state.follow || state.mode === 'idle' || isRecord()) return;
  state.camFree = !state.camFree;
  followSettled = false;
  _lastFollowX = state.x;
  _lastFollowZ = state.z;
  if (state.camFree) applyFreeCamControls();
  else {
    applyLockedControls();
    followYaw = state.yaw || 0;
  }
  syncCamBtn();
}
function ensureCamUI() {
  let btn = document.getElementById('walkerCamBtn');
  if (btn) return btn;
  if (!document.getElementById('walkerCamStyle')) {
    const style = document.createElement('style');
    style.id = 'walkerCamStyle';
    style.textContent = `
      #walkerCamBtn {
        position: fixed; z-index: 87; pointer-events: auto;
        left: max(14px, env(safe-area-inset-left, 0px));
        top: calc(var(--safe-top, 10px) + 70px);
        border: 1px solid var(--line, rgba(232,196,90,0.38));
        background: var(--btn, rgba(18,16,12,0.78));
        color: var(--text, #fff6df);
        font-weight: 800; font-family: Cairo, "Noto Naskh Arabic", Tahoma, sans-serif;
        font-size: 14px; line-height: 1;
        border-radius: 999px; height: 44px; padding: 0 14px;
        cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
      }
      #walkerCamBtn[hidden] { display: none !important; }
      #walkerCamBtn[aria-pressed="true"] {
        background: linear-gradient(180deg, #f0d36a, #d4a84a); color: #2a1f0a; border-color: transparent;
      }
    `;
    document.head.appendChild(style);
  }
  btn = document.createElement('button');
  btn.id = 'walkerCamBtn';
  btn.type = 'button';
  btn.hidden = true;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCamFree();
  });
  document.body.appendChild(btn);
  return btn;
}
function syncCamBtn() {
  if (typeof document === 'undefined') return;
  const btn = ensureCamUI();
  const show = !!state.follow && state.mode !== 'idle' && !isRecord();
  btn.hidden = !show;
  const free = !!state.camFree;
  btn.textContent = free ? '🎥 ورا الضهر' : '🎥 كاميرا حرة';
  btn.setAttribute('aria-pressed', free ? 'true' : 'false');
}

function followCamera(dt) {
  if (!state.follow) return;
  const a = app();
  if (!a || !a.camera || !a.controls) return;
  const cam = a.camera, ctl = a.controls;
  window.__walkerFollow = true;
  const dtC = Math.min(0.05, Math.max(0, dt || 0.016)) || 0.016;

  if (state.camFree) {
    if (_lastFollowX != null) {
      cam.position.x += state.x - _lastFollowX;
      cam.position.z += state.z - _lastFollowZ;
    }
    ctl.target.set(state.x, gy(state.x, state.z) + 1.25, state.z);
    _lastFollowX = state.x;
    _lastFollowZ = state.z;
    return;
  }

  applyLockedControls();
  const targetYaw = state.yaw || 0;
  followYaw += wrapPi(targetYaw - followYaw) * (1 - Math.exp(-dtC * 7));
  const fx = Math.sin(followYaw), fz = Math.cos(followYaw);
  const x = state.x, z = state.z, y = gy(x, z);
  // Straight behind the back, a little above the head, looking forward.
  const back = 5.6, height = 2.55, ahead = 3.4;
  _wantP.set(x - fx * back, y + height, z - fz * back);
  _wantT.set(x + fx * ahead, y + 1.2, z + fz * ahead);

  const dist = Math.hypot(cam.position.x - _wantP.x, cam.position.y - _wantP.y, cam.position.z - _wantP.z);
  if (dist < 0.08) followSettled = true;
  else if (dist > 2.8) followSettled = false;
  if (followSettled) {
    cam.position.copy(_wantP);
  } else {
    const posK = 1 - Math.exp(-dtC * (dist > 25 ? 2.4 : 5.5));
    cam.position.lerp(_wantP, posK);
  }
  ctl.target.copy(_wantT);
  cam.lookAt(_wantT);
  _lastFollowX = x;
  _lastFollowZ = z;
}

function tick(dt) {
  if (state.mode === 'idle') return;
  if (state.mode === 'free') {
    tickFree(dt);
  } else if (state.mode === 'exit' || state.mode === 'walk') {
    const done = advance(dt);
    if (done) {
      if (state.mode === 'exit') {
        if (state._wantFree) { state._wantFree = false; startFree(); }
        else {
          state.mode = 'choose';
          placeAt(state.x, state.z, state.yaw, 'idle', 0);
          holdFollow(true);
          showChoose();
        }
      } else if (state._after) {
        const fn = state._after;
        state._after = null;
        fn();
      }
    }
  } else if (state.hero) {
    const cam = app() && app().camera;
    state.hero.applyPose({
      x: state.x, y: gy(state.x, state.z), z: state.z, yaw: state.yaw,
      phase: state.phase, mode: 'idle', time: performance.now() / 1000,
      camera: cam,
    });
  }
  if (state.follow && (state.mode === 'walk' || state.mode === 'exit' || state.mode === 'choose' || state.mode === 'arrived' || state.mode === 'free')) {
    followCamera(dt);
  }
}

function startFromHouse(info) {
  if (!info) return;
  const id = info.id || info.num;
  if (state.startedFor === id && state.mode !== 'idle' && (performance.now() - (state._t0 || 0) < 800)) return;
  state._t0 = performance.now();
  beginExit(info);
}

function inferHouseFromResident(r) {
  if (!r) return null;
  const a = app();
  const x = r.x, z = r.z;
  let door = { x, z }, roadPoint = null, facing = 0;
  const g = (window.cityRoads && window.cityRoads.graph) || fallbackGraph();
  if (g && g.nearestOnRoad) {
    const road = g.nearestOnRoad(x, z);
    if (road && road.dist > 0.5) {
      const dx = (road.x - x) / road.dist, dz = (road.z - z) / road.dist;
      const dd = Math.min(road.dist - 1.2, 3.6);
      door = { x: x + dx * dd, z: z + dz * dd };
      roadPoint = { x: road.x, z: road.z };
      facing = Math.atan2(dx, dz);
    }
  }
  const name = r.label || r.name || ('بيت ' + r.id);
  return { id: r.id, num: r.id, name, position: { x, y: gy(x, z), z }, door: { x: door.x, y: gy(door.x, door.z), z: door.z }, roadPoint: roadPoint && { x: roadPoint.x, y: gy(roadPoint.x, roadPoint.z), z: roadPoint.z }, facing, resident: r };
}

function waitReady(fn) {
  if (window.__ready && window.MonacoApp) { fn(); return; }
  const t0 = performance.now();
  const id = setInterval(() => {
    if ((window.__ready && window.MonacoApp) || performance.now() - t0 > 60000) {
      clearInterval(id);
      if (window.MonacoApp) fn();
    }
  }, 80);
}

function hookSearchFallback() {
  const form = document.getElementById('searchForm');
  if (!form || form.__walkerHooked) return;
  form.__walkerHooked = true;
  form.addEventListener('submit', () => {
    setTimeout(() => {
      if (window.lastHouseFound) return;
      const q = (document.getElementById('search') || {}).value || '';
      const a = app();
      if (!a || !a.getResidents) return;
      const s = String(q).trim().toLowerCase();
      const r = a.getResidents().find((x) => String(x.id) === s || String(x.name || '').toLowerCase().includes(s) || String(x.label || '').toLowerCase().includes(s));
      if (r) startFromHouse(inferHouseFromResident(r));
    }, 2000);
  });
}

function applyDeepLink() {
  if (isRecord()) return;
  const params = new URLSearchParams(location.search);
  const h = params.get('house');
  const n = params.get('name');
  const walk = (params.get('walk') || '').toLowerCase();
  if (!h && !n && walk !== 'free') return;
  const a = app();
  if (!a) return;
  let r = null;
  const rs = a.getResidents ? a.getResidents() : [];
  if (h) r = rs.find((x) => String(x.id) === String(h).trim()) || null;
  if (!r && n && a.search) {
    a.search(n);
    r = rs.find((x) => String(x.name || '').toLowerCase().includes(String(n).toLowerCase()));
  }
  if (!r && walk === 'free' && rs.length) r = rs.find((x) => String(x.id) === '1') || rs[0];
  if (r) {
    if (a.search) a.search(String(r.id));
    const delay = window.cityPlaces ? 400 : 2000;
    setTimeout(() => {
      if (state.mode !== 'idle' && state.startedFor === r.id) return;
      if (walk === 'free') state._wantFree = true;
      startFromHouse(window.lastHouseFound || inferHouseFromResident(r));
    }, delay);
  }
}

function boot() {
  if (isRecord()) return;
  const a = app();
  if (!a) return;
  hookOncePerFrame(a.renderer, (dt) => {
    tick(dt);
    if (window.__cityLife && window.__cityLife._manual) window.__cityLife.tick(dt, performance.now() / 1000, a.camera);
  });
  try { startCityLife(a); } catch (e) { console.warn('cityLife', e); }
  hookSearchFallback();
  const prev = window.onHouseFound;
  window.onHouseFound = (house) => {
    if (typeof prev === 'function') try { prev(house); } catch (e) { /* */ }
    startFromHouse(house);
  };
  window.addEventListener('housefound', (e) => startFromHouse(e.detail));
  applyDeepLink();
}

window.Walker = {
  start: startFromHouse,
  choose,
  goHome,
  startFree,
  stopFree,
  setInput: (x, y) => { freeStick.x = x || 0; freeStick.y = y || 0; freeStick.on = !!(x || y); freeTarget = null; },
  setTarget: (x, z) => { freeTarget = { x, z }; freeStick.on = false; },
  stepFree: (dt) => {
    if (state.mode !== 'free') return;
    tickFree(dt || 0.016, true);
    if (state.follow) followCamera(dt || 0.016);
  },
  setTimeScale: (n) => { state.timeScale = Math.max(0, Number(n) || 0); },
  setCamFree: (on) => { state.camFree = on === true; if (state.camFree) applyFreeCamControls(); else { applyLockedControls(); followSettled = false; } syncCamBtn(); },
  getState: () => ({
    mode: state.mode, x: state.x, z: state.z, yaw: state.yaw,
    follow: state.follow, camFree: state.camFree,
    place: state.place, name: state.info && state.info.name,
    type: state.hero && state.hero.type, path: state.path && state.path.length,
  }),
  getPosition: () => ({ x: state.x, z: state.z, y: gy(state.x, state.z) }),
  showChoose,
};

waitReady(boot);
