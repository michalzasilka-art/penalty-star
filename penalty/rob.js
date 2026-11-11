// Rob the goalkeeper, built in code: a round cyan robot with a black screen face (smiling eyes), an antenna with a red
// heart, a glowing orange battery window in his chest, and big goalkeeper gloves.
// Local frame: +Y up, +Z his front (he faces the penalty taker). `dive` is a pivot at the middle of his body:
// all jumps and dives move and roll it.
import * as THREE from './lib/three.module.min.js';
import { toon, add, group, sphere, capsule, mergeStatic, clamp, lerp, smooth, damp } from './mat.js';

const SCALE = 1.12, BODY_Y = 0.64 * SCALE;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// the battery window: warm orange glow, a battery with a lightning bolt
function batteryTexture() {
  const W = 256, H = 192, cv = canvas(W, H), g = cv.getContext('2d');
  const bg = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.55, W * 0.7);
  bg.addColorStop(0, '#ffd27a'); bg.addColorStop(0.45, '#ff9d3a'); bg.addColorStop(1, '#a8461a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // the glass reflection
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.55, 0); g.lineTo(W * 0.25, H); g.lineTo(0, H); g.closePath(); g.fill();
  // the battery
  const bx = W / 2 - 34, by = 34, bw = 68, bh = 128;
  const bgr = g.createLinearGradient(bx, 0, bx + bw, 0);
  bgr.addColorStop(0, '#e2541c'); bgr.addColorStop(0.5, '#ffb347'); bgr.addColorStop(1, '#d9481a');
  g.fillStyle = bgr;
  g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 14) : g.rect(bx, by, bw, bh); g.fill();
  g.fillStyle = '#ffcf70'; g.fillRect(bx + 18, by - 10, bw - 36, 12);
  // the bolt
  g.fillStyle = '#fff3b0'; g.strokeStyle = '#ff7a1a'; g.lineWidth = 4; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(W / 2 + 8, by + 18); g.lineTo(W / 2 - 18, by + 70); g.lineTo(W / 2 - 1, by + 70);
  g.lineTo(W / 2 - 10, by + 112); g.lineTo(W / 2 + 20, by + 56); g.lineTo(W / 2 + 2, by + 56); g.closePath();
  g.fill(); g.stroke();
  // a glow ring at the bottom
  g.strokeStyle = 'rgba(255,240,180,.75)'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(W / 2, by + bh + 6, 52, 9, 0, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05);
  s.bezierCurveTo(-0.01, -0.035, -0.055, -0.01, -0.055, 0.02);
  s.bezierCurveTo(-0.055, 0.05, -0.02, 0.06, 0, 0.035);
  s.bezierCurveTo(0.02, 0.06, 0.055, 0.05, 0.055, 0.02);
  s.bezierCurveTo(0.055, -0.01, 0.01, -0.035, 0, -0.05);
  return s;
}

const JOINTS = ['body', 'head', 'armL', 'elbowL', 'gloveL', 'armR', 'elbowR', 'gloveR', 'legL', 'footL', 'legR', 'footR'];
export function blankPose() { const p = {}; for (const j of JOINTS) p[j] = [0, 0, 0]; return p; }

