import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { createHouse, createNameSprite, pointsToLevel, createYacht, heightForLevel, styleFromName, yachtLengthForLevel } from './house.js';
import { makeLabelLayer } from './labels.js';
import { createDayNight, createLamps } from './sky.js';
import { createHorizonMountains } from './scenery.js';
import { createFlocks } from './flocks.js';
import { createWeather, WEATHER_AR } from './weather.js';
import { createCelebrations, highestMilestone } from './celebrate.js';
import { createTour } from './tour.js';
import { buildResidents } from './plots.js';
import { initOwner } from './owner.js';
import { createCrowd } from './crowd.js';
import { createWedding } from './wedding.js';
import { loadTerrain, getHeight, buildTerrainMesh, terrainAttribution, LAND_H } from './terrain.js';

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'map'; // map | sheet | cell | variety
// Sit the name tag just above the roof, using the house's real height.
const TAG_LIFT = 0.7;
const RECORD = params.get('record') === '1';
const VERTICAL = params.get('vertical') === '1';
const START_LEVEL = Math.max(1, Math.min(30, parseInt(params.get('level') || '1', 10) || 1));
const START_SEED = params.get('seed') || 'mohammad_1';
const DEMO_N = Math.max(0, parseInt(params.get('demo') || '0', 10) || 0);
const PREVIEW = params.get('preview') || '';
const PROMO_VER = Math.max(0, parseInt(params.get('promo') || '0', 10) || 0);
const PROMO = PROMO_VER >= 1;

const RESIDENT = {
  id: 1,
  name: 'بيت رقم 1',
  subtitle: '',
  anonymous: true,
};

function houseNumberLabel(r) {
  if (!r) return 'بيت رقم 1';
  if (r.label && String(r.label).indexOf('بيت رقم') === 0) return r.label;
  return 'بيت رقم ' + (r.id || 1);
}
function publicLabel(r) {
  if (!r) return 'بيت رقم 1';
  if (r.anonymous) return houseNumberLabel(r);
  return r.name || r.label || houseNumberLabel(r);
}
function publicSub(r) {
  if (!r || r.anonymous) return '';
  if (r.example) return 'مثال · example';
  return houseNumberLabel(r);
}
function applyHouseLabel() {
  if (!houseTag) return;
  const r = selectedResident || RESIDENT;
  houseTag.set(publicLabel(r), publicSub(r));
}

export const EXAMPLE_NAMES = ['mohammad_1', 'aisha', 'yusuf', 'lina', 'layla_m', 'bassel'];

// Port Hercule, south of the La Condamine example plot — on the harbour water.
export const YACHT_DOCK = { x: 154, z: 172, rot: Math.PI / 2 }; // harbour water, south of house #1; not on the pier

let renderer, scene, camera, controls, clock;
let mapRoot, house, plotLight, roadsGroup = null;
let yachtObj = null, yachtLink = null, yachtPier = null;
let labelLayer = null, houseTag = null, yachtTag = null, captionTag = null;
let levelsData = [];
let monacoData = null;
let waterUniforms = null;
let currentLevel = START_LEVEL;
let currentSeed = START_SEED;
let demo = { active: RECORD, t: 0 };
let badgeEl, searchInput, levelSlider, levelLabel, foundMsg;
let hemiLight, sunLight, fillLight, skyMesh;
let dayNight = null, lamps = null, crowd = null, birds = null, weather = null, celebrations = null, tour = null, wedding = null;
let allResidents = [];
let selectedResident = null;
let plotTents = []; // full procedural tents + tags for real residents (not the selected hero)
let crowdTags = [];
let promoCrowdLabels = false;
let giftHotel = null, giftTag = null;
let camMode = 'free'; // free | house | yacht | car
let lastSky = { tod: 0.45, night: 0, glow: 0 };
let lastFps = 0, fpsFrames = 0, fpsT0 = 0;
let lastTick = 0;

function groundY(x, z) {
  const h = getHeight(x, z);
  return h > 0.4 ? h : LAND_H;
}

function $(id) { return document.getElementById(id); }

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('Failed to load ' + path);
  return r.json();
}

function shapeFromRings(rings) {
  // rings: [outer, ...holes] in (x, z_south). Shape uses (x, -z) so rot.x=-90 maps to XZ.
  const s = new THREE.Shape();
  const outer = rings[0];
  outer.forEach((p, i) => {
    const x = p[0], y = -p[1];
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  for (let h = 1; h < rings.length; h++) {
    const path = new THREE.Path();
    rings[h].forEach((p, i) => {
      const x = p[0], y = -p[1];
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

function meshFromPolygons(polys, height, yBase, mat) {
  const group = new THREE.Group();
  for (const rings of polys) {
    if (!rings || !rings[0] || rings[0].length < 3) continue;
    try {
      const shape = shapeFromRings(rings);
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        curveSegments: 1,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = yBase;
      mesh.receiveShadow = true;
      group.add(mesh);
    } catch (e) {
      console.warn('poly failed', e);
    }
  }
  return group;
}

function roadGeometry(pts, width) {
  const hw = width / 2;
  const n = pts.length;
  if (n < 2) return null;
  const pos = new Float32Array(n * 2 * 3);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[i === 0 ? 0 : i - 1];
    const next = pts[i === n - 1 ? n - 1 : i + 1];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    const x = pts[i][0], z = pts[i][1];
    const o = i * 6;
    pos[o] = x + nx * hw; pos[o + 1] = 0; pos[o + 2] = z + nz * hw;
    pos[o + 3] = x - nx * hw; pos[o + 4] = 0; pos[o + 5] = z - nz * hw;
    if (i < n - 1) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeWater(colorA, colorB, size) {
  waterUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(colorA) },
    uColor2: { value: new THREE.Color(colorB) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor, uColor2;
      varying vec2 vUv;
      void main(){
        float w = sin(vUv.x * 18.0 + uTime * 0.35) * 0.18
                + sin(vUv.y * 14.0 - uTime * 0.28) * 0.18;
        vec3 c = mix(uColor, uColor2, 0.5 + w);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  return mesh;
}

function makeTreeInstanced(trees) {
  const group = new THREE.Group();
  if (!trees.length) return group;
  const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1.1, 5);
  const leafG = new THREE.SphereGeometry(0.85, 6, 5);
  const coneG = new THREE.ConeGeometry(0.7, 2.4, 6);
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
  const leafM = new THREE.MeshLambertMaterial({ color: 0x3f7a38 });
  const darkM = new THREE.MeshLambertMaterial({ color: 0x2f5e28 });
  const n = trees.length;
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, n);
  const leaves = new THREE.InstancedMesh(leafG, leafM, n);
  const cones = new THREE.InstancedMesh(coneG, darkM, n);
  const dummy = new THREE.Object3D();
  trees.forEach((t, i) => {
    const x = t[0], z = t[1];
    const s = 1.6 + (Math.abs(Math.sin(x * 0.13 + z * 0.07)) * 1.1);
    const y0 = groundY(x, z);
    dummy.position.set(x, y0 + 0.55 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const isCypress = (i % 3 === 0);
    if (isCypress) {
      dummy.position.set(x, y0 + 1.7 * s, z);
      dummy.scale.set(s * 0.9, s * 1.2, s * 0.9);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    } else {
      dummy.position.set(x, y0 + 1.6 * s, z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
    }
  });
  trunks.castShadow = leaves.castShadow = cones.castShadow = false;
  group.add(trunks, leaves, cones);
  return group;
}

function makeLabelSprite(text, kind) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 384, 96);
  ctx.fillStyle = kind === 'harbour' ? 'rgba(15,40,60,0.55)' : 'rgba(40,32,22,0.45)';
  const r = 16;
  ctx.beginPath();
  ctx.moveTo(r, 20);
  ctx.arcTo(364, 20, 364, 76, r);
  ctx.arcTo(364, 76, 20, 76, r);
  ctx.arcTo(20, 76, 20, 20, r);
  ctx.arcTo(20, 20, 364, 20, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4efe4';
  ctx.font = 'bold 32px "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 50);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, opacity: 0.95 }));
  spr.scale.set(70, 18, 1);
  return spr;
}

function buildMap(data) {
  mapRoot = new THREE.Group();
  const landMat = new THREE.MeshLambertMaterial({ color: 0xd9c7a6 });
  const hinterMat = new THREE.MeshLambertMaterial({ color: 0xc2b394 });
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x6aa34c });
  const forestMat = new THREE.MeshLambertMaterial({ color: 0x4d7c3a });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x86b85c });
  const beachMat = new THREE.MeshLambertMaterial({ color: 0xe8d6a0 });
  const harbourMat = new THREE.MeshLambertMaterial({ color: 0x1e6f96 });
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a8680 });
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xf0e6d0 });
  const roadMat2 = new THREE.MeshLambertMaterial({ color: 0xe7dcc4 });

  mapRoot.add(makeWater(0x156a96, 0x3aa8c0, 20000));

  // Flat land at sea level (LAND_H, just above the water). The heightmap is
  // only a land/sea mask plus land classes — no mountains. No houses on the sea.
  mapRoot.add(buildTerrainMesh());

  // Sharp OSM overlays on the flat plane so parks, beaches and the city
  // footprint stay crisp (the mask is 25 m).
  mapRoot.add(meshFromPolygons(data.land || [], 0.04, LAND_H + 0.02, landMat));
  const parkRings = [], forestRings = [], grassRings = [];
  for (const p of data.parks || []) {
    const dest = p.k === 'forest' ? forestRings : p.k === 'grass' ? grassRings : parkRings;
    for (const rings of p.rings || []) dest.push(rings);
  }
  mapRoot.add(meshFromPolygons(parkRings, 0.08, LAND_H + 0.05, parkMat));
  mapRoot.add(meshFromPolygons(forestRings, 0.08, LAND_H + 0.05, forestMat));
  mapRoot.add(meshFromPolygons(grassRings, 0.08, LAND_H + 0.05, grassMat));
  for (const b of data.beaches || []) {
    mapRoot.add(meshFromPolygons(b.rings, 0.08, LAND_H + 0.05, beachMat));
  }

  // harbour water slightly above sea, in the punched inlets
  for (const h of data.harbours || []) {
    mapRoot.add(meshFromPolygons(h.rings, 0.45, 0.02, harbourMat));
  }
  for (const p of data.piers || []) {
    mapRoot.add(meshFromPolygons(p.rings, 1.1, 2.1, pierMat));
  }

  const roadGroup = new THREE.Group();
  roadGroup.userData.roads = true;
  for (const r of data.roads || []) {
    const geom = roadGeometry(r.pts, r.w);
    if (!geom) continue;
    const pos = geom.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundY(pos.getX(i), pos.getZ(i)) + 0.08);
    }
    geom.computeVertexNormals();
    const mat = ((r.c === 'primary' || r.c === 'secondary') ? roadMat : roadMat2).clone();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
  }
  roadsGroup = roadGroup;
  mapRoot.add(roadGroup);

  // skip trees very close to the plot
  const px = data.plot.x, pz = data.plot.z;
  const trees = (data.trees || []).filter((t) => Math.hypot(t[0] - px, t[1] - pz) > 30);
  mapRoot.add(makeTreeInstanced(trees));

  for (const lb of data.labels || []) {
    const spr = makeLabelSprite(lb.name, lb.kind);
    spr.position.set(lb.x, groundY(lb.x, lb.z) + 28, lb.z);
    spr.userData.mapLabel = true;
    mapRoot.add(spr);
  }

  scene.add(mapRoot);
  return data.plot;
}

function ensureLabels() {
  if (!labelLayer) labelLayer = makeLabelLayer();
}

