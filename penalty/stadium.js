// The stadium: sky, the pitch with mown stripes and white lines, the goal with a net that bulges, four stands full of a
// colourful (instanced, shader-animated) crowd, floodlights, flags and LED boards. Cheap: one draw call per crowd, no shadows.
// World: the goal line is z = 0 (goal mouth x = -3.66..3.66, height 2.44), the penalty spot is (0, 0, 11), +z toward the taker.
import * as THREE from './lib/three.module.min.js';
import { toon, add } from './mat.js';

export const GOAL_W = 7.32, GOAL_H = 2.44, POST_R = 0.06;
const HW = GOAL_W / 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- sky ----------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(-0.55, 0.16, -0.82).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uSun;
      void main(){
        float h = vD.y;
        vec3 zen = vec3(0.16, 0.38, 0.86), mid = vec3(0.45, 0.68, 0.98), hor = vec3(1.0, 0.86, 0.66), low = vec3(0.86, 0.72, 0.62);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zen, smoothstep(0.2, 0.75, h));
        c = mix(low, c, smoothstep(-0.12, 0.0, h));
        float s = max(dot(vD, uSun), 0.0);
        c += vec3(1.0, 0.75, 0.45) * (pow(s, 6.0) * 0.35 + pow(s, 120.0) * 0.8);
        // a few soft streaky clouds
        float cl = sin(vD.x * 9.0 + vD.z * 3.0) * sin(vD.z * 7.0 - vD.x * 2.0 + 1.3) * 0.5 + 0.5;
        cl *= smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.35, 0.6, h));
        c = mix(c, vec3(1.0, 0.95, 0.9), smoothstep(0.62, 0.95, cl) * 0.45);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------- pitch: stripes and lines drawn in the shader (crisp at any distance) ----------
