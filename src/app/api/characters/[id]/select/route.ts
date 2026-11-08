import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { selectCharacter } from "@/server/characters";
import { ApiError, assertSameOrigin, handle, json } from "@/server/http";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    const { id } = await ctx.params;
    if (!UUID.test(id)) throw new ApiError(404, "not_found", "Герой не найден.");
    return json({ character: await selectCharacter(u.accountId, id) });
  });
}