function placeHouse(plot) {
  house = createHouse({ seed: currentSeed });
  house.group.position.set(plot.x, groundY(plot.x, plot.z) + 0.12, plot.z);
  house.group.rotation.y = plot.rot || 0;
  house.setLevel(currentLevel);
  house.setLocalExtrasVisible(false); // map uses the harbour yacht, not the local one
  scene.add(house.group);

  ensureLabels();
  houseTag = labelLayer.add('');
  applyHouseLabel();
  updateHouseTagPos();

  // pin light
  plotLight = new THREE.PointLight(0xffd27a, 1.6, 80, 2);
  plotLight.position.set(0, 8, 0);
  house.group.add(plotLight);

  // a slim gold pin above very early levels so the tent is findable from far
  const pinGeom = new THREE.ConeGeometry(0.45, 1.4, 8);
  const pin = new THREE.Mesh(pinGeom, new THREE.MeshBasicMaterial({ color: 0xe8c45a }));
  pin.rotation.x = Math.PI;
  pin.position.y = 8;
  pin.userData.pin = true;
  house.group.add(pin);

  placeYachtAndLink();
}

function updateHouseTagPos() {
  if (!houseTag || !house) return;
  const wp = new THREE.Vector3();
  house.group.getWorldPosition(wp);
  const h = house.getHeight();
  if (MODE === 'cell') {
    // Keep the crown/spire clear; the caption bar already names the house.
    houseTag.setWorld(wp.x - 16, wp.y + Math.min(h * 0.62, h - 8), wp.z);
  } else {
    houseTag.setWorld(wp.x, wp.y + h + TAG_LIFT, wp.z);
  }
}

function clearPlotTents() {
  for (const item of plotTents) {
    if (item.house && item.house.group) scene.remove(item.house.group);
    if (item.tag) item.tag.remove();
  }
  plotTents = [];
}

function placePlotTents() {
  clearPlotTents();
  if (DEMO_N > 1 || MODE !== 'map' || !allResidents.length) return;
  ensureLabels();
  const selI = selectedResident ? selectedResident.i : 0;
  for (const r of allResidents) {
    if (r.i === selI) continue; // the hero house already stands on this plot
    const h = createHouse({ seed: r.seed || r.name || ('house_' + r.id) });
    h.setLevel(r.level || 1);
    h.setLocalExtrasVisible(false);
    h.group.position.set(r.x, groundY(r.x, r.z) + 0.12, r.z);
    if (h.setNightFactor) h.setNightFactor(lastSky.night || 0);
    scene.add(h.group);
    const tag = labelLayer.add('');
    tag.set(publicLabel(r), publicSub(r));
    const hh = h.getHeight ? h.getHeight() : heightForLevel(r.level || 1);
    tag.setWorld(r.x, groundY(r.x, r.z) + 0.12 + hh + TAG_LIFT, r.z);
    tag.show(true);
    plotTents.push({ i: r.i, resident: r, house: h, tag });
  }
}

function updatePlotTentTags() {
  if (!plotTents.length) return;
  const dist = (camera && controls) ? camera.position.distanceTo(controls.target) : 0;
  const show = dist <= 480;
  for (const item of plotTents) {
    if (!item.tag || !item.house) continue;
    const wp = new THREE.Vector3();
    item.house.group.getWorldPosition(wp);
    const hh = item.house.getHeight();
    item.tag.setWorld(wp.x, wp.y + hh + TAG_LIFT, wp.z);
    item.tag.show(show && item.house.group.visible);
    if (item.house.tick) item.house.tick(clock ? clock.elapsedTime : 0);
  }
}

function frameAllResidents() {
  if (!allResidents.length || !camera || !controls) return;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of allResidents) {
    if (r.x < minX) minX = r.x;
    if (r.x > maxX) maxX = r.x;
    if (r.z < minZ) minZ = r.z;
    if (r.z > maxZ) maxZ = r.z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(48, maxX - minX, maxZ - minZ);
  const gy = groundY(cx, cz);
  const dist = span * 2.15 + 36;
  camera.position.set(cx + dist * 0.55, gy + span * 1.05 + 22, cz + dist * 1.05);
  controls.target.set(cx, gy + 5, cz);
  controls.update();
}

function placeYachtAndLink() {
  if (yachtObj) {
    scene.remove(yachtObj.group);
    yachtObj = null;
  }
  if (yachtLink) {
    scene.remove(yachtLink);
    yachtLink = null;
  }
  if (yachtPier) {
    scene.remove(yachtPier);
    yachtPier = null;
  }
  if (yachtTag) {
    yachtTag.remove();
    yachtTag = null;
  }
  if (currentLevel < 15 || !monacoData) return;

  const dock = YACHT_DOCK;
  yachtObj = createYacht(currentLevel, currentSeed);
  yachtObj.group.position.set(dock.x, 0.55, dock.z);
  yachtObj.group.rotation.y = dock.rot;
  yachtObj.group.userData.baseY = 0.55;
  scene.add(yachtObj.group);

  // simple timber pier under / beside the yacht
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a7a62 });
  const len = yachtObj.length || yachtLengthForLevel(currentLevel);
  yachtPier = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, Math.min(18, len * 0.6 + 4)), pierMat);
  deck.position.set(dock.x - 6, 0.9, dock.z);
  yachtPier.add(deck);
  const posts = new THREE.MeshLambertMaterial({ color: 0x5a4a36 });
  for (const z of [-6, 0, 6]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 6), posts);
    c.position.set(dock.x - 7.4, 0.6, dock.z + z);
    yachtPier.add(c);
  }
  scene.add(yachtPier);

  const fromP = currentPlot();
  const from = new THREE.Vector3(fromP.x, groundY(fromP.x, fromP.z) + 2.5, fromP.z);
  const to = new THREE.Vector3(dock.x, 3.2, dock.z);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    const x = from.x + (to.x - from.x) * k;
    const z = from.z + (to.z - from.z) * k;
    const y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 10;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({
    color: 0xe8c45a,
    dashSize: 4,
    gapSize: 2.4,
    transparent: true,
    opacity: 0.92,
  });
  yachtLink = new THREE.Line(geo, mat);
  yachtLink.computeLineDistances();
  scene.add(yachtLink);

  ensureLabels();
  yachtTag = labelLayer.add('yacht');
  yachtTag.set(publicLabel(selectedResident || RESIDENT), 'يخت');
  yachtTag.setWorld(dock.x, (yachtObj.group.position.y || 0.55) + (yachtObj.height || 2) + TAG_LIFT, dock.z);
}

function setSeed(name, rebuild = true) {
  currentSeed = String(name || 'mohammad_1').trim() || 'mohammad_1';
  RESIDENT.id = currentSeed;
  RESIDENT.name = currentSeed;
  if (house && rebuild) {
    house.setSeed(currentSeed);
    house.setLevel(currentLevel);
    house.setLocalExtrasVisible(MODE !== 'map');
  }
  applyHouseLabel();
  updateHouseTagPos();
  if (MODE === 'map') placeYachtAndLink();
  const seedEl = document.getElementById('seedInput');
  if (seedEl && !(selectedResident && selectedResident.anonymous)) { if (seedEl.value !== currentSeed) seedEl.value = currentSeed; }
  return currentSeed;
}

function arNum(n) {
  return String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function overviewCamera() {
  const n = crowd ? crowd.count : 1;
  const extra = n > 2000 ? Math.min(2800, Math.sqrt(n) * 8) : 0;
  const tall = (typeof window !== 'undefined') && window.innerHeight > window.innerWidth * 1.15;
  if (tall) {
    // Public mobile: lower and closer so the colourful city fills the screen,
    // with only a thin strip of sea and distant mountains on the horizon.
    const target = new THREE.Vector3(150, groundY(150, -20) + 10, -20);
    const pos = new THREE.Vector3(285, 168 + extra * 0.1, 560 + extra * 0.22);
    return { pos, target };
  }
  const target = new THREE.Vector3(120, groundY(120, 50) + 8, 50);
  const pos = new THREE.Vector3(400, 250 + extra * 0.2, 980 + extra * 0.35);
  return { pos, target };
}

function currentPlot() {
  if (house) return { x: house.group.position.x, z: house.group.position.z };
  if (selectedResident) return { x: selectedResident.x, z: selectedResident.z };
  return monacoData ? monacoData.plot : { x: 160, z: 65 };
}

function houseCamera(level, plot) {
  const p = plot || currentPlot();
  const h = house ? house.getHeight() : heightForLevel(level || currentLevel);
  const k = VERTICAL ? 1.32 : 1;
  // Extra distance / slightly lower aim so the HTML name tag above the crown stays in frame.
  const dist = (22 + h * 1.62 + Math.max(0, h - 25) * 0.4) * k;
  const camH = (10 + h * 0.62) * (VERTICAL ? 1.2 : 1);
  const gy = groundY(p.x, p.z);
  const pos = new THREE.Vector3(p.x + dist * 0.58, gy + camH, p.z + dist);
  const target = new THREE.Vector3(p.x, gy + h * (VERTICAL ? 0.42 : 0.36), p.z);
  return { pos, target };
}

function followPose(kind, timeSec) {
  if (kind === 'house') return houseCamera(currentLevel);
  if (kind === 'yacht') {
    if (!yachtObj || currentLevel < 15) return houseCamera(currentLevel);
    const p = yachtObj.group.position;
    const h = yachtObj.height || 4;
    const ang = (timeSec || 0) * 0.25;
    const r = 16 + (yachtObj.length || 20) * 0.35;
    return {
      pos: new THREE.Vector3(p.x + Math.cos(ang) * r, 6 + h * 0.9, p.z + Math.sin(ang) * r * 1.1),
      target: new THREE.Vector3(p.x, 1.2 + h * 0.45, p.z),
    };
  }
  if (kind === 'car') {
    if (house && house.setDrive) house.setDrive(true);
    const car = house && house.getHeroCarWorld ? house.getHeroCarWorld() : null;
    if (!car) return houseCamera(currentLevel);
    const p = car.position;
    const obj = car.object;
    const back = new THREE.Vector3(0, 0, -1);
    if (obj) {
      back.set(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
    }
    return {
      pos: new THREE.Vector3(p.x + back.x * 11 + 2, p.y + 5.4, p.z + back.z * 11 + 3),
      target: new THREE.Vector3(p.x, p.y + 1.1, p.z),
    };
  }
  return null;
}

const CAM_CYCLE = ['free', 'house', 'yacht']; // car follow postponed with the circuit
const CAM_AR = { free: 'حرة', house: 'البيت', yacht: 'اليخت', car: 'السيارة' };
const SKY_AR = { auto: 'تلقائي', day: 'نهار', night: 'ليل' };

function setCamMode(mode, instant = false) {
  const prev = camMode;
  camMode = mode;
  if (house && house.setDrive) house.setDrive(mode === 'car');
  if (controls) {
    controls.enabled = mode === 'free';
  }
  const lab = $('camModeLabel');
  if (lab) lab.textContent = CAM_AR[mode] || mode;
  if (mode === 'free') return camMode;
  const v = followPose(mode, clock ? clock.getElapsedTime() : 0);
  if (v) {
    if (instant) {
      camera.position.copy(v.pos);
      controls.target.copy(v.target);
      controls.update();
      camera.position.copy(v.pos);
      controls.target.copy(v.target);
    } else if (prev === 'free' || instant === false) {
      flyTo(v.pos, v.target, 1.2);
    }
  }
  return camMode;
}

function cycleCamMode() {
  if (tour && tour.pause) tour.pause();
  let i = CAM_CYCLE.indexOf(camMode);
  for (let k = 0; k < CAM_CYCLE.length; k++) {
    i = (i + 1) % CAM_CYCLE.length;
    const next = CAM_CYCLE[i];
    if (next === 'yacht' && !(currentLevel >= 15 && yachtObj)) continue;
    if (next === 'car' && !(house && house.hasCar && house.hasCar())) continue;
    setCamMode(next, false);
    return next;
  }
  setCamMode('free');
  return 'free';
}

function updateFollow(timeSec) {
  if (camMode === 'free' || !camera) return;
  if (fly) return;
  const v = followPose(camMode, timeSec);
  if (!v) return;
  const k = RECORD ? 1 : 0.14;
  camera.position.lerp(v.pos, k);
  controls.target.lerp(v.target, k);
  controls.update();
  if (RECORD) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
  }
}

function maybeReframeHouse() {
  if (RECORD || MODE !== 'map' || !monacoData || !camera) return;
  if (camMode !== 'free' && camMode !== 'house') return;
  const p = currentPlot();
  const cur = camera.position.distanceTo(new THREE.Vector3(p.x, groundY(p.x, p.z), p.z));
  if (cur < 520) setCameraView('house', false);
}

function lerpV(a, b, t) {
  return new THREE.Vector3().lerpVectors(a, b, t);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}


const CAM_BOUNDS = { minX: -2000, maxX: 2000, minZ: -2200, maxZ: 2200 };

function clampFreeCamera() {
  if (!camera || !controls) return;
  if (camMode !== 'free') return;
  if (wedding && wedding.isCam()) return;
  const t = controls.target;
  t.x = Math.max(CAM_BOUNDS.minX, Math.min(CAM_BOUNDS.maxX, t.x));
  t.z = Math.max(CAM_BOUNDS.minZ, Math.min(CAM_BOUNDS.maxZ, t.z));
  const tgtMin = (typeof groundY === 'function' ? groundY(t.x, t.z) : 2.6) + 1.0;
  if (t.y < tgtMin) t.y = tgtMin;
  const c = camera.position;
  c.x = Math.max(CAM_BOUNDS.minX - 500, Math.min(CAM_BOUNDS.maxX + 500, c.x));
  c.z = Math.max(CAM_BOUNDS.minZ - 500, Math.min(CAM_BOUNDS.maxZ + 500, c.z));
  const camMin = (typeof groundY === 'function' ? groundY(c.x, c.z) : 2.6) + 8;
  if (c.y < camMin) c.y = camMin;
}

let tapRipple = null;
let tapRippleAge = 0;
const TAP_RIPPLE_DUR = 0.95;

function ensureTapRipple() {
  if (tapRipple) return tapRipple;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.7, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfff6df,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  const g = new THREE.Group();
  g.add(ring, disc);
  g.visible = false;
  g.userData.ring = ring;
  g.userData.disc = disc;
  scene.add(g);
  tapRipple = g;
  return g;
}

function showTapRipple(x, y, z) {
  const g = ensureTapRipple();
  g.position.set(x, y, z);
  g.scale.set(1, 1, 1);
  g.visible = true;
  g.userData.ring.material.opacity = 0.95;
  g.userData.disc.material.opacity = 0.55;
  tapRippleAge = 0;
}

function tickTapRipple(dt) {
  if (!tapRipple || !tapRipple.visible) return;
  tapRippleAge += Math.max(0, dt || 0.016);
  const u = Math.min(1, tapRippleAge / TAP_RIPPLE_DUR);
  const s = 1 + u * 3.2;
  tapRipple.scale.set(s, 1, s);
  tapRipple.userData.ring.material.opacity = 0.95 * (1 - u);
  tapRipple.userData.disc.material.opacity = 0.55 * (1 - u) * (1 - u);
  if (u >= 1) tapRipple.visible = false;
}

function pickGround(clientX, clientY) {
  if (!camera || !renderer) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width || 1, h = rect.height || 1;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / w) * 2 - 1,
    -((clientY - rect.top) / h) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, camera);
  if (mapRoot) {
    const hits = ray.intersectObject(mapRoot, true);
    if (hits && hits.length) {
      const p = hits[0].point;
      return { x: p.x, z: p.z, y: groundY(p.x, p.z) };
    }
  }
  const hit = new THREE.Vector3();
  const guessY = (controls && controls.target) ? controls.target.y : 0;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -guessY);
  if (ray.ray.intersectPlane(plane, hit)) {
    return { x: hit.x, z: hit.z, y: groundY(hit.x, hit.z) };
  }
  plane.constant = 0;
  if (ray.ray.intersectPlane(plane, hit)) {
    return { x: hit.x, z: hit.z, y: groundY(hit.x, hit.z) };
  }
  return null;
}

