// Owner-only "إضافة ساكن" for the static GitHub Pages site.
// The token never leaves the owner's browser except as an Authorization
// header to api.github.com. Visitors never see these controls.
import { nextFreePlots, levelFromPoints } from './plots.js';

export const OWNER_REPO = { owner: 'ergom613', repo: 'dawlat-alaghniya', branch: 'main' };
function repoDir() {
  try {
    const path = (typeof location !== 'undefined' && location.pathname) || '';
    return /\/preview(\/|$)/.test(path) ? 'preview/' : '';
  } catch {
    return '';
  }
}
export const RESIDENTS_PATH = repoDir() + 'data/residents.json';
export const TRACKING_PATH = repoDir() + 'data/tracking_state.json';
const TOKEN_KEY = 'dawlat_alaghniya_owner_token';
const API = 'https://api.github.com';

function $(id) { return document.getElementById(id); }

export function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function normName(s) {
  return String(s || '').trim().replace(/^@/, '').toLowerCase();
}

export function namesEqual(a, b) {
  return normName(a) !== '' && normName(a) === normName(b);
}

export function findDuplicate(list, name) {
  const n = normName(name);
  if (!n) return null;
  return (list || []).find((r) => namesEqual(r.name, n) || namesEqual(r.seed, n) || namesEqual(r.label, n)) || null;
}

export function isProtectedName(name) {
  const n = normName(name);
  return n === 'hnoo_kassar' || n === 'بيت رقم 1' || n === 'house_1';
}

export function nextResidentId(list) {
  let max = 0;
  for (const r of list || []) {
    const id = Number(r.id) || 0;
    if (id > max) max = id;
  }
  return max + 1;
}

export function computeLevel({ points, level }) {
  if (points != null && String(points).trim() !== '') {
    return levelFromPoints(points);
  }
  if (level != null && String(level).trim() !== '') {
    return Math.max(1, Math.min(30, parseInt(level, 10) || 1));
  }
  return 1;
}

export function buildNewResident(list, monacoData, { name, points, level }) {
  const clean = String(name || '').trim().replace(/^@/, '');
  if (!clean) throw new Error('حط الاسم أولاً');
  if (isProtectedName(clean)) throw new Error('هاد الاسم محمي، ما بينضاف من هون');
  const dup = findDuplicate(list, clean);
  if (dup) throw new Error('الاسم موجود مسبقاً: ' + (dup.label || dup.name) + (dup.id ? ' (بيت رقم ' + dup.id + ')' : ''));
  const id = nextResidentId(list);
  const lv = computeLevel({ points, level });
  const pts = (points != null && String(points).trim() !== '') ? Math.max(0, parseInt(points, 10) || 0) : (lv > 1 ? (lv - 1) * 50 : 0);
  const plot = nextFreePlots(monacoData, list, 1)[0];
  if (!plot) throw new Error('ما في أرض فاضية لبيت جديد');
  const rec = {
    id,
    name: clean,
    label: 'بيت رقم ' + id,
    anonymous: false,
    owner: false,
    level: lv,
    seed: clean,
    points: pts,
    x: plot.x,
    z: plot.z,
  };
  return rec;
}

function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function saveToken(tok) {
  const t = String(tok || '').trim();
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode */ }
  return t;
}

async function ghFetch(path, token, opts = {}) {
  const fn = (typeof window !== 'undefined' && window.__ownerFetch) || fetch;
  const res = await fn(API + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  return res;
}

export async function getRepoFile(path, token) {
  const { owner, repo, branch } = OWNER_REPO;
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('ما قدرنا نقرأ الملف من GitHub (' + res.status + '). ' + text.slice(0, 180));
  }
  const body = await res.json();
  const json = JSON.parse(b64ToUtf8(body.content.replace(/\n/g, '')));
  return { sha: body.sha, json, path };
}

export async function putRepoFile(path, token, json, sha, message) {
  const { owner, repo, branch } = OWNER_REPO;
  const content = utf8ToB64(JSON.stringify(json, null, 1) + '\n');
  const res = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha, branch }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('ما قدرنا نحفظ الملف على GitHub (' + res.status + '). ' + text.slice(0, 220));
  }
  return res.json();
}

