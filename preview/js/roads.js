// Road graph for the compact city: street segments + access roads →
// nodes/edges, and a shortest-path router that returns walkable waypoints.
// Used by the walking character (walker.js) through window.cityRoads.
const key = (x, z) => x.toFixed(1) + ',' + z.toFixed(1);

export function buildRoadGraph(segs) {
  const list = (segs || []).map((s) => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }));
  const nodes = new Map(); // key -> {x,z,id}
  const pts = [];
  const addNode = (x, z) => { const k = key(x, z); let n = nodes.get(k); if (!n) { n = { x, z, id: pts.length }; nodes.set(k, n); pts.push(n); } return n; };
  for (const s of list) { addNode(s.x1, s.z1); addNode(s.x2, s.z2); }
  const adj = pts.map(() => []);
  const edges = [];
  for (const s of list) {
    // split at every node lying on this segment
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) continue;
    const on = [];
    for (const n of pts) {
      const t = ((n.x - s.x1) * dx + (n.z - s.z1) * dz) / L2;
      if (t < -1e-3 || t > 1 + 1e-3) continue;
      const px = s.x1 + t * dx, pz = s.z1 + t * dz;
      if ((px - n.x) ** 2 + (pz - n.z) ** 2 < 0.25) on.push({ n, t });
    }
    on.sort((a, b) => a.t - b.t);
    for (let i = 0; i + 1 < on.length; i++) {
      const a = on[i].n, b = on[i + 1].n;
      if (a === b) continue;
      const w = Math.hypot(a.x - b.x, a.z - b.z);
      adj[a.id].push([b.id, w]); adj[b.id].push([a.id, w]);
      edges.push([a.id, b.id]);
    }
  }
  function nearestOnRoad(x, z) {
    let best = null, bd = Infinity;
    for (const [ia, ib] of edges) {
      const a = pts[ia], b = pts[ib];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const px = a.x + t * dx, pz = a.z + t * dz;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { x: px, z: pz, a: ia, b: ib, t, dist: Math.sqrt(d) }; }
    }
    return best;
  }
  function dijkstra(srcs, dsts) {
    // srcs/dsts: [[nodeId, extraCost]]
    const dist = new Float64Array(pts.length).fill(Infinity);
    const prev = new Int32Array(pts.length).fill(-1);
    const done = new Uint8Array(pts.length);
    for (const [id, c] of srcs) if (c < dist[id]) dist[id] = c;
    const goal = new Map(dsts);
    let bestEnd = -1, bestCost = Infinity;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < pts.length; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0 || du >= bestCost) break;
      done[u] = 1;
      if (goal.has(u) && du + goal.get(u) < bestCost) { bestCost = du + goal.get(u); bestEnd = u; }
      for (const [v, w] of adj[u]) if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; }
    }
    if (bestEnd < 0) return null;
    const path = [];
    for (let u = bestEnd; u >= 0; u = prev[u]) path.push(pts[u]);
    return path.reverse();
  }
  // Waypoints from → to along the roads: from, its road entry, junctions…,
  // road exit, to. Falls back to a straight line if no road connects.
  function waypoints(from, to) {
    const A = nearestOnRoad(from.x, from.z), B = nearestOnRoad(to.x, to.z);
    if (!A || !B) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
    const out = [{ x: from.x, z: from.z }, { x: A.x, z: A.z }];
    const sameEdge = (A.a === B.a && A.b === B.b) || (A.a === B.b && A.b === B.a);
    if (!sameEdge) {
      const pa = pts[A.a], pb = pts[A.b], qa = pts[B.a], qb = pts[B.b];
      const path = dijkstra(
        [[A.a, Math.hypot(A.x - pa.x, A.z - pa.z)], [A.b, Math.hypot(A.x - pb.x, A.z - pb.z)]],
        [[B.a, Math.hypot(B.x - qa.x, B.z - qa.z)], [B.b, Math.hypot(B.x - qb.x, B.z - qb.z)]],
      );
      if (path) for (const n of path) out.push({ x: n.x, z: n.z });
    }
    out.push({ x: B.x, z: B.z }, { x: to.x, z: to.z });
    // drop near-duplicates
    const clean = [];
    for (const p of out) { const l = clean[clean.length - 1]; if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 0.3) clean.push(p); }
    return clean;
  }
  return { nodes: pts, edges, segments: list, nearestOnRoad, waypoints };
}