function flyToPoint(x, z, dur = 0.9) {
  if (!camera || !controls) return;
  if (tour && tour.pause) tour.pause();
  setCamMode('free', true);
  const gy = groundY(x, z);
  const toT = new THREE.Vector3(x, gy + 1.2, z);
  const offset = camera.position.clone().sub(controls.target);
  const toP = toT.clone().add(offset);
  const camMin = groundY(toP.x, toP.z) + 8;
  if (toP.y < camMin) toP.y = camMin;
  toP.x = Math.max(CAM_BOUNDS.minX - 500, Math.min(CAM_BOUNDS.maxX + 500, toP.x));
  toP.z = Math.max(CAM_BOUNDS.minZ - 500, Math.min(CAM_BOUNDS.maxZ + 500, toP.z));
  toT.x = Math.max(CAM_BOUNDS.minX, Math.min(CAM_BOUNDS.maxX, toT.x));
  toT.z = Math.max(CAM_BOUNDS.minZ, Math.min(CAM_BOUNDS.maxZ, toT.z));
  flyTo(toP, toT, dur);
  showTapRipple(toT.x, gy + 0.18, toT.z);
}

function bindTapToFly() {
  const canvas = renderer && renderer.domElement;
  if (!canvas || canvas.__tapToFlyBound) return;
  canvas.__tapToFlyBound = true;
  const pointers = new Set();
  let tap = null;
  let skipBecauseWedding = false;
  const THRESH = 10;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) { tap = null; return; }
    skipBecauseWedding = !!(wedding && wedding.isCam());
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dragged: false };
  }, { passive: true });
  canvas.addEventListener('pointermove', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > THRESH) tap.dragged = true;
  }, { passive: true });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    const rec = tap;
    if (!rec || e.pointerId !== rec.id) {
      if (pointers.size === 0) tap = null;
      return;
    }
    tap = null;
    if (skipBecauseWedding) return; // wedding cam consumes this tap as an exit
    if (rec.dragged) return;
    if (performance.now() - rec.t > 450) return;
    if (camMode !== 'free') return;
    if (MODE !== 'map' || RECORD) return;
    const hit = pickGround(rec.x, rec.y);
    if (!hit) return;
    flyToPoint(hit.x, hit.z);
  }
  canvas.addEventListener('pointerup', endPointer, { passive: true });
  canvas.addEventListener('pointercancel', endPointer, { passive: true });
}

function setCameraView(view, instant = false) {
  if (tour && tour.pause) tour.pause();
  if (view === 'overview' || view === 'free') setCamMode('free', true);
  if (view === 'house' || view === 'yacht' || view === 'car') {
    setCamMode(view === 'house' ? 'house' : view, instant);
    if (view !== 'house') return;
  }
  const v = (view === 'house') ? houseCamera(currentLevel) : overviewCamera();
  if (instant) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    controls.update();
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
  } else {
    flyTo(v.pos, v.target, 1.6);
  }
}

let fly = null;
function flyTo(pos, target, dur) {
  fly = {
    t0: performance.now(),
    dur: dur * 1000,
    fromP: camera.position.clone(),
    fromT: controls.target.clone(),
    toP: pos.clone(),
    toT: target.clone(),
  };
}

function updateFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.dur);
  const s = smooth(k);
  camera.position.lerpVectors(fly.fromP, fly.toP, s);
  controls.target.lerpVectors(fly.fromT, fly.toT, s);
  controls.update();
  if (k >= 1) fly = null;
}

function applyLevel(n, pop = false) {
  currentLevel = Math.max(1, Math.min(30, n | 0));
  if (house) {
    house.setLevel(currentLevel);
    if (MODE === 'map') house.setLocalExtrasVisible(false);
    else house.setLocalExtrasVisible(true);
    updateHouseTagPos();
    if (plotLight) plotLight.position.y = Math.max(6, house.getHeight() * 0.35);
    house.group.traverse((o) => { if (o.userData.pin) o.visible = currentLevel <= 6; });
    if (pop) house.pop();
  }
  if (MODE === 'map') placeYachtAndLink();
  if (levelSlider) levelSlider.value = String(currentLevel);
  if (levelLabel) {
    const info = levelsData[currentLevel - 1];
    const pts = (currentLevel - 1) * 50; // new rule: every 50 points = +1 level
    const name = info ? (info.ar + ' / ' + info.en) : '';
    levelLabel.textContent = `لفل ${currentLevel} — ${name}  (${pts} نقطة)`;
  }
  if (badgeEl && !RECORD) {
    const info = levelsData[currentLevel - 1];
    badgeEl.textContent = info ? `لفل ${currentLevel}  ·  ${info.ar}` : `لفل ${currentLevel}`;
  }
  if (MODE === 'cell') setCellBar(currentLevel, currentSeed);
}

function selectResident(r, fly = true) {
  if (!r) return;
  const prev = selectedResident;
  selectedResident = r;
  currentSeed = r.seed || r.name;
  currentLevel = r.level || currentLevel;
  RESIDENT.id = r.name;
  RESIDENT.name = r.name;
  if (crowd && prev && prev.i !== r.i) crowd.hideIndex(prev.i, false);
  if (crowd) crowd.hideIndex(r.i, true);
  if (house) {
    house.setSeed(currentSeed);
    house.setLevel(currentLevel);
    house.group.position.set(r.x, groundY(r.x, r.z) + 0.12, r.z);
    house.setLocalExtrasVisible(MODE !== 'map');
    house.group.visible = true;
    if (plotLight) plotLight.position.y = Math.max(6, house.getHeight() * 0.35);
  }
  if (houseTag) {
    applyHouseLabel();
    houseTag.show(true);
  }
  updateHouseTagPos();
  if (MODE === 'map' && DEMO_N <= 1) placePlotTents();
  if (MODE === 'map') placeYachtAndLink();
  const seedEl = document.getElementById('seedInput');
  if (seedEl && !(selectedResident && selectedResident.anonymous)) { if (seedEl.value !== currentSeed) seedEl.value = currentSeed; }
  if (levelSlider) levelSlider.value = String(currentLevel);
  if (fly) {
    setCamMode('house', false);
    setCameraView('house');
  }
}

function searchResident(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return false;
  let found = null;
  if (crowd && crowd.find) found = crowd.find(s);
  if (!found && allResidents.length) {
    found = allResidents.find((r) => {
      const name = String(r.name || '').toLowerCase();
      const label = String(r.label || '').toLowerCase();
      const id = String(r.id || '');
      return name.includes(s) || label.includes(s) || id === s || arNum(r.id || '') === s;
    });
  }
  const lab = publicLabel(selectedResident || RESIDENT).toLowerCase();
  if (!found && (lab.includes(s) || String(RESIDENT.name || '').toLowerCase().includes(s) || s === '1' || s === '١')) {
    found = selectedResident || { name: RESIDENT.name, seed: currentSeed, level: currentLevel, x: currentPlot().x, z: currentPlot().z, i: 0, example: true };
  }
  if (found) {
    if (tour && tour.pause) tour.pause();
    selectResident(found, true);
    if (foundMsg) {
      foundMsg.textContent = found.example ? (`لقينا بيت ${publicLabel(found)} (مثال)`) : (`لقينا ${publicLabel(found)}`);
      foundMsg.hidden = false;
    }
    return true;
  }
  if (foundMsg) {
    foundMsg.textContent = 'ما في بيت بهاد الاسم بهالتجربة';
    foundMsg.hidden = false;
  }
  return false;
}

function displayHandle(r) {
  if (!r) return '';
  let n = String(r.name || '');
  n = n.replace(/^example_/, '');
  n = n.replace(/_\d+$/, '');
  if (/mohammad/i.test(n)) {
    const alt = ['aisha', 'yusuf', 'lina', 'karim', 'noor', 'omar', 'sara', 'hana', 'ziad', 'rami'];
    n = alt[(r.i || 1) % alt.length];
  }
  return n;
}

