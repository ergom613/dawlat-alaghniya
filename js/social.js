// «🌹 سلّم عجارك» + presence dots for the preview city.
// Self-contained: hooks MonacoApp after boot. Does not touch house.group,
// getPlotTents() shape, or app.render().
import * as THREE from 'three';
import { FIREBASE_CONFIG as CFG_FILE } from './firebase-config.js';

const RECORD = new URLSearchParams(location.search).get('record') === '1';
const LS_ID = 'dawla_my_house';
const LS_GREETS = 'dawla_greets_local';
const HEARTBEAT_MS = 60 * 1000;
const ONLINE_MS = 2 * 60 * 1000;
const FB_VER = '10.14.1';
const PICK_PX = 72;

const _tmpV = new THREE.Vector3();

function isRecording() {
  if (RECORD) return true;
  if (document.body && document.body.classList.contains('recording')) return true;
  const hud = document.getElementById('hud');
  if (hud && (hud.hidden || hud.style.display === 'none')) return true;
  return false;
}

function arNum(n) {
  return String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function toHouseNum(v) {
  const n = parseInt(v, 10);
  return n > 0 ? n : 0;
}

function getMyHouse() {
  try { return toHouseNum(localStorage.getItem(LS_ID)); } catch { return 0; }
}

function setMyHouse(n) {
  const num = toHouseNum(n);
  try {
    if (num) localStorage.setItem(LS_ID, String(num));
    else localStorage.removeItem(LS_ID);
  } catch { /* private mode */ }
  return num;
}

function loadLocalGreets() {
  try { return JSON.parse(localStorage.getItem(LS_GREETS) || '{}') || {}; } catch { return {}; }
}

function saveLocalGreets(map) {
  try { localStorage.setItem(LS_GREETS, JSON.stringify(map)); } catch { /* private mode */ }
}

function residents() {
  const app = window.MonacoApp;
  return (app && app.getResidents && app.getResidents()) || [];
}

function tents() {
  const app = window.MonacoApp;
  return (app && app.getPlotTents && app.getPlotTents()) || [];
}

function findResident(num) {
  const n = toHouseNum(num);
  if (!n) return null;
  return residents().find((r) => toHouseNum(r.id) === n) || null;
}

function selectedResident() {
  const all = residents();
  const skip = new Set(tents().map((t) => t.resident && toHouseNum(t.resident.id)));
  return all.find((r) => !skip.has(toHouseNum(r.id))) || all[0] || null;
}

function residentLabel(r) {
  if (!r) return '';
  if (r.anonymous) return r.label || ('بيت رقم ' + r.id);
  return r.name || r.label || ('بيت رقم ' + r.id);
}

function isConfigReady(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (!cfg.apiKey || !cfg.databaseURL || !cfg.projectId) return false;
  const key = String(cfg.apiKey);
  if (!key || key.indexOf('YOUR_') === 0 || key === 'placeholder') return false;
  return true;
}

function waitForApp() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (window.__ready && window.MonacoApp) return resolve(window.MonacoApp);
      if (performance.now() - t0 > 180000) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/* ---------------- style + chrome ---------------- */

function injectStyle() {
  if (document.getElementById('dawla-social-css')) return;
  const s = document.createElement('style');
  s.id = 'dawla-social-css';
  s.textContent = `
    #socialLayer { position: fixed; inset: 0; pointer-events: none; z-index: 6; overflow: hidden; }
    #greetCard {
      position: fixed; z-index: 76; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--safe-bottom, 10px) + 96px); width: min(340px, calc(100vw - 24px));
      padding: 12px 14px 14px; text-align: center; border-color: var(--gold);
      box-shadow: 0 0 0 2px rgba(232,196,90,0.35), 0 10px 28px rgba(0,0,0,0.4);
      pointer-events: auto;
    }
    #greetCard[hidden] { display: none !important; }
    #greetCard .gc-kicker { font-size: 12px; color: var(--gold); font-weight: 800; }
    #greetCard .gc-name {
      font-size: 18px; font-weight: 800; margin: 2px 28px 4px;
      direction: ltr; unicode-bidi: plaintext; overflow-wrap: anywhere;
    }
    #greetCard .gc-meta {
      display: flex; gap: 8px; justify-content: center; font-size: 13px;
      color: var(--muted); margin-bottom: 10px; flex-wrap: wrap;
    }
    #greetCard .gc-meta span {
      background: rgba(255,255,255,0.08); border-radius: 999px; padding: 3px 10px;
    }
    #greetCard .gc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 5px; vertical-align: middle; }
    #greetCard .gc-dot.on { background: #3dcc6f; box-shadow: 0 0 6px #3dcc6f; }
    #greetCard .gc-dot.off { background: #e04b4b; box-shadow: 0 0 6px #e04b4b; }
    #greetCard .gc-actions { display: flex; flex-direction: column; gap: 6px; }
    #greetCard .gc-actions .btn { width: 100%; }
    #greetCardClose {
      position: absolute; top: 8px; left: 8px; width: 30px; height: 30px; border-radius: 50%;
      border: 1px solid var(--line); background: rgba(255,255,255,0.08); color: var(--text);
      cursor: pointer; font-family: inherit;
    }
    #greetToast {
      position: fixed; z-index: 90; left: 50%; transform: translateX(-50%);
      top: calc(var(--safe-top, 10px) + 120px); padding: 10px 16px; font-weight: 800;
      pointer-events: none;
    }
    #greetToast[hidden] { display: none !important; }
    #greetCard [hidden], #houseCard [hidden] { display: none !important; }
    .presence-dot {
      position: absolute; top: 50%; right: -1px; width: 8px; height: 8px;
      border-radius: 50%; transform: translate(60%, -50%);
      box-shadow: 0 0 5px currentColor; border: 1px solid rgba(0,0,0,0.35);
      pointer-events: none; z-index: 2;
    }
    .presence-dot.on { background: #3dcc6f; color: #3dcc6f; }
    .presence-dot.off { background: #e04b4b; color: #e04b4b; }
    .greet-count {
      position: absolute; left: 0; top: 0; pointer-events: none;
      background: rgba(18,16,12,0.92); border: 1px solid rgba(232,196,90,0.9);
      color: #fff6df; border-radius: 999px; padding: 1px 7px;
      font-family: inherit; font-size: 11px; font-weight: 800;
      white-space: nowrap; transform: translate(-50%, 8px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.35); z-index: 7;
    }
    .dawla-rose {
      position: absolute; left: 0; top: 0; pointer-events: none;
      font-size: 28px; line-height: 1; z-index: 20;
      animation: dawla-rose-up 1.7s ease-out forwards;
    }
    @keyframes dawla-rose-up {
      0% { opacity: 1; transform: translate(-50%, 0) scale(0.55) rotate(-12deg); }
      25% { opacity: 1; transform: translate(calc(-50% + var(--dx, 0px)), -28px) scale(1.25) rotate(8deg); }
      100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), -128px) scale(1) rotate(18deg); }
    }
    body.recording #socialLayer,
    body.recording #greetCard,
    body.recording #greetToast { display: none !important; }
  `;
  document.head.appendChild(s);
}

function el(tag, attrs, html) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    if (k === 'class') n.className = attrs[k];
    else if (attrs[k] === false || attrs[k] == null) continue;
    else n.setAttribute(k, attrs[k] === true ? '' : String(attrs[k]));
  }
  if (html != null) n.innerHTML = html;
  return n;
}

