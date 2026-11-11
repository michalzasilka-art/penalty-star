// Penalty Star: Foxino takes ten penalties. Each one is a gap-fill sentence; three soap bubbles in front of the goal
// carry three words. Tap the right word: Foxino scores. A wrong word: Rob the goalkeeper saves it and the right
// bubble lights up so the right sentence is learnt.
import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { makeFoxino, POSES } from './foxino.js';
import { makeRob, RPOSES, ROB_BODY_Y } from './rob.js';
import { makeStadium } from './stadium.js';
import { makeBall, makeBlob, makeBubble, makeConfetti, makeSparks, BALL_R } from './props.js';
import { sfx, unlock, crowd as crowdSound, setMuted, isMuted } from './sound.js';
import { clamp, lerp, smooth, easeOut, easeIn, easeInOut, backOut, damp } from './mat.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hints = (t) => esc(t).replace(/\(([^)]*)\)/g, '<i>($1)</i>');
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ---------- tuning ----------
const QN = 10;
const SPOT = new THREE.Vector3(0, BALL_R, 11);           // the penalty spot
const FOX_START = new THREE.Vector3(-1.05, 0, 12.75);     // where Foxino waits (a right-footer comes from his left)
const KICK_AT = new THREE.Vector3(-0.11, 0, 11.25);      // where he stands when he strikes the ball
const LOBBY = new THREE.Vector3(0, 0, 11.6);             // where he juggles on the start screen
const KEEPER = new THREE.Vector3(0, 0, 0.32);            // Rob on his line
const COLS = [-2.5, 0, 2.5], ROWS = [0.8, 1.74], BUB_Z = 1.1, BUB_R = 0.68;
const T_WAIT = 0.5, T_RUN = 0.9, T_KICK = 0.62, CONTACT = 0.4, FLIGHT = 0.6;
const TINTS = [0xff6fb5, 0xffcd1c, 0x48d8ff];
const CSS_TINTS = ['#ff8fc4', '#ffd84a', '#6fe2ff'];

// ---------- renderer / scene ----------
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loadText').textContent = 'Sorry, this device cannot show 3D graphics (WebGL).';
  throw e;
}
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());
let pr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
scene.add(camera);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x5a8a45, 1.25));
const key = new THREE.DirectionalLight(0xfff1de, 2.3); key.position.set(9, 22, 26); scene.add(key);
const rimL = new THREE.DirectionalLight(0xffe0b8, 1.3); rimL.position.set(-14, 12, -24); scene.add(rimL);

const stadium = makeStadium(scene);
const fox = makeFoxino(); scene.add(fox.root);
const rob = makeRob(); scene.add(rob.root); rob.root.position.copy(KEEPER);
const ball = makeBall(); scene.add(ball);
const foxBlob = makeBlob(0.9), robBlob = makeBlob(1.25), ballBlob = makeBlob(0.34, 0.5);
scene.add(foxBlob, robBlob, ballBlob);
const bubbles = [0, 1, 2].map((k) => { const b = makeBubble(TINTS[k]); b.mesh.visible = false; scene.add(b.mesh); return b; });
const confetti = makeConfetti(); scene.add(confetti.mesh);
const sparks = makeSparks(); scene.add(sparks.points);

// the glove offsets Rob needs for each kind of save (measured on the rig in the pose)
const REACH = {};
function measureReach() {
  rob.root.position.set(0, 0, 0); rob.dive.position.set(0, 0, 0); rob.dive.rotation.set(0, 0, 0);
  for (const k of ['reach', 'scoop']) {
    rob.apply(RPOSES[k](0), Infinity, 0);
    rob.root.updateMatrixWorld(true);
    REACH[k] = rob.hands(new THREE.Vector3());
  }
  rob.apply(RPOSES.ready(0), Infinity, 0);
  rob.root.position.copy(KEEPER); rob.dive.position.set(0, ROB_BODY_Y, 0);
}
measureReach();

// ---------- state ----------
const S = {
  phase: 'loading', pt: 0, time: 0, timeScale: 1, paused: false, slow: 1,
  questions: [], qi: -1, q: null, goals: 0, results: [], picks: [],
  chosen: -1, isGoal: false, st: 0, sub: '', ev: {}, tRes: 0, nextShown: false,
  cheer: 0.15, shake: 0, closeup: null, debugPose: null,
};
const SHOT = {}; // the current shot's plan

// ---------- questions: the shared Fugio packages (gap-fill sentences "text [right|wrong|wrong] (hint) text") ----------
const PACKS = window.FugioPacks ? FugioPacks.sort(window.GUMMY_PACKAGES || []) : (window.GUMMY_PACKAGES || []);
let packIds = store.get('penalty-packs', []).filter((id) => PACKS.some((p) => p.id === id));
if (!packIds.length && PACKS.length) packIds = [PACKS[0].id];
const packNow = () => (window.FugioPacks ? FugioPacks.merge(PACKS, packIds) : PACKS.find((p) => p.id === packIds[0])) || PACKS[0];
const setKey = () => packIds.slice().sort().join('+');
const SLOT = new Set(['do', 'does', "don't", "doesn't", 'did', "didn't", 'was', 'were', "wasn't", "weren't", 'is', 'are', 'am',
  "isn't", "aren't", 'a', 'an', 'the', 'more', 'most', 'less', 'least', 'because', 'so', 'and', 'but', 'or', 'have', 'has', 'not']);
const slotKey = (t) => t.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean).map((w) => SLOT.has(w) ? w : '_').join(' ');
function mixComparisons(s) {
  const m = s.match(/^(.*)\[([^|\]]+)\|(the [^|\]]+)\]( \([^)]*\)) than [^.?!]*([.?!])$/);
  return m && Math.random() < 0.5 ? `${m[1]}[${m[3]}|${m[2]}]${m[4]} of all${m[5]}` : s;
}
function fillChoices(s) {
  const m = s.match(/\[([^\]]+)\]/);
  const [right, ...wrong] = m[1].split('|');
  const words = [{ text: right, ok: true }, ...shuffle(wrong).slice(0, 2).map((t) => ({ text: t, ok: false }))];
  words.sort((x, y) => slotKey(x.text).localeCompare(slotKey(y.text)) || x.text.localeCompare(y.text));
  words.before = s.slice(0, m.index); words.after = s.slice(m.index + m[0].length); words.right = right;
  return words;
}
const usedQ = new Set();
function pickSentence(pk, r) {
  const mine = (pk.rounds[r] || []).filter((q) => /\[[^\]]+\|[^\]]+\]/.test(q)), rest = pk.rounds.filter((_, i) => i !== r).flat().filter((q) => /\[[^\]]+\|[^\]]+\]/.test(q));
  const free = (l) => l.filter((q) => !usedQ.has(q));
  let pool = free(mine); if (!pool.length) pool = free(rest);
  if (!pool.length) { usedQ.clear(); pool = mine.length ? mine : rest; }
  const q = pick(pool); usedQ.add(q); return mixComparisons(q);
}
function buildQuestions() {
  const pk = packNow(); if (!pk) return [];
  // the package's easy third first, then the middle, then the hardest
  return [0, 0, 0, 1, 1, 1, 1, 2, 2, 2].map((r) => {
    const w = fillChoices(pickSentence(pk, r));
    let rows; do { rows = [0, 1, 2].map(() => (Math.random() < 0.5 ? 0 : 1)); } while (rows.every((v) => v === 0));
    const opts = w.map((o, k) => ({ text: o.text, ok: o.ok, x: COLS[k] + (k === 1 ? (Math.random() - 0.5) * 0.5 : 0), y: ROWS[rows[k]] }));
    return { before: w.before, after: w.after, right: w.right, opts, correct: opts.findIndex((o) => o.ok) };
  });
}

