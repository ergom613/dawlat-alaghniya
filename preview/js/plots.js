// Deterministic plot allocation: fill Monaco land first, then expand the island outward.
const STEP = 24;

function pip(x, z, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function inPolys(x, z, polys) {
  for (const rings of polys) {
    if (!rings || !rings[0] || rings[0].length < 3) continue;
    if (pip(x, z, rings[0])) {
      let hole = false;
      for (let h = 1; h < rings.length; h++) {
        if (pip(x, z, rings[h])) { hole = true; break; }
      }
      if (!hole) return true;
    }
  }
  return false;
}


function isDryLand(x, z, land, harb, margin = 0) {
  const pts = [[x, z]];
  if (margin > 0) {
    pts.push([x + margin, z], [x - margin, z], [x, z + margin], [x, z - margin]);
  }
  for (const [px, pz] of pts) {
    if (!inPolys(px, pz, land) || inPolys(px, pz, harb)) return false;
  }
  return true;
}

function harbourPolys(data) {
  const out = [];
  for (const h of data.harbours || []) {
    for (const rings of h.rings || []) out.push(rings);
  }
  return out;
}

export function isDryAt(data, x, z, margin = 8) {
  return isDryLand(x, z, data.land || [], harbourPolys(data), margin);
}

export function monacoBBox(data) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const rings of data.land || []) {
    for (const p of rings[0] || []) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

let _monacoCache = null;

export function monacoPlots(data) {
  if (_monacoCache) return _monacoCache;
  const land = data.land || [];
  const harb = harbourPolys(data);
  const bb = monacoBBox(data);
  const home = data.plot || { x: 160, z: 65 };
  const list = [];
  const x0 = Math.floor(bb.minX / STEP) * STEP;
  const z0 = Math.floor(bb.minZ / STEP) * STEP;
  for (let x = x0; x <= bb.maxX; x += STEP) {
    for (let z = z0; z <= bb.maxZ; z += STEP) {
      if (isDryLand(x, z, land, harb, 8)) {
        const d2 = (x - home.x) ** 2 + (z - home.z) ** 2;
        list.push({ x, z, kind: 'monaco', d2 });
      }
    }
  }
  // Reserve the exact example plot as index 0.
  list.sort((a, b) => a.d2 - b.d2);
  const reserved = { x: home.x, z: home.z, kind: 'monaco', d2: 0 };
  const filtered = list.filter((p) => (p.x - home.x) ** 2 + (p.z - home.z) ** 2 > (STEP * 0.6) ** 2);
  _monacoCache = [reserved, ...filtered];
  return _monacoCache;
}

export function islandRadiusForCount(n) {
  const area = Math.max(1, n) * (STEP * STEP);
  return Math.max(1600, Math.sqrt(area / Math.PI) * 1.18);
}

export function allocatePlots(data, count) {
  // Only existing Monaco land (minus harbours / sea). No houses on water.
  // New landfill / island expansion is postponed.
  const base = monacoPlots(data);
  const n = Math.max(1, count | 0);
  return base.slice(0, Math.min(n, base.length));
}

export function firstNames() {
  return ['aisha', 'yusuf', 'lina', 'karim', 'noor', 'omar', 'sara', 'hana', 'ziad', 'rami', 'noura', 'tariq', 'maya', 'samir', 'leila', 'adnan', 'farah', 'wissam', 'dania', 'bassel', 'reem', 'fadi', 'layla', 'hassan', 'dina', 'nabil', 'laila', 'samir', 'rania', 'tamer'];
}

export function exampleName(i) {
  if (i === 0) return 'mohammad_1';
  const fn = firstNames();
  return `example_${fn[i % fn.length]}_${i}`;
}

export function levelForIndex(i) {
  // More small houses, fewer skyscrapers. Deterministic.
  let h = (Math.imul(i + 1, 2654435761) >>> 0);
  const r = (h % 1000) / 1000;
  if (r < 0.42) return 1 + (h % 9);
  if (r < 0.72) return 10 + (h % 10);
  if (r < 0.9) return 20 + (h % 6);
  return 26 + (h % 5);
}

export const MIN_LEVEL = 3;

// Minimum house level is 3. Formula: max(3, 1 + floor(points/50)), capped at 30.
// Exceptions (applied by the caller / stored data): house #1 stays 30, hnoo_kassar stays at least 10.
export function levelFromPoints(points) {
  const p = Math.max(0, Number(points) || 0);
  return Math.max(MIN_LEVEL, Math.min(30, 1 + Math.floor(p / 50)));
}

export function nextFreePlots(data, occupied, count = 1) {
  const list = monacoPlots(data);
  const occ = (occupied || []).filter((o) => o && o.x != null && o.z != null);
  const taken = new Set(occ.map((o) => o.x + ',' + o.z));
  const minD2 = (STEP * 0.6) ** 2;
  const out = [];
  for (const p of list) {
    if (taken.has(p.x + ',' + p.z)) continue;
    let close = false;
    for (const o of occ) {
      if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < minD2) { close = true; break; }
    }
    if (close) continue;
    out.push({ x: p.x, z: p.z, kind: p.kind || 'monaco' });
    taken.add(p.x + ',' + p.z);
    occ.push({ x: p.x, z: p.z });
    if (out.length >= count) break;
  }
  return out;
}

export function buildResidents(data, fileList, demoCount) {
  const wanted = demoCount > 1 ? demoCount : (fileList && fileList.length ? fileList.length : 1);
  const plots = allocatePlots(data, wanted);
  const n = plots.length;
  const out = new Array(n);
  const placed = [];
  for (let i = 0; i < n; i++) {
    const file = fileList && fileList[i];
    const id = (file && file.id) || (i + 1);
    const anonymous = !!(file && file.anonymous);
    const label = (file && file.label) || (anonymous ? ('بيت رقم ' + id) : '');
    const name = demoCount > 1 ? exampleName(i) : ((file && file.name) || label || ('بيت رقم ' + id));
    const seed = (file && file.seed) || (demoCount > 1 ? name : ('house_' + id));
    let level = file && file.level ? file.level : (demoCount > 1 ? levelForIndex(i) : MIN_LEVEL);
    if (demoCount > 1 && i === 0) level = 30;
    let x, z, kind;
    if (file && file.x != null && file.z != null && demoCount <= 1) {
      x = file.x; z = file.z; kind = 'monaco';
    } else {
      const nxt = nextFreePlots(data, placed, 1)[0] || plots[i] || { x: 160, z: 65, kind: 'monaco' };
      x = nxt.x; z = nxt.z; kind = nxt.kind || 'monaco';
    }
    placed.push({ x, z });
    out[i] = {
      i,
      id,
      name,
      label: label || name,
      seed,
      anonymous: anonymous && demoCount <= 1,
      owner: !!(file && file.owner),
      level: (file && (file.owner || file.id === 1)) ? 30
        : ((file && (file.name === 'hnoo_kassar' || file.seed === 'hnoo_kassar'))
          ? Math.max(10, Math.min(30, level | 0))
          : Math.max(demoCount > 1 ? 1 : MIN_LEVEL, Math.min(30, level | 0))),
      points: (file && file.points != null) ? file.points : undefined,
      x,
      z,
      kind,
      example: demoCount > 1,
    };
    if (out[i].points === undefined) delete out[i].points;
  }
  return { residents: out, plots, monacoCount: monacoPlots(data).length, wanted };
}
