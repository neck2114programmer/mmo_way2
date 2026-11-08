import * as THREE from "three";
import { canvasTexture, limb, mesh, sphere, stdMat } from "./util";
import { faceZ, type FaceShape } from "./face";

/* =====================================================================
 *  Анатомия: кисти с настоящими пальцами, 3D-глаза с веками,
 *  подвижные брови и мимика рта (морф-таргеты).
 * ===================================================================== */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------- КИСТИ -------------------------------
export interface HandMats {
  skin: THREE.Material;
  glove?: THREE.Material; // материал пальцев/ладони, если есть перчатка
  plate?: THREE.Material; // пластина на тыльной стороне кисти (латная перчатка)
  cuff?: THREE.Material; // манжета на запястье
  trim?: THREE.Material;
  nail?: THREE.Material;
}

const FINGERS = [
  { z: 0.026, len: [0.038, 0.024, 0.02], r: 0.0088 }, // указательный
  { z: 0.009, len: [0.042, 0.027, 0.021], r: 0.009 }, // средний
  { z: -0.008, len: [0.039, 0.025, 0.02], r: 0.0086 }, // безымянный
  { z: -0.024, len: [0.031, 0.019, 0.017], r: 0.0078 }, // мизинец
];
const OPEN = [0.04, 0.05, 0.03];
const FIST = [1.42, 1.62, 1.18];

export class HandRig {
  fingers: THREE.Object3D[][] = [];
  thumb: THREE.Object3D[] = [];
  thumbBase!: THREE.Object3D;
  /** pd = +1 если ладонь смотрит в +x (правая рука), -1 для левой */
  constructor(public pd: number) {}

  /** curl 0..1 — раскрытая → сжатая; spread — разведение пальцев; t — время для микродвижений */
  setCurl(curl: number, spread = 0.0, t = 0, phase = 0) {
    for (let i = 0; i < this.fingers.length; i++) {
      const f = this.fingers[i];
      const k = curl * (1 + (i - 1.5) * 0.05);
      const live = Math.sin(t * 1.3 + i * 0.9 + phase) * 0.03 * (1 - curl);
      for (let s = 0; s < 3; s++) f[s].rotation.z = this.pd * (lerp(OPEN[s], FIST[s], Math.min(1, k)) + live);
      f[0].rotation.x = (i - 1.5) * spread * 0.22;
    }
    const tc = Math.min(1, curl * 1.1);
    this.thumbBase.rotation.z = this.pd * lerp(0.35, 0.95, tc);
    this.thumb[0].rotation.z = this.pd * lerp(0.0, 0.55, tc);
    this.thumb[1].rotation.z = this.pd * lerp(0.05, 0.75, tc);
  }
}

