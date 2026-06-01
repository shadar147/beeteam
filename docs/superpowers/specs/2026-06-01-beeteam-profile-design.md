# BeeTeam — EmployeeProfile slice — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (Core 1-2-1, build-order slice 4)
**Visual source of truth:** `design_handoff_beeteam/screens.jsx` (EmployeeProfile `:365`, NoteBlock `:609`) + `flows.jsx` (GoalsTab `:436`, FilesTab `:657`).

## Context

Slices 1–3 (Foundation, Auth, TeamList) are merged to `main`: monorepo, Postgres
schema + demo seed, axum auth + the `/api` cookie proxy, the `(app)` chrome, and the
TeamList screen whose rows navigate to `/profile/:id` (currently a placeholder).

This slice (4) replaces that placeholder with the real **EmployeeProfile** — a
read-only employee card: a profile header plus three tabs (История 1-2-1 / Цели и
развитие / Файлы). It is read-only: it shows data and navigates, but does not conduct
or edit meetings (that's the MeetingDrawer slice) and does not upload files (that's the
Files slice). MeetingDrawer, real MinIO upload/download, and CalendarScreen follow as
later slices.

## Locked decisions

| Area | Decision |
|------|----------|
| Goals tab scope | OKR cards from the existing `goals` table; **new** `development_items` + `competencies` tables (parent spec names "OKR cards, dev plan, competencies bars"). Career-track + Mentorship sections from the prototype are **deferred** (grades/org-structure territory) |
| Files tab | **Read-only from seed**: list/grid views, type filter, stats card — rendered from seeded `files` metadata. Dropzone / download / .zip are stubs. Real MinIO upload+download is a later slice |
| Mutations | Profile is **read-only**. All action buttons (Написать, Экспорт, Начать 1-2-1, Редактировать/Провести/Перенести/Отменить, Добавить OKR/dev, download, .zip, dropzone, kebab) are stubs |
| Access control | All 5 profile endpoints enforce ownership via `require_member_access`: the member must belong to a team led by the caller, else 403 |
| Routing | `app/(app)/profile/[id]/` — server layout fetches member detail (header + access); tabs are client components selected by `?tab=history\|goals\|files` (history default) |

## Architecture

```
Browser (profile client tabs)
  └─ TanStack Query hooks (lib/query) → openapi-fetch client (baseUrl "/api")
       └─ /api/v1/members/:id{,/meetings,/goals,/files}, /api/v1/meetings/:id  (Next proxy, cookie→Bearer)
            └─ axum require_auth → require_member_access(auth, member_id) → handler
                 └─ sqlx: team_members + meetings + goals + development_items + competencies + files
```

## Backend

### Migration `0003_profile.sql`
Two new tables for the Goals tab (OKRs already live in `goals`):
```sql
CREATE TABLE development_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL,                 -- Курс / Доклад / Книга / Сертификат / Менторство (free text)
  status       TEXT NOT NULL DEFAULT 'planned', -- planned | in_progress | done
  note         TEXT,                          -- e.g. "Прогресс 60%", "Глава 4 / 12"
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE competencies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  score        INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  ord          INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_dev_items_member ON development_items(member_id);
CREATE INDEX idx_competencies_member ON competencies(member_id);
```

### Seed additions (`bt-db/src/seed.rs`)
- Anna: 3 OKRs, 5 development_items, 5 competencies, 7 files — ported from the prototype
  (`flows.jsx` GoalsTab/FilesTab). OKR/dev/file dates use the relative-to-now() approach
  established in the TeamList slice.
- The other 7 members: 1–2 OKRs + a base competency set (5 rows) + a couple of files each,
  so the tabs aren't empty.
