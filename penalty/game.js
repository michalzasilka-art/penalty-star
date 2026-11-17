// Penalty Star: Foxino takes ten penalties. Each one is a gap-fill sentence; four soap bubbles in front of the goal
// carry four words (2026-11-15, the user: "four bubbles you can shoot at"). Tap the right word: Foxino scores. A wrong word: Rob the goalkeeper saves it and the right
// bubble lights up so the right sentence is learnt.
import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { makeFoxino, POSES } from './foxino.js';
import { loadFoxino, KIT_PARTS } from './foxino-glb.js?v=2';
import { makeRob, RPOSES, ROB_BODY_Y } from './rob.js';
import { makeStadium, loadStadiumModels, dressModel } from './stadium.js';
import { GLTFLoader as GLTFLoaderLR } from './lib/GLTFLoader.js';
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
const LOBBY = new THREE.Vector3(0, 0, 11.6);
const ROB_START = new THREE.Vector3(-2.3, 0, 13.4);   // (keeper rounds: Rob waits out of the way of the goal, then runs in)             // where he juggles on the start screen
const KEEPER = new THREE.Vector3(0, 0, 0.32);            // Rob on his line
const COLS = [-2.7, -0.9, 0.9, 2.7], ROWS = [0.8, 1.74], BUB_Z = 1.1, BUB_R = 0.62, NB = COLS.length, GAP = COLS[1] - COLS[0];
const T_WAIT = 0.5, T_RUN = 0.9, T_KICK = 0.62, CONTACT = 0.4, FLIGHT = 0.6;
const TINTS = [0xff6fb5, 0xffcd1c, 0x48d8ff, 0x66e08a];
const CSS_TINTS = ['#ff8fc4', '#ffd84a', '#6fe2ff', '#8ef0a8'];

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

/* (2026-11-17, the user: "put this lighting setting you did in Adventures to ... penalties") the Foxino Adventures look:
   soft sun shadows over the goal mouth, then ONE full-screen pass with a cheap ambient occlusion (darker creases, the foot of
   things), a soft-focus background (the far stands), a gentle pastel grade and a light vignette. GFX.level 2 = everything,
   1 = shadows + grade, 0 = the old direct drawing; a slow device steps down a level before it lowers the resolution. */
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const GFX = { level: /[?&]gfx=0/.test(location.search) ? 0 : 2, t: 0 };
{ key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const c = key.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 100; c.updateProjectionMatrix();
  key.shadow.bias = -.0005; key.shadow.normalBias = .03; key.shadow.radius = 4; key.userData.dir = key.position.clone().normalize(); key.target.position.set(0, 0, 5); key.position.copy(key.target.position).addScaledVector(key.userData.dir, 50); scene.add(key.target); }
function shadowSweep(sc) { sc.traverse((o) => { if (!o.isMesh || o.userData.sh) return; o.userData.sh = 1; const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m || m.isShaderMaterial && !m.lights || m.isMeshBasicMaterial || m.isSpriteMaterial || m.isPointsMaterial) return;
  o.receiveShadow = true; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const r = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) : 1;
  o.castShadow = !m.transparent && !o.isInstancedMesh && (r < 30 || o.isSkinnedMesh); }); }
