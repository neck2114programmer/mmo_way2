import { useEffect, useState } from "react";
import { ZONES } from "../game/data/zones";
import { ZONE_NAMES } from "../game/meta";
import type { ZoneId } from "../game/types";
import { EVENT_ZONES, director, fmtHour, isEventZone, nightOf, playerPos } from "../game/events";
import { STATUS_COLOR, STATUS_LABEL, WorldMapView, ZoneMap, fmtTime, routeSteps, useDirector } from "./maps";

export function MapTab({ zone, setZone, isAdmin = false }: { zone: ZoneId; setZone: (z: ZoneId) => void; isAdmin?: boolean }) {
  const d = useDirector();
  const [sel, setSel] = useState<string | null>(null);
  const [layers, setLayers] = useState({ spawns: true, paths: true, buildings: true, portals: true, route: true });
  const events = [...d.events].sort((a, b) => ({ active: 0, upcoming: 1, done: 2, failed: 3 }[a.status] - { active: 0, upcoming: 1, done: 2, failed: 3 }[b.status]));
  const selEv = events.find((e) => e.id === sel) ?? null;
  useEffect(() => { if (sel && !d.events.some((e) => e.id === sel)) setSel(null); }, [d.events.length, sel, d]);
  const steps = selEv ? routeSteps(selEv) : [];
  const night = nightOf(d.tod);

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-[430px] shrink-0 flex-col gap-3">
        <div className="panel aspect-[1000/640] shrink-0 overflow-hidden p-1">
          <WorldMapView selectedZone={zone} onZone={setZone} selectedEvent={sel} onEvent={(id) => { setSel(id); const e = d.events.find((x) => x.id === id); if (e) setZone(e.zone); }} />
        </div>
        <TimeBar isAdmin={isAdmin} />
        <div className="panel min-h-0 flex-1 overflow-y-auto p-2.5">
          <h3 className="h !mt-0">События мира ({events.length})</h3>
          {events.length === 0 && <p className="text-xs text-white/60">Сейчас всё спокойно. {night > 0.6 ? "Следующее нападение скоро…" : "Ночью (20:00–05:30) на поселения нападают твари — переведите время на ночь."}</p>}
          <div className="flex flex-col gap-1.5">
            {events.map((e) => (
              <button key={e.id} onClick={() => { setSel(e.id); setZone(e.zone); }} className={`rounded-lg border p-2 text-left text-xs ${sel === e.id ? "bg-white/10" : "hover:bg-white/5"}`} style={{ borderColor: sel === e.id ? STATUS_COLOR[e.status] : "rgba(255,255,255,.1)" }}>
                <div className="flex items-center justify-between gap-2">
                  <b style={{ color: STATUS_COLOR[e.status] }}>{e.kind === "raid" ? "⚔" : "☠"} {e.title}</b>
                  <span className="chip" style={{ color: STATUS_COLOR[e.status], borderColor: STATUS_COLOR[e.status] + "77" }}>{STATUS_LABEL[e.status]}</span>
                </div>
                <div className="mt-0.5 text-white/65">{ZONE_NAMES[e.zone]} • ур. {e.lvl} • {e.status === "active" || e.status === "upcoming" ? <b className="text-white/90">⏱ {fmtTime(d.remaining(e))}</b> : "завершено"}</div>
                <div className="text-white/55">{e.info}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="panel flex shrink-0 flex-wrap items-center gap-2 p-2 text-xs">
          <b className="text-sm text-amber-100">{ZONE_NAMES[zone]}</b>
          <span className="text-white/60">ур. {ZONES[zone].levels} • {ZONES[zone].half * 2}×{ZONES[zone].half * 2} м</span>
          {!isEventZone(zone) && <span className="chip">🔒 события не проводятся</span>}
          <span className="mx-1 h-4 w-px bg-white/20" />
          {([["spawns", "Монстры"], ["paths", "Дороги"], ["buildings", "Строения"], ["portals", "Порталы"], ["route", "Маршрут"]] as const).map(([k, n]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{n}</label>
          ))}
          <span className="ml-auto text-white/50">ось X → вправо, Z ↓ вниз (как в миникарте игры)</span>
        </div>
        <div className="panel relative min-h-0 flex-1 overflow-hidden p-1">
          <ZoneMap zone={zone} selected={sel} onSelect={setSel} layers={layers} className="h-full w-full" />
          {selEv && (
            <div className="absolute left-3 top-3 w-[300px] rounded-xl border bg-[#120f1cdd] p-3 text-xs backdrop-blur" style={{ borderColor: STATUS_COLOR[selEv.status] + "99" }}>
              <div className="flex items-center justify-between"><b className="text-sm" style={{ color: STATUS_COLOR[selEv.status] }}>{selEv.title}</b><button className="text-white/50 hover:text-white" onClick={() => setSel(null)}>✕</button></div>
              <div className="mt-1 text-white/75">{selEv.desc}</div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/80">
                <span>Локация:</span><b>{ZONE_NAMES[selEv.zone]}</b>
                <span>Координаты:</span><b>x {Math.round(selEv.pos.x)}, z {Math.round(selEv.pos.z)}</b>
                <span>Зона события:</span><b>радиус {Math.round(selEv.area.r)} м</b>
                <span>Состояние:</span><b style={{ color: STATUS_COLOR[selEv.status] }}>{STATUS_LABEL[selEv.status]}</b>
                <span>{selEv.status === "upcoming" ? "До начала:" : "Осталось:"}</span><b>{selEv.status === "active" || selEv.status === "upcoming" ? fmtTime(d.remaining(selEv)) : "—"}</b>
                <span>Прогресс:</span><b>{selEv.info}</b>
              </div>
              {(selEv.status === "active" || selEv.status === "upcoming") && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <div className="mb-1 font-bold text-cyan-200">Как добраться (вы: {ZONE_NAMES[playerPos.zone]})</div>
                  <ol className="list-decimal space-y-0.5 pl-4 text-white/80">{steps.map((s, i) => <li key={i}><span className="text-white/50">{ZONE_NAMES[s.zone]}:</span> {s.text} — <b>{Math.round(s.dist)} м</b></li>)}</ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Отправка служебного действия на сервер (только администраторы); сервер возвращает новый снимок мира. */
export async function worldAdmin(body: Record<string, unknown>) {
  const r = await fetch("/api/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) director.applySnapshot(await r.json());
}

export function TimeBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const d = useDirector();
  const [z, setZ] = useState<ZoneId>(EVENT_ZONES[0]);
  const night = nightOf(d.tod);
  return (
    <div className="panel shrink-0 p-2.5 text-xs">
      <div className="flex items-center justify-between"><b>🕒 {fmtHour(d.tod)} <span className="text-white/60">{night > 0.6 ? "🌙 ночь" : night > 0.12 ? "🌅 сумерки" : "☀ день"}</span></b>
        <span className="text-white/50">часы и события — с сервера</span></div>
      {isAdmin && (<>
        <input type="range" min={0} max={1} step={0.002} value={d.tod} onChange={(e) => void worldAdmin({ action: "setTod", tod: +e.target.value })} className="my-1 w-full" aria-label="Время суток" />
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 10, 40].map((s) => <button key={s} className={`btn-s ${d.speed === s ? "btn-on" : ""}`} onClick={() => void worldAdmin({ action: "speed", speed: s })}>×{s}</button>)}
          <button className="btn-s" onClick={() => void worldAdmin({ action: "setTod", tod: 0.9 })}>🌙 На ночь</button>
          <button className="btn-s" onClick={() => void worldAdmin({ action: "setTod", tod: 0.45 })}>☀ На день</button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <select className="sel" value={z} onChange={(e) => setZ(e.target.value as ZoneId)}>{EVENT_ZONES.map((id) => <option key={id} value={id}>{ZONE_NAMES[id]}</option>)}</select>
          <button className="btn-s" onClick={() => void worldAdmin({ action: "force", zone: z, kind: "raid" })}>Админ: налёт</button>
          <button className="btn-s" onClick={() => void worldAdmin({ action: "force", zone: z, kind: "hunter" })}>Админ: охотник</button>
          <button className="btn-s" onClick={() => void worldAdmin({ action: "resolve", ok: true })}>Победа</button>
          <button className="btn-s" onClick={() => void worldAdmin({ action: "resolve", ok: false })}>Провал</button>
        </div>
      </>)}
      <p className="mt-1 text-[10px] leading-tight text-white/45">Расписание и правила — как в engine.ts (ночь 20:00–05:30, 5 мин, зачёт 150 с). События создаёт и ведёт сервер; бой игроков с нападающими на сервере симулируется.{isAdmin ? " Вы администратор: доступны служебные кнопки." : ""}</p>
    </div>
  );
}
