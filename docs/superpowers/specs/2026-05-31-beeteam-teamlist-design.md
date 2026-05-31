# BeeTeam — TeamList slice — Design Spec

**Date:** 2026-05-31
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (Core 1-2-1, build-order slice 3)
**Visual source of truth:** `design_handoff_beeteam/screens.jsx` (TeamList `:180`) + `flows.jsx` (FilterPopover `:804`).

## Context

Slices 1 (Foundation) and 2 (Auth) are merged to `main`: monorepo, Postgres schema +
demo seed, axum auth (`/v1/auth/login`, `/v1/auth/me`, `require_auth`), Next.js with the
httpOnly-cookie session proxy, the authed `(app)` chrome (Sidebar + Topbar). The `(app)`
home is currently a placeholder.

This slice (3) replaces that placeholder with the real **TeamList** — the lead's main
screen: stat cards, a filter bar (search + segment tabs + FilterPopover), and a
6-column team table with mood trends and status pills. It also completes the
Auth-slice follow-up of switching browser data fetching fully onto the `/api/v1/*`
proxy. Everything after this (EmployeeProfile, MeetingDrawer, Goals, Files, Calendar)
follows as later slices.

## Locked decisions

| Area | Decision |
|------|----------|
| Meeting dates (last/next) | Computed from the `meetings` table (single source of truth), NOT denormalized onto `team_members`. `last` = latest `done`; `next` = earliest future `planned` |
| Demo data | Seed dates become **relative to now()** at seed time (so the demo always looks fresh); all 8 members get a `last` + `next` meeting (currently only Anna has history) |
| Reference "now" | Real `now()` for this-week / overdue / ago calculations |
| "Notes this quarter" metric | Count of `done` meetings team-wide since the start of the current quarter |
| Filtering | **Server-side**: one `GET /teams/:id/members` endpoint with optional query params. (Parent spec suggested client-side; this slice intentionally does it server-side — cheap to revert for 8 members if it proves overkill) |
| Team access control | Endpoints under `/v1/teams/:id/*` enforce ownership: a lead may only read their own team (else 403). New `AppError::Forbidden` |
| teamId discovery | `team_id` added to `/v1/auth/me` (the team where the user is `lead_id`); the server `(app)` layout passes it to the page |
| Row click | Navigates to `/profile/:id` (placeholder page this slice; real profile is the next slice) |

## Architecture

```
Browser (TeamList client component)
  └─ TanStack Query hooks (lib/query) → openapi-fetch client (baseUrl "/api")
       └─ /api/v1/teams/:id/{members,stats}  (Next catch-all proxy, cookie→Bearer)
            └─ axum require_auth → require_team_access(auth, teamId) → handler
                 └─ sqlx: team_members + computed last/next from meetings
```

This slice flips the `openapi-fetch` client `baseUrl` from `NEXT_PUBLIC_API_URL`
(direct browser→axum) to `/api` (browser→Next proxy→axum), closing the Auth-slice
follow-up. `NEXT_PUBLIC_API_URL` is removed.

## Backend

### Seed changes (`bt-db/src/seed.rs`)
- Re-date seed meetings **relative to seed-time `now()`**: Anna's history shifts so it
  reads as recent (last ≈ now−Nd, next ≈ now+Md); the other 7 members each get one
  `done` meeting (their `last`) and one `planned` meeting (their `next`), spread so the
  this-week / overdue stats are non-empty and match the prototype's spirit (some ok,
  some warn, one overdue/miss — aligned to each member's existing `status` column).
- This requires re-seeding the dev DB (truncate + restart) — see
  `reseed-dev-db-after-seed-changes` memory; idempotent seed won't overwrite existing rows.

### Access control
- New `AppError::Forbidden` → HTTP 403.
- `require_team_access(auth: &AuthUser, team_id: Uuid, pool) -> AppResult<()>`: passes if
  `teams.lead_id == auth.id`; else `Err(AppError::Forbidden)`. v1 exercises `lead` only;
  the helper is the seam where `hr_admin` / skip-level rules land later. Both teams
  handlers call it first.

### `/v1/auth/me` extension
- `UserDto` (or a dedicated `MeResponse`) gains `team_id: Option<Uuid>` — the team where
  this user is `lead_id`. Used by the frontend to know which team to load.

