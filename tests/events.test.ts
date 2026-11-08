import { describe, expect, it } from "vitest";
import { EVENT_DURATION_FOR_TEST, mk } from "./helpers";
import { EV_LINGER, EV_WARN, EVENT_ZONES } from "@/game/events";
import { ZONES } from "@/game/data/zones";

describe("события мира", () => {
  it("событие создаётся в реальных координатах поселения зоны", () => {
    const d = mk();
    const z = EVENT_ZONES[0];
    const e = d.force(z, "raid")!;
    expect(e.status).toBe("active");
    expect(e.hub).toEqual(ZONES[z].hub);
    expect(e.area.x).toBe(ZONES[z].hub.x); expect(e.area.r).toBe(ZONES[z].hub.r + 70);
    expect(d.remaining(e)).toBeGreaterThan(EVENT_DURATION_FOR_TEST - 1000);
  });
  it("охотник перемещается, победа/провал меняют статус, затем событие исчезает", () => {
    const d = mk();
    const e = d.force(EVENT_ZONES[1], "hunter")!;
    const p0 = { ...e.pos };
    d.update(30);
    expect(e.pos).not.toEqual(p0);
    d.resolve(e.id, true);
    expect(e.status).toBe("done");
    d.update((EV_LINGER + 1000) / 1000);
    expect(d.events.find((x) => x.id === e.id)).toBeUndefined();
    const f = d.force(EVENT_ZONES[2], "raid")!;
    d.resolve(f.id, false);
    expect(f.status).toBe("failed");
  });
  it("подземелья без событий; предупреждение «скоро» используется до старта; снимок применяется клиентом", () => {
    const d = mk();
    expect(d.force("crypt", "raid")).toBeNull();
    const up = d.schedule(EVENT_ZONES[3], d.now + EV_WARN);
    expect(up.status).toBe("upcoming");
    d.update(EV_WARN / 1000 + 1);
    expect(up.status).toBe("active");
    const client = mk();
    client.applySnapshot({ now: d.now, tod: d.tod, speed: d.speed, events: JSON.parse(JSON.stringify(d.events)) });
    expect(client.remote).toBe(true);
    expect(client.events.length).toBe(d.events.length);
    const before = JSON.stringify(client.events);
    client.update(600); // клиент не симулирует события сам
    expect(JSON.stringify(client.events)).toBe(before);
  });
});
