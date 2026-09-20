/** Clear a stale/invalid session cookie, then bounce to /login. Without clearing
 *  it first, server/middleware/auth.ts would see the cookie and redirect back. */
export default defineEventHandler((event) => {
  clearSessionCookie(event);
  return sendRedirect(event, "/login");
});
