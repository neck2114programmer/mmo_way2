import type { Metadata } from "next";
import { redirect } from "next/navigation";
import GameLoader from "@/components/GameLoader";
import { getSessionUser } from "@/server/auth";
import { listCharacters } from "@/server/characters";
import { isDbDown } from "@/server/http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Эльдория — игра" };

export default async function GamePage() {
  let user, characters;
  try {
    user = await getSessionUser();
    if (user) characters = await listCharacters(user.accountId);
  } catch (e) {
    console.error("[game] load failed:", (e as Error).name);
    return (
      <main className="grid min-h-screen place-items-center bg-[#0e0b16] p-6 text-center text-white">
        <div className="max-w-md rounded-xl border border-red-400/30 bg-red-950/40 p-6">
          <h1 className="title-font text-xl text-amber-200">Сервер временно недоступен</h1>
          <p className="mt-2 text-sm text-white/80">{isDbDown(e) ? "База данных недоступна. Ваши данные в безопасности — обновите страницу через минуту." : "Не удалось загрузить данные героев. Обновите страницу."}</p>
        </div>
      </main>
    );
  }
  if (!user || !characters) redirect("/login");
  return (
    <div className="fixed inset-0 overflow-hidden">
      <GameLoader user={{ username: user.username, isAdmin: user.isAdmin }} initialCharacters={characters} />
    </div>
  );
}
