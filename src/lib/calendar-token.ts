import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Calendar clients can't send session cookies, so the feed URL carries a
 * per-user token derived from the auth secret. No DB column, nothing to
 * migrate; rotating BETTER_AUTH_SECRET rotates every feed URL.
 */
export function calendarToken(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-secret";
  return createHmac("sha256", secret).update(`ics:${userId}`).digest("hex").slice(0, 32);
}

export function calendarTokenValid(userId: string, token: string): boolean {
  const expected = Buffer.from(calendarToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
