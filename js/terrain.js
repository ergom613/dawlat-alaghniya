// Land/sea mask around Monaco, baked from EU-DEM / Copernicus.
// Elevation is disabled: land is a flat plane at LAND_H (just above the sea
// at y=0). The heightmap is used only to tell land from water and to colour
// urban / park / beach / hinterland classes. Same metric frame as monaco.json
// (+X east, +Z south).
import * as THREE from 'three';

export const LAND_H = 2.6; // flat land height, slightly above the sea at y=0
export const FLAT = true;

const SEA = 0, URBAN = 1, MOUNTAIN = 2, PARK = 3, FOREST = 4, GRASS = 5, BEACH = 6;

let meta = null;
let heights = null; // Float32Array, metres
let classes = null; // Uint8Array

export function isTerrainReady() {
  return !!(meta && heights);
}

function sampleElev(x, z) {
  if (!meta || !heights) return null;
  const { originX, originZ, step, cols, rows } = meta;
  const fx = (x - originX) / step;
  const fz = (z - originZ) / step;
  if (fx < 0 || fz < 0 || fx > cols - 1 || fz > rows - 1) return null;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, cols - 1);
  const z1 = Math.min(z0 + 1, rows - 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const h00 = heights[z0 * cols + x0];
  const h10 = heights[z0 * cols + x1];
  const h01 = heights[z1 * cols + x0];
  const h11 = heights[z1 * cols + x1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

// Flat ground: LAND_H on land, 0 on the sea or outside the grid.
export function getHeight(x, z) {
  if (!meta || !heights) return LAND_H;
  const elev = sampleElev(x, z);
  if (elev == null) return 0;
  return elev > 0.2 ? LAND_H : 0;
}

export async function loadTerrain(jsonPath) {
  const r = await fetch(jsonPath);
  if (!r.ok) throw new Error('Failed to load ' + jsonPath);
  const info = await r.json();
  const binPath = jsonPath.replace(/[^/]+$/, info.bin || 'terrain.bin');
  const br = await fetch(binPath);
  if (!br.ok) throw new Error('Failed to load ' + binPath);
  const buf = await br.arrayBuffer();
  const n = info.cols * info.rows;
  const dm = new Int16Array(buf, 0, n);
  const hs = new Float32Array(n);
  for (let i = 0; i < n; i++) hs[i] = dm[i] * 0.1;
  heights = hs;
  classes = new Uint8Array(buf, n * 2, n);
  meta = info;
  return info;
}

function colorFor(ix, iz, cols, rows, out) {
  const i = iz * cols + ix;
  const cls = classes[i];
  if (cls === URBAN) {
    out.setRGB(0.85, 0.78, 0.65);
  } else if (cls === PARK) {
    out.setRGB(0.42, 0.64, 0.30);
  } else if (cls === FOREST) {
    out.setRGB(0.30, 0.49, 0.23);
  } else if (cls === GRASS) {
    out.setRGB(0.53, 0.72, 0.36);
  } else if (cls === BEACH) {
    out.setRGB(0.91, 0.84, 0.63);
  } else {
    // Flat hinterland: warm Mediterranean earth, no peaks or bare rock.
    out.setRGB(0.76, 0.70, 0.54);
  }
  return out;
}

function buildGridMesh(stride) {
  const { originX, originZ, step, cols, rows } = meta;
  const c2 = Math.floor((cols - 1) / stride) + 1;
  const r2 = Math.floor((rows - 1) / stride) + 1;

  // First pass: which cells have land?
  const landCell = new Uint8Array((c2 - 1) * (r2 - 1));
  let triCount = 0;
  for (let jz = 0; jz < r2 - 1; jz++) {
    for (let jx = 0; jx < c2 - 1; jx++) {
      const i00 = (jz * stride) * cols + (jx * stride);
      const i10 = (jz * stride) * cols + Math.min(cols - 1, (jx + 1) * stride);
      const i01 = Math.min(rows - 1, (jz + 1) * stride) * cols + (jx * stride);
      const i11 = Math.min(rows - 1, (jz + 1) * stride) * cols + Math.min(cols - 1, (jx + 1) * stride);
      if (heights[i00] > 0.2 || heights[i10] > 0.2 || heights[i01] > 0.2 || heights[i11] > 0.2) {
        landCell[jz * (c2 - 1) + jx] = 1;
        triCount += 2;
      }
    }
  }

  // Unique vertices used by land cells (plus skirt)
  const vertIndex = new Int32Array(c2 * r2);
  vertIndex.fill(-1);
  let vCount = 0;
  const mark = (jx, jz) => {
    const k = jz * c2 + jx;
    if (vertIndex[k] < 0) vertIndex[k] = vCount++;
  };
  for (let jz = 0; jz < r2 - 1; jz++) {
    for (let jx = 0; jx < c2 - 1; jx++) {
      if (!landCell[jz * (c2 - 1) + jx]) continue;
      mark(jx, jz); mark(jx + 1, jz); mark(jx, jz + 1); mark(jx + 1, jz + 1);
    }
  }

  // Skirt edges: land cell bordering sea or the grid rim
  let skirtTris = 0;
  const skirts = []; // [ax,az,bx,bz] in j-space
  const consider = (ax, az, bx, bz) => {
    const ia = (Math.min(rows - 1, az * stride)) * cols + Math.min(cols - 1, ax * stride);
    const ib = (Math.min(rows - 1, bz * stride)) * cols + Math.min(cols - 1, bx * stride);
    // rim or neighbour is sea
    skirts.push(ax, az, bx, bz);
    skirtTris += 2;
    mark(ax, az); mark(bx, bz);
  };
  for (let jz = 0; jz < r2 - 1; jz++) {
    for (let jx = 0; jx < c2 - 1; jx++) {
      if (!landCell[jz * (c2 - 1) + jx]) continue;
      // left
      if (jx === 0 || !landCell[jz * (c2 - 1) + (jx - 1)]) consider(jx, jz + 1, jx, jz);
      // right
      if (jx === c2 - 2 || !landCell[jz * (c2 - 1) + (jx + 1)]) consider(jx + 1, jz, jx + 1, jz + 1);
      // top (smaller z / north)
      if (jz === 0 || !landCell[(jz - 1) * (c2 - 1) + jx]) consider(jx, jz, jx + 1, jz);
      // bottom
      if (jz === r2 - 2 || !landCell[(jz + 1) * (c2 - 1) + jx]) consider(jx + 1, jz + 1, jx, jz + 1);
    }
  }

  const skirtV = vCount; // first skirt bottom will be packed after
  // two extra verts per skirt endpoint? we add a bottom vert per unique skirt rim vert
  const bottomIndex = new Int32Array(c2 * r2);
  bottomIndex.fill(-1);
  const markBottom = (jx, jz) => {
    const k = jz * c2 + jx;
    if (bottomIndex[k] < 0) bottomIndex[k] = vCount++;
  };
  for (let s = 0; s < skirts.length; s += 4) {
    markBottom(skirts[s], skirts[s + 1]);
    markBottom(skirts[s + 2], skirts[s + 3]);
  }

  const pos = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const tmp = new THREE.Color();

  const writeVert = (slot, jx, jz, yOverride, colorMul) => {
    const ix = Math.min(cols - 1, jx * stride);
    const iz = Math.min(rows - 1, jz * stride);
    const x = originX + ix * step;
    const z = originZ + iz * step;
    const y = yOverride == null ? LAND_H : yOverride;
    pos[slot * 3] = x;
    pos[slot * 3 + 1] = y;
    pos[slot * 3 + 2] = z;
    colorFor(ix, iz, cols, rows, tmp);
    const m = colorMul == null ? 1 : colorMul;
    col[slot * 3] = tmp.r * m;
    col[slot * 3 + 1] = tmp.g * m;
    col[slot * 3 + 2] = tmp.b * m;
  };

  for (let jz = 0; jz < r2; jz++) {
    for (let jx = 0; jx < c2; jx++) {
      const slot = vertIndex[jz * c2 + jx];
      if (slot >= 0) writeVert(slot, jx, jz, null, 1);
      const bslot = bottomIndex[jz * c2 + jx];
      if (bslot >= 0) writeVert(bslot, jx, jz, -8, 0.45);
    }
  }

  const idx = new Uint32Array((triCount + skirtTris) * 3);
  let t = 0;
  for (let jz = 0; jz < r2 - 1; jz++) {
    for (let jx = 0; jx < c2 - 1; jx++) {
      if (!landCell[jz * (c2 - 1) + jx]) continue;
      const a = vertIndex[jz * c2 + jx];
      const b = vertIndex[jz * c2 + (jx + 1)];
      const c = vertIndex[(jz + 1) * c2 + jx];
      const d = vertIndex[(jz + 1) * c2 + (jx + 1)];
      // CCW when viewed from above (y+): a,c,b and b,c,d  (z increases south)
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  for (let s = 0; s < skirts.length; s += 4) {
    const ax = skirts[s], az = skirts[s + 1], bx = skirts[s + 2], bz = skirts[s + 3];
    const a = vertIndex[az * c2 + ax];
    const b = vertIndex[bz * c2 + bx];
    const a2 = bottomIndex[az * c2 + ax];
    const b2 = bottomIndex[bz * c2 + bx];
    idx[t++] = a; idx[t++] = b; idx[t++] = a2;
    idx[t++] = b; idx[t++] = b2; idx[t++] = a2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    color: 0xffffff,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain_' + stride;
  mesh.userData.stride = stride;
  mesh.userData.verts = vCount;
  mesh.userData.tris = t / 3;
  return mesh;
}

export function buildTerrainMesh() {
  if (!meta || !heights) return new THREE.Group();
  const fine = buildGridMesh(1);
  const coarse = buildGridMesh(2);
  const lod = new THREE.LOD();
  lod.name = 'terrain';
  lod.addLevel(fine, 0);
  lod.addLevel(coarse, 2800);
  lod.position.set(0, 0, 0);
  // LOD distance is measured to the object's position (origin). Good enough
  // because the city sits near the origin and the flat land wraps around it.
  return lod;
}

export function terrainAttribution() {
  return 'Land outline: EU-DEM / Copernicus';
}
