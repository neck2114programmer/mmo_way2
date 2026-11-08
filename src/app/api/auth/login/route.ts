import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { assertNotLimited, clearAttempts, createSession, normLogin, recordAttempt, verifyPassword } from "@/server/auth";
import { ApiError, assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
const WINDOW = 15 * 60;

export function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await readJson(req);
    const username = typeof body.username === "string" ? body.username.trim().slice(0, 64) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 256) : "";
    if (!username || !password) throw new ApiError(400, "validation", "Введите логин и пароль.");

    const userKey = `login:user:${normLogin(username)}`;
    const ipKey = `login:ip:${clientIp(req)}`;
    await assertNotLimited(userKey, 8, WINDOW);
    await assertNotLimited(ipKey, 40, WINDOW);

    const [acc] = await db.select().from(accounts).where(eq(accounts.usernameNorm, normLogin(username))).limit(1);
    const ok = await verifyPassword(acc?.passwordHash ?? null, password);
    if (!acc || !ok) {
      await Promise.all([recordAttempt(userKey, WINDOW), recordAttempt(ipKey, WINDOW)]);
      throw new ApiError(401, "invalid_credentials", "Неверный логин или пароль.");
    }
    await clearAttempts(userKey);
    await createSession(acc.id, req);
    return json({ ok: true, user: { username: acc.username } });
  });
}