function updateCrowdLabels() {
  if (!crowd || !labelLayer || MODE !== 'map') return;
  if (PROMO && !promoCrowdLabels) {
    for (const tag of crowdTags) tag.show(false);
    return;
  }
  const dist = camera && controls ? camera.position.distanceTo(controls.target) : 0;
  if (!promoCrowdLabels && dist > 380) {
    for (const tag of crowdTags) tag.show(false);
    return;
  }
  const focus = (promoCrowdLabels && controls)
    ? { x: controls.target.x, z: controls.target.z }
    : currentPlot();
  const near = crowd.nearby(focus.x, focus.z, 8, promoCrowdLabels ? 100 : (camMode === 'free' ? 220 : 140));
  while (crowdTags.length < 8) crowdTags.push(labelLayer.add('crowd'));
  const used = new Set();
  let slot = 0;
  for (const r of near) {
    if (selectedResident && r.i === selectedResident.i) continue;
    if (slot >= crowdTags.length) break;
    const tag = crowdTags[slot++];
    if (promoCrowdLabels) tag.set(displayHandle(r), '');
    else tag.set(r.name, 'L' + r.level + ' · مثال');
    const h = heightForLevel(r.level);
    tag.setWorld(r.x, groundY(r.x, r.z) + Math.min(h, 40) + 3, r.z);
    tag.show(true);
    used.add(tag);
  }
  for (const tag of crowdTags) {
    if (!used.has(tag)) tag.show(false);
  }
}

function updateStats() {
  const n = crowd ? crowd.count : Math.max(1, allResidents.length || 1);
  const countEl = $('residentsCount');
  const hintEl = $('residentsHint');
  if (countEl) countEl.textContent = arNum(n) + ' ساكن';
  if (hintEl) {
    if (DEMO_N > 1) hintEl.textContent = 'أسماء تجريبية · example';
    else if (n === 1) hintEl.textContent = 'أول بيت بالدولة';
    else hintEl.textContent = 'سكّان الدولة';
  }
  const fpsEl = $('fpsMeter');
  if (fpsEl && DEMO_N > 1) {
    fpsEl.style.display = 'block';
    fpsEl.textContent = lastFps ? (Math.round(lastFps) + ' FPS') : '…';
  }
}

/* ---------------- demo timeline (seconds) ----------------
  0.0–4.0  overview orbit
  4.0–7.0  fly to empty plot (house hidden until 6.6)
  7.0–9.0  L1 build (drop + pop)
  9.0–19.0 montage L1→L30 (~0.333s each)
 19.0–21.0 hold L30 close-up
 21.0–24.0 pull back to a mid overview showing house + harbour
*/
export const DEMO_DURATION = 30;
export const PROMO_DURATION = 30;
export const PROMO_V4_DURATION = 44;

function demoState(t) {
  const ov = overviewCamera();
  const mid = {
    pos: new THREE.Vector3(340, 300, 620),
    target: new THREE.Vector3(
      (monacoData.plot.x + YACHT_DOCK.x) * 0.5,
      groundY(monacoData.plot.x, monacoData.plot.z) + 18,
      (monacoData.plot.z + YACHT_DOCK.z) * 0.5 + 30
    ),
  };
  let view, level, houseVisible, houseY, houseScale, badge, pin;
  let tod = 0.46;
  let cam = 'free';

  if (t < 3.5) {
    const k = t / 3.5;
    const ang = -0.25 + k * 0.55;
    const r = 1550;
    view = {
      pos: new THREE.Vector3(
        80 + Math.sin(ang) * r * 0.45,
        980 - k * 80,
        200 + Math.cos(ang) * r
      ),
      target: ov.target,
    };
    level = 1;
    houseVisible = false;
    houseY = 0;
    houseScale = 1;
    badge = '';
    pin = false;
    tod = 0.46;
    cam = 'free';
  } else if (t < 6.5) {
    const k = smooth((t - 3.5) / 3);
    const hc = houseCamera(1);
    const ang = -0.25 + 0.55;
    const r = 1550;
    const from = new THREE.Vector3(80 + Math.sin(ang) * r * 0.45, 900, 200 + Math.cos(ang) * r);
    view = { pos: lerpV(from, hc.pos, k), target: lerpV(ov.target, hc.target, k) };
    level = 1;
    houseVisible = t >= 6.15;
    const drop = t >= 6.15 ? Math.min(1, (t - 6.15) / 0.35) : 0;
    houseY = (1 - smooth(drop)) * 10;
    houseScale = 0.2 + 0.8 * smooth(drop);
    badge = t >= 6.15 ? 'لفل 1  ·  خيمة' : '';
    pin = true;
    tod = 0.48;
    cam = 'free';
  } else if (t < 8.4) {
    const k = (t - 6.5) / 1.9;
    const hc = houseCamera(1);
    view = { pos: hc.pos, target: hc.target };
    level = 1;
    houseVisible = true;
    houseY = Math.sin(Math.min(1, k) * Math.PI) * 0.4 * (k < 0.5 ? 1 : 0);
    houseScale = 1 + (k < 0.4 ? Math.sin(k / 0.4 * Math.PI) * 0.12 : 0);
    badge = 'لفل 1  ·  خيمة';
    pin = true;
    tod = 0.5;
    cam = 'house';
  } else if (t < 16.4) {
    const k = (t - 8.4) / 8;
    const lv = Math.min(30, 1 + Math.floor(k * 30));
    const h = heightForLevel(lv);
    const ang = k * 0.9;
    const dist = 22 + h * 1.62 + Math.max(0, h - 25) * 0.4;
    const camH = 10 + h * 0.62;
    const p = monacoData.plot;
    const vk = VERTICAL ? 1.32 : 1;
    view = {
      pos: new THREE.Vector3(
        p.x + Math.sin(0.4 + ang) * dist * vk,
        groundY(p.x, p.z) + camH * (VERTICAL ? 1.2 : 1),
        p.z + Math.cos(0.4 + ang) * dist * vk
      ),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + h * (VERTICAL ? 0.42 : 0.36), p.z),
    };
    level = lv;
    houseVisible = true;
    houseY = 0;
    const frac = (k * 30) % 1;
    houseScale = 1 + (frac < 0.35 ? Math.sin((frac / 0.35) * Math.PI) * 0.1 : 0);
    const info = levelsData[lv - 1];
    badge = info ? `لفل ${lv}  ·  ${info.ar}` : `لفل ${lv}`;
    pin = lv <= 6;
    tod = 0.5 + k * 0.12; // noon toward late afternoon
    cam = 'house';
  } else if (t < 19.2) {
    const k = (t - 16.4) / 2.8;
    view = houseCamera(30);
    level = 30;
    houseVisible = true;
    houseY = 0;
    houseScale = 1;
    badge = 'لفل 30  ·  ناطحة سحاب';
    pin = false;
    tod = 0.62 + k * 0.16; // sunset
    cam = 'house';
  } else if (t < 22.2) {
    view = houseCamera(30);
    level = 30;
    houseVisible = true;
    houseY = 0;
    houseScale = 1;
    badge = 'ليل على دولة الأغنياء';
    pin = false;
    tod = 0.02;
    cam = 'house';
  } else if (t < 25.6) {
    const k = (t - 22.2) / 3.4;
    level = 30;
    houseVisible = true;
    houseY = 0;
    houseScale = 1;
    badge = 'يخت صاحب البيت';
    pin = false;
    tod = 0.04;
    cam = 'yacht';
    // temporary pose; applyDemo will use followPose after yacht exists
    const dock = YACHT_DOCK;
    const ang = k * 1.4;
    const r = 28;
    view = {
      pos: new THREE.Vector3(dock.x + Math.cos(ang) * r, 12, dock.z + Math.sin(ang) * r * 1.1),
      target: new THREE.Vector3(dock.x, 3.2, dock.z),
    };
  } else if (t < 27.8) {
    level = 30;
    houseVisible = true;
    houseY = 0;
    houseScale = 1;
    badge = 'سيارة صاحب البيت';
    pin = false;
    tod = 0.05;
    cam = 'car';
    view = houseCamera(30);
  } else {
    const k = smooth(Math.min(1, (t - 27.8) / 2.2));
    const hc = houseCamera(30);
    view = { pos: lerpV(hc.pos, mid.pos, k), target: lerpV(hc.target, mid.target, k) };
    level = 30;
    houseVisible = true;
    houseY = 0;
    houseScale = 1;
    badge = k < 0.45 ? 'دولة الأغنياء' : '';
    pin = false;
    tod = 0.06;
    cam = 'free';
  }

  return { view, level, houseVisible, houseY, houseScale, badge, pin, tod, cam };
}

function applyDemo(t) {
  const s = demoState(Math.max(0, Math.min(DEMO_DURATION, t)));
  if (s.level !== currentLevel) applyLevel(s.level, false);
  camMode = s.cam || 'free';
  if (house && house.setDrive) house.setDrive(camMode === 'car');
  if (controls) controls.enabled = false;
  let view = s.view;
  if (camMode === 'yacht' || camMode === 'car') {
    const fp = followPose(camMode, t);
    if (fp) view = fp;
  }
  camera.position.copy(view.pos);
  controls.target.copy(view.target);
  controls.update();
  camera.position.copy(view.pos);
  controls.target.copy(view.target);
  if (house) {
    house.group.visible = s.houseVisible;
    house.group.position.y = groundY(house.group.position.x, house.group.position.z) + 0.12 + s.houseY;
    house.group.scale.set(s.houseScale, s.houseScale, s.houseScale);
    house.group.traverse((o) => {
      if (o.userData.pin) o.visible = !!s.pin && s.houseVisible;
    });
  }
  if (houseTag) houseTag.show(s.houseVisible);
  if (yachtObj) yachtObj.group.visible = s.houseVisible && currentLevel >= 15;
  if (yachtLink) yachtLink.visible = s.houseVisible && currentLevel >= 15;
  if (yachtPier) yachtPier.visible = s.houseVisible && currentLevel >= 15;
  if (yachtTag) yachtTag.show(s.houseVisible && currentLevel >= 15);
  if (badgeEl) {
    if (s.badge) {
      badgeEl.textContent = s.badge;
      badgeEl.hidden = false;
    } else {
      badgeEl.hidden = true;
    }
  }
  if (dayNight) lastSky = dayNight.update(0, s.tod);
  if (lamps) lamps.setNight(lastSky.night);
  if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
  if (crowd && crowd.setNight) crowd.setNight(lastSky.night);
}


function setRoadAmount(a) {
  const k = Math.max(0, Math.min(1, a));
  if (!roadsGroup) return;
  roadsGroup.visible = k > 0.02;
  roadsGroup.traverse((o) => {
    if (!o.material) return;
    o.material.transparent = k < 0.995;
    o.material.opacity = k;
    o.material.depthWrite = k > 0.8;
  });
}

