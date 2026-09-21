/** Proxy /api/v1/* to the Rust API, mapping the httpOnly cookie to a Bearer header. */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE);
  const path = getRouterParam(event, "path") ?? "";
  const search = getRequestURL(event).search;
  const method = event.method;

  const headers: Record<string, string> = {};
  const ct = getRequestHeader(event, "content-type");
  if (ct) headers["content-type"] = ct;
  if (token) headers["authorization"] = `Bearer ${token}`;

  const body = method === "GET" || method === "HEAD" ? undefined : await readRawBody(event, "utf8");
  const res = await fetch(`${apiBase(event)}/v1/${path}${search}`, { method, headers, body });

  setResponseStatus(event, res.status);
  // 204/304 must not carry a body.
  if (res.status === 204 || res.status === 304) return null;

  const contentType = res.headers.get("content-type") ?? "application/json";
  setResponseHeader(event, "content-type", contentType);
  // Binary (e.g. application/zip): pass through untouched, preserve disposition.
  if (!contentType.includes("application/json")) {
    const cd = res.headers.get("content-disposition");
    if (cd) setResponseHeader(event, "content-disposition", cd);
    return Buffer.from(await res.arrayBuffer());
  }
  return res.text();
});
