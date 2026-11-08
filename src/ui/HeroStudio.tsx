"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, type CamPreset, type CastInfo } from "./stage";
import { CLASSES, CLASS_LIST, defaultAppearance, randomAppearance } from "../game/data/classes";
import { SKILLS_BY_CLASS, type SkillDef } from "../game/data/skills";
import { animForSkill } from "../game/render/clips";
import { elementOf } from "../game/render/skillfx";
import type { Emotion } from "../game/render/anatomy";
import type { Appearance, ClassId, Gender } from "../game/types";
import { HAIR_CATALOG } from "../game/data/hair";
import { normalizeAppearance, toRenderAppearance, toStoredAppearance, type CharacterDTO, type StoredAppearance } from "../game/appearance";
import { AppearanceEditor } from "./AppearanceEditor";

export interface SavePatch { appearance: StoredAppearance; armorTier: number; weaponTier: number; helm: boolean }
export interface CreateInput extends SavePatch { name: string; classId: ClassId; gender: Gender }
interface StudioProps {
  /** выбранный герой; null — режим создания нового героя */
  character: CharacterDTO | null;
  onSave: (id: string, patch: SavePatch) => Promise<string | null>;
  onCreate: (input: CreateInput) => Promise<string | null>;
  onCancelCreate?: () => void;
}

const EMOS: [Emotion, string][] = [["neutral", "Спокойно"], ["happy", "Радость"], ["angry", "Гнев"], ["sad", "Грусть"], ["surprised", "Удивление"], ["focus", "Сосредоточен"], ["pain", "Боль"], ["roar", "Крик"], ["smug", "Ухмылка"]];
const KIND_RU: Record<string, string> = { tgt: "цель", aoe: "вокруг", aoet: "область", dash: "рывок", heal: "лечение", buff: "усиление", shield: "защита", summon: "призыв" };
const EL_RU: Record<string, string> = { fire: "огонь", ice: "лёд", bolt: "молния", dark: "тьма", poison: "яд", holy: "свет", blood: "кровь", nature: "природа", steel: "сталь", wind: "ветер", gold: "золото", shadow: "тень" };
const CLIP_RU: Record<string, string> = {
  slash: "рубящий удар", slash2: "обратный удар", stab: "двойной выпад", cast: "заклинание", shoot: "выстрел", bash: "удар булавой", whip: "хлёст", spin: "вихрь", leap: "прыжок",
  overhead: "удар сверху", uppercut: "апперкот", thrust: "выпад", flurry: "град ударов", slam: "сокрушение", warcry: "боевой клич", roar: "рёв", bless: "исцеление", ward: "оберег",
  guard: "стойка щита", shieldbash: "таран щитом", skyshot: "залп в небо", volley: "скоростная стрельба", channel: "поток", nova: "всплеск", skycall: "зов небес", summon: "призыв",
  dashstrike: "рывок-удар", backstab: "удар из тени", throw: "бросок", command: "команда зверю", howl: "вой", roll: "перекат",
};