function applyPromo(t) {
  const T = Math.max(0, Math.min(PROMO_DURATION, t));
  const p = monacoData.plot;
  const dock = YACHT_DOCK;
  const landTarget = new THREE.Vector3(80, groundY(80, 200), 200);

  function wideAt(k) {
    const ang = -0.12 + k * 0.18;
    const r = 1500;
    return {
      pos: new THREE.Vector3(80 + Math.sin(ang) * r * 0.42, 900 - k * 40, 200 + Math.cos(ang) * r),
      target: landTarget.clone(),
    };
  }
  const midRoads = {
    pos: new THREE.Vector3(280, 520, 780),
    target: new THREE.Vector3(80, groundY(80, 220), 220),
  };
  const tight1 = {
    pos: new THREE.Vector3(p.x + 22, groundY(p.x, p.z) + 14.5, p.z + 28),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 2.3, p.z),
  };
  const nightHero = {
    pos: new THREE.Vector3(p.x + 110, groundY(p.x, p.z) + 82, p.z + 168),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 48, p.z),
  };
  const yachtPeek = {
    pos: new THREE.Vector3(dock.x + 28, groundY(p.x, p.z) + 78, dock.z + 110),
    target: new THREE.Vector3((p.x * 0.45 + dock.x * 0.55), groundY(p.x, p.z) + 5, (p.z * 0.45 + dock.z * 0.55)),
  };
  const top = {
    pos: new THREE.Vector3(90, 1480, 560),
    target: new THREE.Vector3(80, groundY(80, 200), 200),
  };
  const ctaView = {
    pos: new THREE.Vector3(p.x + 210, groundY(p.x, p.z) + 180, p.z + 320),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 42, p.z),
  };
  function camLv(lv, ang, zoom) {
    const h = heightForLevel(lv);
    const dist = (18 + h * 1.62 + Math.max(0, h - 25) * 0.4) * (VERTICAL ? 1.22 : 1) * (zoom || 1);
    return {
      pos: new THREE.Vector3(
        p.x + Math.sin(ang) * dist,
        groundY(p.x, p.z) + 10 + h * 0.68,
        p.z + Math.cos(ang) * dist
      ),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + h * 0.4, p.z),
    };
  }

  let view, level = 1, houseOn = false, crowdOn = false, tod = 0.48;
  let houseY = 0, houseScale = 1, roads = 0, yachtTagOn = false, houseTagOn = false;

  if (T < 2.2) {
    view = wideAt(T / 2.2);
    roads = 0;
    tod = 0.46;
  } else if (T < 4.6) {
    const k = (T - 2.2) / 2.4;
    roads = Math.min(1, k / 0.4);
    view = {
      pos: lerpV(wideAt(1).pos, midRoads.pos, smooth(k)),
      target: lerpV(wideAt(1).target, midRoads.target, smooth(k)),
    };
    tod = 0.47;
  } else if (T < 6.8) {
    const k = (T - 4.6) / 2.2;
    roads = 1;
    view = {
      pos: lerpV(midRoads.pos, tight1.pos, smooth(k)),
      target: lerpV(midRoads.target, tight1.target, smooth(k)),
    };
    tod = 0.48;
  } else if (T < 9.8) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    level = 1;
    const drop = Math.min(1, (T - 6.8) / 0.45);
    houseY = (1 - smooth(drop)) * 8;
    houseScale = 0.15 + 0.85 * smooth(drop);
    if (T < 7.3) {
      view = tight1;
    } else {
      const k = (T - 7.3) / 2.5;
      const ang = k * 0.22;
      view = {
        pos: new THREE.Vector3(
          p.x + 22 * Math.cos(ang) + Math.sin(ang) * 4,
          groundY(p.x, p.z) + 14.5,
          p.z + 28 * Math.cos(ang * 0.35) + Math.sin(ang) * 5
        ),
        target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 2.3, p.z),
      };
    }
    tod = 0.50;
  } else if (T < 12.2) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    const k = (T - 9.8) / 2.4;
    level = Math.min(15, 1 + Math.floor(k * 15));
    const ang = 0.45 + k * 0.55;
    view = camLv(level, ang, 1);
    const frac = (k * 15) % 1;
    houseScale = 1 + (frac < 0.35 ? Math.sin((frac / 0.35) * Math.PI) * 0.08 : 0);
    yachtTagOn = level >= 15;
    tod = 0.50;
  } else if (T < 13.6) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    level = 15;
    const k = (T - 12.2) / 1.4;
    const from = camLv(15, 1.0, 1);
    view = {
      pos: lerpV(from.pos, yachtPeek.pos, smooth(k)),
      target: lerpV(from.target, yachtPeek.target, smooth(k)),
    };
    yachtTagOn = true;
    tod = 0.50;
  } else if (T < 16.0) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    const k = (T - 13.6) / 2.4;
    level = Math.min(30, 15 + Math.floor(k * 16));
    const ang = 1.05 + k * 0.5;
    const from = yachtPeek;
    const to = camLv(level, ang, 1);
    view = k < 0.35
      ? { pos: lerpV(from.pos, to.pos, smooth(k / 0.35)), target: lerpV(from.target, to.target, smooth(k / 0.35)) }
      : to;
    houseScale = 1;
    yachtTagOn = false;
    tod = 0.51;
  } else if (T < 17.8) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    level = 30;
    const k = (T - 16.0) / 1.8;
    const from = camLv(30, 1.55, 1);
    view = {
      pos: lerpV(from.pos, nightHero.pos, smooth(k)),
      target: lerpV(from.target, nightHero.target, smooth(k)),
    };
    tod = 0.52;
  } else if (T < 20.5) {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    level = 30;
    const k = (T - 17.8) / 2.7;
    if (k < 0.45) tod = 0.52 + (0.78 - 0.52) * (k / 0.45);
    else tod = (0.78 + (1.02 - 0.78) * ((k - 0.45) / 0.55)) % 1;
    view = nightHero;
  } else if (T < 26.2) {
    roads = 1;
    houseOn = true;
    houseTagOn = false;
    crowdOn = true;
    level = 30;
    tod = 0.02;
    const k = smooth((T - 20.5) / 5.7);
    view = {
      pos: lerpV(nightHero.pos, top.pos, k),
      target: lerpV(nightHero.target, top.target, k),
    };
  } else {
    roads = 1;
    houseOn = true;
    houseTagOn = true;
    crowdOn = true;
    level = 30;
    tod = 0.02;
    const k = smooth((T - 26.2) / 3.8);
    view = {
      pos: lerpV(top.pos, ctaView.pos, k),
      target: lerpV(top.target, ctaView.target, k),
    };
  }

  setRoadAmount(roads);
  if (level !== currentLevel) applyLevel(level, false);
  if (house) {
    house.group.visible = houseOn;
    house.group.position.y = groundY(house.group.position.x, house.group.position.z) + 0.12 + houseY;
    house.group.scale.set(houseScale, houseScale, houseScale);
  }
  if (houseTag) houseTag.show(houseOn && houseTagOn);
  const yOn = houseOn && currentLevel >= 15;
  if (yachtObj) yachtObj.group.visible = yOn;
  if (yachtLink) yachtLink.visible = yOn;
  if (yachtPier) yachtPier.visible = yOn;
  if (yachtTag) yachtTag.show(yOn && yachtTagOn);
  if (crowd) crowd.group.visible = crowdOn;
  if (badgeEl) badgeEl.hidden = true;
  if (dayNight) lastSky = dayNight.update(0, tod);
  if (lamps) lamps.setNight(lastSky.night);
  if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
  if (crowd && crowd.setNight) crowd.setNight(lastSky.night);

  camera.position.copy(view.pos);
  controls.target.copy(view.target);
  controls.update();
  camera.position.copy(view.pos);
  controls.target.copy(view.target);
}



function applyPromoV5(t) {
  const T = Math.max(0, Math.min(PROMO_DURATION, t));
  const p = monacoData.plot;
  const landTarget = new THREE.Vector3(80, groundY(80, 200), 200);

  const hookA = {
    pos: new THREE.Vector3(p.x + 112, groundY(p.x, p.z) + 80, p.z + 168),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 40, p.z),
  };
  const hookB = {
    pos: new THREE.Vector3(p.x + 200, groundY(p.x, p.z) + 200, p.z + 300),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 30, p.z),
  };
  const top = {
    pos: new THREE.Vector3(p.x + 30, 1280, p.z + 220),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z), p.z + 20),
  };
  const streetA = {
    pos: new THREE.Vector3(p.x + 95, groundY(p.x, p.z) + 24, p.z + 150),
    target: new THREE.Vector3(p.x + 25, groundY(p.x, p.z) + 8, p.z + 55),
  };
  const streetB = {
    pos: new THREE.Vector3(p.x + 36, groundY(p.x, p.z) + 22, p.z + 72),
    target: new THREE.Vector3(p.x - 20, groundY(p.x, p.z) + 8, p.z - 10),
  };
  const nightHero = {
    pos: new THREE.Vector3(p.x + 110, groundY(p.x, p.z) + 82, p.z + 168),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 48, p.z),
  };
  const ctaView = {
    pos: new THREE.Vector3(p.x + 210, groundY(p.x, p.z) + 180, p.z + 320),
    target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 42, p.z),
  };

  let view, level = 30, houseOn = true, houseTagOn = true, crowdOn = true;
  let tod = 0.48, yachtTagOn = false, visibleN = 0;
  promoCrowdLabels = false;

  if (T < 3.80) {
    const k = smooth(T / 3.80);
    view = { pos: lerpV(hookA.pos, hookB.pos, k), target: lerpV(hookA.target, hookB.target, k) };
    visibleN = 0;
    tod = 0.48;
  } else if (T < 12.20) {
    // Same continuous crane: keep pulling up while the city grows outward.
    const k = smooth((T - 3.80) / 8.40);
    view = { pos: lerpV(hookB.pos, top.pos, k), target: lerpV(hookB.target, top.target, k) };
    const g = (T - 3.80) / 7.40; // fill by ~11.2
    const eased = g <= 0 ? 0 : (g >= 1 ? 1 : 1 - Math.pow(1 - Math.min(1, g), 2.4));
    visibleN = Math.floor(eased * (crowd ? crowd.count : 10000));
    houseTagOn = T < 8.0;
    tod = 0.48;
  } else if (T < 13.40) {
    view = top;
    visibleN = crowd ? crowd.count : 10000;
    houseTagOn = false;
    tod = 0.48;
  } else if (T < 17.80) {
    const k = smooth((T - 13.40) / 4.40);
    view = { pos: lerpV(streetA.pos, streetB.pos, k), target: lerpV(streetA.target, streetB.target, k) };
    visibleN = crowd ? crowd.count : 10000;
    houseTagOn = false;
    promoCrowdLabels = true;
    tod = 0.50;
  } else if (T < 22.40) {
    const k = (T - 17.80) / 4.60;
    view = nightHero;
    visibleN = crowd ? crowd.count : 10000;
    houseTagOn = true;
    if (k < 0.40) tod = 0.50 + (0.80 - 0.50) * (k / 0.40);
    else tod = (0.80 + (1.04 - 0.80) * ((k - 0.40) / 0.60)) % 1;
  } else if (T < 25.80) {
    const k = smooth((T - 22.40) / 3.40);
    view = { pos: lerpV(nightHero.pos, ctaView.pos, k), target: lerpV(nightHero.target, ctaView.target, k) };
    visibleN = crowd ? crowd.count : 10000;
    houseTagOn = true;
    tod = 0.02;
  } else {
    const k = smooth((T - 25.80) / 4.20);
    view = {
      pos: lerpV(ctaView.pos, new THREE.Vector3(p.x + 260, groundY(p.x, p.z) + 240, p.z + 380), k),
      target: lerpV(ctaView.target, new THREE.Vector3(p.x, groundY(p.x, p.z) + 48, p.z), k),
    };
    visibleN = crowd ? crowd.count : 10000;
    houseTagOn = T < 28.4;
    tod = 0.02;
  }

  setRoadAmount(1);
  if (level !== currentLevel) applyLevel(level, false);
  if (house) {
    house.group.visible = houseOn;
    house.group.position.y = groundY(house.group.position.x, house.group.position.z) + 0.12;
    house.group.scale.set(1, 1, 1);
  }
  if (houseTag) houseTag.show(houseOn && houseTagOn);
  const yOn = houseOn && currentLevel >= 15;
  if (yachtObj) yachtObj.group.visible = yOn && T >= 16.0 && T < 20.5;
  if (yachtLink) yachtLink.visible = yOn && T >= 16.0 && T < 20.5;
  if (yachtPier) yachtPier.visible = yOn && T >= 16.0 && T < 20.5;
  if (yachtTag) yachtTag.show(false);
  if (crowd) {
    crowd.group.visible = true;
    if (crowd.setVisibleCount) crowd.setVisibleCount(visibleN);
  }
  if (badgeEl) badgeEl.hidden = true;
  if (dayNight) lastSky = dayNight.update(0, tod);
  if (lamps) lamps.setNight(lastSky.night);
  if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
  if (crowd && crowd.setNight) crowd.setNight(lastSky.night);

  camera.position.copy(view.pos);
  controls.target.copy(view.target);
  controls.update();
  camera.position.copy(view.pos);
  controls.target.copy(view.target);
}