// ---------- UI ----------
const ui = {
  hud: $('hud'), card: $('card'), kick: $('cardKick'), shoot: $('shoot'), sentence: $('sentence'), note: $('note'), next: $('nextBtn'),
  banner: $('banner'), flash: $('flash'), start: $('start'), end: $('end'), loading: $('loading'), labels: $('labels'),
};
const ICON = {
  goal: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.4" fill="#fff" stroke="#1d1640" stroke-width="1.4"/><path d="M10 6.3l3 2.2-1.1 3.5H8.1L7 8.5z" fill="#1d1640"/><path d="M10 1.8v4.5M13 8.5l4.2-1.5M11.9 12l2.6 3.7M8.1 12l-2.6 3.7M7 8.5L2.8 7" stroke="#1d1640" stroke-width="1.1" fill="none"/></svg>',
  save: '<svg viewBox="0 0 20 20"><path d="M5.6 11.4V6.6a1.25 1.25 0 0 1 2.5 0v3.2V4.9a1.25 1.25 0 0 1 2.5 0v4.6V5.6a1.25 1.25 0 0 1 2.5 0v5.3l1-1.6a1.25 1.25 0 0 1 2.2 1.2l-2.3 4.4a4.3 4.3 0 0 1-3.8 2.4H9.9a4.3 4.3 0 0 1-4.3-4.3z" fill="#ff7a12" stroke="#8a2f08" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.8 14.2h7.4" stroke="#b9f53c" stroke-width="1.6"/></svg>',
};
function renderShoot(el, results, now = -1) {
  el.innerHTML = '';
  for (let i = 0; i < QN; i++) {
    const s = document.createElement('i');
    const r = results[i];
    s.className = 'slot' + (r ? ' ' + r : '') + (i === now ? ' now' : '');
    if (r) s.innerHTML = ICON[r];
    el.appendChild(s);
  }
}
const labelEls = [0, 1, 2].map((k) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'blabel'; b.style.opacity = '0';
  b.style.setProperty('--c', CSS_TINTS[k]);
  b.innerHTML = '<span></span>';
  b.addEventListener('click', (e) => { e.preventDefault(); unlock(); choose(k); });
  ui.labels.appendChild(b);
  return b;
});
const LV_COL = { A0: '#7fe0a0', A1: '#8cc8ff', A2: '#c9a3ff' };
function renderPack() {
  const sum = window.FugioPacks ? FugioPacks.summary(PACKS, packIds) : { title: 'Questions', sub: '', level: '–' };
  const html = `<span class="lv" style="--c:${LV_COL[sum.level] || '#ffcd1c'}">${esc(sum.level)}</span>
    <span class="t"><small>ENGLISH QUESTIONS</small><b>${esc(sum.title)}</b><em>${esc(sum.sub)}</em></span><span class="go">CHANGE</span>`;
  $('packBtn').innerHTML = html; $('packBtn2').innerHTML = html;
  const best = store.get('penalty-best', {})[setKey()];
  const bl = $('bestLine');
  bl.classList.toggle('hidden', !best);
  if (best) bl.innerHTML = `Your best: <b>${best.goals} / ${QN}</b> ${'★'.repeat(best.stars)}`;
}
async function openPicker() {
  if (!window.FugioPacks) return;
  unlock(); sfx.click();
  const ids = await FugioPacks.open(PACKS, packIds, { theme: 'gummy', kicker: 'CHOOSE THE QUESTIONS' });
  if (ids && ids.length) { packIds = ids; store.set('penalty-packs', ids); usedQ.clear(); renderPack(); if (S.phase === 'end') renderEndBest(); }
}
$('packBtn').onclick = openPicker;
$('packBtn2').onclick = openPicker;
$('leaveBtn').onclick = () => {
  sfx.click();
  if (window.parent !== window) window.parent.postMessage({ fugio: 'leave' }, '*'); else location.href = '/';
};
const muteBtn = $('muteBtn');
muteBtn.classList.toggle('muted', isMuted());
muteBtn.onclick = () => { unlock(); setMuted(!isMuted()); muteBtn.classList.toggle('muted', isMuted()); if (!isMuted()) sfx.click(); };
$('playBtn').onclick = () => { unlock(); sfx.click(); startGame(); };
$('againBtn').onclick = () => { unlock(); sfx.click(); startGame(); };
ui.next.onclick = () => { unlock(); sfx.click(); advance(); };

function showBanner(text, cls) {
  ui.banner.innerHTML = `<span class="word ${cls}">${text}</span>`;
}
function flash(cb, hold = 120) {
  ui.flash.classList.add('on');
  setTimeout(() => { cb(); setTimeout(() => ui.flash.classList.remove('on'), hold); }, 230);
}

function setCard(q) {
  ui.kick.textContent = `PENALTY ${S.qi + 1} / ${QN}`;
  ui.sentence.innerHTML = `${hints(q.before)}<span class="gap">&nbsp;</span>${hints(q.after)}`;
  ui.note.className = ''; ui.note.innerHTML = S.qi < 2 ? 'Tap the bubble with the right word!' : '&nbsp;';
  ui.next.classList.add('hidden');
  renderShoot(ui.shoot, S.results, S.qi);
}
function revealCard(goal) {
  const q = S.q;
  ui.sentence.innerHTML = `${hints(q.before)}<span class="gap ok">${esc(q.right)}</span>${hints(q.after)}`;
  if (goal) { ui.note.className = 'good'; ui.note.innerHTML = pick(['Great!', 'Brilliant!', 'Super!', 'Well done!', 'Yes!']) + ' ✓'; }
  else { ui.note.className = 'bad'; ui.note.innerHTML = `Not <s>${esc(q.opts[S.chosen].text)}</s> · the right word is <b>${esc(q.right)}</b>`; }
  renderShoot(ui.shoot, S.results, -1);
  const el = ui.shoot.children[S.qi]; if (el) el.classList.add('pop');
}