export function buildHand(parent: THREE.Object3D, pd: number, m: HandMats, bone = false): HandRig {
  const rig = new HandRig(pd);
  const hand = new THREE.Group();
  parent.add(hand);
  const gl = m.glove ?? m.skin;
  const add = <T extends THREE.Object3D>(p: THREE.Object3D, c: T, x = 0, y = 0, z = 0): T => { c.position.set(x, y, z); p.add(c); return c; };

  if (bone) {
    const bm = m.skin;
    add(hand, mesh(sphere(0.02, 0.8, 1.4, 1.1), bm), 0, -0.05, 0);
    FINGERS.forEach((fd, i) => {
      let p: THREE.Object3D = add(hand, new THREE.Group(), 0, -0.088, fd.z);
      const segs: THREE.Object3D[] = [];
      for (let s = 0; s < 3; s++) {
        add(p, mesh(limb(0.005, 0.0045, fd.len[s], 5), bm));
        segs.push(p);
        p = add(p, new THREE.Group(), 0, -fd.len[s], 0);
      }
      rig.fingers[i] = segs;
    });
    const tb = add(hand, new THREE.Group(), pd * 0.006, -0.04, 0.03); tb.rotation.x = -0.7; rig.thumbBase = tb;
    const t0 = add(tb, new THREE.Group()); add(t0, mesh(limb(0.006, 0.005, 0.035, 5), bm));
    const t1 = add(t0, new THREE.Group(), 0, -0.035, 0); add(t1, mesh(limb(0.005, 0.0045, 0.028, 5), bm));
    rig.thumb = [t0, t1];
    return rig;
  }

  // ---- запястье + манжета
  add(hand, mesh(limb(0.027, 0.03, 0.04, 10), m.skin), 0, 0.008, 0);
  if (m.cuff) {
    const c = add(hand, mesh(limb(0.034, 0.038, 0.05, 12), m.cuff), 0, 0.01, 0);
    c.scale.set(1, 1, 1.12);
    if (m.trim) add(hand, mesh(new THREE.TorusGeometry(0.036, 0.005, 6, 14), m.trim), 0, -0.04, 0).rotation.x = Math.PI / 2;
  }
  // ---- ладонь: основная масса + подушечки (возвышения большого пальца и мизинца)
  add(hand, mesh(sphere(0.032, 0.5, 1.5, 1.05, 14), gl), -pd * 0.002, -0.052, 0.002);
  add(hand, mesh(sphere(0.02, 0.8, 1.1, 1.0, 10), gl), pd * 0.011, -0.045, 0.03); // тенар
  add(hand, mesh(sphere(0.017, 0.8, 1.2, 0.9, 10), gl), pd * 0.008, -0.05, -0.027); // гипотенар
  for (let i = 0; i < 4; i++) add(hand, mesh(sphere(0.0072, 1, 1, 1, 8), gl), -pd * 0.012, -0.09, FINGERS[i].z);
  if (m.plate) {
    const bp = add(hand, mesh(new THREE.SphereGeometry(0.036, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m.plate), -pd * 0.008, -0.058, 0.0);
    bp.rotation.z = pd * Math.PI / 2; bp.scale.set(0.5, 1.35, 1.0);
  }
  // ---- пальцы: 3 фаланги, суставы, ногти
  FINGERS.forEach((fd, i) => {
    let p: THREE.Object3D = add(hand, new THREE.Group(), -pd * 0.004, -0.092, fd.z);
    const segs: THREE.Object3D[] = [];
    for (let s = 0; s < 3; s++) {
      const r0 = fd.r * (1 - s * 0.1), r1 = fd.r * (1 - (s + 1) * 0.1) * 0.95;
      add(p, mesh(limb(r0, r1, fd.len[s], 7), gl));
      add(p, mesh(sphere(r0 * 1.02, 1, 1, 1, 8), gl));
      segs.push(p);
      if (s === 2) {
        if (!m.glove && m.nail) add(p, mesh(sphere(r1 * 0.95, 0.35, 1.25, 0.9, 6), m.nail), -pd * r1 * 0.8, -fd.len[2] * 0.62, 0);
        else if (m.plate) add(p, mesh(sphere(r1 * 1.1, 1.0, 1.0, 1.0, 6), m.plate), 0, -fd.len[2], 0);
      }
      p = add(p, new THREE.Group(), 0, -fd.len[s], 0);
    }
    rig.fingers[i] = segs;
  });
  // ---- большой палец
  const tb = add(hand, new THREE.Group(), pd * 0.009, -0.034, 0.03);
  tb.rotation.x = -0.75;
  rig.thumbBase = tb;
  const t0 = add(tb, new THREE.Group());
  add(t0, mesh(limb(0.0115, 0.0105, 0.036, 8), gl));
  add(t0, mesh(sphere(0.011, 1, 1, 1, 8), gl));
  const t1 = add(t0, new THREE.Group(), 0, -0.036, 0);
  add(t1, mesh(limb(0.0102, 0.0088, 0.03, 8), gl));
  add(t1, mesh(sphere(0.0095, 1, 1, 1, 8), gl), 0, -0.03, 0);
  if (!m.glove && m.nail) add(t1, mesh(sphere(0.0085, 0.35, 1.2, 0.9, 6), m.nail), -pd * 0.007, -0.03, 0);
  rig.thumb = [t0, t1];
  rig.setCurl(0.3);
  return rig;
}

// ------------------------------- ГЛАЗА -------------------------------
const irisCache = new Map<string, THREE.CanvasTexture>();
function irisTexture(color: string, style: number) {
  const key = color + style;
  const hit = irisCache.get(key);
  if (hit) return hit;
  const base = new THREE.Color(color);
  const dark = "#" + base.clone().multiplyScalar(0.35).getHexString();
  const light = "#" + base.clone().lerp(new THREE.Color("#ffffff"), 0.35).getHexString();
  const tex = canvasTexture(128, 128, (c, w) => {
    const r = w / 2;
    const g = c.createRadialGradient(r, r, r * 0.2, r, r, r);
    g.addColorStop(0, light); g.addColorStop(0.45, color); g.addColorStop(0.85, dark); g.addColorStop(1, "#050304");
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r, 0, 7); c.fill();
    c.globalAlpha = 0.28; c.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + Math.sin(i * 12.9) * 0.05;
      c.strokeStyle = i % 2 ? light : dark;
      c.beginPath(); c.moveTo(r + Math.cos(a) * r * 0.34, r + Math.sin(a) * r * 0.34); c.lineTo(r + Math.cos(a) * r * 0.9, r + Math.sin(a) * r * 0.9); c.stroke();
    }
    c.globalAlpha = 1;
    const pr = r * (style === 2 ? 0.42 : 0.34);
    c.fillStyle = "#050304"; c.beginPath(); c.ellipse(r, r, pr * (style === 3 ? 0.55 : 1), pr, 0, 0, 7); c.fill();
  });
  irisCache.set(key, tex);
  return tex;
}

