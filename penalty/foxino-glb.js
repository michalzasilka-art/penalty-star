// Football Foxino from the Tripo model (models/foxino-football.glb: low-poly, textured, Mixamo skeleton, A-pose).
// It keeps the old pose library from foxino.js (stand, ready, run, kick, celebrate, slide, sad, juggle, wave): every
// pose is a set of joint rotations for a rig whose limbs hang straight down at rest, and here each rotation is turned
// into a rotation of the matching Mixamo bone. Same interface as makeFoxino(): root, body, pose, apply, update, face, foot.
import * as THREE from './lib/three.module.min.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { toon, damp } from './mat.js';
import { blankPose, POSES } from './foxino.js';

const URL = 'models/foxino-football.glb?v=1';
const HEIGHT = 1.3;          // ear tips, in metres (the code-built Foxino was about 1.45 with his longer body)

// old joint -> Mixamo bone, and the old joint's parent
const BONE = {
  hips: 'Hips', spine: 'Spine', neck: 'Neck', head: 'Head',
  armL: 'LeftArm', elbowL: 'LeftForeArm', armR: 'RightArm', elbowR: 'RightForeArm',
  legL: 'LeftUpLeg', kneeL: 'LeftLeg', ankleL: 'LeftFoot', legR: 'RightUpLeg', kneeR: 'RightLeg', ankleR: 'RightFoot',
};
const PARENT = {
  hips: null, spine: 'hips', neck: 'spine', head: 'neck', armL: 'spine', elbowL: 'armL', armR: 'spine', elbowR: 'armR',
  legL: 'hips', kneeL: 'legL', ankleL: 'kneeL', legR: 'hips', kneeR: 'legR', ankleR: 'kneeR',
};
const ORDER = Object.keys(PARENT);   // parents come before children
// limbs that hang straight down in the old rig at rest: their A-pose rest direction gets turned to point down
const STRAIGHT = new Set(['armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR']);
const DOWN = new THREE.Vector3(0, -1, 0);

export async function loadFoxino() {
  const gltf = await new GLTFLoader().loadAsync(URL);
  return makeFoxinoGLB(gltf.scene);
}

export function makeFoxinoGLB(scene) {
  const root = new THREE.Group(); root.name = 'foxino';
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  body.add(scene);
  // the model's materials: its baked texture on the game's toon material (soft rim light like Rob and the stadium)
  scene.traverse((o) => {
    if (o.isMesh) {
      const map = o.material.map; if (map) map.colorSpace = THREE.SRGBColorSpace;
      o.material = toon(0xffffff, { map, rough: 0.8, rim: 0.3 });
      o.frustumCulled = false;   // skinned: the rest-pose bounds don't follow a high kick
    }
  });
  // size and place: ear tips at HEIGHT, the hips over the root
  const bones = {};
  scene.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; /* (three's loader drops the ':') */ });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const s = HEIGHT / (box.max.y - box.min.y);
  scene.scale.setScalar(s);
  scene.updateMatrixWorld(true);
  const hp = bones.Hips.getWorldPosition(new THREE.Vector3());
  scene.position.set(-hp.x, -box.min.y * s, -hp.z);
  scene.updateMatrixWorld(true);

  // rest orientations (body space = world at setup, the root sits at the origin unrotated)
  const all = [];
  bones.Hips.traverse((b) => { if (b.isBone) all.push(b); });
  const rest = new Map();
  for (const b of all) rest.set(b, { local: b.quaternion.clone(), world: b.getWorldQuaternion(new THREE.Quaternion()) });
  const armature = bones.Hips.parent, armQ = armature.getWorldQuaternion(new THREE.Quaternion());
  // per mapped bone: the correction that turns its rest direction straight down (A-pose -> the old rig's rest)
  const fix = {};
  for (const j of ORDER) {
    const b = bones[BONE[j]]; fix[j] = new THREE.Quaternion();
    if (!STRAIGHT.has(j)) continue;
    const child = b.children.find((c) => c.isBone);
    const a = b.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
    fix[j].setFromUnitVectors(c.sub(a).normalize(), DOWN);
  }
  const jointOf = new Map(ORDER.map((j) => [bones[BONE[j]], j]));
  const spine1 = bones.Spine1, spine2 = bones.Spine2;

  const cur = blankPose();
  const D = {}, R = {}; for (const j of ORDER) { D[j] = new THREE.Quaternion(); R[j] = new THREE.Quaternion(); }
  const eul = new THREE.Euler(), tgt = new Map(), tmp = new THREE.Quaternion(), inv = new THREE.Quaternion(), I = new THREE.Quaternion();
  for (const b of all) tgt.set(b, new THREE.Quaternion());

  function pose() {
    // the old rig's joint rotations, as rotations in body space
    for (const j of ORDER) {
      const c = cur[j];
      R[j].setFromEuler(eul.set(c[0], c[1], c[2], j === 'armL' || j === 'armR' ? 'ZXY' : 'XYZ'));
      if (PARENT[j]) D[j].copy(D[PARENT[j]]).multiply(R[j]); else D[j].copy(R[j]);
    }
    // each bone's world rotation: its delta, then the A-pose fix, on top of its rest; unmapped bones follow their parent
    for (const b of all) {
      const j = jointOf.get(b), T = tgt.get(b), r = rest.get(b);
      const pT = b.parent && tgt.has(b.parent) ? tgt.get(b.parent) : armQ;
      if (j === 'spine') { T.copy(D.hips).multiply(tmp.copy(I).slerp(R.spine, 1 / 3)).multiply(r.world); }
      else if (b === spine1) { T.copy(D.hips).multiply(tmp.copy(I).slerp(R.spine, 2 / 3)).multiply(r.world); }
      else if (b === spine2) { T.copy(D.spine).multiply(r.world); }
      else if (j) { T.copy(D[j]).multiply(fix[j]).multiply(r.world); }
      else { T.copy(pT).multiply(r.local); }
      b.quaternion.copy(inv.copy(pT).invert().multiply(T));
    }
  }

  const fox = {
    root, body, bones, pose: cur, expression: 'happy', tailAmp: 1, isGLB: true,
    // the model's face is painted on: the expression is kept for the game logic only
    face(kind) { fox.expression = kind; },
    apply(P, k, dt) {
      const a = k === Infinity ? 1 : 1 - Math.exp(-k * dt);
      for (const j of ORDER) {
        const c = cur[j], t = P[j];
        c[0] += (t[0] - c[0]) * a; c[1] += (t[1] - c[1]) * a; c[2] += (t[2] - c[2]) * a;
      }
      cur.y += (P.y - cur.y) * a;
      cur.tail += ((P.tail || 0) - cur.tail) * a;
      body.position.y = cur.y;
      pose();
    },
    update(dt, t) {
      // a little life in the head while idle (the tail is part of the hips in this model)
      void dt; void t;
    },
    foot(side, out) { return bones[side === 'L' ? 'LeftFoot' : 'RightFoot'].getWorldPosition(out); },
  };
  fox.apply(POSES.stand(0), Infinity, 0);
  return fox;
}
