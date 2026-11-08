import { ZONES } from "./data/zones";
import { MOBS } from "./data/world";
import type { ZoneId } from "./types";
import { ZONE_NAMES } from "./meta";

/**
 * Событийная модель, повторяющая правила engine.ts (startEvent / updateEvents / finishEvent):
 *  - события только ночью (20:00–05:30) и не в подземельях (zone.cave);
 *  - «raid» (нападение на поселение, 8–16 тварей по кольцу hub.r+45…70 вокруг центра поселения)
 *    и «hunter» (ночной охотник, появляется на расстоянии hub.r+70 от центра);
 *  - длительность 5 минут; победа — все враги убиты; поражение — таймер/рассвет;
 *  - завершённые события остаются в списке 150 секунд (как в engine.ts), затем удаляются.
 *  - между событиями в зоне пауза 100–190 с.
 * Добавлено состояние «upcoming» — по данным nextEvent (за 45 с до старта).
 *
 * Координаты события — реальные мировые (x, z) из ZoneDef.hub; карта читает их напрямую.
 */
export type EvStatus = "upcoming" | "active" | "done" | "failed";
export interface WorldEvent {
  id: string; kind: "raid" | "hunter"; zone: ZoneId; title: string; desc: string; status: EvStatus;
  startsAt: number; ends: number; doneAt: number; info: string; lvl: number;
  hub: { x: number; z: number; r: number };
  /** граница зоны события в мировых координатах */
  area: { x: number; z: number; r: number };
  /** текущая точка маркера (для охотника — позиция зверя) */
  pos: { x: number; z: number };
  total: number; alive: number; mobName: string;
}

export const EV_DURATION = 5 * 60_000;
export const EV_LINGER = 150_000;
export const EV_WARN = 45_000;

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** ночь по времени суток (tod 0..1, 0.5 = полдень? как в World.setTimeOfDay: солнце max при tod=0.5) */
export function nightOf(tod: number) {
  const elev = Math.sin((tod - 0.25) * Math.PI * 2);
  return 1 - smooth(-0.1, 0.28, elev);
}
export const hourOf = (tod: number) => (tod * 24) % 24;
export const fmtHour = (tod: number) => { const h = hourOf(tod); return `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`; };

export const EVENT_ZONES = (Object.keys(ZONES) as ZoneId[]).filter((id) => !ZONES[id].cave);
export const isEventZone = (id: ZoneId) => !ZONES[id].cave;

export class EventDirector {
  now = 0; // симуляционное время, мс
  tod = 0.86;
  speed = 1;
  events: WorldEvent[] = [];
  nextAt: Partial<Record<ZoneId, number>> = {};
  private killT = new Map<string, number>();
  private rate = new Map<string, number>();
  private subs = new Set<() => void>();
  private ver = 0;
  private seq = 0;

  constructor() {
    EVENT_ZONES.forEach((z, i) => { this.nextAt[z] = 8_000 + i * 11_000 + Math.random() * 40_000; });
  }

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVersion = () => this.ver;
  private emit() { this.ver++; this.subs.forEach((f) => f()); }

  night() { return nightOf(this.tod); }

  /** true — состояние приходит с сервера (applySnapshot); локально лишь плавно идут часы между снимками */
  remote = false;
  applySnapshot(s: { now: number; tod: number; speed: number; events: WorldEvent[] }) {
    this.remote = true; this.now = s.now; this.tod = s.tod; this.speed = s.speed; this.events = s.events; this.emit();
  }

  update(dtReal: number) {
    const dt = dtReal * this.speed * 1000;
    this.now += dt;
    this.tod = (this.tod + (dtReal * this.speed) / (25 * 60)) % 1; // сутки = 25 минут, как в игре
    if (this.remote) return; // события симулирует только сервер
    const night = this.night();
    let changed = false;
    for (const ev of this.events) {
      if (ev.status === "upcoming") {
        if (this.now >= ev.startsAt) { ev.status = "active"; ev.ends = this.now + EV_DURATION; changed = true; }
        continue;
      }
      if (ev.status !== "active") continue;
      // симуляция боя игроков с нападающими
      const t = (this.killT.get(ev.id) ?? 0) - dt;
      if (t <= 0 && ev.alive > 0) { ev.alive--; this.killT.set(ev.id, (this.rate.get(ev.id) ?? 9000) * (0.5 + Math.random())); changed = true; }
      else this.killT.set(ev.id, t);
      if (ev.kind === "hunter") {
        // зверь медленно кружит у границы поселения
        const a = Math.atan2(ev.pos.z - ev.hub.z, ev.pos.x - ev.hub.x) + dt * 0.00004;
        const r = ev.hub.r + 70 - Math.min(40, (EV_DURATION - (ev.ends - this.now)) / 8000);
        ev.pos = { x: ev.hub.x + Math.cos(a) * r, z: ev.hub.z + Math.sin(a) * r };
      }
      if (ev.alive <= 0) { this.finish(ev, true); changed = true; }
      else if (this.now > ev.ends || night < 0.12) { this.finish(ev, false); changed = true; }
      else {
        const info = ev.kind === "raid" ? `Осталось врагов: ${ev.alive} из ${ev.total}` : `${ev.mobName} ещё жив`;
        if (info !== ev.info) { ev.info = info; changed = true; }
      }
    }
    const before = this.events.length;
    this.events = this.events.filter((e) => (e.status !== "done" && e.status !== "failed") || this.now - e.doneAt < EV_LINGER);
    if (before !== this.events.length) changed = true;
    for (const z of EVENT_ZONES) {
      const busy = this.events.some((e) => e.zone === z && (e.status === "active" || e.status === "upcoming"));
      const nx = this.nextAt[z] ?? 0;
      if (!busy && night > 0.6 && this.now > nx - EV_WARN) { this.schedule(z, Math.max(this.now, nx)); changed = true; }
    }
    if (changed) this.emit();
  }

