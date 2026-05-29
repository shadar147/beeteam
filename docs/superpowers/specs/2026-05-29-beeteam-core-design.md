# BeeTeam — Core 1-2-1 (v1) — Design Spec

**Date:** 2026-05-29
**Status:** Approved for planning
**Source of truth for design:** `design_handoff_beeteam/README.md` (tokens, screens, data models) + prototype files in the same folder.

## Context

BeeTeam is a web product for team leads to run regular 1-2-1 meetings: review the
team, open an employee profile, conduct a 1-2-1 through a customizable drawer, and
track mood/development over time. The handoff folder contains a **hi-fi prototype**
(React-via-Babel, in-memory mock data on `window.BT_DATA` / `window.BT_GRADES`) that
fixes the visual design pixel-for-pixel. There is no backend logic to port — only UI
behavior and data shapes.

The full README describes ~15 screens plus a Grades/Competency/Performance-Review
subsystem (its own data models, matrix editor, calibration, review flow). That is too
large for one implementation. This spec covers **one shared architecture + the first
vertical slice (Core 1-2-1)**. Everything else is decomposed into later sub-projects,
each with its own spec → plan → implementation cycle.

## Locked decisions

| Area | Decision |
|------|----------|
| MVP scope | **Core 1-2-1**: TeamList → EmployeeProfile → MeetingDrawer → Calendar |
| Layering | **Vertical slices** — each feature goes schema → endpoint → typed client → screen, working end-to-end before the next |
| Auth | **JWT email+password** (argon2). AD/SAML buttons present but stubbed |
| Database | **PostgreSQL** via Docker; sqlx with compile-time-checked queries |
| Repo | **Monorepo**: `/web`, `/api`, `docker-compose.yml`, `/docs` |
| API contract | **OpenAPI → codegen**: axum+utoipa emits OpenAPI; `openapi-typescript` generates TS types; `openapi-fetch` typed client. Rust is source of truth |
| File storage | **MinIO/S3** (docker-compose), presigned upload/download URLs |
| Theming | **Infra + toggle**: all tokens as CSS vars under `data-theme`/`data-density`; light/dark + density user toggle |
| Stack | Next.js 14 (App Router) + TS + Tailwind + shadcn/ui; Rust + axum + sqlx |

## Tech stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui (Radix
  primitives), lucide-react, TanStack Query v5, Zustand (drawer/modal open-state),
  `next/font/google` for Geist + Geist Mono, `openapi-fetch` + `openapi-typescript`.
- **Backend:** Rust, axum, sqlx (Postgres), utoipa (OpenAPI), tower-http
  (CORS/trace/compression), argon2 + jsonwebtoken, validator, aws-sdk-s3 (MinIO).
- **Infra:** docker-compose (postgres + minio + adminer for dev), sqlx-cli migrations.

## Repo layout

```
beeteam/
├─ docker-compose.yml        # postgres + minio (+ adminer for dev)
├─ .env.example
├─ docs/superpowers/specs/   # this spec + future sub-project specs
├─ api/                      # Rust workspace
│  ├─ crates/
│  │  ├─ bt-api/             # axum bin: routes, handlers, auth middleware, OpenAPI doc
│  │  ├─ bt-domain/          # types/models, serde + utoipa::ToSchema
│  │  └─ bt-db/              # sqlx queries, migrations/, repositories, seed
│  └─ Cargo.toml
└─ web/                      # Next.js 14 App Router
   ├─ app/                   # routes mirror the README screen map
   ├─ components/ui/         # shadcn/ui primitives, restyled to tokens
   ├─ components/            # BeeTeam composites (Avatar, Pill, StatCard, …)
   ├─ lib/api/               # generated schema.d.ts + typed fetch client
   ├─ lib/query/             # TanStack Query hooks
   ├─ lib/store/             # Zustand drawer/modal store
   └─ styles/tokens.css      # all README design tokens as CSS vars
```

## Architecture overview

