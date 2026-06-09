# BeeTeam — Performance Review flow (slice #4)

**Status:** Design approved
**Date:** 2026-06-10
**Depends on:** Grades Foundation (#1) — framework, matrix, `GradeChip`; Member Grades (#2) —
`member_grades` + `member_block_levels`, `GET /v1/members/{id}/grade`, profile «Грейд» tab
(`GradeHero`, `BlockProfile`, `CompaBand`); Grade Evidence (#3) — `grade_evidence`,
`GET /v1/members/{id}/evidence`, `EvidenceTimeline`.

## Goal

The formal grade checkpoint, run by the lead every ~6 months: a wide 4-step wizard
(Подготовка → Оценка по блокам → Калибровка → Решение) launched from the profile «Грейд» tab.
The review is a **draft with autosave** while in progress; «Завершить ревью» moves it to
**pending HR approval** — it does NOT change the member's grade. Applying the decision
(grade bump, compa reset, review dates) is slice #5's HR-approval transition. The profile
gains a real «История ревью» card.

## Scope

**In:**
- `self_assessments`, `performance_reviews`, `review_scores` tables; `review_status` +
  `review_decision` enums.
- `POST/GET /v1/members/{id}/reviews`, `PATCH/DELETE /v1/reviews/{id}`,
  `POST /v1/reviews/{id}/finalize`, `GET /v1/reviews/{id}/calibration`.
- `ReviewModal` wizard (4 steps, ~1040px) + entry button in `GradeHero` + «История ревью»
  card in the «Грейд» tab.
- Seed: self-assessment for Анна + two `final` historical reviews (ported from prototype
  `reviews.t1`).

**Out (deferred):**
- Applying the decision to `member_grades` (grade/compa/block levels/review dates) — #5
  (`pending → final` HR transition).
- HR approval UI, `hr_admin` gating, rejection flow — #5.
- Employee self-assessment submission UI — needs an employee portal; self-assessments are
  seed-only data in this slice.
- Addon tracks; manager-track reviews — same review flow regardless of `mgr_track`.
- Editing or deleting `pending`/`final` reviews.

## Decisions (locked)

1. **Self-assessment from seed** (user choice). Stored in its own table independent of
   reviews — «прислана сотрудником заранее». The review snapshots it at creation.
2. **Finalize → `pending`, grade untouched** (user choice). The footer copy «После сохранения
   решение уйдёт на согласование HR» becomes literally true. Slice #5 turns `pending` into
   `final` and applies the decision.
3. **Draft in DB with autosave** (user choice) — MeetingDrawer autosave pattern; closing the
   modal is always safe.
4. **Normalized model** (approach A): `review_scores` rows per block, mirroring
   `member_block_levels`; no JSONB.
5. **Server-side calibration endpoint** — peers of the same discipline + grade with
   pre-computed block-level averages; client would need N member queries otherwise.
6. **`final` exists in the enum now** — needed to seed review history; nothing in this slice
   sets it.
7. **One active review per member** — partial unique index on `member_id`
   `WHERE status IN ('draft','pending')`; `POST` is create-or-return-draft.
8. **Lead scores prefilled** from `member_block_levels` (fallback `grade_ord`), exactly like
   the prototype (`leadScores = {...gd.blockLevels}`).
9. **No extra seed members for calibration.** In the prototype Анна (frontend IC5) has no
   same-grade-same-discipline peers either — the distribution card shows her alone. Keeps
   the 8-member roster (teamlist e2e) intact.

## Data model

Migration `0007_performance_reviews.sql` (highest existing is `0006_grade_evidence`):

```sql
CREATE TYPE review_status   AS ENUM ('draft', 'pending', 'final');
CREATE TYPE review_decision AS ENUM ('hold', 'promote', 'pip');

CREATE TABLE self_assessments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  block_id     uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord    int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, block_id)
);

CREATE TABLE performance_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period         text NOT NULL,                  -- "H1 2026", computed from created_at
  status         review_status NOT NULL DEFAULT 'draft',
  from_grade_ord int  NOT NULL CHECK (from_grade_ord BETWEEN 1 AND 7),
  target_ord     int  CHECK (target_ord BETWEEN 1 AND 7),   -- snapshot of member_grades.target_ord
  decision       review_decision,                -- null until chosen
  to_grade_ord   int  CHECK (to_grade_ord BETWEEN 1 AND 7), -- set on finalize
  summary        text NOT NULL DEFAULT '',
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finalized_at   timestamptz
);

CREATE UNIQUE INDEX idx_reviews_one_active
  ON performance_reviews(member_id) WHERE status IN ('draft', 'pending');
CREATE INDEX idx_reviews_member ON performance_reviews(member_id, created_at DESC);

CREATE TABLE review_scores (
  review_id uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  block_id  uuid NOT NULL REFERENCES grade_blocks(id),
  self_ord  int CHECK (self_ord BETWEEN 1 AND 7),  -- snapshot; null = no self-assessment
  lead_ord  int NOT NULL CHECK (lead_ord BETWEEN 1 AND 7),
  PRIMARY KEY (review_id, block_id)
);
```

`period` derivation: month 1–6 → `H1 {year}`, month 7–12 → `H2 {year}`. No uniqueness on
period — an extra checkpoint within a half-year is allowed.

## API

All endpoints guard with `require_member_access` (review-scoped routes resolve `member_id`
from the review row first; 404 if no such review).

```
POST   /v1/members/{id}/reviews
  Create-or-return the active draft. If a draft exists → 200 with it. If a pending review
  exists → 409. Else create in one transaction:
    - from_grade_ord + target_ord from member_grades (404 if the member has no grade);
    - period from now();
    - review_scores: one row per discipline block;
        self_ord ← self_assessments (null if absent),
        lead_ord ← member_block_levels (fallback grade_ord).
  201 → Review

GET    /v1/members/{id}/reviews
  200 → Review[]  (ORDER BY created_at DESC; includes draft/pending/final — the client
  derives both the hero button state and the history card from this one list)

PATCH  /v1/reviews/{id}
  Autosave. 409 unless status = 'draft'.
  body: UpdateReview { scores?: [{block_id, lead_ord}], decision?, summary? }
  Partial: only provided fields change; scores upsert per block.
  200 → Review

POST   /v1/reviews/{id}/finalize
  409 unless status = 'draft'; 422 if decision is null.
  Sets status='pending', finalized_at=now(),
  to_grade_ord = decision=='promote' ? min(from_grade_ord+1, 7) : from_grade_ord.
  Does NOT touch member_grades.
  200 → Review

DELETE /v1/reviews/{id}
  Cancel a draft. 409 unless status = 'draft'. 204.

GET    /v1/reviews/{id}/calibration
  Peers: members with a member_grades row of the SAME discipline_id and grade_ord,
  excluding the reviewed member (workspace-wide — calibration crosses teams by design).
  avg computed server-side over blocks (member_block_levels fallback grade_ord).
  200 → CalibrationPeer[]
```

DTOs (bt-domain), enums read/written as text and cast via `$n::review_status` /
`status::text` (same pattern as `evidence_status`):

```rust
struct Review {
  id: Uuid,
  period: String,
  status: String,             // "draft" | "pending" | "final"
  from_grade_ord: i32,
  target_ord: Option<i32>,
  decision: Option<String>,   // "hold" | "promote" | "pip"
  to_grade_ord: Option<i32>,
  summary: String,
  created_at: String,         // ISO 8601
  finalized_at: Option<String>,
  scores: Vec<ReviewScore>,
}

struct ReviewScore {
  block_id: Uuid,
  block_key: String,
  block_name: String,
  self_ord: Option<i32>,
  lead_ord: i32,
}

struct UpdateReview {
  scores: Option<Vec<UpdateReviewScore>>,  // UpdateReviewScore { block_id, lead_ord }
  decision: Option<String>,
  summary: Option<String>,
}

struct CalibrationPeer {
  member_id: Uuid,
  name: String,
  hue: i32,
  avg: f64,            // mean block level
  target_ord: Option<i32>,
  compa: f64,
}
```

New `routes/reviews.rs`; the two member-scoped routes live alongside the existing
member routes registration. Register paths + schemas in `openapi.rs`; `pnpm gen:api`.

## Frontend

New query module `web/lib/query/reviews.ts`:
- `useMemberReviews(memberId)` — `["member-reviews", memberId]`.
- `useStartReview(memberId)` — POST mutation, returns the draft, invalidates the list.
- `useUpdateReview(memberId)` — PATCH, debounced by the caller; updates cache.
- `useFinalizeReview(memberId)` / `useDeleteReview(memberId)` — invalidate the list.
- `useReviewCalibration(reviewId)` — `["review-calibration", reviewId]`, fetched when the
  calibration step is first visible.

**Entry point — `GradeHero`** (profile «Грейд» tab). `GradeTab` loads `useMemberReviews`,
derives `activeReview` (status draft|pending) and passes state down:
- no active review → primary button «Открыть ревью» (starts via `useStartReview`, opens modal);
- draft → «Продолжить ревью» + small amber «черновик» pill;
- pending → amber pill «На согласовании HR» instead of a button;
- member without a grade → existing empty state, no button.

**Wizard — `web/components/review/`** (new directory):
- `ReviewModal.tsx` — own scrim + wide card (~1040px, NOT the 460px `Modal`); header with
  avatar, «Performance Review · {name}», meta line (period · discipline · grade); the
  4-step rail (steps clickable, completed get a check); body renders the current step;
  footer = contextual hint (per-step copy from the prototype) + Назад / Далее /
  «Завершить ревью». Esc/scrim close is safe — the draft is in the DB. A ghost
  «Удалить черновик» (with confirm) in the footer of step 1.
- `ReviewPrep.tsx` — three stat cards (grade→target / «{ready_months} мес стабильного
  проявления L+1» / «{n} свидетельств из 1-2-1»); self-assessment card (per-block chips, or
  empty state «Самооценка не получена» when all `self_ord` are null); evidence summary list
  (reuses data from `useMemberEvidence`).
- `ReviewAssess.tsx` — per block: name + evidence count, mismatch pill
  (расхождение ±N / совпадает), the IC1–IC7 scale with ○ self / ● lead markers and target
  highlight, matrix text of the selected level (`useGradesFramework`). Clicking a level
  updates local state and schedules autosave.
- `ReviewCalibrate.tsx` — info banner, distribution card: bars by `avg` (peers from
  `useReviewCalibration`, the reviewed member computed live from current lead scores,
  highlighted, sorted desc), target pills; verdict card (avg vs target copy from the
  prototype). No peers → only the reviewed member's row + «Других сотрудников этого грейда
  в дисциплине пока нет».
- `ReviewDecision.tsx` — three decision cards (Сохранить IC{n} / Повысить до IC{n+1},
  capped at 7 / План улучшения (PIP)); promote → «Влияние на вилку» compa before/after;
  pip → focus-plan checklist of blocks below grade; summary textarea + shield note
  «Сотрудник увидит резюме и финальное решение после согласования с HR».

Wizard state: current step is local; lead scores / decision / summary initialize from the
fetched draft and autosave via debounced PATCH (~600ms, MeetingDrawer pattern) with a
«Сохранено» indicator in the header. Finalize → invalidate `["member-reviews"]` →
close modal → hero shows the pending pill.

**Profile — «История ревью»**: new `web/components/grades/ReviewHistory.tsx` in the right
column of `GradeTab` under `CompaBand`. Rows: period · `IC{from}→IC{to}` · decision label ·
date; `pending` rows get an amber «на согласовании» pill; empty state «Ревью ещё не
проводились». Source: the same `useMemberReviews` list (status pending|final).

Styling: Tailwind with existing ink/brand tokens (amber = `brand`, never `accent`),
`tabular-nums` on level codes and averages, Russian microcopy verbatim from the prototype.

## Seed

In `seed.rs` after evidence (idempotent like the rest):
- `self_assessments` for Анна — deterministic, slightly optimistic vs her block levels
  `[6,5,5,4,6,5]`: stack 6, core 6 (+1), arch 6 (+1), infra 4, ai 6, impact 5;
  `submitted_at` ≈ now − 20 days. Gives the assess step both «совпадает» and
  «расхождение +1» states.
- Two `final` reviews for Анна (ported from prototype `reviews.t1`, dates tied to slice-#2
  offsets so the hero's «Прошлое ревью» matches the newest history row):
  1. hold IC5→IC5, `finalized_at` = now − 45d (= her `last_review`), period derived from
     that date, summary «Уверенный IC5. Зафиксированы первые проявления IC6 в архитектуре…»;
  2. promote IC4→IC5, `finalized_at` ≈ now − 225d, summary «Повышение до IC5 (Senior).
     Стабильно проявляла senior-компетенции 6 месяцев…».
  Historical reviews carry no `review_scores` rows — the history card doesn't need them.
- No active (draft/pending) review in seed — the flow is exercised by hand / e2e.
- Seed asserts: self-assessment row count for Анна; 2 final reviews.

Re-seed the dev DB after seed changes (TRUNCATE workspaces CASCADE + restart API).

## Edge cases

- `PATCH` / `finalize` / `DELETE` on a non-draft → 409; `finalize` without decision → 422.
- Concurrent `POST` races are caught by the partial unique index → return the existing draft.
- `POST` for a member without `member_grades` → 404 (the UI never offers the button).
- No self-assessment → prep shows the empty state; assess scales render without ○ markers.
- No calibration peers → single-row distribution + explanatory caption.
- IC7 member: the «Повысить» card is hidden (nothing above IC7); the server caps
  `to_grade_ord` at 7 regardless (`min(from+1, 7)`).
- Deleting the draft returns the hero to «Открыть ревью».

## Testing

- **bt-api** (`mod tests` in `routes/reviews.rs`, `#[sqlx::test]` + `oneshot`, pattern of
  `evidence.rs`): POST creates a draft with prefilled scores (self snapshot + lead from
  block levels); second POST returns the same draft (200, same id); POST with pending → 409;
  POST for ungraded member → 404; PATCH upserts scores/decision/summary and 409s on pending;
  finalize 422 without decision, sets pending + to_grade (promote = +1, hold/pip = same),
  member_grades unchanged; DELETE only drafts; calibration returns same-discipline-same-grade
  peers with correct avg; all endpoints 403 for a foreign lead.
- **web unit** (Vitest, pattern of `EvidenceViews.test.tsx`): step components are
  presentational — assess renders mismatch pills and fires score changes; decision shows
  compa impact on promote and focus plan on pip; prep renders the no-self-assessment empty
  state; `ReviewHistory` renders rows + pending pill + empty state.
- **e2e** (`web/e2e/review.spec.ts`): Анна's profile → «Грейд» → «Открыть ревью» → step 1
  shows self-assessment → step 2 change a block score → step 3 calibration card → step 4
  choose «Повысить», type a summary → «Завершить ревью» → hero shows «На согласовании HR»
  and «История ревью» gains a pending row. Second scenario: start a draft, change a score,
  close the modal, reopen via «Продолжить ревью» → the score survived.

## Out-of-scope hooks for later slices

- Slice #5 (HR admin): `pending → final` transition applies the decision — bump
  `member_grades.grade_ord`, copy `review_scores.lead_ord` into `member_block_levels`,
  reset `compa` to the low band, set `last_review`/`next_review` (+6 мес); plus rejection
  back to draft. The `final` enum value, `to_grade_ord` and the one-active-review index
  already support this.
- Employee portal: a submission UI writing to `self_assessments` (the unique key makes
  resubmission an upsert).
