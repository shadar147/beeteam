# BeeTeam — Member Grades & Profile «Грейд» tab (slice #2)

**Status:** Design approved
**Date:** 2026-06-08
**Depends on:** Grades Foundation (#1) — `disciplines` / `grade_levels` / `grade_blocks` / `matrix_cells`, `GET /v1/grades/framework`, `GradeChip`.

## Goal

Show each engineering team member's assigned grade on a read-only **«Грейд»** tab in their
profile: current grade, discipline, promotion target with readiness, per-block profile
against target, the competencies to demonstrate next, and position within the band (compa).
The lead views only; assignment happens later via the Performance Review flow (#4).

## Scope

**In:**
- New per-member grade data (discipline, current grade, target, compa, review dates, mgr
  track, ready months, per-block levels).
- `GET /v1/members/{id}/grade` — read-only, scoped to the lead's team member.
- Profile «Грейд» tab: hero, block profile, "что показать для цели", compa band, and an
  **empty evidence placeholder** section (filled by #3).
- Seed member grades for engineering members; leave 1–2 non-engineers ungraded to exercise
  the empty state.

**Out (deferred):**
- Assigning / editing a member's grade (lead UI) — comes via review flow (#4) / editor (#5).
- Evidence timeline content — #3 (this slice renders only the empty placeholder).
- Review history + «Открыть ревью» button — #4 (not rendered here).
- Addon tracks (Go/Rust/iOS…) — no data model exists; not in this slice.

## Decisions (locked)

1. **Read-only.** No assignment/editing UI in #2. (User choice A.)
2. **Sections = core + evidence placeholder.** Review history and «Открыть ревью» button are
   not rendered; addon-track switcher is not rendered. (User choice.)
3. **Normalized model** (`member_grades` + `member_block_levels`), consistent with #1's
   normalized `matrix_cells`. (User choice A.)
4. **One grade per member** — `member_grades.member_id` is UNIQUE. Ungraded members render
   the «Грейд не назначен» empty state.
5. **Access:** `require_member_access` — same gate as the profile (lead → own team member).
6. **API returns member data only**, not matrix text; the frontend joins with the cached
   `framework` (from #1) by discipline/block keys. No duplication of matrix strings.
7. **compa shown without figures** — a position marker on a schematic band, consistent with
   #1's "точные цифры — у HR".

## Data model

Migration `0005_member_grades.sql`:

```sql
CREATE TABLE member_grades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL UNIQUE REFERENCES team_members(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES disciplines(id),
  grade_ord     int  NOT NULL CHECK (grade_ord BETWEEN 1 AND 7),
  target_ord    int  CHECK (target_ord BETWEEN 1 AND 7),   -- NULL = no target set
  compa         double precision NOT NULL DEFAULT 0.5,      -- 0..1 position in band
  ready_months  int  NOT NULL DEFAULT 0,
  mgr_track     bool NOT NULL DEFAULT false,
  next_review   date,
  last_review   date
);

CREATE TABLE member_block_levels (
  member_grade_id uuid NOT NULL REFERENCES member_grades(id) ON DELETE CASCADE,
  block_id        uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord       int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  UNIQUE(member_grade_id, block_id)
);

CREATE INDEX idx_member_block_levels_grade ON member_block_levels(member_grade_id);
```

(Migration number is `0005` — highest existing is `0004_grades`.)

## API

```
GET /v1/members/{id}/grade
  auth: require_member_access
  200 → MemberGrade | null      (null body when the member has no grade record)
  401 → unauthenticated
  403 → member not on the lead's team
```

DTOs (bt-domain):

```rust
struct BlockLevel { block_key: String, level_ord: i32 }

struct MemberGrade {
  discipline_key: String,
  grade_ord: i32,
  target_ord: Option<i32>,
  compa: f64,
  ready_months: i32,
  mgr_track: bool,
  next_review: Option<String>,   // ISO date "YYYY-MM-DD"
  last_review: Option<String>,
  block_levels: Vec<BlockLevel>,
}
```

Handler: resolve the member via `require_member_access`; `SELECT` the `member_grades` row
(joined to `disciplines.key`); if none → return `200` with `null`. Else load block levels
(joined to `grade_blocks.key`) and assemble. Register the path + schemas in `openapi.rs`.

## Frontend

Add tab to `web/app/(app)/profile/[id]/page.tsx` TABS: `{ key: "grade", label: "Грейд" }`,
rendered when `tab === "grade"`.

Files:

| File | Responsibility |
|------|----------------|
| `web/lib/query/member-grade.ts` | `useMemberGrade(id)` hook + DTO re-exports |
| `web/app/(app)/profile/[id]/GradeTab.tsx` | orchestrator: framework + member-grade queries; loading / error / «Грейд не назначен» empty state; layout |
| `web/components/grades/GradeHero.tsx` | XL grade chip, discipline pill, target + readiness bar, review dates |
| `web/components/grades/BlockProfile.tsx` | per-block segmented track (освоено / выше грейда / цель) + grade marker + legend |
| `web/components/grades/GrowChecklist.tsx` | «Что показать для {target}» — matrix text for blocks below target |
| `web/components/grades/CompaBand.tsx` | schematic band with low/mid/high ticks + position marker by compa (no figures) |
| `web/components/grades/EvidencePlaceholder.tsx` | «Свидетельства из 1-2-1» section, empty state (filled by #3) |

Reuse `GradeChip` from #1; add an `xl` size variant.

**Segment logic (ported from prototype `grade-profile.jsx`):** for a block with current level
`cur`, member `grade`, member `target`, over levels 1..7:
- `n ≤ cur` → освоено (`fill`); if `n > grade` also `ahead` (above-grade highlight).
- `cur < n ≤ target` → цель (`target`).
- grade marker positioned at `grade`.

`GrowChecklist` lists blocks where `block_level < target`, showing that block's matrix cell
text at the `target` level (from framework). Evidence counts are out of scope (#3) — the
checklist shows no "N свидетельств" line yet.

`CompaBand`: marker `left = compa * 100%`; copy varies by band (`<0.4` lower / `<0.66` near
median / else upper), matching the prototype.

Styling: project tokens (`brand`, `bg-tint`, ink scale), matching the polished #1.

## Seed

In `seed.rs`, after the framework seed, insert `member_grades` + `member_block_levels` for
the engineering members of the demo team across Backend/Frontend/QA/DevOps with varied
grade/target/compa/review dates (modeled on prototype `t1`–`t8`). Leave 1–2 non-engineering
members without a record. Block levels: one row per block of the member's discipline.

Seed test: assert the expected number of `member_grades` rows and that each graded member has
`block_levels` count equal to its discipline's block count.

## Testing

- **bt-api** (`#[sqlx::test]` + `oneshot`): graded member → 200 with populated shape;
  ungraded member → 200 with `null`; foreign member → 403; no token → 401.
- **web unit** (Vitest): `BlockProfile` segment classes (освоено / выше / цель); `CompaBand`
  marker position; `GradeTab` empty state renders «Грейд не назначен».
- **e2e** (Playwright): profile → «Грейд» tab → grade chip + block profile + empty evidence
  visible for a graded member; «Грейд не назначен» for an ungraded member.

## Out-of-scope hooks for later slices

- `member_grades.ready_months` / `next_review` / `last_review` feed the review flow (#4).
- `EvidencePlaceholder` is the mount point for the #3 evidence timeline.
- `GradeChip` `xl` and the block-profile segment logic will be reused in #4's review screen.
