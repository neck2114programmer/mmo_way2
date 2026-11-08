import type { Gender } from "../types";

/**
 * Каталог причёсок.
 *
 * У каждой причёски есть СТАБИЛЬНЫЙ строковый идентификатор (хранится в БД) — числовой индекс
 * `style` относится только к процедурному построителю модели (CharacterModel.buildHair) и никогда
 * не сохраняется. Совместимость задаётся явно: поддерживаемые риги и типы головы.
 *
 * Правила для головных уборов:
 *  - "cap"    — под ним остаётся только плотная «шапочка» волос (пряди, хвосты, пучки не торчат сквозь предмет);
 *  - "hidden" — волосы полностью скрыты (закрытый шлем).
 */
export type Rig = "humanoid_m" | "humanoid_f";
export type HeadType = "head_m" | "head_f";
export type HeadgearRule = "full" | "cap" | "hidden";
export type HeadgearKind = "hat" | "hood" | "helm" | "crown" | "horn";

export interface HairDef {
  id: string;
  name: string;
  /** индекс процедурной модели (только для рендера) */
  style: number;
  rigs: Rig[];
  headTypes: HeadType[];
  /** посадка относительно головы: смещение точки привязки (м) и масштаб */
  fit: { anchorY: number; anchorZ: number; scale: number };
  /** правила сочетания с головными предметами */
  headgear: Record<HeadgearKind, HeadgearRule>;
  /** запасной вариант при несовместимости */
  fallback: string;
}

const BOTH_R: Rig[] = ["humanoid_m", "humanoid_f"];
const BOTH_H: HeadType[] = ["head_m", "head_f"];
const MALE_R: Rig[] = ["humanoid_m"];
const MALE_H: HeadType[] = ["head_m"];
const FEMALE_R: Rig[] = ["humanoid_f"];
const FEMALE_H: HeadType[] = ["head_f"];
/** обычная причёска: под шляпой/капюшоном — «шапочка», шлем скрывает всё, корона/рога сидят поверх */
const COVER = { hat: "cap", hood: "cap", helm: "hidden", crown: "full", horn: "full" } as const;
/** высокая/торчащая причёска (ирокез, ёжик, пучок): сквозь корону и рога не пропускаем — остаётся «шапочка» */
const TALL = { hat: "cap", hood: "cap", helm: "hidden", crown: "cap", horn: "cap" } as const;
const FIT = { anchorY: 0, anchorZ: 0, scale: 1 };

export const HAIR_CATALOG: readonly HairDef[] = [
  { id: "short_crop", name: "Короткая", style: 0, rigs: BOTH_R, headTypes: BOTH_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
  { id: "long_straight", name: "Длинная прямая", style: 1, rigs: BOTH_R, headTypes: BOTH_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
  { id: "ponytail", name: "Хвост", style: 2, rigs: BOTH_R, headTypes: BOTH_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
  { id: "twin_tails", name: "Два хвоста", style: 3, rigs: FEMALE_R, headTypes: FEMALE_H, fit: FIT, headgear: COVER, fallback: "ponytail" },
  { id: "bob", name: "Каре", style: 4, rigs: FEMALE_R, headTypes: FEMALE_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
  { id: "spikes", name: "Ёжик", style: 5, rigs: MALE_R, headTypes: MALE_H, fit: FIT, headgear: TALL, fallback: "short_crop" },
  { id: "mohawk", name: "Ирокез", style: 6, rigs: MALE_R, headTypes: MALE_H, fit: FIT, headgear: TALL, fallback: "short_crop" },
  { id: "braid", name: "Коса", style: 7, rigs: BOTH_R, headTypes: BOTH_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
  { id: "bun", name: "Пучок", style: 8, rigs: FEMALE_R, headTypes: FEMALE_H, fit: FIT, headgear: TALL, fallback: "ponytail" },
  { id: "wave", name: "Волна", style: 9, rigs: BOTH_R, headTypes: BOTH_H, fit: FIT, headgear: COVER, fallback: "short_crop" },
];

export const HAIR_BY_ID: Readonly<Record<string, HairDef>> = Object.fromEntries(HAIR_CATALOG.map((h) => [h.id, h]));

export const rigOf = (g: Gender): Rig => (g === "female" ? "humanoid_f" : "humanoid_m");
export const headTypeOf = (g: Gender): HeadType => (g === "female" ? "head_f" : "head_m");
export const DEFAULT_HAIR: Record<Gender, string> = { male: "short_crop", female: "long_straight" };

export function isHairCompatible(id: string, g: Gender): boolean {
  const h = HAIR_BY_ID[id];
  return !!h && h.rigs.includes(rigOf(g)) && h.headTypes.includes(headTypeOf(g));
}

/** Причёски, доступные для выбора (несовместимые скрыты). */
export const hairOptionsFor = (g: Gender): HairDef[] => HAIR_CATALOG.filter((h) => isHairCompatible(h.id, g));

/** Совместимая причёска: исходная, если подходит, иначе запасная, иначе значение по умолчанию. */
export function resolveHairId(id: unknown, g: Gender): { id: string; repaired: boolean } {
  if (typeof id === "string" && isHairCompatible(id, g)) return { id, repaired: false };
  const fb = typeof id === "string" ? HAIR_BY_ID[id]?.fallback : undefined;
  if (fb && isHairCompatible(fb, g)) return { id: fb, repaired: true };
  return { id: DEFAULT_HAIR[g], repaired: true };
}

/** Что показывать из причёски под головным предметом. */
export function hairUnderHeadgear(id: string, kind: HeadgearKind): HeadgearRule {
  return (HAIR_BY_ID[id] ?? HAIR_BY_ID.short_crop).headgear[kind];
}

/** Старые сохранения хранили числовой индекс причёски (0..9) — переводим в стабильный id. */
export const legacyHairIdFromIndex = (i: unknown): string | undefined =>
  typeof i === "number" && Number.isInteger(i) ? HAIR_CATALOG.find((h) => h.style === i)?.id : undefined;
