import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Регистрация — Эльдория" };

export default async function RegisterPage() {
  let user = null;
  try { user = await getSessionUser(); } catch { /* БД недоступна: форма покажет понятную ошибку при отправке */ }
  if (user) redirect("/game");
  return (
    <AuthShell>
      <AuthForm mode="register" />
    </AuthShell>
  );
}
