# BeeTeam — CalendarScreen slice — Design Spec

**Date:** 2026-06-07
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (build-order slice 8 — the final core slice)
**Predecessor slices:** Profile (4), MeetingDrawer (5), Goals CRUD (6), Files+MinIO (7) — all merged to `main`.
**Visual source of truth:** `design_handoff_beeteam/flows.jsx` (CalendarScreen `:11`; month grid `:94`, week `:209`, list `:181`, sidebar widgets `:118`).

## Context

Every prior slice is merged: TeamList, the read/write EmployeeProfile, the MeetingDrawer (conduct/autosave, mounted app-wide via a zustand store), Goals CRUD, and Files+MinIO. The Sidebar already lists a «Календарь» entry but it is `disabled`. Meetings live in the `meetings` table (per-member); the only team-level endpoints today are `/v1/teams/:id/members` and `/v1/teams/:id/stats`, both guarded by `require_team_access` (team lead only). There is **no** range/calendar endpoint yet (the parent spec names `GET /teams/:id/calendar?from&to`). The existing `MonthCalendar` component renders **one** meeting per day for a single member's history — the team calendar needs **multiple** person-chips per day, so the month view is a new component.

This slice (8) adds the `/calendar` screen: month / week / list views of the lead's whole team's meetings for a date range, plus sidebar widgets, backed by one new range endpoint. Clicking a meeting opens the existing MeetingDrawer.

## Locked decisions

| Area | Decision |
|------|----------|
| Views | **Month** (7×6 grid, multi-chips per day), **Week** (7 day-columns with meeting cards — **no hourly time-grid**, a deliberate simplification of the prototype), **List** (agenda grouped by date). All three in v1 |
| Endpoint | New `GET /v1/teams/:id/calendar?from&to` → `CalendarMeeting[]` (includes member name + hue for chips). Lead-only via `require_team_access` |
| Sidebar widgets | **Ближайшие встречи** (planned, 0–21 days) · **Загрузка по неделе** (7 bars by weekday) · **Легенда** (3 states). All three |
| Header actions | «+ Запланировать» and «.ics» are **stubs** in v1 (meeting creation already exists on profiles; `.ics`/`.xlsx` export is deferred per the parent spec) |
| Month view | A **new** `CalendarMonth` (multi-meeting cells), NOT a reuse of `MonthCalendar` |
| Meeting click | Opens the MeetingDrawer via `useDrawerStore.open(id)` (drawer already mounted in `(app)/layout`) |
| Status filter | Client-side filter (Все / Запланировано / Проведено / Пропущено) over the loaded range |
| Nav | Enable the Sidebar «Календарь» entry; make nav active-state route-aware (`usePathname`); «Моя команда» → `/`, «Календарь» → `/calendar` |

## Architecture

```
Browser  /calendar
  calendar/page.tsx (server: getSessionUser → teamId)
    └─ CalendarClient (view, anchor date, status filter)
         range = monthRange|weekRange|listRange(anchor)
         └─ useTeamCalendar(teamId, from, to) → CalendarMeeting[]
              └─ GET /api/v1/teams/:id/calendar?from&to (Next proxy → axum)
                   └─ require_auth → require_team_access → sqlx (team_members ⨝ meetings, date range)
         └─ status-filter → CalendarMonth | CalendarWeek | CalendarList
         └─ CalendarSidebar (Upcoming / WeekLoad / Legend)
         meeting click → useDrawerStore.open(id) → <MeetingDrawer/> (mounted in (app)/layout)
```

## Backend

### DTO (`bt-domain`)
```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CalendarMeeting {
    pub id: uuid::Uuid,
    pub member_id: uuid::Uuid,
    pub member_name: String,
    pub hue: i32,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,        // planned | done | miss
    pub duration_min: i32,
}
```

### Endpoint (`routes/teams.rs`, under `require_auth` + `require_team_access`)
```
GET /v1/teams/{id}/calendar?from=<ISO8601>&to=<ISO8601>
  → 200 [CalendarMeeting]   meetings of the team's members with date in [from, to), ORDER BY date
  → 400 if from/to are missing or unparseable
  → 403 if the caller isn't the team's lead
```
- Query struct: `CalendarRange { from: String, to: String }`; parse both with `chrono::DateTime::parse_from_rfc3339` → `AppError::BadRequest` on failure.
- SQL: `SELECT m.id, m.member_id, tm.name, tm.hue, m.date, m.state::text, m.duration_min FROM meetings m JOIN team_members tm ON tm.id = m.member_id WHERE tm.team_id = $1 AND m.date >= $2 AND m.date < $3 ORDER BY m.date`.
- `require_team_access(&auth, team_id, &pool)` first (reused). Runtime `sqlx::query_as` tuple → DTO map, consistent with `list_members`.

### Backend tests (sqlx, :5433)
- Happy path: seed a team + 2 members + meetings inside and outside a range → only in-range rows returned, with `member_name`/`hue` populated, ordered by date.
- 403: a different workspace's lead → Forbidden.
- 400: missing/garbage `from`/`to` → BadRequest.
- Range boundary: `to` is exclusive, `from` inclusive (a meeting exactly at `from` is included; at `to` excluded).

## Frontend

### Routing + nav
- `web/app/(app)/calendar/page.tsx` — server component: `getSessionUser()` → render `<CalendarClient teamId={user?.teamId ?? null} />` (mirrors `app/(app)/page.tsx`).
- `Sidebar.tsx` / `NavItem.tsx`: remove `disabled` from the calendar entry; give entries `href` (`/` and `/calendar`) and compute `active` from `usePathname()` instead of the hardcoded flag; render via `next/link`. (Keep the still-unbuilt entries — Грейды/Конструктор/Экспорт — disabled.)

