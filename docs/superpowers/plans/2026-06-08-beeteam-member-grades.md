# Member Grades & Profile «Грейд» tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only «Грейд» tab to a team member's profile showing their assigned grade, discipline, promotion target with readiness, per-block profile, growth checklist, and band position.

**Architecture:** Two new normalized tables (`member_grades` + `member_block_levels`) seeded for the demo team's engineers. One read-only endpoint `GET /v1/members/{id}/grade` returns member-specific data only; the frontend joins it with the already-cached `framework` (#1) by discipline/block keys. The tab is composed of small pure presentational components; the orchestrator handles the two queries and empty/loading/error states.

**Tech Stack:** Rust (axum, sqlx, utoipa) · Postgres · Next.js 14 (App Router, TanStack Query, openapi-fetch) · Vitest + Testing Library · Playwright.

**Spec:** `docs/superpowers/specs/2026-06-08-beeteam-member-grades-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `api/crates/bt-db/migrations/0005_member_grades.sql` | `member_grades` + `member_block_levels` tables | Create |
| `api/crates/bt-db/src/seed.rs` | Seed 6 engineers' grades + block levels; seed test | Modify |
| `api/crates/bt-domain/src/lib.rs` | `MemberGrade`, `BlockLevel` DTOs | Modify |
| `api/crates/bt-api/src/routes/members.rs` | `get_member_grade` handler + tests | Modify |
| `api/crates/bt-api/src/app.rs` | mount `/v1/members/:id/grade` | Modify |
| `api/crates/bt-api/src/openapi.rs` | register path + schemas | Modify |
| `web/lib/api/schema.d.ts` | regenerated types | Regen |
| `web/lib/query/member-grade.ts` | `useMemberGrade(id)` hook + type re-exports | Create |
| `web/components/grades/GradeChip.tsx` | add `xl` size | Modify |
| `web/components/grades/GradeHero.tsx` | hero: chip + discipline + target/readiness + dates | Create |
| `web/components/grades/BlockProfile.tsx` | per-block segmented tracks + marker + legend | Create |
| `web/components/grades/GrowChecklist.tsx` | «что показать для цели» list | Create |
| `web/components/grades/CompaBand.tsx` | schematic band + position marker | Create |
| `web/components/grades/EvidencePlaceholder.tsx` | empty «Свидетельства из 1-2-1» section | Create |
| `web/components/grades/GradeEmptyState.tsx` | «Грейд не назначен» empty state | Create |
| `web/app/(app)/profile/[id]/GradeTab.tsx` | orchestrator: 2 queries + states + layout | Create |
| `web/app/(app)/profile/[id]/page.tsx` | add «Грейд» tab | Modify |
| `web/components/__tests__/MemberGradeViews.test.tsx` | unit tests for pure components | Create |
| `web/e2e/member-grade.spec.ts` | e2e for the tab | Create |

---

### Task 1: Migration — member grade tables

**Files:**
- Create: `api/crates/bt-db/migrations/0005_member_grades.sql`

- [ ] **Step 1: Write the migration**

`api/crates/bt-db/migrations/0005_member_grades.sql`:

```sql
-- Per-member grade assignment (slice #2). One grade per member.
CREATE TABLE member_grades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL UNIQUE REFERENCES team_members(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES disciplines(id),
  grade_ord     int  NOT NULL CHECK (grade_ord BETWEEN 1 AND 7),
  target_ord    int  CHECK (target_ord BETWEEN 1 AND 7),
  compa         double precision NOT NULL DEFAULT 0.5,
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

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `cd api && cargo test -p bt-db seed_is_idempotent_and_loads_team -- --nocapture`
Expected: PASS (the test harness applies every migration including `0005` before running; a SQL error would fail it).

- [ ] **Step 3: Commit**

```bash
git add api/crates/bt-db/migrations/0005_member_grades.sql
git commit -m "feat(db): member_grades + member_block_levels tables (slice #2)"
```

---

### Task 2: Seed member grades

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs` (insert before `tx.commit()`, after the disciplines loop; add a seed test in the `tests` module)

**Context:** `seed_demo` runs in a single transaction `tx` and commits at the end. The disciplines/blocks loop runs just before `tx.commit().await?;` (see the loop `for (d_ord, disc) in [backend, frontend, mobile, qa, devops]...`). Insert the member-grade seed **after that loop and before `tx.commit()`**. Block keys are identical across disciplines: `stack`, `core`, `arch`, `infra`, `ai`, `impact`. The 8 seeded members include 6 engineers (graded) and 2 non-engineers — Дмитрий Кузнецов (Product Designer) and Елена Воронцова (Project Manager) — left ungraded to exercise the empty state.

- [ ] **Step 1: Write the failing seed test**

Add to the `#[cfg(test)] mod tests` block in `api/crates/bt-db/src/seed.rs`:

```rust
    #[sqlx::test(migrations = "./migrations")]
    async fn seed_loads_member_grades(pool: PgPool) {
        seed_demo(&pool).await.unwrap();

        let grades: (i64,) = sqlx::query_as("SELECT count(*) FROM member_grades")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(grades.0, 6, "6 engineers graded");

        let levels: (i64,) = sqlx::query_as("SELECT count(*) FROM member_block_levels")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(levels.0, 36, "6 members × 6 blocks");

        // every graded member has block levels == its discipline's block count (6)
        let mismatched: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM member_grades mg \
             WHERE (SELECT count(*) FROM member_block_levels mbl WHERE mbl.member_grade_id = mg.id) \
                <> (SELECT count(*) FROM grade_blocks gb WHERE gb.discipline_id = mg.discipline_id)",
        )
        .fetch_one(&pool).await.unwrap();
        assert_eq!(mismatched.0, 0, "block-level count matches discipline blocks");

        // non-engineers are ungraded
        let designer: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM member_grades mg \
             JOIN team_members tm ON tm.id = mg.member_id \
             WHERE tm.name = 'Дмитрий Кузнецов'",
        )
        .fetch_one(&pool).await.unwrap();
        assert_eq!(designer.0, 0, "designer has no grade");
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && cargo test -p bt-db seed_loads_member_grades`
Expected: FAIL (`assert_eq!(grades.0, 6)` — 0 rows, seed not written yet).

- [ ] **Step 3: Write the seed insertion**

In `api/crates/bt-db/src/seed.rs`, immediately **before** `tx.commit().await?;` (the final one in `seed_demo`), insert:

```rust
    // ── Member grades (slice #2): 6 engineers graded; designer + PM left ungraded ──
    // (member_name, discipline_key, grade, target?, compa, ready_months, mgr,
    //  next_review_offset_days, last_review_offset_days?, [stack,core,arch,infra,ai,impact])
    type MG = (&'static str, &'static str, i32, Option<i32>, f64, i32, bool, i64, Option<i64>, [i32; 6]);
    let member_grades: [MG; 6] = [
        ("Анна Лебедева",     "frontend", 5, Some(6), 0.62, 4, false,  30, Some(-45), [6, 5, 5, 4, 6, 5]),
        ("Игорь Петров",      "backend",  4, Some(5), 0.48, 2, false,  12, Some(-20), [4, 5, 4, 4, 3, 3]),
        ("Мария Соколова",    "qa",       5, None,    0.55, 0, true,   22, Some(-14), [5, 6, 5, 4, 4, 6]),
        ("Тимур Хасанов",     "frontend", 2, Some(3), 0.35, 2, false,  21, None,      [3, 3, 2, 2, 3, 2]),
        ("Светлана Морозова", "devops",   4, None,    0.52, 0, false,   5, Some(-30), [5, 4, 4, 6, 4, 4]),
        ("Алексей Романов",   "backend",  3, Some(4), 0.58, 3, false,  27, Some(-60), [4, 3, 3, 3, 4, 3]),
    ];
    const BLOCK_KEYS: [&str; 6] = ["stack", "core", "arch", "infra", "ai", "impact"];
    for mg in member_grades.iter() {
        let member: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM team_members WHERE name = $1 AND team_id = $2")
                .bind(mg.0).bind(team_id)
                .fetch_one(&mut *tx).await?;
        let disc: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM disciplines WHERE key = $1 AND workspace_id = $2")
                .bind(mg.1).bind(ws_id)
                .fetch_one(&mut *tx).await?;
        let next_review = (now + day * mg.7 as i32).date_naive();
        let last_review = mg.8.map(|d| (now + day * d as i32).date_naive());
        let grow: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO member_grades \
             (member_id, discipline_id, grade_ord, target_ord, compa, ready_months, mgr_track, next_review, last_review) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        )
        .bind(member.0).bind(disc.0).bind(mg.2).bind(mg.3).bind(mg.4)
        .bind(mg.5).bind(mg.6).bind(next_review).bind(last_review)
        .fetch_one(&mut *tx).await?;
        for (i, bkey) in BLOCK_KEYS.iter().enumerate() {
            let block: (uuid::Uuid,) =
                sqlx::query_as("SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2")
                    .bind(*bkey).bind(disc.0)
                    .fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO member_block_levels (member_grade_id, block_id, level_ord) VALUES ($1,$2,$3)",
            )
            .bind(grow.0).bind(block.0).bind(mg.9[i])
            .execute(&mut *tx).await?;
        }
    }
```

(`now` and `day` are already defined earlier in `seed_demo`: `let now = chrono::Utc::now();` and `let day = chrono::Duration::days(1);`.)

- [ ] **Step 4: Run the seed test to verify it passes**

Run: `cd api && cargo test -p bt-db seed_loads_member_grades`
Expected: PASS

- [ ] **Step 5: Run the full bt-db suite (idempotency unaffected)**

Run: `cd api && cargo test -p bt-db`
Expected: PASS (all tests, including `seed_is_idempotent_and_loads_team`).

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-db/src/seed.rs
git commit -m "feat(seed): assign grades to the demo team's engineers (slice #2)"
```

---

### Task 3: Domain DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`

**Context:** Existing grade DTOs (`GradeLevel`, `MatrixCell`, etc.) live here, each deriving `Serialize, Deserialize, ToSchema`. Follow that exact pattern.

- [ ] **Step 1: Add the DTOs**

Append to `api/crates/bt-domain/src/lib.rs` (near the other grade DTOs):

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct BlockLevel {
    pub block_key: String,
    pub level_ord: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct MemberGrade {
    pub discipline_key: String,
    pub grade_ord: i32,
    pub target_ord: Option<i32>,
    pub compa: f64,
    pub ready_months: i32,
    pub mgr_track: bool,
    pub next_review: Option<String>,
    pub last_review: Option<String>,
    pub block_levels: Vec<BlockLevel>,
}
```

(If the existing DTOs in this file use bare `Serialize`/`Deserialize`/`ToSchema` via `use` imports rather than fully-qualified paths, match that style — check the top of the file and drop the `serde::`/`utoipa::` prefixes accordingly.)

- [ ] **Step 2: Verify it compiles**

Run: `cd api && cargo build -p bt-domain`
Expected: success, no errors.

- [ ] **Step 3: Commit**

```bash
git add api/crates/bt-domain/src/lib.rs
git commit -m "feat(domain): MemberGrade + BlockLevel DTOs (slice #2)"
```

---

### Task 4: API handler + route

**Files:**
- Modify: `api/crates/bt-api/src/routes/members.rs` (add handler + tests)
- Modify: `api/crates/bt-api/src/app.rs` (mount route)

**Context:** `require_member_access(&auth, member_id, &state.pool)` returns `Err(AppError::Forbidden)` for a member not on the caller's team. The handler resolves the workspace implicitly through that gate. Return `Json<Option<MemberGrade>>` — axum serializes `None` as JSON `null` with status 200. The existing tests in this file use the `app(pool)` / `login_token` helpers (mirrored from `grades.rs`); reuse the ones already present in `members.rs`'s test module (check it has them — if not, copy from `routes/grades.rs`).

- [ ] **Step 1: Write the handler**

Add to `api/crates/bt-api/src/routes/members.rs` (import `MemberGrade, BlockLevel` in the top `use bt_domain::{...}` line):

```rust
#[utoipa::path(
    get,
    path = "/v1/members/{id}/grade",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "Member grade, or null if unassigned", body = MemberGrade),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn get_member_grade(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Option<MemberGrade>>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let row: Option<(
        String, i32, Option<i32>, f64, i32, bool,
        Option<chrono::NaiveDate>, Option<chrono::NaiveDate>, Uuid,
    )> = sqlx::query_as(
        "SELECT d.key, mg.grade_ord, mg.target_ord, mg.compa, mg.ready_months, mg.mgr_track, \
                mg.next_review, mg.last_review, mg.id \
         FROM member_grades mg \
         JOIN disciplines d ON d.id = mg.discipline_id \
         WHERE mg.member_id = $1",
    )
    .bind(member_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(r) = row else { return Ok(Json(None)) };

    let block_levels: Vec<BlockLevel> = sqlx::query_as::<_, (String, i32)>(
        "SELECT gb.key, mbl.level_ord \
         FROM member_block_levels mbl \
         JOIN grade_blocks gb ON gb.id = mbl.block_id \
         WHERE mbl.member_grade_id = $1 \
         ORDER BY gb.ord",
    )
    .bind(r.8)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|(block_key, level_ord)| BlockLevel { block_key, level_ord })
    .collect();

    Ok(Json(Some(MemberGrade {
        discipline_key: r.0,
        grade_ord: r.1,
        target_ord: r.2,
        compa: r.3,
        ready_months: r.4,
        mgr_track: r.5,
        next_review: r.6.map(|d| d.to_string()),
        last_review: r.7.map(|d| d.to_string()),
        block_levels,
    })))
}
```

- [ ] **Step 2: Mount the route**

In `api/crates/bt-api/src/app.rs`, after the `/v1/members/:id/files` route (line ~43):

```rust
        .route("/v1/members/:id/grade", get(routes::members::get_member_grade))
```

- [ ] **Step 3: Write the failing handler tests**

Add to the `#[cfg(test)] mod tests` block in `members.rs`. If the module lacks `app`/`login_token` helpers, copy them verbatim from `routes/grades.rs`'s test module first.

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_returns_assigned(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        // Игорь Петров — backend, grade 4, target 5
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["discipline_key"], "backend");
        assert_eq!(json["grade_ord"], 4);
        assert_eq!(json["target_ord"], 5);
        assert_eq!(json["block_levels"].as_array().unwrap().len(), 6);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_null_when_unassigned(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        // Дмитрий Кузнецов — Product Designer, no grade
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Дмитрий Кузнецов'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        assert!(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap().is_null());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_forbidden_for_foreign_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET")
                .uri(format!("/v1/members/{}/grade", uuid::Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_requires_auth(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
```

- [ ] **Step 4: Run the handler tests**

Run: `cd api && cargo test -p bt-api member_grade`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-api/src/routes/members.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/members/:id/grade read-only endpoint (slice #2)"
```

---

### Task 5: Register OpenAPI + regen types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`
- Regen: `web/lib/api/schema.d.ts`

**Context:** `openapi.rs` has a `paths(...)` list and a `components(schemas(...))` list. Add the new path and the two schemas there, matching how `get_framework` / `GradesFramework` were registered.

- [ ] **Step 1: Register the path and schemas**

In `api/crates/bt-api/src/openapi.rs`:
- add `crate::routes::members::get_member_grade,` to the `paths(...)` macro list;
- add `bt_domain::MemberGrade, bt_domain::BlockLevel,` to the `components(schemas(...))` list.

- [ ] **Step 2: Verify the API builds and openapi.json includes the path**

Run: `cd api && cargo build -p bt-api`
Expected: success.

- [ ] **Step 3: Regenerate the typed client**

Run: `cd web && pnpm gen:api`
Expected: `web/lib/api/schema.d.ts` updated — it now contains `MemberGrade`, `BlockLevel`, and a `/v1/members/{id}/grade` path.

Verify: `grep -c "MemberGrade" web/lib/api/schema.d.ts` returns a non-zero count.

- [ ] **Step 4: Commit (verify HEAD actually advanced)**

```bash
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register member-grade path + regen web types (slice #2)"
git log --oneline -1   # confirm this commit is HEAD; if schema.d.ts still shows as modified, re-run git add + commit
```

---

### Task 6: Query hook + GradeChip xl

**Files:**
- Create: `web/lib/query/member-grade.ts`
- Modify: `web/components/grades/GradeChip.tsx`

- [ ] **Step 1: Write the query hook**

`web/lib/query/member-grade.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type MemberGrade = components["schemas"]["MemberGrade"];
export type BlockLevel = components["schemas"]["BlockLevel"];

export function useMemberGrade(id: string) {
  return useQuery<MemberGrade | null>({
    queryKey: ["member-grade", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/grade", { params: { path: { id } } });
      if (error) throw error;
      return data ?? null;
    },
  });
}
```

- [ ] **Step 2: Add the `xl` size to GradeChip**

In `web/components/grades/GradeChip.tsx`, widen the `size` prop and add the variant. Change the signature `size = "md"` type to `"sm" | "md" | "xl"` and extend the size class ternary:

```tsx
        size === "xl"
          ? "h-14 min-w-[64px] rounded-2xl px-3 text-[22px]"
          : size === "sm"
            ? "h-5 min-w-[30px] px-1.5 text-[10.5px]"
            : "h-[26px] min-w-[38px] px-2 text-[12.5px]",
```

- [ ] **Step 3: Verify types compile**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/lib/query/member-grade.ts web/components/grades/GradeChip.tsx
git commit -m "feat(web): useMemberGrade hook + GradeChip xl size (slice #2)"
```

---

### Task 7: Presentational components + unit tests

**Files:**
- Create: `web/components/grades/GradeHero.tsx`, `BlockProfile.tsx`, `GrowChecklist.tsx`, `CompaBand.tsx`, `EvidencePlaceholder.tsx`, `GradeEmptyState.tsx`
- Create: `web/components/__tests__/MemberGradeViews.test.tsx`

**Context:** All six are pure presentational components (no hooks), so they unit-test directly like `#1`'s `GradeViews.test.tsx`. Use project tokens (`brand`, `bg-tint`, ink scale). The segment logic is ported from prototype `grade-profile.jsx`.

- [ ] **Step 1: Write the failing unit tests**

`web/components/__tests__/MemberGradeViews.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BlockProfile } from "../grades/BlockProfile";
import { CompaBand } from "../grades/CompaBand";
import { GradeEmptyState } from "../grades/GradeEmptyState";

describe("Member grade views", () => {
  it("BlockProfile marks above-grade, target and mastered segments", () => {
    // grade 4, target 5; block at level 5 → seg5 is above-grade (n>grade, n<=cur)
    render(
      <BlockProfile
        gradeOrd={4}
        targetOrd={5}
        levelCount={7}
        blocks={[{ name: "Базы данных", cur: 5 }]}
      />,
    );
    const ahead = document.querySelectorAll('[data-seg="ahead"]');
    const target = document.querySelectorAll('[data-seg="target"]');
    const fill = document.querySelectorAll('[data-seg="fill"]');
    expect(ahead.length).toBe(1);   // level 5 only
    expect(fill.length).toBe(4);    // levels 1–4
    expect(target.length).toBe(0);  // cur already reaches target
    expect(screen.getByText("Базы данных")).toBeInTheDocument();
  });

  it("BlockProfile shows a target gap when below target", () => {
    // grade 2, target 3, block at level 2 → level 3 is a target segment
    render(
      <BlockProfile
        gradeOrd={2}
        targetOrd={3}
        levelCount={7}
        blocks={[{ name: "Архитектура", cur: 2 }]}
      />,
    );
    expect(document.querySelectorAll('[data-seg="target"]').length).toBe(1);
  });

  it("CompaBand positions the marker by compa", () => {
    render(<CompaBand compa={0.62} gradeCode="IC5" />);
    const marker = document.querySelector('[data-testid="compa-marker"]') as HTMLElement;
    expect(marker.style.left).toBe("62%");
  });

  it("GradeEmptyState renders the not-assigned message", () => {
    render(<GradeEmptyState />);
    expect(screen.getByText("Грейд не назначен")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && pnpm exec vitest run MemberGradeViews`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `GradeEmptyState.tsx`**

```tsx
import { Layers } from "lucide-react";

export function GradeEmptyState() {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-7 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-bg-tint text-ink-3">
        <Layers size={22} strokeWidth={1.5} />
      </span>
      <div className="text-[14px] font-semibold text-ink-2">Грейд не назначен</div>
      <div className="mt-1 text-[12.5px] text-ink-3">
        Эта роль использует другую карьерную лестницу (дизайн / менеджмент).
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `BlockProfile.tsx`**

```tsx
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Block = { name: string; cur: number };

function segClass(n: number, cur: number, gradeOrd: number, targetOrd: number | null) {
  if (n <= cur) return n > gradeOrd ? "ahead" : "fill";
  if (targetOrd && n <= targetOrd) return "target";
  return "empty";
}

const SEG_BG: Record<string, string> = {
  fill: "bg-brand",
  ahead: "bg-ok",
  target: "bg-brand-soft",
  empty: "bg-bg-sunken",
};

export function BlockProfile({
  blocks,
  gradeOrd,
  targetOrd,
  levelCount,
}: {
  blocks: Block[];
  gradeOrd: number;
  targetOrd: number | null;
  levelCount: number;
}) {
  const levels = Array.from({ length: levelCount }, (_, i) => i + 1);
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-3 text-[13px] font-semibold text-ink">Профиль по блокам</div>
      <div className="space-y-3">
        {blocks.map((b) => {
          const tone = b.cur > gradeOrd ? "text-ok" : targetOrd && b.cur < targetOrd ? "text-brand-strong" : "text-ink-2";
          return (
            <div key={b.name}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12.5px] text-ink-2">{b.name}</span>
                <span className={cn("flex items-center gap-1 text-[12px] font-semibold tabular", tone)}>
                  IC{b.cur}
                  {b.cur > gradeOrd && <TrendingUp size={11} />}
                </span>
              </div>
              <div className="relative flex gap-1">
                {levels.map((n) => {
                  const cls = segClass(n, b.cur, gradeOrd, targetOrd);
                  return <span key={n} data-seg={cls} className={cn("h-2 flex-1 rounded-sm", SEG_BG[cls])} />;
                })}
                <span
                  data-testid="grade-marker"
                  className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink"
                  style={{ left: `calc(${((gradeOrd - 0.5) / levelCount) * 100}% )` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand" /> освоено</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ok" /> выше грейда</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-soft" /> цель</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-0.5 rounded bg-ink" /> текущий грейд</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `CompaBand.tsx`**

```tsx
export function CompaBand({ compa, gradeCode }: { compa: number; gradeCode: string }) {
  const pct = Math.round(compa * 100);
  const note =
    compa < 0.4
      ? "В нижней части полосы — есть пространство для роста внутри грейда."
      : compa < 0.66
        ? "Около медианы грейда — соответствует уровню."
        : "В верхней части полосы — близко к потолку грейда, основной рост через повышение.";
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Позиция в полосе</div>
      <div className="mb-5 text-[12px] text-ink-3">{gradeCode} · вид лида, без точных окладов</div>
      <div className="relative flex h-7 items-center">
        <div className="absolute h-2 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand" />
        <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: "0%" }} />
        <div className="absolute h-[18px] w-0.5 rounded bg-brand-strong" style={{ left: "50%" }} />
        <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: "calc(100% - 2px)" }} />
        <div
          data-testid="compa-marker"
          className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-bg-elev bg-ink shadow"
          style={{ left: `${pct}%` }}
          title="позиция сотрудника"
        />
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{note}</p>
    </div>
  );
}
```

- [ ] **Step 6: Write `GrowChecklist.tsx`**

```tsx
type GrowItem = { blockName: string; targetCode: string; text: string };

export function GrowChecklist({ items, targetCode }: { items: GrowItem[]; targetCode: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Что показать для {targetCode}</div>
      <div className="mb-3 text-[12px] text-ink-3">Конкретные компетенции из матрицы</div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.blockName} className="flex gap-3">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-line" />
            <div>
              <div className="text-[13px] font-semibold text-ink">
                {it.blockName} → {it.targetCode}
              </div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{it.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `EvidencePlaceholder.tsx`**

```tsx
export function EvidencePlaceholder() {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Свидетельства из 1-2-1</div>
        <span className="rounded-full border border-line bg-bg-tint px-2 text-[11px] text-ink-3">0</span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Write `GradeHero.tsx`**

```tsx
import { Clock } from "lucide-react";
import { Pill } from "@/components/Pill";
import { GradeChip } from "./GradeChip";

function fmt(d: string | null | undefined) {
  if (!d) return "не проводилось";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function GradeHero({
  gradeOrd,
  gradeCode,
  gradeName,
  disciplineLabel,
  targetOrd,
  targetCode,
  targetName,
  readyMonths,
  mgrTrack,
  nextReview,
  lastReview,
}: {
  gradeOrd: number;
  gradeCode: string;
  gradeName: string;
  disciplineLabel: string;
  targetOrd: number | null;
  targetCode: string | null;
  targetName: string | null;
  readyMonths: number;
  mgrTrack: boolean;
  nextReview: string | null;
  lastReview: string | null;
}) {
  const promoReady = targetOrd != null && targetOrd > gradeOrd;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="flex flex-wrap items-center gap-4">
        <GradeChip ord={gradeOrd} code={gradeCode} size="xl" />
        <div>
          <div className="text-[18px] font-bold tracking-tight text-ink">{gradeName}</div>
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
            <Pill variant="accent">{disciplineLabel}</Pill>
            текущий грейд{mgrTrack && " · менеджерский трек"}
          </div>
        </div>
      </div>

      {promoReady ? (
        <div className="mt-4 rounded-lg border border-line bg-bg-tint p-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">
              Цель: {targetCode} {targetName}
            </span>
            <Pill variant="accent">
              <Clock size={11} /> {readyMonths}/3–6 мес
            </Pill>
          </div>
          <div className="relative h-2 rounded-full bg-bg-sunken">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min((readyMonths / 6) * 100, 100)}%` }} />
            <span className="absolute top-0 h-2 w-0.5 bg-brand-strong" style={{ left: "50%" }} title="минимум 3 мес" />
          </div>
          <div className="mt-1.5 text-[11.5px] text-ink-3">
            {readyMonths >= 3
              ? "Достаточно свидетельств для постановки на ближайшее ревью."
              : `Ещё ${3 - readyMonths} мес стабильного проявления до порога ревью.`}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-[13px] text-ink-3">
          Уверенно держит уровень. Цель на повышение не выставлена.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-6 border-t border-line-2 pt-3 text-[12.5px]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-4">Ближайшее ревью</div>
          <div className="text-ink-2">{fmt(nextReview)}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-4">Прошлое ревью</div>
          <div className="text-ink-2">{fmt(lastReview)}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the unit tests to verify they pass**

Run: `cd web && pnpm exec vitest run MemberGradeViews`
Expected: 4 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add web/components/grades/GradeHero.tsx web/components/grades/BlockProfile.tsx web/components/grades/GrowChecklist.tsx web/components/grades/CompaBand.tsx web/components/grades/EvidencePlaceholder.tsx web/components/grades/GradeEmptyState.tsx web/components/__tests__/MemberGradeViews.test.tsx
git commit -m "feat(web): grade-tab presentational components + unit tests (slice #2)"
```

---

### Task 8: GradeTab orchestrator + tab wiring + e2e

**Files:**
- Create: `web/app/(app)/profile/[id]/GradeTab.tsx`
- Modify: `web/app/(app)/profile/[id]/page.tsx`
- Create: `web/e2e/member-grade.spec.ts`

**Context:** `page.tsx` is a server component that switches on `searchParams.tab`. The other tabs (`HistoryTab`, `GoalsTab`, `FilesTab`) are client components taking `memberId`. Follow the same shape. `GradeTab` joins the member grade with the framework: find the discipline by `discipline_key`, its blocks, the sorted levels, and `levelByOrd`.

- [ ] **Step 1: Write `GradeTab.tsx`**

```tsx
"use client";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { GradeHero } from "@/components/grades/GradeHero";
import { BlockProfile } from "@/components/grades/BlockProfile";
import { GrowChecklist } from "@/components/grades/GrowChecklist";
import { CompaBand } from "@/components/grades/CompaBand";
import { EvidencePlaceholder } from "@/components/grades/EvidencePlaceholder";
import { GradeEmptyState } from "@/components/grades/GradeEmptyState";

export function GradeTab({ memberId }: { memberId: string }) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);

  if (fw.isLoading || mg.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (fw.isError || mg.isError)
    return <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить грейд.</div>;

  const grade = mg.data;
  if (!grade) return <GradeEmptyState />;

  const framework = fw.data!;
  const discipline = framework.disciplines.find((d) => d.key === grade.discipline_key);
  if (!discipline) return <GradeEmptyState />;

  const levels = [...framework.levels].sort((a, b) => a.ord - b.ord);
  const levelByOrd = (ord: number) => levels.find((l) => l.ord === ord);
  const cur = levelByOrd(grade.grade_ord)!;
  const target = grade.target_ord != null ? levelByOrd(grade.target_ord) ?? null : null;

  const blockLevelOf = (blockKey: string) =>
    grade.block_levels.find((bl) => bl.block_key === blockKey)?.level_ord ?? grade.grade_ord;

  const blocks = discipline.blocks.map((b) => ({ name: b.name, cur: blockLevelOf(b.key) }));

  const growItems =
    grade.target_ord != null
      ? discipline.blocks
          .filter((b) => blockLevelOf(b.key) < grade.target_ord!)
          .map((b) => {
            const cell = b.cells.find((c) => c.level === grade.target_ord);
            return { blockName: b.name, targetCode: target?.code ?? "", text: cell?.text ?? "" };
          })
          .filter((it) => it.text.length > 0)
      : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 lg:col-span-2">
        <GradeHero
          gradeOrd={grade.grade_ord}
          gradeCode={cur.code}
          gradeName={cur.name}
          disciplineLabel={discipline.label}
          targetOrd={grade.target_ord}
          targetCode={target?.code ?? null}
          targetName={target?.name ?? null}
          readyMonths={grade.ready_months}
          mgrTrack={grade.mgr_track}
          nextReview={grade.next_review ?? null}
          lastReview={grade.last_review ?? null}
        />
      </div>
      <div className="space-y-4">
        <BlockProfile blocks={blocks} gradeOrd={grade.grade_ord} targetOrd={grade.target_ord} levelCount={levels.length} />
        {target && <GrowChecklist items={growItems} targetCode={target.code} />}
      </div>
      <div className="space-y-4">
        <CompaBand compa={grade.compa} gradeCode={cur.code} />
        <EvidencePlaceholder />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into `page.tsx`**

In `web/app/(app)/profile/[id]/page.tsx`:
- import: `import { GradeTab } from "./GradeTab";`
- add to `TABS` (after `goals`): `{ key: "grade", label: "Грейд" },`
- in the render switch, add a branch (before the `HistoryTab` fallback):

```tsx
      {tab === "goals" ? (
        <GoalsTab memberId={params.id} />
      ) : tab === "grade" ? (
        <GradeTab memberId={params.id} />
      ) : tab === "files" ? (
        <FilesTab memberId={params.id} />
      ) : (
        <HistoryTab memberId={params.id} />
      )}
```

- [ ] **Step 3: Verify types compile**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Write the e2e spec**

`web/e2e/member-grade.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openMember(page: Page, name: string) {
  await login(page);
  await page.getByRole("row", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/profile\//);
}

test("graded member shows the grade tab", async ({ page }) => {
  await openMember(page, "Игорь Петров");
  await page.getByRole("link", { name: "Грейд" }).click();
  await expect(page).toHaveURL(/tab=grade/);
  await expect(page.getByText("Профиль по блокам")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Позиция в полосе")).toBeVisible();
  await expect(page.getByText(/Свидетельства из 1-2-1/)).toBeVisible();
});

test("ungraded member shows the empty state", async ({ page }) => {
  await openMember(page, "Дмитрий Кузнецов");
  await page.getByRole("link", { name: "Грейд" }).click();
  await expect(page.getByText("Грейд не назначен")).toBeVisible({ timeout: 10_000 });
});
```

(If `getByRole("row", { name })` does not resolve in the team table, fall back to clicking the member's name link: `await page.getByText(name).first().click();` — verify against the existing `teamlist.spec.ts` / `profile.spec.ts` navigation pattern.)

- [ ] **Step 5: Run the e2e spec**

Run: `cd web && pnpm exec playwright test member-grade.spec.ts --reporter=line`
Expected: 2 tests PASS.

- [ ] **Step 6: Run the full web + api suites**

Run: `cd web && pnpm exec vitest run --silent` (expect all pass) and `cd web && pnpm exec playwright test --reporter=line` (expect all pass) and `cd api && cargo test` (expect all pass).

- [ ] **Step 7: Commit**

```bash
git add web/app/\(app\)/profile/\[id\]/GradeTab.tsx web/app/\(app\)/profile/\[id\]/page.tsx web/e2e/member-grade.spec.ts
git commit -m "feat(web): profile «Грейд» tab + e2e (slice #2)"
```

---

## Self-Review

**Spec coverage:**
- Data model (`member_grades` + `member_block_levels`) → Task 1. ✓
- Seed engineers, leave non-engineers ungraded → Task 2. ✓
- `GET /v1/members/{id}/grade` read-only, `require_member_access`, null for unassigned → Task 4. ✓
- DTOs (member data only, frontend joins framework) → Task 3 + GradeTab join logic (Task 8). ✓
- Sections: hero, block profile, grow checklist, compa band, evidence placeholder → Task 7 + Task 8. ✓
- Deferred (review history, «Открыть ревью», addon switcher) not rendered → confirmed absent from GradeTab. ✓
- `GradeChip` xl variant → Task 6. ✓
- Tests: api (200 populated / 200 null / 403 / 401), unit (BlockProfile / CompaBand / empty state), e2e (graded + ungraded) → Tasks 4, 7, 8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code.

**Type consistency:** `MemberGrade` / `BlockLevel` field names identical across DTO (Task 3), handler (Task 4), hook (Task 6), and GradeTab (Task 8): `discipline_key`, `grade_ord`, `target_ord`, `compa`, `ready_months`, `mgr_track`, `next_review`, `last_review`, `block_levels[].block_key`, `block_levels[].level_ord`. `BlockProfile` prop names (`blocks`, `gradeOrd`, `targetOrd`, `levelCount`) and `data-seg` values (`fill`/`ahead`/`target`/`empty`) match between test (Task 7 Step 1) and component (Task 7 Step 4). `CompaBand` `data-testid="compa-marker"` matches test.
