import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

function clearSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

/** Explicit logout from the UI. */
export async function POST() {
  return clearSession(NextResponse.json({ ok: true }));
}

/** Clear a stale/invalid session cookie, then bounce to /login.
 *  Used by the (app) layout when the cookie is present but the token is
 *  no longer valid (expired, or the user row is gone) — without clearing
 *  the cookie the middleware would redirect back and loop. This route is
 *  under /api, which the middleware matcher excludes, so no loop. */
export async function GET(req: NextRequest) {
  return clearSession(NextResponse.redirect(new URL("/login", req.url)));
}
