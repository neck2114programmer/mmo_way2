import type { ZoneId } from "./types";
import { NEW_ZONES, REGION, spawnOf, type NewZone } from "./data/gen";

export const SPAWN: Record<ZoneId, { x: number; z: number }> = {
  ...(Object.fromEntries(NEW_ZONES.map((z) => [z, spawnOf(z)])) as Record<NewZone, { x: number; z: number }>),
  meadow: { x: -18, z: 5 },
  desert: { x: -84, z: 0 },
  forest: { x: -84, z: 0 },
  crypt: { x: 0, z: 76 },
};
export const ZONE_NAMES: Record<ZoneId, string> = {
  ...(Object.fromEntries(NEW_ZONES.map((z) => [z, REGION[z].name])) as Record<NewZone, string>),
  meadow: "Опушка Рассвета",
  desert: "Пески Ал-Хазар",
  forest: "Лес Друидов Эйнвуд",
  crypt: "Склеп Короля-Лича",
};