```
┌─────────── web (Next.js 14) ───────────┐        ┌────────── api (Rust/axum) ──────────┐
│ App Router routes (RSC shell)           │        │ bt-api: router + handlers + auth mw  │
│  └─ client screens                      │  HTTP  │   └─ utoipa → /api-docs/openapi.json │
│      └─ TanStack Query hooks            │ ─────► │ bt-db: sqlx repositories + migrations│
│          └─ openapi-fetch (typed)       │  JWT   │ bt-domain: serde + ToSchema types    │
│ Zustand store (drawer/modal open-state) │ cookie │                                      │
└─────────────────────────────────────────┘        └──────┬──────────────┬────────────────┘
                                                           │              │
                                                     PostgreSQL        MinIO (S3)
```

**Contract flow:** `bt-api` serves `/api-docs/openapi.json`. `web` script `pnpm gen:api`
runs `openapi-typescript` against it → `lib/api/schema.d.ts`, consumed by the
`openapi-fetch` client. Rust is the single source of truth; contract drift becomes a
TS typecheck error.

## Backend

### Crate split
- `bt-domain` — pure request/response + model types, `serde` + `utoipa::ToSchema`. No I/O.
- `bt-db` — sqlx repositories (`query_as!` compile-time checked), `migrations/`, seed loader.
- `bt-api` — axum router, handlers, JWT auth middleware, `AppError`→`IntoResponse`
  mapping, OpenAPI doc assembly, MinIO presign.

### v1 schema (sqlx migrations)

Native PG types matched 1:1 to the prototype's shapes — enums, arrays, jsonb, not
JSON-blob-everything.

```sql
workspaces(id, name, domain, default_cadence, created_at)
users(id, workspace_id, email UNIQUE, password_hash, name, role, hue, created_at)
  -- role enum: lead | hr_admin | employee
teams(id, workspace_id, name, mission, color, lead_id→users,
      default_template_id→field_templates, default_cadence, visibility)
  -- cadence enum: 1w | 2w | 4w ; visibility enum: private | hr | org
team_members(id, workspace_id, team_id→teams, name, role, email, joined,
      tz, mood_trend int[], status, tags text[], lead_id→users NULL, hue)
  -- status enum: ok | warn | miss
field_templates(id, workspace_id, name, description, system bool,
      version, updated_at, updated_by)
field_defs(id, template_id→field_templates, ord, type, title, required,
      placeholder, hint, options text[])
  -- type enum: text | longtext | scale | mood | checklist | select | date | file
member_field_overrides(member_id, template_id, ...)  -- reserved; populated in a later sub-project
meetings(id, workspace_id, member_id→team_members, date, state, duration_min,
      mood, mood_score, fields jsonb, blockers, goals, feedback_to,
      feedback_from, development text[], relationships, created_at, updated_at)
  -- state enum: planned | done | miss ; fields jsonb = dynamic-by-template values
goals(id, workspace_id, member_id, quarter, title, key_result, progress, status, due)
  -- status enum: ontrack | risk | done
files(id, workspace_id, member_id, meeting_id NULL, name, mime, kind,
      size_bytes, storage_key, uploaded_by, created_at)
  -- kind enum: doc | img | pdf | video | sheet
```

`mood_trend int[]`, `tags text[]`, `development text[]`, and `fields jsonb` map the
prototype shapes directly and stay queryable.

### Endpoints (REST, `/v1`, JWT-guarded except `/auth/login`)

- `POST /auth/login` → JWT (argon2 verify); `GET /auth/me`
- `GET /teams/:id/members` · `GET /members/:id` · `POST /members` · `PATCH /members/:id`
- `GET /members/:id/meetings` · `GET /meetings/:id` · `POST /meetings` (plan/start)
  · `PATCH /meetings/:id` (autosave draft) · `POST /meetings/:id/complete`
- `GET /teams/:id/stats` → 4 TeamList stat cards, computed server-side
  (this-week / overdue / avg-mood / notes-this-quarter)
- `GET /teams/:id/calendar?from&to` → meetings for month/week/list views
- `GET /members/:id/goals` · `POST /goals` · `PATCH /goals/:id` · `DELETE /goals/:id`
- `GET /templates` · `GET /templates/:id` (field defs to render the drawer fill form)
- `GET /members/:id/files` · `POST /files` (presign) · `PUT` direct to MinIO
  · `GET /files/:id` (presigned download)

### Cross-cutting (backend)
- `tower-http`: CORS, trace, compression.
- Single `AppError` → RFC-7807-ish JSON via `IntoResponse`.
- `validator` on all inputs.
- Autosave = debounced `PATCH /meetings/:id` writing columns/`fields` while the meeting
  is `planned`/draft; `POST /meetings/:id/complete` transitions to `done`.
