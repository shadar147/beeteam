import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
const WEEK = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  const { email, password, remember } = await req.json();

  const res = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const data = (await res.json()) as { token: string; user: unknown };
  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: WEEK } : {}),
  });
  return response;
}
