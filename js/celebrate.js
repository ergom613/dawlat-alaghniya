// Milestone celebrations (L10 / L15 / L20 / L25 / L30):
// a light fireworks + confetti burst and a small floating «🎉 لفل N» badge.
// New crossings play once (tracked in localStorage + resident.celebrated_level
// in memory). Already-reached milestones replay on a slow stagger so the map
// stays festive without firing every house at once.
import * as THREE from 'three';

export const MILESTONES = [10, 15, 20, 25, 30];
const STORAGE_KEY = 'dawlat_alaghniya_celebrated';
const PERIOD = 36; // seconds between quiet replays of the same house
const MAX_SPARKS = 480;
const MAX_CONFETTI = 240;
const MAX_CONCURRENT = 3;

export function highestMilestone(level) {
  const L = Number(level) || 0;
  let m = 0;
  for (const x of MILESTONES) if (L >= x) m = x;
  return m;
}

function loadMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveMap(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* private mode */ }
}

function storedLevel(rec, id) {
  const fromRec = rec && rec.celebrated_level != null ? Number(rec.celebrated_level) || 0 : 0;
  const fromLs = Number(loadMap()[String(id)]) || 0;
  return Math.max(fromRec, fromLs);
}

function writeStored(rec, id, ms) {
  if (rec) rec.celebrated_level = ms;
  const map = loadMap();
  map[String(id)] = ms;
  saveMap(map);
}

