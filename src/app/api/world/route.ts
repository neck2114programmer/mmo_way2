import type { NextRequest } from "next/server";
import { EVENT_ZONES } from "@/game/events";
import type { ZoneId } from "@/game/types";
import { requireUser } from "@/server/auth";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/server/http";
import { getWorld, snapshotOf } from "@/server/world";

export const dynamic = "force-dynamic";

/** Снимок мира: время суток и реальные события (источник — серверный EventDirector). */
export function GET() {
  return handle(async () => {
    await requireUser();
    return json(snapshotOf(getWorld()));
  });
}

/** Служебные действия для проверки событий — только для логинов из ADMIN_LOGINS. */
export function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    if (!u.isAdmin) throw new ApiError(403, "forbidden", "Недостаточно прав.");
    const b = await readJson(req);
    const d = getWorld();
    switch (b.action) {
      case "force": {
        const zone = b.zone as ZoneId;
        if (!EVENT_ZONES.includes(zone)) throw new ApiError(400, "bad_zone", "В этой зоне события не бывают.");
        d.force(zone, b.kind === "hunter" ? "hunter" : b.kind === "raid" ? "raid" : undefined);
        break;
      }
      case "resolve": {
        const ev = d.events.find((e) => e.status === "active");
        if (ev) d.resolve(ev.id, b.ok === true);
        break;
      }
      case "setTod": if (typeof b.tod === "number" && b.tod >= 0 && b.tod <= 1) d.setTod(b.tod); break;
      case "speed": if (b.speed === 1 || b.speed === 10 || b.speed === 40) d.speed = b.speed; break;
      default: throw new ApiError(400, "bad_action", "Неизвестное действие.");
    }
    return json(snapshotOf(d));
  });
}