export function makeRob() {
  const M = {
    cyan: toon(0x3cc6ef, { rough: 0.32, rim: 0.35 }), cyanDark: toon(0x23a6d4, { rough: 0.35, rim: 0.3 }),
    purple: toon(0x4a2a9e, { rough: 0.4, rim: 0.2 }), black: toon(0x1b1d2c, { rough: 0.45, rim: 0.25 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 0.12, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    frame: toon(0x2a2c3a, { rough: 0.4, rim: 0.2 }),
    orange: toon(0xff8a1c, { rough: 0.45, rim: 0.3 }), white: toon(0xf4f6ff, { rough: 0.5, rim: 0.2 }),
    glove: toon(0xff7a12, { rough: 0.55, rim: 0.35 }), gloveLime: toon(0xb9f53c, { rough: 0.55, rim: 0.3 }), palm: toon(0xf6f3ea, { rough: 0.7, rim: 0.2 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xd9ecff }),
    heart: toon(0xff2f45, { rough: 0.3, rim: 0.3, emissive: 0x6a0010 }),
    battery: new THREE.MeshBasicMaterial({ map: batteryTexture() }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
  };
  const root = new THREE.Group(); root.name = 'rob';
  const dive = group(root, [0, BODY_Y, 0], 'dive');
  const J = {};
  const body = J.body = group(dive, [0, 0, 0]);
  body.scale.setScalar(SCALE);
  // ---------- the round belly ----------
  const bellyS = group(body, [0, 0, 0]); bellyS.scale.set(1, 1.02, 0.88);
  add(bellyS, sphere(0.42, 36, 24), M.cyan, [0, 0, 0]);
  const ring = (y, tilt, tube = 0.016) => {
    const r = Math.sqrt(Math.max(0.001, 0.42 * 0.42 - y * y)) + 0.002;
    const g = group(bellyS, [0, 0, 0]); g.rotation.z = tilt;
    add(g, new THREE.TorusGeometry(r, tube, 6, 40), M.purple, [0, y, 0], null, [Math.PI / 2, 0, 0]);
  };
  ring(0.2, 0.1); ring(-0.24, -0.14);
  // the battery window
  const win = group(body, [0, -0.02, 0.33]);
  win.rotation.x = 0.04;
  const frameGeo = new THREE.ExtrudeGeometry(roundRect(0.34, 0.25, 0.07), { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 5 });
  add(win, frameGeo, M.frame, [0, 0, -0.01]);
  const glassGeo = new THREE.ShapeGeometry(roundRect(0.28, 0.19, 0.05), 5);
  // ShapeGeometry UVs are in shape units: map them to 0..1
  const uv = glassGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.28 + 0.5, uv.getY(i) / 0.19 + 0.5);
  const glass = add(win, glassGeo, M.battery, [0, 0, 0.044]);
  // ---------- legs ----------
  function leg(side) {
    const s = side === 'L' ? 1 : -1;
    const l = J['leg' + side] = group(body, [0.19 * s, -0.33, 0]);
    add(l, sphere(0.075), M.black, [0, -0.02, 0]);
    add(l, capsule(0.095, 0.06), M.cyan, [0, -0.12, 0]);
    add(l, new THREE.TorusGeometry(0.096, 0.014, 6, 20), M.purple, [0, -0.1, 0], null, [Math.PI / 2, 0, 0]);
    const f = J['foot' + side] = group(l, [0, -0.22, 0.02]);
    add(f, sphere(1), M.cyan, [0, -0.02, 0.04], [0.12, 0.085, 0.165]);
    add(f, sphere(1), M.black, [0, -0.07, 0.04], [0.125, 0.03, 0.17]);
    add(f, sphere(0.022, 10, 8), M.lamp, [0, -0.06, 0.2]);
    add(f, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), M.purple, [0.118 * s, -0.035, 0.0], null, [0, 0, Math.PI / 2]);
    return l;
  }
  leg('L'); leg('R');
  // ---------- arms and gloves ----------
  function arm(side) {
    const s = side === 'L' ? 1 : -1;
    const a = J['arm' + side] = group(body, [0.4 * s, 0.16, 0]);
    add(a, sphere(0.13, 20, 14), M.cyan, [0.02 * s, 0, 0]);
    add(a, new THREE.TorusGeometry(0.115, 0.016, 6, 20), M.purple, [0.06 * s, 0, 0], null, [0, Math.PI / 2, 0]);
    add(a, capsule(0.058, 0.13), M.black, [0.0, -0.15, 0]);
    const e = J['elbow' + side] = group(a, [0.0, -0.27, 0]);
    add(e, sphere(0.07), M.black, [0, 0, 0]);
    add(e, capsule(0.088, 0.1), M.cyan, [0, -0.09, 0]);
    add(e, new THREE.TorusGeometry(0.089, 0.014, 6, 20), M.purple, [0, -0.04, 0], null, [Math.PI / 2, 0, 0]);
    // the goalkeeper glove: a white cuff, a big orange mitt with fingers and a thumb, lime stripe
    const gl = J['glove' + side] = group(e, [0, -0.23, 0]);
    add(gl, new THREE.CylinderGeometry(0.085, 0.09, 0.07, 18), M.white, [0, 0.055, 0]);
    add(gl, new THREE.TorusGeometry(0.088, 0.012, 6, 20), M.gloveLime, [0, 0.03, 0], null, [Math.PI / 2, 0, 0]);
    add(gl, sphere(1, 18, 12), M.glove, [0, -0.03, 0], [0.105, 0.11, 0.07]);
    add(gl, sphere(1, 14, 10), M.palm, [0, -0.035, 0.03], [0.08, 0.085, 0.045]);
    for (let i = 0; i < 4; i++) add(gl, capsule(0.026, 0.06, 3, 8), M.glove, [(-0.054 + i * 0.036), -0.13 - (i === 1 || i === 2 ? 0.012 : 0), 0.0]);
    add(gl, capsule(0.027, 0.06, 3, 8), M.glove, [0.09 * -s, -0.05, 0.03], null, [0.2, 0, 0.75 * -s]);
    add(gl, capsule(0.012, 0.09, 2, 6), M.gloveLime, [0, -0.035, -0.066], null, [0, 0, Math.PI / 2]);
    return a;
  }
  arm('L'); arm('R');
  // ---------- the head ----------
  add(body, new THREE.TorusGeometry(0.17, 0.035, 6, 20), M.black, [0, 0.39, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
  const head = J.head = group(body, [0, 0.62, 0]);
  add(head, sphere(0.29, 40, 26), M.cyan, [0, 0, 0], [1, 0.92, 0.96]);
  // the face screen: a glossy black visor with a lighter bezel
  // (a lens that hugs the head, so from the side it is a gentle bulge, not a snout)
  add(head, sphere(1, 40, 26), M.screen, [0, -0.012, 0.11], [0.238, 0.192, 0.2]);
  // eyes: several expressions, one shown at a time
  const eyes = group(head, [0, 0.0, 0.302]);
  const arc = new THREE.TorusGeometry(0.044, 0.011, 6, 20, Math.PI);
  const happy = group(eyes); for (const s of [1, -1]) add(happy, arc, M.eye, [0.085 * s, -0.012, 0], null, [0, 0.25 * s, 0]);
  const focus = group(eyes); for (const s of [1, -1]) add(focus, sphere(1, 10, 8), M.eye, [0.085 * s, 0.0, -0.004], [0.03, 0.042, 0.012], [0, 0.25 * s, 0]);
  const oops = group(eyes);
  for (const s of [1, -1]) {
    const g = group(oops, [0.085 * s, 0, 0]); g.rotation.y = 0.25 * s;
    add(g, capsule(0.01, 0.045, 3, 8), M.eye, [0, 0.014, 0], null, [0, 0, (Math.PI / 2 + 0.55) * s]);
    add(g, capsule(0.01, 0.045, 3, 8), M.eye, [0, -0.014, 0], null, [0, 0, (Math.PI / 2 - 0.55) * s]);
  }
  const sad = group(eyes); for (const s of [1, -1]) add(sad, arc, M.eye, [0.085 * s, 0.018, 0], null, [0, 0.25 * s, Math.PI]);
  const faces = { happy, focus, oops, sad };
  // ear discs
  for (const s of [1, -1]) {
    const e = group(head, [0.272 * s, 0.0, 0.0]); e.rotation.z = (Math.PI / 2) * s;
    add(e, new THREE.CylinderGeometry(0.075, 0.08, 0.05, 18), M.orange, [0, 0, 0]);
    add(e, new THREE.CylinderGeometry(0.058, 0.058, 0.055, 18), M.purple, [0, 0.01, 0]);
    add(e, new THREE.CylinderGeometry(0.036, 0.036, 0.06, 18), M.white, [0, 0.015, 0]);
  }
  // antenna with a red heart
  add(head, sphere(1, 16, 10), M.cyan, [0, 0.255, 0], [0.075, 0.05, 0.075]);
  add(head, new THREE.CylinderGeometry(0.008, 0.01, 0.2, 10), M.frame, [0, 0.36, 0]);
  const heart = group(head, [0, 0.49, 0]);
  const hg = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.022, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
  hg.translate(0, 0, -0.011);
  add(heart, hg, M.heart, [0, 0, 0], 1.25);

  mergeStatic(root);
  const cur = blankPose();
  const rob = {
    root, dive, body, J, heart, glass,
    pose: cur, expression: 'happy',
    face(kind) { rob.expression = kind; for (const k in faces) faces[k].visible = k === kind; },
    apply(P, k, dt) {
      const a = k === Infinity ? 1 : 1 - Math.exp(-k * dt);
      for (const j of JOINTS) {
        const c = cur[j], t = P[j];
        c[0] += (t[0] - c[0]) * a; c[1] += (t[1] - c[1]) * a; c[2] += (t[2] - c[2]) * a;
        J[j].rotation.set(c[0], c[1], c[2], j === 'armL' || j === 'armR' ? 'ZXY' : 'XYZ');
      }
    },
    update(dt, t) {
      heart.rotation.y = Math.sin(t * 1.6) * 0.5;
      heart.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(t * 6)) ** 4);
      M.battery.color.setScalar(0.85 + 0.15 * Math.sin(t * 3));
    },
    // the middle of the two gloves in world space (where a caught ball sits)
    hands(out) {
      _o.set(0, -0.07, 0.07); J.gloveL.localToWorld(_a.copy(_o)); J.gloveR.localToWorld(_b.copy(_o));
      return out.copy(_a).add(_b).multiplyScalar(0.5);
    },
    // on top of the right glove (the ball held up high)
    top(out) { return J.gloveR.localToWorld(out.set(0, -0.3, 0.0)); },
  };
  rob.face('happy');
  rob.apply(RPOSES.ready(0), Infinity, 0);
  return rob;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _o = new THREE.Vector3();
export const ROB_BODY_Y = BODY_Y;

// an arm's rotation (ZXY Euler, in the body's frame) that points it along a direction
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), DOWN = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3();
function aim(x, y, z) { _d.set(x, y, z).normalize(); _q.setFromUnitVectors(DOWN, _d); _e.setFromQuaternion(_q, 'ZXY'); return [_e.x, _e.y, _e.z]; }

// ---------- the pose library ----------
export const RPOSES = {
  // the keeper's set position: knees bent, gloves open at the sides, swaying
  ready(t) {
    const p = blankPose();
    const sw = Math.sin(t * 2.6);
    p.body = [0.12, 0.08 * sw, 0.05 * sw];
    p.head = [-0.1, -0.06 * sw, -0.04 * sw];
    p.armL = aim(0.75, -0.55, 0.45); p.elbowL = [-0.75, 0, 0]; p.gloveL = [0.5, 0, -0.3];
    p.armR = aim(-0.75, -0.55, 0.45); p.elbowR = [-0.75, 0, 0]; p.gloveR = [0.5, 0, 0.3];
    p.armL[2] += 0.06 * sw; p.armR[2] += 0.06 * sw;
    p.legL = [-0.15, 0, 0.18]; p.legR = [-0.15, 0, -0.18];
    p.footL = [0.15, 0, -0.18]; p.footR = [0.15, 0, 0.18];
    return p;
  },
  // stretched out, both gloves together in front of his face (dives and catches): the ball sits between the gloves
  reach() {
    const p = blankPose();
    p.armL = aim(-0.34, 0.3, 0.62); p.elbowL = [0, 0, 0]; p.gloveL = [0.9, 0, 0];
    p.armR = aim(0.34, 0.3, 0.62); p.elbowR = [0, 0, 0]; p.gloveR = [0.9, 0, 0];
    p.legL = [0.25, 0, 0.35]; p.legR = [-0.2, 0, -0.15];
    p.head = [-0.12, 0, 0];
    return p;
  },
  // catching a lower ball in front of his tummy, crouched
  scoop() {
    const p = blankPose();
    p.body = [0.22, 0, 0];
    p.armL = aim(-0.3, -0.12, 0.85); p.elbowL = [0, 0, 0]; p.gloveL = [0.9, 0, 0];
    p.armR = aim(0.3, -0.12, 0.85); p.elbowR = [0, 0, 0]; p.gloveR = [0.9, 0, 0];
    p.legL = [-0.45, 0, 0.25]; p.legR = [-0.45, 0, -0.25];
    p.footL = [0.45, 0, 0]; p.footR = [0.45, 0, 0];
    p.head = [-0.25, 0, 0];
    return p;
  },
  // showing the caught ball: right glove high in the air with the ball on it, left fist pumping, bouncing
  hold(t) {
    const p = blankPose();
    const b = Math.sin(t * 8);
    p.armR = aim(-0.22, 1, 0.12); p.elbowR = [0, 0, 0]; p.gloveR = [0, 0, 0];
    p.armL = aim(0.8, 0.2 + 0.3 * b, 0.3); p.elbowL = [-1.6 - 0.3 * b, 0, 0]; p.gloveL = [0, 0, 0];
    p.body = [-0.06, 0.12 * Math.sin(t * 2.5), -0.06 + 0.03 * b];
    p.head = [-0.18, -0.15, 0.06 * b];
    p.legL = [0, 0, 0.12]; p.legR = [0, 0, -0.12];
    return p;
  },
  // after letting a goal in: one glove on his head, the other hanging, head down, looking round at the net
  oops(t) {
    const p = blankPose();
    p.armL = aim(0.3, 1, 0.25); p.elbowL = [-2.1, 0, 0]; p.gloveL = [0.4, 0, 0];
    p.armR = aim(-0.25, -1, 0.1); p.elbowR = [-0.25, 0, 0]; p.gloveR = [0, 0, 0];
    p.body = [0.16, 0.12 * Math.sin(t * 1.4), 0];
    p.head = [0.22, 0.4 * Math.sin(t * 2.2) * Math.exp(-t * 0.4), -0.12];
    p.legL = [0, 0, 0.08]; p.legR = [0, 0, -0.08];
    return p;
  },
  // lying on the grass after a dive
  lie() {
    const p = RPOSES.reach();
    p.legL = [0.1, 0, 0.25]; p.legR = [0.1, 0, -0.1];
    return p;
  },
  // standing, waving at the crowd (lobby / end screen)
  wave(t) {
    const p = RPOSES.ready(t);
    p.armR = aim(-0.6, 1, 0.2); p.elbowR = [0, 0, -0.5 + 0.45 * Math.sin(t * 8)]; p.gloveR = [0, 0, 0];
    p.body = [0, 0.1 * Math.sin(t * 1.3), 0];
    p.legL = [0, 0, 0.08]; p.legR = [0, 0, -0.08]; p.footL = [0, 0, 0]; p.footR = [0, 0, 0];
    return p;
  },
};
