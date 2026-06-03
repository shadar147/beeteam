# BeeTeam — MeetingDrawer slice — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (build-order slice 5)
**Predecessor slice:** `docs/superpowers/specs/2026-06-01-beeteam-profile-design.md` (slice 4, EmployeeProfile — read-only; merged to `main`)
**Visual source of truth:** `design_handoff_beeteam/screens.jsx` (conduct/plan actions `:432`, `:556`; meeting detail `:520`) + `flows.jsx` (base field set `:51`).

## Context

Slices 1–4 are merged to `main`: monorepo, Postgres schema + seed, axum auth + `/api`
cookie proxy, the `(app)` chrome, TeamList, and the read-only EmployeeProfile (header +
History/Goals/Files tabs). The profile renders meetings but every meeting **action** is a
stub: «Начать 1-2-1» (header), «Провести сейчас / Перенести / Отменить» (planned card),
«Редактировать» (done card), and feed/topbar entry points.

This slice (5) introduces the **MeetingDrawer** — a full-height Sheet that creates, plans,
conducts (with autosave), completes, reschedules, and cancels 1-2-1 meetings — and the
**first mutating endpoints** in the API (everything so far is GET). It wires up all the
profile/feed/header stubs above through a shared Zustand open-state store.

## Locked decisions

| Area | Decision |
|------|----------|
| Action scope | Full lifecycle in v1: **create/start**, **conduct + autosave**, **complete**, **reschedule** (date), **cancel** (delete). Closes every meeting-action stub from slice 4 |
| Fields model | The seeded **«Базовый»** template drives the form **structure** (order, labels, types, placeholders); the backend PATCH accepts a **typed** DTO and writes the existing typed `meetings` columns via a fixed field→column mapping. The generic `fields` JSONB stays unused in v1; the profile's read path is unchanged |
| Template alignment | The seed «Базовый» template is realigned **1:1** to the columns — 7 field_defs (see Backend). «Развитие» is a longtext entered one-item-per-line → stored as `development TEXT[]` (split on newlines) |
| Cancel semantics | «Отменить» = **DELETE** the meeting (planned only). `done` meetings cannot be deleted (409). `miss` stays reserved for genuinely missed meetings, not user-cancelled ones |
| Complete | Separate endpoint **`POST /meetings/:id/complete`** (not a PATCH state) — transitions `planned → done`; re-completing a `done` meeting is rejected |
| Start-now | «Начать 1-2-1» creates a `planned` meeting at **now** and immediately opens the drawer in conduct mode (no empty date picker first) |
| Autosave | **Local form state** (`useReducer`) is the source of truth while the drawer is open; edits trigger a **debounced (~800ms) `PATCH /meetings/:id`**; the `●` indicator binds to the mutation state; complete/close flush the pending patch |
| Open-state | **Zustand** store (`{ openMeetingId, mode }`), drawer mounted once in `(app)/layout`, opened from header/planned-card/feed/topbar (per parent spec). New dependency |
| FieldControl types | `FieldControl` renders all `field_type` variants (text/longtext/scale/mood/checklist/select/date); only **mood + longtext** appear in the v1 «Базовый» form. The others are kept "for the future"; **`file` renders a disabled placeholder** (real MinIO upload is slice 7) |

## Architecture

```
Browser
  ProfileHeader / MeetingDetailCard / Feed / Topbar
    └─ Zustand drawer store { openMeetingId, mode }  → open(id)/close()
         └─ <MeetingDrawer/> (mounted in (app)/layout)
              ├─ useMeeting(id) + useTemplate(templateId)  (TanStack Query, /api proxy)
              ├─ useReducer(form)  ← seeded from useMeeting on open (source of truth)
              └─ useMeetingAutosave(id): debounced useMutation PATCH + flush
                   └─ /api/v1/meetings{,/:id,/:id/complete}, /api/v1/templates/:id
                        └─ axum require_auth → require_member_access → handler (validator)
                             └─ sqlx: meetings (typed columns) + field_templates/field_defs
```

## Backend

### Seed realignment (`bt-db/src/seed.rs`)
The «Базовый» template's `field_defs` are realigned 1:1 to the `meetings` typed columns —
**7** definitions (replacing the current 6):

| ord | type | title | placeholder | → column |
|----|------|-------|-------------|----------|
| 0 | mood | Настроение | — | `mood` (emoji) + `mood_score` (1–10) |
| 1 | longtext | Блокеры | Что мешает в работе? | `blockers` |
| 2 | longtext | Цели | Над чем работаем? | `goals` |
| 3 | longtext | Фидбек сотруднику | Что хочется отметить и улучшить | `feedback_to` |
| 4 | longtext | Фидбек от сотрудника | Что говорит сотрудник | `feedback_from` |
| 5 | longtext | Развитие | По пункту на строку | `development` (TEXT[], split on `\n`) |
| 6 | longtext | Отношения | Как в команде? | `relationships` |

