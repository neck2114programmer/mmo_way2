import * as THREE from "three";
import type { SkillDef } from "../data/skills";
import { COLORS } from "../data/skills";
import { Vfx } from "./vfx";
import { canvasTexture, glowTexture } from "./util";

/**
 * Эффекты умений. Каждый эффект привязан к реальным параметрам умения
 * (kind / vfx / radius / hits / stun / dot / slow / dur / цвет-стихия) и запускается
 * в фазы: подготовка (windup) → срабатывание (impact, синхронно с кадром анимации) → остаточный эффект.
 */

export type Element = "fire" | "ice" | "bolt" | "dark" | "poison" | "holy" | "blood" | "nature" | "steel" | "wind" | "gold" | "shadow";
const HEX2EL: Record<string, Element> = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [v.toLowerCase(), k as Element]));
export const elementOf = (s: SkillDef): Element => HEX2EL[s.color.toLowerCase()] ?? "steel";

interface Item { obj: THREE.Object3D; life: number; max: number; tick: (u: number, dt: number) => void }
let glow: THREE.Texture | null = null;
const gtex = () => (glow ??= glowTexture("#ffffff"));
const addMat = (c: THREE.ColorRepresentation, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const sprite = (c: THREE.ColorRepresentation, o = 1, s = 0.4) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex(), color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(s); return sp; };
const rnd = (a = -1, b = 1) => a + Math.random() * (b - a);

const sigilCache = new Map<string, THREE.CanvasTexture>();
function sigilTex(color: string, sides: number) {
  const key = color + sides;
  const hit = sigilCache.get(key); if (hit) return hit;
  const t = canvasTexture(256, 256, (c, w) => {
    const r = w / 2; c.translate(r, r); c.strokeStyle = color; c.fillStyle = color; c.lineCap = "round";
    c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r * 0.96, 0, 7); c.stroke();
    c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, r * 0.82, 0, 7); c.stroke();
    c.beginPath(); for (let i = 0; i <= sides; i++) { const a = (i / sides) * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } c.stroke();
    c.beginPath(); for (let i = 0; i <= sides; i++) { const a = ((i * 2) / sides) * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; c.lineWidth = i % 3 ? 1.5 : 3; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); c.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); c.stroke(); }
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, 6, 0, 7); c.fill(); }
    c.globalAlpha = 0.25; c.beginPath(); c.arc(0, 0, r * 0.3, 0, 7); c.fill();
  });
  sigilCache.set(key, t); return t;
}

export class SkillFx {
  base: Vfx;
  group = new THREE.Group();
  private items: Item[] = [];
  private sustained = new Map<string, Item>();
  constructor(scene: THREE.Scene) { this.base = new Vfx(scene); scene.add(this.group); }

  get shake() { return this.base.shake; }
  set shake(v: number) { this.base.shake = v; }

  private add(i: Item) { this.group.add(i.obj); this.items.push(i); return i; }