function createGiftHotel(scene) {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(72, 80, 3.4, 28),
    new THREE.MeshLambertMaterial({ color: 0xd2c4a0 })
  );
  sand.position.y = 1.1;
  g.add(sand);
  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(52, 58, 0.55, 24),
    new THREE.MeshLambertMaterial({ color: 0x6f9450 })
  );
  grass.position.y = 2.75;
  g.add(grass);
  const wall = new THREE.MeshLambertMaterial({ color: 0xe8d9c4 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9ad0e8, transparent: true, opacity: 0.78 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6a3a38 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd4b05a });
  const main = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 16), wall);
  main.position.y = 2.9 + 15;
  g.add(main);
  for (let i = 0; i < 8; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(27.6, 2.0, 0.28), glass);
    band.position.set(0, 6.2 + i * 3.35, 8.15);
    g.add(band);
    const b2 = band.clone();
    b2.position.z = -8.15;
    g.add(b2);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.0, 14), glass);
    side.position.set(15.15, 6.2 + i * 3.35, 0);
    g.add(side);
    const s2 = side.clone();
    s2.position.x = -15.15;
    g.add(s2);
  }
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(16, 18, 12), wall);
  wingL.position.set(-20, 2.9 + 9, 3);
  g.add(wingL);
  const wingR = wingL.clone();
  wingR.position.set(20, 2.9 + 9, 3);
  g.add(wingR);
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(14, 1.7, 0.25), glass);
    w.position.set(-20, 8 + i * 3.1, 9.15);
    g.add(w);
    const w2 = w.clone();
    w2.position.x = 20;
    g.add(w2);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(14, 3.6, 14), dark);
  cap.position.y = 2.9 + 30 + 1.8;
  g.add(cap);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 8), gold);
  crown.position.y = 2.9 + 30 + 4.4;
  g.add(crown);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 11, 8), gold);
  spire.position.y = 2.9 + 30 + 10.5;
  g.add(spire);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.5, 24),
    new THREE.MeshLambertMaterial({ color: 0x9a8a70 })
  );
  pier.position.set(0, 1.6, 46);
  g.add(pier);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  for (const [x, z] of [[-44, -12], [40, -18], [-32, 30], [44, 24], [-50, 10], [28, 36]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7.2, 6), trunkMat);
    trunk.position.set(x, 6.2, z);
    g.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(3.3, 8, 6), leafMat);
    leaf.position.set(x, 10.4, z);
    g.add(leaf);
  }
  // Off the east/south coast, clearly a new island in the sea (promo tease only).
  g.position.set(455, 0, -30);
  g.visible = false;
  scene.add(g);
  return g;
}

function applyPromoV4(t) {
  const DUR = PROMO_V4_DURATION;
  const T = Math.max(0, Math.min(DUR, t));
  const p = monacoData.plot;
  const S = [
    { t0: 0.00, t1: 8.00 },
    { t0: 8.00, t1: 14.20 },
    { t0: 14.20, t1: 22.00 },
    { t0: 22.00, t1: 29.20 },
    { t0: 29.20, t1: 34.73 },
    { t0: 34.73, t1: DUR },
  ];
  function camEase(t0, t1) {
    return smooth(Math.max(0, Math.min(1, (T - t0) / Math.max(0.001, t1 - t0))));
  }
  function viewLerp(t0, t1, a, b) {
    const k = camEase(t0, t1);
    return { pos: lerpV(a.pos, b.pos, k), target: lerpV(a.target, b.target, k) };
  }

  let level = 1, tod = 0.48, houseOn = true, yachtOn = false, giftOn = false, view;

  if (T < 8.00) {
    level = 1;
    tod = 0.48;
    houseOn = true;
    const a = {
      pos: new THREE.Vector3(p.x + 210, groundY(p.x, p.z) + 220, p.z + 430),
      target: new THREE.Vector3(p.x + 20, groundY(p.x, p.z) + 4, p.z + 30),
    };
    const b = {
      pos: new THREE.Vector3(p.x + 26, groundY(p.x, p.z) + 14, p.z + 40),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 3.2, p.z),
    };
    view = viewLerp(0, 8, a, b);
  } else if (T < 14.20) {
    level = 1;
    tod = 0.48;
    houseOn = true;
    const a = {
      pos: new THREE.Vector3(p.x - 24, groundY(p.x, p.z) + 11, p.z + 34),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 3.0, p.z),
    };
    const b = {
      pos: new THREE.Vector3(p.x - 18, groundY(p.x, p.z) + 10, p.z + 30),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 3.2, p.z),
    };
    view = viewLerp(8.00, 14.20, a, b);
  } else if (T < 22.00) {
    level = 16;
    tod = 0.47;
    houseOn = true;
    const h = heightForLevel(16);
    const a = {
      pos: new THREE.Vector3(p.x + 36, groundY(p.x, p.z) + 16, p.z + 52),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + h * 0.38, p.z),
    };
    const b = {
      pos: new THREE.Vector3(p.x + 8, groundY(p.x, p.z) + 18, p.z + 58),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + h * 0.42, p.z),
    };
    view = viewLerp(14.20, 22.00, a, b);
  } else if (T < 29.20) {
    level = 30;
    tod = 0.46;
    houseOn = true;
    yachtOn = true;
    const h = heightForLevel(30);
    const a = {
      pos: new THREE.Vector3(p.x + 40, groundY(p.x, p.z) + 28, p.z + 70),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + h * 0.35, p.z),
    };
    const b = {
      pos: new THREE.Vector3((p.x + YACHT_DOCK.x) * 0.5 + 90, groundY(p.x, p.z) + 42, (p.z + YACHT_DOCK.z) * 0.5 + 130),
      target: new THREE.Vector3((p.x + YACHT_DOCK.x) * 0.5, groundY(p.x, p.z) + 16, (p.z + YACHT_DOCK.z) * 0.5 + 10),
    };
    view = viewLerp(22.00, 29.20, a, b);
  } else if (T < 34.73) {
    level = 30;
    tod = 0.02;
    houseOn = true;
    yachtOn = true;
    const h = heightForLevel(30);
    const a = {
      pos: new THREE.Vector3(p.x + 70, groundY(p.x, p.z) + 36, p.z + 110),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 22, p.z),
    };
    const b = {
      pos: new THREE.Vector3(p.x + 48, groundY(p.x, p.z) + 24, p.z + 78),
      target: new THREE.Vector3(p.x, groundY(p.x, p.z) + 20, p.z),
    };
    view = viewLerp(29.20, 34.73, a, b);
  } else {
    // Reveal: his own island hotel, night, slow orbit.
    level = 30;
    tod = 0.02;
    houseOn = false;
    yachtOn = false;
    giftOn = true;
    const gx = 455, gz = -30, top = 42;
    const a = {
      pos: new THREE.Vector3(gx + 90, 28, gz + 140),
      target: new THREE.Vector3(gx, top, gz),
    };
    const b = {
      pos: new THREE.Vector3(gx + 40, 22, gz + 95),
      target: new THREE.Vector3(gx, top + 4, gz),
    };
    view = viewLerp(34.73, 40.50, a, b);
    if (T >= 40.50) {
      // Hold last reveal frame under the text cards.
      view = b;
    }
  }

  if (level !== currentLevel) applyLevel(level, false);
  if (house) {
    house.group.visible = houseOn;
    house.group.position.y = groundY(house.group.position.x, house.group.position.z) + 0.12;
    house.group.scale.set(1, 1, 1);
  }
  if (houseTag) houseTag.show(houseOn);
  if (yachtObj) yachtObj.group.visible = yachtOn;
  if (yachtLink) yachtLink.visible = yachtOn;
  if (yachtPier) yachtPier.visible = yachtOn;
  if (yachtTag) yachtTag.show(yachtOn);
  if (giftHotel) giftHotel.visible = giftOn;
  if (giftTag) {
    giftTag.show(giftOn);
    if (giftOn) giftTag.setWorld(455, 48, -30);
  }
  if (crowd) crowd.group.visible = false;
  if (badgeEl) badgeEl.hidden = true;
  if (dayNight) lastSky = dayNight.update(0, tod);
  if (lamps) lamps.setNight(lastSky.night);
  if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
  if (giftHotel) {
    giftHotel.traverse((o) => {
      if (o.material && o.material.emissive && o.material.emissive.isColor) {
        const isGlass = o.material.opacity && o.material.opacity < 0.95;
        if (isGlass && giftOn) {
          const e = 0.25 + lastSky.night * 0.55;
          o.material.emissive.setRGB(e * 0.95, e * 0.85, e * 0.55);
        }
      }
    });
  }

  camera.position.copy(view.pos);
  controls.target.copy(view.target);
  controls.update();
  camera.position.copy(view.pos);
  controls.target.copy(view.target);
}


function projectWorld(x, y, z, w, h) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * w,
    y: (-v.y * 0.5 + 0.5) * h,
    z: v.z,
    inView: v.z >= -1 && v.z <= 1 && v.x >= -1.15 && v.x <= 1.15 && v.y >= -1.15 && v.y <= 1.15,
  };
}

