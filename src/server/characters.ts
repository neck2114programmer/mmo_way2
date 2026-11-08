import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, characters, type CharacterRow } from "@/db/schema";
import {
  MAX_CHARACTERS, isClassId, isGender, normalizeAppearance, validateCharacterName,
  type CharacterDTO, type StoredAppearance,
} from "@/game/appearance";
import { ApiError, pgCode } from "./http";

const clampTier = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 5 ? v : d);

function toDto(r: CharacterRow): CharacterDTO {
  const gender = r.gender === "female" ? "female" : "male";
  // внешность всегда проходит нормализацию при чтении: старые/испорченные данные (например,
  // женская причёска у мужского персонажа) заменяются совместимым вариантом без потери остальных настроек
  const { appearance } = normalizeAppearance(r.appearance, gender);
  return {
    id: r.id, name: r.name, classId: r.classId as CharacterDTO["classId"], gender, appearance,
    armorTier: r.armorTier, weaponTier: r.weaponTier, helm: r.helm, lastPlayedAt: r.lastPlayedAt.toISOString(),
  };
}

export async function listCharacters(accountId: string): Promise<CharacterDTO[]> {
  const rows = await db.select().from(characters).where(eq(characters.accountId, accountId)).orderBy(desc(characters.lastPlayedAt));
  const out: CharacterDTO[] = [];
  for (const r of rows) {
    const dto = toDto(r);
    if (dto.appearance.hairId !== r.hairId || JSON.stringify(dto.appearance) !== JSON.stringify(r.appearance)) {
      // самовосстановление: сохраняем исправленную внешность (только этого персонажа)
      await db.update(characters).set({ appearance: dto.appearance, hairId: dto.appearance.hairId }).where(eq(characters.id, r.id));
    }
    out.push(dto);
  }
  return out;
}

export async function createCharacter(accountId: string, input: Record<string, unknown>): Promise<CharacterDTO> {
  const nameErr = validateCharacterName(input.name);
  if (nameErr) throw new ApiError(400, "invalid_name", nameErr, { name: nameErr });
  if (!isClassId(input.classId)) throw new ApiError(400, "invalid_class", "Неизвестный класс.");
  if (!isGender(input.gender)) throw new ApiError(400, "invalid_gender", "Неизвестный пол.");
  const name = (input.name as string).trim().replace(/\s+/g, " ");
  const { appearance } = normalizeAppearance(input.appearance, input.gender);
  const classId = input.classId, gender = input.gender;
  try {
    return await db.transaction(async (tx) => {
      // блокируем строку аккаунта: лимит героев не обойти параллельными запросами
      await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).for("update");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(characters).where(eq(characters.accountId, accountId));
      if (n >= MAX_CHARACTERS) throw new ApiError(409, "limit", `Максимум героев на аккаунте: ${MAX_CHARACTERS}.`);
      const [row] = await tx.insert(characters).values({
        accountId, name, nameNorm: name.toLowerCase(), classId, gender, hairId: appearance.hairId, appearance,
        armorTier: clampTier(input.armorTier, 2), weaponTier: clampTier(input.weaponTier, 2), helm: input.helm !== false,
      }).returning();
      return toDto(row);
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new ApiError(409, "name_taken", "Герой с таким именем уже существует.", { name: "Имя занято." });
    throw e;
  }
}

/** Все операции фильтруют по account_id: чужого героя изменить нельзя. */
export async function updateCharacter(accountId: string, id: string, patch: Record<string, unknown>): Promise<CharacterDTO> {
  const [cur] = await db.select().from(characters).where(and(eq(characters.id, id), eq(characters.accountId, accountId)));
  if (!cur) throw new ApiError(404, "not_found", "Герой не найден.");
  const set: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
  if (patch.appearance !== undefined) {
    // совместимость причёски проверяется по полу/голове ИМЕННО этого персонажа
    const { appearance } = normalizeAppearance(patch.appearance, cur.gender === "female" ? "female" : "male");
    set.appearance = appearance as StoredAppearance;
    set.hairId = appearance.hairId;
  }
  if (patch.armorTier !== undefined) set.armorTier = clampTier(patch.armorTier, cur.armorTier);
  if (patch.weaponTier !== undefined) set.weaponTier = clampTier(patch.weaponTier, cur.weaponTier);
  if (typeof patch.helm === "boolean") set.helm = patch.helm;
  const [row] = await db.update(characters).set(set).where(and(eq(characters.id, id), eq(characters.accountId, accountId))).returning();
  return toDto(row);
}

export async function selectCharacter(accountId: string, id: string): Promise<CharacterDTO> {
  const [row] = await db.update(characters).set({ lastPlayedAt: new Date() }).where(and(eq(characters.id, id), eq(characters.accountId, accountId))).returning();
  if (!row) throw new ApiError(404, "not_found", "Герой не найден.");
  return toDto(row);
}

export async function deleteCharacter(accountId: string, id: string) {
  const r = await db.delete(characters).where(and(eq(characters.id, id), eq(characters.accountId, accountId))).returning({ id: characters.id });
  if (!r.length) throw new ApiError(404, "not_found", "Герой не найден.");
}