// ---------- camera ----------
// The play camera sits behind Foxino; its field of view and a view offset are fitted so the goal, the bubbles and
// (when there is room) Foxino all fit in the screen below the question card.
const CAM = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, fx: 0.5, fy: 0.5 };
const TGT = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, fx: 0.5, fy: 0.5 };
const FIT = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, fx: 0.5, fy: 0.5 };
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const REQ = [], SOFT = [];
for (const x of [-3.86, 3.86]) for (const y of [0, 2.56]) REQ.push(new THREE.Vector3(x, y, 0));
for (const x of [-3.2, 3.2]) for (const y of [0.1, 2.44]) REQ.push(new THREE.Vector3(x, y, BUB_Z));
REQ.push(new THREE.Vector3(0.3, 0, 10.7), new THREE.Vector3(-0.3, 0.25, 11.2));
for (const c of [FOX_START, KICK_AT]) for (const dx of [-0.38, 0.38]) for (const y of [0, 1.5]) SOFT.push(new THREE.Vector3(c.x + dx, y, c.z));
let safe = { l: 0.02, r: 0.98, t: 0.2, b: 0.98 };
function measureSafe() {
  const W = innerWidth, H = innerHeight;
  const cr = ui.card.getBoundingClientRect();
  const top = (ui.hud.classList.contains('hidden') ? 70 : cr.bottom + 6) / H;
  safe = { l: 10 / W, r: 1 - 10 / W, t: clamp(top, 0.05, 0.5), b: 1 - 8 / H };
}
function playCamPos(a, outPos, outLook) {
  const k = smooth((a - 0.75) / 0.85);
  outPos.set(lerp(-0.6, 1.5, k), lerp(2.6, 2.2, k), lerp(17.6, 19.6, k));
  outLook.set(lerp(0, -0.4, k), lerp(0.95, 1.0, k), lerp(3, 4.5, k));
}
function fitPlay() {
  const a = innerWidth / innerHeight;
  playCamPos(a, FIT.pos, FIT.look);
  const f = _v.subVectors(FIT.look, FIT.pos).normalize();
  const r = _v2.crossVectors(f, UP).normalize();
  const u = _v3.crossVectors(r, f);
  const proj = (pts) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) {
      const dx = p.x - FIT.pos.x, dy = p.y - FIT.pos.y, dz = p.z - FIT.pos.z;
      const z = dx * f.x + dy * f.y + dz * f.z;
      const tx = (dx * r.x + dy * r.y + dz * r.z) / z, ty = (dx * u.x + dy * u.y + dz * u.z) / z;
      x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty);
    }
    return { x0, x1, y0, y1 };
  };
  const wf = safe.r - safe.l, hf = safe.b - safe.t;
  const need = (b) => Math.max((b.y1 - b.y0) / (2 * hf), (b.x1 - b.x0) / (2 * a * wf)) * 1.05;
  const bR = proj(REQ), bA = proj([...REQ, ...SOFT]);
  const tR = need(bR), tA = need(bA);
  let T = Math.min(tA, tR * (a > 1.3 ? 1.45 : 1.7)), b = T >= tA * 0.999 ? bA : bR;
  T = clamp(T, Math.tan(THREE.MathUtils.degToRad(6)), Math.tan(THREE.MathUtils.degToRad(42)));
  FIT.fov = THREE.MathUtils.radToDeg(2 * Math.atan(T));
  const sx = (safe.l + safe.r) / 2, sy = (safe.t + safe.b) / 2;
  FIT.fx = sx - ((b.x0 + b.x1) / 2) / (2 * T * a);
  if (b === bA) FIT.fy = sy + ((b.y0 + b.y1) / 2) / (2 * T);
  else FIT.fy = safe.t + 0.02 + b.y1 / (2 * T); // no room for all of Foxino: keep the goal under the card
  FIT.T = T;
}
function rigPlay(out) {
  out.pos.copy(FIT.pos); out.look.copy(FIT.look); out.fov = FIT.fov; out.fx = FIT.fx; out.fy = FIT.fy;
  // a small push toward the goal while the ball flies
  const push = S.phase === 'shot' ? smooth((S.st - (SHOT.tContact || 99) + 0.1) / 0.6) * (S.sub === 'goal' || S.sub === 'save' ? 1 : 1) : 0;
  if (push > 0) { out.pos.z -= 1.2 * push; out.pos.y += 0.1 * push; out.fov *= 1 - 0.04 * push; }
}
function rigMenu(out) {
  const a = innerWidth / innerHeight;
  const th = 0.42 + 0.22 * Math.sin(S.time * 0.25);
  const d = a < 0.8 ? 4.6 : 3.6;
  out.pos.set(LOBBY.x + Math.sin(th) * d, 0.95, LOBBY.z + Math.cos(th) * d);
  out.look.set(LOBBY.x, 0.82, LOBBY.z);
  out.fov = a < 0.8 ? 44 : a < 1.25 ? 40 : 38;
  out.fx = a < 1.25 ? 0.5 : 0.3; out.fy = a < 0.8 ? 0.5 : a < 1.25 ? 0.46 : 0.52;
}
function rigEnd(out) {
  const a = innerWidth / innerHeight;
  const th = -0.35 + 0.15 * Math.sin(S.time * 0.3);
  const d = a < 0.8 ? 4.4 : 3.6;
  out.pos.set(LOBBY.x + Math.sin(th) * d, 1.0, LOBBY.z + Math.cos(th) * d);
  out.look.set(LOBBY.x, 0.8, LOBBY.z);
  out.fov = a < 0.8 ? 50 : 40;
  out.fx = a < 1.25 ? 0.5 : 0.27; out.fy = a < 0.8 ? 0.21 : 0.5;
}
function rigClose(out) {
  const c = S.closeup;
  const obj = c.who === 'rob' ? rob.root : fox.root;
  obj.updateMatrixWorld(true);
  const h = c.who === 'rob' ? 0.95 : 0.78;
  const base = obj.getWorldPosition(_v);
  const yaw = (c.yaw || 0) + (c.who === 'rob' ? 0 : obj.rotation.y);
  const d = c.dist || (c.who === 'rob' ? 2.6 : 2.2);
  out.pos.set(base.x + Math.sin(yaw) * d, base.y + h + (c.up || 0.15), base.z + Math.cos(yaw) * d);
  out.look.set(base.x, base.y + h + (c.lookUp || 0), base.z);
  out.fov = c.fov || 38; out.fx = 0.5; out.fy = 0.5;
}
function rigFor(out) {
  if (S.closeup) return rigClose(out);
  if (S.phase === 'menu' || S.phase === 'loading') return rigMenu(out);
  if (S.phase === 'end') return rigEnd(out);
  return rigPlay(out);
}
let camSnap = true;
function updateCamera(dt) {
  rigFor(TGT);
  const k = camSnap ? 1 : 1 - Math.exp(-4 * dt);
  camSnap = false;
  CAM.pos.lerp(TGT.pos, k); CAM.look.lerp(TGT.look, k);
  CAM.fov = lerp(CAM.fov, TGT.fov, k); CAM.fx = lerp(CAM.fx, TGT.fx, k); CAM.fy = lerp(CAM.fy, TGT.fy, k);
  camera.position.copy(CAM.pos);
  if (S.shake > 0.001) camera.position.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(S.shake * 0.12));
  camera.up.set(0, 1, 0);
  camera.lookAt(CAM.look);
  if (Math.abs(camera.fov - CAM.fov) > 0.001) { camera.fov = CAM.fov; camera.updateProjectionMatrix(); }
  const w = innerWidth, h = innerHeight;
  const ox = (0.5 - CAM.fx) * w, oy = (0.5 - CAM.fy) * h;
  if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) camera.setViewOffset(w, h, ox, oy, w, h);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateMatrixWorld();
  stadium.sky.position.copy(camera.position);
  // the GOAL! / SAVED! banner sits just above the crossbar
  // (or, when there is no room above it, just below the goal line, so it never hides the ball going in)
  const bh = ui.banner.offsetHeight || 80;
  const barY = (1 - _v.set(0, 2.55, 0).project(camera).y) / 2 * h, lineY = (1 - _v.set(0, 0, 0.5).project(camera).y) / 2 * h;
  const above = barY - bh * 0.62, top = safe.t * h + bh * 0.5;
  ui.banner.style.top = (above >= top ? above : Math.min(lineY + bh * 0.62, h - bh * 0.6)).toFixed(0) + 'px';
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  measureSafe(); fitPlay();
  sparks.uniforms.uScale.value = 300 * pr * (h / 800);
}
addEventListener('resize', () => { resize(); camSnap = true; });

