# BeeTeam — Performance Review flow (slice #4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lead runs a 4-step Performance Review wizard (Подготовка → Оценка по блокам → Калибровка → Решение) from the profile «Грейд» tab; the review is a DB draft with autosave, «Завершить ревью» moves it to `pending` HR approval without touching the member's grade; the profile gains a real «История ревью» card.

**Architecture:** Normalized model: `self_assessments` (seed-only employee self-scores), `performance_reviews` (one active per member via partial unique index), `review_scores` (per-block self snapshot + lead score). Axum routes in a new `routes/reviews.rs` guarded by `require_member_access`; calibration peers are computed server-side. Frontend: a wide self-contained `ReviewModal` orchestrator with presentational step components, debounced PATCH autosave (MeetingDrawer pattern), TanStack Query hooks in `lib/query/reviews.ts`.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres 16, Next.js 14 + React 18, TanStack Query v5, Tailwind (ink/brand tokens), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-10-beeteam-performance-review-design.md`

**Conventions for every task below:**
- Rust tests run against the isolated test DB: `api/scripts/test.sh <args>` (never bare `cargo test` — it would hit the dev DB).
- Web unit tests: `cd web && pnpm vitest run <file>`. Web type check comes free with `pnpm build`-less dev via `pnpm tsc --noEmit` — not configured as a script; rely on vitest + next lint if needed.
- One deviation from the spec, locked here: the spec says finalize-without-decision → 422; the codebase has no 422 variant (`AppError` maps validation to 400 `BadRequest`). We use **400** for consistency with every other validation error.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/lebedev.v/projects/beeteam
git checkout -b feat/performance-review
```

---

### Task 1: Migration `0007_performance_reviews.sql`

**Files:**
- Create: `api/crates/bt-db/migrations/0007_performance_reviews.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Performance Review flow (slice #4): employee self-assessment, the review
-- checkpoint itself, and per-block scores (self snapshot + lead assessment).

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
  period         text NOT NULL,
  status         review_status NOT NULL DEFAULT 'draft',
  from_grade_ord int  NOT NULL CHECK (from_grade_ord BETWEEN 1 AND 7),
  target_ord     int  CHECK (target_ord BETWEEN 1 AND 7),
  decision       review_decision,
  to_grade_ord   int  CHECK (to_grade_ord BETWEEN 1 AND 7),
  summary        text NOT NULL DEFAULT '',
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finalized_at   timestamptz
);

-- At most one active (draft or pending) review per member.
CREATE UNIQUE INDEX idx_reviews_one_active
  ON performance_reviews(member_id) WHERE status IN ('draft', 'pending');
CREATE INDEX idx_reviews_member ON performance_reviews(member_id, created_at DESC);

CREATE TABLE review_scores (
  review_id uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  block_id  uuid NOT NULL REFERENCES grade_blocks(id),
  self_ord  int CHECK (self_ord BETWEEN 1 AND 7),
  lead_ord  int NOT NULL CHECK (lead_ord BETWEEN 1 AND 7),
  PRIMARY KEY (review_id, block_id)
);
```

- [ ] **Step 2: Verify migrations still apply cleanly**

Any `#[sqlx::test]` re-runs the full migration chain on a throwaway DB:

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api create_then_list_evidence
```

Expected: PASS (migration syntax is valid; nothing else changed).

- [ ] **Step 3: Commit**

```bash
git add api/crates/bt-db/migrations/0007_performance_reviews.sql
git commit -m "feat(db): performance reviews + self assessments + review scores (slice #4)"
```

---

### Task 2: Domain DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (append after `CreateEvidence`, before `#[cfg(test)]`)

