import type { NextRequest } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { validatePassword, validateUsername } from "@/game/appearance";
import { assertNotLimited, createSession, hashPassword, normLogin, recordAttempt } from "@/server/auth";
import { ApiError, assertSameOrigin, clientIp, handle, json, pgCode, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await readJson(req);
    const ipKey = `register:ip:${clientIp(req)}`;
    await assertNotLimited(ipKey, 10, 3600);
    await recordAttempt(ipKey, 3600); // считаем каждую попытку регистрации

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fields: Record<string, string> = {};
    const e1 = validateUsername(username); if (e1) fields.username = e1;
    const e2 = validatePassword(password, username); if (e2) fields.password = e2;
    if (body.passwordRepeat !== undefined && body.passwordRepeat !== password) fields.passwordRepeat = "Пароли не совпадают.";
    if (Object.keys(fields).length) throw new ApiError(400, "validation", "Проверьте введённые данные.", fields);

    const passwordHash = await hashPassword(password);
    try {
      const account = await db.transaction(async (tx) => {
        const [a] = await tx.insert(accounts).values({ username, usernameNorm: normLogin(username), passwordHash }).returning({ id: accounts.id, username: accounts.username });
        await createSession(a.id, req, tx);
        return a;
      });
      return json({ ok: true, user: { username: account.username } }, 201);
    } catch (e) {
      if (pgCode(e) === "23505") throw new ApiError(409, "username_taken", "Этот логин уже занят.", { username: "Этот логин уже занят." });
      throw e;
    }
  });
}
