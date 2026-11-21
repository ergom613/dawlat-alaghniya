// ~300 instanced dabke dancers + standing crowd, using the 4 approved
// character types (thobe, hijab, hoodie, child). Arms hang down 30–45°
// from vertical so hands meet the neighbour at hip height. Never a T-pose.
import { createPeoplePool, paletteFor, qualityTier } from './people.js';

export const DANCE_RINGS = [
  { r: 6.6, n: 54, speed: 0.16, dir: 1 },
  { r: 10.0, n: 78, speed: 0.13, dir: -1 },
  { r: 13.6, n: 100, speed: 0.11, dir: 1 },
];
export const CROWD_N = 68; // 54+78+100+68 = 300

function scaledRings() {
  const q = qualityTier();
  const k = q === 'low' ? 0.38 : (q === 'high' ? 1 : 0.78);
  return {
    k,
    rings: DANCE_RINGS.map((rg) => ({ ...rg, n: Math.max(8, Math.round(rg.n * k)) })),
    crowdN: Math.max(8, Math.round(CROWD_N * k)),
  };
}

function pickDanceType(i, kind) {
  // Children stand in the outer ring / crowd, not the inner dabke line.
  if (kind === 'crowd') {
    const bag = ['thobe', 'hijab', 'hoodie', 'child', 'hijab', 'thobe', 'hoodie', 'child'];
    return bag[i % bag.length];
  }
  const bag = ['thobe', 'hijab', 'hoodie', 'thobe', 'hijab', 'hoodie', 'thobe', 'hijab'];
  return bag[i % bag.length];
}

export function createDabkeCrowd(plazaX, plazaZ) {
  const { rings, crowdN } = scaledRings();
  const people = [];
  let idx = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const typ = pickDanceType(idx, 'dance');
      people.push({
        kind: 'dance', typ,
        ringR: ring.r, base: (i / ring.n) * Math.PI * 2,
        speed: ring.speed, dir: ring.dir,
        phase: i * 0.37 + ring.r, slot: 0,
      });
      idx++;
    }
  }
  for (let i = 0; i < crowdN; i++) {
    const a = (i / crowdN) * Math.PI * 2 + 0.11;
    const r = 17.4 + (i % 5) * 0.85 + (i % 3) * 0.25;
    const typ = pickDanceType(idx, 'crowd');
    people.push({
      kind: 'crowd', typ,
      ringR: r, base: a, speed: 0, dir: 1,
      phase: i * 0.53, slot: 0,
    });
    idx++;
  }

  const counts = { thobe: 0, hijab: 0, hoodie: 0, child: 0 };
  for (const p of people) counts[p.typ]++;
  const cursors = { thobe: 0, hijab: 0, hoodie: 0, child: 0 };
  const pool = createPeoplePool({ counts, name: 'dabkeCrowd' });
  for (const p of people) {
    const slot = cursors[p.typ]++;
    p.slot = slot;
    pool.setSeed(p.typ, slot, 'dabke-' + p.typ + slot, paletteFor(p.typ, 'dabke-' + p.typ + slot));
  }
  pool.finishColors();
  const group = pool.group;
  group.name = 'dabkeCrowd';

  let frame = 0;
  let lastLod = -1;
  function update(dt, t, camera) {
    const time = t != null ? t : performance.now() / 1000;
    frame++;
    let lod = 0;
    let onScreen = true;
    if (camera) {
      const d = Math.hypot(camera.position.x - plazaX, camera.position.z - plazaZ, camera.position.y - 4);
      if (d > 420) { /* freeze far away */ if (frame % 8 !== 1 && lastLod === 3) return; lod = 3; onScreen = d < 700; }
      else if (d > 200) lod = 2;
      else if (d > 110) lod = 1;
    }
    if (lod >= 2 && frame % (lod === 3 ? 6 : 3) !== 0 && lastLod === lod) return;
    lastLod = lod;
    if (!onScreen) return;
    const dirty = new Set();
    for (const p of people) {
      const dance = p.kind === 'dance';
      const a = p.base + (dance ? time * p.speed * p.dir : 0);
      const x = Math.cos(a) * p.ringR;
      const z = Math.sin(a) * p.ringR;
      const yaw = -a - Math.PI / 2 + (dance ? p.dir * 0.10 : 0);
      const beat = time * 2.13 + p.phase;
      pool.place(p.typ, p.slot, x, 0, z, yaw, dance ? 'dabke' : 'idle', beat, lod, time);
      dirty.add(p.typ);
    }
    for (const typ of dirty) pool.commit(typ);
  }

  return { group, update, count: people.length, pool };
}