// Keep every visible name sitting directly above its own house. Hide a tag
// when its tent is too small / off-screen, or when the tag would look
// attached to a neighboring house (common at low camera angles).
function cullHouseLabels() {
  if (!labelLayer || !camera || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width || window.innerWidth;
  const h = rect.height || window.innerHeight;
  const houses = [];

  function pushHouse(tag, group, getHeight, getPad, name) {
    if (!tag || !group || !group.visible) return;
    const wp = new THREE.Vector3();
    group.getWorldPosition(wp);
    const hh = getHeight ? getHeight() : 3.2;
    const pad = getPad ? getPad() : { w: 10, d: 10 };
    const roof = projectWorld(wp.x, wp.y + hh, wp.z, w, h);
    const ground = projectWorld(wp.x, wp.y, wp.z, w, h);
    const padL = projectWorld(wp.x - (pad.w || 10) * 0.5, wp.y, wp.z, w, h);
    const padR = projectWorld(wp.x + (pad.w || 10) * 0.5, wp.y, wp.z, w, h);
    houses.push({
      tag, name: name || '',
      roof, ground,
      padHalf: Math.max(10, Math.abs(padR.x - padL.x) * 0.5),
      screenH: Math.abs(ground.y - roof.y),
      camDist: camera.position.distanceTo(wp),
    });
  }

  if (house && houseTag) pushHouse(houseTag, house.group, () => house.getHeight(), () => house.getPad && house.getPad(), (selectedResident && selectedResident.name) || '');
  for (const item of plotTents) {
    if (!item.house || !item.tag) continue;
    pushHouse(item.tag, item.house.group, () => item.house.getHeight(), () => item.house.getPad && item.house.getPad(), item.resident && item.resident.name);
  }

  const hide = (tag) => { if (tag && tag.show) tag.show(false); else if (tag && tag.el) tag.el.style.display = 'none'; };

  for (const a of houses) {
    if (!a.tag || !a.tag.visible || !a.tag.inView) continue;
    const el = a.tag.el;
    if (!el || el.style.display === 'none') continue;
    const br = el.getBoundingClientRect();
    if (br.width < 2 || br.height < 2) { hide(a.tag); continue; }
    const lx = (br.left + br.right) / 2;
    const lyBot = br.bottom;

    // Tent itself must be a readable size and on screen.
    if (!a.roof.inView || a.screenH < 16 || a.roof.y < 4 || a.ground.y > h - 4) {
      hide(a.tag);
      continue;
    }
    // Label must sit above this tent: x-aligned, bottom near the roof, not sunk into the pad.
    const maxDx = Math.max(26, a.padHalf * 0.85, a.screenH * 0.65);
    if (Math.abs(lx - a.roof.x) > maxDx) { hide(a.tag); continue; }
    if (lyBot > a.ground.y - 2) { hide(a.tag); continue; }
    if (lyBot < a.roof.y - Math.max(90, a.screenH * 1.8)) { hide(a.tag); continue; }

    let drop = false;
    for (const b of houses) {
      if (b === a) continue;
      const dOwn = Math.hypot(lx - a.roof.x, lyBot - a.roof.y);
      const dOther = Math.hypot(lx - b.roof.x, lyBot - b.roof.y);
      if (b.roof.inView && dOther + 10 < dOwn) { drop = true; break; }
      const half = Math.max(14, b.padHalf, b.screenH * 0.6);
      const overlapsPad = lx > b.roof.x - half && lx < b.roof.x + half && br.bottom > b.roof.y - 8 && br.top < b.ground.y + 8;
      if (overlapsPad && b.camDist < a.camDist - 1) { drop = true; break; }
    }
    if (drop) hide(a.tag);
  }
}


function celebrationHouses() {
  const list = [];
  for (const r of allResidents || []) {
    const level = r.level || 1;
    let x = r.x, z = r.z, y, height;
    const isHero = selectedResident && r.i === selectedResident.i && house && house.group;
    if (isHero) {
      x = house.group.position.x;
      z = house.group.position.z;
      height = house.getHeight ? house.getHeight() : heightForLevel(level);
      y = house.group.position.y + height;
    } else {
      const item = (plotTents || []).find((it) => it.resident && it.resident.id === r.id);
      if (item && item.house && item.house.group) {
        x = item.house.group.position.x;
        z = item.house.group.position.z;
        height = item.house.getHeight ? item.house.getHeight() : heightForLevel(level);
        y = item.house.group.position.y + height;
      } else if (x != null && z != null) {
        height = heightForLevel(level);
        y = (typeof groundY === 'function' ? groundY(x, z) : 2.6) + height;
      } else {
        continue;
      }
    }
    list.push({ id: r.id, level, celebrated_level: r.celebrated_level, x, y, z, height, rec: r });
  }
  return list;
}

function renderFrame(timeSec, dt) {
  if (!RECORD && dayNight) {
    const lock = (typeof window !== 'undefined' && window.__lockTod != null) ? window.__lockTod : null;
    lastSky = dayNight.update(dt || 0, lock);
    if (lamps) lamps.setNight(lastSky.night);
    if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
    for (const item of plotTents) {
      if (item.house && item.house.setNightFactor) item.house.setNightFactor(lastSky.night);
    }
    if (crowd && crowd.setNight) crowd.setNight(lastSky.night);
  }
  if (waterUniforms) waterUniforms.uTime.value = timeSec;
  if (!RECORD && weather) {
    weather.update(dt || 0, timeSec, {
      hemi: hemiLight, sun: sunLight, fill: fillLight, fog: scene.fog, renderer,
    });
  }
  if (!RECORD && birds) birds.tick(timeSec, dt || 0.016, lastSky.night);
  if (!RECORD && celebrations) celebrations.tick(timeSec, dt || 0, lastSky.night);
  if (!RECORD && wedding) wedding.update(dt || 0, lastSky.night, timeSec);
  if (yachtObj && yachtObj.group.visible && yachtObj.tick) yachtObj.tick(timeSec);
  if (house && house.group.visible) {
    house.tick(timeSec);
    const sc = house.group.scale.x;
    if (!RECORD && sc > 1.001) {
      const n = THREE.MathUtils.lerp(sc, 1, 0.12);
      house.group.scale.set(n, n, n);
    }
  }
  if (!RECORD) updateFollow(timeSec);
  if (mapRoot) {
    const dist = camera.position.distanceTo(controls.target);
    const showMap = !PROMO && !(crowd && crowd.count >= 2000) && dist > 280;
    mapRoot.traverse((o) => {
      if (o.isLOD) o.update(camera);
      if (o.userData.mapLabel) o.visible = showMap;
    });
  }
  updateCrowdLabels();
  updatePlotTentTags();
  // Update camera matrices, render, THEN project HTML labels (project() needs a current matrixWorld).
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
  updateHouseTagPos();
  if (labelLayer && camera && renderer) {
    const r = renderer.domElement.getBoundingClientRect();
    const w = r.width || window.innerWidth;
    const h = r.height || window.innerHeight;
    labelLayer.update(camera, w, h);
    cullHouseLabels();
  }
}

function onResize() {
  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  const W = window.innerWidth;
  const H = window.innerHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H, false);
}

function initRenderer() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RECORD ? 1 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x8ec7e8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false; // light on phones + reliable in swiftshader
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9ec9e0, 1400, 9000);
  camera = new THREE.PerspectiveCamera(VERTICAL ? 58 : 50, window.innerWidth / window.innerHeight, 0.5, 32000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !RECORD;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false; // pan in the ground plane
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.minDistance = 6;
  controls.maxDistance = 12000;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.zoomSpeed = 1.15;
  controls.panSpeed = 1.05;
  controls.rotateSpeed = 0.72;
  {
    const MOUSE = THREE.MOUSE || { ROTATE: 0, DOLLY: 1, PAN: 2 };
    const TOUCH = THREE.TOUCH || { ROTATE: 0, PAN: 1, DOLLY_PAN: 2, DOLLY_ROTATE: 3 };
    // Map-style: 1-finger / left-drag pans, pinch zooms, 2-finger / right-drag rotates+tilts.
    controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
  }
  if (typeof controls.listenToKeyEvents === 'function') controls.listenToKeyEvents(window);
  controls.target.set(120, groundY(120, 50) + 8, 50);

  hemiLight = new THREE.HemisphereLight(0xfff2d8, 0x7a9a6a, 0.95);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff5e6, 1.35);
  sunLight.position.set(600, 900, 800);
  scene.add(sunLight);
  fillLight = new THREE.DirectionalLight(0xb7d4ea, 0.35);
  fillLight.position.set(-400, 300, -200);
  scene.add(fillLight);

  // soft sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(16000, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x7eb7e0) },
        bot: { value: new THREE.Color(0xeff4e8) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top,bot; void main(){ float h=clamp(vP.y/4000.0+0.15,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0); }',
    })
  );
  skyMesh = sky;
  scene.add(sky);
  clock = new THREE.Clock();
}

function bindHUD() {
  badgeEl = $('levelBadge');
  searchInput = $('search');
  levelSlider = $('levelSlider');
  levelLabel = $('levelLabel');
  foundMsg = $('foundMsg');
  $('residentsCount').textContent = '١ ساكن';
  if (levelSlider) {
    levelSlider.value = String(currentLevel);
    levelSlider.addEventListener('input', () => {
      applyLevel(parseInt(levelSlider.value, 10), true);
      maybeReframeHouse();
    });
  }
  const form = $('searchForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      searchResident(searchInput.value);
    });
  }
  const seedEl = $('seedInput');
  if (seedEl) {
    seedEl.value = currentSeed;
    const applySeed = () => {
      setSeed(seedEl.value);
      maybeReframeHouse();
    };
    seedEl.addEventListener('change', applySeed);
    seedEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySeed();
      }
    });
  }
  const go = $('btnOverview');
  if (go) go.addEventListener('click', () => setCameraView('overview'));
  const bc = $('btnCamera');
  if (bc) bc.addEventListener('click', () => cycleCamMode());
  const bs = $('btnSky');
  if (bs) {
    bs.addEventListener('click', () => {
      if (!dayNight) return;
      const m = dayNight.cycleMode();
      const lab = $('skyModeLabel');
      if (lab) lab.textContent = SKY_AR[m] || m;
    });
  }
  const bw = $('btnWeather');
  if (bw) {
    const lab = $('weatherModeLabel');
    if (lab && weather) lab.textContent = WEATHER_AR[weather.getMode()] || 'تلقائي';
    bw.addEventListener('click', () => {
      if (!weather) return;
      const m = weather.cycleMode();
      if (lab) lab.textContent = WEATHER_AR[m] || m;
    });
  }
  updateStats();
  applyLevel(currentLevel, false);
  bindTapToFly();
}

function loop() {
  const now = performance.now();
  const dt = lastTick ? Math.min(0.08, (now - lastTick) / 1000) : 0.016;
  lastTick = now;
  if (!RECORD) {
    updateFly(now);
    if (tour && MODE === 'map' && !(wedding && wedding.isCam())) tour.tick(dt, !!fly);
    if (!fly && camMode === 'free' && !(tour && tour.isActive()) && !(wedding && wedding.isCam())) {
      controls.update();
      clampFreeCamera();
    }
    tickTapRipple(dt);
    renderFrame(clock.getElapsedTime(), dt);
    if (DEMO_N > 1) {
      fpsFrames += 1;
      if (!fpsT0) fpsT0 = now;
      if (now - fpsT0 >= 500) {
        lastFps = (fpsFrames * 1000) / (now - fpsT0);
        fpsFrames = 0;
        fpsT0 = now;
        updateStats();
      }
    }
  }
  requestAnimationFrame(loop);
}

/* ---------------- levels sheet ---------------- */
function beigeGround() {
  scene.fog = null;
  renderer.setClearColor(0xe6dcc8, 1);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000),
    new THREE.MeshLambertMaterial({ color: 0xe6dcc8 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

function frameCellCamera() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  // Sized so an L30 skyscraper (~118 m + spire) plus the side yacht fits, ground near the bottom.
  const halfH = 82;
  const halfW = halfH * aspect;
  const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 5000);
  const look = new THREE.Vector3(8, 50, 2);
  const dir = new THREE.Vector3(1.05, 0.95, 1.45).normalize();
  camera = ortho;
  camera.position.copy(look).add(dir.multiplyScalar(280));
  camera.lookAt(look);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.object = camera;
    controls.target.copy(look);
    controls.update();
  }
}

function setCellBar(level, seed) {
  let bar = document.getElementById('cellBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cellBar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:16px 12px 20px;text-align:center;font:700 22px/1.25 Tahoma,"Segoe UI",sans-serif;color:#2a1f0a;background:linear-gradient(transparent, rgba(230,220,200,0.94) 40%);z-index:8;pointer-events:none;';
    document.body.appendChild(bar);
  }
  const info = levelsData[(level || currentLevel) - 1];
  const en = info ? info.en : '';
  bar.innerHTML = '<div>L' + (level || currentLevel) + '  ' + en + '</div>'
    + '<div style="font-size:14px;color:#6a5a3a;font-weight:600;margin-top:3px">' + (seed || currentSeed) + '  ·  example</div>';
}

function buildCell() {
  beigeGround();
  ensureLabels();
  house = createHouse({ seed: currentSeed });
  house.setLevel(currentLevel);
  house.setLocalExtrasVisible(true);
  house.group.position.set(0, 0.02, 0);
  scene.add(house.group);
  houseTag = labelLayer.add('');
  houseTag.set(currentSeed, 'example');
  updateCellTags();
  setCellBar(currentLevel, currentSeed);
  frameCellCamera();
}

function updateCellTags() {
  if (!house) return;
  const pad = house.getPad();
  const h = house.getHeight();
  if (houseTag) houseTag.setWorld(0, h + 3.2, 0);
  if (yachtTag) {
    // local yacht sits to +X of the pad
  }
}

function buildSheet(levels) {
  // Fallback in-engine 6x5 sheet. Capture prefers compositing individual cells
  // so tall skyscrapers are not cropped. This view uses large gaps + auto-fit.
  beigeGround();
  ensureLabels();
  const cols = 6, rows = 5, gapX = 90, gapZ = 160;
  const houses = [];
  for (let i = 0; i < 30; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const h = createHouse({ seed: currentSeed });
    h.setLevel(i + 1);
    h.setLocalExtrasVisible(true);
    const x = (col - (cols - 1) / 2) * gapX;
    const z = (row - (rows - 1) / 2) * gapZ;
    h.group.position.set(x, 0.02, z);
    scene.add(h.group);
    houses.push(h);
    const info = levels[i];
    const tag = labelLayer.add('caption');
    tag.set('L' + (i + 1) + '  ' + (info ? info.en : ''), currentSeed + '  ·  example');
    tag.setWorld(x, 1.2, z + 18);
  }

  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const halfW = 310;
  const halfH = halfW / aspect;
  const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 8000);
  camera = ortho;
  camera.position.set(180, 420, 520);
  camera.lookAt(0, 20, 0);
  camera.updateProjectionMatrix();
  controls.object = camera;
  controls.target.set(0, 20, 0);
  controls.update();
}