const POST = { rt: null, mat: null, sc: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sz: new THREE.Vector2() };
function postInit(w, h) {
  const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
  POST.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: dt, depthBuffer: true });
  POST.mat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { tC: { value: POST.rt.texture }, tD: { value: dt }, uRes: { value: new THREE.Vector2(w, h) }, uNear: { value: .1 }, uFar: { value: 1200 }, uAO: { value: 1 }, uBlur: { value: 1 }, uFocus: { value: 12 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tC, tD; uniform vec2 uRes; uniform float uNear, uFar, uAO, uBlur, uFocus; varying vec2 vUv;
      float lin(vec2 uv) { float z = texture2D(tD, uv).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      void main() {
        vec2 px = 1.0 / uRes; float d = lin(vUv); vec3 c = texture2D(tC, vUv).rgb;
        float bl = uBlur * smoothstep(uFocus * 1.6, uFocus * 5.0, d) * (1.0 - step(uFar * .97, d) * .5);
        if (bl > .01) { vec3 acc = c; float r = 2.6 * bl; for (int i = 0; i < 8; i++) { float a = float(i) * .785398; acc += texture2D(tC, vUv + vec2(cos(a), sin(a)) * px * r * (1.0 + float(i - (i / 2) * 2))).rgb; } c = mix(c, acc / 9.0, bl); }
        if (uAO > .01 && d < 120.0) { float occ = 0.0; float rad = clamp(18.0 / d, 2.0, 22.0);
          for (int i = 0; i < 10; i++) { float a = float(i) * 2.399963 + .5; float rr = rad * (.35 + .65 * fract(float(i) * .618)); vec2 o = vec2(cos(a), sin(a)) * rr * px; float dd = lin(vUv + o);
            float diff = d - dd; occ += smoothstep(.02, .35, diff) * (1.0 - smoothstep(.6, 2.2, diff)); }
          occ = clamp(occ / 10.0, 0.0, 1.0) * (1.0 - smoothstep(70.0, 120.0, d)); c *= mix(vec3(1.0), vec3(.62, .6, .78), occ * uAO * .85); }
        float L = dot(c, vec3(.299, .587, .114));
        c = mix(vec3(L), c, 1.04);
        c += vec3(.012, .01, .03) * (1.0 - smoothstep(0.0, .35, L));
        c *= mix(vec3(1.0), vec3(1.03, 1.01, .96), smoothstep(.3, 1.0, L));
        vec2 q = vUv - .5; c *= 1.0 - dot(q, q) * .3;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mat); quad.frustumCulled = false; POST.sc = new THREE.Scene(); POST.sc.add(quad);
}
function drawFrame() {
  const G = GFX.level; renderer.shadowMap.enabled = G > 0; key.castShadow = G > 0 && camera.position.y > -20;   // (no sun shadows down in the Locker room)
  if (G > 0 && (GFX.t++ % 30) === 0) shadowSweep(scene);
  if (G === 0) { renderer.render(scene, camera); return; }
  renderer.getDrawingBufferSize(POST.sz); const w = Math.max(1, POST.sz.x | 0), h = Math.max(1, POST.sz.y | 0);
  if (!POST.rt) postInit(w, h); else if (POST.rt.width !== w || POST.rt.height !== h) { POST.rt.setSize(w, h); POST.mat.uniforms.uRes.value.set(w, h); }
  const U = POST.mat.uniforms; U.uAO.value = G > 1 ? 1 : 0; U.uBlur.value = G > 1 ? .75 : 0; U.uFocus.value = Math.max(3, camera.position.distanceTo(CAM.look) * 1.15); U.uNear.value = camera.near; U.uFar.value = camera.far;
  renderer.setRenderTarget(POST.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(POST.sc, POST.cam);
}

// (2026-11-15) the Blender stadium; the code-built one if its models can't load
let STADIUM_MODELS = null; try { STADIUM_MODELS = await loadStadiumModels(); } catch (e) { console.warn('Stadium models did not load; using the code-built stadium', e); }
const stadium = makeStadium(scene, STADIUM_MODELS);
// (2026-11-15) the Locker room set from Blender, 40 m under the pitch: the Locker room's camera and Foxino go down there.
// Its hanging shirts wear the shirt colour the player picks; the door plate says FOXINO
const LOCKER_AT = new THREE.Vector3(0, -40, 11.6);
const LROOM = { shirts: [] };
new GLTFLoaderLR().loadAsync('models/locker-room.glb?v=1').then((g) => {
  const r = dressModel(g.scene); r.position.copy(LOCKER_AT); scene.add(r); LROOM.root = r;
  r.traverse((o) => { if (o.isMesh && (o.name === 'Shirts' || (o.parent && o.parent.name === 'Shirts'))) { o.material = o.material.clone(); LROOM.shirts.push(o); } });
  const plate = r.getObjectByName('Plate');
  if (plate) { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g2 = cv.getContext('2d'); const draw = () => { g2.fillStyle = '#ffcd1c'; g2.fillRect(0, 0, 256, 96); g2.fillStyle = '#5b2bb0'; g2.font = '58px "Lilita One", "Arial Black", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('FOXINO', 128, 52); }; draw();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; plate.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ map: t }); });
    if (document.fonts && document.fonts.load) document.fonts.load('58px "Lilita One"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {}); }
  // a warm light inside the room
  const lamp = new THREE.PointLight(0xfff2dc, 18, 12, 1.5); lamp.position.copy(LOCKER_AT).add(new THREE.Vector3(0, 3, 0)); scene.add(lamp);
  tintShirts();
}).catch((e) => console.warn('Locker room set did not load; the Locker room uses the pitch', e));
function tintShirts() { let c = '#ffcd1c'; try { c = (LK.kit && LK.kit.shirt) || c; } catch (e) { /* (the kit settings are not set up yet) */ } for (const m of LROOM.shirts) m.material.color.set(c); }
// (2026-11-13) Football Foxino is the Tripo model (foxino-glb.js); the code-built one only if the model can't load
let fox; try { fox = await loadFoxino(); } catch (e) { console.warn('Football Foxino model did not load; using the code-built one', e); fox = makeFoxino(); }
scene.add(fox.root);
const rob = makeRob(); scene.add(rob.root); rob.root.position.copy(KEEPER);
const ball = makeBall(); scene.add(ball);
const foxBlob = makeBlob(0.9), robBlob = makeBlob(1.25), ballBlob = makeBlob(0.34, 0.5);
scene.add(foxBlob, robBlob, ballBlob);
const bubbles = TINTS.map((_, k) => { const b = makeBubble(TINTS[k]); b.mesh.visible = false; scene.add(b.mesh); return b; });
const confetti = makeConfetti(); scene.add(confetti.mesh);
const sparks = makeSparks(); scene.add(sparks.points);
// ---------- (2026-11-15) the POWER SHOT's wind: glowing ribbons that trail the ball and spiral round its path ----------
const wind = (() => {
  const N = 34, R = 6, ribbons = [];
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: `attribute float aT; varying float vT; varying float vS; attribute float aS; void main(){ vT = aT; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uA; varying float vT; varying float vS; void main(){ float a = (1.0 - vT) * (1.0 - abs(vS)) * uA; gl_FragColor = vec4(mix(vec3(0.75, 0.95, 1.0), vec3(1.0), 1.0 - vT) * a, a); }` });
  for (let r = 0; r < R; r++) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 2 * 3), t = new Float32Array(N * 2), sd = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N; i++) { t[i * 2] = t[i * 2 + 1] = i / (N - 1); sd[i * 2] = -1; sd[i * 2 + 1] = 1; if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(t, 1)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; scene.add(m);
    ribbons.push({ m, hist: [], ph: (r / R) * Math.PI * 2, rad: r === 0 ? 0 : 0.22 + 0.07 * (r % 2), w: r === 0 ? 0.2 : 0.06 });
  }
  let on = false, fade = 0;
  const side = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3(), toCam = new THREE.Vector3();
  return {
    start() { on = true; fade = 1; for (const R0 of ribbons) { R0.hist = []; R0.m.visible = true; } },
    stop() { on = false; fade = 0; mat.uniforms.uA.value = 0; for (const R0 of ribbons) R0.m.visible = false; },
    update(dt, t) {
      if (!on && fade <= 0) return;
      if (!on || ball.position.z < -0.6) fade = Math.max(0, fade - dt * 2.2);
      mat.uniforms.uA.value = fade; if (fade <= 0) { for (const R0 of ribbons) R0.m.visible = false; return; }
      dir.copy(BALLV.lengthSq() > 0.01 ? BALLV : _v.set(0, 0, -1)).normalize(); side.crossVectors(dir, _v.set(0, 1, 0)).normalize(); up.crossVectors(side, dir).normalize();
      for (const R0 of ribbons) {
        const a = R0.ph + t * 18, p = tmp.copy(ball.position).addScaledVector(side, Math.cos(a) * R0.rad).addScaledVector(up, Math.sin(a) * R0.rad);
        if (on) { R0.hist.unshift(p.clone()); if (R0.hist.length > N) R0.hist.length = N; }
        const pos = R0.m.geometry.attributes.position, H = R0.hist;
        for (let i = 0; i < N; i++) {
          const q = H[Math.min(i, H.length - 1)] || ball.position, q2 = H[Math.min(i + 1, H.length - 1)] || q;
          toCam.subVectors(camera.position, q).normalize(); const along = _v.subVectors(q, q2); if (along.lengthSq() < 1e-8) along.copy(dir);
          const off = along.cross(toCam).normalize().multiplyScalar(R0.w * (1 - i / N * 0.7));
          pos.setXYZ(i * 2, q.x - off.x, q.y - off.y, q.z - off.z); pos.setXYZ(i * 2 + 1, q.x + off.x, q.y + off.y, q.z + off.z);
        }
        pos.needsUpdate = true;
      }
    },
  };
})();

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
  cheer: 0.15, shake: 0, closeup: null, debugPose: null, streak: 0, power: false, roll: 0, gk: false, lastPower: 0,
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
// most sentences carry two wrong words; the fourth bubble borrows one the same package uses against the same right word in
// another sentence (so it is wrong here too), else one used beside the same wrong words, else any word of that kind
function packIndex(pk) {
  if (pk._ix) return pk._ix;
  const byRight = new Map(), byWrong = new Map(), byKind = new Map(), add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const q of pk.rounds.flat()) { const m = q.match(/\[([^\]]+)\]/); if (!m) continue; const [r, ...w] = m[1].split('|');
    for (const x of w) { add(byRight, r.toLowerCase(), x); for (const y of w) if (y !== x) add(byWrong, y.toLowerCase(), x); add(byKind, slotKey(x) + '#' + x.split(' ').length, x); } }
  return (pk._ix = { byRight, byWrong, byKind });
}
function extraWrongs(pk, right, wrong, n) {
  const ix = packIndex(pk), have = new Set([right, ...wrong].map((t) => t.toLowerCase())), out = [];
  const take = (set) => { for (const t of shuffle([...(set || [])])) { if (out.length >= n) return; if (!have.has(t.toLowerCase())) { have.add(t.toLowerCase()); out.push(t); } } };
  take(ix.byRight.get(right.toLowerCase())); for (const w of wrong) take(ix.byWrong.get(w.toLowerCase()));
  for (const w of wrong) take(ix.byKind.get(slotKey(w) + '#' + w.split(' ').length));
  return out;
}
function fillChoices(s, pk) {
  const m = s.match(/\[([^\]]+)\]/);
  const [right, ...wrong0] = m[1].split('|');
  const wrong = shuffle(wrong0).slice(0, NB - 1);
  if (pk && wrong.length < NB - 1) {   // (a borrowed word takes the right word's capital or small first letter, so its case never gives it away; "I" stays "I")
    const cap = /^[A-Z]/.test(right) && !/^I\b/.test(right), fix = (t) => (/^I\b/.test(t) ? t : cap ? t[0].toUpperCase() + t.slice(1) : t[0].toLowerCase() + t.slice(1));
    wrong.push(...extraWrongs(pk, right, wrong, NB - 1 - wrong.length).map(fix).filter((t) => t.toLowerCase() !== right.toLowerCase()));
  }
  // (four bubbles) every word starts the same way, so a capital never gives the answer away: capitals at the start of a
  // sentence, else the right word's own case ("I" always stays "I")
  const before0 = s.slice(0, m.index), start = !before0.trim() || /[.!?]["')]?\s*$/.test(before0), small = !start && (/^[a-z]/.test(right) || /^I\b/.test(right));   // (mid-sentence: small letters, "I" stays "I")
  const look = (t) => (/^I\b/.test(t) ? t : start ? t[0].toUpperCase() + t.slice(1) : small ? t[0].toLowerCase() + t.slice(1) : t);
  const seen = new Set(), words = [{ text: look(right), ok: true }, ...wrong.map((t) => ({ text: look(t), ok: false }))].filter((w) => { const k = w.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  words.sort((x, y) => slotKey(x.text).localeCompare(slotKey(y.text)) || x.text.localeCompare(y.text));
  words.before = s.slice(0, m.index); words.after = s.slice(m.index + m[0].length); words.right = words.find((w) => w.ok).text;
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
    const w = fillChoices(pickSentence(pk, r), pk);
    // (four bubbles) neighbours never on the same row, so every word has room: a zigzag that starts high or low
    const up = Math.random() < 0.5 ? 1 : 0, rows = w.map((_, k) => (k + up) % 2);
    const opts = w.map((o, k) => ({ text: o.text, ok: o.ok, x: COLS[k] + (Math.random() - 0.5) * 0.18, y: ROWS[rows[k]] }));
    return { before: w.before, after: w.after, right: w.right, opts, correct: opts.findIndex((o) => o.ok) };
  });
}

