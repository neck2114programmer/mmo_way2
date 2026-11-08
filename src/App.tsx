import { useEffect, useState } from "react";
import { HeroStudio } from "./ui/HeroStudio";
import { WorldTab } from "./ui/WorldTab";
import { MapTab } from "./ui/MapTab";
import { director } from "./game/events";
import type { ZoneId } from "./game/types";

type Tab = "heroes" | "world" | "map";

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "heroes");
  const [zone, setZone] = useState<ZoneId>("meadow");

  // единые часы мира: время суток и события (как engine.updateEvents)
  useEffect(() => {
    let last = performance.now();
    const i = setInterval(() => { const n = performance.now(); director.update((n - last) / 1000); last = n; }, 100);
    (window as unknown as { __director: typeof director }).__director = director;
    return () => clearInterval(i);
  }, []);

  const tabs: [Tab, string, string][] = [["heroes", "Студия героев", "модели • лица • руки • броня • анимации • умения"], ["world", "Локации", "живой мир • маяки событий"], ["map", "Карта событий", "мир и локации • таймеры • маршрут"]];
  return (
    <div className="flex h-screen flex-col bg-[#0e0b16] text-white">
      <header className="flex shrink-0 items-center gap-4 border-b border-white/10 bg-[#15101f] px-4 py-2">
        <div>
          <div className="title-font text-lg font-bold leading-none text-amber-200">⚔ Эльдория: Клинки Рассвета</div>
          <div className="text-[11px] text-white/50">визуальное обновление: персонажи, анимации, эффекты, карта событий</div>
        </div>
        <nav className="ml-6 flex gap-1.5">
          {tabs.map(([k, n, sub]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg border px-3 py-1.5 text-left ${tab === k ? "border-amber-200/60 bg-amber-200/10" : "border-white/10 hover:bg-white/5"}`}>
              <div className="text-sm font-semibold">{n}</div><div className="text-[10px] text-white/50">{sub}</div>
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 p-3">
        {tab === "heroes" && <HeroStudio />}
        {tab === "world" && <WorldTab zone={zone} setZone={setZone} />}
        {tab === "map" && <MapTab zone={zone} setZone={setZone} />}
      </main>
    </div>
  );
}
