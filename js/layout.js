// Preview-only compact neighbourhood layout (pure, no three.js).
// Houses sit next to each other in tidy blocks of 6×2 lots with narrow streets.
// Display layout only: residents.json keeps its stored x/z for the live site.
// Assignment is deterministic by house id, so every new house appends to the
// first free lot nearest the civic square → the cluster grows block by block.
import { isDryAt } from './plots.js';

export const HOME = { x: 160, z: 65 };          // house #1 (L30), fixed
export const LOT = 10;                           // lot pitch (L3 pad is 6 m)
export const COLS = 6;
export const ROWS = 2;
export const STREET = 8;
export const BLOCK_W = LOT * COLS;               // 60
export const BLOCK_D = LOT * ROWS;               // 20
export const PITCH_X = BLOCK_W + STREET;         // 68
export const PITCH_Z = BLOCK_D + STREET;         // 28
// Civic square = blocks (0,0)+(0,1) merged (60 × 48), centred on house #1.
export const ORIGIN = { x: HOME.x - BLOCK_W / 2, z: HOME.z - (BLOCK_D * 2 + STREET) / 2 };
export const CIVIC = [[0, 0], [0, 1]];

// Landmarks. University sits where the dabke plaza used to be.
export const UNIVERSITY = { x: 216, z: -144, w: 100, d: 80 };
// Dabke / wedding plaza moved to open land west of the city.
export const DABKE = { x: -150, z: 30, size: 68 };
// «مطعم البحر» on the east waterfront promenade (fully on land, deck faces the sea at +x).
export const RESTAURANT = { x: 444, z: -24, w: 56, d: 40 }; // deck edge sits at the waterline (sea starts at x≈476)

const KEEP_OUT = [
  { x: UNIVERSITY.x, z: UNIVERSITY.z, w: UNIVERSITY.w + 24, d: UNIVERSITY.d + 24 },
  { x: DABKE.x, z: DABKE.z, w: DABKE.size + 40, d: DABKE.size + 40 },
  { x: RESTAURANT.x, z: RESTAURANT.z, w: RESTAURANT.w + 24, d: RESTAURANT.d + 24 },
];

export function keepOutRects() {
  return KEEP_OUT.map((r) => ({ ...r }));
}

function inRect(x, z, r, pad = 0) {
  return Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;
}

export function blockOrigin(i, j) {
  return { x: ORIGIN.x + i * PITCH_X, z: ORIGIN.z + j * PITCH_Z };
}

export function isCivic(i, j) {
  return CIVIC.some(([a, b]) => a === i && b === j);
}

export function lotsForLevel(level) {
  const L = level | 0;
  if (L >= 20) return { w: 3, h: 2 };
  if (L >= 8) return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

let _blockCache = null;
let _blockData = null;

// All candidate blocks (with dry-lot masks), nearest to the civic square first.
export function candidateBlocks(data) {
  if (_blockCache && _blockData === data) return _blockCache;
  const out = [];
  for (let i = -9; i <= 9; i++) {
    for (let j = -12; j <= 12; j++) {
      if (isCivic(i, j)) continue;
      const o = blockOrigin(i, j);
      const cx = o.x + BLOCK_W / 2, cz = o.z + BLOCK_D / 2;
      const d2 = ((cx - HOME.x) * 1.0) ** 2 + ((cz - HOME.z) * 1.25) ** 2;
      if (d2 > 900 ** 2) continue;
      const dry = [];
      let nDry = 0;
      for (let c = 0; c < COLS; c++) {
        dry[c] = [];
        for (let r = 0; r < ROWS; r++) {
          const x = o.x + (c + 0.5) * LOT, z = o.z + (r + 0.5) * LOT;
          let ok = isDryAt(data, x, z, 6);
          if (ok) for (const k of KEEP_OUT) if (inRect(x, z, k, LOT * 0.5)) { ok = false; break; }
          dry[c][r] = ok;
          if (ok) nDry++;
        }
      }
      if (nDry < COLS * ROWS) continue; // only whole blocks → tidy edges
      // fill from the end nearest house #1
      const reverse = cx < HOME.x;
      out.push({ i, j, o, cx, cz, d2, dry, reverse });
    }
  }
  out.sort((a, b) => a.d2 - b.d2 || a.i - b.i || a.j - b.j);
  _blockCache = out;
  _blockData = data;
  return out;
}

function tryPlace(block, occ, need) {
  for (let s = 0; s + need.w <= COLS; s++) {
    const c0 = block.reverse ? COLS - need.w - s : s;
    for (let r0 = 0; r0 + need.h <= ROWS; r0++) {
      let ok = true;
      for (let c = c0; c < c0 + need.w && ok; c++) {
        for (let r = r0; r < r0 + need.h; r++) {
          if (!block.dry[c][r] || occ[c * ROWS + r]) { ok = false; break; }
        }
      }
      if (ok) return { c: c0, r: r0 };
    }
  }
  return null;
}

// Lay out residents in id order. Returns per-id placement + used blocks.
export function compactLayout(residents, data) {
  const blocks = candidateBlocks(data);
  const occ = blocks.map(() => new Uint8Array(COLS * ROWS));
  const used = new Set();
  const place = new Map();
  const list = (residents || []).filter((r) => r && !(r.id === 1 || r.owner));
  list.sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const r of list) {
    const need = lotsForLevel(r.level || 3);
    let done = false;
    for (let b = 0; b < blocks.length && !done; b++) {
      const at = tryPlace(blocks[b], occ[b], need);
      if (!at) continue;
      for (let c = at.c; c < at.c + need.w; c++) {
        for (let rr = at.r; rr < at.r + need.h; rr++) occ[b][c * ROWS + rr] = 1;
      }
      const bl = blocks[b];
      place.set(r.id, {
        x: bl.o.x + (at.c + need.w / 2) * LOT,
        z: bl.o.z + (at.r + need.h / 2) * LOT,
        block: { i: bl.i, j: bl.j, c: at.c, r: at.r, w: need.w, h: need.h },
      });
      used.add(b);
      done = true;
    }
  }
  const usedBlocks = [...used].sort((a, b) => a - b).map((b) => blocks[b]);
  return { place, usedBlocks, blocks, occ };
}

// Where the next new house (default L3) would go in the compact pattern.
export function nextCompactLot(residents, data, level = 3) {
  const maxId = (residents || []).reduce((m, r) => Math.max(m, (r && r.id) || 0), 0);
  const probe = { id: maxId + 1, level };
  const lay = compactLayout([...(residents || []), probe], data);
  const p = lay.place.get(probe.id);
  return p ? { x: p.x, z: p.z, kind: 'block', block: p.block } : null;
}
