/** Cookie-presence gate for page requests (same rule as the old Next middleware).
 *  Token validity is checked client-side via /api/auth/me. */
export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event);
  if (pathname.startsWith("/api") || pathname.startsWith("/_nuxt") || pathname.startsWith("/__") || pathname.includes(".")) return;

  const hasSession = Boolean(getCookie(event, SESSION_COOKIE));
  const isLogin = pathname === "/login";
  if (!hasSession && !isLogin) return sendRedirect(event, "/login");
  if (hasSession && isLogin) return sendRedirect(event, "/");
});
