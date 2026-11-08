import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { accounts, authAttempts, sessions } from "@/db/schema";
import { ApiError, isHttps } from "./http";

export const SESSION_COOKIE = "eld_session";
const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;

/** Argon2id (RFC 9106, профиль с умеренной памятью): 19 МиБ, 2 прохода. */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const; // 2 = Argon2id

export const hashPassword = (pw: string) => hash(pw, ARGON);
let dummy: Promise<string> | null = null;
/** Для неизвестного логина тратим то же время, что и на проверку реального пароля. */
export async function verifyPassword(stored: string | null, pw: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hashPassword("dummy-password-for-timing-1");
    await verify(await dummy, pw).catch(() => false);
    return false;
  }
  return verify(stored, pw).catch(() => false);
}

export const normLogin = (s: string) => s.trim().toLowerCase();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const adminLogins = () => (process.env.ADMIN_LOGINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// ----------------------------------------------------------------- сессии
export async function createSession(accountId: string, req: NextRequest, tx: Pick<typeof db, "insert"> = db) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await tx.insert(sessions).values({ accountId, tokenHash: sha256(token), expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export interface SessionUser { accountId: string; username: string; isAdmin: boolean }

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select({ id: accounts.id, username: accounts.username, norm: accounts.usernameNorm })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!row) return null;
  return { accountId: row.id, username: row.username, isAdmin: adminLogins().includes(row.norm) };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ApiError(401, "unauthorized", "Требуется вход в аккаунт.");
  return u;
}

// ------------------------------------------------- ограничение частоты (в БД)
export async function assertNotLimited(key: string, max: number, windowSec: number) {
  const [row] = await db
    .select({ count: authAttempts.count, age: sql<number>`extract(epoch from (now() - ${authAttempts.windowStart}))` })
    .from(authAttempts)
    .where(eq(authAttempts.key, key));
  if (row && Number(row.age) < windowSec && row.count >= max) {
    const wait = Math.max(1, Math.ceil(windowSec - Number(row.age)));
    throw new ApiError(429, "rate_limited", `Слишком много попыток. Повторите через ${Math.ceil(wait / 60)} мин.`, undefined, { "Retry-After": String(wait) });
  }
}

export async function recordAttempt(key: string, windowSec: number) {
  await db.execute(sql`
    insert into auth_attempts (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when auth_attempts.window_start < now() - (${windowSec} * interval '1 second') then 1 else auth_attempts.count + 1 end,
      window_start = case when auth_attempts.window_start < now() - (${windowSec} * interval '1 second') then now() else auth_attempts.window_start end`);
}

export const clearAttempts = (key: string) => db.delete(authAttempts).where(eq(authAttempts.key, key));