function styleOnce() {
  if ($('owner-style')) return;
  const st = document.createElement('style');
  st.id = 'owner-style';
  st.textContent = `
    body:not(.owner-mode) .owner-only { display: none !important; }
    #ownerPanel {
      position: absolute; bottom: 150px; right: 12px; left: 12px;
      max-width: 520px; margin-inline-start: auto;
      padding: 12px 14px 14px; z-index: 8;
    }
    #ownerPanel h2 { margin: 0 0 8px; font-size: 16px; color: var(--gold); }
    #ownerPanel label { display: block; font-size: 12px; color: var(--muted); margin: 8px 0 4px; }
    #ownerPanel input[type="text"], #ownerPanel input[type="password"], #ownerPanel input[type="number"] {
      width: 100%; border: 0; background: rgba(255,255,255,0.1); color: var(--text);
      border-radius: 12px; padding: 10px 12px; font-size: 15px; outline: none;
      font-family: inherit;
    }
    #ownerPanel .row2 { display: flex; gap: 10px; }
    #ownerPanel .row2 > div { flex: 1; }
    #ownerPanel .actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    #ownerMsg { font-size: 13px; margin-top: 8px; color: var(--muted); min-height: 1.2em; }
    #ownerMsg.ok { color: #9ee6a0; }
    #ownerMsg.err { color: #ffb4a8; }
    #ownerTokenBox { margin-bottom: 8px; }
    #ownerTokenBox p { margin: 0 0 8px; font-size: 13px; color: var(--text); line-height: 1.45; }
  `;
  document.head.appendChild(st);
}

function setMsg(text, kind) {
  const el = $('ownerMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = kind || '';
}

function ensurePanel() {
  styleOnce();
  if ($('ownerPanel')) return $('ownerPanel');
  const wrap = document.createElement('div');
  wrap.id = 'ownerPanel';
  wrap.className = 'panel';
  wrap.setAttribute('dir', 'rtl');
  wrap.innerHTML = `
    <h2>إضافة ساكن — للمالك فقط</h2>
    <div id="ownerTokenBox">
      <p>حط رمز GitHub مرة واحدة (Fine-grained، بس لمستودع <span dir="ltr">ergom613/dawlat-alaghniya</span>، صلاحية Contents: Read and write). بينحفظ بجهازك بهالمتصفح، وما بينشاف للزوار.</p>
      <label for="ownerToken">رمز GitHub</label>
      <input id="ownerToken" type="password" autocomplete="off" spellcheck="false" />
      <div class="actions">
        <button class="btn" id="ownerSaveToken" type="button">حفظ الرمز</button>
        <button class="btn ghost" id="ownerForgetToken" type="button">نسيان الرمز</button>
      </div>
    </div>
    <form id="ownerAddForm" hidden>
      <label for="ownerName">اسم الشخص</label>
      <input id="ownerName" type="text" autocomplete="off" spellcheck="false" required placeholder="مثلاً: ahmed_92" />
      <div class="row2">
        <div>
          <label for="ownerPoints">نقاط (اختياري)</label>
          <input id="ownerPoints" type="number" min="0" step="1" placeholder="0" />
        </div>
        <div>
          <label for="ownerLevel">لفل (اختياري، الافتراضي 1)</label>
          <input id="ownerLevel" type="number" min="1" max="30" step="1" placeholder="1" />
        </div>
      </div>
      <div class="actions">
        <button class="btn" id="ownerAddBtn" type="submit">إضافة</button>
        <button class="btn ghost" id="ownerClose" type="button">إغلاق</button>
      </div>
    </form>
    <div id="ownerMsg"></div>
  `;
  const hud = $('hud') || document.body;
  hud.appendChild(wrap);
  return wrap;
}

function refreshTokenUi() {
  const has = !!storedToken();
  const box = $('ownerTokenBox');
  const form = $('ownerAddForm');
  if (box) box.hidden = has;
  if (form) form.hidden = !has;
  if (has) setMsg('الرمز محفوظ بهالجهاز. فيك تضيف ساكن هلق.', 'ok');
}

export function isOwnerQuery() {
  const q = new URLSearchParams(location.search);
  return q.get('owner') === '1' || q.get('owner') === 'true';
}

export function openOwnerMode() {
  document.body.classList.add('owner-mode');
  ensurePanel();
  refreshTokenUi();
  const panel = $('ownerPanel');
  if (panel) panel.style.display = '';
}

export function closeOwnerMode() {
  const panel = $('ownerPanel');
  if (panel) panel.style.display = 'none';
  // Keep owner-only tools hidden again unless the URL asked for owner mode.
  if (!isOwnerQuery()) document.body.classList.remove('owner-mode');
}

function bindPanel(api) {
  ensurePanel();
  $('ownerSaveToken').onclick = () => {
    const tok = ($('ownerToken').value || '').trim();
    $('ownerToken').value = '';
    if (!tok) { setMsg('حط الرمز أولاً.', 'err'); return; }
    saveToken(tok);
    refreshTokenUi();
  };
  $('ownerForgetToken').onclick = () => {
    saveToken('');
    refreshTokenUi();
    setMsg('انحذف الرمز من هالجهاز.', 'ok');
  };
  $('ownerClose').onclick = () => closeOwnerMode();
  $('ownerAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addResidentFlow(api).catch((err) => setMsg(err.message || String(err), 'err'));
  });
}

