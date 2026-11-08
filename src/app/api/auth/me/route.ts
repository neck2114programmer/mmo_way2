import { getSessionUser } from "@/server/auth";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const u = await getSessionUser();
    if (!u) return json({ user: null }, 401);
    return json({ user: { username: u.username, isAdmin: u.isAdmin } });
  });
}