No schema migration is required (tables unchanged); this is a `seed.rs` edit. The dev DB is
re-seeded after the change (`TRUNCATE workspaces CASCADE` + restart API — see the
`reseed-dev-db-after-seed-changes` memory; dev DB runs on host port 5442).

### DTOs (`bt-domain`)
```rust
// requests
CreateMeetingRequest { member_id: Uuid, date: Option<DateTime<Utc>> }   // date defaults to now()
UpdateMeetingRequest {                                                   // PATCH semantics: update provided fields
  date: Option<DateTime<Utc>>, duration_min: Option<i32>,
  mood: Option<String>, mood_score: Option<i32>,
  blockers: Option<String>, goals: Option<String>,
  feedback_to: Option<String>, feedback_from: Option<String>,
  development: Option<Vec<String>>, relationships: Option<String>,
}
// responses
TemplateDetail { id: Uuid, name: String, fields: Vec<FieldDef> }
FieldDef { id: Uuid, ord: i32, kind: String /* field_type::text */, title: String,
           required: bool, placeholder: Option<String>, hint: Option<String>, options: Vec<String> }
// create/update/complete all return the existing MeetingDetail
```
Validation via the `validator` crate: `mood_score` 1..=10, `duration_min` > 0. `complete`
requires the meeting be `planned`; `delete` requires `planned`.

> Field naming note: `FieldDef.kind` maps the SQL column `field_defs.type` (avoids the Rust
> keyword `type`); serialize as `kind` in the API.

### Mapping (server-side)
`UpdateMeetingRequest` field → column is the identity mapping for the named scalar columns;
`development: Vec<String>` is bound directly to the `development TEXT[]` column. The client
sends `development` as an array (it splits the «Развитие» textarea on newlines before
sending). The template's titles/ord are **only** used by the client to render labels/order.

### Endpoints (under `require_auth` + ownership)
```
POST   /v1/meetings
  body CreateMeetingRequest → 201 MeetingDetail
  member_id from body → require_member_access; new row state='planned', date = body.date ?? now()
PATCH  /v1/meetings/:id
  body UpdateMeetingRequest → 200 MeetingDetail
  member resolved from the meeting → require_member_access; updates provided columns + updated_at
POST   /v1/meetings/:id/complete
  → 200 MeetingDetail ; planned→done ; 409 if already done
DELETE /v1/meetings/:id
  → 204 ; planned only ; 409 if done
GET    /v1/templates/:id
  → 200 TemplateDetail (field_defs ordered by ord) ; for rendering the form
```
`require_member_access` (from slice 4) is reused; for `PATCH`/`complete`/`DELETE` the member
is resolved from the meeting first (as `GET /meetings/:id` already does). Runtime sqlx
queries, consistent with prior slices.

### Backend tests (sqlx, :5433 test DB)
- Seed: «Базовый» now has 7 field_defs in order (mood + 6 longtext).
- `POST` creates a `planned` meeting at now; ownership 403 for a foreign lead.
- `PATCH` writes the typed columns (incl. `development` array from a multi-item payload);
  partial PATCH leaves unspecified columns untouched; 403 foreign.
- `complete`: planned→done; second complete → 409; 403 foreign.
- `DELETE`: planned→204 then 404 on re-GET; deleting a `done` meeting → 409; 403 foreign.
- `GET /templates/:id`: returns 7 fields ordered, `kind` strings correct.

## Frontend

### Store (`web/lib/store/drawer.ts`)
New `zustand` dependency. `useDrawerStore` holds `{ openMeetingId: string|null, mode: 'conduct', open(id), close() }`. `<MeetingDrawer/>` is mounted once in `web/app/(app)/layout.tsx`.

### Query/mutation hooks (`web/lib/query/meetings.ts`)
- `useTemplate(id)` — GET `/v1/templates/:id`.
- `useCreateMeeting()` — POST; on success `open(newId)` + invalidate member-meetings/member.
- `useMeetingAutosave(id)` — debounced (~800ms) `useMutation` PATCH; exposes `patch(partial)`,
  `flush()`, and status (`idle|saving|saved|error`). On settle invalidates `["meeting",id]`,
  `["member-meetings",memberId]`, `["member",memberId]`.
- `useCompleteMeeting()` / `useDeleteMeeting()` — POST complete / DELETE; invalidate the same keys.

### Components (`web/components/`)
- `MeetingDrawer.tsx` — Sheet 720px × 92vw, full-height, scrim + blur. On open: `useMeeting(id)`
  + `useTemplate(templateId)`, seed a `useReducer` form (source of truth). Header: state pill,
  date · duration, `●` autosave indicator. Body: fields rendered from the template via
  `FieldControl`. Footer: «Завершить» (done meetings: read/edit only), «Перенести», «Отменить».
