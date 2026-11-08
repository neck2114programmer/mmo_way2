import { useEffect, useRef, useState } from "react";
import { WorldStage } from "./worldview";
import { ZONES } from "../game/data/zones";
import { ZONE_NAMES } from "../game/meta";
import { CLASS_LIST, defaultAppearance, CLASSES } from "../game/data/classes";
import { SKILLS_BY_CLASS } from "../game/data/skills";
import type { ClassId, ZoneId } from "../game/types";
import { STATUS_COLOR, STATUS_LABEL, ZoneMap, fmtTime, useDirector } from "./maps";
import { fmtHour } from "../game/events";

export function WorldTab({ zone, setZone }: { zone: ZoneId; setZone: (z: ZoneId) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const stage = useRef<WorldStage | null>(null);
  const [cls, setCls] = useState<ClassId>("warrior");
  const [fps, setFps] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const d = useDirector();

  useEffect(() => {
    const s = new WorldStage(mount.current!, zone, { cls, gender: "male", app: defaultAppearance("male"), armorTier: 2, weaponTier: 2, head: true });
    s.onFps = setFps; stage.current = s;
    (window as unknown as { __world: WorldStage }).__world = s;
    return () => { s.dispose(); stage.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const s = stage.current; if (s && s.zone !== zone) s.load(zone); }, [zone]);
  useEffect(() => { const s = stage.current; if (!s) return; s.setHeroOpts({ cls, gender: "male", app: defaultAppearance("male"), armorTier: 2, weaponTier: 2, head: true }); }, [cls]);

  const evs = d.events.filter((e) => e.zone === zone);
  const skills = SKILLS_BY_CLASS[cls].filter((s) => s.type === "active").slice(0, 6);
  return (
    <div className="panel relative h-full overflow-hidden">
      <div ref={mount} className="absolute inset-0" />
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/50 p-2 backdrop-blur">
        <select value={zone} onChange={(e) => setZone(e.target.value as ZoneId)} className="sel">
          {(Object.keys(ZONES) as ZoneId[]).map((z) => <option key={z} value={z}>{ZONE_NAMES[z]} ({ZONES[z].levels})</option>)}
        </select>
        <select value={cls} onChange={(e) => setCls(e.target.value as ClassId)} className="sel">{CLASS_LIST.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span className="text-xs text-white/70">🕒 {fmtHour(d.tod)} • {fps} FPS</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/45 px-3 py-2 text-xs text-white/80 backdrop-blur">
        <b>WASD</b> — идти (Shift — шаг) • <b>Пробел</b> — прыжок • <b>ЛКМ-drag</b> — камера • <b>1–6</b> — умения «{CLASSES[cls].name}»:
        <div className="mt-1 flex flex-wrap gap-x-3">{skills.map((s, i) => <span key={s.id}>{i + 1}. {s.name}</span>)}</div>
      </div>
      {/* события зоны + мини-карта */}
      <div className="absolute right-3 top-3 flex w-[250px] flex-col gap-2">
        <div className="panel-glass h-[250px] w-[250px] overflow-hidden p-1">
          <ZoneMap zone={zone} mini follow selected={sel} onSelect={setSel} className="h-full w-full" />
        </div>
        {evs.length === 0 && <div className="panel-glass p-2 text-xs text-white/70">В этой локации нет событий. {ZONES[zone].cave ? "В подземельях ночные события не проводятся." : "Ночью (20:00–05:30) на поселения нападают твари."}</div>}
        {evs.map((e) => (
          <div key={e.id} className="panel-glass p-2 text-xs" style={{ borderColor: STATUS_COLOR[e.status] + "88" }}>
            <div className="font-bold" style={{ color: STATUS_COLOR[e.status] }}>{e.title}</div>
            <div className="text-white/75">{STATUS_LABEL[e.status]}{e.status === "active" || e.status === "upcoming" ? ` • ${fmtTime(d.remaining(e))}` : ""}</div>
            <div className="text-white/60">{e.info}</div>
            <button className="btn-s mt-1" onClick={() => stage.current?.teleport(e.pos.x - 6, e.pos.z)}>Тест: встать у точки события</button>
          </div>
        ))}
      </div>
    </div>
  );
}
