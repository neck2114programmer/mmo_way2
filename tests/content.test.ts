import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "@/game/types";
import { SKILLS_BY_CLASS } from "@/game/data/skills";
import { CLIPS, animForSkill } from "@/game/render/clips";
import { elementOf } from "@/game/render/skillfx";
import { ZONES } from "@/game/data/zones";
import { SPAWN, ZONE_NAMES } from "@/game/meta";
import { MOBS } from "@/game/data/world";
import { isEventZone } from "@/game/events";
import type { ZoneId } from "@/game/types";

// базовые процедурные стили атак (в игре обрабатываются без keyframe-клипа)
const LEGACY = ["slash", "slash2", "stab", "cast", "shoot", "bash", "whip", "spin", "leap", "buff", "heal", "hit", "block"];

describe("целостность контента (классы, умения, локации)", () => {
  it("у всех 8 классов есть активные умения с существующим клипом анимации и стихией эффекта", () => {
    expect(CLASS_IDS.length).toBe(8);
    for (const c of CLASS_IDS) {
      const actives = SKILLS_BY_CLASS[c].filter((s) => s.type === "active");
      expect(actives.length, c).toBeGreaterThan(0);
      for (const s of actives) {
        const a = animForSkill(s);
        expect(CLIPS[a.kind] ?? LEGACY.includes(a.kind), `${c}/${s.id} → клип ${a.kind}`).toBeTruthy();
        expect(a.dur).toBeGreaterThan(0);
        expect(a.impact).toBeGreaterThanOrEqual(0); expect(a.impact).toBeLessThanOrEqual(1);
        expect(elementOf(s), `${c}/${s.id}`).toBeTruthy();
      }
      // у класса не одна универсальная анимация на все умения
      expect(new Set(actives.map((s) => animForSkill(s).kind)).size, c).toBeGreaterThan(2);
    }
  });
  it("локации: порталы ведут в существующие зоны, есть имя, точка появления и поселение; мобы известны", () => {
    const ids = Object.keys(ZONES) as ZoneId[];
    expect(ids.length).toBeGreaterThanOrEqual(14);
    for (const id of ids) {
      const z = ZONES[id];
      expect(ZONE_NAMES[id], id).toBeTruthy();
      expect(SPAWN[id], id).toBeDefined();
      expect(Number.isFinite(z.hub.x + z.hub.z + z.hub.r), id).toBe(true);
      for (const p of z.portals) expect(ZONES[p.to], `${id}→${p.to}`).toBeDefined();
      for (const m of z.mobs) expect(MOBS[m.mob], `${id}: ${m.mob}`).toBeDefined();
      // из точки появления высота рельефа считается (проходимая поверхность)
      expect(Number.isFinite(z.height(SPAWN[id].x, SPAWN[id].z)), id).toBe(true);
      expect(isEventZone(id)).toBe(!z.cave);
    }
  });
});
