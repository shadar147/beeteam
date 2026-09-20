# BeeTeam web (Vue)

Nuxt 4 + Vue 3 port of `../web` (Next.js). Same screens, tokens, API contract and
e2e specs. Conventions and the React→Vue mapping live in [PORTING.md](./PORTING.md).

## Run
```bash
docker compose up -d            # from repo root: postgres + minio
(cd ../api && cargo run -p bt-api)
pnpm install
pnpm dev                        # http://localhost:3000
```
`NUXT_API_INTERNAL_URL` overrides the Rust API address (default `http://localhost:8080`).
Demo logins: lead `e.glebov@beeteam.io`, HR `o.klimova@beeteam.io`, password `demo1234`.

## Architecture
- `ssr: false`: the app renders client-side; Nitro (`server/`) is a thin BFF.
  `server/api/auth/*` keeps the JWT in an httpOnly `bt_session` cookie,
  `server/api/v1/[...path].ts` proxies to the Rust API with a Bearer header,
  `server/middleware/auth.ts` redirects page requests by cookie presence.
- `app/middleware/auth.global.ts` loads the session user once (`/api/auth/me`).
- `app/lib/api/schema.d.ts` is generated from the API's OpenAPI: `pnpm gen:api`.
- Data: `@tanstack/vue-query` hooks in `app/lib/query`; UI state: Pinia (`app/stores`).

## Checks
```bash
pnpm typecheck     # vue-tsc
pnpm test          # vitest, 125 cases (1:1 with ../web)
pnpm test:e2e      # playwright, same specs as ../web/e2e
pnpm build
```
