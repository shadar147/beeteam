# BeeTeam web (Vue)

Nuxt 4 + Vue 3 frontend. It is a 1:1 port of the original Next.js app (`web/`, removed
in September 2026 — see git history before commit `a0cdd9b` for the React source).
Conventions and the React→Vue mapping live in [PORTING.md](./PORTING.md).

## Run
```bash
docker compose up -d            # from repo root: postgres + minio
(cd ../api && cargo run -p bt-api)
nvm use                         # Node 24 (.nvmrc): Nuxt 4 / Vitest 5 / jsdom 30 need Node >= 22.19
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
pnpm test          # vitest, 125 cases
pnpm test:e2e      # playwright, 15 specs; needs the API + seeded DB, reuses a running dev server on :3000
pnpm build
```
