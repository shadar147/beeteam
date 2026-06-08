# BeeTeam — Grade Evidence in 1-2-1 (slice #3)

**Status:** Design approved
**Date:** 2026-06-08
**Depends on:** Grades Foundation (#1) — framework + `GradeChip`; Member Grades (#2) — `GET /v1/members/{id}/grade`, the profile «Грейд» tab, `EvidencePlaceholder`, `GrowChecklist`.

## Goal

Let the lead capture demonstrated competencies during a 1-2-1: in the meeting drawer, pick a
block + note + level (status demonstrated/partial). These evidence entries accumulate per
member and surface on the profile «Грейд» tab as a real timeline, and as counts in the growth
checklist. This is the first **write** feature of the grades domain (create + delete).

## Scope

**In:**
- `grade_evidence` table + `evidence_status` enum.
- `POST /v1/evidence` (create), `DELETE /v1/evidence/{id}`, `GET /v1/members/{id}/evidence`.
- A **«Проявленные компетенции»** capture section in `MeetingDrawer` (full version): grade
  mini-hero, growth hints (clickable target competencies that preselect a block), block
  select + note + level chips, and a "logged in this meeting" list with delete.
- Profile «Грейд» tab: replace `EvidencePlaceholder` with a real `EvidenceTimeline`; wire
  evidence counts into `GrowChecklist`.
- Seed a few evidence entries for one member (Анна Лебедева).

**Out (deferred):**
- Performance Review flow / review history / «Открыть ревью» — #4.
- Matrix editor / calibration / HR salary admin — #5.
- Addon tracks — no data model.
- Editing an existing evidence entry's note/level after creation (only create + delete).

## Decisions (locked)

1. **Full capture** (prototype-fidelity): mini-hero + growth hints + manual block/note/level +
   logged list. (User choice.)
2. **Single table** `grade_evidence` (not FK'd to a specific `matrix_cells` row). Evidence ties
   to (block, level), which are stable; the cell text may change. (User choice A.)
3. **`meeting_id` nullable, `ON DELETE SET NULL`** — evidence belongs to the person; deleting a
   meeting keeps the evidence in their history.
4. **Two statuses:** `demonstrated` (default, set by clicking a level chip) and `partial` (set
   via a small "частично" control). Stored as a Postgres enum.
5. **Access:** `require_member_access` on all three endpoints (create resolves the member from
   the body's `member_id`; delete resolves it from the evidence row).
6. **No optimistic UI** — after create/delete, refetch `useMemberEvidence` (same simple pattern
   the drawer uses for file attachments). Evidence is independent of the meeting form, so there
   is no autosave interaction.
7. **Counts computed on the frontend** from the evidence list — no separate count endpoint.

## Data model

Migration `0006_grade_evidence.sql` (highest existing is `0005_member_grades`):

```sql
CREATE TYPE evidence_status AS ENUM ('demonstrated', 'partial');

CREATE TABLE grade_evidence (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  block_id   uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord  int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  status     evidence_status NOT NULL DEFAULT 'demonstrated',
  note       text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grade_evidence_member ON grade_evidence(member_id, created_at DESC);
CREATE INDEX idx_grade_evidence_meeting ON grade_evidence(meeting_id);
```

## API

```
POST   /v1/evidence
  auth: require_member_access (member_id from body)
  body: CreateEvidence
  validate: level_ord 1..7; status ∈ {demonstrated, partial}; block_id exists
  201 → Evidence

DELETE /v1/evidence/{id}
  auth: require_member_access (resolve member_id from the evidence row; 404 if no such row)
  204

GET    /v1/members/{id}/evidence
  auth: require_member_access
  200 → Evidence[]   (ORDER BY created_at DESC)
```

DTOs (bt-domain):

```rust
struct Evidence {
  id: Uuid,
  meeting_id: Option<Uuid>,
  block_key: String,
  block_name: String,
  level_ord: i32,
  status: String,       // "demonstrated" | "partial"
  note: String,
  created_at: String,   // ISO 8601
}

struct CreateEvidence {
  member_id: Uuid,
  meeting_id: Option<Uuid>,
  block_id: Uuid,
  level_ord: i32,
  status: String,
  note: String,
}
```

The `status` is read/written as text and mapped to the `evidence_status` enum in SQL via
`$n::evidence_status` on insert and `status::text` on select (mirrors how `member_status` is
handled elsewhere). Register the path + both schemas in `openapi.rs`; regenerate web types.

## Frontend

New query module `web/lib/query/evidence.ts`:
- `useMemberEvidence(id)` — `GET /v1/members/{id}/evidence`.
- `useCreateEvidence(memberId)` — POST, invalidates `["member-evidence", memberId]`.
- `useDeleteEvidence(memberId)` — DELETE, invalidates `["member-evidence", memberId]`.

New component `web/components/meeting/CompetencyCapture.tsx` (extracted to keep `MeetingDrawer`
focused). Props: `{ memberId, meetingId }`. Behavior:
- Loads `useMemberGrade(memberId)`, `useGradesFramework()`, `useMemberEvidence(memberId)`.
- No grade → "У сотрудника не назначен грейд (другая карьерная лестница)." No capture.
- Mini-hero: grade chip + discipline label + "цель IC{target} · стабильно {ready} мес" or
  "подтверждает текущий уровень".
- Growth hints: for blocks where the member's level < target, a button per block showing the
  matrix text at target level; clicking preselects that block.
- Form: block `<select>` + note `<input>` + a row of level chips IC1..IC7. Clicking a chip
  calls create with `status: "demonstrated"`. A small "частично" affordance creates with
  `status: "partial"`.
- "Отмечено в этой встрече ({n})": evidence rows where `meeting_id === meetingId`; status
  marker + «{block} · IC{level}» pill + note + delete button.

Mount it in `MeetingDrawer` as a new section after «Вложения» (single scrolling column; the
drawer is not tabbed). Only render once `meeting.data` is available (needs `member_id`).

Profile «Грейд» tab:
- New `web/components/grades/EvidenceTimeline.tsx` replaces `EvidencePlaceholder` usage in
  `GradeTab`. Renders the evidence list (status marker, block·level pill, note, date) with the
  same empty-state copy; header shows the count. `EvidencePlaceholder.tsx` is removed.
- `GrowChecklist` gains an optional `evidenceCountByBlock: Record<string, number>` prop: for a
  block with count > 0, show a green "{n} свидетельств зафиксировано в 1-2-1" line and a filled
  check. `GradeTab` computes the map from `useMemberEvidence`: count entries where
  `block_key === b.key && level_ord >= target_ord`.
- `GradeTab` adds `useMemberEvidence(memberId)` to its existing queries.

## Seed

In `seed.rs`, after member grades, insert ~6 evidence rows for Анна Лебедева (ported from
`grades-data.js` `ev1`–`ev6`: blocks arch/impact/stack/ai, mix of demonstrated/partial), tied
to her existing `done` meetings (use her seeded meeting ids; `meeting_id` may also be left null
if a convenient meeting id is not at hand — but prefer linking to her done meetings). Seed test
asserts the evidence count for Анна.

## Testing

- **bt-api** (`#[sqlx::test]` + `oneshot`): POST creates (201, row present); POST rejects bad
  `level_ord`/`status` (400/422); POST/GET/DELETE forbidden for a foreign member (403);
  DELETE removes (204) and a second DELETE 404s; GET returns DESC order.
- **web unit** (Vitest): `CompetencyCapture` shows the no-grade fallback when grade is null;
  clicking a level chip invokes the create callback with the right block/level (inject the
  mutation via a thin seam or assert the fetch call); `EvidenceTimeline` renders rows + empty
  state; `GrowChecklist` shows the evidence-count line when count > 0.
- **e2e** (Playwright): open Игорь's 1-2-1 → «Проявленные компетенции» → mark a competency →
  it appears under "отмечено в этой встрече"; then the profile «Грейд» tab timeline shows an
  entry. Re-seed the dev DB after seed changes.

## Out-of-scope hooks for later slices

- `grade_evidence` rows feed #4's review screen ("{n} свидетельств в истории").
- `created_by` supports future attribution/audit.
