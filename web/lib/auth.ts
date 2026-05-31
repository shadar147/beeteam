import { cookies } from "next/headers";

export const SESSION_COOKIE = "bt_session";
const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type SessionUser = { id: string; name: string; email: string; role: string };

/** Server-side: read the current user from the session cookie via /v1/auth/me. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}