// ---------- input ----------
const raycaster = new THREE.Raycaster();
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (S.phase !== 'aim') return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(bubbles.map((b) => b.mesh).filter((m) => m.visible), false);
  if (hits.length) choose(bubbles.findIndex((b) => b.mesh === hits[0].object));
});
addEventListener('keydown', (e) => {
  if (document.querySelector('.fpk-ov')) return;
  const k = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 1, ArrowRight: 2 }[e.code];
  if (k != null && S.phase === 'aim') { unlock(); choose(k); e.preventDefault(); return; }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (S.phase === 'shot' && S.nextShown) { advance(); e.preventDefault(); }
    else if (S.phase === 'menu' && !ui.start.classList.contains('hidden')) { unlock(); startGame(); e.preventDefault(); }
  }
});

// ---------- the game flow ----------
function setPhase(p) { S.phase = p; S.pt = 0; }

function startGame() {
  if (S.phase === 'loading') return;
  const qs = buildQuestions();
  if (!qs.length) return;
  flash(() => {
    S.questions = qs; S.qi = -1; S.q = null; S.goals = 0; S.results = []; S.picks = [];
    ui.start.classList.add('hidden'); ui.end.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    $('playBtn').classList.remove('pulse');
    sfx.whistle();
    nextQuestion();
  });
}

function resetRound() {
  confetti.clear();
  S.st = 0; S.sub = ''; S.ev = {}; S.chosen = -1; S.nextShown = false; S.slow = 1; S.tRes = 0; S.sadYaw = null;
  fox.cel = null;
  fox.root.position.copy(FOX_START);
  fox.root.rotation.y = Math.atan2(SPOT.x - FOX_START.x, SPOT.z - FOX_START.z);
  fox.face('happy'); fox.apply(POSES.ready(0), Infinity, 0);
  ball.position.copy(SPOT); ball.rotation.set(0, 0, 0); ball.visible = true;
  rob.root.position.copy(KEEPER); rob.root.rotation.set(0, 0, 0);
  rob.dive.position.set(0, ROB_BODY_Y, 0); rob.dive.rotation.set(0, 0, 0);
  rob.face('happy'); rob.apply(RPOSES.ready(0), Infinity, 0);
}

function nextQuestion() {
  S.qi++;
  if (S.qi >= QN) { finish(); return; }
  S.q = S.questions[S.qi];
  resetRound();
  setPhase('aim');
  setCard(S.q);
  measureSafe(); fitPlay(); camSnap = true;
  S.q.opts.forEach((o, k) => {
    const b = bubbles[k];
    b.mesh.visible = true; b.mesh.scale.setScalar(0.001);
    Object.assign(b, { state: 'in', t: -0.25 - k * 0.12, x: o.x, y: o.y, alpha: 1, glow: 0, hot: 0 });
    b.u.uGlow.value = 0; b.u.uAlpha.value = 1; b.u.uHot.value = 0;
    labelEls[k].firstChild.textContent = o.text;
    labelEls[k].className = 'blabel';
    labelEls[k].dataset.word = o.text;
  });
  setTimeout(() => { if (S.phase === 'aim') sfx.bubble(); }, 250);
}

// the player picked bubble k
function choose(k) {
  if (S.phase !== 'aim' || k < 0 || k > 2) return;
  const q = S.q;
  S.chosen = k; S.isGoal = !!q.opts[k].ok;
  S.picks[S.qi] = q.opts[k].text;
  setPhase('shot'); S.st = 0; S.sub = 'wait'; S.ev = {};
  labelEls[k].classList.add('picked');
  bubbles[k].hot = 1;
  sfx.pick();
  sfx.whistle(false, 0.12);
  planShot();
}

// work out the ball's flight and Rob's dive before the run-up starts
function planShot() {
  const q = S.q, o = q.opts[S.chosen];
  const B = new THREE.Vector3(o.x, o.y, BUB_Z);
  const P0 = SPOT.clone();
  const mid = P0.clone().lerp(B, 0.5);
  const side = Math.abs(B.x) > 0.5 ? Math.sign(B.x) : (Math.random() < 0.5 ? -1 : 1);
  const P1 = new THREE.Vector3(mid.x - side * (0.55 + Math.random() * 0.35), Math.max(P0.y, B.y) + 0.35 + 0.2 * Math.random(), mid.z);
  SHOT.P0 = P0; SHOT.P1 = P1; SHOT.B = B;
  SHOT.tRun = T_WAIT; SHOT.tKick = T_WAIT + T_RUN; SHOT.tContact = SHOT.tKick + CONTACT * T_KICK; SHOT.tArrive = SHOT.tContact + FLIGHT;
  // the direction and speed at the bubble
  const d = new THREE.Vector3().subVectors(B, P1).multiplyScalar(2 / FLIGHT);
  SHOT.vel = d.clone(); SHOT.speed = d.length(); SHOT.dir = d.clone().normalize();
  const catchZ = KEEPER.z + REACH.reach.z;
  // where Rob's gloves meet the ball (a save), or where he dives instead (a goal)
  if (!S.isGoal) {
    const tt = (B.z - catchZ) / -SHOT.dir.z;
    SHOT.C = B.clone().addScaledVector(SHOT.dir, Math.max(0, tt));
    SHOT.tCatch = SHOT.tArrive + Math.max(0, tt) / SHOT.speed;
    SHOT.dive = solveDive(SHOT.C);
  } else {
    const away = Math.abs(B.x) > 0.5 ? -Math.sign(B.x) : side;
    const W = new THREE.Vector3(away * (1.9 + Math.random() * 0.4), 0.7 + Math.random() * 0.9, KEEPER.z + REACH.reach.z);
    SHOT.C = null; SHOT.tCatch = SHOT.tArrive + 0.05;
    SHOT.dive = solveDive(W);
  }
  SHOT.dive.t0 = SHOT.tContact + 0.06;
  SHOT.dive.t1 = SHOT.tCatch;
}
function bez(t, out) {
  const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
  return out.set(a * SHOT.P0.x + b * SHOT.P1.x + c * SHOT.B.x, a * SHOT.P0.y + b * SHOT.P1.y + c * SHOT.B.y, a * SHOT.P0.z + b * SHOT.P1.z + c * SHOT.B.z);
}

// Rob's dive toward a world point: where his body's pivot has to be (and how far he rolls) so his gloves are there
function solveDive(T) {
  const L = T.clone().sub(KEEPER);
  if (Math.abs(L.x) < 0.75) {
    if (L.y > 1.0) { const g = REACH.reach; return { kind: 'up', roll: 0, pivot: new THREE.Vector3(L.x - g.x, Math.max(ROB_BODY_Y, L.y - g.y), L.z - g.z), pose: 'reach' }; }
    const g = REACH.scoop; return { kind: 'low', roll: 0, pivot: new THREE.Vector3(L.x - g.x, clamp(L.y - g.y, 0.42, ROB_BODY_Y), L.z - g.z), pose: 'scoop' };
  }
  const g = REACH.reach;
  const th = Math.atan2(L.x, L.y - ROB_BODY_Y * 0.7);
  const roll = -clamp(th, -1.75, 1.75);
  const c = Math.cos(roll), s = Math.sin(roll);
  const gx = c * g.x - s * g.y, gy = s * g.x + c * g.y;
  return { kind: 'side', roll, pivot: new THREE.Vector3(L.x - gx, Math.max(0.42, L.y - gy), L.z - g.z), pose: 'reach' };
}