export interface EyeRig {
  group: THREE.Group;
  ball: THREE.Group;
  upper: THREE.Group;
  lower: THREE.Group;
  side: number;
  R: number;
}

export function buildEye(fs: FaceShape, side: number, size: number, color: string, style: number, skin: THREE.Material, glow = false, lashColor = "#150c0a"): EyeRig {
  const cx = side * 0.0405, cy = 0.012;
  const R = 0.0128 * size * (fs.female ? 1.06 : 1);
  const group = new THREE.Group();
  group.position.set(cx, cy, faceZ(cx, cy, fs) - R * 0.5);
  const ball = new THREE.Group();
  group.add(ball);
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshStandardMaterial({ color: "#f4efe9", roughness: 0.22, emissive: new THREE.Color("#8a8480"), emissiveIntensity: 0.55 }));
  ball.add(sclera);
  const ir = R * 0.56;
  const irisGeo = new THREE.CircleGeometry(ir, 32);
  const ip = irisGeo.attributes.position;
  for (let i = 0; i < ip.count; i++) ip.setZ(i, Math.sqrt(Math.max(0, R * R - ip.getX(i) ** 2 - ip.getY(i) ** 2)) + 0.0003);
  const itex = irisTexture(glow ? "#9cffb0" : color, style);
  const irisMat = new THREE.MeshStandardMaterial({ map: itex, roughness: 0.3, emissive: new THREE.Color("#ffffff"), emissiveMap: itex, emissiveIntensity: glow ? 1.4 : 0.32 });
  ball.add(new THREE.Mesh(irisGeo, irisMat));
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(R * 1.025, 20, 12), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false }));
  ball.add(cornea);
  const spark = new THREE.Mesh(new THREE.CircleGeometry(R * 0.13, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  spark.position.set(R * 0.2, R * 0.24, R * 1.03);
  ball.add(spark);

  // веки: полусферические оболочки, вращаются вокруг оси X через центр глаза
  const lidR = R * 1.1;
  const upper = new THREE.Group(), lower = new THREE.Group();
  upper.add(new THREE.Mesh(new THREE.SphereGeometry(lidR, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin));
  lower.add(new THREE.Mesh(new THREE.SphereGeometry(lidR * 0.995, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin));
  const lashMat = stdMat(lashColor, { rough: 0.6 });
  const upRim = new THREE.Mesh(new THREE.TorusGeometry(lidR, 0.0011 * size + (fs.female ? 0.0008 : 0), 4, 28), lashMat);
  upRim.rotation.x = Math.PI / 2; upper.add(upRim);
  const loRim = new THREE.Mesh(new THREE.TorusGeometry(lidR * 0.995, 0.0007, 4, 24), stdMat("#6a3c3a", { rough: 0.6 }));
  loRim.rotation.x = Math.PI / 2; lower.add(loRim);
  const nL = fs.female ? 7 : 4;
  for (let i = 0; i < nL; i++) {
    const a = -0.9 + (i / (nL - 1)) * 1.8;
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.0007, fs.female ? 0.0075 : 0.0045, 3), lashMat);
    l.position.set(Math.sin(a) * lidR, 0.0004, Math.cos(a) * lidR);
    l.rotation.set(Math.PI / 2 - 0.5, 0, -Math.sin(a) * 0.8);
    upper.add(l);
  }
  group.add(upper, lower);
  const rig: EyeRig = { group, ball, upper, lower, side, R };
  setLids(rig, 1.0);
  return rig;
}

/** open: 0 — закрыт, 1 — норма, >1 — широко; squint — прищур нижним веком */
export function setLids(e: EyeRig, open: number, squint = 0, tilt = 0) {
  const o = Math.max(0, Math.min(1.4, open));
  e.upper.rotation.x = lerp(0.4, -0.52, Math.min(1, o)) - Math.max(0, o - 1) * 0.6 + squint * 0.1;
  e.lower.rotation.x = lerp(-0.16, 0.5, Math.min(1, o)) - squint * 0.28;
  e.upper.rotation.z = e.lower.rotation.z = tilt * e.side * 0.18;
}

export function setGaze(e: EyeRig, yaw: number, pitch: number) {
  e.ball.rotation.set(-pitch, yaw, 0);
}

// ------------------------------- БРОВИ -------------------------------
export interface BrowRig { pivot: THREE.Group; side: number }

export function buildBrow(fs: FaceShape, side: number, style: number, color: string): BrowRig {
  const pivot = new THREE.Group();
  const cx = side * 0.0405, cy = 0.012;
  const by = fs.female ? 0.042 : 0.038;
  pivot.position.set(cx, cy, 0);
  const arch = [0, 0.7, 0.2, 0.15][style] ?? 0.4;
  const slope = [0, 0, 0.35, -0.1][style] ?? 0;
  const thick = [0.0042, 0.0038, 0.0048, 0.0024][style] ?? 0.004;
  const pts: THREE.Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = side * (0.012 + u * 0.044);
    const y = by + Math.sin(u * Math.PI) * 0.007 * arch + (u - 0.2) * slope * 0.02 - u * (fs.female ? 0.004 : 0.0);
    pts.push(new THREE.Vector3(x - cx, y - cy, faceZ(x, y, fs) + 0.0016));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 16, 1, 6, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; curve.getPointAt(t, c);
    const r = thick * (0.8 + 0.5 * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.75)) * (1 - t * 0.55) * (fs.female ? 0.85 : 1.15);
    for (let j = 0; j <= 6; j++) {
      const idx = i * 7 + j;
      const v = new THREE.Vector3().fromBufferAttribute(pos, idx).sub(c);
      pos.setXYZ(idx, c.x + v.x * r, c.y + v.y * r * 1.15, c.z + v.z * r * 0.55);
    }
  }
  g.computeVertexNormals();
  pivot.add(new THREE.Mesh(g, stdMat(color, { rough: 0.85 })));
  return { pivot, side };
}

