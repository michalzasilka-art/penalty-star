// Foxino in his football kit, built from smooth shapes in code (no model file).
// Fixed traits: a purple-and-orange fox with green eyes, a yellow jersey (purple collar and trim, number 10 on the back),
// orange shorts, purple socks, football boots.
// Local frame: +Y up, +Z his front, +X his left. The root stands on the ground.
import * as THREE from './lib/three.module.min.js';
import { toon, add, group, sphere, capsule, taperTube, aimLimb, mergeStatic, clamp, lerp, smooth, damp } from './mat.js';

const C = {
  fur: 0x8f52d9, furDark: 0x6a36b4, orange: 0xff7d22, cream: 0xfff1df, jersey: 0xffcd1c, trim: 0x5b2bb0,
  shorts: 0xff7316, sock: 0x5b2bb0, boot: 0x1f1d2e, sole: 0xff9a1f, nose: 0x3d1d1c, iris: 0x22b866, pupil: 0x0d1414,
  mouth: 0x5a1626, tongue: 0xff7a8a,
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// the head's fur pattern, painted on an equirectangular canvas (u = 0.25 is his face, u = 0.5 his left side)
function headTexture() {
  const W = 512, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#8f52d9'; g.fillRect(0, 0, W, H);
  // a soft darker purple at the back of the head
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, 'rgba(70,30,140,.25)'); bg.addColorStop(0.25, 'rgba(70,30,140,0)'); bg.addColorStop(0.5, 'rgba(70,30,140,0)'); bg.addColorStop(0.75, 'rgba(70,30,140,.3)'); bg.addColorStop(1, 'rgba(70,30,140,.25)');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const U = (u) => u * W, V = (t) => t * H; // t = theta / pi (0 top, 1 bottom)
  // cream lower face and cheeks, with a spiky edge
  g.fillStyle = '#fff1df';
  g.beginPath();
  g.moveTo(U(0.04), V(1));
  const pts = [[0.04, 0.78], [0.07, 0.66], [0.095, 0.71], [0.12, 0.6], [0.15, 0.66], [0.18, 0.585], [0.215, 0.6], [0.25, 0.575], [0.285, 0.6], [0.32, 0.585], [0.35, 0.66], [0.38, 0.6], [0.405, 0.71], [0.43, 0.66], [0.46, 0.78]];
  for (const [u, t] of pts) g.lineTo(U(u), V(t));
  g.lineTo(U(0.46), V(1)); g.closePath(); g.fill();
  // the orange stripe: from the top of his head down between his eyes to the nose, a little to his left
  g.fillStyle = '#ff7d22';
  g.beginPath();
  g.moveTo(U(0.2), V(0));
  g.bezierCurveTo(U(0.21), V(0.12), U(0.235), V(0.3), U(0.245), V(0.42));
  g.bezierCurveTo(U(0.25), V(0.5), U(0.252), V(0.56), U(0.255), V(0.6));
  g.lineTo(U(0.3), V(0.6));
  g.bezierCurveTo(U(0.3), V(0.5), U(0.33), V(0.44), U(0.335), V(0.36));
  g.bezierCurveTo(U(0.34), V(0.22), U(0.36), V(0.1), U(0.37), V(0));
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// the jersey: yellow with purple side stripes and hem; FOXINO and a big 10 on the back (u = 0.5), a crest on the left chest
function jerseyTexture() {
  const W = 1024, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#ffcd1c'; g.fillRect(0, 0, W, H);
    // subtle fabric shading
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(160,90,0,.10)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    // purple side panels
    g.fillStyle = '#5b2bb0';
    for (const u of [0.25, 0.75]) g.fillRect(u * W - 16, 0, 32, H);
    g.fillStyle = '#ff7d22';
    for (const u of [0.25, 0.75]) { g.fillRect(u * W - 22, 0, 6, H); g.fillRect(u * W + 16, 0, 6, H); }
    // hem
    g.fillStyle = '#5b2bb0'; g.fillRect(0, H - 22, W, 22);
    // back: name and number
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.font = '64px "Lilita One", "Arial Black", sans-serif';
    g.lineWidth = 10; g.strokeStyle = '#fff6d0'; g.strokeText('FOXINO', W * 0.5, H * 0.25);
    g.fillStyle = '#5b2bb0'; g.fillText('FOXINO', W * 0.5, H * 0.25);
    g.font = '230px "Lilita One", "Arial Black", sans-serif';
    g.lineWidth = 22; g.strokeStyle = '#ff7d22'; g.strokeText('10', W * 0.5, H * 0.66);
    g.lineWidth = 10; g.strokeStyle = '#fff6d0'; g.strokeText('10', W * 0.5, H * 0.66);
    g.fillStyle = '#5b2bb0'; g.fillText('10', W * 0.5, H * 0.66);
    // front: a small crest (his left chest) and a small 10 on the right
    g.fillStyle = '#5b2bb0';
    g.beginPath(); g.arc(W * 0.07, H * 0.34, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff7d22'; g.beginPath(); g.arc(W * 0.07, H * 0.34, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6d0'; g.font = '30px "Lilita One", "Arial Black", sans-serif'; g.fillText('F', W * 0.07, H * 0.34 + 11);
    g.fillStyle = '#5b2bb0'; g.font = '62px "Lilita One", "Arial Black", sans-serif'; g.fillText('10', W * 0.93, H * 0.36);
  };
  draw();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (document.fonts && document.fonts.load) document.fonts.load('64px "Lilita One"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

const JOINTS = ['hips', 'spine', 'neck', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'ankleL', 'legR', 'kneeR', 'ankleR'];
export function blankPose() { const p = { y: 0, tail: 0 }; for (const j of JOINTS) p[j] = [0, 0, 0]; return p; }

export function makeFoxino() {
  const M = {
    fur: toon(C.fur, { rough: 0.75 }), furDark: toon(C.furDark, { rough: 0.8 }), orange: toon(C.orange, { rough: 0.75 }), cream: toon(C.cream, { rough: 0.8, rim: 0.25 }),
    head: toon(0xffffff, { rough: 0.75, map: headTexture() }),
    jersey: toon(0xffffff, { rough: 0.58, map: jerseyTexture() }), jerseyPlain: toon(C.jersey, { rough: 0.58 }), trim: toon(C.trim, { rough: 0.55 }),
    shorts: toon(C.shorts, { rough: 0.55 }), sock: toon(C.sock, { rough: 0.7 }), sockBand: toon(C.jersey, { rough: 0.6 }),
    boot: toon(C.boot, { rough: 0.35, rim: 0.3 }), sole: toon(C.sole, { rough: 0.5 }), stud: toon(0xf2f2f2, { rough: 0.4 }),
    eye: toon(0xffffff, { rough: 0.25, rim: 0.1 }), iris: toon(C.iris, { rough: 0.25, rim: 0, emissive: 0x0a3d20 }), pupil: toon(C.pupil, { rough: 0.2, rim: 0 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }), nose: toon(C.nose, { rough: 0.25, rim: 0.2 }),
    mouth: toon(C.mouth, { rough: 0.6, rim: 0 }), tongue: toon(C.tongue, { rough: 0.6, rim: 0 }), tooth: toon(0xffffff, { rough: 0.4, rim: 0 }),
    brow: toon(0x3a1d66, { rough: 0.7, rim: 0 }), tail: toon(0xffffff, { rough: 0.8, vc: true }),
  };
  const root = new THREE.Group(); root.name = 'foxino';
  const body = group(root, [0, 0, 0], 'body');
  const J = {};
  // ---------- hips and shorts ----------
  const hips = J.hips = group(body, [0, 0.5, 0]);
  const shortsProf = [[0.0, -0.075], [0.11, -0.072], [0.155, -0.06], [0.158, -0.03], [0.14, 0.0], [0.12, 0.03]];
  add(hips, new THREE.LatheGeometry(shortsProf.map(([r, y]) => new THREE.Vector2(r, y)), 24), M.shorts, [0, 0, 0], [1, 1, 0.84]);
  // purple side stripes on the shorts
  for (const s of [1, -1]) add(hips, capsule(0.012, 0.12, 4, 8), M.trim, [0.155 * s, -0.005, 0], null, [0, 0, 0.06 * s]);
  // ---------- legs ----------
  const shortLeg = new THREE.CylinderGeometry(0.07, 0.083, 0.13, 14, 1, true);
  const shortHem = new THREE.TorusGeometry(0.08, 0.011, 6, 20);
  function leg(side) {
    const s = side === 'L' ? 1 : -1;
    const l = J['leg' + side] = group(hips, [0.078 * s, -0.04, 0]);
    add(l, shortLeg, M.shorts, [0, -0.045, 0]);
    add(l, shortHem, M.trim, [0, -0.108, 0], null, [Math.PI / 2, 0, 0]);
    add(l, capsule(0.048, 0.11), M.fur, [0, -0.1, 0]);
    const k = J['knee' + side] = group(l, [0, -0.19, 0]);
    add(k, sphere(0.047), M.fur, [0, 0, 0]);
    add(k, capsule(0.045, 0.11), M.sock, [0, -0.095, 0]);
    add(k, new THREE.TorusGeometry(0.047, 0.012, 6, 20), M.sockBand, [0, -0.035, 0], null, [Math.PI / 2, 0, 0]);
    const a = J['ankle' + side] = group(k, [0, -0.19, 0]);
    // the boot: a rounded shoe with an orange sole, a stripe and studs
    add(a, sphere(1), M.boot, [0, -0.028, 0.04], [0.058, 0.05, 0.11]);
    add(a, sphere(1), M.boot, [0, -0.005, -0.005], [0.052, 0.055, 0.06]);
    add(a, sphere(1), M.sole, [0, -0.06, 0.04], [0.06, 0.018, 0.112]);
    add(a, capsule(0.009, 0.08, 4, 8), M.sole, [0.05 * s, -0.022, 0.035], null, [Math.PI / 2 - 0.25, 0, 0]);
    for (const z of [-0.02, 0.05, 0.11]) add(a, sphere(0.012, 6, 4), M.stud, [0, -0.076, z]);
    return l;
  }
  leg('L'); leg('R');
  // ---------- tail: one fluffy tapered tube, purple with orange bands and a cream tip, curling up on his right ----------
  const tail = group(hips, [-0.05, -0.01, -0.11]);
  tail.scale.setScalar(0.88);
  const cP = new THREE.Color(C.fur), cO = new THREE.Color(C.orange), cC = new THREE.Color(C.cream), tc = new THREE.Color();
  const band = (t) => {
    const st = [[0, cP], [0.34, cP], [0.4, cO], [0.5, cO], [0.56, cP], [0.64, cP], [0.7, cO], [0.78, cO], [0.84, cC], [1, cC]];
    for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const [t0, c0] = st[i - 1], [t1, c1] = st[i]; return tc.copy(c0).lerp(c1, (t - t0) / (t1 - t0 || 1)).clone(); }
    return cC.clone();
  };
  const tailGeo = taperTube([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.04, 0.02, -0.09), new THREE.Vector3(-0.13, 0.08, -0.17),
    new THREE.Vector3(-0.24, 0.2, -0.2), new THREE.Vector3(-0.3, 0.36, -0.17), new THREE.Vector3(-0.29, 0.5, -0.1), new THREE.Vector3(-0.22, 0.6, -0.04),
  ], (t) => 0.03 + 0.085 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15 * 0.85), 44, 18, band);
  add(tail, tailGeo, M.tail);
  const tailSegs = [tail];
  // ---------- torso (jersey) ----------
  const spine = J.spine = group(hips, [0, 0.03, 0]);
  const prof = [[0.0, -0.075], [0.162, -0.08], [0.168, -0.066], [0.158, -0.02], [0.145, 0.06], [0.148, 0.15], [0.15, 0.21], [0.138, 0.265], [0.11, 0.305], [0.075, 0.33], [0.055, 0.34]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  add(spine, lathe, M.jersey, [0, 0, 0], [1, 1, 0.84]);
  add(spine, new THREE.TorusGeometry(0.062, 0.016, 6, 20), M.trim, [0, 0.334, 0.004], [1, 1, 0.88], [Math.PI / 2 + 0.12, 0, 0]);
  // ---------- arms ----------
  const sleeve = new THREE.CylinderGeometry(0.048, 0.054, 0.1, 14, 1, true);
  function arm(side) {
    const s = side === 'L' ? 1 : -1;
    const a = J['arm' + side] = group(spine, [0.14 * s, 0.265, 0]);
    add(a, sphere(0.056), M.jerseyPlain, [0, -0.005, 0]);
    add(a, sleeve, M.jerseyPlain, [0, -0.05, 0]);
    add(a, new THREE.TorusGeometry(0.052, 0.011, 6, 20), M.trim, [0, -0.1, 0], null, [Math.PI / 2, 0, 0]);
    add(a, capsule(0.03, 0.11), M.fur, [0, -0.1, 0]);
    const e = J['elbow' + side] = group(a, [0, -0.17, 0]);
    add(e, sphere(0.03), M.fur, [0, 0, 0]);
    add(e, capsule(0.029, 0.11), M.fur, [0, -0.065, 0]);
    // the paw: a small mitten with a thumb
    add(e, sphere(1), M.fur, [0, -0.15, 0.004], [0.04, 0.047, 0.034]);
    add(e, sphere(1), M.fur, [0.026 * s, -0.135, 0.024], [0.016, 0.024, 0.016]);
    return a;
  }
  arm('L'); arm('R');
  // ---------- neck and head ----------
  const neck = J.neck = group(spine, [0, 0.33, 0]);
  add(neck, capsule(0.05, 0.04), M.fur, [0, 0.02, 0]);
  const head = J.head = group(neck, [0, 0.17, 0.0]);
  add(head, sphere(0.21, 32, 22), M.head, [0, 0, 0], [1.1, 0.96, 0.98]);
  // cheek fluff: small cream tufts pointing out and down
  const tuft = new THREE.ConeGeometry(0.042, 0.12, 10);
  for (const s of [1, -1]) {
    add(head, tuft, M.cream, [0.2 * s, -0.075, 0.03], [1, 1, 0.6], [0, 0, (Math.PI / 2 + 0.6) * s]);
    add(head, tuft, M.cream, [0.175 * s, -0.115, 0.055], [0.75, 0.8, 0.55], [0.2, 0, (Math.PI / 2 + 0.95) * s]);
    add(head, tuft, M.fur, [0.215 * s, -0.025, -0.02], [0.7, 0.7, 0.5], [0, 0, (Math.PI / 2 + 0.3) * s]);
  }
  // the muzzle: cream, with an orange stripe on top and a dark nose
  add(head, sphere(1), M.cream, [0, -0.08, 0.145], [0.1, 0.075, 0.1]);
  add(head, sphere(1), M.cream, [0, -0.064, 0.2], [0.066, 0.054, 0.068]);
  add(head, sphere(1), M.orange, [0.01, -0.03, 0.195], [0.036, 0.026, 0.062], [-0.38, 0, 0]);
  add(head, sphere(1), M.nose, [0, -0.032, 0.262], [0.032, 0.025, 0.025]);
  add(head, sphere(0.007, 8, 6), M.shine, [-0.01, -0.02, 0.284]);
  // mouth: an open smile
  const mouthOpen = group(head, [0, -0.105, 0.2]);
  add(mouthOpen, sphere(1), M.mouth, [0, 0, 0.02], [0.046, 0.026, 0.03]);
  add(mouthOpen, sphere(1), M.tongue, [0, -0.011, 0.027], [0.028, 0.012, 0.02]);
  add(mouthOpen, new THREE.ConeGeometry(0.007, 0.018, 8), M.tooth, [0.024, 0.016, 0.04], null, [Math.PI, 0, 0]);
  add(mouthOpen, new THREE.ConeGeometry(0.007, 0.018, 8), M.tooth, [-0.024, 0.016, 0.04], null, [Math.PI, 0, 0]);
  const mouthSad = group(head, [0, -0.118, 0.228]);
  add(mouthSad, new THREE.TorusGeometry(0.026, 0.007, 8, 18, Math.PI), M.mouth, [0, -0.012, 0], null, [0, 0, 0]);
  mouthSad.visible = false;
  // eyes: big whites set into the face, large green irises, black pupils, highlights
  const eyes = [];
  for (const s of [1, -1]) {
    const eg = group(head, [0.076 * s, 0.018, 0.17]);
    eg.rotation.set(-0.06, 0.34 * s, 0);
    add(eg, sphere(1, 18, 12), M.eye, [0, 0, 0], [0.056, 0.066, 0.034]);
    const iris = add(eg, sphere(1, 14, 10), M.iris, [-0.005 * s, -0.004, 0.024], [0.039, 0.045, 0.014]);
    add(eg, sphere(1, 10, 8), M.pupil, [-0.005 * s, -0.004, 0.033], [0.02, 0.024, 0.007]);
    add(eg, sphere(1, 8, 6), M.shine, [-0.015 * s + 0.012, 0.016, 0.038], [0.009, 0.009, 0.004]);
    add(eg, sphere(1, 8, 6), M.shine, [0.002 * s + 0.006, -0.017, 0.037], [0.004, 0.004, 0.003]);
    // an eyebrow
    add(head, capsule(0.009, 0.048, 4, 8), M.brow, [0.08 * s, 0.105, 0.18], null, [0.15, 0.32 * s, (Math.PI / 2 + 0.22) * s]);
    eyes.push(eg); iris.userData.base = iris.scale.clone();
  }
  // ears: tall purple cones with orange insides
  const ears = [];
  const earGeo = new THREE.ConeGeometry(0.085, 0.26, 14);
  const innerGeo = new THREE.ConeGeometry(0.058, 0.18, 12);
  for (const s of [1, -1]) {
    const e = group(head, [0.125 * s, 0.13, -0.02]);
    e.rotation.set(-0.12, 0, -0.42 * s);
    add(e, earGeo, M.fur, [0, 0.12, 0], [1, 1, 0.48]);
    add(e, innerGeo, M.orange, [0, 0.1, 0.022], [1, 1, 0.3]);
    ears.push(e);
  }
  // the orange hair: a swoosh of tapered locks from the crown, curling forward over his forehead to his left
  const lock = (pts, r) => add(head, taperTube(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), (t) => r * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)) + 0.004, 16, 10), M.orange);
  lock([[-0.03, 0.16, -0.08], [-0.01, 0.24, -0.02], [0.03, 0.27, 0.06], [0.08, 0.24, 0.13], [0.11, 0.18, 0.16]], 0.055);
  lock([[-0.06, 0.15, -0.04], [-0.04, 0.23, 0.02], [0.0, 0.25, 0.09], [0.03, 0.21, 0.15]], 0.04);
  lock([[0.02, 0.15, -0.1], [0.06, 0.22, -0.05], [0.11, 0.23, 0.03], [0.15, 0.18, 0.08]], 0.035);

  mergeStatic(root);
  // ---------- pose state ----------
  const cur = blankPose();
  const fox = {
    root, body, J, eyes, ears, tailSegs,
    pose: cur, blink: 0, nextBlink: 2 + Math.random() * 2, expression: 'happy', tailAmp: 1,
    face(kind) {
      fox.expression = kind;
      mouthOpen.visible = kind !== 'sad';
      mouthSad.visible = kind === 'sad';
    },
    // ease every joint toward the target pose (k = Infinity snaps)
    apply(P, k, dt) {
      const a = k === Infinity ? 1 : 1 - Math.exp(-k * dt);
      for (const j of JOINTS) {
        const c = cur[j], t = P[j];
        c[0] += (t[0] - c[0]) * a; c[1] += (t[1] - c[1]) * a; c[2] += (t[2] - c[2]) * a;
        J[j].rotation.set(c[0], c[1], c[2], j === 'armL' || j === 'armR' ? 'ZXY' : 'XYZ');
      }
      cur.y += (P.y - cur.y) * a;
      cur.tail += ((P.tail || 0) - cur.tail) * a;
      body.position.y = cur.y;
    },
    update(dt, t) {
      // blink
      fox.nextBlink -= dt;
      if (fox.nextBlink < 0) { fox.blink = 0.14; fox.nextBlink = 2.2 + Math.random() * 3; }
      fox.blink = Math.max(0, fox.blink - dt);
      const lid = fox.blink > 0 ? 0.12 : fox.expression === 'sad' ? 0.75 : 1;
      for (const e of eyes) e.scale.y = damp(e.scale.y, lid, 30, dt);
      // the tail sways
      const tg = tailSegs[0];
      tg.rotation.z = fox.tailAmp * 0.18 * Math.sin(t * 3.1) + cur.tail * 0.12;
      tg.rotation.x = fox.tailAmp * 0.08 * Math.sin(t * 2.3);
      tg.rotation.y = 0.12 * Math.sin(t * 1.7);
      for (let i = 0; i < 2; i++) ears[i].rotation.z = (i ? 0.42 : -0.42) + 0.04 * Math.sin(t * 2 + i);
    },
    // world position of a foot (for the ball while juggling)
    foot(side, out) { return J['ankle' + side].getWorldPosition(out); },
  };
  fox.face('happy');
  fox.apply(POSES.stand(0), Infinity, 0);
  return fox;
}

