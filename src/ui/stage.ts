import * as THREE from "three";
import { CharacterModel, type CharOpts } from "../game/render/character";
import { SkillFx } from "../game/render/skillfx";
import { animForSkill, animInfo } from "../game/render/clips";
import { CLASSES } from "../game/data/classes";
import { COLORS, type SkillDef } from "../game/data/skills";
import { disposeObject, RIM } from "../game/render/util";
import { defaultAppearance } from "../game/data/classes";
import type { ClassId } from "../game/types";
import type { Emotion } from "../game/render/anatomy";

export type CamPreset = "fight" | "full" | "portrait" | "hands";

export interface CastInfo { kind: string; dur: number; impact: number }

/** Сцена-студия: герой + мишень + эффекты умений. */
export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  hero!: CharacterModel;
  target!: CharacterModel;
  fx: SkillFx;
  heroOpts!: CharOpts;
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private yaw = 2.25; private pitch = 0.14; private dist = 8.6;
  private center = new THREE.Vector3(0, 1, 3.2);
  private cTarget = { center: new THREE.Vector3(0, 1, 3.2), dist: 8.6 };
  preset: CamPreset = "fight";
  private floor!: THREE.Mesh; private floorTex!: THREE.Texture;
  private tread = 0; private walkSpeed = 0;
  private dash: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; back: boolean } | null = null;
  private turnAnim: { t: number; from: number; to: number } | null = null;
  private stopTimer = 0;
  private dispose_: (() => void)[] = [];
  onCast?: (c: CastInfo | null) => void;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();

  constructor(private mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";

    const s = this.scene;
    s.background = new THREE.Color("#171322"); s.fog = new THREE.Fog("#171322", 16, 48);
    s.add(new THREE.HemisphereLight("#c9d6ff", "#40302a", 0.9));
    const key = new THREE.DirectionalLight("#fff0d8", 2.4); key.position.set(4, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; key.shadow.bias = -0.0004;
    key.target.position.set(0, 0, 2); s.add(key, key.target);
    const rim = new THREE.DirectionalLight("#7fa8ff", 1.5); rim.position.set(-5, 4, -4); s.add(rim);
    const warm = new THREE.PointLight("#ff9a5a", 18, 12, 2); warm.position.set(-2.5, 1.8, 1.5); s.add(warm);
    RIM.strength.value = 0.35;

    // сцена-подиум с бегущей разметкой — виден проскальзывание стоп
    const tex = new THREE.CanvasTexture(this.floorCanvas()); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(8, 8); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex = tex;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; s.add(this.floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.06, 64), new THREE.MeshBasicMaterial({ color: "#ffd88a", transparent: true, opacity: 0.55 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; s.add(ring);

    this.fx = new SkillFx(s);
    this.buildTarget();
    this.setHero({ cls: "warrior", gender: "male", app: defaultAppearance("male"), armorTier: 1, weaponTier: 1 });

    const el = this.renderer.domElement;
    let drag = false, lx = 0, ly = 0;
    const pd = (e: PointerEvent) => { drag = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => { if (!drag) return; this.yaw -= (e.clientX - lx) * 0.008; this.pitch = Math.max(-0.2, Math.min(1.1, this.pitch + (e.clientY - ly) * 0.005)); lx = e.clientX; ly = e.clientY; };
    const pu = () => { drag = false; };
    const wh = (e: WheelEvent) => { e.preventDefault(); this.cTarget.dist = Math.max(0.5, Math.min(16, this.cTarget.dist * (e.deltaY > 0 ? 1.1 : 0.9))); };
    el.addEventListener("pointerdown", pd); el.addEventListener("pointermove", pm); el.addEventListener("pointerup", pu); el.addEventListener("wheel", wh, { passive: false });
    this.dispose_.push(() => { el.removeEventListener("pointerdown", pd); el.removeEventListener("pointermove", pm); el.removeEventListener("pointerup", pu); el.removeEventListener("wheel", wh); });
    const ro = new ResizeObserver(() => this.resize()); ro.observe(mount); this.dispose_.push(() => ro.disconnect());
    this.resize();
    this.loop();
  }

  private floorCanvas() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d")!;
    g.fillStyle = "#2b2438"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${130 + Math.random() * 50},${170},${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    g.strokeStyle = "#6d5f8a"; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254); g.strokeStyle = "#47395f"; g.lineWidth = 1; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    return c;
  }

  private buildTarget() {
    this.target?.group.removeFromParent();
    this.target = new CharacterModel({ cls: "warrior", gender: "male", app: defaultAppearance("male"), bone: true, weapon: false, wraps: true, cloth: "#4a3a2a", eyeGlow: "#8cff7a", armorTier: 0 });
    this.target.group.position.set(0, 0, 7); this.target.group.rotation.y = Math.PI;
    this.scene.add(this.target.group);
  }

  setHero(o: CharOpts) {
    if (this.hero) { this.hero.group.removeFromParent(); disposeObject(this.hero.group); }
    this.heroOpts = o;
    this.hero = new CharacterModel(o);
    this.hero.group.position.set(0, 0, 0);
    this.scene.add(this.hero.group);
    this.walkSpeed = 0;
  }
  setEmotion(e: Emotion | undefined) { this.hero.setEmotion(e); }

  setPreset(p: CamPreset) {
    this.preset = p;
    const c = this.cTarget;
    if (p === "fight") { c.center.set(0, 1, 3.2); c.dist = 8.6; this.pitch = 0.14; this.yaw = 2.25; }
    if (p === "full") { c.center.set(0, 0.95, 0); c.dist = 4.2; this.pitch = 0.1; this.yaw = 0.35; }
    if (p === "portrait") { c.center.set(0, 1.58 * this.hero.heightScale, 0.05); c.dist = 0.95; this.pitch = 0.04; this.yaw = 0.28; }
    if (p === "hands") { c.dist = 1.25; this.pitch = 0.2; this.yaw = 0.6; }
  }

  // ---------- действия ----------
  idle() { this.hero.setSpeed(0); this.walkSpeed = 0; this.hero.loop = undefined; this.hero.setDead(false); this.stopTimer = 0; }
  walk(v: number) { this.hero.loop = undefined; this.hero.setDead(false); this.walkSpeed = v; this.hero.setSpeed(v); }
  runThenStop() { this.walk(1.1); this.stopTimer = 1.6; }
  turn() { this.turnAnim = { t: 0, from: this.hero.group.rotation.y, to: this.hero.group.rotation.y + Math.PI }; this.hero.setSpeed(0.35); this.walkSpeed = 0.35; this.stopTimer = 1.0; }
  loop_(k: "wave" | "cheer" | "talk" | "block" | "sit" | undefined) { this.idle(); this.hero.loop = k; this.hero.talking = k === "talk"; }
  action(kind: string, onImpact?: () => void) {
    this.idle();
    const info = animInfo(kind);
    this.hero.play(kind, info.dur, onImpact);
    this.onCast?.({ kind, dur: info.dur, impact: info.impact });
  }
  die() { this.hero.loop = undefined; this.hero.setSpeed(0); this.hero.setDead(true); }
  revive() { this.hero.setDead(false); this.fx.base.ring(this.tmp.set(0, 0, 0), 2.2, "#fff1a8", 0.9); this.fx.base.heal(this.tmp.set(0, 0, 0), "#fff1a8"); this.hero.play("bow", 1.1); }
  reviveTarget() { this.target.setDead(false); }

  /** Базовая атака класса: стиль/эффект берутся из CLASSES[cls].basic */
  basicAttack(cls: ClassId) {
    const c = CLASSES[cls];
    const kind = { slash: "slash", stab: "stab", cast: "cast", shoot: "shoot", bash: "bash", whip: "whip" }[c.style];
    const s = { id: "basic", cls, kind: "tgt", vfx: c.basic.vfx, color: COLORS[c.basic.color] ?? COLORS.steel, power: 1, hits: c.style === "stab" ? 2 : 1, name: c.basic.name, radius: 0, stun: 0, slow: 0, dot: 0, dur: 0, cd: 0, mp: 0, range: c.basic.range } as unknown as SkillDef;
    this.runSkill(s, { kind, dur: 0.75, impact: kind === "shoot" ? 0.6 : 0.46 });
  }
  cast(s: SkillDef) { this.runSkill(s, animForSkill(s)); }

  private heroPos() { return this.hero.group.position; }
  private runSkill(s: SkillDef, spec: CastInfo) {
    this.idle();
    if (this.target.dead) this.target.setDead(false);
    const tp = this.target.group.position, hp = this.heroPos();
    const dir = Math.atan2(tp.x - hp.x, tp.z - hp.z);
    this.hero.group.rotation.y = dir;
    const origin = (out: THREE.Vector3) => (this.hero.opts.cls === "archer" ? this.hero.handWorld(0, out) : this.hero.tipWorld(out));
    this.fx.windup(() => origin(this.tmp2), hp.clone(), s, spec.dur * spec.impact);
    this.hero.play(spec.kind, spec.dur, () => {
      this.fx.fire(s, hp.clone(), origin(new THREE.Vector3()), tp.clone(), dir, () => tp, () => { this.target.play("hit", 0.45); if ((s.power ?? 0) >= 2.5) this.fx.shake = 0.6; });
    });
    if (s.kind === "dash") {
      const to = tp.clone().sub(hp).setY(0); const L = Math.max(0, to.length() - 2.2); to.normalize().multiplyScalar(L);
      this.dash = { t: -spec.dur * spec.impact * 0.55, dur: 0.28, from: hp.clone(), to: hp.clone().add(to), back: false };
    }
    this.onCast?.(spec);
  }

  resize() {
    const w = this.mount.clientWidth || 800, h = this.mount.clientHeight || 600;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    // перемещения героя
    if (this.dash) {
      const d = this.dash; d.t += dt;
      if (d.t > 0) { const u = Math.min(1, d.t / d.dur); const e = u * u * (3 - 2 * u); this.hero.group.position.lerpVectors(d.from, d.to, d.back ? 1 - e : e); if (u >= 1 && !d.back && d.t > d.dur + 0.55) { d.back = true; d.t = 0; } else if (u >= 1 && d.back) { this.dash = null; } }
    }
    if (this.turnAnim) { const a = this.turnAnim; a.t += dt / 0.8; const u = Math.min(1, a.t); this.hero.group.rotation.y = a.from + (a.to - a.from) * (u * u * (3 - 2 * u)); this.hero.setTurn(Math.sin(u * Math.PI) * 1.4); if (u >= 1) { this.turnAnim = null; this.hero.setTurn(0); } }
    if (this.stopTimer > 0) { this.stopTimer -= dt; if (this.stopTimer <= 0) { this.hero.setSpeed(0); this.walkSpeed = 0; } }
    // беговая дорожка: пол едет навстречу
    this.tread += this.walkSpeed * dt * 3.6; this.floorTex.offset.y = (this.tread / 15) * 8 * (this.hero.group.rotation.y > Math.PI * 0.5 && this.hero.group.rotation.y < Math.PI * 1.5 ? -1 : 1) * -1;
    this.hero.update(dt); this.target.update(dt); this.fx.update(dt);
    // камера
    const k = 1 - Math.exp(-dt * 5);
    if (this.preset === "hands") this.cTarget.center.copy(this.hero.handWorld(0, this.tmp));
    this.center.lerp(this.cTarget.center, k); this.dist += (this.cTarget.dist - this.dist) * k;
    const cp = Math.cos(this.pitch), sh = this.fx.shake;
    this.camera.position.set(this.center.x + Math.sin(this.yaw) * cp * this.dist + (Math.random() - 0.5) * sh * 0.25, this.center.y + Math.sin(this.pitch) * this.dist + (Math.random() - 0.5) * sh * 0.25, this.center.z + Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(this.center);
    this.renderer.render(this.scene, this.camera);
  };

  snapshot() { return this.renderer.domElement.toDataURL("image/png"); }

  dispose() {
    cancelAnimationFrame(this.raf); this.dispose_.forEach((f) => f()); this.fx.dispose();
    disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
