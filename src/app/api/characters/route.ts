import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { createCharacter, listCharacters } from "@/server/characters";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const u = await requireUser();
    return json({ characters: await listCharacters(u.accountId) });
  });
}

export function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    return json({ character: await createCharacter(u.accountId, await readJson(req)) }, 201);
  });
}
