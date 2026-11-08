import { EventDirector, type WorldEvent } from "@/game/events";

/**
 * Серверные часы мира и события. Единственный источник истины — этот экземпляр EventDirector
 * (те же правила, что и в игре: только ночью, 5 минут, награда за победу). Клиенты лишь получают снимок.
 * Состояние живёт в памяти процесса сервера (как и состояние мира игры); в PostgreSQL не пишется.
 */
const g = globalThis as typeof globalThis & { __eldoriaWorld?: { d: EventDirector; last: number } };

export function getWorld(): EventDirector {
  const w = (g.__eldoriaWorld ??= { d: new EventDirector(), last: Date.now() });
  const now = Date.now();
  let dt = (now - w.last) / 1000;
  w.last = now;
  for (let i = 0; dt > 0 && i < 300; i++) { const s = Math.min(dt, 1); w.d.update(s); dt -= s; }
  if (dt > 0) w.d.update(dt);
  return w.d;
}

export interface WorldSnapshot { now: number; tod: number; speed: number; events: WorldEvent[] }
export const snapshotOf = (d: EventDirector): WorldSnapshot => ({ now: d.now, tod: d.tod, speed: d.speed, events: d.events });