function updateShot(dt) {
  S.st += dt;
  const t = S.st, E = S.ev;
  if (!E.pop) S.sub = t < SHOT.tRun ? 'wait' : t < SHOT.tKick ? 'run' : t < SHOT.tContact ? 'kick' : 'flight';
  if (t >= SHOT.tRun && !E.run) { E.run = 1; S.cheer = Math.max(S.cheer, 0.35); }
  if (t >= SHOT.tContact && !E.kick) { E.kick = 1; sfx.kick(); S.shake = 0.5; rob.face('focus'); }
  if (t >= SHOT.tArrive && !E.pop) {
    // the ball reaches the bubble: pop!
    E.pop = 1;
    ball.position.copy(SHOT.B);
    const k = S.chosen, b = bubbles[k];
    b.state = 'pop'; b.t = 0;
    labelEls[k].style.opacity = '0';
    sparks.emit(_v.set(b.x, b.y, BUB_Z), S.isGoal ? ['#ffffff', '#ffe066', '#6fe2ff', '#ff8fc4', '#7dffb0'] : ['#ffffff', '#c9d2e8', '#9aa6c0'], 70, 3.2, BUB_R);
    sfx.pop(S.isGoal);
    S.sub = S.isGoal ? 'toGoal' : 'toSave';
    BALLV.copy(SHOT.vel);
  }
  // the slow motion while the ball flies at the bubble
  const sm = t > SHOT.tContact + 0.18 && t < SHOT.tArrive + 0.12 ? 0.45 : 1;
  S.slow = damp(S.slow, sm, 10, dt / Math.max(S.slow, 0.2));
  if (S.sub === 'toGoal' && (ball.position.z < -0.15 || t > SHOT.tArrive + 0.5) && !E.goal) { E.goal = 1; onGoal(); }
  if (S.sub === 'toSave' && t >= SHOT.tCatch && !E.save) { E.save = 1; onSave(); }
  // the result: then NEXT
  if (S.tRes && !S.nextShown && S.time - S.tRes > (S.isGoal ? 1.5 : 1.8)) {
    S.nextShown = true;
    ui.next.innerHTML = (S.qi + 1 >= QN ? 'RESULTS' : 'NEXT') + ' <span aria-hidden="true">&#9654;</span>';
    ui.next.classList.remove('hidden');
  }
  if (S.tRes && S.time - S.tRes > (S.isGoal ? 4.8 : 9)) advance();
}

function onGoal() {
  S.sub = 'goal'; S.tRes = S.time; S.goals++;
  S.results[S.qi] = 'goal';
  showBanner('GOAL!', 'goal');
  sfx.cheer(); S.cheer = 1; S.shake = 0.9;
  confetti.burst(_v.set(0, 0, 3), 10, 4.5);
  revealCard(true);
  // the other bubbles drift away
  bubbles.forEach((b, k) => { if (k !== S.chosen) { b.state = 'fade'; b.t = 0; } });
  labelEls.forEach((l, k) => { if (k !== S.chosen) l.classList.add('wrong'); });
  fox.face('happy'); rob.face('oops');
}
function onSave() {
  S.sub = 'save'; S.tRes = S.time;
  S.results[S.qi] = 'save';
  showBanner('SAVED!', 'saved');
  sfx.save(); setTimeout(() => sfx.aww(), 250);
  S.cheer = 0; S.shake = 0.6;
  revealCard(false);
  const r = S.q.correct;
  bubbles[r].state = 'reveal'; bubbles[r].t = 0;
  labelEls[r].classList.add('right');
  bubbles.forEach((b, k) => { if (k !== r && k !== S.chosen) { b.state = 'fade'; b.t = 0; } });
  labelEls.forEach((l, k) => { if (k !== r) l.classList.add('wrong'); });
  fox.face('sad'); rob.face('happy');
  sparks.emit(rob.hands(_v), ['#ffffff', '#ffd27a', '#ff8a1c'], 26, 2, 0.12);
}

function advance() {
  if (S.phase !== 'shot' || !S.tRes) return;
  S.tRes = 0; S.nextShown = false;
  ui.next.classList.add('hidden');
  flash(() => {
    bubbles.forEach((b) => { b.mesh.visible = false; });
    labelEls.forEach((l) => { l.style.opacity = '0'; });
    nextQuestion();
  });
}

function finish() {
  setPhase('end');
  S.q = null;
  ui.hud.classList.add('hidden');
  bubbles.forEach((b) => { b.mesh.visible = false; });
  labelEls.forEach((l) => { l.style.opacity = '0'; });
  resetRound();
  fox.root.position.copy(LOBBY); fox.root.rotation.y = 0;
  ball.position.set(LOBBY.x + 0.42, BALL_R, LOBBY.z + 0.25);
  camSnap = true;
  sfx.whistle(false, 0.0); sfx.whistle(false, 0.45); sfx.whistle(true, 0.9);
  const stars = S.goals >= 9 ? 3 : S.goals >= 6 ? 2 : 1;
  S.endStars = stars;
  $('endTitle').textContent = stars === 3 ? 'Penalty Star!' : stars === 2 ? 'Great shooting!' : 'Good try!';
  $('endGoals').textContent = S.goals;
  renderShoot($('endShoot'), S.results);
  const starEls = [...document.querySelectorAll('#stars i')];
  starEls.forEach((el) => el.classList.remove('on'));
  starEls.forEach((el, i) => { if (i < stars) setTimeout(() => { el.classList.add('on'); sfx.star(i); }, 700 + i * 320); });
  // the sentences to learn (the saved penalties), with the right word
  const list = $('missedList'); list.innerHTML = '';
  S.questions.forEach((q, i) => {
    if (S.results[i] !== 'save') return;
    const li = document.createElement('li');
    li.innerHTML = `${hints(q.before)}<b>${esc(q.right)}</b>${hints(q.after)}`;
    list.appendChild(li);
  });
  $('missed').classList.toggle('hidden', !list.children.length);
  const all = store.get('penalty-best', {}), k = setKey(), prev = all[k];
  S.newBest = !prev || S.goals > prev.goals;
  if (S.newBest) { all[k] = { goals: S.goals, stars }; store.set('penalty-best', all); }
  renderEndBest();
  renderPack();
  ui.end.classList.remove('hidden');
  ui.end.scrollTop = 0;
  $('againBtn').classList.add('pulse');
  if (stars >= 2) { S.cheer = 1; sfx.cheer(); confetti.burst(_v.set(LOBBY.x, 0, LOBBY.z - 1), 5, 4); }
  fox.face('happy');
}
function renderEndBest() {
  const best = store.get('penalty-best', {})[setKey()];
  $('endBest').innerHTML = S.newBest && S.phase === 'end' && best && best.goals === S.goals ? `<b>NEW BEST</b> for these questions!` : best ? `Your best for these questions: <b>${best.goals} / ${QN}</b>` : '';
}

// ---------- animation: Foxino ----------
const BALLV = new THREE.Vector3();
const _q = new THREE.Quaternion(), _axis = new THREE.Vector3();
function faceYaw(fromX, fromZ, toX, toZ) { return Math.atan2(toX - fromX, toZ - fromZ); }
function angLerp(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
function angDamp(a, b, k, dt) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * (1 - Math.exp(-k * dt)); }

