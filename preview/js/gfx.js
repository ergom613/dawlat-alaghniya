// Preview graphics upgrade: quality tiers, ACES tone mapping, soft sun shadows
// that follow the camera, subtle bloom (high tier), and a reflective water shader.
// Quality: ?q=low | ?q=mid | ?q=high. Default: high on desktop, mid on phones,
// low on weak devices (≤2 cores or ≤2 GB memory) or when saveData is on.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';

// Device profile (computed once). Phones get lighter defaults; weak phones the lightest.
export const DEVICE = (() => {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const save = !!(nav.connection && nav.connection.saveData);
  const ua = nav.userAgent || '';
  const touch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (nav.maxTouchPoints || 0) > 1);
  const small = (typeof window !== 'undefined') && Math.min(window.innerWidth, window.innerHeight) < 600;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && small) || (/Macintosh/.test(ua) && touch);
  const weak = save || cores <= 4 && mobile && mem <= 3 || cores <= 2 || mem <= 2;
  let forced = '';
  try { forced = (new URLSearchParams(location.search).get('q') || '').toLowerCase(); } catch { /* */ }
  if (!['low', 'mid', 'high'].includes(forced)) forced = '';
  return { cores, mem, save, mobile, weak, forced };
})();

export function detectQuality() {
  if (DEVICE.forced) return DEVICE.forced;
  if (DEVICE.weak) return 'low';
  return DEVICE.mobile ? 'mid' : 'high';
}

// nearR / nearMax: houses drawn with the full model (others are box stand-ins).
// labels: name tags in the DOM pool. particles / birds: share of the desktop amount.
export const QUALITY_SETTINGS = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 0, bloom: false, streetTrees: 0.4, pointLights: false, terrainStride: 2, nearR: 120, nearMax: 220, labels: 36, particles: 0.35, birds: 0.3, interiorR: 70 },
  mid: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, bloom: false, streetTrees: 0.75, pointLights: true, terrainStride: 1, nearR: 320, nearMax: 1200, labels: 50, particles: 0.7, birds: 0.7, interiorR: 110 },
  high: { pixelRatio: 1.75, shadows: true, shadowSize: 2048, bloom: true, streetTrees: 1, pointLights: true, terrainStride: 1, nearR: 1200, nearMax: 3000, labels: 60, particles: 1, birds: 1, interiorR: 140 },
};
// Extra limits on phones (on top of the tier, also when ?q= forces a tier).
const MOBILE_CAPS = {
  low: { pixelRatio: 1 },
  mid: { pixelRatio: 1.5, shadowSize: 512, bloom: false, pointLights: false, terrainStride: 2, nearR: 170, nearMax: 360, labels: 40, particles: 0.45, birds: 0.4, streetTrees: 0.6, interiorR: 80 },
  high: { pixelRatio: 1.5, shadowSize: 1024, bloom: false, pointLights: false, nearR: 240, nearMax: 600, labels: 50, particles: 0.6, birds: 0.6, interiorR: 100 },
};

export function qualitySettings(quality) {
  const base = { ...(QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.mid) };
  if (DEVICE.mobile) Object.assign(base, MOBILE_CAPS[quality] || {});
  if (DEVICE.weak) base.pixelRatio = Math.min(base.pixelRatio, 1);
  base.mobile = DEVICE.mobile;
  base.name = quality;
  return base;
}

// Shared, importable profile for modules that size particle systems at creation.
export const PERF = qualitySettings(detectQuality());

export function setupRenderer(renderer, quality) {
  const qs = qualitySettings(quality);
  renderer.toneMapping = quality === 'low' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = qs.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return qs;
}

export function setupSunShadow(sun, qs) {
  if (!qs.shadows) return;
  sun.castShadow = true;
  sun.shadow.mapSize.set(qs.shadowSize, qs.shadowSize);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 3;
  const c = sun.shadow.camera;
  c.near = 10; c.far = 2400;
  c.left = -200; c.right = 200; c.top = 200; c.bottom = -200;
  c.updateProjectionMatrix();
}

const _dir = new THREE.Vector3();
// dayNight places the sun far away; re-centre it on the camera target so the
// shadow frustum covers what is on screen (sized by zoom distance).
export function followSun(sun, target, camDist, qs) {
  _dir.copy(sun.position);
  if (_dir.lengthSq() < 1) _dir.set(1, 1, 1);
  _dir.normalize();
  if (_dir.y < 0.05) _dir.y = 0.05;
  sun.position.copy(target).addScaledVector(_dir, 1200);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
  if (!qs.shadows) return;
  const half = THREE.MathUtils.clamp(camDist * 0.75, 60, 420);
  const c = sun.shadow.camera;
  if (Math.abs(c.right - half) > 4) {
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.updateProjectionMatrix();
  }
  sun.castShadow = camDist < 1400;
}

