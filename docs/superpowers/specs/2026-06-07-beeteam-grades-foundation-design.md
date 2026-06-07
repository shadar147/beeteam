# BeeTeam — Grades Foundation slice — Design Spec

**Date:** 2026-06-07
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (deferred «entire BT_GRADES domain», line 225)
**Domain decomposition:** BT_GRADES is split into 5 sub-projects (each its own spec→plan→slice):
1. **Grades Foundation (read-only)** ← THIS SPEC
2. Member grades + profile «Грейд» tab
3. Evidence tagging in the 1-2-1 drawer
4. Performance Review flow (4-step)
5. Matrix editor + calibration + HR salary-band admin (`hr_admin` gating)
**Visual / data source of truth:** `design_handoff_beeteam/grades.jsx` (GradesScreen `:13`), `grades-data.js` (`window.BT_GRADES`: levels `:10`, salary bands `:20`, disciplines `:51`, blocks `:28`), README §"Система грейдов".

## Context

The whole core build order (slices 1–8) is merged. The prototype contains a full Grades/Competency/Performance-Review subsystem the core spec deferred as too large for one cycle. The Sidebar «Грейды» entry is `disabled`; there are no grade tables, endpoints, or screens. The `competencies` table (profile slice) is per-member 0–10 dev-plan bars — unrelated to the grade ladder. The `user_role` enum has an unused `hr_admin` value (reserved for later editing/calibration gating).