// ------------------------------- РОТ / МИМИКА -------------------------------
export interface FaceRig {
  mesh: THREE.Mesh;
  cavity: THREE.Mesh;
  teeth: THREE.Mesh;
}

const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((y - cy) ** 2) / (2 * sy * sy)));

/** Морф-таргеты: 0 — открытие челюсти, 1 — улыбка (отрицательное значение — печаль) */
export function addExpressionMorphs(geo: THREE.BufferGeometry) {
  const p = geo.attributes.position;
  const open = new Float32Array(p.count * 3), smile = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const front = Math.max(0, Math.min(1, z / 0.07));
    const below = Math.max(0, Math.min(1, (-0.0655 - y) / 0.03));
    const jaw = below * front * Math.max(0, 1 - Math.abs(x) / 0.09) * (y > -0.14 ? 1 : Math.max(0, 1 - (-0.14 - y) / 0.03));
    open[i * 3 + 1] = -0.0125 * jaw; open[i * 3 + 2] = -0.003 * jaw;
    const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
    const corner = gauss(ax, y, 0.021, -0.0645, 0.013, 0.009) * front;
    smile[i * 3 + 1] = 0.0055 * corner; smile[i * 3] = sgn * 0.0035 * corner;
    const cheek = gauss(ax, y, 0.04, -0.03, 0.02, 0.016) * front;
    smile[i * 3 + 1] += 0.0025 * cheek; smile[i * 3 + 2] += 0.002 * cheek;
  }
  geo.morphAttributes.position = [new THREE.BufferAttribute(open, 3), new THREE.BufferAttribute(smile, 3)];
  geo.morphTargetsRelative = true;
}

