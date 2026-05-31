import createClient from "openapi-fetch";
import type { paths } from "./schema";

// Browser calls go through the Next proxy (/api/v1/*), which maps the httpOnly
// session cookie to a Bearer header. No direct browser→axum calls.
export const api = createClient<paths>({ baseUrl: "/api" });
