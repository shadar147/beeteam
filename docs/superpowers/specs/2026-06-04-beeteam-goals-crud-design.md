# BeeTeam — Goals CRUD slice — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (build-order slice 6)
**Predecessor slices:** EmployeeProfile (slice 4, read-only Goals tab) + MeetingDrawer (slice 5, first mutating endpoints) — both merged to `main`.
**Visual source of truth:** `design_handoff_beeteam/flows.jsx` (GoalsTab `:436`) + the existing read-only components.

## Context

The profile's «Цели и развитие» tab is read-only: `OkrCard` (OKRs from `goals`), `DevItemRow` (`development_items`), `CompetencyBar` (`competencies`), all fed by `GET /v1/members/:id/goals` (`GoalsResponse { okrs, development, competencies }`). The «Добавить OKR/dev» actions are stubs (profile spec, slice 4). Slice 5 introduced the first mutating endpoints (`POST/PATCH/DELETE /meetings`) with `validator`, `AppError::Conflict`, ownership via `require_member_access`, and frontend `useMutation` hooks with query-key invalidation.

This slice (6) makes the whole Goals tab editable: a team lead can add / edit / delete OKRs, development items, and competencies for a member on their team. It mirrors the slice-5 mutation patterns (flat-resource endpoints, ownership guard, validator) and adds a small reusable `Modal` for the edit forms.

## Locked decisions

| Area | Decision |
|------|----------|
| CRUD scope | **All three** sections editable: OKR (`goals`), dev plan (`development_items`), competencies (`competencies`). Each gets create/update/delete |
| Edit UX | **Modal + explicit Save** (not autosave, not inline). A lightweight reusable `Modal` (NOT a dialog library) holds a per-entity form; POST on create, PATCH on edit, DELETE from inside the edit form (with `confirm()`) |
| Endpoint shape | **Flat resources** `/v1/goals`, `/v1/development-items`, `/v1/competencies` — each POST/PATCH/DELETE — mirroring `/v1/meetings`. (Not nested under the member.) `member_id` is in the create body; for PATCH/DELETE the member is resolved from the row |
| Edit affordance | An explicit small «Изменить» control on each card/row (NOT click-the-whole-card). «+ Добавить …» button per section opens the create modal |
| Ownership | Reuse `require_member_access`: create → guard `body.member_id`; PATCH/DELETE → resolve member from the row, then guard. Foreign lead → 403 |
| Ordering | `development_items`/`competencies` new rows append at `ord = COALESCE(max(ord)+1, 0)` for that member. Drag-reordering is out of scope |
| Open-state | Local `useState` in `GoalsTab` (`{ type, mode, entity }`) — modals are local to this tab, unlike the global MeetingDrawer (no zustand) |

## Architecture

```
GoalsTab (useMemberGoals) → three sections + «+ Добавить» buttons + per-item «Изменить»
  └─ local modal state {type: okr|dev|comp, mode: create|edit, entity?}
       └─ <Modal> wrapping OkrForm | DevItemForm | CompetencyForm
            └─ mutation hooks (lib/query/goals.ts): useCreate/Update/Delete{Goal,DevItem,Competency}
                 └─ /api/v1/{goals,development-items,competencies}{,/:id}  (Next proxy, cookie→Bearer)
                      └─ axum require_auth → require_member_access → handler (validator)
                           └─ sqlx: goals | development_items | competencies
       on success → close modal + invalidateQueries(["member-goals", memberId])
```

## Backend

### DTOs (`bt-domain`, with `validator::Validate` on requests)
Reuse existing response DTOs `Goal`, `DevItem`, `Competency`. Add:

