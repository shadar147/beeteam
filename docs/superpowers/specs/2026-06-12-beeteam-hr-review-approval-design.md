# BeeTeam — RBAC + HR Review Approval (slice #5a)

**Status:** Design approved
**Date:** 2026-06-12
**Depends on:** Performance Review flow (#4) — `performance_reviews` with `pending` status,
`to_grade_ord`, the one-active-review partial index, `Review` DTO, lead wizard; Member Grades
(#2) — `member_grades` / `member_block_levels`; Grades Foundation (#1) — disciplines/levels.

## Goal

Close the loop opened by slice #4: a typed RBAC layer (permissions in code, role→permission
matrix, guard, permissions in `/auth/me`) and the HR approval flow — an hr_admin reviews
pending performance reviews on a new «Согласование» screen and either **approves** (the
decision is finally applied to `member_grades`) or **returns to the lead** with a mandatory
comment (review goes back to `draft`).

**Slice #5 decomposition (user choice):** 5a = RBAC + HR review approval (THIS SPEC);
5b = matrix editor + exact salary bands (own spec→plan→slice, uses `EditFramework`/
`EditSalaryBands` permissions declared here).

## Scope

**In:**
- `Permission` enum + `permissions_of(role)` matrix in bt-domain; `require_permission` guard
  in bt-api; `permissions` in `/v1/auth/me` and login responses.
- Migration: `hr_comment`, `resolved_at`, `resolved_by` on `performance_reviews`.
- `GET /v1/reviews/pending`, `POST /v1/reviews/{id}/approve`, `POST /v1/reviews/{id}/reject`.
- «Согласование» screen at `/approvals` (queue + detail + approve/reject actions),
  permission-driven sidebar (HR sees Согласование + Грейды; lead items hidden for HR),
  HR login redirect, «Недостаточно прав» guard screen.
- Lead-side return visibility: «Возвращено HR» banner in `ReviewModal`, «возвращено HR» pill
  in `GradeHero`, `resolved_at` date in «История ревью».
- Seed: HR user Ольга Климова + one pending review for Игорь Петров.

**Out (deferred):**
- Matrix/levels/discipline editor, exact salary-band numbers and editing — **5b**.
- HR access to member profiles (`require_member_access` is untouched; HR works only through
  the approvals endpoints).
- DB-driven roles/permissions tables, role-management UI (permissions matrix lives in code —
  user choice).
- Notifications (the lead discovers a return via the profile; no email/in-app notify).
- Employee portal, self-assessment submission.

## Decisions (locked)

1. **Approach B — RBAC layer** (user choice: «много планов на проект»), variant **typed in
   code** (user choice): `Permission` enum + static role→permissions matrix in bt-domain,
   compiler-checked; no DB tables until a role-editing UI exists.
2. **Frontend never branches on role — only on permissions** from `/auth/me`. New roles or
   re-assignment of permissions touch zero components.
3. **Lead access stays ownership-based.** `require_member_access` (team lead relation) is not
   a permission and is not modified. Permissions are for workspace-global capabilities.
4. **HR works on a dedicated screen** (user choice): `/approvals` queue, not via member
   profiles.
5. **Reject requires a non-empty comment** (user choice) — stored as `hr_comment` on the
   review, shown to the lead in the wizard while the review is a draft.
6. **Approve applies lead scores to `member_block_levels` for ANY decision** (hold/pip too):
   an approved review is the new official per-block picture. Grade/compa/target change only
   on `promote`.
7. **Concurrency-safe transitions:** approve/reject use conditional
   `UPDATE … WHERE status = 'pending'`; 0 rows affected → 409.
8. **`finalized_at` vs `resolved_at`:** `finalized_at` = when the lead submitted (set by
   finalize, cleared on reject); `resolved_at`/`resolved_by` = when/which HR decided (set by
   approve only). History rows for `final` show `resolved_at ?? finalized_at`.
9. **Declared now, used in 5b:** `EditFramework`, `EditSalaryBands` permission variants exist
   from this slice so 5b only adds guards, not plumbing.

## RBAC layer

bt-domain:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    ManageTeam,       // 5a: lead workspace UI (Команда/Календарь/профили sidebar section)
    ApproveReviews,   // 5a: pending queue, approve/reject
    EditFramework,    // 5b: matrix/levels/discipline editor
    EditSalaryBands,  // 5b: exact band numbers
}