### Endpoints (under `require_auth`, reachable via the `/api/v1/*` proxy)
```
GET /v1/teams/:id/members?q=&role=&tenure=&mood=&since=&tags=
  → 200 [ MemberRow ]   (after require_team_access)
  → 403 if the caller is not the team's lead
  MemberRow {
    id, name, role, email, joined, tz, hue,
    tags: string[], status: "ok"|"warn"|"miss", mood_trend: int[],
    last_meet: DateTime|null,   -- max(date) WHERE state='done'
    next_meet: DateTime|null,   -- min(date) WHERE state='planned' AND date >= now()
  }
  Server-side filters (all optional, AND-combined):
    q       -- ILIKE over name + role
    role    -- exact role match
    tenure  -- all | new (<1y) | mid (1–3y) | sen (3+y), derived from `joined`
    mood    -- all | up | flat | down, from mood_trend first-half vs last-half
    since   -- all | lt1w | lt2w | gt4w, by age of last_meet
    tags    -- comma-separated; row matches if it has ANY of them (array overlap)

GET /v1/teams/:id/stats
  → 200 { this_week, overdue, avg_mood, avg_mood_delta, notes_quarter }   (after require_team_access)
  → 403 if not the team's lead
    this_week     = members whose next_meet is within 7 days
    overdue       = members whose last_meet is older than 21 days (or null)
    avg_mood      = mean of each member's latest mood_trend value (1 decimal)
    avg_mood_delta= avg(last value) − avg(first value) across members (1 decimal, signed)
    notes_quarter = COUNT(meetings WHERE state='done' AND date >= start-of-current-quarter)
```
`last_meet`/`next_meet` are computed via correlated subqueries / LATERAL joins over
`meetings`; `status` comes from the `team_members` column. Runtime sqlx queries
(`query`/`query_as`), consistent with Foundation.

### Backend tests (sqlx, against the :5433 test DB via `api/scripts/test.sh`)
- `members` with no filters → all 8.
- Each filter individually narrows the set correctly: `q`, `role`, `tenure`, `mood`,
  `since`, `tags`.
- `last_meet`/`next_meet` computed correctly for a member with known seeded meetings.
- `stats`: this_week / overdue / avg_mood / notes_quarter against a known fixture.
- Access: team lead → 200; a different user → 403; (no token → 401 already covered).
- `/auth/me` returns the lead's `team_id`.

## Frontend

### Proxy switchover
- `web/lib/api/client.ts`: change `baseUrl` to `"/api"` (was `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"`). All browser data calls now go through the Next proxy with the cookie→Bearer mapping.
- Remove `NEXT_PUBLIC_API_URL` from `.env.example` / `.env` (orphaned).

### Query hooks (`web/lib/query/`)
- `useTeamMembers(teamId, filters)` and `useTeamStats(teamId)` — typed TanStack Query
  hooks over the `openapi-fetch` client. Members query key includes the serialized
  filters so changing a filter refetches.

### TeamList (`web/app/(app)/page.tsx` — client component, replaces the placeholder)
- **Page header**: «Моя команда» + sub («{N} человек · Платформенный отдел · Q2 2026»)
  + actions Экспорт в Excel / Сотрудник / Новая 1-2-1 (**stubs**).
- **Stats row**: 4 `StatCard`s from `useTeamStats` — На этой неделе / Просрочены /
  Среднее настроение (`/10`) / Заметок за квартал. "Просрочены" value is red when > 0.
- **Filter bar**: debounced search input + segment tabs (Все / На этой неделе /
  Просрочены / Требуют внимания) + «Фильтр» button with active-count badge →
  `FilterPopover`. Filter state (q, tab, role, tenure, mood, since, tags) maps to the
  query params of `useTeamMembers` (server-side filtering).
- **Team table** (6 cols): Сотрудник (Avatar + name + role + tag pills) / Последняя
  1-2-1 (date + ago) / Следующая встреча (date + ago, "не назначено" when null) /
  Настроение+тренд (MoodTrendBars + latest value) / Статус pill (В графике / Внимание /
  Просрочена) / kebab (stub). Row hover highlight; row click → `/profile/:id`.
