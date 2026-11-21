// Preview-only wedding square: plaza, dabke circle, spatial playlist, follow camera.
import * as THREE from 'three';
import { createDabkeCrowd, DANCE_RINGS } from './dabkeCrowd.js';

const PLAZA = { x: 216, z: -144 };
const PLAZA_SIZE = 68;
const ROAD_TO = { x: 222.1, z: -137.2 };
const SILENT_BEYOND = 120;
const FULL_WITHIN = 32;

function gy(fn, x, z) {
  return typeof fn === 'function' ? fn(x, z) : 2.6;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function volumeForDist(d, silentBeyond, fullWithin) {
  if (d >= silentBeyond) return 0;
  if (d <= fullWithin) return 1;
  return 1 - smoothstep(fullWithin, silentBeyond, d);
}

function makeMat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function makeStringLights(y0) {
  const group = new THREE.Group();
  group.name = 'stringLights';
  const posts = [];
  const r = PLAZA_SIZE * 0.46;
  const n = 8;
  const postMat = makeMat(0x3a2a1a);
  const bulbMats = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6), postMat);
    post.position.set(x, 2.6, z);
    group.add(post);
    posts.push(new THREE.Vector3(x, 5.1, z));
  }
  const bulbG = new THREE.SphereGeometry(0.16, 6, 5);
  const colors = [0xffe08a, 0xff6b6b, 0xffd166, 0xf8f1d0, 0xff9f43];
  for (let i = 0; i < n; i++) {
    const a = posts[i], b = posts[(i + 1) % n];
    const bulbs = 7;
    for (let k = 1; k < bulbs; k++) {
      const t = k / bulbs;
      const sag = Math.sin(t * Math.PI) * 0.85;
      const mat = new THREE.MeshBasicMaterial({ color: colors[(i + k) % colors.length] });
      mat.userData.base = colors[(i + k) % colors.length];
      bulbMats.push(mat);
      const m = new THREE.Mesh(bulbG, mat);
      m.position.set(
        a.x + (b.x - a.x) * t,
        a.y - sag,
        a.z + (b.z - a.z) * t,
      );
      group.add(m);
    }
  }
  group.userData.bulbMats = bulbMats;
  return group;
}

function makePlaza(groundFn) {
  const group = new THREE.Group();
  group.name = 'weddingPlaza';
  const y = gy(groundFn, PLAZA.x, PLAZA.z);
  group.position.set(PLAZA.x, y, PLAZA.z);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(PLAZA_SIZE, 0.35, PLAZA_SIZE),
    makeMat(0x8a7a62),
  );
  ground.position.y = 0.1;
  group.add(ground);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 40),
    makeMat(0xb9a27a),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.29;
  group.add(inner);
  for (const rg of DANCE_RINGS) {
    const band = new THREE.Mesh(
      new THREE.RingGeometry(rg.r - 0.85, rg.r + 0.85, 64),
      makeMat(0x6e2a28),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.3;
    group.add(band);
  }

  // curb
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(PLAZA_SIZE + 1.2, 0.5, PLAZA_SIZE + 1.2),
    makeMat(0x5c5346),
  );
  curb.position.y = -0.05;
  group.add(curb);

  // short road to the existing street
  const dx = ROAD_TO.x - PLAZA.x;
  const dz = ROAD_TO.z - PLAZA.z;
  const len = Math.max(4, Math.hypot(dx, dz) + 6);
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.22, len),
    makeMat(0x6a655c),
  );
  const ang = Math.atan2(dx, dz);
  road.position.set(dx * 0.5, 0.05, dz * 0.5);
  road.rotation.y = ang;
  group.add(road);

  // small stage on the north side
  const stage = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 5.2), makeMat(0x5a3a22));
  stage.position.set(0, 0.55, -PLAZA_SIZE * 0.36);
  group.add(stage);
  const back = new THREE.Mesh(new THREE.BoxGeometry(10.2, 4.2, 0.35), makeMat(0x7a1f2b));
  back.position.set(0, 2.6, -PLAZA_SIZE * 0.36 - 2.4);
  group.add(back);
  const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.25, 0.4), makeMat(0xe0b84a));
  goldTrim.position.set(0, 4.7, -PLAZA_SIZE * 0.36 - 2.4);
  group.add(goldTrim);
  // speakers
  const spkMat = makeMat(0x222018);
  for (const sx of [-4.2, 4.2]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.9), spkMat);
    sp.position.set(sx, 1.5, -PLAZA_SIZE * 0.36 - 0.2);
    group.add(sp);
  }

  // festive posts / bunting poles already in lights
  const lights = makeStringLights(y);
  group.add(lights);
  const fillLight = new THREE.PointLight(0xffd6a8, 0.35, 80, 1.4);
  fillLight.position.set(0, 7.2, 0);
  group.add(fillLight);
  const stageLight = new THREE.PointLight(0xffc978, 0.15, 28, 1.6);
  stageLight.position.set(0, 5.2, -PLAZA_SIZE * 0.36 + 1);
  group.add(stageLight);
  group.userData.fillLight = fillLight;
  group.userData.stageLight = stageLight;

  // wooden sign
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), makeMat(0x4a3218));
  post.position.set(0, 1.3, PLAZA_SIZE * 0.42);
  group.add(post);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b1d2a';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#e8c45a';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = '#ffe08a';
  ctx.font = '700 72px "Noto Naskh Arabic", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText('ساحة العرس', 256, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.7),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  sign.position.set(0, 2.6, PLAZA_SIZE * 0.42);
  group.add(sign);

  return { group, lights, y };
}

