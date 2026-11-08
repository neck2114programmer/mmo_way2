import type { Appearance, ClassId, Gender } from "./types";
import { CLASS_IDS } from "./types";
import { HAIR_BY_ID, legacyHairIdFromIndex, resolveHairId } from "./data/hair";

/**
 * Хранимая внешность: то, что лежит в characters.appearance (JSONB).
 * Причёска хранится стабильным id (`hairId`), а не индексом модели.
 */
export interface StoredAppearance extends Omit<Appearance, "hair"> {
  hairId: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULTS: Omit<StoredAppearance, "hairId"> = {
  skin: "#f9d2b4", hairColor: "#3a2418", eyeColor: "#2b7de0", eyeStyle: 0, brow: 1, ears: 0, tail: 0, mark: 0,
  markColor: "#ff4d4d", height: 0.5, build: 0.5, bust: 0.5, headSize: 0.5, eyeSize: 0.5, accent: "#c0392b",
};

const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const int = (v: unknown, max: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : d);
const unit = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 1000) / 1000)) : d);

export interface NormalizeResult { appearance: StoredAppearance; repairs: string[] }

/**
 * Серверная (и клиентская) валидация внешности: белый список полей, диапазоны, цвета,
 * совместимость причёски с ригом/типом головы персонажа. Неподходящая причёска заменяется
 * совместимым запасным вариантом, остальные настройки сохраняются.
 */
export function normalizeAppearance(input: unknown, gender: Gender): NormalizeResult {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const repairs: string[] = [];
  const raw = typeof o.hairId === "string" ? o.hairId : legacyHairIdFromIndex(o.hair);
  const hair = resolveHairId(raw, gender);
  if (hair.repaired) repairs.push(raw && HAIR_BY_ID[raw] ? `hair:${raw}->${hair.id}` : `hair:invalid->${hair.id}`);
  const appearance: StoredAppearance = {
    hairId: hair.id,
    skin: color(o.skin, DEFAULTS.skin),
    hairColor: color(o.hairColor, DEFAULTS.hairColor),
    eyeColor: color(o.eyeColor, DEFAULTS.eyeColor),
    eyeStyle: int(o.eyeStyle, 5, DEFAULTS.eyeStyle),
    brow: int(o.brow, 3, DEFAULTS.brow),
    ears: int(o.ears, 3, DEFAULTS.ears),
    tail: int(o.tail, 2, DEFAULTS.tail),
    mark: int(o.mark, 4, DEFAULTS.mark),
    markColor: color(o.markColor, DEFAULTS.markColor),
    height: unit(o.height, DEFAULTS.height),
    build: unit(o.build, DEFAULTS.build),
    bust: gender === "female" ? unit(o.bust, DEFAULTS.bust) : 0.5,
    headSize: unit(o.headSize, DEFAULTS.headSize),
    eyeSize: unit(o.eyeSize, DEFAULTS.eyeSize),
    accent: color(o.accent, DEFAULTS.accent),
  };
  return { appearance, repairs };
}

/** Хранимая внешность → объект для рендера (числовой индекс модели причёски выводится из каталога). */
export function toRenderAppearance(s: StoredAppearance): Appearance {
  const { hairId, ...rest } = s;
  return { ...rest, hair: (HAIR_BY_ID[hairId] ?? HAIR_BY_ID.short_crop).style };
}

/** Внешность из редактора → хранимая форма. */
export function toStoredAppearance(a: Appearance, hairId: string): StoredAppearance {
  const { hair: _hair, ...rest } = a;
  void _hair;
  return { ...rest, hairId };
}

export const isClassId = (v: unknown): v is ClassId => typeof v === "string" && (CLASS_IDS as readonly string[]).includes(v);
export const isGender = (v: unknown): v is Gender => v === "male" || v === "female";

export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '\-]{1,19}$/u;
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MAX_CHARACTERS = 6;

export interface CharacterDTO {
  id: string;
  name: string;
  classId: ClassId;
  gender: Gender;
  appearance: StoredAppearance;
  armorTier: number;
  weaponTier: number;
  helm: boolean;
  lastPlayedAt: string;
}

export function validateUsername(v: unknown): string | null {
  if (typeof v !== "string" || !USERNAME_RE.test(v.trim())) return "Логин: 3–24 символа, латиница, цифры, «_», «.» или «-».";
  return null;
}
export function validatePassword(v: unknown, username?: string): string | null {
  if (typeof v !== "string" || v.length < PASSWORD_MIN) return `Пароль должен быть не короче ${PASSWORD_MIN} символов.`;
  if (v.length > PASSWORD_MAX) return `Пароль должен быть не длиннее ${PASSWORD_MAX} символов.`;
  if (username && v.toLowerCase() === username.trim().toLowerCase()) return "Пароль не должен совпадать с логином.";
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) return "Пароль должен содержать хотя бы одну букву и одну цифру.";
  return null;
}
export function validateCharacterName(v: unknown): string | null {
  if (typeof v !== "string" || !NAME_RE.test(v.trim())) return "Имя героя: 2–20 символов — буквы, цифры, пробел, «-» или «'».";
  return null;
}
