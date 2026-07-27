import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Edge runtime cannot open SQLite, so this is a cheap cookie-presence check
// only. Real session validation happens in the (app) layout and inside every
// server action. The login page must stay reachable with a cookie present —
// a stale/invalid cookie (deactivation, revocation) would otherwise bounce
// between / and /login forever; the login page itself redirects users whose
// session actually validates.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // api/digest and api/calendar are excluded from the cookie check — the
    // first carries a CRON_SECRET bearer guard, the second a per-user HMAC
    // token (calendar apps can't send cookies). Both fail closed.
    "/((?!api/auth|api/digest|api/calendar|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
