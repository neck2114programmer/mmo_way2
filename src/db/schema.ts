import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Аккаунты. Пароль хранится только в виде хэша Argon2id. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    /** нормализованный (нижний регистр) логин — для уникальности */
    usernameNorm: text("username_norm").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_username_norm_uq").on(t.usernameNorm)],
);

/** Сессии: в БД лежит только SHA-256 токена, сам токен — в HttpOnly-cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_account_idx").on(t.accountId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/** Герои. Внешность (в т.ч. причёска) относится к конкретному персонажу, а не к аккаунту. */
export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    classId: text("class_id").notNull(),
    gender: text("gender").notNull(),
    /** стабильный идентификатор причёски из каталога (продублирован из appearance для индексации/проверок) */
    hairId: text("hair_id").notNull(),
    /** валидированная серверной нормализацией внешность */
    appearance: jsonb("appearance").notNull(),
    armorTier: smallint("armor_tier").notNull().default(2),
    weaponTier: smallint("weapon_tier").notNull().default(2),
    helm: boolean("helm").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("characters_name_norm_uq").on(t.nameNorm),
    index("characters_account_idx").on(t.accountId),
    check("characters_gender_chk", sql`${t.gender} in ('male','female')`),
    check("characters_tiers_chk", sql`${t.armorTier} between 0 and 5 and ${t.weaponTier} between 0 and 5`),
  ],
);

/** Счётчики неудачных попыток (защита от перебора), общие для всех процессов сервера. */
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
