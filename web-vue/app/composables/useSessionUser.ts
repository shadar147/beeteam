import type { SessionUser } from "~/lib/permissions";

/** Session user, loaded once by middleware/auth.global.ts. Null on /login. */
export function useSessionUser() {
  return useState<SessionUser | null>("session-user", () => null);
}

export async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    return await $fetch<SessionUser>("/api/auth/me");
  } catch {
    return null;
  }
}
