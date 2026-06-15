import { cookies } from "next/headers";
export type { SessionUser } from "./permissions";
export { hasPermission } from "./permissions";

export const SESSION_COOKIE = "bt_session";
const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/** Server-side: read the current user from the session cookie via /v1/auth/me. */
export async function getSessionUser(): Promise<import("./permissions").SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const me = (await res.json()) as {
      id: string; name: string; email: string; role: string;
      team_id: string | null; permissions?: string[];
    };
    return {
      id: me.id, name: me.name, email: me.email, role: me.role,
      teamId: me.team_id, permissions: me.permissions ?? [],
    };
  } catch {
    return null;
  }
}