This slice (#1) builds the **foundation**: the grade framework data (disciplines, IC1–IC7 levels, block×level competency matrix, salary bands) and a **read-only** `/grades` screen that displays it. Everything downstream (#2–#5) depends on this framework existing.

## Locked decisions

| Area | Decision |
|------|----------|
| Scope | Read-only foundation: framework schema + seed + one read endpoint + the GradesScreen (Уровни / Матрица / Вилки) + nav enablement |
| Matrix storage | **Fully normalized** — `matrix_cells` is one row per (block, level), so the per-cell editor (#5) and evidence/review references (#3/#4) are clean |
| Addon tracks | **Deferred** (Go/Rust/iOS/Android sub-tracks). This slice seeds only the core discipline matrices (blocks × IC1–IC7) |
| Editing | **None** in this slice. The matrix editor + «+ Новая дисциплина» are slice #5 (with `hr_admin` gating) |
| Access | The framework is **workspace-global** (the company's grade map). View requires `require_auth` only — any authenticated lead sees it; no team scoping. Queries are scoped to the caller's workspace |
| Salary bands | Store ratios only (`band_low`/`band_mid`/`band_high` per level). No absolute numbers («Точные цифры — у HR-администратора») |
| Endpoint | One combined `GET /v1/grades/framework` (levels + disciplines+blocks+cells); the screen switches discipline/tab client-side |

## Architecture

```
Browser  /grades
  grades/page.tsx (server) → GradesClient (client)
    └─ useGradesFramework() → GET /api/v1/grades/framework (Next proxy → axum)
         └─ require_auth → workspace from users(auth.id) → sqlx (disciplines/levels/blocks/matrix_cells)
    └─ discipline tab + sub-tab (Уровни | Матрица | Вилки), all client-side
         GradeLevels(levels) · GradeMatrix(selectedDiscipline) · GradeBands(levels)
         matrix cell click → <Modal> with the full behavior text
Sidebar «Грейды» enabled (route-aware, like «Календарь»).
```

## Backend

### Migration `0004_grades.sql`
```sql
CREATE TABLE disciplines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,                 -- 'backend' | 'frontend' | ...
  label        TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE grade_levels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ord          INT NOT NULL,                  -- 1..7
  code         TEXT NOT NULL,                 -- 'IC1'
  name         TEXT NOT NULL,                 -- 'Trainee'
  exp          TEXT NOT NULL DEFAULT '',      -- '0–6 мес'
  autonomy     TEXT NOT NULL DEFAULT '',
  scope        TEXT NOT NULL DEFAULT '',
  mgr          BOOLEAN NOT NULL DEFAULT false,
  band_low     DOUBLE PRECISION NOT NULL,     -- ratio (e.g. 0.86); maps to Rust f64
  band_mid     DOUBLE PRECISION NOT NULL,
  band_high    DOUBLE PRECISION NOT NULL
);
CREATE TABLE grade_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,                -- 'stack' | 'core' | ...
  name          TEXT NOT NULL,               -- discipline-specific block name
  ord           INT NOT NULL DEFAULT 0
);
CREATE TABLE matrix_cells (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id  UUID NOT NULL REFERENCES grade_blocks(id) ON DELETE CASCADE,
  level_ord INT NOT NULL,                     -- 1..7
  text      TEXT,                             -- behaviour; NULL/empty when not required
  required  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (block_id, level_ord)
);
CREATE INDEX idx_disciplines_ws ON disciplines(workspace_id);
CREATE INDEX idx_grade_levels_ws ON grade_levels(workspace_id);
CREATE INDEX idx_grade_blocks_disc ON grade_blocks(discipline_id);
CREATE INDEX idx_matrix_cells_block ON matrix_cells(block_id);
```

### Seed (`bt-db/src/seed.rs`)
Port `design_handoff_beeteam/grades-data.js` for the seeded workspace:
- **7 levels** (IC1 Trainee … IC7 Principal) with `exp`/`autonomy`/`scope`/`mgr` + band ratios (e.g. IC5 `low 0.86 / mid 1.0 / high 1.14`).
- **5 disciplines** (Backend, Frontend, Mobile, QA, DevOps) with their block names (block keys `stack/core/arch/infra/ai/impact`; names are discipline-specific).
- **matrix_cells**: the behaviour text for each block×level from the prototype; cells marked «Не требуется» → `required=false` (NULL text). Addon tracks are NOT seeded (deferred).
Re-seed the dev DB after this change (`TRUNCATE workspaces CASCADE` + restart API).

### DTOs (`bt-domain`)
```rust
GradeLevel  { ord: i32, code, name, exp, autonomy, scope, mgr: bool,
              band_low: f64, band_mid: f64, band_high: f64 }
MatrixCell  { level: i32, text: Option<String>, required: bool }
GradeBlock  { id: Uuid, key, name, ord: i32, cells: Vec<MatrixCell> }
Discipline  { id: Uuid, key, label, icon, description, ord: i32, blocks: Vec<GradeBlock> }
GradesFramework { levels: Vec<GradeLevel>, disciplines: Vec<Discipline> }
```
(Band columns are `DOUBLE PRECISION` → bind directly as `f64`, no BigDecimal dependency.)

### Endpoint (`routes/grades.rs`, under `require_auth`)
```
GET /v1/grades/framework → 200 GradesFramework
  workspace = (SELECT workspace_id FROM users WHERE id = auth.id)
  levels: SELECT … FROM grade_levels WHERE workspace_id=$1 ORDER BY ord
  disciplines: SELECT … WHERE workspace_id=$1 ORDER BY ord
  blocks: SELECT … FROM grade_blocks WHERE discipline_id = ANY(disc ids) ORDER BY ord
  cells: SELECT … FROM matrix_cells WHERE block_id = ANY(block ids) ORDER BY level_ord
  assemble nested in Rust.
```
No team scoping (the framework is company-wide); just resolve the caller's workspace. No `require_team_access`/`require_member_access` here.

### Backend tests (sqlx)
- `framework` returns 7 levels ordered with band ratios; ≥1 discipline with its blocks (ordered) and 7 cells per block (ordered by level).
- A «не требуется» cell comes back `required=false` (text null/empty).
- Workspace isolation: a user in another workspace gets only their workspace's framework (or empty if unseeded).

## Frontend

### Routing + nav
- `web/app/(app)/grades/page.tsx` — server component → `<GradesClient/>` (no per-team prop needed; the endpoint resolves the workspace from the session).
- `Sidebar`: enable the «Грейды» entry — `href: "/grades"`, drop `disabled`; active via the existing `usePathname()` rule (slice-8 pattern). Keep «Конструктор полей»/«Экспорт» disabled.

### Query hook (`web/lib/query/grades.ts`)
`useGradesFramework()` → `useQuery`, key `["grades-framework"]`, `api.GET("/v1/grades/framework")`. Type `GradesFramework = components["schemas"]["GradesFramework"]` (+ `Discipline`/`GradeBlock`/`GradeLevel` aliases).

### Components (`web/components/grades/`)
- `GradesClient` — header «Грейды» + subtitle «Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес»; a discipline `SegControl` (Backend/Frontend/Mobile/QA/DevOps from the data); a sub-tab `SegControl` (Уровни / Матрица / Вилки); loads `useGradesFramework`; loading/error/empty; renders the active sub-view.
- `GradeLevels` — the 7 levels as cards/rows (code + name + exp + autonomy + scope; a «менеджерский трек» Pill when `mgr`). Global (same regardless of discipline).
- `GradeMatrix` — a grid: rows = the selected discipline's blocks, columns = IC1–IC7; each cell shows truncated behaviour text, or a dimmed «—» when `!required`. Clicking a cell opens a read-only `Modal` titled «{block} · {code}» with the full text («Что должен демонстрировать сотрудник на этом уровне»).
- `GradeBands` — per-level salary bands (low/mid/high ratios) as a bar/range visualization with the «Точные цифры — у HR-администратора» note. Global.
Reuse `Pill`, `SegControl`, `Modal`, `cn`, tokens.

### States
loading «Загрузка…»; error inline «Не удалось загрузить грейды» + Повторить; empty (no disciplines) → «Карта грейдов пока не настроена».

### Frontend tests
- Vitest: `GradeMatrix` (renders blocks×7 grid; clicking a cell opens the Modal with its text; a `required=false` cell renders dimmed «—» and isn't a content cell); `GradeLevels` (7 rows, «менеджерский трек» badge on mgr levels); `GradeBands` (renders a band per level).
- Playwright e2e: login → Sidebar «Грейды» → `/grades` → discipline tabs visible → Матрица shows the grid → click a cell → details modal → switch to Уровни and Вилки.

## Scope

### In scope
Backend: `0004_grades` (disciplines/grade_levels/grade_blocks/matrix_cells) + seed from grades-data.js (5 disciplines, IC1–IC7, bands) + `GET /v1/grades/framework` + OpenAPI/types. Frontend: `useGradesFramework`; `GradesClient` + `GradeLevels`/`GradeMatrix`/`GradeBands` + cell Modal; `/grades` route; Sidebar enablement; loading/error/empty.

### Deferred (later grades sub-slices)
Matrix editor / «+ Новая дисциплина» / edit mode (#5); addon tracks (Go/Rust/iOS/Android); member grade assignment + profile «Грейд» tab (#2); evidence tagging in the drawer (#3); Performance Review flow (#4); calibration + absolute salary numbers + `hr_admin` gating (#5).

### Boundary note
Read-only and workspace-global: the slice displays the company's grade framework. It does not assign grades to members, edit the matrix, or touch meetings/competencies. No per-member or per-team data.

## Build order (vertical sub-steps)
1. Migration `0004_grades` + seed (levels/disciplines/blocks/cells ported from grades-data.js) + seed test; re-seed dev DB.
2. DTOs + `GET /v1/grades/framework` + tests.
3. OpenAPI registration + `pnpm gen:api`.
4. `useGradesFramework` hook.
5. `GradeLevels` / `GradeMatrix` / `GradeBands` + cell Modal + Vitest.
6. `GradesClient` + `grades/page.tsx`.
7. Sidebar «Грейды» enablement.
8. Playwright e2e, then merge.

## What to preserve when porting
Warm beige palette; amber on the `brand` token (NOT `accent`); tabular-nums on level codes/ratios; Russian microcopy verbatim («Грейды», «Уровни», «Матрица», «Вилки», «менеджерский трек», «Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес», «Что должен демонстрировать сотрудник на этом уровне», «Точные цифры — у HR-администратора», «Карта грейдов пока не настроена»); `[data-theme]`/`[data-density]` tokens; meaningful empty/error states. Reuse `Pill`, `SegControl`, `Modal`, and the slice-8 route-aware Sidebar pattern. The block keys (`stack/core/arch/infra/ai/impact`) and level codes (IC1–IC7) are stable identifiers downstream slices (#2–#5) rely on.