  /** Создаёт событие точно так же, как engine.startEvent (используется и расписанием, и ручным запуском для проверки) */
  schedule(zone: ZoneId, startsAt: number, kind?: "raid" | "hunter"): WorldEvent {
    const z = ZONES[zone], hub = z.hub;
    const defs = [...new Set(z.mobs.map((s) => MOBS[s.mob]).filter((d) => d && !d.boss))];
    const pool = defs.length ? defs : [MOBS.wolf, MOBS.bandit, MOBS.boar];
    const lv = z.mobs.find((s) => MOBS[s.mob] && !MOBS[s.mob].boss)?.lvl ?? [3, 6];
    const L = Math.round((lv[0] + lv[1]) / 2);
    const k = kind ?? (Math.random() < 0.65 ? "raid" : "hunter");
    const id = `ev${++this.seq}_${zone}`;
    const base = pool[Math.floor(Math.random() * pool.length)];
    const n = k === "raid" ? 8 + Math.min(8, Math.floor(L / 6)) : 1;
    const a = Math.random() * 6.283;
    const ev: WorldEvent = {
      id, kind: k, zone, status: startsAt <= this.now ? "active" : "upcoming", startsAt, ends: startsAt + EV_DURATION, doneAt: 0, lvl: L,
      title: k === "raid" ? `Нападение на ${ZONE_NAMES[zone]}` : "Ночной охотник",
      desc: k === "raid" ? "Ночью твари атакуют поселение! Помогите страже отбить нападение — за победу полагается награда."
        : `Сильный хищник вышел на охоту у «${ZONE_NAMES[zone]}». Победите его — добыча гарантирована!`,
      hub: { ...hub }, area: k === "raid" ? { x: hub.x, z: hub.z, r: hub.r + 70 } : { x: hub.x + Math.cos(a) * (hub.r + 70), z: hub.z + Math.sin(a) * (hub.r + 70), r: 38 },
      pos: k === "raid" ? { x: hub.x, z: hub.z } : { x: hub.x + Math.cos(a) * (hub.r + 70), z: hub.z + Math.sin(a) * (hub.r + 70) },
      info: k === "raid" ? `Осталось врагов: ${n} из ${n}` : `Ночной охотник ещё жив`, total: n, alive: n, mobName: k === "raid" ? base.name : "Ночной охотник",
    };
    if (ev.status === "active") ev.ends = this.now + EV_DURATION;
    this.rate.set(id, k === "raid" ? 4000 + Math.random() * 16000 : 60_000 + Math.random() * 280_000 / 1);
    if (k === "hunter") this.rate.set(id, 40_000 + Math.random() * 300_000);
    this.killT.set(id, this.rate.get(id)! * Math.random());
    this.events.push(ev);
    this.nextAt[zone] = ev.ends + 100_000 + Math.random() * 90_000;
    return ev;
  }

  finish(ev: WorldEvent, ok: boolean) {
    ev.status = ok ? "done" : "failed"; ev.doneAt = this.now;
    ev.info = ok ? "Победа!" : "Событие завершилось.";
  }

  /** ручной старт для проверки карты (в игре это делает ночное расписание) */
  force(zone: ZoneId, kind?: "raid" | "hunter") {
    if (!isEventZone(zone)) return null;
    this.events = this.events.filter((e) => !(e.zone === zone && (e.status === "active" || e.status === "upcoming")));
    const e = this.schedule(zone, this.now, kind); this.emit(); return e;
  }
  /** завершить событие (проверка исчезновения маркера) */
  resolve(id: string, ok: boolean) { const e = this.events.find((x) => x.id === id); if (e && e.status === "active") { e.alive = ok ? 0 : e.alive; this.finish(e, ok); this.emit(); } }
  setTod(t: number) { this.tod = t; this.emit(); }
  remaining(ev: WorldEvent) { return ev.status === "active" ? Math.max(0, ev.ends - this.now) : ev.status === "upcoming" ? Math.max(0, ev.startsAt - this.now) : 0; }
}

export const director = new EventDirector();

// ---------- общая позиция игрока (для маршрута и карты) ----------
export interface PlayerPos { zone: ZoneId; x: number; z: number; yaw: number }
export const playerPos: PlayerPos = { zone: "meadow", x: -18, z: 5, yaw: 0 };
