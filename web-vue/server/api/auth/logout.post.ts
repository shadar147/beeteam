/** Explicit logout from the UI. */
export default defineEventHandler((event) => {
  clearSessionCookie(event);
  return { ok: true };
});