```rust
#[derive(Deserialize, ToSchema, Validate)]
pub struct CreateGoalRequest {
    pub member_id: uuid::Uuid,
    pub quarter: String,
    pub title: String,
    pub key_result: String,
    #[validate(range(min = 0, max = 100))] pub progress: i32,
    pub status: String,   // goal_status: ontrack | risk | done
    pub due: chrono::DateTime<chrono::Utc>,
}
#[derive(Deserialize, ToSchema, Validate)]
pub struct UpdateGoalRequest {
    pub quarter: Option<String>,
    pub title: Option<String>,
    pub key_result: Option<String>,
    #[validate(range(min = 0, max = 100))] pub progress: Option<i32>,
    pub status: Option<String>,
    pub due: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize, ToSchema, Validate)]
pub struct CreateDevItemRequest {
    pub member_id: uuid::Uuid,
    pub title: String,
    pub kind: String,
    pub status: String,   // planned | in_progress | done (TEXT, app-level)
    pub note: Option<String>,
}
#[derive(Deserialize, ToSchema, Validate)]
pub struct UpdateDevItemRequest {
    pub title: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub note: Option<String>,
}

#[derive(Deserialize, ToSchema, Validate)]
pub struct CreateCompetencyRequest {
    pub member_id: uuid::Uuid,
    pub label: String,
    #[validate(range(min = 0, max = 10))] pub score: i32,
}
#[derive(Deserialize, ToSchema, Validate)]
pub struct UpdateCompetencyRequest {
    pub label: Option<String>,
    #[validate(range(min = 0, max = 10))] pub score: Option<i32>,
}
```

### Endpoints (new `routes/goals.rs`, under `require_auth` + ownership)
```
POST   /v1/goals                  → 201 Goal        (require_member_access(body.member_id))
PATCH  /v1/goals/:id              → 200 Goal        (member from row → guard; COALESCE update)
DELETE /v1/goals/:id              → 204
POST   /v1/development-items      → 201 DevItem     (ord = max+1)
PATCH  /v1/development-items/:id  → 200 DevItem
DELETE /v1/development-items/:id  → 204
POST   /v1/competencies           → 201 Competency  (ord = max+1)
PATCH  /v1/competencies/:id       → 200 Competency
DELETE /v1/competencies/:id       → 204
```
- A small private helper per table resolves `member_id` for PATCH/DELETE guarding, e.g. `member_of_goal(pool, id) -> Option<Uuid>` (and dev/comp equivalents), returning `None` → 404.
- `status` for `goals` is bound `$n::goal_status`; an out-of-range value surfaces as a DB error — pre-validate against `["ontrack","risk","done"]` and return `AppError::BadRequest` for a clean 400. `development_items.status` is free TEXT (app convention planned/in_progress/done) — not DB-constrained, no cast.
- `workspace_id` on create is derived server-side from the member (`SELECT tm.workspace_id FROM team_members WHERE tm.id = $1`), never client-supplied — same as `create_meeting`.
- create returns the inserted row mapped to the response DTO (`RETURNING ...`); PATCH re-selects and returns the row.

### Backend tests (sqlx, :5433)
Per entity (goals / dev-items / competencies):
- create → 201 + correct fields; foreign member → 403; invalid payload (progress 101 / score 11) → 400.
- patch → 200 with changed field, untouched fields preserved (COALESCE); foreign → 403.
- delete → 204, then GET member goals no longer lists it; foreign → 403.
- dev-items/competencies: a second create appends `ord` after the first.

## Frontend

### `Modal` (`web/components/Modal.tsx`) — new, lightweight
Scrim (`bg-black/30 backdrop-blur-sm`) + centered card (`bg-bg-elev shadow-pop rounded-lg`), title, `{children}`, optional footer. Closes on scrim click and `Escape`. Props: `{ title, onClose, children }`. No Radix.

### Mutation hooks (`web/lib/query/goals.ts`) — mirror `meetings.ts`
`useInvalidateGoals()` → `invalidateQueries(["member-goals", memberId])` (and `["member", memberId]` for counts if relevant). Then `useCreateGoal / useUpdateGoal / useDeleteGoal`, `useCreateDevItem / useUpdateDevItem / useDeleteDevItem`, `useCreateCompetency / useUpdateCompetency / useDeleteCompetency`. Each `mutationFn` calls `api.POST/PATCH/DELETE`, throws on `error`, and `onSuccess` invalidates. Request body types come from generated `components["schemas"]["..."]`.