function hash01(id) {
  const n = Number(id) || 0;
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pointTexture(soft) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,240,200,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makePoints(max, size, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size,
    map: pointTexture(additive),
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
  pts.renderOrder = 4;
  return { geo, pos, col, mat, pts, vel: new Float32Array(max * 3), life: new Float32Array(max), maxL: new Float32Array(max) };
}

const SPARK_PAL = [0xfff4c2, 0xffd15a, 0xff8a4a, 0xffe8a0, 0xff6b8a, 0x9ae7ff];
const CONFETTI_PAL = [0xe8c45a, 0xff6b8a, 0x7ee0a8, 0x6ec8ff, 0xfff1c8, 0xe89cff];

function pickColor(pal, i, out) {
  const c = pal[(i + (Math.random() * pal.length) | 0) % pal.length];
  out.setHex(c);
  return out;
}

export function createCelebrations({ scene, getHouses, labelLayer }) {
  const group = new THREE.Group();
  group.name = 'celebrations';
  const sparks = makePoints(MAX_SPARKS, 8, true);
  const confetti = makePoints(MAX_CONFETTI, 6, false);
  group.add(sparks.pts, confetti.pts);
  scene.add(group);
  const sparkBase = new Float32Array(MAX_SPARKS * 3);
  const confBase = new Float32Array(MAX_CONFETTI * 3);

  const tmp = new THREE.Color();
  const badges = []; // { item, x, y0, z, t, dur, id }
  const queue = []; // { at, house, kind, milestone }
  const playing = []; // { until, id }
  const lastPlay = new Map();
  let armed = new Set(); // already queued a "new" play this session
  let scanned = false;

  function layer() {
    return typeof labelLayer === 'function' ? labelLayer() : labelLayer;
  }

  function alloc(sys, n, fn) {
    let got = 0;
    for (let i = 0; i < sys.life.length && got < n; i++) {
      if (sys.life[i] > 0) continue;
      fn(i);
      got++;
    }
    return got;
  }

  function burst(x, y, z, kind, scale) {
    const big = kind === 'big';
    const sparkN = big ? 90 : 44;
    const confN = big ? 52 : 24;
    const spd = (big ? 16 : 11) * scale;
    alloc(sparks, sparkN, (i) => {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI * 0.72;
      const s = spd * (0.45 + Math.random() * 0.85);
      sparks.pos[i * 3] = x + (Math.random() - 0.5) * 1.2 * scale;
      sparks.pos[i * 3 + 1] = y + Math.random() * 1.4 * scale;
      sparks.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2 * scale;
      sparks.vel[i * 3] = Math.cos(a) * Math.sin(b) * s;
      sparks.vel[i * 3 + 1] = Math.cos(b) * s * 1.15 + spd * 0.25;
      sparks.vel[i * 3 + 2] = Math.sin(a) * Math.sin(b) * s;
      const life = 1.6 + Math.random() * 0.8;
      sparks.life[i] = life;
      sparks.maxL[i] = life;
      pickColor(SPARK_PAL, i, tmp);
      sparks.col[i * 3] = sparkBase[i * 3] = tmp.r;
      sparks.col[i * 3 + 1] = sparkBase[i * 3 + 1] = tmp.g;
      sparks.col[i * 3 + 2] = sparkBase[i * 3 + 2] = tmp.b;
    });
    alloc(confetti, confN, (i) => {
      const a = Math.random() * Math.PI * 2;
      const s = spd * 0.45 * (0.5 + Math.random());
      confetti.pos[i * 3] = x + (Math.random() - 0.5) * 2 * scale;
      confetti.pos[i * 3 + 1] = y + Math.random() * 2 * scale;
      confetti.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 2 * scale;
      confetti.vel[i * 3] = Math.cos(a) * s;
      confetti.vel[i * 3 + 1] = spd * (0.15 + Math.random() * 0.45);
      confetti.vel[i * 3 + 2] = Math.sin(a) * s;
      const life = 1.3 + Math.random() * 0.8;
      confetti.life[i] = life;
      confetti.maxL[i] = life;
      pickColor(CONFETTI_PAL, i, tmp);
      confetti.col[i * 3] = confBase[i * 3] = tmp.r;
      confetti.col[i * 3 + 1] = confBase[i * 3 + 1] = tmp.g;
      confetti.col[i * 3 + 2] = confBase[i * 3 + 2] = tmp.b;
    });
  }

  function addBadge(house, milestone) {
    const ly = layer();
    if (!ly) return;
    if (badges.some((b) => b.id === house.id && b.t < b.dur)) return;
    const item = ly.add('cele-badge');
    item.set('🎉 لفل ' + milestone, '');
    const y0 = house.y + Math.max(2.2, house.height * 0.04);
    item.setWorld(house.x, y0, house.z);
    item.show(true);
    badges.push({ item, x: house.x, y0, z: house.z, t: 0, dur: 2.6, id: house.id });
  }

  function scaleFor(house) {
    const h = house.height || 8;
    return Math.max(0.7, Math.min(1.7, 0.55 + h / 70));
  }

  function startPlay(house, kind, milestone, now) {
    const scale = scaleFor(house);
    burst(house.x, house.y + 1.2 * scale, house.z, kind, scale);
    // two follow-up shells for the "big" first crossing
    if (kind === 'big') {
      queue.push({ at: now + 0.28, house, kind: 'shell', milestone, shell: true });
      queue.push({ at: now + 0.55, house, kind: 'shell', milestone, shell: true });
    }
    addBadge(house, milestone);
    playing.push({ until: now + 2.8, id: house.id });
    lastPlay.set(house.id, now);
    writeStored(house.rec, house.id, milestone);
  }

  function prunePlaying(now) {
    for (let i = playing.length - 1; i >= 0; i--) {
      if (playing[i].until <= now) playing.splice(i, 1);
    }
  }

  function enqueue(house, kind, milestone, at) {
    if (queue.some((q) => q.house && q.house.id === house.id && !q.shell)) return;
    queue.push({ at, house, kind, milestone });
  }

  function scan(now) {
    const houses = (getHouses && getHouses()) || [];
    for (const h of houses) {
      const ms = highestMilestone(h.level);
      if (!ms) continue;
      const stored = storedLevel(h.rec, h.id);
      if (ms > stored && !armed.has(h.id)) {
        armed.add(h.id);
        enqueue(h, 'big', ms, now + 0.4 + hash01(h.id) * 1.4);
      } else if (ms && stored >= ms) {
        const last = lastPlay.get(h.id);
        if (last == null) {
          // Already recorded from a previous visit: quiet replay, staggered.
          enqueue(h, 'small', ms, now + 6 + hash01(h.id) * 18);
        } else if (now - last >= PERIOD) {
          enqueue(h, 'small', ms, now + hash01(h.id + 9) * 2);
        }
      }
    }
    scanned = true;
  }

  function drain(now) {
    prunePlaying(now);
    queue.sort((a, b) => a.at - b.at);
    for (let i = 0; i < queue.length; ) {
      const q = queue[i];
      if (q.at > now) { i++; continue; }
      if (!q.shell && playing.length >= MAX_CONCURRENT) { i++; continue; }
      queue.splice(i, 1);
      if (q.shell) {
        const s = scaleFor(q.house);
        const jx = (hash01(q.house.id + q.at) - 0.5) * 4 * s;
        const jz = (hash01(q.house.id + q.at * 3) - 0.5) * 4 * s;
        burst(q.house.x + jx, q.house.y + 2 * s, q.house.z + jz, 'small', s);
      } else {
        startPlay(q.house, q.kind, q.milestone, now);
      }
    }
  }

  function stepSystem(sys, dt, gravity, drag) {
    let live = 0;
    const { pos, vel, col, life, maxL } = sys;
    for (let i = 0; i < life.length; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
        continue;
      }
      vel[i * 3] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag - gravity * dt;
      vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const fade = Math.max(0, life[i] / maxL[i]);
      const k = fade * fade;
      // keep hue, dim by fade (already stored as base — re-dim from leftover)
      // simple: multiply toward 0. We stored original; fade each frame from current would stack.
      // Store base in col only at spawn; apply fade into the attribute each frame by writing fade*base.
      // We overwrote col at spawn as base; we'll use a trick: fade from base would need a copy.
      // Approximate: set alpha via colour dim each frame from a rebuilt fade of original is wrong after first dim.
      // Fix: pack fade only visually by writing col = base * fade, so we need base. Use maxL unused high bits? 
      // Simpler: keep col as base and a shader... no. Use the existing col as base and write to a display buffer.
      // I'll dim by writing to the attribute from base stored in col — meaning I shouldn't multiply col in place.
      // I'll leave col as base and use material opacity globally... not per particle.
      // Per-particle: use the 4th... we don't have alpha attr. Multiply a temp into the attribute from a parallel base array.
      live++;
    }
    return live;
  }

  function fadeColors(sys, base) {
    const { col, life, maxL } = sys;
    for (let i = 0; i < life.length; i++) {
      if (life[i] <= 0) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      const f = Math.max(0, life[i] / maxL[i]);
      const k = f * f;
      col[i * 3] = base[i * 3] * k;
      col[i * 3 + 1] = base[i * 3 + 1] * k;
      col[i * 3 + 2] = base[i * 3 + 2] * (0.85 + 0.15 * k);
    }
  }

  function compactDraw(sys) {
    // keep dead at y=-9999; draw all slots (cheap). Or count live.
    let n = 0;
    for (let i = 0; i < sys.life.length; i++) if (sys.life[i] > 0) n = i + 1;
    sys.geo.setDrawRange(0, n);
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  }

  function tick(timeSec, dt, night) {
    const now = timeSec || 0;
    const d = Math.max(0.001, Math.min(0.05, dt || 0.016));
    const hold = (typeof window !== 'undefined' && window.__celeHold);
    if (!hold) {
      if (!scanned || now < 0.05) scan(now);
      else if ((now * 2) % 2 < d * 2) scan(now);
      drain(now);
    }

    stepSystem(sparks, d, 14, 0.985);
    stepSystem(confetti, d, 22, 0.99);
    fadeColors(sparks, sparkBase);
    fadeColors(confetti, confBase);
    compactDraw(sparks);
    compactDraw(confetti);
    const glow = 1 + (night || 0) * 0.7;
    sparks.mat.size = 8 + (night || 0) * 2;
    confetti.mat.size = 6;
    sparks.mat.opacity = 0.95 + (night || 0) * 0.05;
    sparks.pts.visible = sparks.geo.drawRange.count > 0;
    confetti.pts.visible = confetti.geo.drawRange.count > 0;

    for (let i = badges.length - 1; i >= 0; i--) {
      const b = badges[i];
      b.t += d;
      const u = b.t / b.dur;
      if (u >= 1) {
        if (b.item && b.item.remove) b.item.remove();
        badges.splice(i, 1);
        continue;
      }
      const rise = u * 10;
      const fade = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
      if (b.item) {
        b.item.setWorld(b.x, b.y0 + rise, b.z);
        b.item.show(true);
        if (b.item.el) b.item.el.style.opacity = String(Math.max(0, Math.min(1, fade)));
      }
    }
  }

  let lastT = 0;
  const _tick = tick;
  tick = function (timeSec, dt, night) {
    lastT = timeSec || 0;
    return _tick(timeSec, dt, night);
  };

  function preview(now, ids) {
    const t0 = now == null ? lastT : now;
    const houses = (getHouses && getHouses()) || [];
    const want = ids && ids.length ? new Set(ids.map(Number)) : null;
    let delay = 0;
    for (const h of houses) {
      const ms = highestMilestone(h.level);
      if (!ms) continue;
      if (want && !want.has(Number(h.id))) continue;
      armed.add(h.id);
      enqueue(h, 'big', ms, t0 + delay);
      delay += 0.25;
    }
  }

  function previewNow(ids) {
    preview(lastT, ids);
    drain(lastT);
  }

  return {
    group,
    tick,
    preview,
    previewNow,
    highestMilestone,
    MILESTONES,
    resetScan() { scanned = false; armed = new Set(); },
  };
}