- **Footer plate**: dashed «Добавить сотрудника…» (stub).
- **States**: loading (skeleton / "…"), error (inline retry), empty ("Никого не нашлось"
  when filters exclude everyone).

### FilterPopover (from `flows.jsx:804`)
- Role select, Стаж segment (Все / <1 года / 1–3 / 3+), Тренд настроения segment
  (Все / ↑ / → / ↓), Tags chips, Последняя 1-2-1 segment (Все / <1 нед / <2 нед / >4 нед),
  Сбросить / Применить, active-count badge on the trigger.

### New composites (`web/components/`) — small, single-purpose, unit-testable
`StatCard` (label + value + sub + optional accent dot, color override) · `MoodTrendBars`
(7 bars, height 4–18px scaled by value, opacity rising left→right, color by value:
≥7 brand, ≥5 warn, else miss) · `Pill` (ok/warn/miss/info/accent with dot + border) ·
`SegControl` (segmented tabs, active state) · `FilterPopover` · `TeamTable` / `TeamRow`.

### Placeholder profile (`web/app/(app)/profile/[id]/page.tsx`)
- Minimal card ("Профиль появится в следующем срезе") so row navigation resolves.

### Frontend tests
- Vitest: `StatCard` (value + red override when overdue>0); `MoodTrendBars` (bar heights
  + color thresholds); `FilterPopover` (active-count, reset clears); `SegControl` (active).
- Playwright e2e: login → TeamList visible with 4 stat cards + 8 rows; search "Анна" →
  1 row; tab "Просрочены" filters the set; row click → `/profile/:id`. Negative: a direct
  `/api/v1/teams/<other-id>/members` request → 403.

## Scope

### In scope
Backend: `GET /v1/teams/:id/members` (server-side filters), `GET /v1/teams/:id/stats`,
both behind `require_auth` + `require_team_access` (403 on others' teams); `team_id` in
`/auth/me`; `AppError::Forbidden`; seed re-dating + last/next for all 8.
Frontend: real TeamList at `(app)/page.tsx`; client `baseUrl` → `/api` (drop
`NEXT_PUBLIC_API_URL`); `lib/query` hooks; composites
StatCard/MoodTrendBars/Pill/SegControl/FilterPopover/TeamTable; `/profile/[id]` placeholder.

### Stubs (rendered to design, no behavior)
Экспорт в Excel, Сотрудник, Новая 1-2-1, row kebab menu, footer "Добавить сотрудника".
`/profile/[id]` is a placeholder card.

### Deferred (later slices)
Real EmployeeProfile (History / Goals / Files), MeetingDrawer, CalendarScreen. Admin /
FieldsLibrary / Export / Grades remain separate sub-projects.

### Boundary note
This slice delivers a working main screen against real data with server-side filtering.
Profile / Drawer / Calendar are NOT here — rows only navigate to a placeholder.

## Build order (vertical sub-steps)
1. Seed: re-date relative to now() + give all 8 a `last`+`next` meeting. Seed test.
2. Backend: `AppError::Forbidden` + `require_team_access`; `team_id` in `/auth/me`;
   `GET /teams/:id/members` (+ filters); `GET /teams/:id/stats`. OpenAPI + tests.
3. `pnpm gen:api` — members/stats types + updated me.
4. Frontend: client `baseUrl` → `/api` (drop `NEXT_PUBLIC_API_URL`); `lib/query` hooks.
5. Composites (StatCard/MoodTrendBars/Pill/SegControl/FilterPopover/TeamTable) + Vitest.
6. `(app)/page.tsx` TeamList + `/profile/[id]` placeholder.
7. Playwright e2e, then merge.

## What to preserve when porting (from parent spec)
Warm beige palette; amber brand on the `brand` token (NOT `accent` — shadcn reserves it);
tabular-nums on counts/dates/percents; Russian microcopy verbatim («Моя команда»,
«На этой неделе», «Просрочены», «Требуют внимания», «В графике», «Внимание»,
«не назначено», «все встречи в графике»); pill-based statuses (dot + border); meaningful
empty states; the `[data-theme]`/`[data-density]` token system.