export function buildMouthInterior(fs: FaceShape): { cavity: THREE.Mesh; teeth: THREE.Mesh } {
  const z = faceZ(0, -0.0645, fs);
  const cavity = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 16), new THREE.MeshBasicMaterial({ color: "#2a0b0e", polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  cavity.position.set(0, -0.0645, z + 0.0012); cavity.renderOrder = 3;
  const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.019, 0.004), new THREE.MeshBasicMaterial({ color: "#efe9dc", polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  teeth.position.set(0, -0.0625, z + 0.0016); teeth.renderOrder = 4;
  cavity.visible = teeth.visible = false;
  return { cavity, teeth };
}

export function setMouth(f: FaceRig, open: number, smile: number) {
  const inf = f.mesh.morphTargetInfluences;
  if (inf) { inf[0] = open; inf[1] = smile; }
  const o = Math.max(0, open);
  f.cavity.visible = o > 0.06;
  f.teeth.visible = o > 0.12;
  if (f.cavity.visible) {
    f.cavity.scale.set(1 + smile * 0.25, Math.max(0.05, o), 1);
    f.cavity.position.y = -0.0645 - o * 0.0062;
  }
}

export type Emotion = "neutral" | "happy" | "angry" | "sad" | "surprised" | "focus" | "pain" | "roar" | "dead" | "smug";
export interface FaceState { smile: number; lids: number; squint: number; browY: number; browTilt: number; mouthOpen: number }
export const EMOTIONS: Record<Emotion, FaceState> = {
  neutral: { smile: 0.0, lids: 1, squint: 0, browY: 0, browTilt: 0, mouthOpen: 0 },
  happy: { smile: 1, lids: 0.85, squint: 0.7, browY: 0.003, browTilt: -0.2, mouthOpen: 0.15 },
  angry: { smile: -0.6, lids: 0.78, squint: 0.4, browY: -0.005, browTilt: 1, mouthOpen: 0.1 },
  sad: { smile: -1, lids: 0.7, squint: 0, browY: 0.002, browTilt: -1, mouthOpen: 0 },
  surprised: { smile: 0, lids: 1.3, squint: 0, browY: 0.008, browTilt: 0, mouthOpen: 0.6 },
  focus: { smile: -0.1, lids: 0.82, squint: 0.35, browY: -0.003, browTilt: 0.55, mouthOpen: 0 },
  pain: { smile: -0.8, lids: 0.35, squint: 1, browY: -0.002, browTilt: -0.8, mouthOpen: 0.5 },
  roar: { smile: -0.3, lids: 0.7, squint: 0.8, browY: -0.006, browTilt: 1, mouthOpen: 1 },
  dead: { smile: -0.2, lids: 0.0, squint: 0, browY: 0, browTilt: 0, mouthOpen: 0.25 },
  smug: { smile: 0.5, lids: 0.78, squint: 0.2, browY: 0.002, browTilt: 0.3, mouthOpen: 0 },
};
