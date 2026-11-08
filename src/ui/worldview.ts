import * as THREE from "three";
import { World } from "../game/render/world";
import { CharacterModel, type CharOpts } from "../game/render/character";
import { SkillFx } from "../game/render/skillfx";
import { animForSkill } from "../game/render/clips";
import { SKILLS_BY_CLASS } from "../game/data/skills";
import { SPAWN } from "../game/meta";
import { director, playerPos, type WorldEvent } from "../game/events";
import { disposeObject, RIM } from "../game/render/util";
import { defaultAppearance } from "../game/data/classes";
import type { ClassId, ZoneId } from "../game/types";

const STATUS_HEX = { upcoming: "#ffc247", active: "#ff5a3c", done: "#58e08a", failed: "#8a8f9c" } as const;

/** Игровая локация: настоящий World из проекта + герой с WASD + маяки активных событий на реальных координатах. */
export class WorldStage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.3, 700);
  world!: World;
  hero!: CharacterModel;
  fx: SkillFx;
  zone!: ZoneId;
  private raf = 0; private last = performance.now(); private t = 0;
  private keys = new Set<string>();
  private yaw = Math.PI; private pitch = 0.35; private dist = 7;
  private pos = new THREE.Vector3();
  private speed = 0; private face = 0; private vy = 0;
  private beacons = new Map<string, { g: THREE.Group; ev: WorldEvent; ver: string }>();
  private evVer = -1; private todT = 0;
  private cleanup: (() => void)[] = [];
  private castCd = 0;
  fps = 0; private fpsN = 0; private fpsT = 0;
  onFps?: (f: number) => void;
  private tmp = new THREE.Vector3();

  constructor(private mount: HTMLElement, zone: ZoneId, private heroOpts: CharOpts) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    this.fx = new SkillFx(this.scene);
    this.load(zone);

    const el = this.renderer.domElement;
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === "INPUT") return; this.keys.add(e.code); if (/^Digit[1-9]$/.test(e.code)) this.quickCast(+e.code.slice(5) - 1); if (e.code === "Space") { e.preventDefault(); if (this.pos.y <= this.world.groundY(this.pos.x, this.pos.z) + 0.05) this.vy = 7; } };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    let drag = false, lx = 0, ly = 0;
    const pd = (e: PointerEvent) => { drag = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => { if (!drag) return; this.yaw -= (e.clientX - lx) * 0.006; this.pitch = Math.max(0.05, Math.min(1.2, this.pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; };
    const pu = () => { drag = false; };
    const wh = (e: WheelEvent) => { e.preventDefault(); this.dist = Math.max(2.5, Math.min(18, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    el.addEventListener("pointerdown", pd); el.addEventListener("pointermove", pm); el.addEventListener("pointerup", pu); el.addEventListener("wheel", wh, { passive: false });
    this.cleanup.push(() => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); el.removeEventListener("pointerdown", pd); el.removeEventListener("pointermove", pm); el.removeEventListener("pointerup", pu); el.removeEventListener("wheel", wh); });
    const ro = new ResizeObserver(() => this.resize()); ro.observe(mount); this.cleanup.push(() => ro.disconnect());
    this.resize(); this.loop();
  }

  load(zone: ZoneId, at?: { x: number; z: number }) {
    if (this.world) { this.world.dispose(); this.scene.remove(this.world.group); }
    this.beacons.forEach((b) => { b.g.removeFromParent(); disposeObject(b.g); }); this.beacons.clear(); this.evVer = -1;
    if (this.hero) { this.hero.group.removeFromParent(); }
    this.zone = zone;
    this.world = new World(zone, this.scene);
    this.world.setTimeOfDay(director.tod);
    const sp = at ?? SPAWN[zone];
    this.pos.set(sp.x, this.world.groundY(sp.x, sp.z), sp.z);
    this.hero = new CharacterModel(this.heroOpts);
    this.scene.add(this.hero.group);
    this.setCls(this.heroOpts.cls);
    playerPos.zone = zone; this.yaw = Math.PI;
  }
  setCls(cls: ClassId) { this.heroOpts = { ...this.heroOpts, cls, app: this.heroOpts.app ?? defaultAppearance("male") }; }
  setHeroOpts(o: CharOpts) { this.heroOpts = o; this.hero.group.removeFromParent(); disposeObject(this.hero.group); this.hero = new CharacterModel(o); this.scene.add(this.hero.group); }
  teleport(x: number, z: number) { this.pos.set(x, this.world.groundY(x, z) + 0.2, z); }

  quickCast(i: number) {
    if (this.castCd > 0) return;
    const list = SKILLS_BY_CLASS[this.heroOpts.cls].filter((s) => s.type === "active");
    const s = list[i]; if (!s) return;
    const spec = animForSkill(s); this.castCd = spec.dur;
    const dir = this.face; const fwd = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir));
    const tp = this.pos.clone().addScaledVector(fwd, Math.min(8, Math.max(3, s.range * 0.5)));
    tp.y = this.world.groundY(tp.x, tp.z);
    const hand = () => (this.heroOpts.cls === "archer" ? this.hero.handWorld(0, this.tmp) : this.hero.tipWorld(this.tmp));
    this.fx.windup(hand, this.pos.clone(), s, spec.dur * spec.impact);
    this.hero.play(spec.kind, spec.dur, () => { this.fx.fire(s, this.pos.clone(), hand().clone(), tp, dir, () => tp); });
  }

  private syncBeacons() {
    const v = director.getVersion();
    const evs = director.events.filter((e) => e.zone === this.zone);
    const seen = new Set<string>();
    for (const ev of evs) {
      seen.add(ev.id);
      const col = STATUS_HEX[ev.status];
      let b = this.beacons.get(ev.id);
      if (!b || b.ver !== ev.status) {
        if (b) { b.g.removeFromParent(); disposeObject(b.g); }
        b = { g: this.makeBeacon(ev, col), ev, ver: ev.status }; this.beacons.set(ev.id, b); this.scene.add(b.g);
      }
      b.ev = ev;
      // охотник перемещается
      if (ev.kind === "hunter") { const y = this.world.groundY(ev.pos.x, ev.pos.z); b.g.position.set(ev.pos.x, y, ev.pos.z); }
    }
    for (const [id, b] of this.beacons) if (!seen.has(id)) { b.g.removeFromParent(); disposeObject(b.g); this.beacons.delete(id); }
    this.evVer = v;
  }
  private makeBeacon(ev: WorldEvent, col: string) {
    const g = new THREE.Group();
    const y = this.world.groundY(ev.pos.x, ev.pos.z); g.position.set(ev.pos.x, y, ev.pos.z);
    const mat = (o: number) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const live = ev.status === "active" || ev.status === "upcoming";
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 70, 20, 1, true), mat(live ? 0.28 : 0.12)); pillar.position.y = 35; g.add(pillar);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 70, 8, 1, true), mat(live ? 0.7 : 0.25)); core.position.y = 35; g.add(core);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ev.kind === "raid" ? 4 : 3, ev.kind === "raid" ? 4.5 : 3.4, 48), mat(0.9)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; g.add(ring);
    // граница области события: стена вдоль окружности радиуса area.r (для налёта — вокруг поселения)
    if (live) {
      const wall = new THREE.Group();
      const seg = 96; const R = ev.area.r;
      const geo = new THREE.BufferGeometry(); const pos: number[] = [], col2: number[] = [], idx: number[] = [];
      const c = new THREE.Color(col);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, x = ev.area.x + Math.cos(a) * R, z = ev.area.z + Math.sin(a) * R, gy = this.world.groundY(x, z);
        pos.push(x - ev.pos.x, gy - y, z - ev.pos.z, x - ev.pos.x, gy - y + 14, z - ev.pos.z);
        col2.push(c.r, c.g, c.b, 0, 0, 0);
        if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col2, 3)); geo.setIndex(idx);
      const wm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      wm.frustumCulled = false; wall.add(wm); g.add(wall);
    }
    g.userData.ring = ring; g.userData.pillar = pillar;
    return g;
  }

  resize() { const w = this.mount.clientWidth || 800, h = this.mount.clientHeight || 600; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.fpsN++; this.fpsT += dt; if (this.fpsT > 1) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsN = 0; this.fpsT = 0; this.onFps?.(this.fps); }
    this.castCd = Math.max(0, this.castCd - dt);
    // движение: камера-относительное WASD
    const k = this.keys;
    const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const s = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const run = k.has("ShiftLeft") ? 0.55 : 1;
    const moving = (f !== 0 || s !== 0) && !this.hero.acting;
    const want = moving ? 1.0 * run : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * 8);
    if (moving) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // вперёд от камеры
      const rx = -fz, rz = fx;
      let dx = fx * f + rx * -s, dz = fz * f + rz * -s; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const v = 6.2 * run * dt;
      const nx = this.pos.x + dx * v, nz = this.pos.z + dz * v;
      if (this.world.walkable(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (this.world.walkable(nx, this.pos.z)) this.pos.x = nx; else if (this.world.walkable(this.pos.x, nz)) this.pos.z = nz;
      const tgt = Math.atan2(dx, dz); let d = tgt - this.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.face += d * Math.min(1, dt * 12); this.hero.setTurn(Math.max(-1.5, Math.min(1.5, d * 2)));
    } else this.hero.setTurn(0);
    const gy = this.world.groundY(this.pos.x, this.pos.z);
    this.vy -= 22 * dt; this.pos.y += this.vy * dt; if (this.pos.y < gy) { this.pos.y = gy; this.vy = 0; }
    this.hero.setSpeed(this.speed);
    this.hero.group.position.copy(this.pos); this.hero.group.rotation.y = this.face;
    this.hero.update(dt);
    playerPos.zone = this.zone; playerPos.x = this.pos.x; playerPos.z = this.pos.z; playerPos.yaw = this.yaw + Math.PI;
    // мир, время суток (общее с событиями), эффекты
    this.todT -= dt; if (this.todT <= 0) { this.todT = 0.25; const night = this.world.setTimeOfDay(director.tod); RIM.strength.value = 0.25 + night * 0.2; }
    if (director.getVersion() !== this.evVer) this.syncBeacons();
    for (const b of this.beacons.values()) { const ring = b.g.userData.ring as THREE.Mesh; ring.scale.setScalar(1 + 0.25 * Math.sin(this.t * 3)); (b.g.userData.pillar as THREE.Mesh).rotation.y = this.t * 0.4; }
    this.world.update(this.t, dt, this.pos);
    this.fx.update(dt);
    // камера от третьего лица
    const cp = Math.cos(this.pitch), sh = this.fx.shake;
    const cx = this.pos.x + Math.sin(this.yaw) * cp * this.dist, cz = this.pos.z + Math.cos(this.yaw) * cp * this.dist;
    let cy = this.pos.y + 1.5 + Math.sin(this.pitch) * this.dist; cy = Math.max(cy, this.world.groundY(cx, cz) + 0.6);
    this.camera.position.set(cx + (Math.random() - 0.5) * sh * 0.3, cy, cz + (Math.random() - 0.5) * sh * 0.3);
    this.camera.lookAt(this.pos.x, this.pos.y + 1.4, this.pos.z);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf); this.cleanup.forEach((f) => f());
    this.world.dispose(); this.fx.dispose(); disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