- [ ] **Step 1: Add the five structs**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ReviewScore {
    pub block_id: uuid::Uuid,
    pub block_key: String,
    pub block_name: String,
    pub self_ord: Option<i32>,
    pub lead_ord: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Review {
    pub id: uuid::Uuid,
    pub period: String,
    pub status: String, // "draft" | "pending" | "final"
    pub from_grade_ord: i32,
    pub target_ord: Option<i32>,
    pub decision: Option<String>, // "hold" | "promote" | "pip"
    pub to_grade_ord: Option<i32>,
    pub summary: String,
    pub created_at: String,
    pub finalized_at: Option<String>,
    pub scores: Vec<ReviewScore>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateReviewScore {
    pub block_id: uuid::Uuid,
    pub lead_ord: i32,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateReview {
    pub scores: Option<Vec<UpdateReviewScore>>,
    pub decision: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CalibrationPeer {
    pub member_id: uuid::Uuid,
    pub name: String,
    pub hue: i32,
    pub avg_level: f64,
    pub target_ord: Option<i32>,
    pub compa: f64,
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain
```

Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add crates/bt-domain/src/lib.rs
git commit -m "feat(domain): Review/ReviewScore/UpdateReview/CalibrationPeer DTOs (slice #4)"
```

---

### Task 3: `POST` + `GET /v1/members/{id}/reviews` (create-or-return draft, list)

**Files:**
- Create: `api/crates/bt-api/src/routes/reviews.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs` (add `pub mod reviews;`)
- Modify: `api/crates/bt-api/src/app.rs` (register routes)
- Modify: `api/crates/bt-api/src/openapi.rs` (register paths + schemas)

- [ ] **Step 1: Create `reviews.rs` with helpers, stub handlers, and tests**

Full file. Handlers `start_review` / `list_member_reviews` are real signatures with `unimplemented!()` bodies so the failing tests compile:

```rust
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{Review, ReviewScore}; // Tasks 4–5 extend this with UpdateReview, CalibrationPeer
use chrono::Datelike;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;

type RvRow = (
    Uuid, String, String, i32, Option<i32>, Option<String>, Option<i32>, String,
    chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>,
);

const RV_SELECT: &str = "SELECT id, period, status::text, from_grade_ord, target_ord, \
    decision::text, to_grade_ord, summary, created_at, finalized_at FROM performance_reviews";

fn rv_from(r: RvRow, scores: Vec<ReviewScore>) -> Review {
    Review {
        id: r.0,
        period: r.1,
        status: r.2,
        from_grade_ord: r.3,
        target_ord: r.4,
        decision: r.5,
        to_grade_ord: r.6,
        summary: r.7,
        created_at: r.8.to_rfc3339(),
        finalized_at: r.9.map(|d| d.to_rfc3339()),
        scores,
    }
}

async fn rv_scores(pool: &sqlx::PgPool, review_id: Uuid) -> AppResult<Vec<ReviewScore>> {
    let rows: Vec<(Uuid, String, String, Option<i32>, i32)> = sqlx::query_as(
        "SELECT rs.block_id, gb.key, gb.name, rs.self_ord, rs.lead_ord \
         FROM review_scores rs JOIN grade_blocks gb ON gb.id = rs.block_id \
         WHERE rs.review_id = $1 ORDER BY gb.ord",
    )
    .bind(review_id).fetch_all(pool).await?;
    Ok(rows.into_iter()
        .map(|r| ReviewScore { block_id: r.0, block_key: r.1, block_name: r.2, self_ord: r.3, lead_ord: r.4 })
        .collect())
}

/// (member_id, status) of a review, or 404.
async fn rv_member_status(pool: &sqlx::PgPool, id: Uuid) -> AppResult<(Uuid, String)> {
    let r: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT member_id, status::text FROM performance_reviews WHERE id = $1",
    )
    .bind(id).fetch_optional(pool).await?;
    r.ok_or(AppError::NotFound)
}

fn period_of(now: chrono::DateTime<chrono::Utc>) -> String {
    format!("{} {}", if now.month() <= 6 { "H1" } else { "H2" }, now.year())
}

#[utoipa::path(
    post, path = "/v1/members/{id}/reviews",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 201, description = "Draft created", body = Review),
        (status = 200, description = "Existing draft returned", body = Review),
        (status = 403), (status = 404, description = "Member has no grade"),
        (status = 409, description = "A review is already pending HR approval"),
    )
)]
pub async fn start_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<(StatusCode, Json<Review>)> {
    unimplemented!()
}

#[utoipa::path(
    get, path = "/v1/members/{id}/reviews",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses((status = 200, body = [Review]), (status = 403))
)]
pub async fn list_member_reviews(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<Review>>> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use crate::app::{build_router, AppState};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
        })
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    async fn member_id(pool: &sqlx::PgPool, name: &str) -> uuid::Uuid {
        let m: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = $1")
            .bind(name).fetch_one(pool).await.unwrap();
        m.0
    }

    async fn post_review(pool: &sqlx::PgPool, token: &str, member: uuid::Uuid) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/members/{member}/reviews"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn start_review_creates_prefilled_draft(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;

        let (status, json) = post_review(&pool, &token, anna).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["status"], "draft");
        assert_eq!(json["from_grade_ord"], 5);
        assert_eq!(json["target_ord"], 6);
        let scores = json["scores"].as_array().unwrap();
        assert_eq!(scores.len(), 6);
        // Lead prefill = her member_block_levels: stack=6.
        let stack = scores.iter().find(|s| s["block_key"] == "stack").unwrap();
        assert_eq!(stack["lead_ord"], 6);
        // Self snapshot comes from seeded self_assessments (Task 6 seeds them;
        // until then self_ord is null — this assert is added in Task 6).
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn start_review_returns_existing_draft(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;

        let (s1, j1) = post_review(&pool, &token, anna).await;
        let (s2, j2) = post_review(&pool, &token, anna).await;
        assert_eq!(s1, StatusCode::CREATED);
        assert_eq!(s2, StatusCode::OK);
        assert_eq!(j1["id"], j2["id"]);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn start_review_404_for_ungraded_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        // Дмитрий Кузнецов is the seeded designer with no member_grades row.
        let dima = member_id(&pool, "Дмитрий Кузнецов").await;
        let (status, _) = post_review(&pool, &token, dima).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_reviews_includes_draft(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        post_review(&pool, &token, anna).await;

        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{anna}/reviews"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let arr: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(arr.as_array().unwrap().iter().any(|r| r["status"] == "draft"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn reviews_forbidden_for_foreign_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("POST")
                .uri(format!("/v1/members/{}/reviews", uuid::Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }
}
```

- [ ] **Step 2: Wire the module and routes**

`api/crates/bt-api/src/routes/mod.rs` — add:

```rust
pub mod reviews;
```

`api/crates/bt-api/src/app.rs` — in the `protected` router, after the `/v1/evidence/:id` route:

```rust
.route("/v1/members/:id/reviews", get(routes::reviews::list_member_reviews)
    .post(routes::reviews::start_review))
```

`api/crates/bt-api/src/openapi.rs` — in `paths(...)` after the evidence entries:

```rust
crate::routes::reviews::start_review,
crate::routes::reviews::list_member_reviews,
```

and in `components(schemas(...))` after `bt_domain::CreateEvidence`:

```rust
bt_domain::Review,
bt_domain::ReviewScore,
bt_domain::UpdateReviewScore,
bt_domain::UpdateReview,
bt_domain::CalibrationPeer,
```

(`UpdateReview*`/`CalibrationPeer` schemas registered now so Tasks 4–5 only touch `paths`.)

- [ ] **Step 3: Run the new tests — expect FAIL**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api reviews::
```

Expected: FAIL — panics from `unimplemented!()` (`start_review_creates_prefilled_draft`, `start_review_returns_existing_draft`, `list_reviews_includes_draft` and the 404/403 tests that reach the handler).

- [ ] **Step 4: Implement the two handlers**

Replace the `unimplemented!()` bodies:

```rust
pub async fn start_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<(StatusCode, Json<Review>)> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let active: Option<RvRow> = sqlx::query_as(
        &format!("{RV_SELECT} WHERE member_id = $1 AND status IN ('draft','pending') LIMIT 1"),
    )
    .bind(member_id).fetch_optional(&state.pool).await?;
    if let Some(r) = active {
        if r.2 == "pending" {
            return Err(AppError::Conflict("review already pending HR approval".into()));
        }
        let scores = rv_scores(&state.pool, r.0).await?;
        return Ok((StatusCode::OK, Json(rv_from(r, scores))));
    }

    let mg: Option<(Uuid, Uuid, i32, Option<i32>)> = sqlx::query_as(
        "SELECT id, discipline_id, grade_ord, target_ord FROM member_grades WHERE member_id = $1",
    )
    .bind(member_id).fetch_optional(&state.pool).await?;
    let Some(mg) = mg else { return Err(AppError::NotFound) };

    let mut tx = state.pool.begin().await?;
    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO performance_reviews (member_id, period, from_grade_ord, target_ord, created_by) \
         VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(member_id).bind(period_of(chrono::Utc::now())).bind(mg.2).bind(mg.3).bind(auth.id)
    .fetch_one(&mut *tx).await?;
    // One score row per discipline block: self = self_assessments snapshot,
    // lead prefill = member_block_levels (fallback: current grade).
    sqlx::query(
        "INSERT INTO review_scores (review_id, block_id, self_ord, lead_ord) \
         SELECT $1, gb.id, sa.level_ord, COALESCE(mbl.level_ord, $4) \
         FROM grade_blocks gb \
         LEFT JOIN self_assessments sa ON sa.block_id = gb.id AND sa.member_id = $2 \
         LEFT JOIN member_block_levels mbl ON mbl.block_id = gb.id AND mbl.member_grade_id = $3 \
         WHERE gb.discipline_id = $5",
    )
    .bind(id.0).bind(member_id).bind(mg.0).bind(mg.2).bind(mg.1)
    .execute(&mut *tx).await?;
    tx.commit().await?;

    let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
        .bind(id.0).fetch_one(&state.pool).await?;
    let scores = rv_scores(&state.pool, id.0).await?;
    Ok((StatusCode::CREATED, Json(rv_from(r, scores))))
}

pub async fn list_member_reviews(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<Review>>> {
    require_member_access(&auth, member_id, &state.pool).await?;
    let rows: Vec<RvRow> = sqlx::query_as(
        &format!("{RV_SELECT} WHERE member_id = $1 ORDER BY created_at DESC"),
    )
    .bind(member_id).fetch_all(&state.pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let scores = rv_scores(&state.pool, r.0).await?;
        out.push(rv_from(r, scores));
    }
    Ok(Json(out))
}
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api reviews::
```

Expected: all `reviews::` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): start/list performance reviews with prefilled scores (slice #4)"
```

---

### Task 4: `PATCH` + `DELETE /v1/reviews/{id}` (autosave, cancel draft)

**Files:**
- Modify: `api/crates/bt-api/src/routes/reviews.rs`
- Modify: `api/crates/bt-api/src/app.rs`
- Modify: `api/crates/bt-api/src/openapi.rs` (paths only)

- [ ] **Step 1: Add failing tests to `reviews.rs` `mod tests`**

```rust
    async fn patch_review(
        pool: &sqlx::PgPool, token: &str, id: &str, body: &str,
    ) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("PATCH").uri(format!("/v1/reviews/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_updates_scores_decision_summary(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();
        let core = draft["scores"].as_array().unwrap().iter()
            .find(|s| s["block_key"] == "core").unwrap()["block_id"].as_str().unwrap().to_string();

        let body = format!(
            r#"{{"scores":[{{"block_id":"{core}","lead_ord":6}}],"decision":"promote","summary":"готова"}}"#
        );
        let (status, json) = patch_review(&pool, &token, id, &body).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["decision"], "promote");
        assert_eq!(json["summary"], "готова");
        let core_row = json["scores"].as_array().unwrap().iter()
            .find(|s| s["block_key"] == "core").unwrap();
        assert_eq!(core_row["lead_ord"], 6);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_rejects_bad_decision_and_level(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();
        let block = draft["scores"][0]["block_id"].as_str().unwrap().to_string();

        let (s1, _) = patch_review(&pool, &token, id, r#"{"decision":"bogus"}"#).await;
        assert_eq!(s1, StatusCode::BAD_REQUEST);
        let (s2, _) = patch_review(&pool, &token, id,
            &format!(r#"{{"scores":[{{"block_id":"{block}","lead_ord":9}}]}}"#)).await;
        assert_eq!(s2, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_409_on_pending_review(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();
        sqlx::query("UPDATE performance_reviews SET status = 'pending' WHERE id = $1::uuid")
            .bind(id).execute(&pool).await.unwrap();

        let (status, _) = patch_review(&pool, &token, id, r#"{"summary":"late"}"#).await;
        assert_eq!(status, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_draft_then_404(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();

        let resp = app(pool.clone()).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/reviews/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let resp = app(pool).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/reviews/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
```

- [ ] **Step 2: Add stub handlers + wiring, run tests — expect FAIL**

Add to `reviews.rs` (extend the `use bt_domain::` line with `UpdateReview`):

```rust
#[utoipa::path(
    patch, path = "/v1/reviews/{id}", request_body = UpdateReview,
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses(
        (status = 200, body = Review), (status = 400), (status = 403),
        (status = 404), (status = 409, description = "Review is not a draft"),
    )
)]
pub async fn update_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReview>,
) -> AppResult<Json<Review>> {
    unimplemented!()
}

#[utoipa::path(
    delete, path = "/v1/reviews/{id}",
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses((status = 204), (status = 403), (status = 404), (status = 409))
)]
pub async fn delete_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    unimplemented!()
}
```

`app.rs` — after the reviews route from Task 3:

```rust
.route("/v1/reviews/:id", axum::routing::patch(routes::reviews::update_review)
    .delete(routes::reviews::delete_review))
```

`openapi.rs` `paths(...)`:

```rust
crate::routes::reviews::update_review,
crate::routes::reviews::delete_review,
```

Run:

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api reviews::
```

Expected: the four new tests FAIL (panic), Task-3 tests still PASS.

- [ ] **Step 3: Implement**

```rust
pub async fn update_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReview>,
) -> AppResult<Json<Review>> {
    let (member_id, status) = rv_member_status(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    if status != "draft" {
        return Err(AppError::Conflict("review is not a draft".into()));
    }
    if let Some(d) = &body.decision {
        if !matches!(d.as_str(), "hold" | "promote" | "pip") {
            return Err(AppError::BadRequest("decision must be hold|promote|pip".into()));
        }
    }
    if let Some(scores) = &body.scores {
        if scores.iter().any(|s| !(1..=7).contains(&s.lead_ord)) {
            return Err(AppError::BadRequest("lead_ord must be 1..7".into()));
        }
    }

    let mut tx = state.pool.begin().await?;
    if let Some(scores) = &body.scores {
        for s in scores {
            sqlx::query("UPDATE review_scores SET lead_ord = $3 WHERE review_id = $1 AND block_id = $2")
                .bind(id).bind(s.block_id).bind(s.lead_ord)
                .execute(&mut *tx).await?;
        }
    }
    if let Some(d) = &body.decision {
        sqlx::query("UPDATE performance_reviews SET decision = $2::review_decision WHERE id = $1")
            .bind(id).bind(d).execute(&mut *tx).await?;
    }
    if let Some(s) = &body.summary {
        sqlx::query("UPDATE performance_reviews SET summary = $2 WHERE id = $1")
            .bind(id).bind(s).execute(&mut *tx).await?;
    }
    tx.commit().await?;

    let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
        .bind(id).fetch_one(&state.pool).await?;
    let scores = rv_scores(&state.pool, id).await?;
    Ok(Json(rv_from(r, scores)))
}

pub async fn delete_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let (member_id, status) = rv_member_status(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    if status != "draft" {
        return Err(AppError::Conflict("only drafts can be deleted".into()));
    }
    sqlx::query("DELETE FROM performance_reviews WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api reviews::
```

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): review draft autosave (PATCH) + draft delete (slice #4)"
```

---

### Task 5: `POST /v1/reviews/{id}/finalize` + `GET /v1/reviews/{id}/calibration`

**Files:**
- Modify: `api/crates/bt-api/src/routes/reviews.rs`
- Modify: `api/crates/bt-api/src/app.rs`
- Modify: `api/crates/bt-api/src/openapi.rs` (paths only)

- [ ] **Step 1: Add failing tests**

```rust
    async fn finalize(pool: &sqlx::PgPool, token: &str, id: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/reviews/{id}/finalize"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn finalize_promote_sets_pending_and_to_grade(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();
        patch_review(&pool, &token, id, r#"{"decision":"promote"}"#).await;

        let (status, json) = finalize(&pool, &token, id).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["status"], "pending");
        assert_eq!(json["to_grade_ord"], 6); // IC5 → IC6
        assert!(json["finalized_at"].is_string());

        // member_grades is untouched until HR approval (slice #5).
        let mg: (i32,) = sqlx::query_as("SELECT grade_ord FROM member_grades WHERE member_id = $1")
            .bind(anna).fetch_one(&pool).await.unwrap();
        assert_eq!(mg.0, 5);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn finalize_hold_keeps_grade(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();
        patch_review(&pool, &token, id, r#"{"decision":"hold"}"#).await;

        let (status, json) = finalize(&pool, &token, id).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["to_grade_ord"], 5);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn finalize_400_without_decision_409_when_pending(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let anna = member_id(&pool, "Анна Лебедева").await;
        let (_, draft) = post_review(&pool, &token, anna).await;
        let id = draft["id"].as_str().unwrap();

        let (s1, _) = finalize(&pool, &token, id).await;
        assert_eq!(s1, StatusCode::BAD_REQUEST); // no decision chosen

        patch_review(&pool, &token, id, r#"{"decision":"hold"}"#).await;
        finalize(&pool, &token, id).await;
        let (s2, _) = finalize(&pool, &token, id).await;
        assert_eq!(s2, StatusCode::CONFLICT); // already pending
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn calibration_returns_same_discipline_same_grade_peers(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        // Make Алексей a backend IC4 so Игорь (backend IC4) has exactly one peer.
        sqlx::query(
            "UPDATE member_grades SET grade_ord = 4 \
             WHERE member_id = (SELECT id FROM team_members WHERE name = 'Алексей Романов')",
        ).execute(&pool).await.unwrap();
        let igor = member_id(&pool, "Игорь Петров").await;
        let (_, draft) = post_review(&pool, &token, igor).await;
        let id = draft["id"].as_str().unwrap();

        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri(format!("/v1/reviews/{id}/calibration"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let arr: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let peers = arr.as_array().unwrap();
        assert_eq!(peers.len(), 1);
        assert_eq!(peers[0]["name"], "Алексей Романов");
        assert!(peers[0]["avg_level"].as_f64().unwrap() > 0.0);
    }
```

- [ ] **Step 2: Add stub handlers + wiring, run — expect FAIL**

`reviews.rs` (extend the `use bt_domain::` line with `CalibrationPeer`):

```rust
#[utoipa::path(
    post, path = "/v1/reviews/{id}/finalize",
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses(
        (status = 200, body = Review),
        (status = 400, description = "No decision chosen"),
        (status = 403), (status = 404), (status = 409, description = "Not a draft"),
    )
)]
pub async fn finalize_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Review>> {
    unimplemented!()
}

#[utoipa::path(
    get, path = "/v1/reviews/{id}/calibration",
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses((status = 200, body = [CalibrationPeer]), (status = 403), (status = 404))
)]
pub async fn review_calibration(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<CalibrationPeer>>> {
    unimplemented!()
}
```

`app.rs`:

```rust
.route("/v1/reviews/:id/finalize", axum::routing::post(routes::reviews::finalize_review))
.route("/v1/reviews/:id/calibration", get(routes::reviews::review_calibration))
```

`openapi.rs` `paths(...)`:

```rust
crate::routes::reviews::finalize_review,
crate::routes::reviews::review_calibration,
```

Run `api/scripts/test.sh -p bt-api reviews::` → new tests FAIL.

- [ ] **Step 3: Implement**

```rust
pub async fn finalize_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Review>> {
    let (member_id, status) = rv_member_status(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    if status != "draft" {
        return Err(AppError::Conflict("review is not a draft".into()));
    }
    let dec: (Option<String>,) = sqlx::query_as(
        "SELECT decision::text FROM performance_reviews WHERE id = $1",
    )
    .bind(id).fetch_one(&state.pool).await?;
    if dec.0.is_none() {
        return Err(AppError::BadRequest("decision is required to finalize".into()));
    }

    sqlx::query(
        "UPDATE performance_reviews SET status = 'pending', finalized_at = now(), \
         to_grade_ord = CASE WHEN decision = 'promote' \
                             THEN LEAST(from_grade_ord + 1, 7) \
                             ELSE from_grade_ord END \
         WHERE id = $1",
    )
    .bind(id).execute(&state.pool).await?;

    let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
        .bind(id).fetch_one(&state.pool).await?;
    let scores = rv_scores(&state.pool, id).await?;
    Ok(Json(rv_from(r, scores)))
}

pub async fn review_calibration(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<CalibrationPeer>>> {
    let (member_id, _) = rv_member_status(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;

    // Peers share the reviewed member's discipline and the review's from-grade.
    let ctx: (Uuid, i32) = sqlx::query_as(
        "SELECT mg.discipline_id, pr.from_grade_ord \
         FROM performance_reviews pr JOIN member_grades mg ON mg.member_id = pr.member_id \
         WHERE pr.id = $1",
    )
    .bind(id).fetch_one(&state.pool).await?;

    let rows: Vec<(Uuid, String, i32, f64, Option<i32>, f64)> = sqlx::query_as(
        "SELECT tm.id, tm.name, tm.hue, \
                (SELECT AVG(COALESCE(mbl.level_ord, mg2.grade_ord))::float8 \
                   FROM grade_blocks gb \
                   LEFT JOIN member_block_levels mbl \
                     ON mbl.block_id = gb.id AND mbl.member_grade_id = mg2.id \
                  WHERE gb.discipline_id = mg2.discipline_id) AS avg_level, \
                mg2.target_ord, mg2.compa \
         FROM member_grades mg2 JOIN team_members tm ON tm.id = mg2.member_id \
         WHERE mg2.discipline_id = $1 AND mg2.grade_ord = $2 AND mg2.member_id <> $3 \
         ORDER BY avg_level DESC",
    )
    .bind(ctx.0).bind(ctx.1).bind(member_id)
    .fetch_all(&state.pool).await?;

    Ok(Json(rows.into_iter()
        .map(|r| CalibrationPeer {
            member_id: r.0, name: r.1, hue: r.2, avg_level: r.3, target_ord: r.4, compa: r.5,
        })
        .collect()))
}
```

- [ ] **Step 4: Run all review tests + the full API suite — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api
```

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): review finalize → pending + calibration peers (slice #4)"
```

---

### Task 6: Seed — self-assessment + review history for Анна

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs` (insert a new block after the «Grade evidence for Анна» block, before `tx.commit()`; extend the seed test asserts)
- Modify: `api/crates/bt-api/src/routes/reviews.rs` (extend one assert)

- [ ] **Step 1: Add the seed block**

After the closing `}` of the `// ── Grade evidence for Анна (slice #3)` block (before `tx.commit()`):

```rust
    // ── Self-assessment + review history for Анна (slice #4) ──
    {
        let aid = anna_id.expect("seed: Anna must exist");
        let fe: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM disciplines WHERE key = 'frontend' AND workspace_id = $1",
        ).bind(ws_id).fetch_one(&mut *tx).await?;

        // Slightly optimistic vs her block levels [6,5,5,4,6,5]: gives the
        // assess step both «совпадает» and «расхождение +1» states.
        let self_levels: [(&str, i32); 6] =
            [("stack", 6), ("core", 6), ("arch", 6), ("infra", 4), ("ai", 6), ("impact", 5)];
        let submitted = now - day * 20;
        for (bkey, lvl) in self_levels.iter() {
            let block: (uuid::Uuid,) = sqlx::query_as(
                "SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2",
            ).bind(*bkey).bind(fe.0).fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO self_assessments (member_id, block_id, level_ord, submitted_at) \
                 VALUES ($1,$2,$3,$4)",
            )
            .bind(aid).bind(block.0).bind(*lvl).bind(submitted)
            .execute(&mut *tx).await?;
        }

        // Two final reviews (ported from the prototype's reviews.t1); the newest
        // lands on her last_review offset (-45d) so the hero dates line up.
        // (offset_days, from, target, to, decision, summary)
        let reviews: [(i64, i32, i32, i32, &str, &str); 2] = [
            (-45, 5, 6, 5, "hold",
             "Уверенный IC5. Зафиксированы первые проявления IC6 в архитектуре. Рекомендация — накапливать свидетельства к следующему ревью."),
            (-225, 4, 5, 5, "promote",
             "Повышение до IC5 (Senior). Стабильно проявляла senior-компетенции 6 месяцев: архитектурные решения по сервису, менторство."),
        ];
        for (off, from, target, to, dec, summary) in reviews.iter() {
            let when = now + day * (*off as i32);
            let period = format!(
                "{} {}",
                if chrono::Datelike::month(&when) <= 6 { "H1" } else { "H2" },
                chrono::Datelike::year(&when)
            );
            sqlx::query(
                "INSERT INTO performance_reviews \
                 (member_id, period, status, from_grade_ord, target_ord, decision, to_grade_ord, \
                  summary, created_by, created_at, finalized_at) \
                 VALUES ($1,$2,'final',$3,$4,$5::review_decision,$6,$7,$8,$9,$9)",
            )
            .bind(aid).bind(&period).bind(*from).bind(*target).bind(*dec).bind(*to)
            .bind(*summary).bind(lead_id).bind(when)
            .execute(&mut *tx).await?;
        }
    }
```

Note: `now`, `day`, `ws_id`, `anna_id`, `lead_id` already exist in `seed_demo`'s scope (same identifiers the evidence block uses). If `chrono::Datelike` is already imported at the top of `seed.rs`, call `when.month()` / `when.year()` directly.

- [ ] **Step 2: Extend the seed test asserts**

In `seed.rs`'s existing `#[cfg(test)]` seed test (next to the «Анна has seeded evidence» assert):

```rust
        let sa: (i64,) = sqlx::query_as("SELECT count(*) FROM self_assessments")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(sa.0, 6, "Анна has a seeded self-assessment per block");
        let rv: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM performance_reviews WHERE status = 'final'",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(rv.0, 2, "Анна has two final reviews in history");
```

- [ ] **Step 3: Strengthen the Task-3 prefill test**

In `reviews.rs` test `start_review_creates_prefilled_draft`, replace the trailing comment with a real assert (self snapshot now seeded — core self=6):

```rust
        let core = scores.iter().find(|s| s["block_key"] == "core").unwrap();
        assert_eq!(core["self_ord"], 6);
        assert_eq!(core["lead_ord"], 5);
```

- [ ] **Step 4: Run both crates' tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db && api/scripts/test.sh -p bt-api reviews::
```

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-db/src/seed.rs api/crates/bt-api/src/routes/reviews.rs
git commit -m "feat(seed): self-assessment + review history for Анна (slice #4)"
```

---

### Task 7: Regenerate web API types

**Files:**
- Modify: `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Re-seed the dev DB and start the API**

The dev DB must pick up migration 0007 + new seed (seed runs on API startup against an empty DB):

```bash
cd /Users/lebedev.v/projects/beeteam
docker compose up -d postgres
docker compose exec postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api
```

(Leave the API running; it loads `.env` from the repo root via dotenvy. Dev Postgres is on host port 5442.)

- [ ] **Step 2: Regenerate types**

In a second terminal:

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api
```

Expected: `lib/api/schema.d.ts` now contains `Review`, `ReviewScore`, `UpdateReview`, `UpdateReviewScore`, `CalibrationPeer` and the `/v1/members/{id}/reviews`, `/v1/reviews/{id}`, `/v1/reviews/{id}/finalize`, `/v1/reviews/{id}/calibration` paths. Verify:

```bash
grep -c "CalibrationPeer" lib/api/schema.d.ts && grep -c '"/v1/reviews/{id}/finalize"' lib/api/schema.d.ts
```

Expected: both counts > 0.

- [ ] **Step 3: Commit**

```bash
git add lib/api/schema.d.ts
git commit -m "feat(api): register review paths + regen web types (slice #4)"
```

---

### Task 8: Query hooks `web/lib/query/reviews.ts`

**Files:**
- Create: `web/lib/query/reviews.ts`

- [ ] **Step 1: Write the module**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Review = components["schemas"]["Review"];
export type ReviewScore = components["schemas"]["ReviewScore"];
export type UpdateReview = components["schemas"]["UpdateReview"];
export type CalibrationPeer = components["schemas"]["CalibrationPeer"];

export function useMemberReviews(memberId: string) {
  return useQuery<Review[]>({
    queryKey: ["member-reviews", memberId],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/reviews", { params: { path: { id: memberId } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/v1/members/{id}/reviews", { params: { path: { id: memberId } } });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useUpdateReview(reviewId: string, memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateReview) => {
      const { data, error } = await api.PATCH("/v1/reviews/{id}", {
        params: { path: { id: reviewId } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Debounced PATCH autosave for the review wizard (same shape as useMeetingAutosave). */
export function useReviewAutosave(reviewId: string, memberId: string, delay = 800) {
  const mutation = useUpdateReview(reviewId, memberId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<UpdateReview | null>(null);

  const send = useCallback(() => {
    if (pending.current) {
      mutation.mutate(pending.current);
      pending.current = null;
    }
  }, [mutation]);

  const schedule = useCallback(
    (patch: UpdateReview) => {
      // Merge so a summary keystroke doesn't drop a queued scores patch.
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(send, delay);
    },
    [send, delay],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    send();
  }, [send]);

  const status: SaveStatus = mutation.isPending
    ? "saving"
    : mutation.isError
      ? "error"
      : mutation.isSuccess
        ? "saved"
        : "idle";

  return { schedule, flush, status };
}

export function useFinalizeReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { data, error } = await api.POST("/v1/reviews/{id}/finalize", {
        params: { path: { id: reviewId } },
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useDeleteReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await api.DELETE("/v1/reviews/{id}", { params: { path: { id: reviewId } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-reviews", memberId] }),
  });
}

export function useReviewCalibration(reviewId: string) {
  return useQuery<CalibrationPeer[]>({
    queryKey: ["review-calibration", reviewId],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/reviews/{id}/calibration", {
        params: { path: { id: reviewId } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Step 2: Verify it compiles (vitest picks up TS errors on import)**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run 2>&1 | tail -5
```

Expected: existing suite PASS (the new module is type-checked when imported by later tasks; a clean run here just guards against syntax slips).

- [ ] **Step 3: Commit**

```bash
git add lib/query/reviews.ts
git commit -m "feat(web): review query hooks + autosave (slice #4)"
```

---

### Task 9: Step components — `ReviewPrep` + `ReviewAssess` (TDD)

**Files:**
- Create: `web/components/review/ReviewPrep.tsx`
- Create: `web/components/review/ReviewAssess.tsx`
- Create: `web/components/__tests__/ReviewSteps.test.tsx`

- [ ] **Step 1: Write the failing tests**

`web/components/__tests__/ReviewSteps.test.tsx`:

```tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReviewPrep } from "../review/ReviewPrep";
import { ReviewAssess } from "../review/ReviewAssess";

const LEVELS = [1, 2, 3, 4, 5, 6, 7].map((ord) => ({ ord, code: `IC${ord}`, name: `Уровень ${ord}` }));

const EVIDENCE = [
  {
    id: "e1", meeting_id: null, block_key: "arch", block_name: "Архитектура",
    level_ord: 6, status: "demonstrated", note: "Спроектировала миграцию", created_at: "2026-05-11T10:00:00Z",
  },
];

describe("ReviewPrep", () => {
  it("renders stat cards, self-assessment and evidence summary", () => {
    render(
      <ReviewPrep
        gradeCode="IC5" targetCode="IC6" promo readyMonths={4}
        selfRows={[{ name: "Архитектура", ord: 6, code: "IC6" }]}
        evidence={EVIDENCE as never}
      />,
    );
    expect(screen.getByText("IC5 → IC6")).toBeInTheDocument();
    expect(screen.getByText("кандидат на повышение")).toBeInTheDocument();
    expect(screen.getByText("Самооценка сотрудника")).toBeInTheDocument();
    expect(screen.getByText("Спроектировала миграцию")).toBeInTheDocument();
  });

  it("shows the empty state when there is no self-assessment", () => {
    render(
      <ReviewPrep
        gradeCode="IC5" targetCode={null} promo={false} readyMonths={0}
        selfRows={[{ name: "Архитектура", ord: null, code: "" }]}
        evidence={[]}
      />,
    );
    expect(screen.getByText(/Самооценка не получена/)).toBeInTheDocument();
    expect(screen.getByText("подтверждение грейда")).toBeInTheDocument();
  });
});

describe("ReviewAssess", () => {
  const BLOCKS = [
    {
      blockId: "b1", name: "Архитектура", selfOrd: 6, leadOrd: 5, evidenceCount: 2,
      descByLevel: LEVELS.map((l) => `Описание уровня ${l.ord}`),
    },
    {
      blockId: "b2", name: "Стек", selfOrd: 5, leadOrd: 5, evidenceCount: 0,
      descByLevel: LEVELS.map((l) => `Стек уровня ${l.ord}`),
    },
  ];

  it("shows mismatch and match pills and the selected level description", () => {
    render(<ReviewAssess blocks={BLOCKS} levels={LEVELS} targetOrd={6} onSetLead={() => {}} />);
    expect(screen.getByText("расхождение +1")).toBeInTheDocument();
    expect(screen.getByText("совпадает")).toBeInTheDocument();
    expect(screen.getByText("Описание уровня 5")).toBeInTheDocument();
  });

  it("fires onSetLead when a level is clicked", () => {
    const onSetLead = vi.fn();
    render(<ReviewAssess blocks={BLOCKS} levels={LEVELS} targetOrd={6} onSetLead={onSetLead} />);
    const arch = screen.getByTestId("assess-b1");
    fireEvent.click(within(arch).getByRole("button", { name: /IC6/ }));
    expect(onSetLead).toHaveBeenCalledWith("b1", 6);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (modules don't exist)**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewSteps.test.tsx
```

- [ ] **Step 3: Implement `ReviewPrep.tsx`**

```tsx
import { Target, Clock, Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/query/evidence";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ReviewPrep({
  gradeCode, targetCode, promo, readyMonths, selfRows, evidence,
}: {
  gradeCode: string;
  targetCode: string | null;
  promo: boolean;
  readyMonths: number;
  selfRows: { name: string; ord: number | null; code: string }[];
  evidence: Evidence[];
}) {
  const hasSelf = selfRows.some((r) => r.ord != null);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg-elev p-4">
          <Target size={18} className="text-ink-3" />
          <div className="mt-2 text-[20px] font-bold tabular text-ink">
            {promo && targetCode ? `${gradeCode} → ${targetCode}` : gradeCode}
          </div>
          <div className="text-[11.5px] text-ink-3">{promo ? "кандидат на повышение" : "подтверждение грейда"}</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-elev p-4">
          <Clock size={18} className="text-ink-3" />
          <div className="mt-2 text-[20px] font-bold tabular text-ink">{readyMonths} мес</div>
          <div className="text-[11.5px] text-ink-3">стабильного проявления L+1</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-elev p-4">
          <Sparkles size={18} className="text-ink-3" />
          <div className="mt-2 text-[20px] font-bold tabular text-ink">{evidence.length}</div>
          <div className="text-[11.5px] text-ink-3">свидетельств из 1-2-1</div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <div className="text-[13px] font-semibold text-ink">Самооценка сотрудника</div>
        {hasSelf ? (
          <>
            <div className="mb-3 text-[12px] text-ink-3">
              Получена заранее · сотрудник не видит вашу оценку до завершения
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {selfRows.map((r) => (
                <div key={r.name} className="flex items-center justify-between rounded-lg bg-bg-tint px-3 py-2">
                  <span className="text-[12.5px] text-ink-2">{r.name}</span>
                  <span className="text-[11.5px] font-semibold tabular text-ink">{r.ord != null ? r.code : "—"}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[12.5px] text-ink-3">
            Самооценка не получена — шкалы на шаге оценки будут без маркера сотрудника.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <div className="mb-3 text-[13px] font-semibold text-ink">Сводка свидетельств из 1-2-1</div>
        {evidence.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Нет зафиксированных свидетельств.</p>
        ) : (
          <div className="space-y-2">
            {evidence.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.status === "partial" ? "bg-warn" : "bg-ok")} />
                <span className="rounded-full bg-brand-soft px-1.5 text-[10px] leading-[18px] text-brand-text">
                  {e.block_name} · IC{e.level_ord}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">{e.note}</span>
                <span className="text-[11px] text-ink-4">{fmt(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <ShieldCheck size={14} /> Сотрудник не видит вашу оценку до завершения ревью.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ReviewAssess.tsx`**

```tsx
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";

export type AssessBlock = {
  blockId: string;
  name: string;
  selfOrd: number | null;
  leadOrd: number;
  evidenceCount: number;
  descByLevel: (string | null)[]; // index = ord - 1
};

export function ReviewAssess({
  blocks, levels, targetOrd, onSetLead,
}: {
  blocks: AssessBlock[];
  levels: { ord: number; code: string; name: string }[];
  targetOrd: number | null;
  onSetLead: (blockId: string, ord: number) => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Layers size={16} className="mt-0.5 shrink-0" />
        <div>
          Оцените каждый блок по матрице. <b className="text-ink-2">○</b> самооценка сотрудника,{" "}
          <b className="text-ink-2">●</b> ваша оценка.
          {targetOrd != null && <> Цель грейда — IC{targetOrd}.</>}
        </div>
      </div>

      {blocks.map((b) => {
        const gap = b.selfOrd != null ? b.selfOrd - b.leadOrd : null;
        return (
          <div key={b.blockId} data-testid={`assess-${b.blockId}`} className="rounded-xl border border-line bg-bg-elev p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{b.name}</div>
                {b.evidenceCount > 0 && (
                  <div className="text-[11.5px] text-ink-4">{b.evidenceCount} свидетельств в 1-2-1</div>
                )}
              </div>
              {gap != null && gap !== 0 && (
                <Pill variant={Math.abs(gap) >= 2 ? "miss" : "warn"}>
                  расхождение {gap > 0 ? `+${gap}` : gap}
                </Pill>
              )}
              {gap === 0 && <Pill variant="ok" dot>совпадает</Pill>}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {levels.map((l) => {
                const isLead = b.leadOrd === l.ord;
                const isSelf = b.selfOrd === l.ord;
                const isTarget = targetOrd === l.ord;
                return (
                  <button
                    key={l.ord}
                    type="button"
                    aria-pressed={isLead}
                    title={`${l.code} ${l.name}`}
                    onClick={() => onSetLead(b.blockId, l.ord)}
                    className={cn(
                      "relative rounded-md border py-1.5 text-[11.5px] font-semibold tabular",
                      isLead
                        ? "border-brand bg-brand text-brand-text"
                        : "border-line text-ink-3 hover:bg-bg-tint",
                      isTarget && !isLead && "border-brand/50",
                    )}
                  >
                    {l.code}
                    {isSelf && <span className="absolute -top-1.5 right-0.5 text-[10px] text-ink-2" title="самооценка">○</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              {b.descByLevel[b.leadOrd - 1] ?? "не требуется на этом уровне"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewSteps.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add components/review components/__tests__/ReviewSteps.test.tsx
git commit -m "feat(web): review prep + assess step components (slice #4)"
```

---

### Task 10: Step components — `ReviewCalibrate` + `ReviewDecision` (TDD)

**Files:**
- Create: `web/components/review/ReviewCalibrate.tsx`
- Create: `web/components/review/ReviewDecision.tsx`
- Modify: `web/components/__tests__/ReviewSteps.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `ReviewSteps.test.tsx`:

```tsx
import { ReviewCalibrate } from "../review/ReviewCalibrate";
import { ReviewDecision } from "../review/ReviewDecision";

describe("ReviewCalibrate", () => {
  it("renders the reviewed member highlighted among peers", () => {
    render(
      <ReviewCalibrate
        rows={[
          { id: "me", name: "Анна Лебедева", hue: 28, avg: 5.4, me: true, promo: true },
          { id: "p1", name: "Пётр Пиров", hue: 100, avg: 5.0, me: false, promo: false },
        ]}
        gradeCode="IC5" targetCode="IC6" targetOrd={6} disciplineLabel="Frontend"
        levels={LEVELS} avgLead={5.4}
      />,
    );
    expect(screen.getByText("Анна Лебедева (в ревью)")).toBeInTheDocument();
    expect(screen.getByText("Пётр Пиров")).toBeInTheDocument();
    expect(screen.getByText("→ IC6")).toBeInTheDocument();
    expect(screen.getByText("стабилен")).toBeInTheDocument();
  });

  it("shows the no-peers caption when alone", () => {
    render(
      <ReviewCalibrate
        rows={[{ id: "me", name: "Анна Лебедева", hue: 28, avg: 5.4, me: true, promo: true }]}
        gradeCode="IC5" targetCode="IC6" targetOrd={6} disciplineLabel="Frontend"
        levels={LEVELS} avgLead={5.4}
      />,
    );
    expect(screen.getByText(/Других сотрудников этого грейда в дисциплине пока нет/)).toBeInTheDocument();
  });
});

describe("ReviewDecision", () => {
  const base = {
    gradeOrd: 5, gradeCode: "IC5", nextCode: "IC6",
    summary: "", onSummary: () => {}, compa: 0.62, lowBlocks: ["Инфраструктура"],
  };

  it("fires onDecision and shows the salary impact card on promote", () => {
    const onDecision = vi.fn();
    const { rerender } = render(<ReviewDecision {...base} decision={null} onDecision={onDecision} />);
    fireEvent.click(screen.getByText("Повысить до IC6"));
    expect(onDecision).toHaveBeenCalledWith("promote");
    rerender(<ReviewDecision {...base} decision="promote" onDecision={onDecision} />);
    expect(screen.getByText("Влияние на вилку")).toBeInTheDocument();
  });

  it("shows the focus plan on pip", () => {
    render(<ReviewDecision {...base} decision="pip" onDecision={() => {}} />);
    expect(screen.getByText(/Инфраструктура — дотянуть до IC5/)).toBeInTheDocument();
  });

  it("hides promote at IC7", () => {
    render(<ReviewDecision {...base} gradeOrd={7} gradeCode="IC7" nextCode="IC7" decision={null} onDecision={() => {}} />);
    expect(screen.queryByText(/Повысить до/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewSteps.test.tsx
```

- [ ] **Step 3: Implement `ReviewCalibrate.tsx`**

```tsx
import { Scale, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";

export type CalibRow = {
  id: string;
  name: string;
  hue: number;
  avg: number;
  me: boolean;
  promo: boolean; // target above current grade
};

export function ReviewCalibrate({
  rows, gradeCode, targetCode, targetOrd, disciplineLabel, levels, avgLead,
}: {
  rows: CalibRow[];
  gradeCode: string;
  targetCode: string | null;
  targetOrd: number | null;
  disciplineLabel: string;
  levels: { ord: number; code: string }[];
  avgLead: number;
}) {
  const sorted = [...rows].sort((a, b) => b.avg - a.avg);
  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Scale size={16} className="mt-0.5 shrink-0" />
        <div>
          Калибровка выравнивает оценки между лидами, чтобы {gradeCode} у одного лида значил то же,
          что у другого. Сравнение по сотрудникам того же грейда.
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <div className="text-[13px] font-semibold text-ink">Распределение по грейду {gradeCode}</div>
        <div className="mb-4 text-[12px] text-ink-3">
          {disciplineLabel} · средний уровень по блокам · {sorted.length}{" "}
          {sorted.length === 1 ? "человек" : "человека"}
        </div>
        <div className="space-y-2.5">
          {sorted.map((p) => (
            <div key={p.id} className={cn("flex items-center gap-3", p.me && "rounded-lg bg-brand-soft/40 p-1.5 -m-1.5")}>
              <div className="flex w-[200px] shrink-0 items-center gap-2.5">
                <Avatar name={p.name} hue={p.hue} size="sm" />
                <span className={cn("truncate text-[13px]", p.me ? "font-bold text-ink" : "text-ink-2")}>
                  {p.name}{p.me && " (в ревью)"}
                </span>
              </div>
              <div className="relative h-2 flex-1 rounded-full bg-bg-sunken">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${((p.avg - 1) / 6) * 100}%` }} />
                <span className="absolute -top-0.5 right-0 text-[11px] font-semibold tabular text-ink-2">
                  {p.avg.toFixed(1)}
                </span>
              </div>
              {p.promo
                ? <Pill variant="info">→ {targetCode ?? ""}</Pill>
                : <Pill>стабилен</Pill>}
            </div>
          ))}
        </div>
        {sorted.length === 1 && (
          <p className="mt-3 text-[12px] text-ink-3">
            Других сотрудников этого грейда в дисциплине пока нет — распределение появится по мере назначения грейдов.
          </p>
        )}
        <div className="mt-3 flex text-[10.5px] uppercase tracking-wide text-ink-4">
          {levels.map((l) => <span key={l.ord} className="flex-1">{l.code}</span>)}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-elev p-4">
        <Sparkles size={18} className="shrink-0 text-ink-3" />
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          {targetOrd == null
            ? "Подтверждение текущего грейда — сравните позицию с распределением, чтобы зафиксировать уровень."
            : avgLead >= targetOrd
              ? `Средний уровень выше целевого ${targetCode} — кандидат сильнее медианы своего грейда. Повышение обосновано.`
              : `Средний уровень между ${gradeCode} и ${targetCode} — типично для кандидата в переходной фазе.`}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ReviewDecision.tsx`**

```tsx
import { Check, TrendingUp, Flag, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type Decision = "hold" | "promote" | "pip";

function Band({ pct, accent }: { pct: number; accent?: boolean }) {
  return (
    <div className="relative flex h-5 items-center">
      <div className="absolute h-1.5 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand" />
      <span
        className={cn("absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-bg-elev shadow", accent ? "bg-brand-strong" : "bg-ink")}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function ReviewDecision({
  gradeOrd, gradeCode, nextCode, decision, onDecision, summary, onSummary, compa, lowBlocks,
}: {
  gradeOrd: number;
  gradeCode: string;
  nextCode: string;
  decision: Decision | null;
  onDecision: (d: Decision) => void;
  summary: string;
  onSummary: (s: string) => void;
  compa: number;
  lowBlocks: string[];
}) {
  const options: { id: Decision; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: "hold", icon: <Check size={18} />, label: `Сохранить ${gradeCode}`, desc: "Уровень подтверждён, повышения пока нет" },
    ...(gradeOrd < 7
      ? [{ id: "promote" as Decision, icon: <TrendingUp size={18} />, label: `Повысить до ${nextCode}`, desc: "Стабильно проявляет компетенции следующего уровня" }]
      : []),
    { id: "pip", icon: <Flag size={18} />, label: "План улучшения (PIP)", desc: "Есть проседания, нужен фокус-план на квартал" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={decision === o.id}
            onClick={() => onDecision(o.id)}
            className={cn(
              "rounded-xl border p-4 text-left",
              decision === o.id
                ? o.id === "pip"
                  ? "border-miss/50 bg-miss-soft"
                  : "border-brand bg-brand-soft"
                : "border-line bg-bg-elev hover:bg-bg-tint",
            )}
          >
            <span className="text-ink-3">{o.icon}</span>
            <div className="mt-2 text-[13.5px] font-semibold text-ink">{o.label}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{o.desc}</div>
          </button>
        ))}
      </div>

      {decision === "promote" && (
        <div className="rounded-xl border border-line bg-bg-elev p-5">
          <div className="text-[13px] font-semibold text-ink">Влияние на вилку</div>
          <div className="mb-4 text-[12px] text-ink-3">
            При повышении {gradeCode} → {nextCode} (вид лида, без точных окладов)
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">сейчас · {gradeCode}</div>
              <Band pct={Math.round(compa * 100)} />
              <div className="mt-1 text-[11.5px] text-ink-3">{compa < 0.5 ? "ниже медианы" : "около медианы"}</div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-ink-3" />
            <div className="flex-1">
              <div className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-4">после · {nextCode}</div>
              <Band pct={22} accent />
              <div className="mt-1 text-[11.5px] text-ink-3">вход в новую полосу (нижняя часть)</div>
            </div>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            Повышение сбрасывает позицию в нижнюю часть новой, более высокой полосы — это нормально.
            Внеплановое ревью зарплаты запускается автоматически при подтверждении грейда.
          </p>
        </div>
      )}

      {decision === "pip" && (
        <div className="rounded-xl border border-miss/30 bg-bg-elev p-5">
          <div className="text-[13px] font-semibold text-miss">Фокус-план на квартал</div>
          <div className="mb-3 text-[12px] text-ink-3">Блоки ниже целевого уровня</div>
          {lowBlocks.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Все блоки на уровне грейда — уточните план в резюме.</p>
          ) : (
            <div className="space-y-1.5">
              {lowBlocks.map((name) => (
                <div key={name} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
                  <span className="h-3.5 w-3.5 rounded border border-line-strong" /> {name} — дотянуть до {gradeCode}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-line bg-bg-elev p-5">
        <label htmlFor="review-summary" className="mb-2 block text-[13px] font-semibold text-ink">
          Резюме ревью
        </label>
        <textarea
          id="review-summary"
          rows={4}
          value={summary}
          onChange={(e) => onSummary(e.target.value)}
          placeholder="Ключевые достижения, обоснование решения, договорённости на следующий период…"
          className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        />
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
          <ShieldCheck size={14} /> Сотрудник увидит резюме и финальное решение после согласования с HR.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewSteps.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add components/review components/__tests__/ReviewSteps.test.tsx
git commit -m "feat(web): review calibrate + decision step components (slice #4)"
```

---

### Task 11: `ReviewModal` orchestrator, `ReviewHistory`, `GradeHero` button, `GradeTab` wiring

**Files:**
- Create: `web/components/review/ReviewModal.tsx`
- Create: `web/components/grades/ReviewHistory.tsx`
- Modify: `web/components/grades/GradeHero.tsx` (add `activeReview` / `onOpenReview` props + the action block)
- Modify: `web/app/(app)/profile/[id]/GradeTab.tsx` (reviews hooks, history card, modal mount)
- Create: `web/components/__tests__/ReviewHistory.test.tsx`

- [ ] **Step 1: Write failing tests for `ReviewHistory` and the `GradeHero` action states**

`web/components/__tests__/ReviewHistory.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewHistory } from "../grades/ReviewHistory";
import { GradeHero } from "../grades/GradeHero";

const codeOf = (ord: number) => `IC${ord}`;

const FINAL = {
  id: "r1", period: "H2 2025", status: "final", from_grade_ord: 4, target_ord: 5,
  decision: "promote", to_grade_ord: 5, summary: "Повышение до IC5",
  created_at: "2025-11-01T10:00:00Z", finalized_at: "2025-11-01T10:00:00Z", scores: [],
};
const PENDING = { ...FINAL, id: "r2", period: "H1 2026", status: "pending", decision: "hold", from_grade_ord: 5, to_grade_ord: 5 };

describe("ReviewHistory", () => {
  it("renders rows with decisions and the pending pill", () => {
    render(<ReviewHistory reviews={[PENDING, FINAL] as never} codeOf={codeOf} />);
    expect(screen.getByText("История ревью")).toBeInTheDocument();
    expect(screen.getByText("IC4 → IC5")).toBeInTheDocument();
    expect(screen.getByText("повышение")).toBeInTheDocument();
    expect(screen.getByText("на согласовании")).toBeInTheDocument();
  });

  it("renders the empty state", () => {
    render(<ReviewHistory reviews={[]} codeOf={codeOf} />);
    expect(screen.getByText(/Ревью ещё не проводились/)).toBeInTheDocument();
  });

  it("skips drafts", () => {
    render(<ReviewHistory reviews={[{ ...FINAL, status: "draft" }] as never} codeOf={codeOf} />);
    expect(screen.getByText(/Ревью ещё не проводились/)).toBeInTheDocument();
  });
});

const HERO = {
  gradeOrd: 5, gradeCode: "IC5", gradeName: "Senior", disciplineLabel: "Frontend",
  targetOrd: 6, targetCode: "IC6", targetName: "Staff", readyMonths: 4, mgrTrack: false,
  nextReview: null, lastReview: null,
};

describe("GradeHero review action", () => {
  it("offers to open a review when none is active", () => {
    render(<GradeHero {...HERO} activeReview={null} onOpenReview={() => {}} />);
    expect(screen.getByRole("button", { name: "Открыть ревью" })).toBeInTheDocument();
  });
  it("offers to continue a draft", () => {
    render(<GradeHero {...HERO} activeReview="draft" onOpenReview={() => {}} />);
    expect(screen.getByRole("button", { name: /Продолжить ревью/ })).toBeInTheDocument();
  });
  it("shows the pending pill instead of a button", () => {
    render(<GradeHero {...HERO} activeReview="pending" onOpenReview={() => {}} />);
    expect(screen.getByText("На согласовании HR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ревью/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewHistory.test.tsx
```

- [ ] **Step 3: Implement `ReviewHistory.tsx`**

```tsx
import { Pill } from "@/components/Pill";
import type { Review } from "@/lib/query/reviews";

const DECISION_LABEL: Record<string, string> = {
  hold: "грейд подтверждён",
  promote: "повышение",
  pip: "план улучшения",
};

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewHistory({ reviews, codeOf }: { reviews: Review[]; codeOf: (ord: number) => string }) {
  const rows = reviews.filter((r) => r.status !== "draft");
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-2 text-[13px] font-semibold text-ink">История ревью</div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Ревью ещё не проводились. Запустите первое из карточки грейда.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border-b border-line-2 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold tabular text-ink">{r.period}</span>
                <span className="text-[12px] tabular text-ink-2">
                  {codeOf(r.from_grade_ord)} → {codeOf(r.to_grade_ord ?? r.from_grade_ord)}
                </span>
                {r.status === "pending"
                  ? <Pill variant="accent">на согласовании</Pill>
                  : r.decision && <span className="text-[11.5px] text-ink-3">{DECISION_LABEL[r.decision] ?? r.decision}</span>}
                <span className="ml-auto text-[11px] text-ink-4">{fmt(r.finalized_at)}</span>
              </div>
              {r.summary && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{r.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Extend `GradeHero.tsx`**

Add the two optional props and the action UI. Changes only — the props object gains:

```tsx
  activeReview = null,
  onOpenReview,
```

and the type gains:

```tsx
  activeReview?: "draft" | "pending" | null;
  onOpenReview?: () => void;
```

Add `import { Pill } from "@/components/Pill";` (already imported) — and inside the dates row (`<div className="mt-4 flex flex-wrap gap-6 border-t border-line-2 pt-3 text-[12.5px]">`), append as the last child:

```tsx
        <div className="ml-auto self-center">
          {activeReview === "pending" ? (
            <Pill variant="accent">На согласовании HR</Pill>
          ) : onOpenReview ? (
            <button
              type="button"
              onClick={onOpenReview}
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
            >
              {activeReview === "draft" ? "Продолжить ревью" : "Открыть ревью"}
            </button>
          ) : null}
        </div>
```

- [ ] **Step 5: Run the Step-1 tests — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/ReviewHistory.test.tsx
```

- [ ] **Step 6: Implement `ReviewModal.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Flag, Layers, Scale, Award, Check, ArrowRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { useMemberEvidence } from "@/lib/query/evidence";
import {
  type Review, useReviewAutosave, useUpdateReview, useFinalizeReview, useDeleteReview, useReviewCalibration,
} from "@/lib/query/reviews";
import { ReviewPrep } from "./ReviewPrep";
import { ReviewAssess, type AssessBlock } from "./ReviewAssess";
import { ReviewCalibrate, type CalibRow } from "./ReviewCalibrate";
import { ReviewDecision, type Decision } from "./ReviewDecision";

const STEPS = [
  { id: "prep", label: "Подготовка", icon: Flag },
  { id: "assess", label: "Оценка по блокам", icon: Layers },
  { id: "calibrate", label: "Калибровка", icon: Scale },
  { id: "decision", label: "Решение", icon: Award },
] as const;

export function ReviewModal({
  memberId, memberName, memberHue, review, onClose,
}: {
  memberId: string;
  memberName: string;
  memberHue: number;
  review: Review;
  onClose: () => void;
}) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);
  const ev = useMemberEvidence(memberId);
  const calib = useReviewCalibration(review.id);
  const autosave = useReviewAutosave(review.id, memberId);
  const update = useUpdateReview(review.id, memberId);
  const finalize = useFinalizeReview(memberId);
  const del = useDeleteReview(memberId);

  const [step, setStep] = useState(0);
  const [leads, setLeads] = useState<Record<string, number>>(
    () => Object.fromEntries(review.scores.map((s) => [s.block_id, s.lead_ord])),
  );
  const [decision, setDecision] = useState<Decision | null>((review.decision as Decision) ?? null);
  const [summary, setSummary] = useState(review.summary);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { autosave.flush(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [autosave, onClose]);

  const grade = mg.data;
  const framework = fw.data;
  const discipline = framework?.disciplines.find((d) => d.key === grade?.discipline_key);
  const levels = useMemo(
    () => (framework ? [...framework.levels].sort((a, b) => a.ord - b.ord) : []),
    [framework],
  );
  const codeOf = (ord: number | null | undefined) =>
    ord != null ? levels.find((l) => l.ord === ord)?.code ?? `IC${ord}` : "";

  if (fw.isLoading || mg.isLoading || ev.isLoading) {
    return <Scrim onClose={onClose}><div className="p-10 text-[13px] text-ink-3">Загрузка…</div></Scrim>;
  }
  if (!grade || !discipline || !framework) {
    return <Scrim onClose={onClose}><div className="p-10 text-[13px] text-miss">Не удалось загрузить данные грейда.</div></Scrim>;
  }

  const evidence = ev.data ?? [];
  const targetOrd = review.target_ord ?? null;
  const fromCode = codeOf(review.from_grade_ord);
  const targetCode = targetOrd != null ? codeOf(targetOrd) : null;
  const promo = targetOrd != null && targetOrd > review.from_grade_ord;

  const blocks: AssessBlock[] = discipline.blocks.map((b) => {
    const score = review.scores.find((s) => s.block_key === b.key)!;
    return {
      blockId: score.block_id,
      name: b.name,
      selfOrd: score.self_ord ?? null,
      leadOrd: leads[score.block_id] ?? score.lead_ord,
      evidenceCount: evidence.filter((e) => e.block_key === b.key).length,
      descByLevel: levels.map((l) => b.cells.find((c) => c.level === l.ord)?.text ?? null),
    };
  });
  const leadVals = blocks.map((b) => b.leadOrd);
  const avgLead = leadVals.reduce((a, v) => a + v, 0) / Math.max(leadVals.length, 1);
  const meetsNext = targetOrd != null ? blocks.filter((b) => b.leadOrd >= targetOrd).length : 0;

  const calibRows: CalibRow[] = [
    { id: memberId, name: memberName, hue: memberHue, avg: avgLead, me: true, promo },
    ...(calib.data ?? []).map((p) => ({
      id: p.member_id, name: p.name, hue: p.hue, avg: p.avg_level, me: false,
      promo: p.target_ord != null && p.target_ord > review.from_grade_ord,
    })),
  ];

  const scoresPatch = () =>
    Object.entries(leads).map(([block_id, lead_ord]) => ({ block_id, lead_ord }));

  const setLead = (blockId: string, ord: number) => {
    const next = { ...leads, [blockId]: ord };
    setLeads(next);
    autosave.schedule({ scores: Object.entries(next).map(([block_id, lead_ord]) => ({ block_id, lead_ord })) });
  };
  const onDecision = (d: Decision) => { setDecision(d); autosave.schedule({ decision: d }); };
  const onSummary = (s: string) => { setSummary(s); autosave.schedule({ summary: s }); };

  const finish = async () => {
    // Direct save (not the debounced one) so finalize never races the autosave.
    await update.mutateAsync({ scores: scoresPatch(), decision: decision ?? undefined, summary });
    await finalize.mutateAsync(review.id);
    onClose();
  };
  const cancelDraft = () => {
    if (window.confirm("Удалить черновик ревью? Оценки и резюме будут потеряны.")) {
      del.mutate(review.id, { onSuccess: onClose });
    }
  };

  const hints = [
    `Самооценка ${review.scores.some((s) => s.self_ord != null) ? "получена" : "не получена"} · ${evidence.length} свидетельств в истории`,
    targetCode ? `${meetsNext}/${blocks.length} блоков на уровне ${targetCode}` : "Подтверждение текущего уровня",
    "Сравнение с сотрудниками того же грейда",
    "После сохранения решение уйдёт на согласование HR",
  ];

  return (
    <Scrim onClose={() => { autosave.flush(); onClose(); }}>
      {/* header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={memberName} hue={memberHue} size="md" />
          <div>
            <div className="text-[15px] font-semibold text-ink">Performance Review · {memberName}</div>
            <div className="text-[12px] text-ink-3">
              {review.period} · {discipline.label} · {fromCode}
              {promo && targetCode && <> · цель {targetCode}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-3" data-save-status={autosave.status}>
            {autosave.status === "saving" ? "● Сохранение…" : autosave.status === "error" ? "● Не сохранено" : autosave.status === "saved" ? "● Сохранено" : ""}
          </span>
          <button type="button" aria-label="Закрыть" className="text-ink-3 hover:text-ink"
            onClick={() => { autosave.flush(); onClose(); }}>✕</button>
        </div>
      </div>

      {/* step rail */}
      <div className="flex gap-1 border-b border-line px-6 py-2.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              data-active={step === i}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px]",
                step === i ? "bg-brand-soft font-semibold text-ink" : "text-ink-3 hover:bg-bg-tint",
              )}
            >
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border",
                step > i ? "border-ok bg-ok-soft text-ok" : "border-line text-ink-3")}>
                {step > i ? <Check size={12} /> : <Icon size={12} />}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
        {step === 0 && (
          <ReviewPrep
            gradeCode={fromCode} targetCode={targetCode} promo={promo}
            readyMonths={grade.ready_months}
            selfRows={review.scores.map((s) => ({ name: s.block_name, ord: s.self_ord ?? null, code: codeOf(s.self_ord) }))}
            evidence={evidence}
          />
        )}
        {step === 1 && (
          <ReviewAssess blocks={blocks} levels={levels} targetOrd={targetOrd} onSetLead={setLead} />
        )}
        {step === 2 && (
          <ReviewCalibrate
            rows={calibRows} gradeCode={fromCode} targetCode={targetCode} targetOrd={targetOrd}
            disciplineLabel={discipline.label} levels={levels} avgLead={avgLead}
          />
        )}
        {step === 3 && (
          <ReviewDecision
            gradeOrd={review.from_grade_ord} gradeCode={fromCode}
            nextCode={codeOf(Math.min(review.from_grade_ord + 1, 7))}
            decision={decision} onDecision={onDecision}
            summary={summary} onSummary={onSummary}
            compa={grade.compa}
            lowBlocks={blocks.filter((b) => b.leadOrd < review.from_grade_ord).map((b) => b.name)}
          />
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-line px-6 py-3.5">
        <div className="flex items-center gap-4 text-[12px] text-ink-3">
          <span>{hints[step]}</span>
          {step === 0 && (
            <button type="button" onClick={cancelDraft}
              className="inline-flex items-center gap-1 text-ink-4 hover:text-miss">
              <Trash2 size={12} /> Удалить черновик
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
              Назад
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              Далее <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={finish}
              disabled={decision == null || update.isPending || finalize.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
              <Check size={14} /> Завершить ревью
            </button>
          )}
        </div>
      </div>
    </Scrim>
  );
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Performance Review"
        className="relative z-10 w-full max-w-[1040px] rounded-xl border border-line bg-bg-elev shadow-pop">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire `GradeTab.tsx`**

Add imports:

```tsx
import { useState } from "react";
import { useMemberReviews, useStartReview } from "@/lib/query/reviews";
import { useMemberDetail } from "@/lib/query/profile";
import { ReviewHistory } from "@/components/grades/ReviewHistory";
import { ReviewModal } from "@/components/review/ReviewModal";
```

Inside the component, after the existing hooks:

```tsx
  const reviews = useMemberReviews(memberId);
  const detail = useMemberDetail(memberId);
  const start = useStartReview(memberId);
  const [reviewOpen, setReviewOpen] = useState(false);
```

(Reviews/detail loading does NOT join the early-return guard — the tab renders without them; the hero button just stays in its default state until the list arrives.)

After the `grade`/`discipline` derivations, before `return`:

```tsx
  const reviewList = reviews.data ?? [];
  const activeDraft = reviewList.find((r) => r.status === "draft") ?? null;
  const activePending = reviewList.find((r) => r.status === "pending") ?? null;
  const openReview = () => {
    if (activeDraft) { setReviewOpen(true); return; }
    start.mutate(undefined, { onSuccess: () => setReviewOpen(true) });
  };
  const modalReview = activeDraft ?? start.data ?? null;
  const codeOf = (ord: number) => levels.find((l) => l.ord === ord)?.code ?? `IC${ord}`;
```

Pass to `GradeHero` (two new props):

```tsx
          activeReview={activePending ? "pending" : activeDraft ? "draft" : null}
          onOpenReview={activePending ? undefined : openReview}
```

In the right column, after `<CompaBand …/>`:

```tsx
        <ReviewHistory reviews={reviewList} codeOf={codeOf} />
```

At the end, before the closing `</div>` of the grid (sibling of the columns):

```tsx
      {reviewOpen && modalReview && detail.data && (
        <ReviewModal
          memberId={memberId}
          memberName={detail.data.name}
          memberHue={detail.data.hue}
          review={modalReview}
          onClose={() => setReviewOpen(false)}
        />
      )}
```

- [ ] **Step 8: Run the whole unit suite — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run
```

- [ ] **Step 9: Commit**

```bash
git add components app/
git commit -m "feat(web): review wizard modal + история ревью in profile (slice #4)"
```

---

### Task 12: e2e + full verification

**Files:**
- Create: `web/e2e/review.spec.ts`

- [ ] **Step 1: Re-seed the dev DB** (the e2e suite runs against it; Анна must have no active review)

```bash
cd /Users/lebedev.v/projects/beeteam
docker compose exec postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
# restart the API so it re-seeds (Ctrl-C the running `cargo run -p bt-api`, then):
cd api && cargo run -p bt-api
```

- [ ] **Step 2: Write the e2e spec**

`web/e2e/review.spec.ts` — serial: the first test leaves a draft the second continues; the file assumes a freshly seeded DB:

```ts
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openAnnaGradeTab(page: Page) {
  await login(page);
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page).toHaveURL(/tab=grade/);
}

test("draft survives close and reopen", async ({ page }) => {
  await openAnnaGradeTab(page);
  await page.getByRole("button", { name: "Открыть ревью" }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });
  await expect(dialog.getByText("Самооценка сотрудника")).toBeVisible({ timeout: 10_000 });

  // Step 2: bump the first block to IC7.
  await dialog.getByRole("button", { name: "Далее" }).click();
  const firstBlock = dialog.locator('[data-testid^="assess-"]').first();
  await firstBlock.getByRole("button", { name: /IC7/ }).click();
  await expect(dialog.getByText("● Сохранено")).toBeVisible({ timeout: 10_000 });

  // Close, reopen via «Продолжить ревью», check the score survived.
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await expect(
    dialog.locator('[data-testid^="assess-"]').first().getByRole("button", { name: /IC7/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("complete a review through all four steps to pending", async ({ page }) => {
  await openAnnaGradeTab(page);
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });

  await dialog.getByRole("button", { name: "Далее" }).click(); // → Оценка
  await expect(dialog.getByText(/Оцените каждый блок по матрице/)).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click(); // → Калибровка
  await expect(dialog.getByText(/Калибровка выравнивает оценки/)).toBeVisible();
  await dialog.getByRole("button", { name: "Далее" }).click(); // → Решение

  await dialog.getByText("Повысить до IC6").click();
  await expect(dialog.getByText("Влияние на вилку")).toBeVisible();
  await dialog.getByLabel("Резюме ревью").fill("e2e: стабильно показывает IC6, повышение обосновано");
  await dialog.getByRole("button", { name: "Завершить ревью" }).click();

  await expect(page.getByText("На согласовании HR")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("История ревью")).toBeVisible();
  await expect(page.getByText("на согласовании")).toBeVisible();
  // Seeded history is also there:
  await expect(page.getByText(/Повышение до IC5/)).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e spec**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e e2e/review.spec.ts
```

Expected: 2 passed. (Playwright starts `pnpm dev` itself per `playwright.config.ts`; the API must be running. Note: this spec leaves Анна with a pending review — re-seed the dev DB before re-running it or before manual review.)

- [ ] **Step 4: Full verification**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh
cd web && pnpm vitest run && pnpm lint
```

Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add e2e/review.spec.ts
git commit -m "test(e2e): performance review wizard flow (slice #4)"
```

---

### Task 13: Local review gate

Per project practice: re-seed the dev DB once more (so Анна has no active review), bring the app up locally (`docker compose up -d`, `cargo run -p bt-api`, `pnpm dev`), and hand off to the user for visual review of the wizard. **Wait for the user's merge command** — do not merge `feat/performance-review` into `main` or push anything yourself.