- Seed (from `data.js`): one workspace, one lead user (Евгений Глебов), the 8-member
  team, and Anna Lebedeva's 6-meeting history; one seeded "Базовый" field template.

## Frontend

### Design tokens first
All README tokens → CSS custom properties in `styles/tokens.css`, scoped by
`[data-theme="light|dark"]` and `[data-density="compact|regular|cozy"]` on `<html>`.
Tailwind `theme.extend` references the vars (`colors.accent: 'var(--accent)'`, radii,
shadows) so utilities and shadcn components both resolve to tokens — single source for
light/dark/density. Geist + Geist Mono via `next/font/google` with `ss01`/`cv11`
features; `tabular-nums` utility on all numeric/date/percent text.

### shadcn/ui = primitive layer, not the look
Pull in Dialog, Sheet (→ MeetingDrawer), Popover (→ FilterPopover), Tabs/ToggleGroup
(→ seg-controls), Select, Checkbox, Switch — then restyle each to the spec:
- `.btn` 36px / radius 10 / 1px line / bg-elev; `.btn-primary` accent bg + dark text
  (`#1A1100`) + inner highlight; `-sm` 30px, `-lg` 44px, `-icon` square.
- Inputs 40px / radius 10; focus ring `0 0 0 4px rgba(245,165,36,.14)` + accent border.
- Pills 22px / radius 999 / 1px border, variants default/ok/warn/miss/info/accent.
lucide-react for icons (README confirms names match).

### BeeTeam composites (`components/`) — small, single-purpose, unit-testable
`Avatar` (oklch hue→bg/text, sizes sm 24/md 36/lg 56/xl 84, initials from first two
words) · `Pill` · `StatCard` · `MoodTrendBars` (7 bars, height 4–18px, l→r opacity) ·
`MonthCalendar` (7×6 grid, today accent ring, day chips) · `NoteBlock` ·
`Feed`/`FeedItem` (44×44 date chip + 2-line preview) · `SegControl` · `EmptyState`.

### Routing (App Router) — mirrors README screen map
```
app/login/page.tsx                       LoginScreen (split 1.05fr/1fr)
app/(app)/layout.tsx                      Sidebar (232px) + Topbar (60px, backdrop-blur)
app/(app)/page.tsx                        TeamList
app/(app)/profile/[id]/layout.tsx         profile header + seg tabs
app/(app)/profile/[id]/history/page.tsx   (default tab)
app/(app)/profile/[id]/goals/page.tsx
app/(app)/profile/[id]/files/page.tsx
app/(app)/calendar/page.tsx               month | week | list
```
- Interactive screens are **client components** fetching via TanStack Query hooks over
  the typed client; the `(app)` layout shell + static chrome stay RSC.
- `<MeetingDrawer/>` and modals are mounted in `(app)/layout` and driven by a Zustand
  store, because a 1-2-1 can open from the feed, a profile, or the topbar.
- Theme/density toggle = a small provider writing `data-*` attributes, persisted to
  localStorage.

### MeetingDrawer field types
`FieldControl` switch renders: text/longtext (input/textarea) · scale (10 buttons 1–10)
· mood (5 emoji 😞😐🙂😄🤩 + scale) · checklist (2-col custom checkboxes) · select
(native) · date (ДД.ММ.ГГГГ text input) · file (dashed dropzone → MinIO presign).
Autosave indicator `●` bound to the debounced PATCH mutation state. Drawer = Sheet,
720px × 92vw, full-height, scrim with blur.

## Scope

### In scope (Core 1-2-1)
- **LoginScreen** — split layout, email+password, password visibility toggle,
  "Остаться в системе", stubbed AD button.
- **TeamList** — page header, 4 stat cards, filter bar + segment tabs, FilterPopover
  (client-side filtering over the fetched set), 6-column team table, mood trends,
  status pills, add-employee footer plate (CTA only; modal deferred).
- **EmployeeProfile** — profile header + History / Goals / Files tabs.
  - *History:* MonthCalendar + meeting detail card + Feed.
  - *Goals:* OKR cards, dev plan, competencies bars.
  - *Files:* list/grid views, dropzone, type-coded tiles.
