// Shared helpers for the code-built characters: a smooth cartoon material (MeshStandard + a soft fresnel rim light)
// and small geometry shortcuts.
import * as THREE from './lib/three.module.min.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';

export const RIM = { value: new THREE.Color(0xfff1dc) };

export function toon(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.62, metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    map: o.map || null, transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0, vertexColors: !!o.vc,
    side: o.side ?? THREE.FrontSide,
  });
  const k = o.rim ?? 0.42;
  if (k > 0) {
    const uK = { value: k };
    m.userData.rim = uK;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRimK = uK; sh.uniforms.uRimC = RIM;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRimK; uniform vec3 uRimC;')
        .replace('#include <opaque_fragment>', `{
          float fr = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
          outgoingLight += uRimC * uRimK * smoothstep(0.42, 1.0, fr) * (0.3 + 0.7 * diffuseColor.rgb);
        }
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'toonrim' + (o.map ? 'm' : '');
  }
  return m;
}

export function add(parent, geo, mat, p = [0, 0, 0], s = null, r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (s) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  if (r) m.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
  parent.add(m);
  return m;
}

export function group(parent, p = [0, 0, 0], name) {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  if (name) g.name = name;
  parent.add(g);
  return g;
}

const geoCache = new Map();
export function sphere(r = 1, w = 18, h = 12) {
  const k = `s${r}_${w}_${h}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, w, h));
  return geoCache.get(k);
}
export function capsule(r, len, cap = 4, rad = 12) {
  const k = `c${r}_${len}_${cap}_${rad}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, len, cap, rad));
  return geoCache.get(k);
}

// a smooth tube along a curve whose radius changes along it (tails, hair), optionally with colours along it
export function taperTube(points, radius, segs = 40, radial = 16, color = null) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    const r = radius(t), c = color ? color(t) : null;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      nor.push(nx, ny, nz);
      if (c) col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// rotations that point a limb (upper part along d1, lower part along d2, both in the parent's frame; rest pose hangs
// along -Y): the upper joint as a ZXY Euler, the lower joint as an XYZ Euler
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ea = new THREE.Euler(), _da = new THREE.Vector3(), _db = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
export function aimLimb(d1, d2) {
  _da.set(d1[0], d1[1], d1[2]).normalize();
  _qa.setFromUnitVectors(DOWN, _da);
  _ea.setFromQuaternion(_qa, 'ZXY');
  const a = [_ea.x, _ea.y, _ea.z];
  if (!d2) return { a, b: [0, 0, 0] };
  _db.set(d2[0], d2[1], d2[2]).normalize().applyQuaternion(_qa.clone().invert());
  _qb.setFromUnitVectors(DOWN, _db);
  _ea.setFromQuaternion(_qb, 'XYZ');
  return { a, b: [_ea.x, _ea.y, _ea.z] };
}

// fewer draw calls: inside every group, merge the direct mesh children that share a material into one mesh
export function mergeStatic(root) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) {
    const buckets = new Map();
    for (const m of g.children) {
      if (!m.isMesh || m.userData.keep || Array.isArray(m.material)) continue;
      const geo = m.geometry;
      const key = m.material.uuid + '|' + Object.keys(geo.attributes).sort().join(',') + '|' + (geo.index ? 'i' : 'n');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const c = m.geometry.clone(); c.applyMatrix4(m.matrix); for (const k of Object.keys(c.morphAttributes)) delete c.morphAttributes[k]; c.clearGroups(); return c; });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.renderOrder = list[0].renderOrder;
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2);
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const backOut = (t) => { const c1 = 1.9, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
