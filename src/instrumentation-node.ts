import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";

/** Миграции применяются при старте сервера; они неразрушающие (CREATE ... IF NOT EXISTS / ADD). */
export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[db] migrations applied");
  } catch (e) {
    const x = e as { code?: string; cause?: { code?: string }; name: string };
    console.error("[db] migration failed:", x.code ?? x.cause?.code ?? x.name);
  }
}
