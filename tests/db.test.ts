import { Client } from "pg";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Тесты используют ОТДЕЛЬНУЮ базу (не рабочую): создаётся автоматически.
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db_test";

type Mod = {
  chars: typeof import("@/server/characters");
  auth: typeof import("@/server/auth");
  db: typeof import("@/db");
  schema: typeof import("@/db/schema");
};
let m: Mod;

async function account(name: string) {
  const [a] = await m.db.db.insert(m.schema.accounts).values({ username: name, usernameNorm: name.toLowerCase(), passwordHash: await m.auth.hashPassword("password123") }).returning();
  return a;
}
const base = { classId: "mage", gender: "female" };

beforeAll(async () => {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const ex = await admin.query("select 1 from pg_database where datname = 'app_db_test'");
  if (!ex.rowCount) await admin.query("create database app_db_test");
  await admin.end();
  process.env.DATABASE_URL = TEST_URL;
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  m = { chars: await import("@/server/characters"), auth: await import("@/server/auth"), db: await import("@/db"), schema: await import("@/db/schema") };
  await migrate(m.db.db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await m.db.db.execute((await import("drizzle-orm")).sql`truncate accounts, auth_attempts cascade`);
});
afterAll(async () => { await m?.db.pool.end(); });

describe("аккаунты и пароли (PostgreSQL)", () => {
  it("пароль хранится как Argon2id-хэш, неверный пароль не проходит", async () => {
    const a = await account("Tester1");
    expect(a.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(a.passwordHash).not.toContain("password123");
    expect(await m.auth.verifyPassword(a.passwordHash, "password123")).toBe(true);
    expect(await m.auth.verifyPassword(a.passwordHash, "wrong-password1")).toBe(false);
    expect(await m.auth.verifyPassword(null, "whatever1")).toBe(false);
  });
  it("логин уникален без учёта регистра", async () => {
    await expect(account("TESTER1")).rejects.toBeTruthy();
  });
  it("ограничение частоты блокирует после лимита попыток", async () => {
    for (let i = 0; i < 3; i++) await m.auth.recordAttempt("test:k", 60);
    await expect(m.auth.assertNotLimited("test:k", 3, 60)).rejects.toMatchObject({ status: 429 });
    await m.auth.clearAttempts("test:k");
    await expect(m.auth.assertNotLimited("test:k", 3, 60)).resolves.toBeUndefined();
  });
});

describe("персонажи и внешность (PostgreSQL)", () => {
  it("причёска привязана к конкретному герою и переживает повторную загрузку", async () => {
    const a = await account("Owner1");
    const c1 = await m.chars.createCharacter(a.id, { ...base, name: "Лианна", appearance: { hairId: "twin_tails", hairColor: "#ff6aa8" } });
    const c2 = await m.chars.createCharacter(a.id, { classId: "warrior", gender: "male", name: "Борин", appearance: { hairId: "mohawk" } });
    await m.chars.updateCharacter(a.id, c1.id, { appearance: { ...c1.appearance, hairId: "bun" } });
    const list = await m.chars.listCharacters(a.id);
    expect(list.find((c) => c.id === c1.id)!.appearance.hairId).toBe("bun");
    expect(list.find((c) => c.id === c2.id)!.appearance.hairId).toBe("mohawk"); // не затронут
    const [row] = await m.db.db.select().from(m.schema.characters).where((await import("drizzle-orm")).eq(m.schema.characters.id, c1.id));
    expect(row.hairId).toBe("bun");
  });
  it("женская причёска у мужского героя заменяется на совместимую, остальное сохраняется", async () => {
    const a = await account("Owner2");
    const c = await m.chars.createCharacter(a.id, { classId: "archer", gender: "male", name: "Торн", appearance: { hairId: "twin_tails", skin: "#7d4b2e", ears: 1 } });
    expect(c.appearance.hairId).toBe("ponytail");
    expect(c.appearance.skin).toBe("#7d4b2e");
    const upd = await m.chars.updateCharacter(a.id, c.id, { appearance: { ...c.appearance, hairId: "bob" } });
    expect(upd.appearance.hairId).toBe("short_crop");
    // испорченные старые данные чинятся при загрузке, не удаляя прочие настройки
    await m.db.db.execute((await import("drizzle-orm")).sql`update characters set appearance = jsonb_set(appearance, '{hairId}', '"bun"'), hair_id = 'bun' where id = ${c.id}`);
    const [fixed] = (await m.chars.listCharacters(a.id)).filter((x) => x.id === c.id);
    expect(fixed.appearance.hairId).toBe("ponytail"); expect(fixed.appearance.ears).toBe(1);
  });
  it("чужой герой недоступен; имя уникально; лимит героев", async () => {
    const a = await account("Owner3"), b = await account("Owner4");
    const c = await m.chars.createCharacter(a.id, { ...base, name: "Уникум", appearance: {} });
    await expect(m.chars.updateCharacter(b.id, c.id, { helm: false })).rejects.toMatchObject({ status: 404 });
    await expect(m.chars.deleteCharacter(b.id, c.id)).rejects.toMatchObject({ status: 404 });
    await expect(m.chars.createCharacter(b.id, { ...base, name: "уникум", appearance: {} })).rejects.toMatchObject({ code: "name_taken" });
    for (let i = 0; i < 5; i++) await m.chars.createCharacter(a.id, { ...base, name: `Герой${i}`, appearance: {} });
    await expect(m.chars.createCharacter(a.id, { ...base, name: "Лишний", appearance: {} })).rejects.toMatchObject({ code: "limit" });
  });
  it("удаление аккаунта каскадно удаляет героев (внешний ключ)", async () => {
    const a = await account("Owner5");
    await m.chars.createCharacter(a.id, { ...base, name: "Каскад", appearance: {} });
    const { eq, sql } = await import("drizzle-orm");
    await m.db.db.delete(m.schema.accounts).where(eq(m.schema.accounts.id, a.id));
    const r = await m.db.db.execute(sql`select 1 from characters where account_id = ${a.id}`);
    expect(r.rowCount).toBe(0);
  });
});