- `FieldControl.tsx` — switch on `field.kind`: `mood` (5 emoji 😞😐🙂😄🤩 + 1–10 scale →
  `mood`/`mood_score`), `longtext` (textarea), `text` (input), `scale` (1–10 buttons),
  `select` (native), `checklist` (checkboxes), `date` (ДД.ММ.ГГГГ input), `file`
  (**disabled placeholder** — MinIO is slice 7). Only mood+longtext appear in the v1 form;
  the rest are kept for future templates.
- `RescheduleControl` — inline date/time → `patch({ date })`.
- `MoodPicker` (sub-component of the mood FieldControl) — emoji row + score.

### Wiring the slice-4 stubs
- `ProfileHeader` «Начать 1-2-1» → `useCreateMeeting({ member_id })` → `open(newId)`.
- `MeetingDetailCard` (planned) «Провести сейчас» → `open(id)`; «Перенести» → reschedule;
  «Отменить» → confirm → `useDeleteMeeting`.
- `MeetingDetailCard` (done) → add «Редактировать» → `open(id)`.
- `Feed` item / Topbar → `open(id)`.
The drawer's `memberId` (for invalidation) comes from the loaded `MeetingDetail.member_id`.

### States
loading (skeleton inside the drawer), error (inline retry), autosave `●`
idle/saving/saved/error (red ● + «Не сохранено» toast on PATCH failure; local state retained,
retried on next edit), complete/delete failure → inline error, drawer stays open. 403 → «Нет
доступа», 409 (complete/delete on `done`) → explanatory toast. Optimistic close after the
pending patch is flushed.

### Frontend tests
- Vitest: `FieldControl` (mood select sets emoji+score; longtext onChange), the autosave
  reducer/debounce (fake timers: edits coalesce into one PATCH; `flush()` fires immediately),
  `MeetingDrawer` (conduct vs done branches; footer buttons present/disabled per state).
- Playwright e2e: login → profile → «Начать 1-2-1» → type into Блокеры/Цели → «Завершить» →
  the meeting shows as «Завершена» in the feed. Negative: a `planned` meeting → «Отменить» →
  it disappears from the feed.

## Scope

### In scope
Backend: seed realignment (7 field_defs); `CreateMeetingRequest`/`UpdateMeetingRequest`/
`TemplateDetail`/`FieldDef` DTOs; `POST/PATCH/complete/DELETE /meetings` + `GET /templates/:id`;
validator; OpenAPI + types. Frontend: `zustand` drawer store; `MeetingDrawer`, `FieldControl`,
`MoodPicker`, `RescheduleControl`; create/autosave/complete/delete/template hooks; wiring of
the slice-4 stubs; loading/error/autosave states.

### Stubs (still, until later slices)
«Написать»/«Экспорт» (header), the `file` field control (disabled), kebab menus, Goals
«Добавить OKR/dev», file download/.zip/dropzone.

### Deferred (later slices)
Template editing + FieldsLibrary, `member_field_overrides`, the generic `fields` JSONB path,
Goals CRUD (slice 6), MinIO file upload/download (slice 7), CalendarScreen (slice 8).

### Boundary note
The drawer mutates **meetings only**. It reads a template to render the form but does not edit
templates. It writes the existing typed columns; the `fields` JSONB and per-member overrides
are untouched.

## Build order (vertical sub-steps)
1. `seed.rs` — realign «Базовый» to 7 field_defs; re-seed dev DB. Seed test.
2. Backend: DTOs + `POST/PATCH/complete/DELETE /meetings` + `GET /templates/:id`; ownership;
   validator. Tests.
3. OpenAPI registration + `pnpm gen:api`.
4. `zustand` install + drawer store; `FieldControl` + `MoodPicker` + Vitest.
5. `MeetingDrawer` + autosave/create/complete/delete/template hooks + Vitest; mount in `(app)/layout`.
6. Wire the slice-4 stubs (header/planned card/done card/feed).
7. Playwright e2e, then merge.

## What to preserve when porting (from parent + profile specs)
Warm beige palette; amber on the `brand` token (NOT `accent`); tabular-nums on
dates/durations/scores; Russian microcopy verbatim («Начать 1-2-1», «Провести сейчас»,
«Перенести», «Отменить», «Завершить», «Завершена», «Запланирована», «Настроение», «Блокеры»,
«Цели», «Фидбек сотруднику», «Фидбек от сотрудника», «Развитие», «Отношения», «Не сохранено»);
pill-based statuses; the `[data-theme]`/`[data-density]` token system; meaningful empty/error
states. Reuse `Pill`, `Avatar`, `NoteBlock`-style blocks, and the existing `MeetingDetail`
read path (unchanged).
