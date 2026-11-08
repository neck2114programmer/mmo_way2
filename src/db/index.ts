import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __eldoriaPgPool?: Pool;
};

function createPool(): Pool {
  const p = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  // ошибки простаивающих соединений не должны ронять процесс; строку подключения не логируем
  p.on("error", (e) => console.error("[db] pool error:", (e as { code?: string }).code ?? e.name));
  return p;
}

// Пул кэшируется глобально всегда: Next может собирать код в несколько чанков.
export const pool = globalForDb.__eldoriaPgPool ?? (globalForDb.__eldoriaPgPool = createPool());

export const db = drizzle(pool, { schema });