/* ---------------- social state ---------------- */

const state = {
  ready: false,
  firebase: null, // { db, api }
  firebaseOn: false,
  presence: Object.create(null), // houseNum -> ts(ms)
  greets: Object.create(null),   // houseNum -> { n, lastId, lastFrom, t }
  seenLast: Object.create(null),
  myHouse: 0,
  openHouse: 0,
  hbTimer: null,
  unsubConnected: null,
  unsubPresence: null,
  unsubGreets: null,
  layer: null,
  card: null,
  toast: null,
  lastPlayed: Object.create(null),
};

function greetRecord(num) {
  const n = toHouseNum(num);
  return state.greets[n] || { n: 0, lastId: '', lastFrom: 0, t: 0 };
}

function isOnline(num) {
  if (!state.firebaseOn) return false;
  const t = state.presence[toHouseNum(num)];
  if (!t) return false;
  return (Date.now() - t) < ONLINE_MS;
}

/* ---------------- Firebase ---------------- */

async function loadFirebase() {
  const cfg = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || CFG_FILE;
  if (!isConfigReady(cfg)) return null;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
  const dbMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-database.js`);
  const app = appMod.initializeApp(cfg, 'dawla-social');
  const db = dbMod.getDatabase(app);
  return { app, db, api: dbMod, cfg };
}

const presenceSubs = new Map(); // houseNum -> unsubscribe
let presenceWantKey = '';

function applyPresenceSnap(num, snap) {
  const n = toHouseNum(num);
  const val = snap && snap.val && snap.val();
  const t = val && typeof val === 'object' ? val.t : val;
  if (typeof t === 'number') state.presence[n] = t;
  else delete state.presence[n];
}

function syncPresenceListeners(visibleNums) {
  const fb = state.firebase;
  if (!fb) return;
  const want = new Set();
  for (const n of visibleNums || []) {
    const num = toHouseNum(n);
    if (num) want.add(num);
  }
  if (state.myHouse) want.add(state.myHouse);
  if (state.openHouse) want.add(state.openHouse);
  const key = [...want].sort((a, b) => a - b).join(',');
  if (key === presenceWantKey) return;
  presenceWantKey = key;
  const { db, api } = fb;
  for (const [n, unsub] of [...presenceSubs]) {
    if (!want.has(n)) {
      try { unsub(); } catch { /* */ }
      presenceSubs.delete(n);
      delete state.presence[n];
    }
  }
  for (const n of want) {
    if (presenceSubs.has(n)) continue;
    const unsub = api.onValue(api.ref(db, 'presence/' + n), (snap) => {
      applyPresenceSnap(n, snap);
      refreshChrome();
    }, (err) => console.warn('[social] presence', n, err && err.message));
    presenceSubs.set(n, unsub);
  }
}

function listenRoots() {
  const fb = state.firebase;
  if (!fb) return;
  const { db, api } = fb;
  if (state.unsubGreets) { state.unsubGreets(); state.unsubGreets = null; }
  // Presence is subscribed per visible house (rules allow child reads, not the root).

  state.unsubGreets = api.onValue(api.ref(db, 'greets'), (snap) => {
    const val = snap.val() || {};
    for (const k of Object.keys(val)) {
      const n = toHouseNum(k);
      if (!n) continue;
      const row = val[k] || {};
      let count = typeof row.n === 'number' ? row.n : 0;
      if (!count && row.inbox) count = Object.keys(row.inbox).length;
      const last = row.last || {};
      const rec = { n: count, lastId: last.id || '', lastFrom: toHouseNum(last.from), t: last.t || 0 };
      const had = Object.prototype.hasOwnProperty.call(state.seenLast, n);
      const prevId = state.seenLast[n] || '';
      state.greets[n] = rec;
      if (had && rec.lastId && rec.lastId !== prevId) playRose(n);
      if (rec.lastId) state.seenLast[n] = rec.lastId;
      else if (!had) state.seenLast[n] = '';
    }
    refreshChrome();
  }, (err) => console.warn('[social] greets', err && err.message));
}

async function startPresence() {
  const fb = state.firebase;
  const my = state.myHouse;
  if (!fb || !my) return;
  const { db, api } = fb;
  if (state.unsubConnected) { state.unsubConnected(); state.unsubConnected = null; }
  if (state.hbTimer) { clearInterval(state.hbTimer); state.hbTimer = null; }

  const writeBeat = async () => {
    try {
      const pref = api.ref(db, 'presence/' + my);
      await api.onDisconnect(pref).remove();
      await api.set(pref, { t: api.serverTimestamp() });
    } catch (e) {
      console.warn('[social] presence write', e && e.message);
    }
  };

  state.unsubConnected = api.onValue(api.ref(db, '.info/connected'), (snap) => {
    if (snap.val()) writeBeat();
  });
  state.hbTimer = setInterval(writeBeat, HEARTBEAT_MS);
  await writeBeat();
}

async function stopPresence() {
  const fb = state.firebase;
  const my = state.myHouse;
  if (state.hbTimer) { clearInterval(state.hbTimer); state.hbTimer = null; }
  if (state.unsubConnected) { state.unsubConnected(); state.unsubConnected = null; }
  if (!fb || !my) return;
  try {
    const { db, api } = fb;
    const pref = api.ref(db, 'presence/' + my);
    await api.onDisconnect(pref).cancel();
    await api.remove(pref);
  } catch { /* leaving */ }
}

/* ---------------- greetings ---------------- */

function mergeLocalGreets() {
  const local = loadLocalGreets();
  for (const k of Object.keys(local)) {
    const n = toHouseNum(k);
    const row = local[k] || {};
    const cur = state.greets[n];
    const count = typeof row.n === 'number' ? row.n : 0;
    if (!cur || count > cur.n) {
      state.greets[n] = {
        n: count,
        lastId: row.lastId || (cur && cur.lastId) || '',
        lastFrom: toHouseNum(row.lastFrom),
        t: row.t || 0,
      };
    }
  }
}

function rememberLocal(num, rec) {
  const map = loadLocalGreets();
  map[String(num)] = rec;
  saveLocalGreets(map);
}

async function sendGreet(toNum) {
  const to = toHouseNum(toNum);
  const from = state.myHouse;
  if (!to) return { ok: false, reason: 'no-target' };
  if (!from) return { ok: false, reason: 'no-identity' };
  if (from === to) return { ok: false, reason: 'self' };

  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const prev = greetRecord(to);
  const rec = { n: (prev.n || 0) + 1, lastId: id, lastFrom: from, t: Date.now() };
  state.greets[to] = rec;
  state.seenLast[to] = id;
  rememberLocal(to, rec);
  playRose(to);
  refreshChrome();

  const fb = state.firebase;
  if (fb) {
    try {
      const { db, api } = fb;
      const base = api.ref(db, 'greets/' + to);
      await api.set(api.child(base, 'inbox/' + id), { from, t: api.serverTimestamp() });
      await api.set(api.child(base, 'n'), rec.n);
      await api.set(api.child(base, 'last'), { from, t: api.serverTimestamp(), id });
    } catch (e) {
      console.warn('[social] greet write', e && e.message);
    }
  }
  return { ok: true, rec };
}

/* ---------------- overlays ---------------- */

function projectHouse(r) {
  const app = window.MonacoApp;
  if (!app || !app.camera || !app.renderer || !r) return null;
  const cam = app.camera;
  const canvas = app.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const gy = app.groundY ? app.groundY(r.x, r.z) : 0;
  const tentsList = tents();
  let height = 6;
  const item = tentsList.find((t) => t.resident && toHouseNum(t.resident.id) === toHouseNum(r.id));
  if (item && item.house && item.house.getHeight) height = item.house.getHeight();
  else if (r.level) height = Math.max(4, 2 + (r.level || 1) * 0.7);
  _tmpV.set(r.x, gy + 0.12 + height + 0.7, r.z).project(cam);
  if (_tmpV.z < -1.05 || _tmpV.z > 1.05) return null;
  const x = (_tmpV.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-_tmpV.y * 0.5 + 0.5) * rect.height + rect.top;
  if (x < -80 || y < -80 || x > rect.width + rect.left + 80 || y > rect.height + rect.top + 80) return null;
  return { x, y, z: _tmpV.z };
}

function playRose(num) {
  if (isRecording()) return;
  const n = toHouseNum(num);
  const r = findResident(n);
  const layer = state.layer;
  if (!layer) return;
  let x, y;
  const tag = tagElsForHouses().get(n);
  if (tag && tag.el && tag.visible) {
    const br = tag.el.getBoundingClientRect();
    x = (br.left + br.right) / 2;
    y = br.top;
  } else {
    const p = r ? projectHouse(r) : null;
    if (p) { x = p.x; y = p.y; }
    else if (state.card && !state.card.hidden && n === state.openHouse) {
      const br = state.card.getBoundingClientRect();
      x = (br.left + br.right) / 2;
      y = br.top;
    } else {
      const hc = document.getElementById('houseCard');
      if (hc && !hc.hidden && toHouseNum(hc.dataset.id) === n) {
        const br = hc.getBoundingClientRect();
        x = (br.left + br.right) / 2;
        y = br.top;
      } else {
        return;
      }
    }
  }
  const now = Date.now();
  if (state.lastPlayed[num] && now - state.lastPlayed[num] < 400) return;
  state.lastPlayed[num] = now;
  const marks = ['🌹', '💖', '🌹', '🌸', '🌹'];
  for (let i = 0; i < 5; i++) {
    const rose = el('div', { class: 'dawla-rose', 'aria-hidden': 'true' });
    rose.textContent = marks[i];
    const dx = (i - 2) * 16;
    rose.style.setProperty('--dx', dx + 'px');
    rose.style.left = x + dx * 0.2 + 'px';
    rose.style.top = y + 'px';
    rose.style.animationDelay = (i * 0.07) + 's';
    layer.appendChild(rose);
    setTimeout(() => rose.remove(), 2000 + i * 70);
  }
}

function fromArDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function houseNumFromTagEl(el) {
  if (!el) return 0;
  if (el.dataset && el.dataset.house) return toHouseNum(el.dataset.house);
  const sm = (el.querySelector('small') && el.querySelector('small').textContent) || '';
  const st = (el.querySelector('strong') && el.querySelector('strong').textContent) || '';
  const m = (sm + ' ' + st).match(/بيت رقم\s*([0-9٠-٩]+)/);
  if (m) {
    const n = toHouseNum(fromArDigits(m[1]));
    if (n) { el.dataset.house = String(n); return n; }
  }
  const name = st.trim().toLowerCase();
  if (name) {
    const r = residents().find((x) => String(x.name || '').toLowerCase() === name)
      || residents().find((x) => String(x.label || '') === st.trim());
    if (r) { el.dataset.house = String(r.id); return toHouseNum(r.id); }
  }
  return 0;
}

function tagElsForHouses() {
  // Labels are pooled (item.tag is often null). Read the visible DOM tags
  // and map them back to a house via «بيت رقم …» or the name.
  const map = new Map();
  const nodes = document.querySelectorAll('#labels .name-tag');
  for (const el of nodes) {
    if (/(?:^| )(?:yacht|caption|crowd|cele-badge|gift)(?: |$)/.test(el.className)) continue;
    const on = el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    const num = houseNumFromTagEl(el);
    if (!num) continue;
    map.set(num, { el, visible: on, resident: findResident(num) });
  }
  return map;
}

function visibleResidentIds() {
  const app = window.MonacoApp;
  const scored = [];
  if (!app || !app.camera) return [];
  const cam = app.camera;
  const v = _tmpV;
  for (const r of residents()) {
    const n = toHouseNum(r.id);
    if (!n) continue;
    const gy = app.groundY ? app.groundY(r.x, r.z) : 0;
    v.set(r.x, gy + 4, r.z).project(cam);
    if (v.z >= -1 && v.z <= 1 && v.x >= -1.25 && v.x <= 1.25 && v.y >= -1.25 && v.y <= 1.2) {
      const dx = r.x - cam.position.x, dy = gy - cam.position.y, dz = r.z - cam.position.z;
      scored.push({ n, d: dx * dx + dy * dy + dz * dz });
    }
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, 80).map((s) => s.n);
}

function refreshChrome() {
  const recording = isRecording();
  if (state.layer) state.layer.style.display = recording ? 'none' : '';
  if (state.card && recording) state.card.hidden = true;

  const showDots = state.firebaseOn && !recording;
  const tags = tagElsForHouses();
  if (state.firebaseOn && !recording) {
    const vis = visibleResidentIds();
    for (const [num, info] of tags) { if (info.visible && !vis.includes(num)) vis.push(num); }
    syncPresenceListeners(vis);
  }

  // Presence dots on visible labels only.
  document.querySelectorAll('#labels .name-tag .presence-dot').forEach((d) => {
    const host = d.parentElement;
    let keep = false;
    for (const [, info] of tags) {
      if (info.el === host) { keep = true; break; }
    }
    if (!keep) d.remove();
  });
  if (showDots) {
    for (const [num, info] of tags) {
      if (!info.visible) {
        const old = info.el.querySelector('.presence-dot');
        if (old) old.remove();
        continue;
      }
      let dot = info.el.querySelector('.presence-dot');
      if (!dot) {
        dot = el('span', { class: 'presence-dot', 'aria-hidden': 'true' });
        info.el.appendChild(dot);
      }
      const on = isOnline(num);
      dot.classList.toggle('on', on);
      dot.classList.toggle('off', !on);
      dot.title = on ? 'موجود هلّق' : 'مو موجود';
    }
  } else {
    document.querySelectorAll('#labels .name-tag .presence-dot').forEach((d) => d.remove());
  }

  // Greet counters, positioned under visible labels / roofs.
  if (!state.layer) return;
  const have = new Set();
  if (!recording) {
    for (const [num, info] of tags) {
      const rec = greetRecord(num);
      if (!rec.n || !info.visible) continue;
      const p = projectHouse(info.resident);
      if (!p) continue;
      have.add(String(num));
      let badge = state.layer.querySelector('.greet-count[data-house="' + num + '"]');
      if (!badge) {
        badge = el('div', { class: 'greet-count', 'data-house': String(num) });
        state.layer.appendChild(badge);
      }
      badge.textContent = '🌹 ' + arNum(rec.n) + ' سلام';
      badge.style.left = p.x + 'px';
      badge.style.top = p.y + 'px';
      badge.style.display = '';
    }
  }
  state.layer.querySelectorAll('.greet-count').forEach((b) => {
    if (!have.has(b.getAttribute('data-house'))) b.remove();
  });

  if (state.openHouse) syncCard(findResident(state.openHouse));
  syncHouseCardExtras();
}

function showToast(msg) {
  if (!state.toast) return;
  state.toast.textContent = msg;
  state.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { state.toast.hidden = true; }, 2200);
}

function syncCard(r) {
  const card = state.card;
  if (!card || !r) return;
  const num = toHouseNum(r.id);
  const mine = state.myHouse;
  card.dataset.id = String(num);
  card.querySelector('.gc-name').textContent = residentLabel(r);
  card.querySelector('.gc-num').textContent = r.label || ('بيت رقم ' + arNum(num));
  const rec = greetRecord(num);
  const countEl = card.querySelector('.gc-count');
  countEl.textContent = rec.n ? ('🌹 ' + arNum(rec.n) + ' سلام') : '🌹 ما في سلام بعد';
  const pres = card.querySelector('.gc-pres');
  const dot = card.querySelector('.gc-dot');
  if (state.firebaseOn) {
    const on = isOnline(num);
    pres.hidden = false;
    dot.classList.toggle('on', on);
    dot.classList.toggle('off', !on);
    pres.lastChild.textContent = on ? ' موجود هلّق' : ' مو موجود';
  } else {
    pres.hidden = true;
  }
  const greetBtn = card.querySelector('#greetBtn');
  const claimBtn = card.querySelector('#claimBtn');
  const mineNote = card.querySelector('.gc-mine');
  if (mine && mine === num) {
    greetBtn.hidden = true;
    claimBtn.hidden = true;
    mineNote.hidden = false;
    mineNote.textContent = 'هذا بيتك 🏠';
    card.querySelector('.gc-kicker').textContent = '🏡 بيتك';
  } else if (!mine) {
    greetBtn.hidden = false;
    greetBtn.textContent = '🌹 سلّم عجارك';
    claimBtn.hidden = false;
    mineNote.hidden = true;
    card.querySelector('.gc-kicker').textContent = '🏡 البيت';
  } else {
    greetBtn.hidden = false;
    greetBtn.textContent = '🌹 سلّم عجارك';
    claimBtn.hidden = true;
    mineNote.hidden = true;
    card.querySelector('.gc-kicker').textContent = '🏡 بيت جارك';
  }
}

function openCard(r) {
  if (!r || isRecording()) return;
  state.openHouse = toHouseNum(r.id);
  hookHouseCard();
  const hc = document.getElementById('houseCard');
  if (hc && !hc.hidden && toHouseNum(hc.dataset.id) === state.openHouse) {
    if (state.card) state.card.hidden = true;
    syncHouseCardExtras();
    return;
  }
  state.card.hidden = false;
  syncCard(r);
}

function closeCard() {
  state.openHouse = 0;
  if (state.card) state.card.hidden = true;
}

function buildChrome() {
  injectStyle();
  let layer = document.getElementById('socialLayer');
  if (!layer) {
    layer = el('div', { id: 'socialLayer', 'aria-hidden': 'true' });
    document.body.appendChild(layer);
  }
  state.layer = layer;

  let card = document.getElementById('greetCard');
  if (!card) {
    card = el('div', { id: 'greetCard', class: 'panel', hidden: true, dir: 'rtl', role: 'dialog', 'aria-label': 'سلّم عجارك' });
    card.innerHTML = `
      <button id="greetCardClose" type="button" aria-label="سكّر">✕</button>
      <div class="gc-kicker">🏡 البيت</div>
      <div class="gc-name"></div>
      <div class="gc-meta">
        <span class="gc-num"></span>
        <span class="gc-count"></span>
        <span class="gc-pres"><i class="gc-dot off"></i></span>
      </div>
      <div class="gc-mine" hidden></div>
      <div class="gc-actions">
        <button id="greetBtn" class="btn primary" type="button">🌹 سلّم عجارك</button>
        <button id="claimBtn" class="btn" type="button">هذا بيتي 🏠</button>
      </div>
    `;
    document.body.appendChild(card);
  }
  state.card = card;
  const close = card.querySelector('#greetCardClose');
  if (close && !close.__bound) {
    close.__bound = true;
    close.addEventListener('click', closeCard);
  }
  const greetBtn = card.querySelector('#greetBtn');
  if (greetBtn && !greetBtn.__bound) {
    greetBtn.__bound = true;
    greetBtn.addEventListener('click', async () => {
      const to = state.openHouse;
      if (!state.myHouse) {
        showToast('دوّر على بيتك أول لحتى نسلّم باسمك');
        const input = document.getElementById('search');
        if (input) {
          input.focus();
          input.placeholder = 'اكتب اسمك أو رقم بيتك';
        }
        return;
      }
      const res = await sendGreet(to);
      if (!res.ok && res.reason === 'self') showToast('ما فيك تسلّم عحالك 😊');
      else if (res.ok) showToast('سلّمنا عجارك 🌹');
    });
  }
  const claimBtn = card.querySelector('#claimBtn');
  if (claimBtn && !claimBtn.__bound) {
    claimBtn.__bound = true;
    claimBtn.addEventListener('click', async () => {
      const n = state.openHouse;
      if (!n) return;
      await claimHouse(n);
    });
  }

  let toast = document.getElementById('greetToast');
  if (!toast) {
    toast = el('div', { id: 'greetToast', class: 'panel', hidden: true, dir: 'rtl' });
    document.body.appendChild(toast);
  }
  state.toast = toast;

  // If the search worker's house card is present, add a greet button there too.
  hookHouseCard();
}

function hookHouseCard() {
  const hc = document.getElementById('houseCard');
  if (!hc) return;
  if (!hc.querySelector('#houseCardGreet')) {
    const btn = el('button', { id: 'houseCardGreet', class: 'btn primary', type: 'button' });
    btn.textContent = '🌹 سلّم عجارك';
    btn.style.width = '100%';
    btn.style.marginTop = '6px';
    hc.appendChild(btn);
    btn.addEventListener('click', async () => {
      const id = toHouseNum(hc.dataset.id || state.openHouse);
      if (!id) return;
      state.openHouse = id;
      if (!state.myHouse) {
        showToast('دوّر على بيتك أول لحتى نسلّم باسمك');
        const input = document.getElementById('search');
        if (input) { input.focus(); input.placeholder = 'اكتب اسمك أو رقم بيتك'; }
        return;
      }
      const res = await sendGreet(id);
      if (!res.ok && res.reason === 'self') showToast('ما فيك تسلّم عحالك 😊');
      else if (res.ok) showToast('سلّمنا عجارك 🌹');
      syncHouseCardExtras();
    });
  }
  if (!hc.querySelector('#houseCardClaim')) {
    const claim = el('button', { id: 'houseCardClaim', class: 'btn', type: 'button' });
    claim.textContent = 'هذا بيتي 🏠';
    claim.style.width = '100%';
    claim.style.marginTop = '6px';
    hc.appendChild(claim);
    claim.addEventListener('click', async () => {
      const id = toHouseNum(hc.dataset.id || state.openHouse);
      if (!id) return;
      state.openHouse = id;
      await claimHouse(id);
      syncHouseCardExtras();
    });
  }
  if (!hc.querySelector('#houseCardSocialMeta')) {
    const meta = el('div', { id: 'houseCardSocialMeta', class: 'hc-meta' });
    meta.innerHTML = '<span id="houseCardCount"></span><span id="houseCardPres"><i class="gc-dot off"></i> <span></span></span>';
    const actions = hc.querySelector('#houseCardShare');
    if (actions) actions.parentNode.insertBefore(meta, actions);
    else hc.appendChild(meta);
  }
  syncHouseCardExtras();
}

function syncHouseCardExtras() {
  const hc = document.getElementById('houseCard');
  if (!hc) return;
  const id = toHouseNum(hc.dataset.id || state.openHouse);
  if (id) state.openHouse = id;
  const greetBtn = hc.querySelector('#houseCardGreet');
  const claimBtn = hc.querySelector('#houseCardClaim');
  const countEl = hc.querySelector('#houseCardCount');
  const pres = hc.querySelector('#houseCardPres');
  const rec = greetRecord(id);
  if (countEl) countEl.textContent = rec.n ? ('🌹 ' + arNum(rec.n) + ' سلام') : '🌹 ما في سلام بعد';
  if (pres) {
    if (state.firebaseOn) {
      pres.hidden = false;
      const on = isOnline(id);
      const dot = pres.querySelector('.gc-dot');
      if (dot) { dot.classList.toggle('on', on); dot.classList.toggle('off', !on); }
      const lab = pres.querySelector('span') || pres.lastChild;
      if (lab && lab !== dot) lab.textContent = on ? ' موجود هلّق' : ' مو موجود';
    } else {
      pres.hidden = true;
    }
  }
  const mine = state.myHouse && state.myHouse === id;
  if (greetBtn) greetBtn.hidden = !!mine;
  if (claimBtn) claimBtn.hidden = !!(state.myHouse);
  if (mine) {
    const kicker = hc.querySelector('.hc-kicker');
    if (kicker) kicker.textContent = '🏡 هذا بيتك';
  }
}

async function claimHouse(n) {
  const num = toHouseNum(n);
  if (!num) return;
  const prev = state.myHouse;
  if (prev && prev !== num && state.firebase) {
    const { db, api } = state.firebase;
    try { await api.remove(api.ref(db, 'presence/' + prev)); } catch { /* ignore */ }
  }
  state.myHouse = setMyHouse(num);
  showToast('تمام، حفظنا بيتك رقم ' + arNum(num) + ' 🏠');
  if (state.firebaseOn) await startPresence();
  refreshChrome();
}

/* ---------------- input hooks ---------------- */

function residentFromFound(info) {
  if (!info) return null;
  if (info.resident && toHouseNum(info.resident.id)) return info.resident;
  return findResident(info.num || info.id);
}

let lastFoundKey = '';
function onHouseFound(info) {
  const r = residentFromFound(info);
  if (!r || isRecording()) return;
  const num = toHouseNum(r.id);
  const key = num + ':' + (info && (info.username || info.name) || '');
  const now = Date.now();
  if (lastFoundKey === key && now - onHouseFound._t < 600) return;
  onHouseFound._t = now;
  lastFoundKey = key;
  state.openHouse = num;
  hookHouseCard();
  const hc = document.getElementById('houseCard');
  // Search already opens #houseCard — add greet/claim there and skip a second panel.
  if (hc && !hc.hidden) {
    if (state.card) state.card.hidden = true;
    syncHouseCardExtras();
    return;
  }
  openCard(r);
}

function hookHouseFound() {
  if (hookHouseFound._on) return;
  hookHouseFound._on = true;
  const prev = window.onHouseFound;
  window.onHouseFound = (house) => {
    if (typeof prev === 'function') {
      try { prev(house); } catch (e) { /* other add-ons */ }
    }
    onHouseFound(house);
  };
  window.addEventListener('housefound', (e) => onHouseFound(e && e.detail));
  if (window.lastHouseFound) onHouseFound(window.lastHouseFound);
}

function bindTaps() {
  const app = window.MonacoApp;
  const canvas = app && app.renderer && app.renderer.domElement;
  if (!canvas || canvas.__dawlaSocialTap) return;
  canvas.__dawlaSocialTap = true;
  let tap = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dragged: false };
  }, { passive: true });
  canvas.addEventListener('pointermove', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.dragged = true;
  }, { passive: true });
  const end = (e) => {
    const rec = tap;
    if (!rec || e.pointerId !== rec.id) return;
    tap = null;
    if (rec.dragged) return;
    if (performance.now() - rec.t > 450) return;
    if (isRecording()) return;
    const r = pickResidentAt(rec.x, rec.y);
    if (r) openCard(r);
  };
  canvas.addEventListener('pointerup', end, { passive: true });
  canvas.addEventListener('pointercancel', () => { tap = null; }, { passive: true });
}

function pickResidentAt(cx, cy) {
  const app = window.MonacoApp;
  if (!app || !app.camera || !app.renderer) return null;
  const cam = app.camera;
  const rect = app.renderer.domElement.getBoundingClientRect();
  let best = null;
  let bestD = PICK_PX;
  const v = _tmpV;
  for (const r of residents()) {
    const gy = app.groundY ? app.groundY(r.x, r.z) : 0;
    let height = 6;
    const item = tents().find((t) => t.resident && toHouseNum(t.resident.id) === toHouseNum(r.id));
    if (item && item.house && item.house.getHeight) height = item.house.getHeight();
    v.set(r.x, gy + height * 0.45, r.z).project(cam);
    if (v.z < -1 || v.z > 1) continue;
    const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/* ---------------- boot ---------------- */

async function init() {
  const app = await waitForApp();
  if (!app) return;
  state.myHouse = getMyHouse();
  mergeLocalGreets();
  if (isRecording()) {
    window.DawlaSocial = api();
    return;
  }
  buildChrome();
  hookHouseFound();
  bindTaps();

  try {
    const fb = await loadFirebase();
    if (fb) {
      state.firebase = fb;
      state.firebaseOn = true;
      listenRoots();
      if (state.myHouse) await startPresence();
    }
  } catch (e) {
    console.warn('[social] firebase unavailable, local greetings only', e && e.message);
    state.firebaseOn = false;
  }

  // rAF-lite refresh so dots/counters follow moving labels without a render hook.
  let last = 0;
  function tick(now) {
    if (now - last > 180) {
      last = now;
      hookHouseCard();
      hookHouseFound();
      refreshChrome();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  state.ready = true;
  window.DawlaSocial = api();
}

function api() {
  return {
    ready: state.ready,
    recording: isRecording(),
    firebaseOn: state.firebaseOn,
    getMyHouse: () => state.myHouse,
    setMyHouse: (n) => claimHouse(n),
    openHouse: (n) => { const r = findResident(n); if (r) openCard(r); return !!r; },
    closeHouse: closeCard,
    greet: (n) => sendGreet(n == null ? state.openHouse : n),
    playRose: (n) => playRose(n),
    isOnline: (n) => isOnline(n),
    getPresence: () => ({ ...state.presence }),
    getGreets: (n) => (n == null ? { ...state.greets } : greetRecord(n)),
    selected: () => selectedResident(),
  };
}

window.DawlaSocial = api();
if (!RECORD) init();
else {
  // Still expose the API so record-mode tests can assert dots are hidden.
  window.DawlaSocial = Object.assign(api(), { recording: true, ready: true });
}
