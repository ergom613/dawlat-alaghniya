// جامع دولة الأغنياء — replaces the university at the same spot (UNIVERSITY rect
// in layout.js). Big green dome with gold finial, two minarets, an arcaded
// courtyard (sahn) with an ablution fountain, and a prayer hall inside with
// carpets, mihrab, minbar and a chandelier. Same API as the old university:
// { root, setNight, views, center }.
import * as THREE from 'three';
import { UNIVERSITY } from './layout.js';
import { palm } from './landmarks.js';

const ARABIC_FONT = '"Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, sans-serif';
const L = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const P = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 40, ...o });
function box(parent, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function cyl(parent, mat, rt, rb, h, x, y, z, seg = 12, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function shadowize(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transparent || m.isMeshBasicMaterial || m.isSpriteMaterial)) return;
    o.castShadow = true; o.receiveShadow = true;
  });
}
let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,210,140,0.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = new THREE.CanvasTexture(c); _halo.colorSpace = THREE.SRGBColorSpace; return _halo;
}
function makeGlowSet() {
  const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const day = new THREE.Color(0xd8d2c4), night = new THREE.Color(0xfff0c8);
  return {
    haloMat, bulbMat,
    halo(parent, x, y, z, s = 3) { const sp = new THREE.Sprite(haloMat); sp.position.set(x, y, z); sp.scale.set(s, s, 1); parent.add(sp); return sp; },
    setNight(n) { haloMat.opacity = 0.05 + 0.85 * n; bulbMat.color.copy(day).lerp(night, Math.min(1, n * 1.4)); },
  };
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function signTexture(text, { w = 1024, h = 160, bg = '#0f4a32', size = 96, border = '#d9a92a' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
    g.font = `800 ${size}px ${ARABIC_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grd.addColorStop(0, '#fff1b8'); grd.addColorStop(0.5, '#f3cf6a'); grd.addColorStop(1, '#b8862a');
    g.fillStyle = grd; g.fillText(text, w / 2, h / 2 + 6); tex.needsUpdate = true;
  };
  draw();
  try { if (document.fonts && document.fonts.load) document.fonts.load(`800 ${size}px Cairo`, text).then(draw).catch(() => {}); } catch { /* */ }
  return tex;
}
// pointed (Islamic) arch path, base centred at 0
function archPath(path, w, h, apexK = 0.62) {
  const r = w / 2, sh = h - r * apexK * 1.15;
  path.moveTo(-r, 0); path.lineTo(-r, sh);
  path.quadraticCurveTo(-r, h - r * 0.15, 0, h);
  path.quadraticCurveTo(r, h - r * 0.15, r, sh);
  path.lineTo(r, 0); path.lineTo(-r, 0);
  return path;
}
function archMesh(mat, w, h, depth, frame = 0) {
  const s = new THREE.Shape();
  if (frame > 0) {
    s.moveTo(-w / 2 - frame, -0.001); s.lineTo(w / 2 + frame, 0); s.lineTo(w / 2 + frame, h + frame * 1.1); s.lineTo(-w / 2 - frame, h + frame * 1.1); s.lineTo(-w / 2 - frame, 0);
    s.holes.push(archPath(new THREE.Path(), w, h));
  } else archPath(s, w, h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, mat);
}
// arched-window wall texture (+ emissive for lit glass at night)
function archWindowMaps(cols, { wall = '#efe3c8', frame = '#1f6b47', gold = '#d9a92a', glass = '#3f6f7a', lit = '#ffcf7a' } = {}) {
  const tw = 96, th = 192;
  const drawArch = (g, x, glassCol) => {
    const w = 46, h = 110, bx = x + tw / 2, by = 150;
    g.beginPath(); g.moveTo(bx - w / 2, by); g.lineTo(bx - w / 2, by - h + 30); g.quadraticCurveTo(bx - w / 2, by - h + 4, bx, by - h); g.quadraticCurveTo(bx + w / 2, by - h + 4, bx + w / 2, by - h + 30); g.lineTo(bx + w / 2, by); g.closePath();
    g.fillStyle = glassCol; g.fill();
    return () => { g.lineWidth = 7; g.strokeStyle = frame; g.stroke(); g.lineWidth = 2; g.strokeStyle = gold; g.stroke(); };
  };
  const map = canvasTex(tw * cols, th, (g, W, H) => {
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e2d3b2'; g.fillRect(0, H - 22, W, 22); g.fillRect(0, 0, W, 10);
    g.fillStyle = frame; g.fillRect(0, 12, W, 6); g.fillStyle = gold; g.fillRect(0, 18, W, 2);
    for (let c = 0; c < cols; c++) { const s = drawArch(g, c * tw, glass); s(); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(c * tw + 30, 52, 6, 90); }
  });
  const emissiveMap = canvasTex(tw * cols, th, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let c = 0; c < cols; c++) drawArch(g, c * tw, lit);
  });
  return new THREE.MeshLambertMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.04 });
}

export function createMosque({ scene, groundY, quality }) {
  const qs = quality || {};
  const root = new THREE.Group();
  root.name = 'mosque';
  const U = UNIVERSITY;
  const y0 = typeof groundY === 'function' ? groundY(U.x, U.z) : 2.6;
  root.position.set(U.x, y0, U.z);
  const glow = makeGlowSet();
  const lights = [];
  const winMats = [];
  const innerWinMats = [];

  const stone = P(0xf3ead8, { shininess: 10 });
  const stoneDark = L(0xd9ccb0);
  const trim = L(0xfbf6ea);
  const marble = P(0xf6f2ea, { shininess: 70, specular: 0x444444 });
  const marbleDark = L(0xcfc6b6);
  const green = P(0x1f7a4f, { shininess: 50, specular: 0x224433 });
  const greenDark = L(0x14563a);
  const gold = P(0xd9a92a, { shininess: 90, specular: 0x997733 });
  const domeM = P(0x1e7f55, { shininess: 70, specular: 0x336655, emissive: 0x0c3a26, emissiveIntensity: 0 });
  const wood = L(0x6a4022);
  const lawn = L(0x6aa84a);
  const water = P(0x3aa7c8, { shininess: 120, specular: 0xffffff });
  const bandM = new THREE.MeshLambertMaterial({ color: 0x2f9a62, emissive: 0x39ff8a, emissiveIntensity: 0 });

  // ---------- plot ----------
  box(root, L(0xbfb39a), U.w + 1.2, 0.2, U.d + 1.2, 0, 0.05, 0);
  box(root, L(0xdcd1bb), U.w, 0.3, U.d, 0, 0.15, 0);
  // perimeter wall with crenellation, gate at the front (+z)
  const wallH = 2.6;
  const gz = U.d / 2 - 0.8;
  for (const sx of [-1, 1]) {
    const x0 = sx * 7.5, x1 = sx * (U.w / 2 - 0.5);
    box(root, stone, Math.abs(x1 - x0), wallH, 0.7, (x0 + x1) / 2, 0.3 + wallH / 2, gz);
    box(root, stone, 0.7, wallH, U.d - 1, sx * (U.w / 2 - 0.5), 0.3 + wallH / 2, 0);
    box(root, green, Math.abs(x1 - x0), 0.18, 0.8, (x0 + x1) / 2, 0.3 + wallH + 0.09, gz);
    box(root, green, 0.8, 0.18, U.d - 1, sx * (U.w / 2 - 0.5), 0.3 + wallH + 0.09, 0);
  }
  box(root, stone, U.w - 1, wallH, 0.7, 0, 0.3 + wallH / 2, -U.d / 2 + 0.5);
  box(root, green, U.w - 1, 0.18, 0.8, 0, 0.3 + wallH + 0.09, -U.d / 2 + 0.5);
  // gate: pointed arch portal with sign
  {
    const gate = new THREE.Group(); gate.position.set(0, 0.3, gz); root.add(gate);
    for (const sx of [-1, 1]) {
      box(gate, stone, 2.4, 8, 2.2, sx * 6.2, 4, 0);
      cyl(gate, green, 0.9, 1.1, 1.2, sx * 6.2, 8.6, 0, 12);
      const d = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); d.position.set(sx * 6.2, 9.2, 0); gate.add(d);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), glow.bulbMat); lan.position.set(sx * 6.2, 6.4, 1.3); gate.add(lan);
      glow.halo(gate, sx * 6.2, 6.4, 1.4, 4);
    }
    const arch = archMesh(stone, 10, 7.2, 1.6, 1.2); gate.add(arch);
    const archGold = archMesh(gold, 9.6, 7.0, 1.7, 0.18); gate.add(archGold);
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('جامع دولة الأغنياء', { size: 92 }) }));
    gs.position.set(0, 9.4, 0.9); gate.add(gs);
    box(gate, stone, 12.8, 1.6, 1.8, 0, 9.4, 0);
  }

  // ---------- courtyard (sahn), z ≈ -4 … 36 ----------
  const CZ0 = -4, CZ1 = 36, CW = 64;
  box(root, marble, CW, 0.1, CZ1 - CZ0, 0, 0.35, (CZ0 + CZ1) / 2);
  // geometric marble inlay
  const inlay = canvasTex(256, 256, (g, W) => {
    g.fillStyle = '#f4efe4'; g.fillRect(0, 0, W, W);
    g.strokeStyle = '#1f7a4f'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(W / 2, 8); g.lineTo(W - 8, W / 2); g.lineTo(W / 2, W - 8); g.lineTo(8, W / 2); g.closePath(); g.stroke();
    g.strokeStyle = '#d9a92a'; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, W - 80);
    g.fillStyle = '#1f7a4f'; g.beginPath(); g.arc(W / 2, W / 2, 16, 0, Math.PI * 2); g.fill();
  }, [8, 5]);
  const inl = new THREE.Mesh(new THREE.PlaneGeometry(40, 25), new THREE.MeshLambertMaterial({ map: inlay }));
  inl.rotation.x = -Math.PI / 2; inl.position.set(0, 0.41, (CZ0 + CZ1) / 2 + 2); root.add(inl);
  // ablution fountain with octagonal canopy (shadirvan)
  {
    const fz = (CZ0 + CZ1) / 2 + 2;
    cyl(root, marbleDark, 4.6, 4.8, 0.8, 0, 0.75, fz, 8);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.1, 8), water); w.position.set(0, 1.17, fz); root.add(w);
    cyl(root, marble, 0.9, 1.1, 1.6, 0, 1.6, fz, 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      cyl(root, marble, 0.22, 0.26, 4.6, Math.cos(a) * 5.2, 2.9, fz + Math.sin(a) * 5.2, 8);
    }
    cyl(root, green, 6.0, 6.0, 0.5, 0, 5.4, fz, 8);
    const cd = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeM); cd.position.set(0, 5.6, fz); cd.scale.set(1, 0.85, 1); root.add(cd);
    cyl(root, gold, 0.08, 0.12, 1.6, 0, 9.8, fz, 6);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), gold); b.position.set(0, 10.2, fz); root.add(b);
  }
  // arcades (riwaq) along both sides of the courtyard
  for (const sx of [-1, 1]) {
    const ax = sx * (CW / 2 - 3);
    box(root, marble, 6.4, 0.3, CZ1 - CZ0, ax, 0.5, (CZ0 + CZ1) / 2);
    box(root, stone, 0.6, 5.6, CZ1 - CZ0, sx * (CW / 2 + 0.2), 3.1, (CZ0 + CZ1) / 2); // back wall
    box(root, stone, 7.2, 0.6, CZ1 - CZ0 + 0.6, ax, 6.0, (CZ0 + CZ1) / 2); // roof
    box(root, green, 7.4, 0.22, CZ1 - CZ0 + 0.8, ax, 6.4, (CZ0 + CZ1) / 2);
    const n = 8, span = (CZ1 - CZ0) / n;
    for (let k = 0; k <= n; k++) {
      const z = CZ0 + k * span;
      cyl(root, marble, 0.3, 0.34, 4.0, ax - sx * 3, 2.6, z, 10);
      cyl(root, gold, 0.42, 0.42, 0.25, ax - sx * 3, 4.6, z, 10);
      if (k < n) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.3, 6, 14, Math.PI), stone);
        arc.position.set(ax - sx * 3, 4.7, z + span / 2); arc.rotation.y = Math.PI / 2; root.add(arc);
        box(root, stone, 0.6, 1.0, span, ax - sx * 3, 5.5, z + span / 2);
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glow.bulbMat); lan.position.set(ax - sx * 1.5, 4.3, z + span / 2); root.add(lan);
        if (k % 2 === 0) glow.halo(root, ax - sx * 1.5, 4.3, z + span / 2, 2.4);
      }
    }
  }
  // palms and lawns by the gate
  for (const [x, z, w, d] of [[-18, 30, 14, 8], [18, 30, 14, 8]]) {
    box(root, lawn, w, 0.12, d, x, 0.42, z);
    box(root, green, w + 0.4, 0.3, 0.3, x, 0.45, z - d / 2);
  }
  for (const [x, z] of [[-22, 30], [-14, 30], [14, 30], [22, 30], [-8, 12], [8, 12]]) palm(root, x, z, 0.4, 0.75);

  // ---------- prayer hall, x -30…30, z -38…-6 ----------
  const H = { x0: -30, x1: 30, z0: -38, z1: -6, h: 10, fy: 1.2 };
  const hw = H.x1 - H.x0, hd = H.z1 - H.z0, hcz = (H.z0 + H.z1) / 2;
  box(root, stoneDark, hw + 2, 1.2, hd + 2, 0, 0.6, hcz); // plinth
  const sideWin = archWindowMaps(6); sideWin.map.repeat.set(1, 1); winMats.push(sideWin);
  const backWin = archWindowMaps(10); winMats.push(backWin);
  box(root, backWin, hw, H.h, 0.7, 0, H.fy + H.h / 2, H.z0 + 0.35);
  box(root, sideWin, 0.7, H.h, hd, H.x0 + 0.35, H.fy + H.h / 2, hcz);
  box(root, sideWin, 0.7, H.h, hd, H.x1 - 0.35, H.fy + H.h / 2, hcz);
  // front facade with central iwan portal and two arched windows each side
  const frontWin = archWindowMaps(3); winMats.push(frontWin);
  for (const sx of [-1, 1]) box(root, frontWin, 22, H.h, 0.7, sx * 19, H.fy + H.h / 2, H.z1 - 0.35);
  {
    const iw = new THREE.Group(); iw.position.set(0, H.fy, H.z1 + 0.4); root.add(iw);
    const frame = archMesh(stone, 9, 11, 2.2, 2.2); iw.add(frame);
    box(iw, stone, 13.4, 3.2, 2.2, 0, 12.6, 0);
    const goldArch = archMesh(gold, 8.6, 10.8, 2.3, 0.22); iw.add(goldArch);
    const tile = canvasTex(128, 128, (g, W) => {
      g.fillStyle = '#145a3c'; g.fillRect(0, 0, W, W);
      g.strokeStyle = '#d9a92a'; g.lineWidth = 3;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const cx = 32 + i * 64, cy = 32 + j * 64; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const r = k % 2 ? 14 : 28; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.stroke(); }
    }, [3, 4]);
    const back = archMesh(new THREE.MeshLambertMaterial({ map: tile }), 8.6, 10.8, 0.2); back.position.z = -1.5; iw.add(back);
    // wooden double door (open: the hall is visible behind)
    for (const sx of [-1, 1]) { const dd = box(iw, wood, 1.6, 4.4, 0.15, sx * 2.6, 2.2, -1.2); dd.rotation.y = sx * 0.9; }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.3), new THREE.MeshBasicMaterial({ map: signTexture('جامع دولة الأغنياء', { size: 92 }) }));
    sign.position.set(0, 12.6, 1.15); iw.add(sign);
  }
  // roof with an opening under the drum, parapet with green band + gold trim
  const roofY = H.fy + H.h;
  const DR = 9.5;
  // flat roof slab with a round opening under the drum
  const holedSlab = (w, d, cx, cz, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
    const hole = new THREE.Path(); hole.absarc(cx, cz, r, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false, curveSegments: 40 });
    g.rotateX(Math.PI / 2); // extrude goes down (−y); shape y → z
    return g;
  };
  { const r = new THREE.Mesh(holedSlab(hw, hd, 0, 0, DR - 0.2), stone); r.position.set(0, roofY + 0.6, hcz); root.add(r); }
  box(root, greenDark, hw + 0.8, 0.5, 0.8, 0, roofY + 0.85, H.z1); box(root, greenDark, hw + 0.8, 0.5, 0.8, 0, roofY + 0.85, H.z0);
  box(root, greenDark, 0.8, 0.5, hd + 0.8, H.x0, roofY + 0.85, hcz); box(root, greenDark, 0.8, 0.5, hd + 0.8, H.x1, roofY + 0.85, hcz);
  box(root, gold, hw + 1, 0.12, 0.9, 0, roofY + 1.15, H.z1); box(root, gold, hw + 1, 0.12, 0.9, 0, roofY + 1.15, H.z0);
  // corner domes
  for (const [x, z] of [[H.x0 + 4, H.z0 + 4], [H.x1 - 4, H.z0 + 4], [H.x0 + 4, H.z1 - 4], [H.x1 - 4, H.z1 - 4]]) {
    cyl(root, stone, 2.4, 2.4, 1.6, x, roofY + 1.4, z, 16);
    const d = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold); d.position.set(x, roofY + 2.2, z); d.scale.set(1, 1.1, 1); root.add(d);
  }
  // big dome on a drum with arched-window band
  const drumH = 3.6;
  const drumWin = archWindowMaps(16, { wall: '#efe3c8' }); drumWin.map.repeat.set(1, 1); winMats.push(drumWin);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DR, DR, drumH, 40, 1, true), drumWin); drumWin.side = THREE.DoubleSide;
  drum.position.set(0, roofY + drumH / 2, hcz); root.add(drum);
  cyl(root, green, DR + 0.5, DR + 0.5, 0.5, 0, roofY + drumH + 0.25, hcz, 40);
  cyl(root, gold, DR + 0.6, DR + 0.6, 0.14, 0, roofY + drumH + 0.55, hcz, 40);
  const domeY = roofY + drumH + 0.5;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DR, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
  dome.position.set(0, domeY, hcz); dome.scale.set(1, 1.18, 1); root.add(dome);
  // gold ribs
  for (let k = 0; k < 16; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(DR + 0.04, 0.07, 4, 24, Math.PI / 2), gold);
    rib.position.set(0, domeY, hcz); rib.rotation.set(0, (k / 16) * Math.PI * 2, Math.PI / 2); rib.scale.set(1.18, 1, 1); root.add(rib);
  }
  // finial (alem) with crescent
  function alem(parent, x, y, z, s = 1) {
    cyl(parent, gold, 0.06 * s, 0.1 * s, 2.2 * s, x, y + 1.1 * s, z, 6);
    for (const [yy, r] of [[0.6, 0.32], [1.2, 0.42], [1.8, 0.28]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r * s, 12, 8), gold); b.position.set(x, y + yy * s, z); parent.add(b); }
    const cr = new THREE.Mesh(new THREE.TorusGeometry(0.55 * s, 0.11 * s, 8, 20, Math.PI * 1.45), gold);
    cr.position.set(x, y + 2.75 * s, z); cr.rotation.z = Math.PI * 0.27; parent.add(cr);
  }
  alem(root, 0, domeY + DR * 1.18 - 0.2, hcz, 1.6);
  glow.halo(root, 0, domeY + DR * 1.18 + 3.4, hcz, 6);

  // ---------- two minarets at the front corners of the hall ----------
  const MH = 40;
  for (const sx of [-1, 1]) {
    const m = new THREE.Group(); m.position.set(sx * 35, 0.3, H.z1 + 1); root.add(m);
    box(m, stone, 5.2, 4, 5.2, 0, 2, 0);
    box(m, green, 5.6, 0.3, 5.6, 0, 4.1, 0);
    cyl(m, stone, 1.7, 2.1, MH * 0.55, 0, 4 + MH * 0.275, 0, 8);
    // first balcony (sherefe)
    const b1 = 4 + MH * 0.55;
    cyl(m, stone, 2.9, 1.8, 1.2, 0, b1 + 0.6, 0, 16);
    cyl(m, bandM, 2.95, 2.95, 0.5, 0, b1 + 1.45, 0, 16);
    cyl(m, gold, 3.0, 3.0, 0.1, 0, b1 + 1.75, 0, 16);
    cyl(m, stone, 1.45, 1.6, MH * 0.25, 0, b1 + 1.8 + MH * 0.125, 0, 8);
    const b2 = b1 + 1.8 + MH * 0.25;
    cyl(m, stone, 2.3, 1.45, 1.0, 0, b2 + 0.5, 0, 16);
    cyl(m, bandM, 2.35, 2.35, 0.45, 0, b2 + 1.25, 0, 16);
    cyl(m, stone, 1.2, 1.3, 3.2, 0, b2 + 3.1, 0, 8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.55, 6.5, 8), green); cone.position.set(0, b2 + 4.7 + 3.25, 0); m.add(cone);
    alem(m, 0, b2 + 4.7 + 6.3, 0, 0.9);
    glow.halo(m, 0, b1 + 1.45, 0, 7);
    glow.halo(m, 0, b2 + 1.25, 0, 6);
  }

  // courtyard lamps
  for (const z of [0, 10, 26, 34]) for (const sx of [-1, 1]) {
    const x = sx * 12;
    cyl(root, L(0x2e2a26), 0.09, 0.14, 4.2, x, 0.4 + 2.1, z, 8);
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glow.bulbMat); lan.position.set(x, 4.75, z); root.add(lan);
    cyl(root, gold, 0.05, 0.36, 0.22, x, 5.15, z, 8);
    glow.halo(root, x, 4.8, z, 3.2);
  }

  // ---------- INTERIOR: prayer hall ----------
  const hall = new THREE.Group();
  hall.name = 'prayerHall';
  root.add(hall);
  {
    const fy = H.fy;
    // carpet: rows of prayer-rug outlines facing the qibla wall (−z)
    const carpet = canvasTex(256, 256, (g, W) => {
      g.fillStyle = '#8f1d24'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 2; i++) {
        const x = i * 128;
        g.fillStyle = '#a8262e'; g.fillRect(x + 8, 12, 112, 232);
        g.strokeStyle = '#e2b54a'; g.lineWidth = 4; g.strokeRect(x + 12, 16, 104, 224);
        g.beginPath(); g.moveTo(x + 24, 236); g.lineTo(x + 24, 70); g.quadraticCurveTo(x + 24, 30, x + 64, 24); g.quadraticCurveTo(x + 104, 30, x + 104, 70); g.lineTo(x + 104, 236); g.stroke();
        g.fillStyle = '#1f5a46'; g.beginPath(); g.arc(x + 64, 120, 14, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(226,181,74,0.6)'; g.lineWidth = 2; for (let y = 150; y < 230; y += 14) { g.beginPath(); g.moveTo(x + 36, y); g.lineTo(x + 92, y); g.stroke(); }
      }
    }, [hw / 2.4, hd / 2.6]);
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(hw - 1.6, hd - 1.6), new THREE.MeshLambertMaterial({ map: carpet }));
    cm.rotation.x = -Math.PI / 2; cm.position.set(0, fy + 0.03, hcz); hall.add(cm);
    // inner ceiling (warm plaster) with the dome opening; inner dome painted
    const ceil = L(0xf3e6c8, { emissive: 0x2a2014, emissiveIntensity: 1 });
    { const c = new THREE.Mesh(holedSlab(hw - 1.4, hd - 1.4, 0, 0, DR - 0.4), ceil); c.position.set(0, roofY - 0.05, hcz); hall.add(c); }
    // inner wall lining: same arched windows, softer glow than the outside
    const inWin = archWindowMaps(10, { wall: '#f1e6cc' }); innerWinMats.push(inWin);
    const inSide = archWindowMaps(6, { wall: '#f1e6cc' }); innerWinMats.push(inSide);
    const inFront = archWindowMaps(3, { wall: '#f1e6cc' }); innerWinMats.push(inFront);
    const lin = (mat, w, x, z, ry) => { const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, H.h - 0.2), mat); pl.position.set(x, fy + H.h / 2, z); pl.rotation.y = ry; hall.add(pl); };
    lin(inWin, hw - 1.42, 0, H.z0 + 0.71, 0);
    lin(inSide, hd - 1.42, H.x0 + 0.71, hcz, Math.PI / 2);
    lin(inSide, hd - 1.42, H.x1 - 0.71, hcz, -Math.PI / 2);
    for (const sx of [-1, 1]) lin(inFront, 21.8, sx * 19, H.z1 - 0.71, Math.PI);
    const innerDomeTex = canvasTex(512, 256, (g, W, Hh) => {
      g.fillStyle = '#f2e3c2'; g.fillRect(0, 0, W, Hh);
      for (let k = 0; k < 16; k++) { const x = (k / 16) * W; g.fillStyle = k % 2 ? '#1f6b4f' : '#e8d3a0'; g.fillRect(x, Hh * 0.55, W / 16, Hh * 0.45); g.strokeStyle = '#c99a2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
      g.fillStyle = '#c99a2e'; g.fillRect(0, Hh * 0.52, W, 6);
    });
    const idome = new THREE.Mesh(new THREE.SphereGeometry(DR - 0.4, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: innerDomeTex, side: THREE.BackSide, emissive: 0x302414, emissiveIntensity: 1 }));
    idome.position.set(0, domeY, hcz); idome.scale.set(1, 1.12, 1); hall.add(idome);
    const idrum = new THREE.Mesh(new THREE.CylinderGeometry(DR - 0.4, DR - 0.4, drumH + 0.6, 32, 1, true), new THREE.MeshLambertMaterial({ color: 0xefe1bf, side: THREE.BackSide, emissive: 0x2a2014, emissiveIntensity: 1 }));
    idrum.position.set(0, roofY + drumH / 2 + 0.1, hcz); hall.add(idrum);
    // columns + arches (two rows)
    for (const sx of [-1, 1]) {
      const zs = [-12, -19.5, -27, -34.5];
      for (const z of zs) {
        cyl(hall, marble, 0.45, 0.5, H.h - 2.4, sx * 12, fy + (H.h - 2.4) / 2, z, 12);
        cyl(hall, gold, 0.65, 0.65, 0.35, sx * 12, fy + H.h - 2.3, z, 12);
      }
      for (let k = 0; k < zs.length - 1; k++) {
        const span = zs[k] - zs[k + 1];
        const arc = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.35, 6, 16, Math.PI), L(0xf1e3c4));
        arc.position.set(sx * 12, fy + H.h - 2.1, zs[k] - span / 2); arc.rotation.y = Math.PI / 2; hall.add(arc);
      }
    }
    // qibla wall: tiled lower band + calligraphy band
    const qz = H.z0 + 0.72;
    const tiles = canvasTex(128, 64, (g, W, Hh) => {
      g.fillStyle = '#e9f0ea'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#1f6b4f'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) { const cx = 16 + i * 32; g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx + 12, Hh / 2); g.lineTo(cx, Hh - 6); g.lineTo(cx - 12, Hh / 2); g.closePath(); g.stroke(); }
      g.fillStyle = '#d9a92a'; g.fillRect(0, 0, W, 4); g.fillRect(0, Hh - 4, W, 4);
    }, [14, 1]);
    const tb = new THREE.Mesh(new THREE.PlaneGeometry(hw - 1.6, 1.8), new THREE.MeshLambertMaterial({ map: tiles }));
    tb.position.set(0, fy + 0.9, qz); hall.add(tb);
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(26, 1.5), new THREE.MeshBasicMaterial({ map: signTexture('بسم الله الرحمن الرحيم', { w: 1536, h: 128, size: 92, bg: '#0f4a32' }) }));
    cal.position.set(0, fy + 8.0, qz + 0.01); hall.add(cal);
    // mihrab: gold frame, green tiled niche, hanging lamp
    {
      const mh = new THREE.Group(); mh.position.set(0, fy, qz + 0.05); hall.add(mh);
      const panel = box(mh, L(0xf5ecd6), 7.2, 7.4, 0.3, 0, 3.7, 0.15);
      void panel;
      const fr = archMesh(gold, 4.0, 5.8, 0.6, 0.45); fr.position.z = 0.45; mh.add(fr);
      const nicheTex = canvasTex(128, 256, (g, W, Hh) => {
        g.fillStyle = '#145a3c'; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#e2b54a'; g.lineWidth = 2;
        for (let y = 12; y < Hh; y += 24) for (let x = 12; x < W; x += 24) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = 'rgba(255,220,140,0.25)'; g.fillRect(0, Hh * 0.75, W, Hh * 0.25);
      });
      const niche = archMesh(new THREE.MeshLambertMaterial({ map: nicheTex, emissive: 0x1a2a10, emissiveIntensity: 1 }), 3.9, 5.7, 0.1); niche.position.z = 0.32; mh.add(niche);
      cyl(mh, gold, 0.02, 0.02, 1.6, 0, 6.0, 1.2, 4);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), glow.bulbMat); lamp.position.set(0, 5.1, 1.2); mh.add(lamp);
      glow.halo(mh, 0, 5.1, 1.3, 2.6);
    }
    // minbar (stepped pulpit) to the right of the mihrab
    {
      const mb = new THREE.Group(); mb.position.set(5.6, fy, qz + 3.2); hall.add(mb);
      for (let k = 0; k < 8; k++) box(mb, wood, 1.4, 0.35 * (k + 1), 0.6, 0, 0.175 * (k + 1), 2.8 - k * 0.55);
      for (const sx of [-1, 1]) {
        const rail = box(mb, L(0x5a3418), 0.12, 0.12, 5.0, sx * 0.72, 3.0, 0.9); rail.rotation.x = -0.58;
        box(mb, L(0x7a4a26), 0.14, 4.6, 0.14, sx * 0.72, 2.3, -1.6);
      }
      box(mb, L(0x7a4a26), 1.6, 0.2, 1.4, 0, 4.6, -1.3);
      const kd = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.4, 8), gold); kd.position.set(0, 5.4, -1.3); mb.add(kd);
      // door arch at the bottom
      const da = archMesh(gold, 1.3, 2.1, 0.7, 0.12); da.position.set(0, 0, 3.2); mb.add(da);
    }
    // chandelier under the dome
    {
      const cy = roofY - 2.2;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const ch = cyl(hall, gold, 0.02, 0.02, roofY + drumH - cy, Math.cos(a) * 3, (roofY + drumH + cy) / 2, hcz + Math.sin(a) * 3, 4); ch.rotation.z = Math.cos(a) * 0.2; ch.rotation.x = -Math.sin(a) * 0.2; }
      for (const [r, y] of [[6.5, cy], [4.2, cy + 0.6]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.set(0, y, hcz); hall.add(ring);
        const n = Math.round(r * 4);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow.bulbMat); b.position.set(Math.cos(a) * r, y + 0.15, hcz + Math.sin(a) * r); hall.add(b);
          if (k % 4 === 0) glow.halo(hall, Math.cos(a) * r, y + 0.2, hcz + Math.sin(a) * r, 1.6);
        }
      }
    }
    // Quran stands (rahle) and a few low shelves along the side walls
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const z = -10 - k * 5.5;
        box(hall, L(0x5a3418), 0.5, 1.3, 3.4, sx * 28.8, fy + 0.65, z);
        for (let j = 0; j < 4; j++) box(hall, L([0x1f5a46, 0x8f1d24, 0x2a3f6a, 0x6a4a1a][j]), 0.3, 0.42, 0.7, sx * 28.65, fy + 1.5, z - 1.2 + j * 0.8);
      }
    }
    for (const [x, z] of [[-3, -30], [3, -30], [-8, -24], [8, -24]]) {
      const r1 = box(hall, wood, 0.7, 0.05, 0.5, x, fy + 0.45, z); r1.rotation.x = 0.5;
      const r2 = box(hall, wood, 0.7, 0.05, 0.5, x, fy + 0.45, z - 0.35); r2.rotation.x = -0.5;
    }
  }

  // ---------- night lights ----------
  const usePL = qs.pointLights !== undefined ? !!qs.pointLights : true;
  if (usePL) {
    for (const [x, y, z, d] of [[0, 8, 16, 46], [0, 6, -14, 34], [-14, 6, -28, 24], [14, 6, -28, 24]]) {
      const pl = new THREE.PointLight(0xffc98a, 0, d, 1.3); pl.position.set(x, y, z); root.add(pl); lights.push(pl);
    }
  }

  shadowize(root);
  scene.add(root);

  function setNight(n) {
    n = Math.max(0, Math.min(1, n || 0));
    glow.setNight(n);
    for (const m of winMats) m.emissiveIntensity = 0.04 + n * 1.5;
    for (const m of innerWinMats) m.emissiveIntensity = 0.02 + n * 0.35;
    domeM.emissiveIntensity = n * 0.9;
    bandM.emissiveIntensity = n * 1.3;
    lights.forEach((pl, i) => { pl.intensity = n * (i === 0 ? 90 : 26); });
  }
  setNight(0);

  const C = (x, y, z) => new THREE.Vector3(U.x + x, y0 + y, U.z + z);
  const views = {
    day: { pos: C(70, 52, 118), target: C(0, 12, -8) },
    front: { pos: C(16, 12, 52), target: C(0, 10, -14) },
    hall: { pos: C(-10, 4.6, -8.2), target: C(2, 4.6, -36) },
    mihrab: { pos: C(-5, 3.0, -25), target: C(0, 3.6, -37.5) },
  };
  // compat aliases for any old caller
  views.library = views.mihrab;
  return { root, setNight, views, center: C(0, 0, 0), kind: 'mosque' };
}