pub fn permissions_of(role: &str) -> &'static [Permission] {
    match role {
        "lead" => &[Permission::ManageTeam],
        "hr_admin" => &[
            Permission::ApproveReviews,
            Permission::EditFramework,
            Permission::EditSalaryBands,
        ],
        _ => &[], // employee: no workspace-global capabilities yet
    }
}
```

`ManageTeam` drives UI visibility only; actual data access for leads remains the ownership
guard `require_member_access` (decision 3). No backend endpoint requires `ManageTeam` in
this slice.

bt-api (style of `require_member_access`):

```rust
pub fn require_permission(auth: &AuthUser, p: Permission) -> AppResult<()> {
    if bt_domain::permissions_of(&auth.role).contains(&p) { Ok(()) } else { Err(AppError::Forbidden) }
}
```

`MeResponse`/`LoginResponse` user payload gains `permissions: Vec<Permission>` (computed via
`permissions_of`, never stored). Regenerate web types.

Frontend: `usePermissions()` derives from the existing me/session query;
`can("approve_reviews")` helper. Sidebar items and route guards consume permissions only.

## Data model

Migration `0008_review_approval.sql` (highest existing is `0007_performance_reviews`):

```sql
ALTER TABLE performance_reviews
  ADD COLUMN hr_comment  text NOT NULL DEFAULT '',
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES users(id);
```

`Review` DTO gains `hr_comment: String`, `resolved_at: Option<String>`.

## API

All three endpoints guard with `require_permission(ApproveReviews)` (403 for leads).

```
GET  /v1/reviews/pending
  Workspace-wide queue, ORDER BY finalized_at ASC (oldest first).
  200 → PendingReview[]:
    struct PendingReview {
      review: Review,            // full, with scores — no separate detail call
      member_id: Uuid,
      member_name: String,
      member_hue: i32,
      team_name: String,
      discipline_label: String,
    }

POST /v1/reviews/{id}/approve
  404 unknown id; 409 unless status = 'pending' (conditional UPDATE).
  One transaction:
    - performance_reviews: status='final', resolved_at=now(), resolved_by=auth.id;
    - member_block_levels.level_ord ← review_scores.lead_ord (upsert per block) — any decision;
    - if decision='promote': member_grades.grade_ord = to_grade_ord, compa = 0.22,
      and target_ord = NULL when to_grade_ord >= target_ord;
    - member_grades.last_review = today, next_review = today + 6 months — any decision.
  200 → Review

POST /v1/reviews/{id}/reject
  body: RejectReview { comment: String } — 400 if comment.trim() is empty.
  404 unknown id; 409 unless status = 'pending' (conditional UPDATE).
  Sets status='draft', hr_comment=comment, finalized_at=NULL, to_grade_ord=NULL.
  resolved_* stay NULL. 200 → Review
