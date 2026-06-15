# BeeTeam — Framework Editor (slice #5b-i)

**Status:** Design approved
**Date:** 2026-06-15
**Depends on:** Grades Foundation (#1) — `disciplines/grade_levels/grade_blocks/matrix_cells`,
`GET /v1/grades/framework`, `GradesClient`/`GradeMatrix`/`GradeLevels`; RBAC (#5a) —
`Permission::EditFramework`, `require_permission`, `permissions` in the session,
`hasPermission`, HR user Ольга Климова.

## Goal

The HR-admin edit mode on `/grades`: enter editing, modify the competency matrix (cells,
blocks), the IC1–IC7 level descriptions, and the active discipline's meta; create a new
discipline by copying an existing block structure. All edits are a client-side draft applied
only on «Сохранить»; «Отмена» discards. Gated by the `EditFramework` permission both in the
UI and on every write endpoint.

**Slice #5b decomposition (user choice):** 5b-i = framework editor (THIS SPEC); 5b-ii =
salary bands (exact numbers + editing under `EditSalaryBands`) — own spec→plan→slice. This
closes BT_GRADES after 5b-ii.

## Scope

**In:**
- `PATCH /v1/grades/levels` (bulk-edit the 7 levels' name/exp/autonomy/scope).
- `PUT /v1/grades/disciplines/{id}` (reconcile the discipline: meta + ordered blocks + cells).
- `POST /v1/grades/disciplines` (create from a base discipline's block structure).
- `/grades` edit mode: enter/save/cancel, draft state, discipline-editor card, `MatrixEditor`,
  `LevelsEditor`, `CellEditor`, `NewDisciplineModal`; «Редактировать» gated by `EditFramework`.
- Server-side `require_permission(EditFramework)` on all three writes; read stays open.

**Out (deferred):**
- Salary bands — exact numbers + editing — **5b-ii** (`EditSalaryBands`). The Levels editor
  here never touches `band_low/mid/high`, `code`, `mgr`, or `ord`.
- Adding/removing grade levels (the IC1–IC7 ladder is fixed; downstream relies on it).
- Deleting or archiving a whole discipline (same FK risk as blocks, rarer — defer).
- Addon tracks (Go/Rust/iOS/…): no data model; the track-switcher is hidden in edit mode.
- Versioning / audit history of framework changes.

## Decisions (locked)

1. **Sub-slice 5b-i = framework editor only** (user choice); bands are 5b-ii.
2. **Draft + Save/Cancel** (user choice, prototype-faithful): edit mode snapshots the active
   discipline + the 7 levels into React state; writes happen only on «Сохранить»; «Отмена»
   discards. Cancel/rollback is a first-class feature → no granular autosave.
3. **Block deletion blocked when data exists** (user choice): removing a block that has rows
   in `member_block_levels / grade_evidence / review_scores / self_assessments` → **409**,
   the whole PUT rolls back. No soft-delete, no cascade.
4. **Approach A — reconciling PUT per discipline + bulk PATCH levels** (user choice): the PUT
   carries the full block list (ids for existing, null for new) and reconciles
   update/insert/delete-if-empty in one transaction.
5. **No schema migration.** 5b-i writes only to existing tables.
6. **Levels are edit-in-place text only:** name/exp/autonomy/scope. `code/ord/mgr/band_*`
   are never written here.
7. **Disciplines: create (copy structure) + edit meta** (label/icon/description). No delete.
8. **New blocks get a server-generated unique `key`** (slug of name + suffix on collision);
   `key` is a schema identifier, not shown in the UI.
9. **«Не требуется» = `required=false, text=NULL`** (matches the seed, e.g. arch/IC1).
10. **Last-write-wins** on a discipline (single HR-admin per workspace); no row locking.

## Data model

No migration. Writes target existing tables (`0004_grades.sql`):
- `disciplines(label, icon, description, ord)` — meta updated by PUT; row created by POST.
- `grade_levels(name, exp, autonomy, scope)` — the only columns PATCH writes.
- `grade_blocks(discipline_id, key, name, ord)` — reconciled by PUT.
- `matrix_cells(block_id, level_ord, text, required)` — upserted by PUT,
  `UNIQUE (block_id, level_ord)` already present.

All four block-referencing FKs (`member_block_levels`, `grade_evidence`, `review_scores`,
`self_assessments`) have no `ON DELETE` clause → Postgres rejects deleting a referenced block.
The PUT **pre-checks** for referencing rows and returns a clean 409 rather than relying on the
23503 error.

## API

All three guard with `require_permission(EditFramework)` → 403. `GET /v1/grades/framework`
is unchanged and open to all authenticated users.

```
PATCH /v1/grades/levels
  body: UpdateLevels { levels: [{ ord, name, exp, autonomy, scope }] }
  One transaction; UPDATE grade_levels SET name/exp/autonomy/scope WHERE ord=$ AND workspace_id=$.
  Ignores rows with an unknown ord. Never touches code/mgr/band_*.
  200 → GradeLevel[]   (the full refreshed ladder)

PUT /v1/grades/disciplines/{id}
  404 unless the discipline is in the caller's workspace.
  body: PutDiscipline { label, icon, description, blocks: PutBlock[] }
    PutBlock { id: Option<Uuid>, name, cells: PutCell[] }   // array order = ord
    PutCell  { level_ord (1..7), text: Option<String>, required: bool }
  One transaction:
    1. UPDATE disciplines SET label/icon/description.
    2. Existing blocks (id present, must belong to this discipline else 400):
       UPDATE name, ord (= array index).
    3. Removed blocks (current minus payload): if any referencing row exists → 409
       "block in use" (rollback); else DELETE (cells cascade).
    4. New blocks (id null): INSERT with ord = index, generated unique key.
    5. Cells: upsert all 7 (block_id, level_ord) → text, required
       (ON CONFLICT (block_id, level_ord) DO UPDATE).
  400 on: duplicate id in payload, id not belonging to the discipline, level_ord out of 1..7,
       empty label/name.
  200 → Discipline   (the reassembled discipline with real block ids)

POST /v1/grades/disciplines
  body: CreateDiscipline { label, icon, description, copy_from_discipline_id }
  404 if copy_from is not in the workspace.
  Inserts a discipline (ord = max+1, generated unique key) and copies the source's blocks
  (same names/ord, generated keys) with EMPTY cells (text null, required true).
  201 → Discipline
```

DTOs in bt-domain: `UpdateLevels`, `UpdateLevel`, `PutDiscipline`, `PutBlock`, `PutCell`,
`CreateDiscipline` (validated: label/name non-empty, level_ord 1..7). Register the three paths
+ new schemas in `openapi.rs`; regenerate web types.

## Frontend

**Permission to the client.** `web/app/(app)/grades/page.tsx` becomes a server component that
reads `getSessionUser` and passes `canEdit={hasPermission(user, "edit_framework")}` to
`GradesClient` (mirrors how `Sidebar` receives `user`). No role checks anywhere — permission
only.

**`GradesClient` edit mode** (extend the existing client):
- State: `editing` + a working `draft` (the active discipline's blocks with real ids + cells,
  and the 7 levels) snapshotted on enter.
- «Редактировать» button rendered only when `canEdit`. In edit mode: amber «режим
  редактирования» badge + edit-banner; «Отмена» / «Сохранить»; other discipline cards dimmed
  and non-clickable; the «Вилки» tab and the (future) track-switcher hidden — only «Уровни»
  and «Матрица» available.
- Discipline-editor card: icon-picker + Название/Описание inputs editing the draft meta.

**New components in `web/components/grades/`:**
- `MatrixEditor.tsx` — the matrix grid with the left block column as a name `<input>` +
  ↑/↓/delete controls (↑/↓ disabled at boundaries); clickable cells (hover pencil) open
  `CellEditor`; «+ Добавить блок компетенций» at the bottom. New blocks get a client temp id.
- `LevelsEditor.tsx` — per level: editable name/exp/autonomy/scope (code chip read-only) +
  the «Уровни общие для всех дисциплин» info-banner.
- `CellEditor.tsx` — `Modal`-based: textarea, «Отметить „не требуется"» (`required=false,
  text=null`), «Очистить» (`text=""`), «Применить» writes the cell into the draft (not the DB).
- `NewDisciplineModal.tsx` — icon-picker + label + description + «скопировать структуру из…»
  select → `POST`, then switch to the new discipline on success.

**Save orchestration.** «Сохранить» calls `PATCH /levels` (only if levels changed) +
`PUT /disciplines/{id}`; on success exit edit mode and invalidate `["grades-framework"]`. A
409 (block in use) keeps edit mode open with a banner naming the blocked block; other errors
show a generic banner.

**Hooks `web/lib/query/grades.ts`** (extend): `useUpdateLevels()`, `usePutDiscipline()`,
`useCreateDiscipline()` — all invalidate `["grades-framework"]`. Russian microcopy verbatim
from the prototype; amber on the `brand` token.

## Edge cases

- No `EditFramework` → no «Редактировать» button; a direct API call → 403.
- «Отмена» discards the whole draft.
- New discipline from copy → all-empty matrix, cells render «добавить…».
- ↑/↓ disabled at list boundaries; a no-op Save is idempotent.
- Delete of a block with data → 409, PUT rolls back fully (no partial save); UI keeps edit
  mode and names the block.
- Block id not belonging to the discipline / duplicate id / level_ord out of range / empty
  label or name → 400.
- `POST` with an unknown `copy_from_discipline_id` → 404.
- Concurrent PUT by two HR admins → last-write-wins (acceptable; one HR-admin per workspace).

## Testing

- **bt-api** (`routes/grades.rs mod tests`, pattern of existing tests): `PATCH /levels` — HR
  updates name/exp, `code/band_*` untouched, lead 403; `PUT /disciplines/{id}` — rename block
  + edit cell persist, new block gets id+key, reorder changes ord, delete of an EMPTY block
  works, delete of a block WITH data (a frontend block carrying Анна's `member_block_levels`)
  → 409 with rollback; `POST /disciplines` — copies block structure with empty cells + new
  key, unknown copy_from → 404, lead 403.
- **web unit** (Vitest): `MatrixEditor` (rename/add/reorder/delete fire callbacks),
  `LevelsEditor` (edit fires the setter), `CellEditor` («не требуется» → `required=false,
  text=null`; clear; apply writes the draft), `NewDisciplineModal` (submit disabled until a
  label), `GradesClient` («Редактировать» only when `canEdit`; «Вилки» tab hidden in edit mode).
- **e2e `grades-editor.spec.ts`** (HR Ольга): create a NEW discipline (POST — isolated, does
  not touch the 5 seeded ones) → Редактировать → add a block + edit a cell → Сохранить →
  changes persist after reload. Plus a quick check: a lead on `/grades` sees no «Редактировать».
  ⚠️ Intentionally: e2e does NOT edit the global levels or delete shared-discipline blocks
  (would break grades/member-grade/review specs in the same un-reseeded run) — reconcile-delete
  and level editing are covered by the Rust/unit tests.

## Out-of-scope hooks for later slices

- **5b-ii (salary bands):** `EditSalaryBands` already exists; adds band editing (the
  `band_low/mid/high` columns this slice deliberately leaves alone) + an exact-numbers view
  gated by that permission. The «Вилки» tab — hidden here in edit mode — becomes editable there.
- Discipline delete / framework versioning remain open for a future slice if needed.