async function addResidentFlow(api) {
  const token = storedToken();
  if (!token) {
    refreshTokenUi();
    setMsg('بدك رمز GitHub أولاً.', 'err');
    return;
  }
  const name = ($('ownerName').value || '').trim();
  const pointsRaw = ($('ownerPoints').value || '').trim();
  const levelRaw = ($('ownerLevel').value || '').trim();
  const btn = $('ownerAddBtn');
  if (btn) btn.disabled = true;
  setMsg('عم نحفظ البيت على الموقع…', '');
  try {
    const file = await getRepoFile(RESIDENTS_PATH, token);
    const list = (file.json && file.json.residents) || [];
    const rec = buildNewResident(list, api.getMonacoData(), {
      name,
      points: pointsRaw === '' ? null : pointsRaw,
      level: levelRaw === '' ? null : levelRaw,
    });
    file.json.residents = list.concat([rec]);
    await putRepoFile(
      RESIDENTS_PATH,
      token,
      file.json,
      file.sha,
      'إضافة ساكن: ' + rec.name + ' (' + rec.label + ')',
    );
    let trackingNote = '';
    try {
      const tr = await getRepoFile(TRACKING_PATH, token);
      if (tr.json && typeof tr.json === 'object') {
        const now = new Date().toISOString();
        tr.json.last_check = now;
        const line = 'Owner add: ' + rec.name + ' house ' + rec.id + ' L' + rec.level + ' (' + rec.points + ' pts).';
        tr.json.last_check_notes = (tr.json.last_check_notes ? String(tr.json.last_check_notes) + ' | ' : '') + line;
        if (Array.isArray(tr.json.seen_followers)) {
          tr.json.seen_followers.push({
            username: rec.name,
            platform: 'owner_add',
            house_id: rec.id,
            source: 'owner_add',
            first_seen: now,
          });
        }
        await putRepoFile(TRACKING_PATH, token, tr.json, tr.sha, 'تتبع: إضافة ' + rec.name + ' بيت رقم ' + rec.id);
      }
    } catch (e) {
      trackingNote = ' البيت انحفظ، بس ملف التتبع ما تحدث: ' + (e.message || e);
    }
    if (api.onAdded) api.onAdded(rec);
    $('ownerName').value = '';
    $('ownerPoints').value = '';
    $('ownerLevel').value = '';
    setMsg('تم! انضاف ' + rec.label + ' باسم ' + rec.name + ' (لفل ' + rec.level + ').' + trackingNote, 'ok');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindLongPress(api) {
  const canvas = (api.getCanvas && api.getCanvas()) || document.getElementById('c');
  if (!canvas) return;
  let timer = 0;
  let sx = 0, sy = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = 0; } };
  canvas.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('owner-mode') && $('ownerPanel') && $('ownerPanel').style.display !== 'none') return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => {
      timer = 0;
      if (api.isHouse1At && api.isHouse1At(sx, sy)) openOwnerMode();
    }, 700);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) cancel();
  });
  canvas.addEventListener('pointerup', cancel);
  canvas.addEventListener('pointercancel', cancel);
}

export function initOwner(api) {
  styleOnce();
  if (isOwnerQuery()) openOwnerMode();
  bindPanel(api);
  bindLongPress(api);
  if (!isOwnerQuery()) {
    const panel = $('ownerPanel');
    if (panel) panel.style.display = 'none';
  }
  return { openOwnerMode, closeOwnerMode, storedToken, TOKEN_KEY };
}
