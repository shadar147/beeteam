# BeeTeam — Auth slice — Design Spec

**Date:** 2026-05-31
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (Core 1-2-1, build-order slice 2)
**Visual source of truth:** `design_handoff_beeteam/screens.jsx` (LoginScreen `:6`, Sidebar `:101`) + `app.jsx` (Topbar `:70`).

## Context

The Foundation slice (1) is merged to `main`: monorepo, Postgres schema + demo seed,
axum `GET /v1/health` + OpenAPI doc, Next.js 14 + design tokens + typed `openapi-fetch`
client, all proven end-to-end. This slice (2) adds authentication and the authed
application shell — the first real product screens. Everything else (TeamList, Profile,
MeetingDrawer, Goals, Files, Calendar) follows as later slices.

This slice delivers: a working login, the `(app)` chrome (Sidebar + Topbar) that every
later screen hangs off, and the session plumbing (httpOnly cookie via a Next proxy).

## Locked decisions

| Area | Decision |
|------|----------|
| Session storage | **httpOnly cookie** set by a Next route handler proxying axum; token never visible to JS |
| Browser → API | All browser calls go through **Next proxy** (`/api/...`), which maps cookie → `Authorization: Bearer`. No direct browser→axum calls |
| UI scope | **LoginScreen + `(app)` chrome** (Sidebar + Topbar) + logout flow + `/auth/me` hydration. `(app)` content is a placeholder (TeamList is the next slice) |
| Demo password | Seed lead (Евгений Глебов, `e.glebov@beeteam.io`) gets a real argon2 hash of **`demo1234`** |
| Session lifetime | JWT `exp` = 7 days (fixed). "Оставаться в системе" checkbox controls the **cookie** only: checked → persistent (`Max-Age=7d`), unchecked → session cookie |
| Roles | v1 exercises `lead` only; `role` carried in the JWT |
| Token algo | JWT HS256 (`jsonwebtoken`), password hashing Argon2id (`argon2`) |

## Architecture — auth flow

```
Browser ──POST /api/auth/login {email,password}──► Next route handler
                                                      │ (server-side fetch)
                                                      ▼
                                         axum POST /v1/auth/login
                                           argon2 verify → JWT (HS256, exp 7d)
                                                      │
                       Next ◄──── {token, user} ─────┘
                       Set-Cookie: bt_session=JWT; HttpOnly; SameSite=Lax; Path=/;
                                   [Max-Age=604800 if remember]
Browser ──/api/v1/* (+cookie)──► Next catch-all proxy ──Bearer JWT──► axum (require_auth)
```

- Token is httpOnly — never readable by page JS (XSS-resistant).
- The browser never calls axum directly; the Next proxy injects the Bearer from the cookie.
- The Foundation health-probe page (which fetched `http://localhost:8080` directly from
  the browser) is **replaced** by the real login flow. Browser data calls now route
  through `/api/...`. The direct `openapi-fetch` client remains usable for server-side
  fetches (e.g. the `(app)` layout reading `/auth/me`).

## Backend — `bt-api` auth

### Module layout (in `bt-api`, not a separate crate)
- `auth/password.rs` — `hash_password(plain) -> String`, `verify_password(plain, hash) -> bool` (Argon2id, default params).
- `auth/jwt.rs` — `encode_jwt(claims, secret) -> String`, `decode_jwt(token, secret) -> Result<Claims>`. `Claims { sub: Uuid, role: String, exp: i64 }` (HS256).
- `auth/middleware.rs` — `require_auth` axum `from_fn` layer: reads `Authorization: Bearer <jwt>`, validates, inserts `AuthUser { id: Uuid, role: String }` into request extensions; else `AppError::Unauthorized`.
- `routes/auth.rs` — `login` + `me` handlers; both `#[utoipa::path]`-annotated and registered in the OpenAPI doc.

