import { describe, expect, it } from "vitest";
import { HAIR_CATALOG, hairOptionsFor, isHairCompatible, resolveHairId, hairUnderHeadgear } from "@/game/data/hair";
import { normalizeAppearance, toRenderAppearance, validatePassword, validateUsername, validateCharacterName } from "@/game/appearance";
import { randomAppearance } from "@/game/data/classes";

describe("каталог причёсок", () => {
  it("id уникальны, стили уникальны, запасной вариант совместим с обоими полами", () => {
    expect(new Set(HAIR_CATALOG.map((h) => h.id)).size).toBe(HAIR_CATALOG.length);
    expect(new Set(HAIR_CATALOG.map((h) => h.style)).size).toBe(HAIR_CATALOG.length);
    for (const h of HAIR_CATALOG) {
      expect(h.rigs.length).toBeGreaterThan(0);
      for (const g of ["male", "female"] as const) if (isHairCompatible(h.id, g)) expect(isHairCompatible(h.fallback, g)).toBe(true);
    }
  });
  it("женская причёска не доступна и не сохраняется для мужской модели", () => {
    expect(isHairCompatible("twin_tails", "male")).toBe(false);
    expect(hairOptionsFor("male").some((h) => h.id === "bob" || h.id === "bun")).toBe(false);
    expect(hairOptionsFor("female").some((h) => h.id === "mohawk")).toBe(false);
    expect(resolveHairId("twin_tails", "male")).toEqual({ id: "ponytail", repaired: true });
    expect(resolveHairId("nonexistent", "female").id).toBe("long_straight");
  });
  it("правила головных уборов: шлем скрывает волосы, шапка оставляет «шапочку»", () => {
    expect(hairUnderHeadgear("ponytail", "helm")).toBe("hidden");
    expect(hairUnderHeadgear("ponytail", "hat")).toBe("cap");
    expect(hairUnderHeadgear("ponytail", "crown")).toBe("full");
    expect(hairUnderHeadgear("mohawk", "crown")).toBe("cap"); // торчащая причёска не пробивает корону
    expect(hairUnderHeadgear("bun", "horn")).toBe("cap");
  });
});

describe("нормализация внешности", () => {
  it("исправляет только причёску, остальные настройки сохраняются", () => {
    const r = normalizeAppearance({ hairId: "bun", hairColor: "#FF00AA", skin: "#a56a43", ears: 1, eyeStyle: 3 }, "male");
    expect(r.appearance.hairId).toBe("ponytail");
    expect(r.repairs[0]).toContain("bun->ponytail");
    expect(r.appearance).toMatchObject({ hairColor: "#ff00aa", skin: "#a56a43", ears: 1, eyeStyle: 3 });
  });
  it("переводит старый числовой индекс в стабильный id и отбрасывает мусор", () => {
    expect(normalizeAppearance({ hair: 4 }, "female").appearance.hairId).toBe("bob");
    expect(normalizeAppearance({ hair: 4 }, "male").appearance.hairId).toBe("short_crop");
    const r = normalizeAppearance({ skin: "red; DROP TABLE", ears: 99, height: 5, evil: "x", hairId: 7 }, "female").appearance as unknown as Record<string, unknown>;
    expect(r.skin).toBe("#f9d2b4"); expect(r.ears).toBe(0); expect(r.height).toBe(1); expect("evil" in r).toBe(false); expect(r.hairId).toBe("long_straight");
  });
  it("рендер получает числовой стиль из каталога", () => {
    expect(toRenderAppearance(normalizeAppearance({ hairId: "braid" }, "male").appearance).hair).toBe(7);
  });
  it("случайная внешность выбирает только совместимые причёски", () => {
    for (let i = 0; i < 200; i++) {
      const m = randomAppearance("male"), f = randomAppearance("female");
      expect(hairOptionsFor("male").some((h) => h.style === m.hair)).toBe(true);
      expect(hairOptionsFor("female").some((h) => h.style === f.hair)).toBe(true);
    }
  });
});

describe("правила полей", () => {
  it("логин, пароль, имя героя", () => {
    expect(validateUsername("ab")).not.toBeNull(); expect(validateUsername("Hero_01")).toBeNull(); expect(validateUsername("a b c")).not.toBeNull();
    expect(validatePassword("short1")).not.toBeNull(); expect(validatePassword("onlyletters")).not.toBeNull(); expect(validatePassword("goodpass123")).toBeNull();
    expect(validatePassword("Hero_0101", "hero_0101")).not.toBeNull();
    expect(validateCharacterName("Арвен")).toBeNull(); expect(validateCharacterName("<script>")).not.toBeNull();
  });
});