function animateFox(dt) {
  const p = S.phase, t = S.time;
  if (S.debugPose) { fox.apply(POSES[S.debugPose.name](S.debugPose.u ?? t, S.debugPose.side ?? 1, t), Infinity, dt); fox.update(dt, t); return; }
  if (p === 'menu' || p === 'loading') {
    fox.root.position.copy(LOBBY); fox.root.rotation.y = 0;
    const J = 0.66, n = Math.floor(S.time / J), u = (S.time / J) % 1, next = n % 2 ? 1 : -1;
    fox.apply(POSES.juggle(u, next, t), 14, dt);
    fox.tailAmp = 1;
  } else if (p === 'aim') {
    fox.apply(POSES.ready(t), 8, dt);
  } else if (p === 'shot') {
    const st = S.st;
    if (st < SHOT.tRun) {
      fox.apply(POSES.ready(t), 8, dt);
    } else if (st < SHOT.tKick) {
      const u = (st - SHOT.tRun) / T_RUN;
      const e = u * u * (1.6 - 0.6 * u); // accelerate from a standstill
      const x = lerp(FOX_START.x, KICK_AT.x, e) - Math.sin(Math.PI * e) * 0.25, z = lerp(FOX_START.z, KICK_AT.z, e);
      const px = fox.root.position.x, pz = fox.root.position.z;
      fox.root.position.set(x, 0, z);
      const yaw = Math.abs(x - px) + Math.abs(z - pz) > 1e-4 ? faceYaw(px, pz, x, z) : fox.root.rotation.y;
      fox.root.rotation.y = angDamp(fox.root.rotation.y, angLerp(yaw, faceYaw(KICK_AT.x, KICK_AT.z, SHOT.B.x * 0.3, 0), smooth((u - 0.6) / 0.4)), 10, dt);
      const ph = e * Math.PI * 4.2;
      fox.apply(POSES.run(ph, 1), 16, dt);
      const step = Math.floor(ph / Math.PI);
      if (step !== S.ev.step) { S.ev.step = step; sfx.step(); }
    } else {
      const u = (st - SHOT.tKick) / T_KICK;
      if (!S.tRes || st < SHOT.tKick + T_KICK) {
        const fwd = smooth((u - 0.45) / 0.5) * 0.28;
        const yaw = faceYaw(KICK_AT.x, KICK_AT.z, SHOT.B.x * 0.3, 0);
        fox.root.rotation.y = angDamp(fox.root.rotation.y, yaw, 12, dt);
        fox.root.position.set(KICK_AT.x + Math.sin(yaw) * fwd, 0, KICK_AT.z + Math.cos(yaw) * fwd);
        fox.apply(POSES.kick(Math.min(u, 1)), u < 0.08 ? 18 : 40, dt);
      } else if (S.isGoal) celebrateFox(dt);
      else sadFox(dt);
    }
  } else if (p === 'end') {
    fox.root.position.copy(LOBBY); fox.root.rotation.y = angDamp(fox.root.rotation.y, 0, 6, dt);
    if (S.endStars >= 2) fox.apply(S.pt < 3.5 ? POSES.celebrate(S.pt) : POSES.wave(t), 10, dt);
    else fox.apply(S.pt < 2.2 ? POSES.stand(t) : POSES.wave(t), 6, dt);
  }
  fox.update(dt, t);
}
// after a goal: turn to the camera, run, knee slide, then jump about
function celebrateFox(dt) {
  const t = S.time - S.tRes;
  const start = fox.cel || (fox.cel = { x: fox.root.position.x, z: fox.root.position.z });
  const cx = camera.position.x, cz = camera.position.z;
  const dx = cx - start.x, dz = cz - start.z, L = Math.hypot(dx, dz) || 1;
  const yaw = Math.atan2(dx, dz);
  const runD = 1.0, slideD = 1.3;
  // how far he can come toward the camera and still be fully on screen (worked out once)
  if (start.maxD == null) {
    start.maxD = 0;
    for (let d = runD + slideD; d >= 0; d -= 0.1) {
      const x = start.x + dx / L * d, z = start.z + dz / L * d;
      const feet = _v.set(x, 0, z).project(camera), head = _v2.set(x, 1.45, z).project(camera);
      if (feet.y > -0.94 && head.y < 0.9 && Math.abs(feet.x) < 0.9 && L - d > 3.2) { start.maxD = d; break; }
    }
  }
  let dist;
  if (t < 0.3) { fox.root.rotation.y = angDamp(fox.root.rotation.y, yaw, 9, dt); fox.apply(POSES.stand(S.time), 10, dt); dist = 0; }
  else if (t < 0.85) { const u = (t - 0.3) / 0.55; dist = runD * u; fox.root.rotation.y = angDamp(fox.root.rotation.y, yaw, 12, dt); fox.apply(POSES.run(u * Math.PI * 2.5, 1), 16, dt); }
  else if (t < 1.85) { const u = (t - 0.85) / 1.0; dist = runD + slideD * easeOut(u); fox.root.rotation.y = yaw; fox.apply(POSES.slide(u, S.time), 14, dt); }
  else { dist = runD + slideD; fox.apply(t < 2.15 ? POSES.stand(S.time) : POSES.celebrate(t - 2.15), 9, dt); }
  dist = Math.min(dist, start.maxD);
  fox.root.position.set(start.x + dx / L * dist, 0, start.z + dz / L * dist);
}
function sadFox(dt) {
  const t = S.time - S.tRes;
  fox.apply(POSES.sad(t), 7, dt);
  if (t > 1.5) {
    const yaw = Math.atan2(camera.position.x - fox.root.position.x, camera.position.z - fox.root.position.z);
    fox.root.rotation.y = angDamp(fox.root.rotation.y, angLerp(S.sadYaw ?? (S.sadYaw = fox.root.rotation.y), yaw, 0.55), 2, dt);
  }
}

// ---------- animation: Rob ----------
function animateRob(dt) {
  const t = S.time, p = S.phase;
  if (p === 'menu' || p === 'loading' || p === 'end' || p === 'aim' || (p === 'shot' && S.st < SHOT.dive.t0)) {
    const sway = Math.sin(t * 1.3) * 0.35;
    const pose = p === 'menu' && Math.sin(t * 0.4) > 0.6 ? RPOSES.wave(t) : RPOSES.ready(t);
    rob.apply(pose, 6, dt);
    rob.dive.position.set(p === 'aim' || p === 'shot' ? sway : sway * 0.5, ROB_BODY_Y - 0.04 + 0.02 * Math.abs(Math.sin(t * 2.6)), 0);
    rob.dive.rotation.set(0, 0, 0);
    rob.root.rotation.y = 0;
    if (p !== 'shot') rob.face(p === 'aim' ? 'focus' : 'happy');
  } else if (p === 'shot') {
    const D = SHOT.dive, st = S.st;
    const start = D.startPos || (D.startPos = rob.dive.position.clone());
    if (st < D.t1) {
      const e = clamp((st - D.t0) / (D.t1 - D.t0), 0, 1);
      const m = easeOut(e);
      rob.dive.position.set(lerp(start.x, D.pivot.x, m), lerp(start.y, D.pivot.y, m) + (D.kind === 'side' ? Math.sin(Math.PI * e) * 0.22 : 0), lerp(start.z, D.pivot.z, m));
      rob.dive.rotation.z = D.roll * smooth(e * 1.3);
      rob.apply(RPOSES[D.pose](t), 11 + 20 * e, dt);
    } else {
      const a = st - D.t1;
      const lieY = D.kind === 'side' ? 0.48 : D.kind === 'low' ? Math.min(D.pivot.y, 0.5) : ROB_BODY_Y;
      const fall = D.landed || (D.landed = { x: rob.dive.position.x, y: rob.dive.position.y, z: rob.dive.position.z, roll: rob.dive.rotation.z });
      if (a < 0.5) {
        const e = easeIn(a / 0.5);
        const s = Math.sign(D.roll) || 0;
        rob.dive.position.set(fall.x + (D.kind === 'side' ? -s * 0.25 * easeOut(a / 0.5) : 0), lerp(fall.y, lieY, e), fall.z);
        if (D.kind === 'side') rob.dive.rotation.z = lerp(fall.roll, s * (Math.PI / 2 + 0.05), e);
        rob.apply(RPOSES[D.pose](t), 12, dt);
        if (a > 0.45 && !D.thud) { D.thud = 1; sfx.thud(); }
      } else if (a < 1.05 && D.kind === 'side') {
        rob.apply(RPOSES.lie(), 6, dt);
      } else {
        const e = D.kind === 'side' ? smooth((a - 1.05) / 0.6) : smooth((a - 0.5) / 0.4);
        const sx = D.kind === 'side' ? fall.x * 0.55 : fall.x;
        const restX = fall.x + (D.kind === 'side' ? -(Math.sign(D.roll) || 0) * 0.25 : 0);
        rob.dive.position.set(lerp(restX, sx, e), lerp(lieY, ROB_BODY_Y, e), lerp(fall.z, 0, e));
        rob.dive.rotation.z = lerp(D.kind === 'side' ? (Math.sign(D.roll) || 0) * (Math.PI / 2 + 0.05) : 0, 0, e);
        if (S.isGoal) {
          rob.apply(RPOSES.oops(Math.max(0, a - 1.05)), 6, dt);
          if (a > 1.9 && rob.expression === 'oops') rob.face('sad');
          rob.root.rotation.y = angDamp(rob.root.rotation.y, a > 1.6 ? -0.5 * (Math.sign(SHOT.B.x) || 1) : 0, 3, dt);
        } else {
          rob.apply(RPOSES.hold(a), 6, dt);
          rob.dive.position.y += 0.06 * Math.abs(Math.sin(a * 8)) * e;
        }
      }
    }
  }
  rob.update(dt, t);
}