### Endpoints
```
POST /v1/auth/login    body { email: string, password: string }
  → 200 { token: string, user: { id, name, email, role } }   (argon2 verify)
  → 401 { error: "invalid credentials" }                       (no such user OR wrong password — identical response)
GET  /v1/auth/me        (require_auth)
  → 200 { id, name, email, role }
  → 401 if token missing/expired/invalid
```
- Login returns an identical 401 for unknown-email and wrong-password (no account enumeration).
- JWT `exp` is always now + 7 days. The backend does not know about "remember" — the
  cookie lifetime is decided by the Next handler.

### Domain types (`bt-domain`, serde + ToSchema)
- `LoginRequest { email: String, password: String }`
- `AuthUser` / `UserDto { id: Uuid, name: String, email: String, role: String }`
- `LoginResponse { token: String, user: UserDto }`

### Cross-cutting (backend)
- `AppError::Unauthorized` already exists → 401. No new variants needed for this slice.
- **CORS:** tighten `allow_origin` from `Any` to `WEB_ORIGIN` (closes the Foundation
  follow-up). Browser traffic is same-origin via the Next proxy, so wide CORS is no
  longer needed.
- **Seed:** replace the `!seed-no-login` placeholder in `bt-db/src/seed.rs` with a real
  Argon2id hash of `demo1234`, computed at seed time. (The seed gains an `argon2`
  dependency, or the hashing helper is shared from `bt-api` — see plan; simplest is to
  hash in `bt-db` seed directly.)
- `require_auth` guards everything under `/v1/*` except `/v1/auth/login` and `/v1/health`.

### Backend tests (against the isolated test DB :5433, via `api/scripts/test.sh`)
- `verify_password` round-trips a hashed password; rejects a wrong one.
- `login` happy path → 200 + non-empty token + correct user.
- `login` wrong password → 401.
- `login` unknown email → 401 (identical body to wrong password).
- `me` with a valid token → 200 user; with missing/invalid token → 401.
- `require_auth` lets a valid request through and blocks an unauthenticated one.

## Frontend — Login + `(app)` chrome

### Routing (App Router)
```
app/login/page.tsx              LoginScreen (split 1.05fr/1fr) — public
app/(app)/layout.tsx            Sidebar(232) + Topbar(60) + {children}; server component, reads /auth/me
app/(app)/page.tsx              "Моя команда" placeholder card (TeamList — next slice)
middleware.ts                   no bt_session cookie on an (app) path → redirect /login;
                                has cookie on /login → redirect /
app/api/auth/login/route.ts     proxy → axum POST /v1/auth/login; sets bt_session cookie
app/api/auth/logout/route.ts    clears bt_session cookie
app/api/v1/[...path]/route.ts   catch-all proxy: forwards to axum with cookie→Bearer
```
The Foundation health-probe home page is removed; its contract-proving role passes to
the real login flow + the e2e test.

### LoginScreen (pixel-faithful to `screens.jsx:6`)
- Split layout: left art block (radial `--brand` gradients, hex-tile grid via clip-path,
  quote «1-2-1, которые не теряются», footer), right form column 380px.
- Fields: email (`name@company.com`), password with `eye`/`eyeOff` toggle, "Забыли
  пароль?" link (**stub** — no behavior), "Оставаться в системе" checkbox, "Войти →"
  button (`btn-primary btn-lg`, full-width), "или" divider, "Войти через Active
  Directory" button (Microsoft-tile, **stub** — disabled / "скоро"), domain-account
  footnote.
