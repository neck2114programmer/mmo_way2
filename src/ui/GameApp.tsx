"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HeroStudio, type CreateInput, type SavePatch } from "./HeroStudio";
import { WorldTab } from "./WorldTab";
import { MapTab } from "./MapTab";
import { director } from "../game/events";
import { CLASSES } from "../game/data/classes";
import { MAX_CHARACTERS, type CharacterDTO } from "../game/appearance";
import type { ZoneId } from "../game/types";

type Tab = "heroes" | "world" | "map";
export interface GameUser { username: string; isAdmin: boolean }

async function api<T>(url: string, method: string, body?: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { window.location.href = "/login"; return { error: "Сессия истекла." }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.message ?? "Не удалось выполнить действие." };
    return { data: j as T };
  } catch {
    return { error: "Нет соединения с сервером. Изменения не сохранены." };
  }
}

export default function GameApp({ user, initialCharacters }: { user: GameUser; initialCharacters: CharacterDTO[] }) {
  const [tab, setTab] = useState<Tab>("heroes");
  const [zone, setZone] = useState<ZoneId>("meadow");
  const [chars, setChars] = useState<CharacterDTO[]>(initialCharacters);
  const [activeId, setActiveId] = useState<string | null>(initialCharacters[0]?.id ?? null);
  const [creating, setCreating] = useState(initialCharacters.length === 0);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useMemo(() => chars.find((c) => c.id === activeId) ?? null, [chars, activeId]);

  // часы мира: между снимками сервера время идёт локально, сами события ведёт только сервер
  useEffect(() => {
    let last = performance.now();
    const tick = setInterval(() => { const n = performance.now(); director.update((n - last) / 1000); last = n; }, 100);
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/world", { cache: "no-store" });
        if (r.status === 401) { window.location.href = "/login"; return; }
        if (r.ok && !stop) director.applySnapshot(await r.json());
      } catch { /* повтор на следующем тике */ }
    };
    void poll();
    const i = setInterval(poll, 2000);
    return () => { stop = true; clearInterval(tick); clearInterval(i); };
  }, []);

  const replace = (c: CharacterDTO) => setChars((l) => l.map((x) => (x.id === c.id ? c : x)));

  const choose = useCallback(async (id: string) => {
    setNotice(null); setCreating(false); setActiveId(id); setTab("heroes");
    const r = await api<{ character: CharacterDTO }>(`/api/characters/${id}/select`, "POST");
    if (r.error) setNotice(r.error); else if (r.data) replace(r.data.character);
  }, []);

  const onSave = async (id: string, patch: SavePatch) => {
    const r = await api<{ character: CharacterDTO }>(`/api/characters/${id}`, "PATCH", patch);
    if (r.error) return r.error;
    if (r.data) replace(r.data.character);
    return null;
  };
  const onCreate = async (input: CreateInput) => {
    const r = await api<{ character: CharacterDTO }>("/api/characters", "POST", { ...input, appearance: input.appearance });
    if (r.error) return r.error;
    if (r.data) { setChars((l) => [r.data!.character, ...l]); setActiveId(r.data.character.id); setCreating(false); }
    return null;
  };
  const remove = async () => {
    if (!active || !confirm(`Удалить героя «${active.name}» без возможности восстановления?`)) return;
    const r = await api(`/api/characters/${active.id}`, "DELETE");
    if (r.error) { setNotice(r.error); return; }
    const rest = chars.filter((c) => c.id !== active.id);
    setChars(rest); setActiveId(rest[0]?.id ?? null); setCreating(rest.length === 0);
  };
  const logout = async () => { await api("/api/auth/logout", "POST"); window.location.href = "/login"; };

  const tabs: [Tab, string, string][] = [["heroes", "Студия героев", "модели • лица • руки • броня • анимации • умения"], ["world", "Локации", "живой мир • маяки событий"], ["map", "Карта событий", "мир и локации • таймеры • маршрут"]];
  const showStudio = tab === "heroes";
  return (
    <div className="flex h-full flex-col bg-[#0e0b16] text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-[#15101f] px-4 py-2">
        <div>
          <div className="title-font text-lg font-bold leading-none text-amber-200">⚔ Эльдория: Клинки Рассвета</div>
          <div className="text-[11px] text-white/50">аккаунт: {user.username}{user.isAdmin ? " • администратор" : ""}</div>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Разделы">
          {tabs.map(([k, n, sub]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k} className={`rounded-lg border px-3 py-1 text-left ${tab === k ? "border-amber-200/60 bg-amber-200/10" : "border-white/10 hover:bg-white/5"}`}>
              <div className="text-sm font-semibold">{n}</div><div className="hidden text-[10px] text-white/50 lg:block">{sub}</div>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className="text-xs text-white/60" htmlFor="char-select">Герой</label>
          <select id="char-select" className="sel max-w-[190px]" value={creating ? "" : activeId ?? ""} onChange={(e) => e.target.value && choose(e.target.value)}>
            {creating && <option value="">— новый герой —</option>}
            {chars.map((c) => <option key={c.id} value={c.id}>{c.name} — {CLASSES[c.classId].name}</option>)}
          </select>
          <button className="btn-s" disabled={chars.length >= MAX_CHARACTERS || creating} title={chars.length >= MAX_CHARACTERS ? `Максимум ${MAX_CHARACTERS}` : ""} onClick={() => { setCreating(true); setTab("heroes"); }}>＋ Новый</button>
          {active && !creating && <button className="btn-s" onClick={remove}>Удалить</button>}
          <button className="btn-s" onClick={logout}>Выйти</button>
        </div>
      </header>
      {notice && <div role="alert" className="border-b border-red-400/30 bg-red-950/60 px-4 py-1.5 text-xs text-red-200">{notice}</div>}
      <main className="min-h-0 flex-1 p-3">
        {showStudio && <HeroStudio key={creating ? "new" : active?.id ?? "new"} character={creating ? null : active} onSave={onSave} onCreate={onCreate} onCancelCreate={chars.length ? () => setCreating(false) : undefined} />}
        {tab === "world" && <WorldTab zone={zone} setZone={setZone} />}
        {tab === "map" && <MapTab zone={zone} setZone={setZone} isAdmin={user.isAdmin} />}
      </main>
    </div>
  );
}