  update(dt: number) {
    this.base.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i]; f.life += dt;
      const u = Math.min(1, f.life / f.max); f.tick(u, dt);
      if (f.life >= f.max) {
        this.group.remove(f.obj);
        f.obj.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | undefined; if (mt && !Array.isArray(mt)) mt.dispose(); });
        this.items.splice(i, 1);
      }
    }
  }

  // ---------------- Примитивы ----------------
  /** руническая печать на земле */
  sigil(pos: THREE.Vector3, radius: number, color: string, dur: number, sides = 6, spin = 1.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: sigilTex(color, sides), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.07; m.scale.setScalar(radius);
    this.add({ obj: m, life: 0, max: dur, tick: (u) => { m.rotation.z += spin * 0.03; (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, u * 5) * (1 - Math.pow(u, 3)) * 0.85; m.scale.setScalar(radius * (0.85 + u * 0.15)); } });
  }

  /** зигзаг молнии */
  lightning(a: THREE.Vector3, b: THREE.Vector3, color: string, dur = 0.22, width = 1) {
    const n = 14;
    const g = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.BufferGeometry();
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k ? "#ffffff" : color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(line);
    }
    const dir = b.clone().sub(a), len = dir.length();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize(), up = new THREE.Vector3(0, 1, 0);
    const rebuild = () => {
      g.children.forEach((c, k) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, j = Math.sin(t * Math.PI) * 0.35 * width * (k ? 0.5 : 1);
          pts.push(a.clone().lerp(b, t).addScaledVector(side, rnd() * j).addScaledVector(up, rnd() * j));
        }
        (c as THREE.Line).geometry.setFromPoints(pts);
      });
    };
    rebuild();
    const glowS = sprite(color, 0.9, 1.2 * Math.min(2, len * 0.12 + 0.6)); glowS.position.copy(b); g.add(glowS);
    let acc = 0;
    this.add({ obj: g, life: 0, max: dur, tick: (u, dt) => { acc += dt; if (acc > 0.035) { acc = 0; rebuild(); } g.children.forEach((c) => { const m = (c as THREE.Line).material as THREE.Material; if (m) m.opacity = 1 - u * u; }); glowS.material.opacity = 1 - u; } });
  }

  /** разлёт частиц стихии: у каждой стихии своё поведение и форма */
  flavor(pos: THREE.Vector3, el: Element, power = 1, up = 1) {
    const g = new THREE.Group(); g.position.copy(pos);
    const parts: { o: THREE.Object3D; v: THREE.Vector3; spin: number; grav: number; drag: number }[] = [];
    const col = COLORS[el];
    const mk = (): THREE.Object3D => {
      switch (el) {
        case "ice": { const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), addMat(Math.random() < 0.4 ? "#ffffff" : col, 0.95)); return m; }
        case "nature": { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? "#4fbf5a" : "#9ae86a", side: THREE.DoubleSide, transparent: true })); return m; }
        case "blood": return sprite("#c01030", 1, 0.2);
        case "steel": { const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), addMat("#fff2c0", 1)); return m; }
        case "dark": case "shadow": return sprite(Math.random() < 0.5 ? col : "#1a0830", 0.9, 0.42);
        case "poison": return sprite(col, 0.8, 0.3);
        case "holy": case "gold": { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.34), addMat(col, 0.9)); return m; }
        case "wind": return sprite(col, 0.55, 0.5);
        default: return sprite(el === "bolt" ? "#fff6a0" : Math.random() < 0.5 ? col : "#ffd080", 1, 0.28);
      }
    };
    const n = Math.round(14 * power + 6);
    for (let i = 0; i < n; i++) {
      const o = mk(); g.add(o);
      const a = Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 3.5) * power;
      let v = new THREE.Vector3(Math.cos(a) * sp, (1 + Math.random() * 3.2) * up, Math.sin(a) * sp);
      let grav = 7, drag = 0.4, spin = rnd(-8, 8);
      if (el === "fire") { v = new THREE.Vector3(Math.cos(a) * sp * 0.4, 2 + Math.random() * 3, Math.sin(a) * sp * 0.4); grav = -2.5; }
      if (el === "poison") { v = new THREE.Vector3(Math.cos(a) * sp * 0.25, 0.8 + Math.random() * 1.6, Math.sin(a) * sp * 0.25); grav = -0.8; }
      if (el === "holy" || el === "gold") { v = new THREE.Vector3(Math.cos(a) * sp * 0.3, 1.5 + Math.random() * 3, Math.sin(a) * sp * 0.3); grav = -1.5; }
      if (el === "dark" || el === "shadow") { grav = -0.5; drag = 1.6; }
      if (el === "wind") { grav = 0; drag = 1.8; v.y *= 0.2; }
      if (el === "nature") { grav = 1.5; drag = 1.4; }
      if (el === "ice") grav = 9;
      if (el === "steel") { v.multiplyScalar(2.2); grav = 5; }
      if (el === "bolt") { v.multiplyScalar(1.6); grav = 2; }
      parts.push({ o, v, spin, grav, drag });
      if ((o as THREE.Mesh).isMesh) o.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }
    this.add({ obj: g, life: 0, max: 0.9, tick: (u, dt) => {
      for (const p of parts) {
        p.v.y -= p.grav * dt; p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.o.position.addScaledVector(p.v, dt);
        if (p.o.position.y < 0 && p.grav > 0) { p.o.position.y = 0; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
        if ((p.o as THREE.Mesh).isMesh) { p.o.rotation.x += p.spin * dt; p.o.rotation.z += p.spin * 0.7 * dt; if (el === "steel" || el === "ice") p.o.lookAt(p.o.position.clone().add(p.v)); }
        const m = (p.o as THREE.Mesh | THREE.Sprite).material as THREE.Material; m.opacity = Math.min(1, (1 - u) * 1.6);
        if ((p.o as THREE.Sprite).isSprite && el === "fire") p.o.scale.multiplyScalar(1 - dt * 0.9);
      }
    } });
  }

  /** кольцо оглушения: звёзды вращаются над целью */
  stunStars(target: () => THREE.Vector3, height: number, dur: number) {
    const g = new THREE.Group();
    const stars: THREE.Object3D[] = [];
    for (let i = 0; i < 4; i++) { const s = sprite("#ffe45e", 1, 0.32); stars.push(s); g.add(s); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.012, 4, 24), addMat("#ffe45e", 0.5)); ring.rotation.x = Math.PI / 2; g.add(ring);
    this.add({ obj: g, life: 0, max: dur, tick: (u) => {
      g.position.copy(target()); g.position.y += height;
      stars.forEach((s, i) => { const a = u * dur * 5 + (i / 4) * Math.PI * 2; s.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45); });
      g.children.forEach((c) => { const m = (c as THREE.Mesh).material as THREE.Material; m.opacity = Math.min(1, (1 - u) * 4) * (c === ring ? 0.5 : 1); });
    } });
  }

  /** яд/кровотечение/ожог: капли и пузыри над целью на время dot */
  dotAura(target: () => THREE.Vector3, el: Element, dur: number, height = 1.1) {
    const g = new THREE.Group(); let acc = 0;
    this.add({ obj: g, life: 0, max: dur, tick: (_u, dt) => {
      acc += dt; const tp = target(); g.position.copy(tp);
      if (acc > 0.09) { acc = 0; const s = sprite(COLORS[el], 0.9, el === "blood" ? 0.14 : 0.22); s.position.set(rnd(-0.35, 0.35), rnd(0.2, height), rnd(-0.35, 0.35)); (s as THREE.Sprite & { vy?: number }).vy = el === "blood" ? -1.6 : el === "fire" ? 1.8 : 0.9; g.add(s); }
      for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i] as THREE.Sprite & { vy?: number; age?: number }; c.position.y += (c.vy ?? 0) * dt; c.age = (c.age ?? 0) + dt; c.material.opacity = Math.max(0, 0.9 - c.age * 1.6); if (c.age > 0.6) { g.remove(c); c.material.dispose(); } }
    } });
  }

  /** замедление: ледяные оковы — кольцо кристаллов у ног цели */
  chill(target: () => THREE.Vector3, dur: number, color: string) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4 + (i % 3) * 0.1, 4), addMat(color, 0.8)); c.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5); c.rotation.z = Math.cos(a) * 0.3; c.rotation.x = -Math.sin(a) * 0.3; g.add(c); }
    this.add({ obj: g, life: 0, max: dur, tick: (u) => { g.position.copy(target()); g.children.forEach((c) => { c.scale.setScalar(Math.min(1, u * 8) * (1 - Math.pow(u, 4))); }); } });
  }

  /** купол защиты (шестигранная сетка) */
  dome(pos: THREE.Vector3, radius: number, color: string, dur: number) {
    const tex = canvasTexture(128, 128, (c, w) => { c.strokeStyle = "#fff"; c.lineWidth = 2; const s = 22; for (let y = 0; y < w + s; y += s * 0.87) for (let x = 0; x < w + s; x += s) { const ox = (Math.round(y / (s * 0.87)) % 2) * s * 0.5; c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; c.lineTo(x + ox + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5); } c.closePath(); c.stroke(); } });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2);
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.98, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), addMat(color, 0));
    m.add(fill);
    this.add({ obj: m, life: 0, max: dur, tick: (u) => { const o = Math.min(1, u * 8) * (u > 0.8 ? (1 - u) * 5 : 1); (m.material as THREE.MeshBasicMaterial).opacity = o * 0.55; (fill.material as THREE.MeshBasicMaterial).opacity = o * 0.1; tex.offset.y -= 0.004; m.scale.setScalar(0.7 + Math.min(1, u * 6) * 0.3); } });
  }

  /** призрачный шлейф рывка */
  trail(from: THREE.Vector3, to: THREE.Vector3, color: string, width = 0.6) {
    const d = to.clone().sub(from), len = d.length();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), addMat(color, 0.6));
    m.position.copy(from).add(to).multiplyScalar(0.5); m.position.y += 0.9; m.rotation.y = -Math.atan2(d.z, d.x);
    this.add({ obj: m, life: 0, max: 0.4, tick: (u) => { (m.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.55; m.scale.y = 1 - u * 0.8; } });
    for (let i = 0; i < 6; i++) { const s = sprite(color, 0.6, 0.9); s.position.copy(from).lerp(to, i / 5); s.position.y += 0.9; this.add({ obj: s, life: -i * 0.03, max: 0.35, tick: (u) => { s.material.opacity = (1 - u) * 0.5; } }); }
  }

  /** хлыст: кривая трубка от руки к цели с волной */
  lash(from: THREE.Vector3, to: THREE.Vector3, color: string) {
    const pts = () => { const out: THREE.Vector3[] = []; return out; };
    void pts;
    const N = 18; const geo = new THREE.BufferGeometry();
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const line2 = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const g = new THREE.Group(); g.add(line, line2);
    const dir = to.clone().sub(from); const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    this.add({ obj: g, life: 0, max: 0.38, tick: (u) => {
      const reach = Math.min(1, u * 3.2), pp: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) { const t = (i / N) * reach; const w = Math.sin(t * Math.PI * 3 - u * 14) * (1 - u) * 0.9 * Math.sin(Math.min(1, t) * Math.PI); pp.push(from.clone().lerp(to, t).addScaledVector(side, w).setY(from.y + Math.sin(t * Math.PI) * 0.5)); }
      geo.setFromPoints(pp); (line.material as THREE.Material).opacity = 1 - u * u; (line2.material as THREE.Material).opacity = (1 - u) * 0.7;
    } });
    this.flavor(to, "nature", 0.5);
  }

  /** лучи света сверху вниз (святое/золото) */
  rays(pos: THREE.Vector3, color: string, n = 5, h = 6) {
    const g = new THREE.Group(); g.position.copy(pos);
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28 + Math.random() * 0.3, h), addMat(color, 0.5)); m.position.set(rnd(-0.8, 0.8), h / 2, rnd(-0.8, 0.8)); m.rotation.y = Math.random() * 3; g.add(m); }
    this.add({ obj: g, life: 0, max: 0.9, tick: (u) => { g.children.forEach((c, i) => { (c as THREE.Mesh).material = (c as THREE.Mesh).material; ((c as THREE.Mesh).material as THREE.Material).opacity = Math.sin(Math.min(1, u * (1.1 + i * 0.05)) * Math.PI) * 0.5; c.scale.x = 1 - u * 0.5; }); } });
  }

  /** подготовка: свечение в руке/на оружии, частицы сходятся, печать под ногами */
  windup(at: () => THREE.Vector3, feet: THREE.Vector3, s: SkillDef, dur: number) {
    const el = elementOf(s), col = s.color;
    const g = new THREE.Group();
    const core = sprite(col, 0.9, 0.2), halo = sprite("#ffffff", 0.6, 0.1); g.add(core, halo);
    const motes: { s: THREE.Sprite; a: number; r: number; y: number }[] = [];
    const nm = el === "steel" ? 4 : 10;
    for (let i = 0; i < nm; i++) { const m = sprite(col, 0.8, 0.14); g.add(m); motes.push({ s: m, a: Math.random() * 6.28, r: 0.6 + Math.random() * 0.7, y: rnd(-0.5, 0.5) }); }
    this.add({ obj: g, life: 0, max: Math.max(0.12, dur), tick: (u) => {
      g.position.copy(at());
      const k = u * u * (3 - 2 * u);
      core.scale.setScalar(0.2 + k * (0.9 + s.power * 0.15)); halo.scale.setScalar(0.1 + k * 0.5);
      core.material.opacity = 0.4 + k * 0.6;
      motes.forEach((m) => { const r = m.r * (1 - k); m.s.position.set(Math.cos(m.a + u * 8) * r, m.y * (1 - k), Math.sin(m.a + u * 8) * r); m.s.material.opacity = k < 0.95 ? 0.9 : 0; });
    } });
    const heavy = s.power >= 2 || (s.kind !== "tgt" && s.kind !== "dash");
    if (heavy && s.kind !== "dash") this.sigil(feet, s.kind === "aoe" || s.kind === "aoet" ? Math.min(3, 1 + s.radius * 0.3) : 1.4, col, dur + 0.5, el === "holy" || el === "gold" ? 8 : el === "dark" || el === "shadow" ? 5 : el === "fire" ? 6 : el === "ice" ? 6 : 4);
  }

  // ---------------- Срабатывание умения ----------------
  /**
   * @param caster позиция ног кастера, @param hand мировая точка руки/оружия,
   * @param target позиция цели (для tgt/aoet) или null
   * @param dir угол взгляда кастера (atan2 по x/z)
   */
  fire(s: SkillDef, caster: THREE.Vector3, hand: THREE.Vector3, target: THREE.Vector3 | null, dir: number, getTarget?: () => THREE.Vector3, onHit?: () => void) {
    const el = elementOf(s), col = s.color, V = this.base;
    const tp = target ?? caster.clone().add(new THREE.Vector3(Math.sin(dir) * 3, 0, Math.cos(dir) * 3));
    const chest = (p: THREE.Vector3) => p.clone().setY(p.y + 1.0);
    const hits = Math.max(1, s.hits ?? 1);
    const hit = (p: THREE.Vector3, power = 1) => {
      V.impact(chest(p), col, Math.round(8 * power), 0.7 * power);
      this.flavor(p.clone().setY(p.y + 0.8), el, power * 0.8);
      onHit?.();
    };
    const afterHit = (p: THREE.Vector3) => {
      if (s.stun) this.stunStars(() => (getTarget ? getTarget() : p), 2.2, Math.min(s.stun, 3));
      if (s.slow) this.chill(() => (getTarget ? getTarget() : p), 2.2, COLORS.ice);
      if (s.dot) this.dotAura(() => (getTarget ? getTarget() : p), el === "steel" || el === "wind" ? "blood" : el, Math.min(s.dur || 3, 4));
    };
    const toTarget = () => Math.atan2(tp.x - caster.x, tp.z - caster.z);
    const sd = (a: number) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));

    switch (s.kind ?? "tgt") {
      case "tgt": {
        const v = s.vfx;
        if (v === "bolt" || v === "arrow") {
          for (let i = 0; i < hits; i++) setTimeout(() => V.projectile(hand.clone(), () => chest(getTarget ? getTarget() : tp), col, v === "arrow" ? "arrow" : el === "dark" || el === "shadow" ? "orb" : "bolt", v === "arrow" ? 38 : 26, () => { hit(getTarget ? getTarget() : tp, 0.9); if (i === hits - 1) afterHit(tp); }), i * 110);
        } else if (v === "beam") {
          const pulses = el === "bolt" ? 3 : 2;
          for (let i = 0; i < pulses; i++) setTimeout(() => {
            if (el === "bolt") this.lightning(hand.clone(), chest(getTarget ? getTarget() : tp), col, 0.25, 1.2); else V.beam(hand.clone(), chest(getTarget ? getTarget() : tp), col, 0.5);
            hit(getTarget ? getTarget() : tp, 0.7);
          }, i * 170);
          afterHit(tp);
        } else if (v === "whip") {
          this.lash(hand.clone(), chest(tp), col); hit(tp, 0.8); afterHit(tp);
        } else {
          // ближний бой: полумесяц(ы) + искры; многоударные — серия под разными углами
          for (let i = 0; i < hits; i++) setTimeout(() => {
            const a = toTarget();
            const mid = caster.clone().addScaledVector(sd(a), Math.min(1.6, caster.distanceTo(tp) * 0.6)); mid.y += 1.0;
            if (v === "stab") { V.slash(mid, a + rnd(-0.3, 0.3), col, 1.0, 0.35); V.slash(mid, a + rnd(-0.3, 0.3), "#ffffff", 0.8, 0.3); }
            else if (v === "bash") { V.ring(tp, 1.6, col, 0.45, 0.2); V.quake(tp, 1.4, col); this.shake = 0.5; }
            else V.slash(mid, a + (i % 2 ? -1 : 1) * (0.4 + rnd(0, 0.3)), col, v === "cleave" ? 2.3 : 1.7, v === "cleave" ? 1.15 : 0.9);
            hit(tp, v === "bash" || v === "cleave" ? 1.2 : 0.8);
            if (i === hits - 1) afterHit(tp);
          }, i * (hits > 3 ? 90 : 120));
        }
        break;
      }
      case "aoe": {
        const r = Math.max(2.5, s.radius || 5);
        const v = s.vfx;
        if (v === "whirl" || v === "cleave") { V.whirl(caster, r, col); this.sigil(caster, r * 0.6, col, 0.7, 4, 3); }
        else if (v === "quake") { V.quake(caster, r, col); this.shake = 0.9; this.flavor(caster, el === "steel" ? "fire" : el, 1.2); }
        else { V.nova(caster, r, col); this.sigil(caster, r * 0.55, col, 0.9, 6); }
        this.flavor(caster.clone().setY(0.4), el, 1.1);
        if (el === "bolt") for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + rnd(0, 1); setTimeout(() => this.lightning(caster.clone().setY(1.2), caster.clone().addScaledVector(sd(a), r * 0.9).setY(0.3), col, 0.2), i * 40); }
        if (el === "ice" || s.slow) V.ring(caster, r, COLORS.ice, 0.8);
        onHit?.();
        break;
      }
      case "aoet": {
        const r = Math.max(2.5, s.radius || 5);
        V.telegraph(tp, r, 0.55);
        const land = () => {
          if (s.vfx === "rain") V.rain(tp, r, col, el === "fire" ? "meteor" : el === "bolt" ? "bolt" : "arrow", () => { this.flavor(tp, el, 0.5); });
          else if (s.vfx === "pillar") { V.pillar(tp, r, col); if (el === "holy" || el === "gold") this.rays(tp, col, 6, 8); this.flavor(tp, el, 1.2); }
          else if (s.vfx === "quake") { V.quake(tp, r, col); this.shake = 0.8; this.flavor(tp, el, 1.2); }
          else { V.nova(tp, r, col); this.flavor(tp, el, 1.2); if (el === "bolt") for (let i = 0; i < 4; i++) setTimeout(() => this.lightning(tp.clone().setY(9), tp.clone().add(new THREE.Vector3(rnd(-r, r) * 0.6, 0.2, rnd(-r, r) * 0.6)), col, 0.25, 1.5), i * 80); }
          this.sigil(tp, r * 0.7, col, 1.0, 6);
          onHit?.();
        };
        setTimeout(land, 450);
        break;
      }
      case "dash": {
        this.trail(caster.clone(), tp.clone().addScaledVector(sd(toTarget() + Math.PI), 1.2), col);
        setTimeout(() => { V.slash(chest(tp).addScaledVector(sd(toTarget() + Math.PI), 0.6), toTarget(), col, 1.9, 1.0); hit(tp, 1.1); afterHit(tp); }, 160);
        break;
      }
      case "heal": {
        V.heal(caster, col); this.sigil(caster, 1.8, col, 1.2, 8, 0.8); this.rays(caster, col, 4, 5);
        for (let i = 0; i < 12; i++) setTimeout(() => { const sp = sprite(i % 2 ? "#ffffff" : col, 0.9, 0.22); sp.position.copy(caster).add(new THREE.Vector3(rnd(-0.6, 0.6), 0.2, rnd(-0.6, 0.6))); this.add({ obj: sp, life: 0, max: 1.0, tick: (u) => { sp.position.y += 0.025 + u * 0.01; sp.material.opacity = (1 - u) * 0.9; } }); }, i * 60);
        onHit?.();
        break;
      }
      case "buff": {
        V.buff(caster, col); this.sigil(caster, 1.5, col, 1.0, el === "gold" ? 8 : 5, 2);
        const b = s.buff ?? {};
        // шевроны вверх: количество = число усиливаемых параметров
        const n = Math.max(1, Object.keys(b).length);
        for (let i = 0; i < n * 3; i++) setTimeout(() => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 4, 1, true), addMat(col, 0.9)); c.position.copy(caster).add(new THREE.Vector3(Math.cos(i * 2) * 0.55, 0.1, Math.sin(i * 2) * 0.55)); this.add({ obj: c, life: 0, max: 0.9, tick: (u) => { c.position.y += 0.03; c.material instanceof THREE.Material && (c.material.opacity = 1 - u); } }); }, i * 70);
        this.flavor(caster, el, 0.6);
        onHit?.();
        break;
      }
      case "shield": {
        this.dome(caster.clone(), 1.7, col, Math.max(1.5, Math.min(4, s.dur || 3)));
        V.shield(caster, col); this.sigil(caster, 1.8, col, 0.9, 6, 0.6);
        onHit?.();
        break;
      }
      case "summon": {
        V.summon(tp, col); this.sigil(tp, 2.3, col, 1.6, 5, 1.5);
        for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6, 1, true), addMat(col, 0.5)); m.position.copy(tp).add(new THREE.Vector3(Math.cos(i * 1.57) * 1.5, 3, Math.sin(i * 1.57) * 1.5)); this.add({ obj: m, life: 0, max: 1.0, tick: (u) => { (m.material as THREE.Material).opacity = Math.sin(u * Math.PI) * 0.5; } }); }
        this.flavor(tp, el === "steel" ? "nature" : el, 1.3);
        onHit?.();
        break;
      }
    }
  }
  dispose() { this.items.forEach((i) => this.group.remove(i.obj)); this.items = []; this.sustained.clear(); }
}
