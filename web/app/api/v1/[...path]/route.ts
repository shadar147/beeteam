import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

async function proxy(req: NextRequest, path: string[]) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const url = `${API}/v1/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (token) headers["authorization"] = `Bearer ${token}`;

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const res = await fetch(url, { method: req.method, headers, body, cache: "no-store" });
  // 204 No Content / 304 Not Modified must not carry a body — passing one to the
  // NextResponse/Response constructor throws "Invalid response status code".
  if (res.status === 204 || res.status === 304) {
    return new NextResponse(null, { status: res.status });
  }
  const contentType = res.headers.get("content-type") ?? "application/json";
  // Binary (e.g. application/zip): pass the body through untouched, preserve disposition.
  if (!contentType.includes("application/json")) {
    const headers: Record<string, string> = { "content-type": contentType };
    const cd = res.headers.get("content-disposition");
    if (cd) headers["content-disposition"] = cd;
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": contentType },
  });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