function makePitch() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      float box(vec2 p, float hw, float d){ // three sides of a box from the goal line (x = +-hw, z = 0..d)
        return min(min(seg(p, vec2(-hw, 0.0), vec2(-hw, d)), seg(p, vec2(hw, 0.0), vec2(hw, d))), seg(p, vec2(-hw, d), vec2(hw, d))); }
    `).replace('#include <map_fragment>', `
      vec2 p = vW.xz;
      float band = mod(floor((p.y + 110.0) / 5.5), 2.0);
      vec3 g1 = vec3(0.235, 0.56, 0.17), g2 = vec3(0.30, 0.65, 0.21);
      vec3 col = mix(g1, g2, band);
      float n = vnoise(p * 1.7) * 0.6 + vnoise(p * 7.0) * 0.4;
      col *= 0.9 + 0.14 * n;
      // the darker track around the pitch
      float off = max(max(abs(p.x) - 37.0, -p.y - 5.0), p.y - 112.0);
      col = mix(col, vec3(0.2, 0.36, 0.16), smoothstep(0.0, 0.4, off));
      float d = 1e3;
      d = min(d, seg(p, vec2(-34.0, 0.0), vec2(34.0, 0.0)));
      d = min(d, seg(p, vec2(-34.0, 0.0), vec2(-34.0, 105.0)));
      d = min(d, seg(p, vec2(34.0, 0.0), vec2(34.0, 105.0)));
      d = min(d, box(p, 9.16, 5.5));
      d = min(d, box(p, 20.16, 16.5));
      d = min(d, seg(p, vec2(-34.0, 52.5), vec2(34.0, 52.5)));
      d = min(d, abs(length(p - vec2(0.0, 52.5)) - 9.15));
      float arc = abs(length(p - vec2(0.0, 11.0)) - 9.15);
      if (p.y < 16.5) arc = 1e3;
      d = min(d, arc);
      float corner = abs(length(p - vec2(-34.0, 0.0)) - 1.0); if (p.x < -34.0 || p.y < 0.0) corner = 1e3; d = min(d, corner);
      corner = abs(length(p - vec2(34.0, 0.0)) - 1.0); if (p.x > 34.0 || p.y < 0.0) corner = 1e3; d = min(d, corner);
      float lw = 0.06;
      float aa = fwidth(d) * 1.2;
      float line = 1.0 - smoothstep(lw - aa, lw + aa, d);
      float spot = 1.0 - smoothstep(0.11 - fwidth(p.x) * 1.5, 0.11 + fwidth(p.x) * 1.5, min(length(p - vec2(0.0, 11.0)), length(p - vec2(0.0, 52.5))));
      line = max(line, spot);
      col = mix(col, vec3(0.97, 0.98, 0.95), line * 0.95);
      diffuseColor.rgb = pow(col, vec3(2.2));
    `);
  };
  mat.customProgramCacheKey = () => 'pitch';
  const geo = new THREE.PlaneGeometry(200, 200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, 0, 45);
  return m;
}

// ---------- the goal and its net ----------
function netTexture() {
  const S = 64, cv = canvas(S, S), g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CELL = 0.13;
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }

function makeGoal() {
  const g = new THREE.Group(); g.name = 'goal';
  const white = toon(0xffffff, { rough: 0.35, rim: 0.25 }), grey = toon(0xd8dce6, { rough: 0.5, rim: 0.1 });
  const post = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_H + POST_R, 20);
  add(g, post, white, [-HW - POST_R, (GOAL_H + POST_R) / 2, 0]);
  add(g, post, white, [HW + POST_R, (GOAL_H + POST_R) / 2, 0]);
  add(g, new THREE.CylinderGeometry(POST_R, POST_R, GOAL_W + POST_R * 4, 20), white, [0, GOAL_H + POST_R / 2, 0], null, [0, 0, Math.PI / 2]);
  // the frame that holds the net
  const TOPZ = -1.0, TOPY = 2.3, BOTZ = -2.0;
  const rod = (a, b, r = 0.022) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = add(g, new THREE.CylinderGeometry(r, r, len, 8), grey, [0, 0, 0]);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  for (const s of [-1, 1]) {
    rod(new THREE.Vector3(s * (HW + POST_R), GOAL_H, 0), new THREE.Vector3(s * HW, TOPY, TOPZ));
    rod(new THREE.Vector3(s * HW, TOPY, TOPZ), new THREE.Vector3(s * HW, 0, BOTZ));
    rod(new THREE.Vector3(s * (HW + POST_R), 0.02, 0), new THREE.Vector3(s * HW, 0.02, BOTZ));
  }
  rod(new THREE.Vector3(-HW, TOPY, TOPZ), new THREE.Vector3(HW, TOPY, TOPZ));
  rod(new THREE.Vector3(-HW, 0.02, BOTZ), new THREE.Vector3(HW, 0.02, BOTZ));
  // the net
  const tex = netTexture();
  const netMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xf4f6ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  // roof
  const roofLen = Math.hypot(GOAL_H - TOPY, TOPZ);
  const roof = new THREE.PlaneGeometry(GOAL_W, roofLen, 1, 1);
  scaleUV(roof, GOAL_W / CELL, roofLen / CELL);
  const rm = add(g, roof, netMat, [0, (GOAL_H + TOPY) / 2, TOPZ / 2]);
  rm.rotation.x = -Math.PI / 2 + Math.atan2(GOAL_H - TOPY, -TOPZ);
  // back (deformable)
  const backLen = Math.hypot(TOPY, BOTZ - TOPZ);
  const NX = 30, NY = 12;
  const back = new THREE.PlaneGeometry(GOAL_W, backLen, NX, NY);
  scaleUV(back, GOAL_W / CELL, backLen / CELL);
  const bm = add(g, back, netMat, [0, TOPY / 2, (TOPZ + BOTZ) / 2]);
  const alpha = Math.atan2(TOPZ - BOTZ, TOPY); // tilt so the top leans toward the goal
  bm.rotation.x = alpha;
  const base = Float32Array.from(back.attributes.position.array);
  // sides
  for (const s of [-1, 1]) {
    const sg = new THREE.BufferGeometry();
    const P = [[s * HW, 0, 0], [s * HW, GOAL_H, 0], [s * HW, TOPY, TOPZ], [s * HW, 0, BOTZ]];
    sg.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [-p[2] / CELL, p[1] / CELL]), 2));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    add(g, sg, netMat, [0, 0, 0]);
  }
  // the bulge: a damped spring pushing a gaussian dent out of the back net
  const bulge = { a: 0, v: 0, x: 0, y: 0, active: false };
  const _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
  const net = {
    mesh: bm,
    // where a point (world, inside the goal) lands on the back net plane: returns the depth of the net at that height
    backZ(y) { const u = THREE.MathUtils.clamp(y / TOPY, 0, 1); return BOTZ + (TOPZ - BOTZ) * u; },
    hit(worldPos, speed) {
      bm.updateMatrixWorld(); _inv.copy(bm.matrixWorld).invert();
      _p.copy(worldPos).applyMatrix4(_inv);
      bulge.x = _p.x; bulge.y = _p.y; bulge.v = Math.min(8, 2 + speed * 0.4); bulge.active = true;
    },
    update(dt) {
      if (!bulge.active) return;
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) { bulge.v += (-70 * bulge.a - 5.5 * bulge.v) * h; bulge.a += bulge.v * h; }
      const pos = back.attributes.position, arr = pos.array;
      const s2 = 2 * 0.8 * 0.8;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const d2 = (x - bulge.x) ** 2 + (y - bulge.y) ** 2;
        // the edges are tied to the frame
        const edge = Math.max(0, Math.min(1, (HW - Math.abs(x)) / 0.6) * Math.min(1, (backLen / 2 - Math.abs(y)) / 0.4));
        const g = bulge.a * Math.exp(-d2 / s2) * edge;
        // pushed out, and the mesh stretched away from the ball so the bulge reads from behind the penalty spot too
        arr[i * 3] = x + (x - bulge.x) * g * 0.35;
        arr[i * 3 + 1] = y + (y - bulge.y) * g * 0.35;
        arr[i * 3 + 2] = -g;
      }
      pos.needsUpdate = true;
      if (Math.abs(bulge.a) < 0.001 && Math.abs(bulge.v) < 0.01) { bulge.active = false; arr.set(base); pos.needsUpdate = true; }
    },
    get dent() { return bulge.a; },
  };
  return { group: g, net };
}

// ---------- crowd ----------
// an atlas of little supporters: 4 looks x (arms down, arms up). Pure white pixels are the shirt (tinted per person).
function crowdAtlas() {
  const CW = 64, CH = 96, cv = canvas(CW * 4, CH * 2), g = cv.getContext('2d');
  const skins = ['#f2c7a5', '#c98d63', '#8a5a3c', '#f6d7bd'], hairs = ['#3b2414', '#1c1410', '#e0b050', '#7a3a1a'];
  for (let v = 0; v < 4; v++) {
    for (let up = 0; up < 2; up++) {
      const ox = v * CW, oy = up * CH, cx = ox + CW / 2;
      // body (shirt, white = tinted)
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(cx, oy + CH * 0.86, CW * 0.36, CH * 0.36, 0, Math.PI, 0); g.fill();
      g.fillRect(cx - CW * 0.36, oy + CH * 0.84, CW * 0.72, CH * 0.16);
      // arms
      g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = 11;
      if (up) {
        g.beginPath(); g.moveTo(cx - 17, oy + CH * 0.62); g.lineTo(cx - 25, oy + CH * 0.18); g.moveTo(cx + 17, oy + CH * 0.62); g.lineTo(cx + 25, oy + CH * 0.18); g.stroke();
        g.fillStyle = skins[v]; g.beginPath(); g.arc(cx - 25, oy + CH * 0.15, 6, 0, 7); g.arc(cx + 25, oy + CH * 0.15, 6, 0, 7); g.fill();
      }
      // head
      g.fillStyle = skins[v]; g.beginPath(); g.arc(cx, oy + CH * 0.42, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = hairs[v];
      g.beginPath(); g.arc(cx, oy + CH * 0.39, 14.5, Math.PI * 1.02, Math.PI * 1.98); g.fill();
      if (v === 2) { g.beginPath(); g.arc(cx - 12, oy + CH * 0.46, 6, 0, 7); g.arc(cx + 12, oy + CH * 0.46, 6, 0, 7); g.fill(); }
      if (v === 1) { g.fillStyle = '#ff7d22'; g.fillRect(cx - 15, oy + CH * 0.31, 30, 7); } // a cap/headband
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeCrowd(seats) {
  const N = seats.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(0.62, 0.92); quad.translate(0, 0.46, 0);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const off = new Float32Array(N * 4), col = new Float32Array(N * 3), rnd = new Float32Array(N * 4);
  const palette = [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xffffff, 0xff4f9a, 0x5bd66b, 0x2c5fd6, 0xe23c3c, 0xffcd1c, 0x8f52d9, 0xff7d22];
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    off.set([s.x, s.y, s.z, s.rot], i * 4);
    c.setHex(palette[Math.floor(Math.random() * palette.length)]).convertSRGBToLinear();
    const k = 0.8 + Math.random() * 0.25; col.set([c.r * k, c.g * k, c.b * k], i * 3);
    rnd.set([Math.random(), Math.floor(Math.random() * 4), Math.random(), Math.random()], i * 4);
  });
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = N;
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 }, uWave: { value: 1 }, uMap: { value: crowdAtlas() }, uSad: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aOff; attribute vec3 aCol; attribute vec4 aRnd;
      uniform float uTime, uCheer, uWave, uSad;
      varying vec2 vUv; varying vec3 vCol; varying float vShade;
      void main(){
        float ph = aRnd.x * 6.2831;
        // a Mexican wave travelling round the stadium (angle around the pitch centre)
        float ang = atan(aOff.x, aOff.z - 40.0);
        float wave = uWave * smoothstep(0.75, 1.0, sin(ang * 3.0 - uTime * 1.6));
        float jump = uCheer * 0.32 * abs(sin(uTime * (8.0 + aRnd.z * 3.0) + ph)) + 0.02 * sin(uTime * 2.0 + ph) + wave * 0.35;
        float up = max(step(aRnd.w, uCheer * 1.1), step(0.5, wave));
        up = max(up, step(0.985, fract(aRnd.w * 13.0 + uTime * 0.03)));
        vec3 p = position;
        p.y += jump - uSad * 0.08;
        float c = cos(aOff.w), s = sin(aOff.w);
        vec3 w = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + aOff.xyz;
        vUv = vec2((uv.x + aRnd.y) / 4.0, (uv.y + (1.0 - up)) / 2.0);
        vCol = aCol; vShade = 0.75 + 0.25 * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol; varying float vShade;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.5) discard;
        float shirt = step(0.97, min(t.r, min(t.g, t.b)));
        vec3 c = mix(t.rgb, vCol, shirt) * vShade;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return { mesh: m, uniforms };
}

// ---------- stands ----------
// a stepped stand: `rows` rows, each 0.85 m deep and 0.42 m higher; it is built along +x facing +z, then placed
function standGeometry(width, rows, base) {
  const s = new THREE.Shape();
  const D = 0.85, H = 0.42;
  s.moveTo(0, 0); s.lineTo(0, base);
  for (let i = 0; i < rows; i++) { s.lineTo(-(i + 1) * D, base + i * H); s.lineTo(-(i + 1) * D, base + (i + 1) * H); }
  s.lineTo(-rows * D - 0.5, base + rows * H + 1.6);
  s.lineTo(-rows * D - 1.2, base + rows * H + 1.6);
  s.lineTo(-rows * D - 1.2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, steps: 1 });
  // shape (x = depth, negative toward the back; y = height), extruded along +z: turn it so the extrusion runs along x
  // and the rows climb toward -z (the front faces +z)
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

function boardTexture() {
  const W = 1024, H = 64, cv = canvas(W, H), g = cv.getContext('2d');
  const blocks = [['#5b2bb0', '#ffcd1c', 'fugio'], ['#ff7d22', '#ffffff', 'FOXINO'], ['#11152e', '#3cc6ef', 'PENALTY STAR'], ['#ffcd1c', '#5b2bb0', 'fugio.co']];
  const bw = W / blocks.length;
  const draw = () => blocks.forEach(([bg, fg, txt], i) => {
    g.fillStyle = bg; g.fillRect(i * bw, 0, bw, H);
    g.fillStyle = fg; g.font = '40px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, i * bw + bw / 2, H / 2 + 2);
  });
  draw();
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redraw = draw;
  return t;
}

function flagMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  mat.userData.t = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = mat.userData.t;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp(uv.x, 0.0, 1.0);
        transformed.z += sin(uT * 5.0 - uv.x * 6.0 + position.y) * 0.18 * k;
        transformed.y += sin(uT * 3.0 - uv.x * 4.0) * 0.06 * k;`);
  };
  mat.customProgramCacheKey = () => 'flag';
  return mat;
}