function buildVariety() {
  beigeGround();
  ensureLabels();
  const names = EXAMPLE_NAMES;
  const levels = [15, 30];
  const gapX = 110, gapZ = 200;
  for (let r = 0; r < levels.length; r++) {
    for (let c = 0; c < names.length; c++) {
      const seed = names[c];
      const lv = levels[r];
      const h = createHouse({ seed });
      h.setLevel(lv);
      h.setLocalExtrasVisible(true);
      const x = (c - (names.length - 1) / 2) * gapX;
      const z = (r - (levels.length - 1) / 2) * gapZ;
      h.group.position.set(x, 0.02, z);
      scene.add(h.group);
      const info = levelsData[lv - 1];
      const tag = labelLayer.add('caption');
      tag.set(seed, 'L' + lv + '  ' + (info ? info.en : '') + '  ·  example');
      tag.setWorld(x, 1.2, z + 20);
    }
  }
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const halfW = 360;
  const halfH = halfW / aspect;
  const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 8000);
  camera = ortho;
  camera.position.set(200, 380, 480);
  camera.lookAt(0, 30, 0);
  camera.updateProjectionMatrix();
  controls.object = camera;
  controls.target.set(0, 30, 0);
  controls.update();
}

async function main() {
  initRenderer();
  const [data, lev, fileRes] = await Promise.all([
    loadJSON('./data/monaco.json'),
    loadJSON('./data/levels.json'),
    loadJSON('./data/residents.json').catch(() => ({ residents: [] })),
    loadTerrain('./data/terrain.json').catch((e) => { console.warn(e); return null; }),
  ]);
  levelsData = lev.levels;
  monacoData = data;

  if (MODE === 'sheet' || MODE === 'cell' || MODE === 'variety') {
    document.getElementById('hud').hidden = true;
    document.getElementById('attrib').hidden = false;
    if (MODE === 'cell') buildCell();
    else if (MODE === 'variety') buildVariety();
    else buildSheet(levelsData);
  } else {
    const plot = buildMap(data);
    scene.add(createHorizonMountains());
    dayNight = createDayNight({
      scene, renderer, hemi: hemiLight, sun: sunLight, fill: fillLight,
      sky: skyMesh, fog: scene.fog, waterUniforms,
    });
    lamps = createLamps(scene, data, groundY);
    birds = createFlocks(scene);
    weather = createWeather({
      scene, groundY,
      getResidents: () => allResidents,
      getSunPosition: () => dayNight && dayNight.getSunPosition && dayNight.getSunPosition(),
    });
    wedding = createWedding({
      scene, camera, controls, groundY,
      getTour: () => tour,
    });
    const built = buildResidents(data, fileRes.residents || [], DEMO_N > 1 ? DEMO_N : 0);
    allResidents = built.residents;
    const first = allResidents[0] || { id: 1, name: 'بيت رقم 1', label: 'بيت رقم 1', seed: 'house_1', level: 1, x: plot.x, z: plot.z, i: 0, anonymous: true };
    currentSeed = first.seed || 'house_1';
    currentLevel = first.level || START_LEVEL;
    RESIDENT.id = first.id || 1;
    RESIDENT.name = publicLabel(first);
    RESIDENT.anonymous = !!first.anonymous;
    RESIDENT.subtitle = publicSub(first);
    // Demo crowds: first house stays a full procedural landmark (L30 in stress demos).
    // Real residents (no ?demo=): each plot gets a full tent / house plus a name tag.
    if (allResidents.length > 1 && DEMO_N > 1) {
      if (DEMO_N >= 5000) renderer.setPixelRatio(1);
      crowd = createCrowd(scene, allResidents, data);
      crowd.hideIndex(first.i, true);
    }
    placeHouse({ x: first.x, z: first.z, rot: plot.rot || 0 });
    selectedResident = first;
    applyHouseLabel();
    if (allResidents.length > 1 && DEMO_N <= 1) placePlotTents();
    if (weather && weather.rebuildRoofs) weather.rebuildRoofs(allResidents);
    if (PROMO && PROMO_VER !== 4 && !crowd) {
      const fill = buildResidents(data, [], 10000);
      crowd = createCrowd(scene, fill.residents, data);
      crowd.hideIndex(0, true);
      crowd.group.visible = false;
    }
    if (PROMO_VER === 4 && !giftHotel) {
      giftHotel = createGiftHotel(scene);
      if (labelLayer) {
        giftTag = labelLayer.add('gift');
        giftTag.set('فندق بيت رقم 1', '');
        giftTag.show(false);
      }
    }
    if (dayNight) lastSky = dayNight.update(0, RECORD ? 0.46 : 0.46);
    if (lamps) lamps.setNight(lastSky.night);
    if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
    if (PROMO && RECORD) {
      if (PROMO_VER === 5) applyPromoV5(0);
      else if (PROMO_VER === 4) applyPromoV4(0);
      else applyPromo(0);
    } else if (RECORD) {
      applyDemo(0);
    } else {
      const ov = overviewCamera();
      camera.position.copy(ov.pos);
      controls.target.copy(ov.target);
      controls.update();
      if (house) house.group.visible = true;
    }
    bindHUD();
    const attr = document.getElementById('attrib');
    if (attr) attr.textContent = '© OpenStreetMap contributors · ' + terrainAttribution();
  }

  window.addEventListener('resize', onResize);


  if (!RECORD && MODE === 'map') {
    celebrations = createCelebrations({
      scene,
      getHouses: celebrationHouses,
      labelLayer: () => labelLayer,
    });
    tour = createTour({
      camera,
      controls,
      getHouses: celebrationHouses,
      groundY,
    });
  }

  if (!RECORD && MODE === 'map') {
    initOwner({
      getResidents: () => allResidents,
      getMonacoData: () => monacoData,
      getCanvas: () => renderer && renderer.domElement,
      isHouse1At: (cx, cy) => {
        if (!house || !house.group || !camera || !renderer) return false;
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((cx - rect.left) / rect.width) * 2 - 1,
          -((cy - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObject(house.group, true);
        return hits.length > 0;
      },
      onAdded: (rec) => {
        rec.i = allResidents.length;
        allResidents.push(rec);
        placePlotTents();
        if (weather && weather.rebuildRoofs) weather.rebuildRoofs(allResidents);
        updateStats();
        if (celebrations && celebrations.resetScan) celebrations.resetScan();
        if (rec.name) searchResident(rec.name);
      },
    });
  }

  // public API for capture / hosting
  window.__ready = true;
  window.MonacoApp = {
    setLevel: (n) => applyLevel(n, true),
    groundY, getHeight,
    getLevel: () => currentLevel,
    setSeed: (name) => setSeed(name),
    getSeed: () => currentSeed,
    setView: (name) => setCameraView(name, true),
    flyToHouse: () => setCameraView('house'),
    search: searchResident,
    setDemoTime: (t) => applyDemo(t),
    setCamMode: (m, instant) => setCamMode(m, instant !== false),
    cycleCam: cycleCamMode,
    setSkyMode: (m) => { if (dayNight) { dayNight.setMode(m); } },
    setWeather: (m) => weather && weather.setMode(m),
    getWeather: () => weather && weather.getMode(),
    getWeatherKind: () => weather && weather.getKind(),
    weather,
    setTod: (t) => {
      if (!dayNight) return lastSky;
      lastSky = dayNight.update(0, t);
      if (lamps) lamps.setNight(lastSky.night);
      if (house && house.setNightFactor) house.setNightFactor(lastSky.night);
      for (const item of plotTents) {
        if (item.house && item.house.setNightFactor) item.house.setNightFactor(lastSky.night);
      }
      if (crowd && crowd.setNight) crowd.setNight(lastSky.night);
      if (birds) birds.tick(0, 0.016, lastSky.night);
      if (weather) weather.update(0, 0, { hemi: hemiLight, sun: sunLight, fill: fillLight, fog: scene.fog, renderer });
      if (wedding && wedding.setNight) wedding.setNight(lastSky.night);
      return lastSky;
    },
    getFps: () => lastFps,
    measureFps: (seconds = 2) => new Promise((resolve) => {
      const t0 = performance.now();
      let n = 0;
      const step = () => {
        n++;
        renderFrame(clock.getElapsedTime(), 0.016);
        const now = performance.now();
        if (now - t0 < seconds * 1000) requestAnimationFrame(step);
        else resolve({ fps: (n * 1000) / (now - t0), frames: n, ms: now - t0, count: crowd ? crowd.count : 1 });
      };
      requestAnimationFrame(step);
    }),
    getResidentCount: () => (crowd ? crowd.count : allResidents.length || 1),
    getResidents: () => allResidents,
    getPlotTents: () => plotTents,
    frameAllResidents,
    setHouseVisible: (v) => {
      if (!house) return;
      house.group.visible = !!v;
      if (houseTag) houseTag.show(!!v);
      const yOn = !!v && currentLevel >= 15;
      if (yachtObj) yachtObj.group.visible = yOn;
      if (yachtLink) yachtLink.visible = yOn;
      if (yachtPier) yachtPier.visible = yOn;
      if (yachtTag) yachtTag.show(yOn);
    },
    frameCell: () => frameCellCamera(),
    render: (t = 0) => renderFrame(t),
    duration: PROMO_VER === 4 ? PROMO_V4_DURATION : (PROMO ? PROMO_DURATION : DEMO_DURATION),
    plot: monacoData && monacoData.plot,
    resident: RESIDENT,
    exampleNames: EXAMPLE_NAMES,
    scene, camera, renderer, controls,
    celebrations,
    tour,
    wedding,
    flyToPoint,
    enterWeddingCam: () => wedding && wedding.enterCam(),
    exitWeddingCam: () => wedding && wedding.exitCam(),
    isWeddingCam: () => !!(wedding && wedding.isCam()),
    getWeddingCenter: () => wedding && wedding.getCenter(),

    cullHouseLabels,
    debugLabels: () => {
      const pr = renderer.getPixelRatio() || 1;
      const w = renderer.domElement.width / pr, h = renderer.domElement.height / pr;
      const v = new THREE.Vector3();
      return (labelLayer ? labelLayer.items : []).map((it) => {
        v.copy(it.world).project(camera);
        return {
          kind: it.kind, visible: it.visible, world: it.world.toArray(),
          ndc: [v.x, v.y, v.z],
          px: [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h],
          cam: camera.position.toArray(),
          target: controls.target.toArray(),
          size: [w, h],
        };
      });
    },
  };
  window.renderAt = (t) => {
    if (MODE === 'sheet') {
      renderFrame(t);
    } else if (PROMO) {
      if (PROMO_VER === 5) applyPromoV5(t);
      else if (PROMO_VER === 4) applyPromoV4(t);
      else applyPromo(t);
      renderFrame(t);
    } else {
      applyDemo(t);
      renderFrame(t);
    }
  };

  if (RECORD) {
    const hideIds = ['levels', 'searchForm', 'stats', 'foundMsg', 'brand', 'top', 'hud'];
    for (const id of hideIds) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
  }

  if (!RECORD) requestAnimationFrame(loop);
  else {
    // still render one frame so the canvas isn't black before capture
    renderFrame(0);
  }
}

main().catch((e) => {
  console.error(e);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:20px;background:#400;color:#fff;padding:16px;z-index:9;font:16px sans-serif';
  el.textContent = 'خطأ بالتحميل: ' + e.message;
  document.body.appendChild(el);
});