- **MeetingDrawer** — plan/start, autosave, complete, all field types, field-config
  read-only view, opens from feed/profile/topbar.
- **CalendarScreen** — month/week/list + sidebar widgets (upcoming, week load, legend).

### Deferred to later sub-projects (each its own spec → plan)
- Admin: Teams / Leads / Settings.
- AddEmployeeModal, AddTeamModal.
- FieldsLibraryScreen **and** the per-employee **Fields tab** override
  (`member_field_overrides` table is created but unused in v1).
- ExportScreen (.xlsx) and `.ics` calendar export.
- Grades / Competency / Performance-Review subsystem (entire `BT_GRADES` domain).

### Boundary note (explicit, to avoid a half-built feature)
The MeetingDrawer's "Поля встречи" tab **reads** a template's field defs to render the
fill form, so v1 includes template **read** + one seeded "Базовый" template. Template
**editing** and the FieldsLibrary screen are deferred. v1 exposes `GET /templates`,
`GET /templates/:id` only.

## Build order (vertical slices)

Each slice: schema → axum endpoint → generated types → screen, working end-to-end with
TDD (test → implement) before the next.

1. **Foundation** — docker-compose (PG+MinIO), Rust workspace skeleton, Next.js +
   tokens.css + Tailwind/shadcn wiring, OpenAPI codegen pipeline, seed migration from
   `data.js`. *(no feature; proves the stack end-to-end)*
2. **Auth** — `/auth/login` + JWT middleware → LoginScreen → authed `(app)` shell
   (Sidebar + Topbar).
3. **TeamList** — members + `/teams/:id/stats` → table, stat cards, mood bars, filter
   bar + FilterPopover.
4. **EmployeeProfile shell + History tab** — meetings list/detail → header,
   MonthCalendar, detail card, Feed.
5. **MeetingDrawer** — create/plan + autosave PATCH + complete + field-config read →
   full drawer, wired to the Zustand open-state from feed/profile/topbar.
6. **Goals tab** — goals CRUD → OKR cards, dev plan, competencies bars.
7. **Files tab + attachments** — MinIO presign upload/download → list/grid, dropzone,
   drawer attachments.
8. **CalendarScreen** — `/calendar` range query → month/week/list + sidebar widgets.

## Cross-cutting concerns

- **Testing.** Backend: sqlx integration tests against ephemeral Postgres (`sqlx::test`
  / per-test transaction rollback) covering repositories + handler contracts. Frontend:
  Vitest + Testing Library for composites (Avatar hue math, MoodTrendBars heights,
  FilterPopover logic, autosave hook) + Playwright smoke per slice for the end-to-end
  path. TDD per slice.
- **Error & empty states.** Single `AppError`→JSON on the backend; every potentially
  empty list gets the spec's `EmptyState` copy ("все встречи в графике", "не назначено",
  "ничего не запланировано"). Query errors → inline retry, not blank screens.
- **Auth/session.** JWT in an httpOnly cookie set by a thin Next route handler proxying
  `/auth/login` (keeps the token out of JS); middleware redirects unauthenticated
  `(app)` routes to `/login`. Role carried in the JWT; v1 exercises `lead` only.
- **Config/secrets.** `.env` for `DATABASE_URL`, `JWT_SECRET`, MinIO creds;
  `.env.example` committed. `docker-compose up` + `sqlx migrate run` + seed = working
  local stack.
- **Localization.** Russian product copy hardcoded per spec (no i18n framework in v1),
  preserved verbatim from README/prototype.

## YAGNI — deliberately NOT building in v1
TweaksPanel (dev-only in prototype), real AD/SAML, multi-workspace tenancy UI,
.xlsx/.ics generation, the grades subsystem.

## What to preserve when porting (from README §"Что важно сохранить")
1. Warm palette — backgrounds slightly beige (`#FAFAF7`), never pure white.
2. Amber accent = the "bee" brand color, used only for attention (CTA, active, today,
   accent metric), never decoration.
3. Tabular numbers everywhere there are counters/dates/percents.
4. Russian product microcopy and tone ("1-2-1", "Просрочены", "Требуют внимания").
5. Pill-based statuses — always dot + border, never plain text.
6. Meaningful empty states everywhere a list can be empty.
7. Smart fields — derive a value from context (member's lead = team lead) and show it
   read-only with an override, instead of prompting without reason.
