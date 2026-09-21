/** Loads the session user once and enforces the login gate on client navigation. */
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSessionUser();
  const isLogin = to.path === "/login";

  if (!user.value && !isLogin) {
    user.value = await fetchSessionUser();
    // Cookie missing or token no longer valid → clear it server-side, land on /login.
    if (!user.value) return navigateTo("/api/auth/logout", { external: true });
  }
  if (user.value && isLogin) return navigateTo("/");
});
