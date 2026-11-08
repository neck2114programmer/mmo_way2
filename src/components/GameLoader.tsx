"use client";
import dynamic from "next/dynamic";
import type { CharacterDTO } from "@/game/appearance";
import type { GameUser } from "@/ui/GameApp";

// Three.js работает только в браузере: игровой клиент грузится отдельным чанком после авторизации
const GameApp = dynamic(() => import("@/ui/GameApp"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-amber-200/80">Загрузка мира Эльдории…</div>,
});

export default function GameLoader(props: { user: GameUser; initialCharacters: CharacterDTO[] }) {
  return <GameApp {...props} />;
}