```

Re-finalize after a return is the ordinary slice-#4 finalize (status is `draft` again);
`hr_comment` persists in the row (overwritten by the next reject) but the UI only surfaces it
while the review is a draft.

New `routes/approvals.rs` (keeps `reviews.rs` lead-scoped); register paths + `PendingReview`,
`RejectReview`, `Permission` schemas in `openapi.rs`.

## Frontend

**`/approvals` — «Согласование»** (new route in `(app)`):
- Left: queue cards — avatar, name, «{team} · {discipline}», `IC4 → IC5`, decision pill
  (повышение / грейд подтверждён / план улучшения), submitted date. First item auto-selected.
  Empty state: «Нет ревью на согласовании».
- Right: detail panel for the selected review — header (member, period, lead decision),
  read-only per-block scores `ScoresReadonly` (○ self vs ● lead, mismatch pills — visual
  language of `ReviewAssess`, no interactivity; «Самооценка не получена» note when all
  self_ord are null), lead summary, mini band-impact block when decision = promote.
- Actions: **«Согласовать»** — confirm dialog listing the effects («IC4 → IC5 · compa в низ
  новой полосы · следующее ревью через 6 мес» / for hold-pip: «уровни по блокам обновятся ·
  следующее ревью через 6 мес»); **«Вернуть лиду»** — modal with a required textarea, submit
  disabled while empty. After either action: invalidate queue, select the next item.

**Sidebar & routing:**
- Every sidebar item declares `requires: Permission | null`: lead items (Команда, Календарь,
  …) require `manage_team`, «Согласование» requires `approve_reviews` (badge = pending count
  from the same queue query; hidden at 0), «Грейды» requires nothing. HR therefore sees
  Грейды + Согласование; the lead sees the current set (no Согласование). No role checks on
  the frontend — permissions only.
- Login redirect: `approve_reviews` without `manage_team` → `/approvals`, otherwise `/`.
- Direct navigation without the required permission → «Недостаточно прав» screen (no crash).

**Lead-side return visibility:**
- `ReviewModal`: when `review.status === "draft"` and `hr_comment` non-empty — amber banner
  at the top of the body: «Возвращено HR: {comment}».
- `GradeHero`: draft with non-empty `hr_comment` → pill text «возвращено HR» (else «черновик»).
- `ReviewHistory`: `final` rows show `resolved_at ?? finalized_at` as the date.

**Hooks `web/lib/query/approvals.ts`:** `usePendingReviews()` (`["pending-reviews"]`),
`useApproveReview()`, `useRejectReview()` — both mutations invalidate `["pending-reviews"]`
and `["member-reviews"]`.

## Seed

- Second user: «Ольга Климова», `o.klimova@beeteam.io` / `demo1234`, role `hr_admin`
  (hue distinct from the lead's).
- One pending review for Игорь Петров (backend, IC4 → target IC5, decision `promote`):
  lead scores = his block levels with a couple of +1 bumps, `self_ord = NULL` for all blocks
  (Игорь has no seeded self-assessment — the HR detail panel demonstrates that state),
  a short lead summary, `finalized_at = now − 2 days`, created_by = the lead.
- Анна is untouched (her flow is exercised manually/e2e via the wizard).
- Seed asserts: 2 users; exactly 1 pending review.
- Plan must verify existing e2e suites stay green (Игорь's hero now shows «На согласовании
  HR»; current specs don't assert his «Грейд» tab, but confirm).

## Edge cases

- approve/reject on a non-pending review → 409 via conditional UPDATE (double-action safe).
- reject with empty/whitespace comment → 400.
- Lead calling HR endpoints → 403; HR navigating to lead-only frontend routes → «Недостаточно
  прав» screen.
- Badge hidden at 0 pending; sidebar item remains.
- `to_grade_ord` is always set for `pending` rows (finalize guarantees it); approve relies on
  this — no legacy NULL data exists.
- Re-finalize after return: banner disappears once status leaves `draft`; comment stays in
  the row as history until the next reject.

## Testing

- **bt-domain**: unit test for the `permissions_of` matrix.
- **bt-api** (`routes/approvals.rs` `mod tests`, pattern of reviews.rs): pending queue — HR
  200 with Игорь's review + member context, lead 403; approve-promote — status final,
  resolved_* set, grade_ord 4→5, block levels = lead scores, compa 0.22, target NULL,
  last/next review updated; approve-hold (build via Анна's wizard endpoints) — block levels
  copied, grade/compa/target untouched; reject — 400 empty comment, then draft +
  `hr_comment` + `finalized_at`/`to_grade_ord` NULL; second approve/reject → 409; lead's
  `GET /members/{id}/reviews` exposes `hr_comment`.
- **web unit** (Vitest): sidebar permission filtering (lead vs hr sets); queue card + detail
  render incl. «Самооценка не получена»; reject modal disabled-until-text; ReviewModal
  «Возвращено HR» banner; GradeHero «возвращено HR» pill.
- **e2e `approvals.spec.ts`** (serial, fresh seed): ① HR login → Игорь in the queue → return
  with a comment → queue empty; ② lead login → Игорь's profile → «Продолжить ревью» +
  banner → re-finalize; ③ HR login → approve → lead sees Игорь at IC5.

## Out-of-scope hooks for later slices

- **5b (matrix editor + bands):** guards `EditFramework`/`EditSalaryBands` already exist;
  the editor adds framework CRUD endpoints under them and an HR band view with exact
  `band_low/mid/high` numbers (already in `grade_levels`).
- `resolved_by` enables future audit/«кто согласовал» display.
- The permission matrix is the single place to grow roles (e.g. a future `employee` portal
  permission set).