// ---------- the pose library: each returns a target pose ----------
const bump = (x) => Math.max(0, Math.sin(Math.PI * clamp(x, 0, 1)));
const SAD_L = aimLimb([0.5, 0.85, 0.12], [-0.25, 1, 0.12]), SAD_R = aimLimb([-0.5, 0.85, 0.12], [0.25, 1, 0.12]);
export const POSES = {
  stand(t) {
    const p = blankPose();
    const br = Math.sin(t * 2.2);
    p.y = 0.005 * br;
    p.armL = [0.05, 0, 0.14 + 0.02 * br]; p.armR = [0.05, 0, -0.14 - 0.02 * br];
    p.elbowL = [-0.3, 0, 0]; p.elbowR = [-0.3, 0, 0];
    p.legL = [0, 0, 0.03]; p.legR = [0, 0, -0.03];
    p.head = [0.02 * Math.sin(t * 0.9), 0.08 * Math.sin(t * 0.5), 0.04 * Math.sin(t * 0.7)];
    return p;
  },
  // a bouncy "ready" idle on the toes before the run-up
  ready(t) {
    const p = POSES.stand(t);
    const b = Math.abs(Math.sin(t * 4.2));
    p.y = -0.02 + 0.03 * b;
    p.legL = [-0.12, 0, 0.04]; p.kneeL = [0.24 - 0.1 * b, 0, 0]; p.ankleL = [-0.1, 0, 0];
    p.legR = [-0.12, 0, -0.04]; p.kneeR = [0.24 - 0.1 * b, 0, 0]; p.ankleR = [-0.1, 0, 0];
    p.spine = [0.1, 0, 0];
    p.armL = [-0.15, 0, 0.22 + 0.05 * b]; p.armR = [-0.15, 0, -0.22 - 0.05 * b];
    p.elbowL = [-0.9, 0, 0]; p.elbowR = [-0.9, 0, 0];
    p.head = [-0.08, 0, 0];
    return p;
  },
  // ph: the stride phase in radians
  run(ph, amt = 1) {
    const p = blankPose(), s = Math.sin(ph), c = Math.cos(ph);
    p.y = -0.03 + 0.05 * Math.abs(c) * amt;
    p.legL = [-0.85 * s * amt, 0, 0.02]; p.legR = [0.85 * s * amt, 0, -0.02];
    p.kneeL = [0.25 + 1.0 * Math.max(0, -Math.sin(ph - 1.0)) * amt, 0, 0];
    p.kneeR = [0.25 + 1.0 * Math.max(0, Math.sin(ph - 1.0)) * amt, 0, 0];
    p.ankleL = [0.1, 0, 0]; p.ankleR = [0.1, 0, 0];
    p.armL = [0.75 * s * amt, 0, 0.2]; p.armR = [-0.75 * s * amt, 0, -0.2];
    p.elbowL = [-1.25, 0, 0]; p.elbowR = [-1.25, 0, 0];
    p.spine = [0.2 * amt, 0.12 * s * amt, 0]; p.head = [-0.12 * amt, -0.1 * s * amt, 0];
    p.hips = [0, -0.1 * s * amt, 0];
    p.tail = s;
    return p;
  },
  // u: 0 → 1 over the kick; the ball is struck at u = 0.45 (by the right foot)
  kick(u) {
    const p = blankPose();
    const wind = smooth(u / 0.32), strike = smooth((u - 0.32) / 0.14), follow = smooth((u - 0.46) / 0.3), settle = smooth((u - 0.75) / 0.25);
    // right leg: back and bent, then whips through and follows through high
    p.legR = [lerp(lerp(0.2, 1.0, wind), -1.25, strike) + 0.35 * follow * (1 - settle) - 0.0 * settle + settle * 0.9, 0, -0.08];
    p.kneeR = [lerp(lerp(0.3, 1.75, wind), 0.12, strike) + 0.25 * settle, 0, 0];
    p.ankleR = [lerp(0.2, -0.45, strike), 0, 0];
    // left (plant) leg
    p.legL = [lerp(-0.4, -0.15, wind) + 0.1 * follow, 0, 0.08]; p.kneeL = [lerp(0.4, 0.45, strike), 0, 0]; p.ankleL = [0.1, 0, 0];
    p.y = -0.05 - 0.02 * strike + 0.05 * follow * (1 - settle);
    // arms out for balance
    p.armL = [lerp(-0.2, -0.75, wind), 0, lerp(0.3, 1.25, wind)]; p.elbowL = [-0.5, 0, 0];
    p.armR = [lerp(0.3, 0.8, wind) - 0.9 * strike, 0, lerp(-0.3, -0.85, wind)]; p.elbowR = [-0.6, 0, 0];
    p.spine = [lerp(0.15, -0.1, wind) + 0.3 * strike - 0.15 * settle, lerp(0, 0.35, wind) - 0.6 * strike + 0.25 * settle, lerp(0, 0.18, wind) - 0.1 * strike];
    p.hips = [0, lerp(0, -0.3, wind) + 0.6 * strike - 0.3 * settle, 0];
    p.head = [0.15, -0.1 * wind + 0.15 * strike, 0];
    p.tail = -1 + 2 * strike;
    return p;
  },
  // t: seconds since the goal (he has turned to face the camera)
  celebrate(t) {
    const p = blankPose();
    const hop = Math.max(0, Math.sin(t * 7.5)), land = 1 - hop;
    p.y = 0.2 * hop;
    p.legL = [-0.35 * hop, 0, 0.12]; p.kneeL = [0.8 * hop + 0.2 * land, 0, 0];
    p.legR = [-0.35 * hop, 0, -0.12]; p.kneeR = [0.8 * hop + 0.2 * land, 0, 0];
    p.ankleL = [0.3 * hop, 0, 0]; p.ankleR = [0.3 * hop, 0, 0];
    const pump = Math.sin(t * 7.5 + 1.2);
    p.armL = [-0.25, 0, 2.55 + 0.2 * pump]; p.armR = [-0.25, 0, -2.55 - 0.2 * pump];
    p.elbowL = [-0.45 - 0.35 * pump, 0, 0]; p.elbowR = [-0.45 + 0.35 * pump, 0, 0];
    p.spine = [-0.18, 0, 0.05 * Math.sin(t * 3.7)]; p.head = [-0.3, 0.15 * Math.sin(t * 3), 0.1 * Math.sin(t * 3.7)];
    p.tail = Math.sin(t * 9);
    return p;
  },
  // a running knee slide toward the camera (u: 0 → 1 over the slide)
  slide(u, t) {
    const p = blankPose();
    const down = smooth(u / 0.25);
    p.y = -0.27 * down;
    p.legL = [lerp(-0.5, 0.0, down), 0, 0.14]; p.kneeL = [lerp(0.6, 1.65, down), 0, 0]; p.ankleL = [lerp(0, 0.6, down), 0, 0];
    p.legR = [lerp(0.3, 0.0, down), 0, -0.14]; p.kneeR = [lerp(0.6, 1.65, down), 0, 0]; p.ankleR = [lerp(0, 0.6, down), 0, 0];
    p.spine = [lerp(0.2, -0.45, down), 0, 0]; p.head = [lerp(0, -0.35, down), 0, 0];
    const pump = Math.sin(t * 9);
    p.armL = [-0.3, 0, lerp(0.6, 2.3, down) + 0.15 * pump]; p.armR = [-0.3, 0, -lerp(0.6, 2.3, down) - 0.15 * pump];
    p.elbowL = [-0.6 - 0.3 * pump, 0, 0]; p.elbowR = [-0.6 + 0.3 * pump, 0, 0];
    p.tail = 1;
    return p;
  },
  // hands on head after a save (elbows out, paws on the sides of his head), head shaking
  sad(t) {
    const p = blankPose();
    const shake = Math.sin(t * 5) * Math.exp(-t * 0.6);
    p.y = -0.015;
    p.legL = [0.02, 0, 0.06]; p.legR = [-0.02, 0, -0.06]; p.kneeL = [0.08, 0, 0]; p.kneeR = [0.08, 0, 0];
    const L = SAD_L, R = SAD_R;
    p.armL = L.a.slice(); p.elbowL = L.b.slice(); p.armR = R.a.slice(); p.elbowR = R.b.slice();
    p.spine = [0.08, 0, 0]; p.neck = [0.1, 0, 0]; p.head = [0.22 + 0.05 * Math.sin(t * 1.4), 0.3 * shake, 0];
    p.tail = -0.5;
    return p;
  },
  // u: 0 → 1 between two touches; `next` is the foot that touches the ball at u = 1 (1 = right, -1 = left),
  // the other foot touched it at u = 0 and comes down again
  juggle(u, next, t) {
    const p = POSES.stand(t);
    const up = u > 0.62 ? smooth((u - 0.62) / 0.38) : 0, down = u < 0.3 ? 1 - smooth(u / 0.3) : 0;
    const kL = next < 0 ? up : down, kR = next > 0 ? up : down;
    p.legL = [-0.85 * kL, 0, 0.04]; p.kneeL = [0.15 + 0.85 * kL, 0, 0]; p.ankleL = [0.25 * kL, 0, 0];
    p.legR = [-0.85 * kR, 0, -0.04]; p.kneeR = [0.15 + 0.85 * kR, 0, 0]; p.ankleR = [0.25 * kR, 0, 0];
    p.y = -0.02 * (1 - kL - kR);
    p.armL = [-0.3 + 0.2 * kR, 0, 0.55 + 0.25 * kR]; p.armR = [-0.3 + 0.2 * kL, 0, -0.55 - 0.25 * kL];
    p.elbowL = [-0.8, 0, 0]; p.elbowR = [-0.8, 0, 0];
    p.spine = [0.06, 0.12 * (kR - kL), 0];
    const ballH = 4 * u * (1 - u);
    p.head = [0.35 - 0.5 * ballH, 0, 0];
    p.tail = Math.sin(t * 4);
    return p;
  },
  // waving hello with the right paw
  wave(t) {
    const p = POSES.stand(t);
    p.armR = [-0.2, 0, -2.5]; p.elbowR = [0, 0, -0.45 + 0.4 * Math.sin(t * 9)];
    p.head = [0.05, -0.12, -0.1];
    return p;
  },
};