export function HeroStudio({ character, onSave, onCreate, onCancelCreate }: StudioProps) {
  const mount = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [cls, setCls] = useState<ClassId>(character?.classId ?? "warrior");
  const [gender, setGender] = useState<Gender>(character?.gender ?? "male");
  const [armor, setArmor] = useState(character?.armorTier ?? 2);
  const [weapon, setWeapon] = useState(character?.weaponTier ?? 2);
  const [helm, setHelm] = useState(character?.helm ?? true);
  const [app, setApp] = useState<Appearance>(() => (character ? toRenderAppearance(character.appearance) : defaultAppearance("male")));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preset, setPreset] = useState<CamPreset>("fight");
  const [emo, setEmo] = useState<Emotion>("neutral");
  const [info, setInfo] = useState<(CastInfo & { name: string }) | null>(null);
  const [dead, setDead] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const nameRef = useRef("");

  useEffect(() => {
    const s = new Stage(mount.current!);
    s.onCast = (c) => setInfo(c ? { ...c, name: nameRef.current } : null);
    stage.current = s;
    (window as unknown as { __stage: Stage }).__stage = s;
    return () => { s.dispose(); stage.current = null; };
  }, []);

  useEffect(() => {
    const s = stage.current; if (!s) return;
    s.setHero({ cls, gender, app, armorTier: armor, weaponTier: weapon, head: helm, helm: helm && (cls === "warrior" || cls === "shieldbearer") });
    s.setPreset(preset); s.setEmotion(emo === "neutral" ? undefined : emo); setDead(false);
  }, [cls, gender, app, armor, weapon, helm]);
  useEffect(() => { stage.current?.setPreset(preset); }, [preset]);
  useEffect(() => { stage.current?.setEmotion(emo === "neutral" ? undefined : emo); }, [emo]);

  const hairId = (HAIR_CATALOG.find((h) => h.style === app.hair) ?? HAIR_CATALOG[0]).id;
  const stored = normalizeAppearance(toStoredAppearance(app, hairId), gender).appearance;
  const patch: SavePatch = { appearance: stored, armorTier: armor, weaponTier: weapon, helm };
  const dirty = !!character && JSON.stringify(patch) !== JSON.stringify({ appearance: character.appearance, armorTier: character.armorTier, weaponTier: character.weaponTier, helm: character.helm });
  const previewOnly = !!character && cls !== character.classId;
  const submit = async () => {
    setBusy(true); setMsg(null);
    const err = character ? await onSave(character.id, patch) : await onCreate({ ...patch, name, classId: cls, gender });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: character ? "Внешность сохранена на сервере." : "Герой создан." });
  };

  const actives = useMemo(() => SKILLS_BY_CLASS[cls].filter((s) => s.type === "active"), [cls]);
  const c = CLASSES[cls];
  const run = (name: string, f: () => void) => { nameRef.current = name; f(); };
  const castSkill = (s: SkillDef) => { setSel(s.id); run(s.name, () => stage.current?.cast(s)); };

  const Btn = ({ children, on, active }: { children: React.ReactNode; on: () => void; active?: boolean }) => (
    <button onClick={on} className={`btn-s ${active ? "btn-on" : ""}`}>{children}</button>
  );

  return (
    <div className="flex h-full min-h-0 gap-3">
      <aside className="panel w-[330px] shrink-0 overflow-y-auto p-3">
        <div className="rounded-lg border border-amber-200/30 bg-amber-200/5 p-2.5" data-testid="character-box">
          {character ? (
            <>
              <div className="title-font text-base font-bold text-amber-200">{character.name}</div>
              <div className="text-[11px] text-white/60">{CLASSES[character.classId].name} • {character.gender === "female" ? "женская модель" : "мужская модель"} • причёска: {HAIR_CATALOG.find((h) => h.id === character.appearance.hairId)?.name}</div>
              <button type="button" className="btn-s mt-2 w-full !py-2 font-semibold disabled:opacity-40" disabled={!dirty || previewOnly || busy} onClick={submit}>{busy ? "Сохранение…" : dirty ? "💾 Сохранить внешность героя" : "Все изменения сохранены"}</button>
              {previewOnly && <p className="mt-1 text-[11px] text-amber-200/90">Просмотр другого класса: сохранить можно только внешность класса «{CLASSES[character.classId].name}». <button className="underline" onClick={() => setCls(character.classId)}>Вернуться к своему герою</button></p>}
            </>
          ) : (
            <>
              <div className="title-font text-base font-bold text-amber-200">Новый герой</div>
              <label className="lbl" htmlFor="char-name">Имя героя</label>
              <input id="char-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Например, Арвен" className="mt-1 w-full rounded-md border border-white/20 bg-[#1b1428] px-2 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-amber-300" />
              <div className="mt-2 flex gap-1.5">
                <button type="button" className="btn-s flex-1 !py-2 font-semibold disabled:opacity-40" disabled={busy || name.trim().length < 2} onClick={submit}>{busy ? "Создание…" : "⚔ Создать героя"}</button>
                {onCancelCreate && <button type="button" className="btn-s" onClick={onCancelCreate}>Отмена</button>}
              </div>
              <p className="mt-1 text-[11px] text-white/50">Класс и пол выбираются сейчас и не меняются; внешность можно менять позже.</p>
            </>
          )}
          {msg && <p role="status" className={`mt-1.5 text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
        </div>
        <h3 className="h">Класс</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {CLASS_LIST.map((k) => (
            <button key={k.id} onClick={() => setCls(k.id)} title={k.name} className={`flex flex-col items-center rounded-lg border px-1 py-1.5 text-[11px] ${cls === k.id ? "border-white/70 bg-white/10" : "border-white/10 hover:bg-white/5"}`} style={{ color: k.color }}>
              <img src={k.icon} alt="" className="h-8 w-8" /><span className="mt-1 text-white/85">{k.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/60">{c.role} • {c.weaponKind} • броня: {c.armor}</p>

        <h3 className="h">Герой</h3>
        <div className="flex flex-wrap gap-1.5">
          {!character && <Btn on={() => { setGender("male"); setApp(defaultAppearance("male")); }} active={gender === "male"}>♂ Мужчина</Btn>}
          {!character && <Btn on={() => { setGender("female"); setApp(defaultAppearance("female")); }} active={gender === "female"}>♀ Женщина</Btn>}
          <Btn on={() => setApp(randomAppearance(gender))}>🎲 Внешность</Btn>
        </div>
        <label className="lbl">Тир брони: {armor}<input type="range" min={0} max={5} value={armor} onChange={(e) => setArmor(+e.target.value)} className="w-full" /></label>
        <label className="lbl">Тир оружия: {weapon}<input type="range" min={0} max={5} value={weapon} onChange={(e) => setWeapon(+e.target.value)} className="w-full" /></label>
        <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={helm} onChange={(e) => setHelm(e.target.checked)} /> Головной убор / шлем</label>

        <h3 className="h">Внешность</h3>
        <AppearanceEditor gender={gender} app={app} onChange={setApp} />

        <h3 className="h">Камера</h3>
        <div className="flex flex-wrap gap-1.5">
          {([["fight", "Бой"], ["full", "Полный рост"], ["portrait", "Лицо"], ["hands", "Кисти и оружие"]] as [CamPreset, string][]).map(([k, n]) => <Btn key={k} on={() => setPreset(k)} active={preset === k}>{n}</Btn>)}
        </div>

        <h3 className="h">Мимика</h3>
        <div className="flex flex-wrap gap-1.5">{EMOS.map(([k, n]) => <Btn key={k} on={() => setEmo(k)} active={emo === k}>{n}</Btn>)}</div>

        <h3 className="h">Движение и состояния</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <Btn on={() => stage.current?.idle()}>Стойка / ожидание</Btn>
          <Btn on={() => stage.current?.walk(0.5)}>Ходьба</Btn>
          <Btn on={() => stage.current?.walk(1.1)}>Бег</Btn>
          <Btn on={() => stage.current?.runThenStop()}>Бег → остановка</Btn>
          <Btn on={() => stage.current?.turn()}>Поворот</Btn>
          <Btn on={() => stage.current?.loop_("block")}>Блок</Btn>
          <Btn on={() => run("Попадание", () => stage.current?.action("hit"))}>Получение урона</Btn>
          <Btn on={() => run("Уклонение", () => stage.current?.action("roll"))}>Уклонение</Btn>
          <Btn on={() => { const d = !dead; setDead(d); d ? stage.current?.die() : stage.current?.revive(); }} active={dead}>{dead ? "Возрождение" : "Смерть"}</Btn>
          <Btn on={() => run("Победа", () => stage.current?.action("victory"))}>Победа</Btn>
          <Btn on={() => run("Смена оружия", () => stage.current?.action("equip"))}>Достать оружие</Btn>
          <Btn on={() => run("Взаимодействие", () => stage.current?.action("interact"))}>Взаимодействие</Btn>
          <Btn on={() => run("Зелье", () => stage.current?.action("drink"))}>Выпить зелье</Btn>
          <Btn on={() => run("Поклон", () => stage.current?.action("bow"))}>Поклон</Btn>
          <Btn on={() => stage.current?.loop_("wave")}>Приветствие</Btn>
          <Btn on={() => stage.current?.loop_("cheer")}>Ликование</Btn>
          <Btn on={() => stage.current?.loop_("talk")}>Разговор</Btn>
          <Btn on={() => stage.current?.loop_("sit")}>Сесть</Btn>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="panel relative min-h-0 flex-1 overflow-hidden">
          <div ref={mount} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/45 px-3 py-2 text-xs backdrop-blur">
            <div className="text-sm font-bold" style={{ color: c.color }}>{c.name}</div>
            <div className="text-white/70">ЛКМ — вращать камеру • колесо — приближение</div>
          </div>
          {info && (
            <div className="pointer-events-none absolute right-3 top-3 w-60 rounded-lg bg-black/55 p-2.5 text-xs backdrop-blur">
              <div className="font-bold text-amber-200">{info.name || "Действие"}</div>
              <div className="text-white/75">клип: <b>{CLIP_RU[info.kind] ?? info.kind}</b> ({info.kind})</div>
              <div className="text-white/75">длительность {info.dur.toFixed(2)} с • срабатывание на {(info.impact * info.dur).toFixed(2)} с ({Math.round(info.impact * 100)}%)</div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex gap-2">
            <button className="btn-s" onClick={() => run(c.basic.name, () => stage.current?.basicAttack(cls))}>⚔ Базовая атака: {c.basic.name}</button>
            <button className="btn-s" onClick={() => stage.current?.reviveTarget()}>Восстановить мишень</button>
          </div>
        </div>
        <div className="panel max-h-[190px] shrink-0 overflow-y-auto p-2.5">
          <div className="mb-1.5 flex items-baseline justify-between"><h3 className="h !m-0">Умения класса «{c.name}» — {actives.length} активных, у каждого своя анимация и эффект</h3></div>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
            {actives.map((s) => {
              const sp = animForSkill(s);
              return (
                <button key={s.id} onClick={() => castSkill(s)} className={`flex items-center gap-2 rounded-lg border p-1.5 text-left ${sel === s.id ? "border-white/70 bg-white/10" : "border-white/10 hover:bg-white/5"}`} title={s.desc}>
                  <img src={s.icon} alt="" className="h-9 w-9 shrink-0 rounded" />
                  <span className="min-w-0 text-[11px] leading-tight"><b className="block truncate text-white/95">{s.name}</b><span className="block truncate text-white/55">{KIND_RU[s.kind ?? "tgt"]} • {EL_RU[elementOf(s)]} • {CLIP_RU[sp.kind] ?? sp.kind}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
