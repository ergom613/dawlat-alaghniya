// Ambient life on the preview: children running near the wedding, people
// walking the roads between houses, and a loop of guests entering / leaving
// the wedding plaza. Uses the 4 character types and the road graph.
import * as THREE from 'three';
import { DABKE, UNIVERSITY, RESTAURANT, SOUQ } from './layout.js';
import { buildRoadGraph } from './roads.js';
import { createPeoplePool, paletteFor, qualityTier, updateFrustum, inFrustum, hookOncePerFrame } from './people.js';

const ENTRANCE = { x: DABKE.x + DABKE.size / 2 + 1, z: DABKE.z };
const WATCH = { x: DABKE.x + 20, z: DABKE.z };

function gy(fn, x, z) {
  return typeof fn === 'function' ? fn(x, z) : 2.6;
}

function countsForQuality() {
  const q = qualityTier();
  if (q === 'low') return { street: 10, kids: 4, guests: 6 };
  if (q === 'high') return { street: 36, kids: 12, guests: 16 };
  return { street: 22, kids: 8, guests: 10 };
}

function defaultGraph(app) {
  const segs = [];
  const bs = app && app.blockStreets;
  if (bs) segs.push(...(bs.segs || []), ...(bs.access || []));
  if (!segs.length) {
    // last-ditch connectors so walkers still move if streets aren't ready
    segs.push(
      { x1: 160, z1: 65, x2: UNIVERSITY.x, z2: UNIVERSITY.z + UNIVERSITY.d / 2 + 1 },
      { x1: 160, z1: 65, x2: ENTRANCE.x, z2: ENTRANCE.z },
      { x1: 160, z1: 65, x2: RESTAURANT.x - RESTAURANT.w / 2 - 1, z2: RESTAURANT.z },
      { x1: DABKE.x - DABKE.size / 2 - 1, z1: DABKE.z, x2: SOUQ.x + SOUQ.w / 2 + 1, z2: SOUQ.z },
    );
  }
  return buildRoadGraph(segs);
}

function graph() {
  if (window.cityRoads && window.cityRoads.graph) return window.cityRoads.graph;
  return null;
}

function onRoad(p, g) {
  const gg = (window.cityRoads && window.cityRoads.graph) || g;
  if (gg && gg.nearestOnRoad) {
    const n = gg.nearestOnRoad(p.x, p.z);
    if (n) return { x: n.x, z: n.z };
  }
  return { x: p.x, z: p.z };
}

function route(from, to, g) {
  const A = onRoad(from, g), B = onRoad(to, g);
  if (window.cityRoads && window.cityRoads.waypoints) {
    const pts = window.cityRoads.waypoints(A, B);
    if (pts && pts.length >= 2) return pts.map((p) => ({ x: p.x, z: p.z }));
  }
  if (g && g.waypoints) return g.waypoints(A, B);
  return [{ x: A.x, z: A.z }, { x: B.x, z: A.z }, { x: B.x, z: B.z }];
}

function landmarks() {
  const places = window.cityPlaces || {};
  const list = [];
  const add = (p, fallback) => {
    const e = (p && (p.entrance || p.position)) || fallback;
    if (e) list.push({ x: e.x, z: e.z });
  };
  add(places.mosque, { x: UNIVERSITY.x, z: UNIVERSITY.z + UNIVERSITY.d / 2 + 1 });
  add(places.wedding, ENTRANCE);
  add(places.restaurant, { x: RESTAURANT.x - RESTAURANT.w / 2 - 1, z: RESTAURANT.z });
  add(places.souq, { x: SOUQ.x + SOUQ.w / 2 + 1, z: SOUQ.z });
  list.push({ x: SOUQ.x + SOUQ.w / 2 + 1, z: SOUQ.z });
  list.push(ENTRANCE);
  return list;
}

function housePoints(app) {
  const out = [];
  const rs = (app && app.getResidents && app.getResidents()) || [];
  const step = Math.max(1, Math.floor(rs.length / 40));
  for (let i = 0; i < rs.length; i += step) {
    const r = rs[i];
    if (r && Number.isFinite(r.x) && Number.isFinite(r.z)) out.push({ x: r.x, z: r.z });
  }
  if (!out.length) out.push({ x: 160, z: 65 });
  return out;
}

function pick(arr, i) { return arr[(i >>> 0) % arr.length]; }

