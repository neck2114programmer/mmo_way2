import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { deleteCharacter, updateCharacter } from "@/server/characters";
import { ApiError, assertSameOrigin, handle, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, "not_found", "Герой не найден.");
  return id;
}

export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    return json({ character: await updateCharacter(u.accountId, await idOf(ctx), await readJson(req)) });
  });
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    await deleteCharacter(u.accountId, await idOf(ctx));
    return json({ ok: true });
  });
}