- `files.storage_key` is set to a synthetic key (no real object yet; download is a stub).
- Re-seeding the dev DB is required after this change (idempotent seed won't overwrite) —
  see `reseed-dev-db-after-seed-changes` memory.

### Access control
`require_member_access(auth: &AuthUser, member_id: Uuid, pool) -> AppResult<()>`: passes
if the member's `team_id` belongs to a team where `lead_id = auth.id`; else
`AppError::Forbidden`. The single JOIN is `team_members tm JOIN teams t ON t.id =
tm.team_id WHERE tm.id = $1 AND t.lead_id = $2`. Applied to all 5 endpoints. For
`/meetings/:id` the member is resolved from the meeting first, then checked.

### Endpoints (under `require_auth` + `require_member_access`, via the `/api/v1/*` proxy)
```
GET /v1/members/:id
  → 200 MemberDetail { id, name, role, email, joined, tz, hue, status, tags: string[],
        mood_trend: int[], last_meet, next_meet, meetings_total: i64 }
  → 403 if the member isn't on the caller's team
GET /v1/members/:id/meetings
  → 200 [ MeetingListItem { id, date, state, mood, mood_score, preview } ]
        preview = first non-empty of blockers/goals (done), else a state-derived hint
        ordered by date desc
GET /v1/meetings/:id
  → 200 MeetingDetail { id, member_id, date, state, duration_min, mood, mood_score,
        blockers, goals, feedback_to, feedback_from, development: string[], relationships }
  → 403 if the meeting's member isn't on the caller's team
GET /v1/members/:id/goals
  → 200 { okrs: [Goal { id, quarter, title, key_result, progress, status, due }],
          development: [DevItem { id, title, kind, status, note }],
          competencies: [Competency { id, label, score }] }
GET /v1/members/:id/files
  → 200 [ FileMeta { id, name, mime, kind, size_bytes, meeting_label, uploaded_by, created_at } ]
        meeting_label = "1-2-1 от <date>" when meeting_id is set, else null
```
Runtime sqlx queries (`query`/`query_as`), consistent with prior slices.

### Backend tests (sqlx, against the :5433 test DB via `api/scripts/test.sh`)
- Each of the 5 endpoints: happy-path shape against a seeded member.
- `require_member_access`: the team's lead → 200; a different lead → 403, on every endpoint
  (incl. `/meetings/:id` resolving member-from-meeting).
- `goals` returns all three sections (okrs / development / competencies).
- `meeting detail` returns all note fields (blockers/goals/feedback_to/feedback_from/
  development/relationships) for a done meeting.
- `files` includes `meeting_label` for a file linked to a meeting.

## Frontend

### Routing (`web/app/(app)/profile/[id]/`)
```
layout.tsx            server component: fetch /members/:id (header + 403 handling);
                      render breadcrumb + ProfileHeader + tab nav + {children}
page.tsx              the History tab (default), reads ?tab to switch
HistoryTab.tsx        client: MonthCalendar + MeetingDetailCard + Feed
GoalsTab.tsx          client: OKR cards + dev plan + competencies
FilesTab.tsx          client: filter bar + stats + list/grid
```
Tabs are selected via a `?tab=history|goals|files` query param on the seg-control;
`history` is the default. The header (server component) reads the cookie session →
`require_member_access` is enforced server-side; the proxy carries the Bearer for the
client query hooks.

### Profile header (`screens.jsx:401`)
Breadcrumb «← Моя команда / {name}» (link to `/`); Avatar XL (84×84, radius 24); name;
meta (роль · с {joined} · email · TZ); status pills (status-graphic / «N встреч за год»
from `meetings_total` / «Настроение M/10» from the latest mood_trend / tags); actions
Написать / Экспорт / Начать 1-2-1 (**stubs**). NO grade pill (grades deferred). Seg
tabs: История 1-2-1 / Цели и развитие / Файлы (no Грейд / Поля встреч tabs).

### Tab: История (grid 1.45fr / 1fr, `screens.jsx:451`)
- **Left:** `MonthCalendar` (7×6 grid, RU month nav + «Сегодня», today accent ring, days
  with meetings show a colored chip ✓ done / ○ planned / ✕ miss; click a meeting-day to
  select). Below it, `MeetingDetailCard` for the selected meeting (detail fetched via
  `/meetings/:id`): for `done` — status pill, date + duration, a Настроение/Отношения
  grid, NoteBlocks (Блокеры / Цели / Фидбек к / Фидбек от / Развитие list); for
  `planned` — a CTA card «Провести сейчас / Перенести / Отменить» (**stubs**).
- **Right:** `Feed` — all meetings (44×44 date chip + state-derived title + 2-line
  preview), active item highlighted, click selects.

### Tab: Цели и развитие (grid 1.45fr / 1fr, `flows.jsx:436`)
- **Left:** «Цели на {quarter}» card — OKR list (progress bar, key result, due, status
  pill В работе/Под риском/Готово); «План развития» card — development_items with
  status-colored dots (in_progress = brand, planned = outline, done = green).
- **Right:** «Компетенции» card — 0..10 progress bars. (Career track / Mentorship
  sections from the prototype are deferred with grades — not rendered.)

### Tab: Файлы (read-only, `flows.jsx:657`)
- Filter bar: type segment (Все·N / Документы / Изображения / Видео / PDF / Таблицы) +
  view segment (Список / Плитки) + «Скачать .zip» (**stub**).
- Stats card: Всего N файлов / Объём (Σ size_bytes, human-formatted) / Последний (date).
- List view: rows with a type-colored glyph (DOC/IMG/PDF/MP4/XLS), name, meeting link,
  author, size, actions (download **stub**). Grid view: square type-colored tiles.
  Footer drop-zone — **stub**.

### New composites (`web/components/`) — small, single-purpose, unit-testable
`MonthCalendar` · `MeetingDetailCard` · `Feed` / `FeedItem` · `NoteBlock` · `OkrCard` ·
`DevItem` · `CompetencyBar` · `FileRow` / `FileTile` · `FileGlyph`. Reuse existing
`Avatar` / `Pill` / `SegControl` / `MoodTrendBars`.

### States
loading (skeletons / "…"), error (inline retry; a 403 from a foreign member shows «Нет
доступа к этому профилю»), empty (no meetings / no goals / no files → meaningful copy
from the parent spec, e.g. «Встреч пока нет», «Целей пока нет», «Файлов пока нет»).

### Frontend tests
- Vitest: MonthCalendar (month layout, today marker, meeting-days, selection callback);
  MeetingDetailCard (done vs planned branches; NoteBlock hides empty); Feed/FeedItem
  (state-derived title, active state); OkrCard (bar color/label by status); CompetencyBar
  (width by score); FileGlyph/FileRow (glyph by kind, human size).
- Playwright e2e: login → TeamList → click Anna → profile (header "Анна Лебедева", tabs);
  History: calendar visible, click a meeting → detail with note blocks, feed shows N
  items; switch to Цели → OKR cards; switch to Файлы → list with N files. Negative: a
  direct `/api/v1/members/<foreign-id>` request → 403.

## Scope

### In scope
Backend: migration `0003_profile` (development_items + competencies); seed
(OKR/dev/competencies/files for Anna + base for others); `require_member_access`; 5 GET
endpoints (member detail / meetings list / meeting detail / goals / files); OpenAPI + types.
Frontend: `profile/[id]` (header + History/Goals/Files tabs); MonthCalendar,
MeetingDetailCard, Feed, NoteBlock, OkrCard, DevItem, CompetencyBar, FileRow/FileTile/
FileGlyph; query hooks; loading/error/empty states.

### Stubs (rendered to design, no behavior)
Написать, Экспорт, Начать 1-2-1, Редактировать meeting, Провести/Перенести/Отменить
(planned), Добавить OKR/dev, file download, .zip, footer drop-zone, kebab menus.

### Deferred (later slices)
MeetingDrawer (conduct/edit/autosave — slice 5); real MinIO file upload + download
(slice 7); CalendarScreen (slice 8). Grade tab, Поля встреч tab, Career-track and
Mentorship sections — grades / Fields-override territory, separate sub-projects.

### Boundary note
The profile is **read-only**: it displays data and navigates, but does not create or edit
meetings (MeetingDrawer) and does not upload files (Files slice). Action buttons and rows
lead to stubs.

## Build order (vertical sub-steps)
1. Migration `0003_profile` + seed (dev_items / competencies / files for Anna + base for
   others). Seed test.
2. Backend: `require_member_access`; `GET /members/:id` + `/members/:id/meetings` +
   `GET /meetings/:id`. Tests.
3. Backend: `GET /members/:id/goals` (3 sections) + `GET /members/:id/files`. OpenAPI + tests.
4. `pnpm gen:api` — profile types.
5. Query hooks + History composites (MonthCalendar / MeetingDetailCard / Feed / NoteBlock)
   + Vitest.
6. Goals composites (OkrCard / DevItem / CompetencyBar) + Files composites (FileRow /
   FileTile / FileGlyph) + Vitest.
7. `profile/[id]` page: header + 3 tabs, wire hooks, loading/error/empty states.
8. Playwright e2e, then merge.

## What to preserve when porting (from parent spec)
Warm beige palette; amber brand on the `brand` token (NOT `accent` — shadcn reserves it);
tabular-nums on counts/dates/percents/scores; Russian microcopy verbatim («История
1-2-1», «Цели и развитие», «Файлы», «Завершена», «Запланирована», «Провести сейчас»,
«В работе», «Под риском», «Готово», «Компетенции»); pill-based statuses (dot + border);
meaningful empty states; the `[data-theme]`/`[data-density]` token system. Profile
header amber/grade pill is omitted (grades deferred); use `brand`/`info`/`ok` pills.
