import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  let user = null;
  try { user = await getSessionUser(); } catch { /* БД недоступна — покажем вход, ошибка будет понятна при отправке формы */ }
  redirect(user ? "/game" : "/login");
}