// ---------- animation: the ball ----------
const _bp = new THREE.Vector3(), _bq = new THREE.Vector3();
function spinBall(v, dt) {
  const sp = v.length();
  if (sp < 1e-4) return;
  _axis.set(v.z, 0, -v.x).normalize();
  if (_axis.lengthSq() < 0.5) _axis.set(1, 0, 0);
  _q.setFromAxisAngle(_axis, (sp / BALL_R) * dt * 0.6);
  ball.quaternion.premultiply(_q);
}
function animateBall(dt) {
  const p = S.phase;
  if ((S.closeup || S.debugPose) && (p === 'menu' || p === 'loading')) { ball.position.set(LOBBY.x + 0.5, BALL_R, LOBBY.z + 0.35); return; }
  if (p === 'menu' || p === 'loading') {
    // juggling: the ball flies from one foot to the other
    const J = 0.66, n = Math.floor(S.time / J), u = (S.time / J) % 1, next = n % 2 ? 1 : -1;
    const ax = LOBBY.x + (next > 0 ? 0.09 : -0.09), bx = LOBBY.x + (next > 0 ? -0.09 : 0.09);
    const prev = _bq.copy(ball.position);
    ball.position.set(lerp(ax, bx, u), 0.3 + 0.52 * 4 * u * (1 - u), LOBBY.z + 0.24);
    spinBall(_bp.subVectors(ball.position, prev).divideScalar(Math.max(dt, 1e-3)), dt);
    return;
  }
  if (p !== 'shot') return;
  const st = S.st;
  if (st < SHOT.tContact) { ball.position.copy(SPOT); return; }
  if (S.sub === 'flight') {
    const u = clamp((st - SHOT.tContact) / FLIGHT, 0, 1);
    const prev = _bq.copy(ball.position);
    bez(u, ball.position);
    spinBall(_bp.subVectors(ball.position, prev).divideScalar(Math.max(dt, 1e-3)), dt);
    return;
  }
  if (S.sub === 'toSave' || (S.sub === 'save' && !S.isGoal)) {
    if (st < SHOT.tCatch) { ball.position.addScaledVector(BALLV, dt); spinBall(BALLV, dt); return; }
    // in Rob's gloves (and then held up high on his right glove)
    const a = st - SHOT.dive.t1;
    rob.root.updateMatrixWorld(true);
    rob.hands(_bp);
    if (a > 1.05) { rob.top(_bq); _bp.lerp(_bq, smooth((a - 1.05) / 0.6)); }
    ball.position.lerp(_bp, a < 0.12 ? 0.5 : 1);
    return;
  }
  // a goal: the ball flies on into the net, bulges it, drops and rolls about
  const v = BALLV;
  v.y -= 9.8 * dt;
  ball.position.addScaledVector(v, dt);
  const bp = ball.position, net = stadium.net;
  const backZ = net.backZ(bp.y) + BALL_R + 0.02;
  if (bp.z < backZ && v.z < 0) {
    if (!S.ev.net) { S.ev.net = 1; net.hit(bp, v.length()); sfx.net(); }
    bp.z = backZ; v.z = -v.z * 0.12; v.x *= 0.35; v.y *= 0.3;
  }
  if (bp.z < 0 && bp.y > 2.3 - BALL_R && v.y > 0) { bp.y = 2.3 - BALL_R; v.y = -v.y * 0.2; }
  if (bp.y < BALL_R) { bp.y = BALL_R; if (v.y < 0) v.y = -v.y * 0.42; v.x *= 0.9; v.z *= 0.9; if (Math.abs(v.y) < 0.4) v.y = 0; }
  if (bp.z < 0) { if (Math.abs(bp.x) > 3.6 - BALL_R) { bp.x = Math.sign(bp.x) * (3.6 - BALL_R); v.x = -v.x * 0.3; } }
  v.x *= Math.exp(-0.6 * dt); v.z *= Math.exp(-0.6 * dt);
  spinBall(_bp.set(v.x, 0, v.z), dt);
}

// ---------- bubbles, labels ----------
function animateBubbles(dt) {
  for (let k = 0; k < 3; k++) {
    const b = bubbles[k];
    if (!b.mesh.visible) continue;
    b.t += dt;
    const bob = 0.06 * Math.sin(S.time * 1.7 + k * 2.1), sway = 0.04 * Math.sin(S.time * 1.1 + k);
    let s = 1, alpha = 1;
    if (b.state === 'in') { s = b.t < 0 ? 0.001 : backOut(b.t / 0.5); }
    else if (b.state === 'pop') { s = 1 + 0.4 * easeOut(b.t / 0.14); alpha = 1 - smooth(b.t / 0.14); if (b.t > 0.16) b.mesh.visible = false; }
    else if (b.state === 'fade') { alpha = 1 - 0.75 * smooth(b.t / 0.6); s = 1 - 0.15 * smooth(b.t / 0.6); }
    else if (b.state === 'reveal') { b.u.uGlow.value = smooth(b.t / 0.4); s = 1 + 0.08 * Math.sin(b.t * 7); }
    b.hot = Math.max(0, b.hot - dt * 0.2);
    b.u.uHot.value = b.hot;
    b.u.uAlpha.value = alpha; b.alpha = alpha;
    b.mesh.position.set(b.x + sway, b.y + bob, BUB_Z);
    b.mesh.scale.setScalar(Math.max(0.001, s) * BUB_R);
    b.u.uTime.value = S.time;
  }
}
const _c = new THREE.Vector3(), _e = new THREE.Vector3(), camRight = new THREE.Vector3();
function updateLabels() {
  const W = innerWidth, H = innerHeight;
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  for (let k = 0; k < 3; k++) {
    const el = labelEls[k], b = bubbles[k];
    const show = b.mesh.visible && (S.phase === 'aim' || S.phase === 'shot') && !S.closeup && !(b.state === 'pop');
    if (!show) { if (el.style.opacity !== '0') { el.style.opacity = '0'; el.style.pointerEvents = 'none'; } continue; }
    _c.copy(b.mesh.position).project(camera);
    const x = (_c.x + 1) / 2 * W, y = (1 - _c.y) / 2 * H;
    _e.copy(b.mesh.position).addScaledVector(camRight, b.mesh.scale.x).project(camera);
    const r = Math.abs((_e.x + 1) / 2 * W - x);
    const word = el.dataset.word || '';
    const longest = Math.max(...word.split(' ').map((s) => s.length), 1);
    const box = Math.max(64, r * 2.1);
    // as big as the space between two bubbles allows (the words matter more than the bubbles)
    const colPx = (r / Math.max(b.mesh.scale.x, 0.01)) * 2.5;
    const maxW = Math.max(72, Math.min(colPx - 6, W * 0.42));
    const fs = Math.floor(clamp(Math.min(Math.max(r * 0.62, 21), (maxW - 16) / (0.56 * longest + 0.3)), 15, 38));
    el.style.width = el.style.height = Math.round(box) + 'px';
    el.style.fontSize = fs + 'px';
    el.firstChild.style.maxWidth = Math.round(maxW) + 'px';
    el.style.transform = `translate3d(${(x - box / 2).toFixed(1)}px, ${(y - box / 2).toFixed(1)}px, 0)`;
    const a = b.state === 'in' ? clamp(b.t / 0.35, 0, 1) : b.state === 'fade' ? b.alpha : 1;
    el.style.opacity = a.toFixed(3);
    el.style.pointerEvents = S.phase === 'aim' ? 'auto' : 'none';
  }
}

