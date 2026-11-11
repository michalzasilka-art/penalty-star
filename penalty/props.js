// The ball, the soap-bubble word targets, confetti, pop droplets and soft blob shadows.
import * as THREE from './lib/three.module.min.js';
import { toon } from './mat.js';

export const BALL_R = 0.11;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// a classic black-and-white ball: black pentagons centred on the 12 icosahedron directions, thin seams between
export function makeBall() {
  const mat = toon(0xffffff, { rough: 0.38, rim: 0.3 });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjN = normalize(position);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObjN;
      const float PHI = 1.61803398875;
      float pent(vec3 n){
        vec3 d[6]; d[0] = vec3(0.0, 1.0, PHI); d[1] = vec3(0.0, 1.0, -PHI); d[2] = vec3(1.0, PHI, 0.0);
        d[3] = vec3(1.0, -PHI, 0.0); d[4] = vec3(PHI, 0.0, 1.0); d[5] = vec3(-PHI, 0.0, 1.0);
        float m = 0.0;
        for (int i = 0; i < 6; i++) { m = max(m, abs(dot(n, normalize(d[i])))); }
        return m;
      }`).replace('#include <map_fragment>', `
        vec3 nn = normalize(vObjN);
        float m = pent(nn);
        float w = fwidth(m) * 1.2;
        float black = smoothstep(0.935 - w, 0.935 + w, m);
        diffuseColor.rgb = mix(vec3(0.95), vec3(0.03, 0.03, 0.05), black);
      `);
  };
  mat.customProgramCacheKey = () => 'ball';
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), mat);
  m.name = 'ball';
  return m;
}

// ---------- soft round shadow under the characters and the ball ----------
let blobTex = null;
export function makeBlob(size, opacity = 0.42) {
  if (!blobTex) {
    const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(10,20,10,1)'); gr.addColorStop(0.45, 'rgba(10,20,10,.6)'); gr.addColorStop(1, 'rgba(10,20,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    blobTex = new THREE.CanvasTexture(cv);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

// ---------- the soap bubbles ----------
const bubbleGeo = new THREE.SphereGeometry(1, 32, 20);
export function makeBubble(tint) {
  const uniforms = {
    uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uTint: { value: new THREE.Color(tint) },
    uGlow: { value: 0 }, uGlowCol: { value: new THREE.Color(0x4dff8a) }, uAlpha: { value: 1 }, uHot: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime, uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      void main(){
        vec3 p = position;
        float w = sin(uTime * 2.6 + p.y * 3.0 + uSeed) * 0.025 + sin(uTime * 3.7 + p.x * 4.0 + uSeed * 2.0) * 0.018;
        p += normal * w;
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime, uSeed, uGlow, uAlpha, uHot; uniform vec3 uTint, uGlowCol;
      varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float fr = 1.0 - ndv;
        // thin-film colours that swirl with the angle and slowly with time
        float film = fr * 1.6 + vObj.y * 0.35 + sin(vObj.x * 3.0 + uTime * 0.7 + uSeed) * 0.15 + uTime * 0.05;
        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0.0, 0.33, 0.67)));
        float rim = pow(fr, 2.2);
        vec3 col = mix(uTint, irid, 0.55) * (0.25 + 1.25 * rim);
        col += uTint * 0.18;
        // two window highlights
        vec3 l1 = normalize(vec3(-0.45, 0.6, 0.65)), l2 = normalize(vec3(0.5, -0.45, 0.7));
        float h1 = pow(max(dot(reflect(-v, n), l1), 0.0), 60.0), h2 = pow(max(dot(reflect(-v, n), l2), 0.0), 24.0);
        col += vec3(1.0) * (h1 * 1.4 + h2 * 0.35);
        col = mix(col, uGlowCol * (0.6 + 1.4 * rim), uGlow * 0.75);
        col += uTint * uHot * 0.5 * rim;
        float a = 0.1 + 0.7 * rim + h1 * 0.8 + uGlow * (0.15 + 0.6 * rim) + uHot * 0.2;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uAlpha);
      }`,
  });
  const m = new THREE.Mesh(bubbleGeo, mat);
  m.renderOrder = 5;
  return { mesh: m, u: uniforms };
}

// ---------- confetti ----------
export function makeConfetti(n = 260) {
  const geo = new THREE.PlaneGeometry(0.07, 0.11);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const cols = [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xff4f9a, 0x5bff8a, 0xffffff];
  const c = new THREE.Color();
  const P = [];
  for (let i = 0; i < n; i++) {
    mesh.setColorAt(i, c.setHex(cols[i % cols.length]));
    P.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const hide = () => { for (let i = 0; i < n; i++) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); } mesh.instanceMatrix.needsUpdate = true; };
  hide();
  let active = false;
  return {
    mesh,
    burst(center, spread = 6, height = 6) {
      for (const q of P) {
        q.p.set(center.x + (Math.random() - 0.5) * spread, center.y + height * (0.6 + Math.random() * 0.6), center.z + (Math.random() - 0.5) * spread * 0.7);
        q.v.set((Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 2);
        q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        q.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        q.life = 3.5 + Math.random() * 2;
      }
      active = true;
    },
    clear() { active = false; hide(); },
    update(dt) {
      if (!active) return;
      let alive = 0;
      P.forEach((q, i) => {
        q.life -= dt;
        if (q.life <= 0 || q.p.y < 0.02) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); return; }
        alive++;
        q.v.y -= 3.2 * dt; q.v.multiplyScalar(Math.exp(-1.6 * dt));
        q.v.x += Math.sin(q.life * 3 + i) * 0.6 * dt;
        q.p.addScaledVector(q.v, dt);
        q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
        _q.setFromEuler(q.r);
        _s.setScalar(Math.min(1, q.life));
        _m.compose(q.p, _q, _s); mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (!alive) { active = false; hide(); }
      return zero;
    },
  };
}

// ---------- droplets and sparkles when a bubble pops ----------
export function makeSparks(n = 220) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const tex = (() => {
    const S = 64, cv = canvas(S, S), g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(cv);
  })();
  const uniforms = { uMap: { value: tex }, uScale: { value: 300 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float size; varying vec3 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vC; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a, t.a); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const P = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, c: new THREE.Color(), s: 0 }));
  let head = 0;
  return {
    points, uniforms,
    emit(center, colors, count, speed, radius = 0.6) {
      for (let k = 0; k < count; k++) {
        const q = P[head]; head = (head + 1) % n;
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        q.p.copy(center).addScaledVector(d, radius * (0.8 + Math.random() * 0.25));
        q.v.copy(d).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        q.life = q.max = 0.5 + Math.random() * 0.6;
        q.c.set(colors[k % colors.length]);
        q.s = 0.06 + Math.random() * 0.08;
      }
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const q = P[i];
        if (q.life > 0) {
          q.life -= dt; q.v.y -= 2.5 * dt; q.v.multiplyScalar(Math.exp(-2.2 * dt)); q.p.addScaledVector(q.v, dt);
        }
        const a = Math.max(0, q.life / q.max);
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        col[i * 3] = q.c.r * a; col[i * 3 + 1] = q.c.g * a; col[i * 3 + 2] = q.c.b * a;
        size[i] = q.life > 0 ? q.s : 0;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    },
  };
}
