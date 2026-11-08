import type { NextRequest } from "next/server";
import { destroySession } from "@/server/auth";
import { assertSameOrigin, handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    await destroySession();
    return json({ ok: true });
  });
}