### Forms (`web/components/goals/`)
- `OkrForm` — title (text), key_result (text), quarter (text, prefilled with the member's current/most-recent quarter or "Q_ ____"), progress (number 0–100), status (SegControl ontrack/risk/done with RU labels В работе/Под риском/Готово), due (`datetime-local` or date input). 
- `DevItemForm` — title, kind (text; `<datalist>` suggestions Курс/Доклад/Книга/Сертификат/Менторство), status (SegControl planned/in_progress/done → Запланировано/В работе/Готово), note (text).
- `CompetencyForm` — label (text), score (0–10 number or stepper).
Each form: controlled local state, `onSubmit(body)`, optional `onDelete()` (edit mode only), client-side required/range checks; renders an inline error slot.

### Edit modals (`web/components/goals/`)
`GoalEditModal`, `DevItemEditModal`, `CompetencyEditModal` — wrap the matching form in `Modal`, call the create or update hook by `mode`, expose delete in edit mode, show mutation errors inline, close on success.

### GoalsTab wiring
- Each section header gets a «+ Добавить» button → opens the create modal for that type.
- `OkrCard`, `DevItemRow`, `CompetencyBar` gain a small «Изменить» control (icon/text button) → opens the edit modal with the entity prefilled.
- Local state: `const [modal, setModal] = useState<{type, mode, entity?} | null>(null)`.
- Read path (`useMemberGoals`) unchanged; after any mutation the query is invalidated and the tab re-renders.

### States
Submit pending → Save button disabled («Сохранение…»). Mutation error → inline message in the modal, modal stays open, form state retained. Empty sections keep their existing copy («Целей пока нет» etc.) alongside the «+ Добавить» button.

## Scope

### In scope
Backend: 6 request DTOs + `routes/goals.rs` with 9 endpoints (goals/dev-items/competencies CRUD) + ownership + validator; OpenAPI + types. Frontend: `Modal`; `goals.ts` mutation hooks (9); `OkrForm`/`DevItemForm`/`CompetencyForm`; three edit modals; GoalsTab «+ Добавить»/«Изменить» wiring; loading/error states.

### Stubs / deferred
Drag-reordering of dev-items/competencies; career-track & mentorship sections (grades domain); export. «Написать»/«Экспорт» header buttons stay stubs (not this slice). Files/MinIO = slice 7; CalendarScreen = slice 8.

### Boundary note
The slice mutates only `goals` / `development_items` / `competencies` for members on the caller's team. It does not touch meetings, templates, or files.

## Build order (vertical sub-steps)
1. Goal DTOs (`CreateGoalRequest`/`UpdateGoalRequest`) + `routes/goals.rs` goals CRUD + tests.
2. Dev-item DTOs + dev-items CRUD (ord append) + tests.
3. Competency DTOs + competencies CRUD (ord append) + tests.
4. OpenAPI registration + `pnpm gen:api`.
5. `Modal` component + Vitest.
6. `goals.ts` mutation hooks.
7. `OkrForm` / `DevItemForm` / `CompetencyForm` + Vitest.
8. Three edit modals + GoalsTab «+ Добавить»/«Изменить» wiring.
9. Playwright e2e, then merge.

## What to preserve when porting
Warm beige palette; amber on the `brand` token (NOT `accent`); tabular-nums on progress/scores/percents/dates; Russian microcopy verbatim («Добавить», «Изменить», «Удалить», «Сохранить», «В работе», «Под риском», «Готово», «Запланировано», «План развития», «Компетенции», «Целей пока нет»); pill-based statuses; the `[data-theme]`/`[data-density]` token system; meaningful empty/error states. Reuse `Pill`, `SegControl`, and the existing read-only `OkrCard`/`DevItemRow`/`CompetencyBar` (extended with the «Изменить» affordance). Mirror the slice-5 backend mutation + frontend `useMutation`/invalidation patterns.