### Query hook (`web/lib/query/calendar.ts`)
`useTeamCalendar(teamId: string | null, fromISO: string, toISO: string)` → `useQuery`, key `["team-calendar", teamId, fromISO, toISO]`, `enabled: teamId != null`, calls `api.GET("/v1/teams/{id}/calendar", { params: { path:{id}, query:{from,to} } })`. Type `CalendarMeeting = components["schemas"]["CalendarMeeting"]`.

### Utilities (`web/lib/calendar.ts`)
- RU constants: `RU_MONTHS` (short), `RU_MONTHS_FULL`, `RU_DOW` (Mon-first).
- `monthRange(anchor) -> {from,to}` (the 6-week window covering the month, Monday-based, so cells outside the month still load), `weekRange(anchor)`, `listRange(anchor)` (e.g. anchor−7d … anchor+28d).
- `sameDay(a,b)`, `shortName(full)` ("Анна Лебедева" → "Анна Л."), `STATE_META` (state → {label, dotClass}: planned→Запланирована/info, done→Проведена/ok, miss→Пропущена/miss).
- All ISO↔Date local-time math mirrors `MonthCalendar`'s approach.

### Components (`web/components/calendar/`)
- `CalendarClient.tsx` (client) — owns `view: "month"|"week"|"list"`, `anchor: Date`, `status: "all"|"planned"|"done"|"miss"`. Toolbar: a view `SegControl`, `‹ / Сегодня / ›` nav, a status `SegControl`, the stub «+ Запланировать»/«.ics» buttons, and a header «Календарь» + subtitle. Computes the range from view+anchor, loads `useTeamCalendar`, client-filters by status, renders the active view + `CalendarSidebar` (grid `1.7fr / minmax(280px,1fr)`). loading/error/empty states.
- `CalendarMonth.tsx` — 7×6 grid (Monday-based, today ring), each cell shows up to 3 chips (state dot + `shortName`) + «+N ещё»; chip click → `onSelect(id)`. New component (multi-meeting; `MonthCalendar` is single-meeting and stays as-is for the profile).
- `CalendarWeek.tsx` — 7 day-columns for the anchor's week; each lists its meetings as cards (Avatar + name + `HH:MM · NN мин`); card click → `onSelect`.
- `CalendarList.tsx` — meetings grouped by day (date header), rows: date chip + Avatar + name + time + state `Pill`; row click → `onSelect`. Empty → «Встреч нет».
- `CalendarSidebar.tsx` — `UpcomingMeetings` (planned within 21 days, «Ничего не запланировано» empty), `WeekLoadBars` (count per weekday → bar heights), `Legend` (3 state rows). Reuse `Avatar`/`Pill`/`SegControl`.

Meeting selection everywhere calls `useDrawerStore.open(id)`.

### States
loading → «Загрузка…» / skeleton; error → inline «Не удалось загрузить календарь» + Повторить; empty range → «Встреч нет»; no teamId (non-lead) → «Календарь доступен лидам команды».

### Frontend tests
- Vitest: `CalendarMonth` (cell layout, ≤3 chips + «+N ещё» overflow, chip click → onSelect); `lib/calendar` (`shortName`, `monthRange`/`weekRange` boundaries, `STATE_META`); `WeekLoadBars`/`Legend` render; `CalendarList` grouping + row click.
- Playwright e2e: login → Sidebar «Календарь» → `/calendar` → month view shows team meetings → click a meeting opens the drawer → switch Месяц/Неделя/Список renders each.

## Scope

### In scope
Backend: `CalendarMeeting` DTO + `GET /v1/teams/:id/calendar` (range, lead-only) + OpenAPI/types. Frontend: `useTeamCalendar`; `lib/calendar` utils; `CalendarClient` + `CalendarMonth`/`CalendarWeek`/`CalendarList` + `CalendarSidebar`; `calendar/page.tsx`; Sidebar enablement + route-aware active; loading/error/empty states; meeting→drawer wiring.

### Stubs / deferred
«+ Запланировать» (creation exists on profiles), «.ics» export (deferred per parent spec), the week hourly time-grid (week is day-columns), the «Пятница перегружена…» smart hint (show plain load bars). Грейды / Конструктор полей / Экспорт sidebar entries stay disabled.

### Boundary note
The calendar is **read + navigate**: it lists team meetings and opens the drawer; it does not create/edit meetings itself (the drawer does). It reads only meetings for the caller's own team (lead-scoped). No schema changes.

## Build order (vertical sub-steps)
1. `CalendarMeeting` DTO + `GET /v1/teams/:id/calendar` + tests.
2. OpenAPI registration + `pnpm gen:api`.
3. `web/lib/calendar.ts` utils + Vitest.
4. `useTeamCalendar` hook.
5. `CalendarMonth` / `CalendarWeek` / `CalendarList` + Vitest.
6. `CalendarSidebar` (Upcoming / WeekLoad / Legend) + Vitest.
7. `CalendarClient` + `calendar/page.tsx`.
8. Sidebar: enable «Календарь» + route-aware active.
9. Playwright e2e, then merge.

## What to preserve when porting
Warm beige palette; amber on the `brand` token (NOT `accent`); tabular-nums on dates/counts/times; Russian microcopy verbatim («Календарь», «Месяц», «Неделя», «Список», «Сегодня», «Запланировано/Проведено/Пропущено» filters and «Запланирована/Проведена/Пропущена» states, «Ближайшие встречи», «Загрузка по неделе», «Легенда», «Ничего не запланировано», «Встреч нет», «+ Запланировать»); Monday-first weeks; the `[data-theme]`/`[data-density]` token system; meaningful empty/error states. Reuse `Avatar`, `Pill`, `SegControl`, `useDrawerStore`, and the slice-3 team-scoping (`require_team_access`) + query/invalidation patterns.