// ---------- shadows, crowd, effects ----------
function updateBlobs() {
  fox.root.updateMatrixWorld(true);
  foxBlob.position.set(fox.root.position.x, 0.012, fox.root.position.z);
  foxBlob.scale.setScalar(1 - clamp(fox.pose.y, 0, 0.4));
  rob.dive.getWorldPosition(_v);
  robBlob.position.set(_v.x, 0.013, _v.z);
  const ry = clamp((_v.y - ROB_BODY_Y) / 1.5, 0, 0.6);
  robBlob.scale.set(1 - ry + Math.abs(Math.sin(rob.dive.rotation.z)) * 0.5, 1 - ry, 1);
  ballBlob.position.set(ball.position.x, 0.014, ball.position.z);
  const bh = clamp((ball.position.y - BALL_R) / 2.5, 0, 1);
  ballBlob.scale.setScalar(1 + bh); ballBlob.material.opacity = 0.5 * (1 - bh * 0.8);
  ballBlob.visible = ball.visible;
}
function updateCrowd(dt) {
  const base = S.phase === 'menu' ? 0.12 : S.phase === 'end' ? 0.25 : S.sub === 'run' || S.sub === 'kick' || S.sub === 'flight' ? 0.3 : 0.08;
  S.cheer = Math.max(base, S.cheer - dt * (S.cheer > 0.6 ? 0.18 : 0.4));
  const u = stadium.crowd.uniforms;
  u.uCheer.value = damp(u.uCheer.value, S.cheer, 6, dt);
  u.uWave.value = damp(u.uWave.value, S.phase === 'menu' || S.phase === 'end' ? 1 : 0, 1.5, dt);
  u.uSad.value = damp(u.uSad.value, S.sub === 'save' ? 1 : 0, 4, dt);
  crowdSound(document.hidden ? 0 : S.cheer * (S.phase === 'loading' ? 0 : 1));
}

// ---------- main loop ----------
let last = performance.now(), slowFrames = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  let dt = S.paused ? 0 : rdt * S.timeScale;
  dt *= S.slow;
  S.time += dt; S.pt += dt;
  if (S.phase === 'shot') updateShot(dt);
  animateFox(dt);
  animateRob(dt);
  animateBall(dt);
  animateBubbles(dt);
  updateCamera(S.paused ? 0 : rdt * S.timeScale);
  updateLabels();
  updateBlobs();
  updateCrowd(dt);
  stadium.update(dt, S.time);
  confetti.update(dt);
  sparks.update(dt);
  S.shake = Math.max(0, S.shake - rdt * 2.4);
  renderer.render(scene, camera);
  // lower the resolution on slow devices (never raise it again)
  if (rdt > 0 && !S.paused) { frames++; if (rdt > 1 / 38) slowFrames++; }
  if (frames >= 90) {
    if (slowFrames > 45 && pr > 1) { pr = Math.max(1, pr - 0.25); resize(); }
    frames = 0; slowFrames = 0;
  }
}

// ---------- start ----------
function init() {
  renderPack();
  resize();
  setPhase('menu');
  camSnap = true;
  $('loadFill').style.width = '100%';
  setTimeout(() => {
    ui.loading.classList.add('gone');
    ui.start.classList.remove('hidden');
    $('playBtn').classList.add('pulse');
    window.PS.ready = true;
  }, 150);
}

// ---------- test hooks ----------
window.PS = {
  ready: false,
  state: () => ({
    phase: S.phase, sub: S.sub, q: S.qi + 1, total: QN, goals: S.goals, results: S.results.slice(),
    sentence: S.q ? `${S.q.before}___${S.q.after}` : null, right: S.q && S.q.right,
    options: S.q && S.q.opts.map((o) => o.text), spots: S.q && S.q.opts.map((o) => [o.x, o.y]), correct: S.q ? S.q.correct : -1,
    chosen: S.chosen, nextShown: S.nextShown, net: +stadium.net.dent.toFixed(3), st: +S.st.toFixed(2), since: S.tRes ? +(S.time - S.tRes).toFixed(2) : 0, time: +S.time.toFixed(2), keeper: rob.expression, fov: +camera.fov.toFixed(2), pixelRatio: pr,
    packs: packIds.slice(), endStars: S.endStars,
  }),
  start: (ids) => { if (ids) { packIds = ids; renderPack(); } unlock(); startGame(); return true; },
  // tap the right bubble (or a wrong one)
  answer: (right = true) => {
    if (S.phase !== 'aim') return false;
    const k = right ? S.q.correct : (S.q.correct + 1 + Math.floor(Math.random() * 2)) % 3;
    choose(k); return k;
  },
  next: () => { advance(); return true; },
  bubbles: () => labelEls.map((el, k) => ({ word: el.dataset.word, right: S.q ? k === S.q.correct : false, opacity: +el.style.opacity, rect: el.getBoundingClientRect().toJSON() })),
  timeScale: (k) => { S.timeScale = k; },
  pause: (b) => { S.paused = !!b; },
  info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  closeup: (who, opts = {}) => { S.closeup = who ? { who, ...opts } : null; camSnap = true; ui.start.classList.toggle('hidden', !!who || S.phase !== 'menu'); return true; },
  pose: (name, u, side) => { S.debugPose = name ? { name, u, side } : null; return true; },
  fit: () => ({ ...FIT, safe }),
  tris: () => {
    const out = {};
    const count = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.visible) { const g = m.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3; n += t * (m.isInstancedMesh ? m.count : g.isInstancedBufferGeometry ? g.instanceCount : 1); } }); return Math.round(n); };
    for (const c of scene.children) out[c.name || c.type] = (out[c.name || c.type] || 0) + count(c);
    for (const c of stadium.root.children) { const k = 'st:' + (c.name || c.type) + (c.geometry ? ':' + c.geometry.type : ''); out[k] = (out[k] || 0) + count(c); }
    return out;
  },
};

requestAnimationFrame(frame);
init();