export function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transparent || m.isMeshBasicMaterial)) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

export function createComposer(renderer, scene, camera, qs) {
  if (!qs.bloom) return null;
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    render() { composer.render(); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); },
    setNight(n) {
      bloom.strength = 0.18 + n * 0.5;
      bloom.threshold = 0.92 - n * 0.2;
    },
  };
}

// Reflective, gently animated water with fresnel sky reflection, sun glint and fog.
export function makeWaterMaterial(uniforms) {
  Object.assign(uniforms, {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSunCol: { value: new THREE.Color(0xfff2d8) },
    uSkyTop: { value: new THREE.Color(0x7eb7e0) },
    uSkyBot: { value: new THREE.Color(0xeff4e8) },
    uNight: { value: 0 },
    uFogColor: { value: new THREE.Color(0x9ec9e0) },
    uFogNear: { value: 1400 },
    uFogFar: { value: 9000 },
  });
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vW;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      uniform float uTime, uNight, uFogNear, uFogFar;
      uniform vec3 uColor, uColor2, uSunDir, uSunCol, uSkyTop, uSkyBot, uFogColor;
      varying vec3 vW;
      varying vec2 vUv;
      vec2 wave(vec2 p, vec2 d, float f, float s, float a){
        float ph = dot(p, d) * f + uTime * s;
        return d * cos(ph) * a * f;
      }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.045, 0.9, 0.9)
               + wave(p, normalize(vec2(-0.4, 1.0)), 0.07, 1.3, 0.55)
               + wave(p, normalize(vec2(0.7, -0.8)), 0.13, 1.9, 0.28)
               + wave(p, normalize(vec2(-1.0, -0.2)), 0.23, 2.6, 0.14);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), clamp(dist / 5000.0, 0.0, 0.85)));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uSkyBot, uSkyTop, clamp(r.y * 1.4, 0.0, 1.0));
        float k = 0.5 + 0.5 * sin(vUv.x * 18.0 + uTime * 0.35) * sin(vUv.y * 14.0 - uTime * 0.28);
        vec3 deep = mix(uColor, uColor2, k * 0.6 + 0.2);
        vec3 col = mix(deep, sky, fres * 0.85);
        float sp = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0);
        float sunUp = smoothstep(-0.05, 0.15, uSunDir.y);
        col += uSunCol * sp * 2.2 * sunUp * (1.0 - uNight * 0.7);
        float f = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// One shared plank texture (multiplied by each palette colour) for wooden houses.
let _plank = null;
export function plankTexture() {
  if (_plank) return _plank;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e0d4';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    const s = 200 + ((y * 37) % 40);
    g.fillStyle = `rgb(${s},${s - 8},${s - 18})`;
    g.fillRect(0, y, 128, 15);
    g.fillStyle = 'rgba(60,40,20,0.45)';
    g.fillRect(0, y + 15, 128, 1);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = 'rgba(90,60,30,0.10)';
      g.fillRect((k * 53 + y * 7) % 128, y + 3 + (k % 3) * 3, 30, 1);
    }
  }
  _plank = new THREE.CanvasTexture(c);
  _plank.colorSpace = THREE.SRGBColorSpace;
  _plank.wrapS = _plank.wrapT = THREE.RepeatWrapping;
  return _plank;
}

// Adaptive quality: if the frame rate stays under 30 fps, step quality down
// (bloom → shadows → pixel ratio → fewer detailed houses / labels). Never steps up.
export function createAdaptiveQuality({ steps, minFps = 30, windowMs = 2000, badWindows = 2, graceMs = 5000 }) {
  let t0 = 0, frames = 0, bad = 0, level = 0, started = 0, lastFps = 0;
  const log = [];
  return {
    get level() { return level; },
    get fps() { return lastFps; },
    log,
    frame(now) {
      if (!started) { started = now; t0 = now; return; }
      if (now - started < graceMs) { t0 = now; frames = 0; return; }
      frames++;
      const dt = now - t0;
      if (dt < windowMs) return;
      const fps = (frames * 1000) / dt;
      lastFps = fps;
      t0 = now; frames = 0;
      if (dt > windowMs * 3) return; // tab was hidden / stalled: ignore
      if (fps < minFps) bad++; else bad = 0;
      if (bad >= badWindows && level < steps.length) {
        const s = steps[level++];
        bad = 0;
        try { s.apply(); } catch (e) { console.warn('adaptive step failed', e); }
        log.push({ step: s.name, fps: Math.round(fps), at: Math.round(now) });
        started = now; // let it settle before judging again
      }
    },
  };
}