export function makeStadium(scene) {
  const root = new THREE.Group(); root.name = 'stadium';
  scene.add(root);
  const sky = makeSky(); scene.add(sky);
  root.add(makePitch());
  const goal = makeGoal(); root.add(goal.group);

  const concrete = toon(0x8f93a8, { rough: 0.9, rim: 0 }), seat = toon(0x4b3b8f, { rough: 0.8, rim: 0 }), dark = toon(0x2a2c40, { rough: 0.8, rim: 0 });
  const seats = [];
  // stand: centre (cx, cz), facing angle rot (0 = facing +z), width, rows, base height
  function stand(cx, cz, rot, width, rows, base, density = 0.9) {
    const grp = new THREE.Group(); grp.position.set(cx, 0, cz); grp.rotation.y = rot; root.add(grp);
    grp.add(new THREE.Mesh(standGeometry(width, rows, base), [concrete, seat]));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < rows; i++) {
      const y = base + i * 0.42, back = -(i + 0.55) * 0.85;
      for (let x = -width / 2 + 0.5; x < width / 2 - 0.4; x += 0.64) {
        if (Math.random() > density) continue;
        const lx = x + (Math.random() - 0.5) * 0.12, lz = back;
        seats.push({ x: cx + c * lx + s * lz, y: y + 0.02, z: cz - s * lx + c * lz, rot });
      }
    }
    // a roof over the back of the stand, held up by pillars, with a light strip on its front edge
    const depth = rows * 0.85 + 1.2, top = base + rows * 0.42 + 1.6;
    add(grp, new THREE.BoxGeometry(width + 2, 0.35, depth * 0.62), dark, [0, top + 4.2, -depth * 0.69]);
    add(grp, new THREE.BoxGeometry(width + 2, 0.5, 0.3), toon(0xe9ecf5, { rough: 0.5, rim: 0 }), [0, top + 4.0, -depth * 0.38]);
    for (const px of [-width / 2 + 1, -width / 4, 0, width / 4, width / 2 - 1]) add(grp, new THREE.CylinderGeometry(0.18, 0.18, 4.2, 8), dark, [px, top + 2.1, -depth + 0.4]);
    return { top, depth };
  }
  // behind the goal (the main view), the two sides and the far end
  const main = stand(0, -9, 0, 74, 22, 1.1, 0.93);
  stand(-43, 45, Math.PI / 2, 108, 18, 1.1, 0.85);
  stand(43, 45, -Math.PI / 2, 108, 18, 1.1, 0.85);
  stand(0, 118, Math.PI, 74, 18, 1.1, 0.85);
  // corner fill blocks
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), concrete);
    b.position.set(sx * 44, 5, -16); root.add(b);
  }
  const crowd = makeCrowd(seats);
  root.add(crowd.mesh);

  // LED boards round the pitch
  const boardTex = boardTexture();
  boardTex.repeat.set(5, 1);
  const boards = [];
  const board = (x, z, rot, w) => {
    const t = boardTex.clone(); t.repeat.set(w / 14, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.12), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: t }), dark]);
    m.position.set(x, 0.45, z); m.rotation.y = rot; root.add(m); boards.push(t);
  };
  board(0, -4.6, 0, 30); board(-23, -4.6, 0, 16); board(23, -4.6, 0, 16);
  board(-38.5, 30, Math.PI / 2, 60); board(38.5, 30, -Math.PI / 2, 60);
  board(0, 109, Math.PI, 40);
  // redraw the boards once the game font has loaded (they share one canvas)
  if (document.fonts && document.fonts.load) document.fonts.load('40px "Lilita One"').then(() => { boardTex.userData.redraw(); for (const b of boards) b.needsUpdate = true; }).catch(() => {});
  // the photographers' / ball-kid touch: a few camera boxes behind the goal line skipped (cheap)

  // floodlights: four tall masts with a bank of lamps and a soft glow
  const glowTex = (() => {
    const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,250,220,.75)'); gr.addColorStop(0.55, 'rgba(255,230,180,.18)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const lampTex = (() => {
    const cv = canvas(128, 64), g = cv.getContext('2d');
    g.fillStyle = '#3a3d52'; g.fillRect(0, 0, 128, 64);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
      const gr = g.createRadialGradient(11 + x * 21, 11 + y * 21, 1, 11 + x * 21, 11 + y * 21, 10);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#fff6d8'); gr.addColorStop(1, '#9a9cb0');
      g.fillStyle = gr; g.beginPath(); g.arc(11 + x * 21, 11 + y * 21, 9, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mast = toon(0xb9bccb, { rough: 0.6, rim: 0 });
  const lampMat = new THREE.MeshBasicMaterial({ map: lampTex });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff4dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const [x, z] of [[-40, -16], [40, -16], [-40, 106], [40, 106]]) {
    const h = 34;
    add(root, new THREE.CylinderGeometry(0.35, 0.6, h, 10), mast, [x, h / 2, z]);
    const head = new THREE.Group(); head.position.set(x, h + 1.5, z); root.add(head);
    head.lookAt(0, 0, 45);
    add(head, new THREE.BoxGeometry(7, 3.4, 0.5), mast, [0, 0, -0.3]);
    add(head, new THREE.PlaneGeometry(6.6, 3.0), lampMat, [0, 0, 0.0]);
    const gl = new THREE.Sprite(glowMat); gl.scale.set(18, 18, 1); gl.position.set(0, 0, 1.2); head.add(gl);
  }
  // flags on the main stand's roof and two big banners in the crowd
  const flags = [];
  const flagCols = [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xffcd1c, 0x8f52d9, 0xff7d22];
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.6, 12, 4); flagGeo.translate(1.3, 0, 0);
  flagCols.forEach((col, i) => {
    const x = -30 + i * 10;
    const top = main.top + 4.4;
    add(root, new THREE.CylinderGeometry(0.06, 0.06, 4, 6), mast, [x, top + 2, -9 - main.depth * 0.55]);
    const fm = flagMaterial(col); flags.push(fm);
    const f = new THREE.Mesh(flagGeo, fm); f.position.set(x + 0.06, top + 3.2, -9 - main.depth * 0.55); f.rotation.y = 0.2; root.add(f);
  });
  // a big "GO FOXINO!" banner held up in the main stand
  const banner = (() => {
    const cv = canvas(512, 128), g = cv.getContext('2d');
    g.fillStyle = '#5b2bb0'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ffcd1c'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 116, 512, 12);
    g.font = '78px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#ff7d22'; g.strokeText('GO FOXINO!', 256, 68);
    g.fillStyle = '#ffffff'; g.fillText('GO FOXINO!', 256, 68);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (document.fonts && document.fonts.load) document.fonts.load('78px "Lilita One"').then(() => {
      g.fillStyle = '#5b2bb0'; g.fillRect(0, 12, 512, 104); g.lineWidth = 10; g.strokeStyle = '#ff7d22'; g.strokeText('GO FOXINO!', 256, 68); g.fillStyle = '#ffffff'; g.fillText('GO FOXINO!', 256, 68); t.needsUpdate = true;
    }).catch(() => {});
    const bm = flagMaterial(0xffffff); bm.map = t; flags.push(bm);
    const geo = new THREE.PlaneGeometry(9, 2.25, 16, 4);
    const m = new THREE.Mesh(geo, bm); m.position.set(-9, 1.1 + 6 * 0.42 + 1.3, -9 - 6.5 * 0.85); root.add(m);
    const m2 = new THREE.Mesh(geo, bm); m2.position.set(14, 1.1 + 12 * 0.42 + 1.3, -9 - 12.5 * 0.85); root.add(m2);
    return m;
  })();

  return {
    root, sky, goal, net: goal.net, crowd,
    update(dt, t) {
      crowd.uniforms.uTime.value = t;
      for (const f of flags) f.userData.t.value = t;
      for (const b of boards) b.offset.x = (t * 0.06) % 1;
      goal.net.update(dt);
    },
  };
}
