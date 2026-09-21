const WEEK = 60 * 60 * 24 * 7;

export default defineEventHandler(async (event) => {
  const { email, password, remember } = await readBody<{ email: string; password: string; remember?: boolean }>(event);

  const res = await fetch(`${apiBase(event)}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    setResponseStatus(event, 401);
    return { error: "invalid credentials" };
  }

  const data = (await res.json()) as { token: string; user: unknown };
  setCookie(event, SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: !import.meta.dev,
    ...(remember ? { maxAge: WEEK } : {}),
  });
  return { user: data.user };
});
