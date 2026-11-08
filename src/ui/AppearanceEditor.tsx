"use client";
import { ACCENT_COLORS, BROW_NAMES, EAR_NAMES, EYE_COLORS, EYE_NAMES, HAIR_COLORS, MARK_COLORS, MARK_NAMES, SKIN_TONES, TAIL_NAMES } from "../game/data/classes";
import { hairOptionsFor } from "../game/data/hair";
import type { Appearance, Gender } from "../game/types";

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-white/80">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={c} onClick={() => onPick(c)}
            className={`h-5 w-5 rounded-full border-2 ${value.toLowerCase() === c.toLowerCase() ? "border-white" : "border-white/20"}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function Choice({ label, names, value, onPick }: { label: string; names: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-white/80">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {names.map((n, i) => <button key={n} type="button" aria-pressed={value === i} onClick={() => onPick(i)} className={`btn-s ${value === i ? "btn-on" : ""}`}>{n}</button>)}
      </div>
    </div>
  );
}

const Slider = ({ label, value, onPick }: { label: string; value: number; onPick: (v: number) => void }) => (
  <label className="lbl">{label}<input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onPick(+e.target.value)} className="w-full" /></label>
);

/** Редактор внешности. Список причёсок строится из каталога: несовместимые с ригом/головой героя скрыты. */
export function AppearanceEditor({ gender, app, onChange }: { gender: Gender; app: Appearance; onChange: (a: Appearance) => void }) {
  const set = (p: Partial<Appearance>) => onChange({ ...app, ...p });
  const hairs = hairOptionsFor(gender);
  return (
    <div>
      <div className="text-xs text-white/80">Причёска <span className="text-white/45">(доступно для {gender === "female" ? "женской" : "мужской"} модели: {hairs.length})</span></div>
      <div className="mt-1 flex flex-wrap gap-1" data-testid="hair-options">
        {hairs.map((h) => <button key={h.id} type="button" data-hair={h.id} aria-pressed={app.hair === h.style} onClick={() => set({ hair: h.style })} className={`btn-s ${app.hair === h.style ? "btn-on" : ""}`}>{h.name}</button>)}
      </div>
      <Swatches label="Цвет волос" colors={HAIR_COLORS} value={app.hairColor} onPick={(c) => set({ hairColor: c })} />
      <Swatches label="Кожа" colors={SKIN_TONES} value={app.skin} onPick={(c) => set({ skin: c })} />
      <Swatches label="Цвет глаз" colors={EYE_COLORS} value={app.eyeColor} onPick={(c) => set({ eyeColor: c })} />
      <Choice label="Глаза" names={EYE_NAMES} value={app.eyeStyle} onPick={(i) => set({ eyeStyle: i })} />
      <Choice label="Брови" names={BROW_NAMES} value={app.brow} onPick={(i) => set({ brow: i })} />
      <Choice label="Уши" names={EAR_NAMES} value={app.ears} onPick={(i) => set({ ears: i })} />
      <Choice label="Хвост" names={TAIL_NAMES} value={app.tail} onPick={(i) => set({ tail: i })} />
      <Choice label="Отметина" names={MARK_NAMES} value={app.mark} onPick={(i) => set({ mark: i })} />
      {app.mark > 0 && <Swatches label="Цвет отметины" colors={MARK_COLORS} value={app.markColor} onPick={(c) => set({ markColor: c })} />}
      <Swatches label="Акцент одежды" colors={ACCENT_COLORS} value={app.accent} onPick={(c) => set({ accent: c })} />
      <Slider label="Рост" value={app.height} onPick={(v) => set({ height: v })} />
      <Slider label="Телосложение" value={app.build} onPick={(v) => set({ build: v })} />
      {gender === "female" && <Slider label="Фигура" value={app.bust} onPick={(v) => set({ bust: v })} />}
      <Slider label="Размер головы" value={app.headSize} onPick={(v) => set({ headSize: v })} />
      <Slider label="Размер глаз" value={app.eyeSize} onPick={(v) => set({ eyeSize: v })} />
    </div>
  );
}
