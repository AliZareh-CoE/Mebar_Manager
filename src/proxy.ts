import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Edge runtime cannot open SQLite, so this is a cheap cookie-presence check
// only. Real session validation happens in the (app) layout and inside every
// server action.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const isLogin = request.nextUrl.pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Note: no hasSession-on-/login bounce back to "/". A cookie can outlive
  // its server-side session (deactivation, revocation), and bouncing such a
  // browser away from /login creates an infinite / ⇄ /login redirect loop.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
