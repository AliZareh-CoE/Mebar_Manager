import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { calendarTokenValid } from "@/lib/calendar-token";
import { loadMyDeadlines } from "@/lib/my-deadlines";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * Personal ICS feed. Calendar apps can't log in, so the URL carries a
 * per-user HMAC token (see calendar-token.ts) instead of a session.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!userId || !token || !calendarTokenValid(userId, token)) {
    return new Response("Not found", { status: 404 });
  }
  const person = await db
    .select({ id: user.id, name: user.name, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!person || person.banned) return new Response("Not found", { status: 404 });

  const items = await loadMyDeadlines(userId);
  const ics = buildIcs(
    `Mebar deadlines — ${person.name}`,
    items.map(({ uid, date, summary }) => ({ uid, date, summary }))
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mebar-deadlines.ics"',
    },
  });
}