- States: loading (spinner in submit button, disabled), inline error ("Неверная почта
  или пароль"), submit on Enter.
- Client component; submit → `POST /api/auth/login` → on success `router.push('/')`.
- Amber brand color via the `brand` token family (NOT `accent` — shadcn reserves it).

### `(app)` chrome
- **Sidebar 232px** (`screens.jsx:101`): BeeTeam logo (B in an amber square), section
  "Команда" (Моя команда·8, Календарь·4, Грейды, Конструктор полей, Экспорт) and
  "Администрирование" (Команды, Лиды, Настройки). All items rendered; active-state
  highlight works; only "Моя команда" navigates (others are disabled / route to a
  placeholder). Bottom: user card (Avatar + name + role from `/auth/me`) + logout button.
- **Topbar 60px** (`app.jsx:70`): breadcrumbs left; right side Help(?) / Search(🔍) /
  "Новая 1-2-1" (primary) — all **stubs** this slice; backdrop-blur background.
- shadcn primitives where they fit (buttons); Sidebar/Topbar are BeeTeam composites
  styled to tokens.

### New composites (`components/`) — small, single-purpose, unit-testable
`Logo` (B mark + wordmark) · `Avatar` (oklch hue→bg/text, initials — needed for the user
card, reused everywhere later) · `NavItem` (icon + label + optional count + active state)
· `Sidebar` · `Topbar`.

### Hydration & logout
- `(app)/layout.tsx` is a server component: it reads `/auth/me` server-side (cookie
  present) and passes `user` to Sidebar. Missing/expired token never reaches here —
  `middleware.ts` already redirected to `/login`.
- Logout: Sidebar button → `POST /api/auth/logout` (clears cookie) → `router.push('/login')`.

### Frontend tests
- Vitest: LoginScreen (renders, password toggle, inline error on failed login, submit
  disabled while pending); NavItem (active vs inactive); Avatar (hue math + initials).
- Playwright e2e (proves the slice end-to-end):
  1. Visit `/` with no cookie → redirected to `/login`.
  2. Enter `e.glebov@beeteam.io` / `demo1234` → land in `(app)` chrome → see "Евгений
     Глебов" in the Sidebar user card.
  3. Logout → back to `/login`.
  4. Negative: wrong password → inline error, stay on `/login`.

## Scope

### In scope
Backend: `POST /v1/auth/login`, `GET /v1/auth/me`, JWT middleware, argon2 password util,
CORS tightened to `WEB_ORIGIN`, seed hash for `demo1234`.
Frontend: LoginScreen, `(app)` chrome (Sidebar + Topbar), Next route handlers
(login/logout/catch-all proxy), middleware redirect, logout flow, `Avatar`/`Logo`/`NavItem`
composites, `(app)/page.tsx` placeholder.

### Stubs (rendered to design, no behavior)
"Забыли пароль?", Active Directory button, "Новая 1-2-1", Help/Search, nav items other
than "Моя команда", notifications (bell). `(app)/page.tsx` is a placeholder card
("Здесь будет команда").

### Deferred (later slices / sub-projects)
Real AD/SAML, password reset, registration, refresh-token rotation, login rate-limiting,
roles beyond `lead`.

### Boundary note
This slice delivers login + the shell, but `(app)` **content is empty by design** —
TeamList is the next slice. Do not build a partial TeamList here.

## Build order (vertical sub-steps)
1. Backend auth: `password` util → `jwt` → `login`/`me` handlers → `require_auth`
   middleware → seed hash (`demo1234`) → CORS to `WEB_ORIGIN`. Backend tests green.
2. Regenerate types (`pnpm gen:api`) — `/auth/login`, `/auth/me` land in `schema.d.ts`.
3. Next: route handlers (login/logout/catch-all proxy) + `middleware.ts`.
4. LoginScreen + composites (`Logo`/`Avatar`/`NavItem`), wire submit.
5. `(app)` chrome (Sidebar + Topbar) + `/auth/me` hydration + logout.
6. Vitest + Playwright e2e, then merge.

## What to preserve when porting (from parent spec)
Warm beige palette; amber brand on the `brand` token (not `accent`); tabular-nums on
counts; Russian microcopy verbatim ("С возвращением", "Оставаться в системе на этом
устройстве", "Войти через Active Directory"); pill-based statuses; meaningful empty
states; the `[data-theme]`/`[data-density]` token system from Foundation.
