// Hero walker: when someone finds their house, their character steps out of
// the door, asks «وين بدك تروح؟», then walks the roads to the mosque, the
// wedding plaza, or the restaurant, with a follow camera.
import * as THREE from 'three';
import { UNIVERSITY, DABKE, RESTAURANT, SOUQ } from './layout.js';
import { buildRoadGraph } from './roads.js';
import { createHeroPerson, pickType, hookOncePerFrame } from './people.js';
import { startCityLife } from './cityLife.js';

const ARRIVED = {
  mosque: 'وصلت عالجامع 🌹',
  wedding: 'وصلت عالعرس 🌹',
  restaurant: 'وصلت عالمطعم 🌹',
};
const PLACE_BTNS = [
  { key: 'mosque', label: '🕌 الجامع' },
  { key: 'wedding', label: '💃 العرس' },
  { key: 'restaurant', label: '🍽️ المطعم' },
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
    PLACE_BTNS.map((b) => `<button type="button" data-place="${b.key}">${b.label}</button>`).join('')
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
  place: null,
  startedFor: null,
};
function holdFollow(on) {
  state.follow = on !== false;
  const a = app();
  if (a && a.controls) {
    if (state.follow) a.controls.enabled = false;
    else a.controls.enabled = true;
  }
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

function followCamera(dt) {
  if (!state.follow) return;
  const a = app();
  if (!a || !a.camera || !a.controls) return;
  const cam = a.camera, ctl = a.controls;
  const yaw = state.yaw || 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const x = state.x, z = state.z, y = gy(x, z);
  const back = 5.4, height = 2.7, ahead = 1.4, side = 1.6;
  const sx = Math.cos(yaw), sz = -Math.sin(yaw);
  const wantP = new THREE.Vector3(x - fx * back + sx * side, y + height, z - fz * back + sz * side);
  const wantT = new THREE.Vector3(x + fx * ahead, y + 1.15, z + fz * ahead);
  const k = 1 - Math.pow(0.001, Math.max(dt, 0.001) * 12);
  cam.position.lerp(wantP, k);
  ctl.target.lerp(wantT, k);
  ctl.update();
}

function tick(dt) {
  if (state.mode === 'idle') return;
  if (state.mode === 'exit' || state.mode === 'walk') {
    const done = advance(dt);
    if (done) {
      if (state.mode === 'exit') {
        state.mode = 'choose';
        placeAt(state.x, state.z, state.yaw, 'idle', 0);
        holdFollow(true);
        showChoose();
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
  if (state.follow && (state.mode === 'walk' || state.mode === 'exit' || state.mode === 'choose' || state.mode === 'arrived')) {
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
  if (!h && !n) return;
  const a = app();
  if (!a) return;
  let r = null;
  const rs = a.getResidents ? a.getResidents() : [];
  if (h) r = rs.find((x) => String(x.id) === String(h).trim()) || null;
  if (!r && n && a.search) {
    a.search(n);
    r = rs.find((x) => String(x.name || '').toLowerCase().includes(String(n).toLowerCase()));
  }
  if (r) {
    if (a.search) a.search(String(r.id));
    const delay = window.cityPlaces ? 400 : 2000;
    setTimeout(() => {
      if (state.mode !== 'idle' && state.startedFor === r.id) return;
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
  setTimeScale: (n) => { state.timeScale = Math.max(0.1, Number(n) || 1); },
  getState: () => ({
    mode: state.mode, x: state.x, z: state.z, yaw: state.yaw,
    place: state.place, name: state.info && state.info.name,
    type: state.hero && state.hero.type, path: state.path && state.path.length,
  }),
  getPosition: () => ({ x: state.x, z: state.z, y: gy(state.x, state.z) }),
  showChoose,
};

waitReady(boot);