export function createWedding({ scene, camera, controls, groundY, getTour }) {
  const { group, lights, y: baseY } = makePlaza(groundY);
  scene.add(group);

  const crowd = createDabkeCrowd(PLAZA.x, PLAZA.z);
  crowd.group.position.y = 0.3;
  group.add(crowd.group);

  const center = new THREE.Vector3(PLAZA.x, baseY + 1.4, PLAZA.z);
  let camOn = false;
  let camAng = 0.4;
  let audioOn = false;
  let index = 0;
  let playlist = { tracks: [], defaultIndex: 0, spatial: { silentBeyond: SILENT_BEYOND, fullVolumeWithin: FULL_WITHIN } };
  let audioEl = null;
  let ytPlayer = null;
  let ytReady = false;
  let pendingPlay = false;
  let lastVol = -1;
  let night = 0;

  const ui = {
    bar: document.getElementById('publicDock') || document.getElementById('dock'),
    btnCam: document.getElementById('btnWeddingCam'),
    btnSound: document.getElementById('btnWeddingSound'),
    btnPrev: document.getElementById('btnWeddingPrev'),
    btnNext: document.getElementById('btnWeddingNext'),
    title: document.getElementById('weddingTrackTitle'),
    back: document.getElementById('weddingBack'),
    ytWrap: document.getElementById('ytWeddingWrap'),
  };

  function tracks() { return playlist.tracks || []; }
  function track() { return tracks()[index] || null; }
  function spatial() {
    const s = playlist.spatial || {};
    return {
      silentBeyond: s.silentBeyond || SILENT_BEYOND,
      fullWithin: s.fullVolumeWithin || s.fullWithin || FULL_WITHIN,
    };
  }

  function setTitle() {
    const t = track();
    if (!ui.title) return;
    if (!t) { ui.title.textContent = ''; return; }
    ui.title.textContent = t.artist ? `${t.title} — ${t.artist}` : t.title;
  }

  function showYt(on) {
    if (ui.ytWrap) ui.ytWrap.classList.toggle('on', !!on);
  }

  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.loop = false;
    audioEl.addEventListener('ended', () => next(1, true));
    return audioEl;
  }

  function loadYtApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
      // already loaded between script tag and callback
      if (window.YT && window.YT.Player) resolve();
    });
  }

  function ensureYt(id) {
    return loadYtApi().then(() => new Promise((resolve) => {
      if (ytPlayer && ytReady) {
        const cur = ytPlayer.getVideoData && ytPlayer.getVideoData().video_id;
        if (cur !== id) ytPlayer.loadVideoById(id);
        resolve(ytPlayer);
        return;
      }
      const host = document.getElementById('ytWedding');
      if (!host || !window.YT) { resolve(null); return; }
      ytPlayer = new window.YT.Player('ytWedding', {
        videoId: id,
        width: 200,
        height: 113,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: location.origin,
          fs: 0,
        },
        events: {
          onReady: () => {
            ytReady = true;
            if (pendingPlay && audioOn) {
              try { ytPlayer.playVideo(); } catch (e) {}
            }
            resolve(ytPlayer);
          },
          onStateChange: (ev) => {
            // 0 = ended
            if (ev && ev.data === 0 && audioOn) next(1, true);
          },
        },
      });
    }));
  }

  async function playCurrent() {
    const t = track();
    if (!t) return;
    setTitle();
    if (t.type === 'youtube' && t.youtubeId) {
      if (audioEl) { try { audioEl.pause(); } catch (e) {} }
      showYt(true);
      pendingPlay = true;
      const p = await ensureYt(t.youtubeId);
      if (p && ytReady && audioOn) {
        try { p.playVideo(); } catch (e) {}
      }
    } else if (t.file) {
      showYt(false);
      if (ytPlayer && ytReady) {
        try { ytPlayer.pauseVideo(); } catch (e) {}
      }
      const el = ensureAudioEl();
      el.src = `./assets/wedding_songs/${t.file}`;
      if (audioOn) {
        try { await el.play(); } catch (e) { /* gesture may be required */ }
      }
    }
    applyVolume(true);
  }

  function applyVolume(force) {
    const sp = spatial();
    const d = camera ? camera.position.distanceTo(center) : 999;
    const vol = audioOn ? volumeForDist(d, sp.silentBeyond, sp.fullWithin) : 0;
    if (!force && Math.abs(vol - lastVol) < 0.01) return;
    lastVol = vol;
    if (audioEl) audioEl.volume = vol;
    if (ytPlayer && ytReady && typeof ytPlayer.setVolume === 'function') {
      try {
        ytPlayer.setVolume(Math.round(vol * 100));
        if (vol <= 0 && typeof ytPlayer.mute === 'function') ytPlayer.mute();
        else if (vol > 0 && typeof ytPlayer.unMute === 'function') ytPlayer.unMute();
      } catch (e) {}
    }
    if (ui.btnSound) {
      ui.btnSound.classList.toggle('on', audioOn);
      const ico = ui.btnSound.querySelector('.ico');
      if (ico) ico.textContent = audioOn ? '🔊' : '🔈';
    }
  }

  async function next(dir, auto) {
    const list = tracks();
    if (!list.length) return;
    index = (index + (dir || 1) + list.length) % list.length;
    setTitle();
    if (audioOn || auto) await playCurrent();
    else {
      // preview title only
      showYt(track() && track().type === 'youtube' && audioOn);
    }
  }

  async function toggleSound() {
    audioOn = !audioOn;
    if (audioOn) await playCurrent();
    else {
      if (audioEl) try { audioEl.pause(); } catch (e) {}
      if (ytPlayer && ytReady) try { ytPlayer.pauseVideo(); } catch (e) {}
      showYt(false);
      applyVolume(true);
    }
  }

  function enterCam() {
    camOn = true;
    document.body.classList.add('wedding-cam');
    const tour = getTour && getTour();
    if (tour && tour.pause) tour.pause();
    if (controls) {
      controls.enabled = false;
      controls.enableDamping = false;
    }
  }

  function exitCam() {
    if (!camOn) return;
    camOn = false;
    document.body.classList.remove('wedding-cam');
    if (controls) {
      controls.enabled = true;
      controls.enableDamping = true;
      controls.target.copy(center);
      controls.update();
    }
    const tour = getTour && getTour();
    if (tour && tour.pause) tour.pause(); // stay paused; tour resumes after idle
  }

  function toggleCam() {
    if (camOn) exitCam();
    else enterCam();
  }

  function updateCam(dt) {
    if (!camOn || !camera) return;
    camAng += (dt || 0.016) * 0.32;
    // ring center may sway slightly — follow it
    const sway = 0.35;
    const cx = PLAZA.x + Math.sin(camAng * 0.35) * sway;
    const cz = PLAZA.z + Math.cos(camAng * 0.28) * sway;
    const lookY = baseY + 1.35;
    const rad = 24.5;
    const h = baseY + 7.2;
    camera.position.set(
      cx + Math.cos(camAng) * rad,
      h,
      cz + Math.sin(camAng) * rad * 0.92,
    );
    const tgt = new THREE.Vector3(cx, lookY, cz);
    camera.lookAt(tgt);
    if (controls) controls.target.copy(tgt);
  }

  function updateDancers(dt, t) {
    const time = t != null ? t : performance.now() / 1000;
    crowd.update(dt, time, camera);
    center.set(
      PLAZA.x + Math.sin(time * 0.32) * 0.15,
      baseY + 1.4,
      PLAZA.z + Math.cos(time * 0.25) * 0.15,
    );
  }

  function setNight(n) {
    night = n || 0;
    const mats = (lights && lights.userData.bulbMats) || [];
    for (const m of mats) {
      const k = 0.55 + night * 0.9;
      m.color.setHex(m.userData.base || 0xffe08a);
      m.color.multiplyScalar(0.8 + k * 0.55);
    }
    if (group.userData.fillLight) group.userData.fillLight.intensity = 0.2 + night * 2.1;
    if (group.userData.stageLight) group.userData.stageLight.intensity = 0.12 + night * 1.5;
  }

  function update(dt, nightFactor, t) {
    if (nightFactor != null) setNight(nightFactor);
    updateDancers(dt, t);
    updateCam(dt);
    applyVolume(false);
  }

  function bindUI() {
    if (ui.btnCam) ui.btnCam.addEventListener('click', (e) => { e.stopPropagation(); toggleCam(); });
    if (ui.btnSound) ui.btnSound.addEventListener('click', (e) => { e.stopPropagation(); toggleSound(); });
    if (ui.btnPrev) ui.btnPrev.addEventListener('click', (e) => { e.stopPropagation(); next(-1, audioOn); });
    if (ui.btnNext) ui.btnNext.addEventListener('click', (e) => { e.stopPropagation(); next(1, audioOn); });
    if (ui.back) ui.back.addEventListener('click', (e) => { e.stopPropagation(); exitCam(); });
    // tap the map to exit the wedding camera (ignore the entering click)
    let armed = false;
    const canvas = document.getElementById('c');
    const arm = () => { if (camOn) armed = true; };
    const maybeExit = (ev) => {
      if (!camOn || !armed) return;
      if (ev && ev.target && ev.target.closest && ev.target.closest('#dock, #bottomStack, #weddingBack, #ytWeddingWrap, #ownerPanel')) return;
      exitCam();
      armed = false;
    };
    if (canvas) {
      canvas.addEventListener('pointerdown', () => { arm(); }, { passive: true });
      canvas.addEventListener('pointerup', maybeExit, { passive: true });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && camOn) exitCam();
    });
    setTitle();
  }

  fetch('./assets/wedding_songs/playlist.json')
    .then((r) => r.json())
    .then((data) => {
      playlist = data || playlist;
      index = Math.max(0, data.defaultIndex | 0);
      setTitle();
    })
    .catch(() => {});

  bindUI();
  window.__weddingReady = true;

  return {
    group,
    center,
    update,
    setNight,
    enterCam,
    exitCam,
    toggleCam,
    isCam: () => camOn,
    toggleSound,
    playCurrent,
    next,
    getIndex: () => index,
    getTrack: track,
    getCenter: () => center.clone(),
    getCrowdCount: () => crowd.count,
  };
}