// ---------- UI ----------
const ui = {
  hud: $('hud'), card: $('card'), kick: $('cardKick'), shoot: $('shoot'), sentence: $('sentence'), note: $('note'), next: $('nextBtn'),
  banner: $('banner'), flash: $('flash'), start: $('start'), end: $('end'), loading: $('loading'), labels: $('labels'),
};
const ICON = {
  get stop() { return ICON.save; }, get let() { return ICON.goal; },
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
const labelEls = TINTS.map((_, k) => {
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

// ---------- the Locker room (2026-11-15, the user: "a new menu where the players change their clothes") ----------
const PALETTE = ['#ffcd1c', '#ff7d22', '#e8403a', '#ff5db1', '#8f52d9', '#2a6bff', '#3cc6ef', '#2fbf6a', '#ffffff', '#2a2c40'];
const KITS = [
  { name: 'Sunshine', kit: {}, show: { shirt: '#ffcd1c', trim: '#ffffff', shorts: '#ff7d22', socks: '#ffcd1c', boots: '#2a2c40' } },
  { name: 'Galaxy', kit: { shirt: '#8f52d9', trim: '#ffcd1c', shorts: '#2a2c40', socks: '#8f52d9', boots: '#ffffff' } },
  { name: 'Ocean', kit: { shirt: '#2a6bff', trim: '#ffffff', shorts: '#ffffff', socks: '#2a6bff', boots: '#2a2c40' } },
  { name: 'Fire', kit: { shirt: '#e8403a', trim: '#ffffff', shorts: '#2a2c40', socks: '#e8403a', boots: '#2a2c40' } },
  { name: 'Forest', kit: { shirt: '#2fbf6a', trim: '#ffffff', shorts: '#ffffff', socks: '#2fbf6a', boots: '#2a2c40' } },
  { name: 'Snow', kit: { shirt: '#ffffff', trim: '#3cc6ef', shorts: '#ffffff', socks: '#ffffff', boots: '#3cc6ef' } },
  { name: 'Candy', kit: { shirt: '#ff5db1', trim: '#ffffff', shorts: '#8f52d9', socks: '#ff5db1', boots: '#ffffff' } },
  { name: 'Night', kit: { shirt: '#2a2c40', trim: '#ff7d22', shorts: '#2a2c40', socks: '#2a2c40', boots: '#ff7d22' } },
];
const PART_NAME = { shirt: 'SHIRT', trim: 'SHIRT STRIPES', shorts: 'SHORTS', socks: 'SOCKS', boots: 'BOOTS' };
const ORIG = KITS[0].show;
const LK = { yaw: 0, home: 0.35, vel: 0, drag: null, t: -9, kit: store.get('penalty-kit', {}) || {} };
const kitSvg = (k) => { const c = (p) => k[p] || ORIG[p];
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 5l-11 6 4 9 5-2.5V30h18V17.5l5 2.5 4-9-11-6c-1 2.6-3.6 4-7 4s-6-1.4-7-4z" fill="${c('shirt')}" stroke="#1d1640" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M17 5c1 2.6 3.6 4 7 4s6-1.4 7-4" fill="none" stroke="${c('trim')}" stroke-width="2.4"/><path d="M6.8 13l3.1 7" stroke="${c('trim')}" stroke-width="2.2"/><path d="M41.2 13l-3.1 7" stroke="${c('trim')}" stroke-width="2.2"/>
    <path d="M15 31h18l1 9h-8l-2-4-2 4h-8z" fill="${c('shorts')}" stroke="#1d1640" stroke-width="1.6" stroke-linejoin="round"/></svg>`; };
const sameKit = (a, b) => KIT_PARTS.every((p) => (a[p] || null) === (b[p] || null));
function renderLocker() {
  $('lkKits').innerHTML = KITS.map((K, i) => `<button type="button" class="lk-kit${sameKit(LK.kit, K.kit) ? ' on' : ''}" data-i="${i}">${kitSvg(K.kit)}<span>${K.name}</span></button>`).join('');
  $('lkRows').innerHTML = KIT_PARTS.map((p) => `<div class="lk-row"><i>${PART_NAME[p]}</i><div class="lk-sw" data-p="${p}"><button type="button" class="orig${!LK.kit[p] ? ' on' : ''}" data-c="" aria-label="Original ${PART_NAME[p].toLowerCase()}"></button>${PALETTE.map((c) => `<button type="button" style="--c:${c}" class="${LK.kit[p] === c ? 'on' : ''}" data-c="${c}" aria-label="${PART_NAME[p].toLowerCase()} ${c}"></button>`).join('')}</div></div>`).join('');
}
function wearKit(kit, cheer = true) {
  LK.kit = { ...kit }; store.set('penalty-kit', LK.kit); renderLocker(); tintShirts();
  if (fox.setKit) fox.setKit(LK.kit); if (cheer) { LK.t = S.time; sfx.pick(); }
}
$('lkKits').addEventListener('click', (e) => { const b = e.target.closest('.lk-kit'); if (b) wearKit(KITS[+b.dataset.i].kit); });
$('lkRows').addEventListener('click', (e) => { const b = e.target.closest('.lk-sw button'); if (!b) return; const p = b.parentElement.dataset.p, k = { ...LK.kit }; if (b.dataset.c) k[p] = b.dataset.c; else delete k[p]; wearKit(k); });
$('lkShuffle').onclick = () => { const k = {}; for (const p of KIT_PARTS) k[p] = pick(PALETTE); k.socks = Math.random() < 0.7 ? k.shirt : k.socks; wearKit(k); };
function openLocker() { unlock(); sfx.click(); setPhase('locker'); LK.yaw = LK.home; LK.vel = 0; ui.start.classList.add('hidden'); $('locker').classList.remove('hidden'); renderLocker(); tintShirts(); camSnap = false; }
function closeLocker() { sfx.click(); $('locker').classList.add('hidden'); setPhase('menu'); ui.start.classList.remove('hidden'); }
$('lockerBtn').onclick = openLocker;
$('lkDone').onclick = closeLocker;
// drag on the game itself to turn Foxino round
canvas.addEventListener('pointerdown', (e) => { if (S.phase !== 'locker') return; LK.drag = { x: e.clientX, id: e.pointerId, t: performance.now() }; LK.vel = 0; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { const d = LK.drag; if (!d || e.pointerId !== d.id) return; const dx = (e.clientX - d.x) / Math.min(innerWidth, innerHeight) * 5; LK.yaw += dx; const now = performance.now(); LK.vel = dx / Math.max(0.016, (now - d.t) / 1000); d.x = e.clientX; d.t = now; });
const lkUp = (e) => { if (LK.drag && e.pointerId === LK.drag.id) { LK.drag = null; LK.vel = clamp(LK.vel, -8, 8); } };
canvas.addEventListener('pointerup', lkUp); canvas.addEventListener('pointercancel', lkUp);
if (fox.setKit && Object.keys(LK.kit).length) fox.setKit(LK.kit);
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
  ui.kick.innerHTML = `PENALTY ${S.qi + 1} / ${QN} <em class="role ${S.gk ? 'gk' : 'gs'}">${S.gk ? 'KEEPER' : 'STRIKER'}</em>`;
  ui.sentence.innerHTML = `${hints(q.before)}<span class="gap">&nbsp;</span>${hints(q.after)}`;
  ui.note.className = ''; ui.note.innerHTML = S.qi < 2 ? (S.gk ? 'You are in goal! Rob shoots at the right word: tap it to dive there!' : 'Your turn to shoot: tap the bubble with the right word!') : '&nbsp;';
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
// keeper rounds (2026-11-16, the user: "a camera behind you in the net, so you can see the difference clearer"): the camera
// stands behind the goal (between the LED boards and the first row of fans) and looks out through the net over Foxino's
// shoulders at the four bubbles and Rob on the spot. A phone screen is narrow, so this camera may open wider (up to 108°
// top to bottom, still only about 60° across) to keep the outer bubbles in.
const GK_FIT = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60, fx: 0.5, fy: 0.5 };
const GK_REQ = [], GK_SOFT = [];
for (const x of [-3.2, 3.2]) for (const y of [0.1, 2.44]) GK_REQ.push(new THREE.Vector3(x, y, BUB_Z));
GK_REQ.push(new THREE.Vector3(KICK_AT.x, 0, KICK_AT.z), new THREE.Vector3(KICK_AT.x, 1.6, KICK_AT.z));
GK_SOFT.push(new THREE.Vector3(KEEPER.x, 0, KEEPER.z), new THREE.Vector3(KEEPER.x, 1.2, KEEPER.z));   // (the posts may go off the sides)
function keeperCamPos(a, outPos, outLook) {
  const P = window.PS_GKCAM || [0, 2.8, -5.1, 0, 1.0, 5];
  const k = smooth((a - 0.75) / 0.85);   // (a wide screen can come closer, into the net's shadow)
  outPos.set(P[0], lerp(P[1], 2.5, k), lerp(P[2], -4.3, k)); outLook.set(P[3], P[4], P[5]);
}
function fitPlay() { fitCam(FIT, playCamPos, REQ, SOFT); fitCam(GK_FIT, keeperCamPos, GK_REQ, GK_SOFT); }
function fitCam(FIT, camPos, REQ, SOFT) {
  const a = innerWidth / innerHeight;
  camPos(a, FIT.pos, FIT.look);
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
  T = clamp(T, Math.tan(THREE.MathUtils.degToRad(6)), Math.tan(THREE.MathUtils.degToRad(FIT === GK_FIT ? 54 : 42)));
  FIT.fov = THREE.MathUtils.radToDeg(2 * Math.atan(T));
  const sx = (safe.l + safe.r) / 2, sy = (safe.t + safe.b) / 2;
  FIT.fx = sx - ((b.x0 + b.x1) / 2) / (2 * T * a);
  if (b === bA) FIT.fy = sy + ((b.y0 + b.y1) / 2) / (2 * T);
  else FIT.fy = safe.t + 0.02 + b.y1 / (2 * T); // no room for all of Foxino: keep the goal under the card
  FIT.T = T;
}
function rigPlay(out) {
  if (S.gk && (S.phase === 'aim' || S.phase === 'shot')) {   // in goal: behind the net; a little push in as Rob shoots
    out.pos.copy(GK_FIT.pos); out.look.copy(GK_FIT.look); out.fov = GK_FIT.fov; out.fx = GK_FIT.fx; out.fy = GK_FIT.fy;
    const push = S.phase === 'shot' ? smooth((S.st - (SHOT.tContact || 99) + 0.3) / 0.6) : 0;
    if (push > 0) { out.pos.z += 0.9 * push; out.pos.y -= 0.35 * push; out.fov *= 1 - 0.03 * push; }
    return;
  }
  out.pos.copy(FIT.pos); out.look.copy(FIT.look); out.fov = FIT.fov; out.fx = FIT.fx; out.fy = FIT.fy;
  // a small push toward the goal while the ball flies
  const push = S.phase === 'shot' ? smooth((S.st - (SHOT.tContact || 99) + 0.1) / 0.6) * (S.sub === 'goal' || S.sub === 'save' ? 1 : 1) : 0;
  if (push > 0) { out.pos.z -= 1.2 * push; out.pos.y += 0.1 * push; out.fov *= 1 - 0.04 * push; }
  // the POWER SHOT: the camera swings round to Foxino's left, drops low and tilts, close on the run-up; at the strike it
  // whips back behind the ball
  S.powerK = S.phase === 'shot' && S.power ? smooth((S.st - SHOT.tRun + 0.35) / 0.5) * (1 - smooth((S.st - SHOT.tContact - 0.12) / 0.4)) : 0;
  const P = S.powerK;
  if (P > 0) { out.pos.lerp(_pw.set(KICK_AT.x - 2.7, 0.75, KICK_AT.z + 3.6), P); out.look.lerp(_pl.set(SPOT.x - 0.25, 0.6, SPOT.z - 1.2), P); out.fov = lerp(out.fov, 44, P); out.fx = lerp(out.fx, 0.5, P); out.fy = lerp(out.fy, 0.5, P); }
}
const _pw = new THREE.Vector3(), _pl = new THREE.Vector3();
function rigMenu(out) {
  const a = innerWidth / innerHeight;
  const th = 0.42 + 0.22 * Math.sin(S.time * 0.25);
  const d = a < 0.8 ? 4.6 : 3.6;
  out.pos.set(LOBBY.x + Math.sin(th) * d, 0.95, LOBBY.z + Math.cos(th) * d);
  out.look.set(LOBBY.x, 0.82, LOBBY.z);
  out.fov = a < 0.8 ? 44 : a < 1.25 ? 40 : 38;
  out.fx = a < 1.25 ? 0.5 : 0.3; out.fy = a < 0.8 ? 0.5 : a < 1.25 ? 0.46 : 0.52;
}
// the Locker room: Foxino close up, turned by the player's finger; the kit panel beside him (wide) or under him (tall)
function rigLocker(out) {
  const a = innerWidth / innerHeight, d = a < 1 ? 5.4 : 2.75, A = LROOM.root ? LOCKER_AT : LOBBY;
  out.pos.set(A.x, A.y + 0.95, A.z + d); out.look.set(A.x, A.y + 0.68, A.z);
  out.fov = a < 1 ? 40 : 36; out.fx = a < 1 ? 0.5 : 0.31; out.fy = a < 1 ? 0.24 : 0.5;
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
  if (S.phase === 'locker') return rigLocker(out);
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
  S.roll = damp(S.roll, (S.powerK || 0) * 0.32, 6, dt); if (Math.abs(S.roll) > 0.001) camera.rotateZ(S.roll);   // (the power shot's tilt to the left)
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
    S.questions = qs; S.qi = -1; S.q = null; S.goals = 0; S.results = []; S.picks = []; S.streak = 0; S.lastPower = 0;
    ui.start.classList.add('hidden'); ui.end.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    $('playBtn').classList.remove('pulse');
    sfx.whistle();
    nextQuestion();
  });
}

function resetRound() {
  confetti.clear();
  S.st = 0; S.sub = ''; S.ev = {}; S.chosen = -1; S.nextShown = false; S.slow = 1; S.tRes = 0; S.sadYaw = null; S.power = false; wind.stop();
  fox.cel = null;
  fox.root.position.copy(FOX_START);
  fox.root.rotation.y = Math.atan2(SPOT.x - FOX_START.x, SPOT.z - FOX_START.z);
  fox.face('happy'); fox.apply(POSES.ready(0), Infinity, 0);
  ball.position.copy(SPOT); ball.rotation.set(0, 0, 0); ball.visible = true;
  rob.root.position.copy(KEEPER); rob.root.rotation.set(0, 0, 0);
  rob.dive.position.set(0, ROB_BODY_Y, 0); rob.dive.rotation.set(0, 0, 0);
  rob.face('happy'); rob.apply(RPOSES.ready(0), Infinity, 0);
  fox.root.rotation.x = 0; fox.root.rotation.z = 0;
  if (S.gk) {   // Foxino in goal, Rob on the spot
    fox.root.position.copy(KEEPER); fox.root.rotation.y = 0; fox.apply(KPOSE.ready(0), Infinity, 0);
    rob.root.position.copy(ROB_START); rob.root.rotation.y = Math.atan2(SPOT.x - ROB_START.x, SPOT.z - ROB_START.z);
  }
}

function nextQuestion() {
  S.qi++; S.gk = S.qi % 2 === 0;   // (2026-11-15, the user: "GK, GS, GK, GS…") keeper on 1, 3, 5, 7, 9; striker on 2, 4, 6, 8, 10
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
  if (S.phase !== 'aim' || k < 0 || k >= NB || !S.q.opts[k]) return;
  const q = S.q;
  S.chosen = k; S.isGoal = !!q.opts[k].ok;   // (in a keeper round: the right word = Foxino dives where the ball goes = a save)
  S.streak = S.isGoal ? S.streak + 1 : 0; if (!S.isGoal) S.lastPower = 0;
  // the POWER SHOT: a striker's right answer after three right answers in a row (counting the keeper's saves too)
  S.power = !S.gk && S.isGoal && S.streak - S.lastPower >= 3; if (S.power) S.lastPower = S.streak;
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
  if (S.gk) return planKeeperShot();
  const q = S.q, o = q.opts[S.chosen];
  const B = new THREE.Vector3(o.x, o.y, BUB_Z);
  const P0 = SPOT.clone();
  const mid = P0.clone().lerp(B, 0.5);
  const side = Math.abs(B.x) > 0.5 ? Math.sign(B.x) : (Math.random() < 0.5 ? -1 : 1);
  const P1 = S.power ? new THREE.Vector3(mid.x - side * 0.25, Math.max(P0.y, B.y) + 0.12, mid.z) : new THREE.Vector3(mid.x - side * (0.55 + Math.random() * 0.35), Math.max(P0.y, B.y) + 0.35 + 0.2 * Math.random(), mid.z);
  SHOT.P0 = P0; SHOT.P1 = P1; SHOT.B = B;
  SHOT.tRun = T_WAIT; SHOT.tKick = T_WAIT + T_RUN; SHOT.tContact = SHOT.tKick + CONTACT * T_KICK; SHOT.flight = S.power ? FLIGHT * 0.55 : FLIGHT; SHOT.tArrive = SHOT.tContact + SHOT.flight;   // (a power shot flies almost twice as fast)
  // the direction and speed at the bubble
  const d = new THREE.Vector3().subVectors(B, P1).multiplyScalar(2 / SHOT.flight);
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
// ---------- the keeper rounds (2026-11-15): Rob takes the penalty and always shoots at the bubble with the RIGHT word;
// Foxino dives to the bubble the player tapped, so the right word is a save and a wrong one lets the goal in ----------
function planKeeperShot() {
  const q = S.q, o = q.opts[q.correct], ch = q.opts[S.chosen];
  const B = new THREE.Vector3(o.x, o.y, BUB_Z), P0 = SPOT.clone(), mid = P0.clone().lerp(B, 0.5);
  const side = Math.abs(B.x) > 0.5 ? Math.sign(B.x) : (Math.random() < 0.5 ? -1 : 1);
  SHOT.P0 = P0; SHOT.P1 = new THREE.Vector3(mid.x - side * 0.5, Math.max(P0.y, B.y) + 0.3, mid.z); SHOT.B = B;
  SHOT.tRun = T_WAIT; SHOT.tKick = T_WAIT + T_RUN; SHOT.tContact = SHOT.tKick + CONTACT * T_KICK; SHOT.flight = FLIGHT; SHOT.tArrive = SHOT.tContact + FLIGHT;
  const d = new THREE.Vector3().subVectors(B, SHOT.P1).multiplyScalar(2 / FLIGHT); SHOT.vel = d.clone(); SHOT.speed = d.length(); SHOT.dir = d.clone().normalize();
  SHOT.dive = { t0: SHOT.tContact + 0.06, t1: SHOT.tArrive, kind: 'gk' };
  SHOT.fdive = { target: new THREE.Vector3(ch.x, ch.y, KEEPER.z + 0.35), t0: SHOT.tContact + 0.06, t1: SHOT.tArrive };
}
// Foxino's keeper poses: crouched with paws out; stretched out with both paws up
const KPOSE = {
  ready(t) { const p = POSES.ready(t); p.armL = [-0.3, 0, 1.0]; p.armR = [-0.3, 0, -1.0]; p.elbowL = [-0.7, 0, 0]; p.elbowR = [-0.7, 0, 0]; p.spine = [0.28, 0, 0]; p.head = [-0.18, 0, 0]; return p; },
  reach() { const p = POSES.stand(0); p.armL = [0, 0, 2.85]; p.armR = [0, 0, -2.85]; p.elbowL = [0, 0, 0]; p.elbowR = [0, 0, 0]; p.legL = [0, 0, 0.32]; p.legR = [0, 0, -0.18]; p.head = [-0.12, 0, 0]; return p; },
};
let FOX_REACH = null;   // how high his paws are above his feet with both arms up (measured once on the model)
function foxHands(out) {
  const B = fox.bones;
  if (B && B.LeftHand && B.RightHand) { fox.root.updateMatrixWorld(true); B.LeftHand.getWorldPosition(out); return out.add(B.RightHand.getWorldPosition(_v3)).multiplyScalar(0.5); }
  return out.copy(fox.root.position).add(_v3.set(0, 1.3, 0.2));
}
function foxKeeper(dt) {
  const t = S.time, st = S.st;
  if (FOX_REACH == null) { const save = fox.root.position.clone(); fox.root.position.set(0, 0, 0); fox.root.rotation.set(0, 0, 0); fox.apply(KPOSE.reach(), Infinity, 0); FOX_REACH = Math.max(0.9, foxHands(_v2).y); fox.root.position.copy(save); fox.apply(KPOSE.ready(t), Infinity, 0); }
  fox.root.rotation.y = 0;
  if (S.phase === 'aim' || st < SHOT.fdive.t0) { fox.root.position.set(KEEPER.x + Math.sin(t * 1.3) * 0.25, 0, KEEPER.z); fox.root.rotation.z = 0; fox.apply(KPOSE.ready(t), 8, dt); return; }
  const D = SHOT.fdive, T = D.target, start = D.start || (D.start = fox.root.position.clone());
  const dx = T.x - start.x, ty = T.y;
  const th = clamp(Math.atan2(-dx, Math.max(ty, 0.2)), -1.45, 1.45), L = FOX_REACH;
  const gx = T.x + L * Math.sin(th), gy = Math.max(0, ty - L * Math.cos(th));
  if (st < D.t1 + 0.05) {
    const e = easeOut(clamp((st - D.t0) / (D.t1 - D.t0), 0, 1));
    fox.root.position.set(lerp(start.x, gx, e), lerp(0, gy, e) + Math.sin(Math.PI * e) * 0.18, lerp(start.z, T.z, e));
    fox.root.rotation.z = th * e; fox.apply(KPOSE.reach(), 14 + 20 * e, dt); return;
  }
  // down on the grass, then up again: arms high with the ball (a save) or paws on his head (a goal let in)
  const a = st - D.t1, land = D.land || (D.land = { x: fox.root.position.x, y: fox.root.position.y, rz: fox.root.rotation.z });
  if (a < 0.45) { const e = easeIn(a / 0.45); fox.root.position.y = lerp(land.y, 0.18 * Math.abs(Math.sin(land.rz)), e); fox.root.rotation.z = lerp(land.rz, Math.sign(land.rz) * Math.min(Math.abs(land.rz) * 1.15, 1.5), e); if (a > 0.4 && !D.thud) { D.thud = 1; sfx.thud(); } fox.apply(KPOSE.reach(), 10, dt); return; }
  const e = smooth((a - 0.8) / 0.5);
  fox.root.rotation.z = lerp(Math.sign(land.rz) * Math.min(Math.abs(land.rz) * 1.15, 1.5), 0, e); fox.root.position.y = lerp(0.18 * Math.abs(Math.sin(land.rz)), 0, e);
  fox.root.position.x = lerp(land.x, land.x * 0.6, e);
  if (S.isGoal) fox.apply(e < 1 ? KPOSE.reach() : POSES.celebrate(a - 1.3), 8, dt); else fox.apply(e < 1 ? KPOSE.reach() : POSES.sad(a - 1.3), 6, dt);
}
// Rob as the penalty taker: a run-up and a strike with his right foot; a dance if he scores, oops if Foxino saves it
const RKICK = (u) => { const p = RPOSES.ready(0); p.body = [-0.15, 0, 0];
  const lx = u < 0.3 ? lerp(0, 0.95, smooth(u / 0.3)) : u < 0.45 ? lerp(0.95, -0.5, (u - 0.3) / 0.15) : lerp(-0.5, 0, smooth((u - 0.45) / 0.55));
  p.legR = [lx, 0, -0.1]; p.footR = [-0.2, 0, 0]; p.legL = [0.1, 0, 0.12]; p.armL = [0, 0, 0.9]; p.armR = [0, 0, -0.6]; return p; };
const RRUN = (ph) => { const p = RPOSES.ready(0); const s = Math.sin(ph); p.legL = [-0.7 * s, 0, 0.08]; p.legR = [0.7 * s, 0, -0.08]; p.armL = [0.6 * s, 0, 0.3]; p.armR = [-0.6 * s, 0, -0.3]; p.body = [-0.12, 0, 0]; return p; };
function robShooter(dt) {
  const t = S.time, st = S.phase === 'shot' ? S.st : 0;
  rob.dive.rotation.set(0, 0, 0);
  const bob = (h) => rob.dive.position.set(0, ROB_BODY_Y + h, 0);
  if (S.phase === 'aim' || st < SHOT.tRun) { rob.root.position.copy(ROB_START); rob.apply(RPOSES.ready(t), 6, dt); bob(0.02 * Math.abs(Math.sin(t * 2.6))); rob.face('focus'); return; }
  if (st < SHOT.tKick) {
    const u = (st - SHOT.tRun) / T_RUN, e = u * u * (1.6 - 0.6 * u);
    rob.root.position.set(lerp(ROB_START.x, KICK_AT.x, e) - Math.sin(Math.PI * e) * 0.25, 0, lerp(ROB_START.z, KICK_AT.z, e));
    rob.root.rotation.y = angDamp(rob.root.rotation.y, Math.atan2(SHOT.B.x * 0.3 - KICK_AT.x, -KICK_AT.z), 8, dt);
    const ph = e * Math.PI * 4.2; rob.apply(RRUN(ph), 16, dt); bob(0.06 * Math.abs(Math.sin(ph)));
    const step = Math.floor(ph / Math.PI); if (step !== S.ev.rstep) { S.ev.rstep = step; sfx.step(); }
    return;
  }
  const u = (st - SHOT.tKick) / T_KICK;
  if (u < 1.2) { rob.root.position.copy(KICK_AT); rob.apply(RKICK(Math.min(u, 1)), u < 0.1 ? 18 : 40, dt); bob(0); return; }
  { const k = smooth((u - 1.2) / 1.1); rob.root.position.set(lerp(KICK_AT.x, KICK_AT.x - 2.1, k), 0, lerp(KICK_AT.z, KICK_AT.z + 0.9, k)); }   // (he steps aside so the keeper can be seen)
  if (S.tRes) {
    const a = S.time - S.tRes;
    if (!S.isGoal) { rob.root.rotation.y = angDamp(rob.root.rotation.y, Math.atan2(camera.position.x - rob.root.position.x, camera.position.z - rob.root.position.z), 4, dt); rob.apply(RPOSES.wave(t), 8, dt); bob(0.12 * Math.abs(Math.sin(a * 7))); rob.face('happy'); }
    else { rob.apply(RPOSES.oops(a), 6, dt); bob(0); if (a > 0.6) rob.face('sad'); }
  } else { rob.apply(RPOSES.ready(t), 6, dt); bob(0); }
}
function onKeeperSave() {
  S.sub = 'gkSave'; S.tRes = S.time; S.goals++;
  S.results[S.qi] = 'stop';
  showBanner('SAVED!', 'goal');
  sfx.save(); setTimeout(() => sfx.cheer(), 120); S.cheer = 1; S.shake = 0.7;
  confetti.burst(_v.set(0, 0, 3), 10, 4.5); cfx.cannons();
  revealCard(true);
  bubbles.forEach((b, k) => { if (k !== S.chosen) { b.state = 'fade'; b.t = 0; } });
  labelEls.forEach((l, k) => { if (k !== S.chosen) l.classList.add('wrong'); });
  fox.face('happy'); rob.face('oops');
}
function onConcede() {
  S.sub = 'goal'; S.tRes = S.time;
  S.results[S.qi] = 'let';
  showBanner('GOAL…', 'saved');
  sfx.save(); setTimeout(() => sfx.aww(), 250); S.cheer = 0.2; S.shake = 0.5;
  revealCard(false);
  const r = S.q.correct;
  labelEls[r].classList.add('right');
  bubbles.forEach((b, k) => { if (k !== r && k !== S.chosen) { b.state = 'fade'; b.t = 0; } });
  labelEls.forEach((l, k) => { if (k !== r) l.classList.add('wrong'); });
  fox.face('sad'); rob.face('happy');
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
  if (t >= SHOT.tRun && !E.run) { E.run = 1; S.cheer = Math.max(S.cheer, S.power ? 0.8 : 0.35); if (S.power) { showBanner('POWER SHOT!', 'power'); sfx.whistle && sfx.whistle(true, 0); } }
  if (t >= SHOT.tContact && !E.kick) { E.kick = 1; sfx.kick(); S.shake = S.power ? 1.3 : 0.5; rob.face('focus'); if (S.power) { sfx.kick(); wind.start(); ui.banner.innerHTML = ''; } }
  if (t >= SHOT.tArrive && !E.pop) {
    // the ball reaches the bubble: pop!
    E.pop = 1;
    ball.position.copy(SHOT.B);
    const k = S.gk ? S.q.correct : S.chosen, b = bubbles[k];
    b.state = 'pop'; b.t = 0;
    labelEls[k].style.opacity = '0';
    sparks.emit(_v.set(b.x, b.y, BUB_Z), S.isGoal ? ['#ffffff', '#ffe066', '#6fe2ff', '#ff8fc4', '#7dffb0'] : ['#ffffff', '#c9d2e8', '#9aa6c0'], 70, 3.2, BUB_R);
    sfx.pop(S.isGoal);
    if (S.isGoal) { _c.copy(b.mesh.position).project(camera); cfx.pop((_c.x + 1) / 2 * innerWidth, (1 - _c.y) / 2 * innerHeight); }
    S.sub = S.gk ? (S.isGoal ? 'gkCatch' : 'toGoal') : (S.isGoal ? 'toGoal' : 'toSave');
    if (S.sub === 'gkCatch') { E.save = 1; onKeeperSave(); }
    BALLV.copy(SHOT.vel);
  }
  // the slow motion while the ball flies at the bubble
  const sm = S.power ? (t < SHOT.tKick - 0.3 ? 1 : t < SHOT.tContact ? 0.42 : t < SHOT.tContact + 0.04 ? 0.08 : 1) : (t > SHOT.tContact + 0.18 && t < SHOT.tArrive + 0.12 ? 0.45 : 1);
  S.slow = damp(S.slow, sm, 10, dt / Math.max(S.slow, 0.2));
  if (S.sub === 'toGoal' && (ball.position.z < -0.15 || t > SHOT.tArrive + 0.5) && !E.goal) { E.goal = 1; if (S.gk) onConcede(); else onGoal(); }
  if (S.sub === 'toSave' && t >= SHOT.tCatch && !E.save) { E.save = 1; onSave(); }
  // the result: then NEXT
  if (S.tRes && !S.nextShown && S.time - S.tRes > (S.isGoal ? 1.5 : 1.8)) {
    S.nextShown = true;
    ui.next.innerHTML = (S.qi + 1 >= QN ? 'RESULTS' : 'NEXT') + ' <span aria-hidden="true">&#9654;</span>';
    ui.next.classList.remove('hidden');
  }
  if (S.tRes && S.time - S.tRes > (S.isGoal ? 2.4 : 9)) advance();   // (2026-11-15) a goal or a save goes on to the next penalty by itself
}

// ---------- confetti on the screen (like the other Fugio games): a burst from the bubble the moment the right word is hit,
// then two cannons from the bottom corners on the GOAL; paper bits that flutter (they turn and flip), slow down in the
// air and fall softly; drawn on a canvas over the game at the screen's own resolution
const cfx = (() => {
  const cv = $('confetti'), g = cv.getContext('2d'); let bits = [], run = false, last = 0, W = 0, H = 0, dpr = 1;
  const COL = ['#ffcd1c', '#ff4f9a', '#8f52d9', '#3cc6ef', '#ff7d22', '#5bdc7a', '#ffffff'];
  const fit = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
  addEventListener('resize', fit); fit();
  const bit = (x, y, a, sp) => { const v = sp * (0.55 + Math.random() * 0.6), s = Math.min(W, H) / 720;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 14, f: Math.random() * 6.3, vf: 6 + Math.random() * 8,
      w: (8 + Math.random() * 7) * s, h: (4 + Math.random() * 4) * s, c: COL[(Math.random() * COL.length) | 0], life: 2.6 + Math.random() * 1.4, rib: Math.random() < 0.18, sway: Math.random() * 6.3 }; };
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.life -= dt; b.vx *= Math.exp(-1.8 * dt); b.vy = b.vy * Math.exp(-1.8 * dt) + 900 * dt * (H / 900);
      b.vy = Math.min(b.vy, 260 * (H / 900)); b.sway += dt * 3; b.x += (b.vx + Math.sin(b.sway) * 40) * dt; b.y += b.vy * dt; b.r += b.vr * dt; b.f += b.vf * dt;
      const a = Math.min(1, b.life / 0.6); if (a <= 0) continue;
      g.save(); g.globalAlpha = a; g.translate(b.x, b.y); g.rotate(b.r); g.scale(1, Math.cos(b.f)); g.fillStyle = b.c;
      if (b.rib) { g.fillRect(-b.w, -b.h / 4, b.w * 2, b.h / 2); } else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    bits = bits.filter((b) => b.life > 0 && b.y < H + 40);
    if (bits.length) requestAnimationFrame(step); else { run = false; g.clearRect(0, 0, W, H); }
  }
  const go = () => { if (!run) { run = true; last = performance.now(); requestAnimationFrame(step); } };
  return {
    pop(x, y, n = 90) { for (let i = 0; i < n; i++) bits.push(bit(x, y, Math.random() * Math.PI * 2, 520 + Math.random() * 260)); go(); },
    cannons(n = 110) { for (const [x, a] of [[0, -1.05], [W, -Math.PI + 1.05]]) for (let i = 0; i < n; i++) bits.push(bit(x, H + 10, a + (Math.random() - 0.5) * 0.55, 1150 * (H / 900))); go(); },
    clear() { bits = []; },
  };
})();

function onGoal() {
  S.sub = 'goal'; S.tRes = S.time; S.goals++;
  S.results[S.qi] = 'goal';
  showBanner('GOAL!', 'goal');
  sfx.cheer(); S.cheer = 1; S.shake = 0.9;
  confetti.burst(_v.set(0, 0, 3), 10, 4.5); cfx.cannons();
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
  setPhase('end'); S.gk = false;
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
    if (S.results[i] !== 'save' && S.results[i] !== 'let') return;
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
  if (p === 'locker') {
    fox.root.position.copy(LROOM.root ? LOCKER_AT : LOBBY);
    if (!LK.drag) { LK.yaw += LK.vel * dt; LK.vel *= Math.exp(-2.5 * dt); }   // (a flick keeps him turning a little)
    if (!LK.drag && Math.abs(LK.vel || 0) < 0.05) LK.yaw = angDamp(LK.yaw, LK.home, 0.6, dt);
    fox.root.rotation.y = LK.yaw;
    const cheer = S.time - LK.t < 1.2;
    fox.apply(cheer ? POSES.celebrate(S.time - LK.t) : POSES.stand(t), cheer ? 10 : 6, dt);
    fox.tailAmp = 1;
  } else if (p === 'menu' || p === 'loading') {
    fox.root.position.copy(LOBBY); fox.root.rotation.y = 0;
    const J = 0.66, n = Math.floor(S.time / J), u = (S.time / J) % 1, next = n % 2 ? 1 : -1;
    fox.apply(POSES.juggle(u, next, t), 14, dt);
    fox.tailAmp = 1;
  } else if (S.gk && (p === 'aim' || p === 'shot')) {
    foxKeeper(dt);
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
  if (S.gk && (p === 'aim' || p === 'shot')) { robShooter(dt); rob.update(dt, t); return; }
  if (p === 'menu' || p === 'loading' || p === 'locker' || p === 'end' || p === 'aim' || (p === 'shot' && S.st < SHOT.dive.t0)) {
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
  if ((S.closeup || S.debugPose) && (p === 'menu' || p === 'loading') || p === 'locker') { const A = p === 'locker' && LROOM.root ? LOCKER_AT : LOBBY; ball.position.set(A.x + 0.5, A.y + BALL_R, A.z + 0.35); return; }
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
    const u = clamp((st - SHOT.tContact) / SHOT.flight, 0, 1);
    const prev = _bq.copy(ball.position);
    bez(u, ball.position);
    spinBall(_bp.subVectors(ball.position, prev).divideScalar(Math.max(dt, 1e-3)), dt);
    if (S.power && dt > 0) BALLV.copy(_bp);
    return;
  }
  if (S.gk && S.isGoal && st >= SHOT.tArrive) { foxHands(_bp); ball.position.lerp(_bp, st < SHOT.tArrive + 0.1 ? 0.5 : 1); return; }
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
  for (let k = 0; k < NB; k++) {
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
  for (let k = 0; k < NB; k++) {
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
    const colPx = (r / Math.max(b.mesh.scale.x, 0.01)) * GAP * 1.05;
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
  foxBlob.position.set(fox.root.position.x, fox.root.position.y + 0.012, fox.root.position.z);
  foxBlob.scale.setScalar(1 - clamp(fox.pose.y, 0, 0.4));
  rob.dive.getWorldPosition(_v);
  robBlob.position.set(_v.x, 0.013, _v.z);
  const ry = clamp((_v.y - ROB_BODY_Y) / 1.5, 0, 0.6);
  robBlob.scale.set(1 - ry + Math.abs(Math.sin(rob.dive.rotation.z)) * 0.5, 1 - ry, 1);
  ballBlob.position.set(ball.position.x, 0.014, ball.position.z);
  const bh = clamp((ball.position.y - BALL_R) / 2.5, 0, 1);
  ballBlob.scale.setScalar(1 + bh); ballBlob.material.opacity = 0.5 * (1 - bh * 0.8);
  ballBlob.visible = ball.visible && ball.position.y > -1;   // (not in the Locker room under the pitch)
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
  stadium.update(dt, S.time); wind.update(dt, S.time);
  confetti.update(dt);
  sparks.update(dt);
  S.shake = Math.max(0, S.shake - rdt * 2.4);
  drawFrame();
  // lower the resolution on slow devices (never raise it again)
  if (rdt > 0 && !S.paused) { frames++; if (rdt > 1 / 38) slowFrames++; }
  if (frames >= 90) {
    if (slowFrames > 45 && GFX.level > 0) GFX.level--;   // (the new look goes first, then the resolution)
    else if (slowFrames > 45 && pr > 1) { pr = Math.max(1, pr - 0.25); resize(); }
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
    chosen: S.chosen, nextShown: S.nextShown, net: +stadium.net.dent.toFixed(3), st: +S.st.toFixed(2), since: S.tRes ? +(S.time - S.tRes).toFixed(2) : 0, time: +S.time.toFixed(2), keeper: rob.expression, fov: +camera.fov.toFixed(2), pixelRatio: pr, gfx: GFX.level,
    packs: packIds.slice(), endStars: S.endStars,
  }),
  start: (ids) => { if (ids) { packIds = ids; renderPack(); } unlock(); startGame(); return true; },
  // tap the right bubble (or a wrong one)
  answer: (right = true) => {
    if (S.phase !== 'aim') return false;
    const k = right ? S.q.correct : (S.q.correct + 1 + Math.floor(Math.random() * (NB - 1))) % NB;
    choose(k); return k;
  },
  next: () => { advance(); return true; },
  bubbles: () => labelEls.map((el, k) => ({ word: el.dataset.word, right: S.q ? k === S.q.correct : false, opacity: +el.style.opacity, rect: el.getBoundingClientRect().toJSON() })),
  timeScale: (k) => { S.timeScale = k; },
  gfx: (l) => { GFX.level = l; return true; },
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
