import { EV_DURATION, EventDirector } from "@/game/events";

export const EVENT_DURATION_FOR_TEST = EV_DURATION;
export function mk() {
  const d = new EventDirector();
  d.setTod(0.9); // ночь
  return d;
}
