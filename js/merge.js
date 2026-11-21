// Preview perf: merge static meshes that share a material into one draw call.
// Only for scenery that never moves per-mesh (materials may still animate:
// they stay shared, so setNight()/opacity tweaks keep working).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const MAP_KEYS = ['map', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'specularMap'];
const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();

export function mergeStaticMeshes(root, { skip = null, minGroup = 2 } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map();
  const walk = (o) => {
    if (!o.visible) return;
    if (o !== root && skip && skip(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.geometry && o.geometry.isBufferGeometry
      && !o.material.isShaderMaterial && !Object.keys(o.geometry.morphAttributes || {}).length && o.children.length === 0) {
      const mat = o.material;
      const usesUv = MAP_KEYS.some((k) => mat[k]);
      const attrs = Object.keys(o.geometry.attributes).filter((k) => usesUv || (k !== 'uv' && k !== 'uv1' && k !== 'uv2')).sort();
      if (attrs.includes('position') && attrs.includes('normal')) {
        const key = [mat.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.geometry.index ? 1 : 0, attrs.join(',')].join('|');
        let g = groups.get(key);
        if (!g) { g = { mat, attrs, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [] }; groups.set(key, g); }
        g.list.push(o);
      }
    }
    for (const c of o.children.slice()) walk(c);
  };
  walk(root);
  let removed = 0, added = 0;
  for (const g of groups.values()) {
    if (g.list.length < minGroup) continue;
    const geos = [];
    for (const m of g.list) {
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      const src = m.geometry;
      const geo = new THREE.BufferGeometry();
      for (const k of g.attrs) geo.setAttribute(k, src.attributes[k].clone());
      if (src.index) geo.setIndex(src.index.clone());
      geo.applyMatrix4(_rel);
      geos.push(geo);
    }
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.recv;
    mesh.renderOrder = g.ro;
    mesh.userData.merged = g.list.length;
    root.add(mesh);
    added++;
    for (const m of g.list) {
      if (m.parent) m.parent.remove(m);
      if (!(m.geometry.userData && m.geometry.userData.shared)) m.geometry.dispose();
      removed++;
    }
  }
  return { removed, added };
}