export function createCityLife({ scene, groundY, camera, renderer, app }) {
  const n = countsForQuality();
  const g0 = defaultGraph(app);
  const houses = housePoints(app);
  const marks = landmarks();
  const spots = houses.concat(marks);

  const actors = [];
  const counts = { thobe: 0, hijab: 0, hoodie: 0, child: 0 };

  function addActor(kind, typ, extra) {
    counts[typ]++;
    actors.push({ kind, typ, slot: 0, phase: Math.random() * Math.PI * 2, ...extra });
  }

  for (let i = 0; i < n.street; i++) {
    const typ = (['thobe', 'hijab', 'hoodie', 'thobe', 'hijab', 'hoodie'])[i % 6];
    const a = pick(spots, i * 3);
    const b = pick(spots, i * 7 + 5);
    const path = route(a, b, g0);
    addActor('street', typ, {
      path, pi: 0, dist: 0, speed: 1.55 + (i % 5) * 0.18,
      x: path[0].x, z: path[0].z, yaw: 0, mode: 'walk',
    });
  }
  for (let i = 0; i < n.kids; i++) {
    const r = 22 + (i % 5) * 1.6;
    const base = (i / Math.max(1, n.kids)) * Math.PI * 2;
    addActor('kid', 'child', {
      play: i % 3, // 0 circle, 1 figure-8, 2 dash
      r, base, speed: 2.6 + (i % 4) * 0.35,
      x: DABKE.x + Math.cos(base) * r, z: DABKE.z + Math.sin(base) * r,
      yaw: 0, mode: 'run', pause: 0,
    });
  }
  for (let i = 0; i < n.guests; i++) {
    const typ = (['thobe', 'hijab', 'hoodie', 'hijab', 'thobe'])[i % 5];
    const goingIn = i % 2 === 0;
    const start = goingIn ? { x: ENTRANCE.x + 8 + (i % 4) * 3, z: ENTRANCE.z + (i % 3 - 1) * 3 } : { x: WATCH.x, z: WATCH.z + (i % 5 - 2) * 1.4 };
    const path = goingIn
      ? route(start, WATCH, g0).concat([WATCH])
      : route(WATCH, { x: ENTRANCE.x + 14, z: ENTRANCE.z }, g0);
    addActor('guest', typ, {
      path, pi: 0, dist: 0, speed: 1.35 + (i % 4) * 0.12,
      x: path[0].x, z: path[0].z, yaw: 0, mode: goingIn ? 'walk' : 'idle',
      hold: goingIn ? 0 : 1 + (i % 5) * 0.7, inward: goingIn,
    });
  }

  const cursors = { thobe: 0, hijab: 0, hoodie: 0, child: 0 };
  const pool = createPeoplePool({ counts, name: 'cityLife' });
  for (const a of actors) {
    a.slot = cursors[a.typ]++;
    pool.setSeed(a.typ, a.slot, a.kind + a.slot + a.typ);
  }
  pool.finishColors();
  scene.add(pool.group);

  function advancePath(a, dt) {
    if (!a.path || a.path.length < 2) return;
    let left = a.speed * dt;
    while (left > 0 && a.pi < a.path.length - 1) {
      const A = a.path[a.pi], B = a.path[a.pi + 1];
      const dx = B.x - A.x, dz = B.z - A.z;
      const len = Math.hypot(dx, dz) || 0.0001;
      const remain = len - (a.dist || 0);
      if (left < remain) {
        a.dist = (a.dist || 0) + left;
        const t = a.dist / len;
        a.x = A.x + dx * t; a.z = A.z + dz * t;
        a.yaw = Math.atan2(dx, dz);
        left = 0;
      } else {
        left -= remain;
        a.pi += 1;
        a.dist = 0;
        a.x = B.x; a.z = B.z;
        a.yaw = Math.atan2(dx, dz);
      }
    }
    return a.pi >= a.path.length - 1 && left >= 0;
  }

  function retargetStreet(a, i) {
    const to = pick(spots, (i * 13 + Math.floor(performance.now() / 1000)) >>> 0);
    a.path = route({ x: a.x, z: a.z }, to, graph() || g0);
    a.pi = 0; a.dist = 0; a.mode = 'walk';
  }

  function tickKids(a, time, dt) {
    if (a.pause > 0) {
      a.pause -= dt;
      a.mode = 'idle';
      return;
    }
    a.mode = 'run';
    let x, z, tx, tz;
    if (a.play === 0) {
      const ang = a.base + time * (0.55 + a.speed * 0.08);
      x = DABKE.x + Math.cos(ang) * a.r;
      z = DABKE.z + Math.sin(ang) * a.r;
      tx = DABKE.x + Math.cos(ang + 0.2) * a.r;
      tz = DABKE.z + Math.sin(ang + 0.2) * a.r;
    } else if (a.play === 1) {
      const t = time * 0.7 + a.base;
      x = DABKE.x + Math.sin(t) * 26;
      z = DABKE.z + Math.sin(2 * t) * 12 + 22;
      tx = DABKE.x + Math.sin(t + 0.15) * 26;
      tz = DABKE.z + Math.sin(2 * (t + 0.15)) * 12 + 22;
    } else {
      const t = time * a.speed * 0.25 + a.base;
      const burst = (Math.sin(t * 2) * 0.5 + 0.5);
      const ang = a.base + Math.sin(t) * 1.8;
      const rr = 20 + burst * 12;
      x = DABKE.x + Math.cos(ang) * rr;
      z = DABKE.z + 24 + Math.sin(ang * 1.3) * 10;
      tx = DABKE.x + Math.cos(ang + 0.2) * rr;
      tz = DABKE.z + 24 + Math.sin((ang + 0.2) * 1.3) * 10;
      if (burst < 0.08 && Math.random() < 0.02) a.pause = 0.6 + Math.random() * 0.8;
    }
    a.yaw = Math.atan2(tx - x, tz - z);
    a.x = x; a.z = z;
  }

  function tickGuest(a, dt) {
    if (a.hold > 0) {
      a.hold -= dt;
      a.mode = 'idle';
      if (a.hold <= 0) {
        a.inward = !a.inward;
        const dest = a.inward ? WATCH : { x: ENTRANCE.x + 16 + Math.random() * 8, z: ENTRANCE.z + (Math.random() - 0.5) * 10 };
        const start = { x: a.x, z: a.z };
        a.path = a.inward ? route(start, WATCH, graph() || g0) : route(start, dest, graph() || g0);
        if (a.inward && a.path[a.path.length - 1]) {
          const last = a.path[a.path.length - 1];
          if (Math.hypot(last.x - WATCH.x, last.z - WATCH.z) > 1) a.path.push(WATCH);
        }
        a.pi = 0; a.dist = 0; a.mode = 'walk';
      }
      return;
    }
    a.mode = 'walk';
    const done = advancePath(a, dt);
    if (done) a.hold = a.inward ? 2.5 + Math.random() * 4 : 0.4 + Math.random() * 0.8;
  }

  let frame = 0;
  function tick(dt, time, cam) {
    frame++;
    const q = qualityTier();
    updateFrustum(cam || camera);
    const cx = (cam || camera).position.x, cz = (cam || camera).position.z;
    const dirty = new Set();
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      const dx = a.x - cx, dz = a.z - cz;
      const dist = Math.hypot(dx, dz, ((cam || camera).position.y - 4));
      if (dist > 420) {
        if (frame % 8 !== i % 8) continue;
      }
      const visible = dist < 90 || inFrustum(a.x, gy(groundY, a.x, a.z) + 1, a.z, 2.4);
      if (!visible && dist > 80) {
        // freeze off-screen, still advance slowly so they don't bunch
        if (frame % 4 !== i % 4) continue;
      }
      if (a.kind === 'street') {
        const done = advancePath(a, dt);
        if (done) retargetStreet(a, i);
        a.phase += dt * a.speed * 3.2;
        a.mode = 'walk';
      } else if (a.kind === 'kid') {
        tickKids(a, time, dt);
        a.phase += dt * (a.mode === 'run' ? 8 : 2);
      } else {
        tickGuest(a, dt);
        a.phase += dt * (a.mode === 'walk' ? 3.2 * a.speed : 1.4);
      }
      const lod = dist > 160 ? 2 : (dist > 80 ? 1 : 0);
      if (!visible && dist > 80) {
        pool.hideAll(a.typ, a.slot);
      } else {
        const y = gy(groundY, a.x, a.z);
        pool.place(a.typ, a.slot, a.x, y, a.z, a.yaw, a.mode, a.phase, q === 'low' ? Math.max(lod, 1) : lod, time);
      }
      dirty.add(a.typ);
    }
    for (const typ of dirty) pool.commit(typ);
  }

  if (renderer) hookOncePerFrame(renderer, (dt, t, cam) => tick(dt, t, cam || camera));

  return { group: pool.group, tick, count: actors.length, actors };
}

export function startCityLife(app) {
  if (!app || !app.scene || window.__cityLife) return window.__cityLife;
  const life = createCityLife({
    scene: app.scene,
    groundY: app.groundY,
    camera: app.camera,
    renderer: app.renderer,
    app,
  });
  window.__cityLife = life;
  return life;
}
