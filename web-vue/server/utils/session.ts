import type { H3Event } from "h3";

export const SESSION_COOKIE = "bt_session";

export function apiBase(event: H3Event): string {
  return useRuntimeConfig(event).apiInternalUrl;
}

export function clearSessionCookie(event: H3Event) {
  setCookie(event, SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
