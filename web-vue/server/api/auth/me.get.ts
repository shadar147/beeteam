/** Current user from the session cookie; 401 when missing or no longer valid. */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) throw createError({ statusCode: 401 });

  const res = await fetch(`${apiBase(event)}/v1/auth/me`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw createError({ statusCode: 401 });

  const me = (await res.json()) as {
    id: string; name: string; email: string; role: string;
    team_id: string | null; permissions?: string[];
  };
  return {
    id: me.id, name: me.name, email: me.email, role: me.role,
    teamId: me.team_id, permissions: me.permissions ?? [],
  };
});
