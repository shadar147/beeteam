# BeeTeam — RBAC + HR Review Approval (slice #5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typed RBAC (Permission enum + role matrix + guard + permissions in auth responses) and the HR approval flow: an hr_admin reviews pending performance reviews on a new «Согласование» screen and approves (decision finally applied to `member_grades`) or returns to the lead with a mandatory comment.

**Architecture:** Permissions live in code (`bt-domain::Permission` + `permissions_of(role)`), checked by `require_permission` in bt-api and delivered to the web app via `/auth/me` → server session → props; the frontend branches ONLY on permissions, never on role. HR endpoints live in a new `routes/approvals.rs` reusing the `Review` helpers from `reviews.rs`; approve/reject use conditional `UPDATE … WHERE status='pending'` for concurrency safety. Lead access (`require_member_access`) is untouched.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres 16, Next.js 14 (server session via httpOnly cookie + Next proxy), TanStack Query v5, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-12-beeteam-hr-review-approval-design.md`

**Conventions:**
- Rust tests: `api/scripts/test.sh <args>` (isolated test DB; NEVER bare `cargo test`).
- Web: `cd web && pnpm vitest run`, `npx tsc --noEmit`.
- Keep the `&format!("{RV_SELECT} …")` SQL pattern — codebase canon.
- Known break to fix en route: seeding a pending review for Игорь makes the existing
  `calibration_returns_same_discipline_same_grade_peers` test's `post_review(игорь)` return
  409 — Task 6 rewires that test to the seeded review id.

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
cd /Users/lebedev.v/projects/beeteam
git checkout -b feat/hr-review-approval
```

---

### Task 1: Migration `0008_review_approval.sql`

**Files:**
- Create: `api/crates/bt-db/migrations/0008_review_approval.sql`

- [ ] **Step 1: Write the migration**

```sql
-- HR review approval (slice #5a): return-to-lead comment + who/when resolved.

ALTER TABLE performance_reviews
  ADD COLUMN hr_comment  text NOT NULL DEFAULT '',
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES users(id);
```

- [ ] **Step 2: Verify migrations apply** (any sqlx test re-runs the chain):

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api start_review_creates_prefilled_draft
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/crates/bt-db/migrations/0008_review_approval.sql
git commit -m "feat(db): hr_comment + resolved_at/by on performance_reviews (slice #5a)"
```

---

### Task 2: bt-domain — `Permission`, `permissions_of`, auth DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (UserDto ~line 38, MeResponse ~line 54, append Permission near the review DTOs, extend the test module)

- [ ] **Step 1: Add failing unit tests** to the existing `#[cfg(test)] mod tests` at the bottom of lib.rs:

```rust
    #[test]
    fn permissions_matrix() {
        assert_eq!(permissions_of("lead"), &[Permission::ManageTeam]);
        assert!(permissions_of("hr_admin").contains(&Permission::ApproveReviews));
        assert!(permissions_of("hr_admin").contains(&Permission::EditFramework));
        assert!(permissions_of("hr_admin").contains(&Permission::EditSalaryBands));
        assert!(!permissions_of("hr_admin").contains(&Permission::ManageTeam));
        assert!(permissions_of("employee").is_empty());
        assert!(permissions_of("garbage").is_empty());
    }

    #[test]
    fn permission_serializes_snake_case() {
        assert_eq!(serde_json::to_value(Permission::ApproveReviews).unwrap(), "approve_reviews");
        assert_eq!(serde_json::to_value(Permission::ManageTeam).unwrap(), "manage_team");
    }
```

- [ ] **Step 2: Run — expect FAIL (Permission not defined):**

```bash
cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-domain
```

(bt-domain tests hit no DB — bare `cargo test -p bt-domain` is fine here.)

- [ ] **Step 3: Implement.** Append near the other enums/DTOs (before the test module):

```rust
/// Workspace-global capabilities. Lead↔member data access stays ownership-based
/// (`require_member_access`) and is NOT modeled as a permission.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    ManageTeam,       // 5a: lead workspace UI (Команда/Календарь/профили)
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
        _ => &[],
    }
}
```

Extend `UserDto` and `MeResponse` with the same new field (after `role`):

```rust
    pub permissions: Vec<Permission>,
```

- [ ] **Step 4: Run — expect PASS:**

```bash
cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-domain
```

Note: bt-api will NOT compile until Task 3 fills the new struct fields — that's expected;
do not run bt-api tests in this task.

- [ ] **Step 5: Commit**

```bash
git add crates/bt-domain/src/lib.rs
git commit -m "feat(domain): Permission enum + role matrix + permissions in auth DTOs (slice #5a)"
```

---

### Task 3: bt-api — `require_permission` + permissions in login/me

**Files:**
- Create: `api/crates/bt-api/src/auth/permissions.rs`
- Modify: `api/crates/bt-api/src/auth/mod.rs` (add `pub mod permissions;`)
- Modify: `api/crates/bt-api/src/routes/auth.rs` (fill the new DTO fields; extend tests)
- Modify: `api/crates/bt-api/src/openapi.rs` (register `bt_domain::Permission` schema)

- [ ] **Step 1: Add failing test asserts.** In `routes/auth.rs` tests, extend
`login_succeeds_with_correct_password` (after the existing role assert):

```rust
        assert_eq!(json["user"]["permissions"], serde_json::json!(["manage_team"]));
```

and extend `me_returns_team_id_for_a_lead` (after the team_id assert):

```rust
        assert_eq!(body["permissions"], serde_json::json!(["manage_team"]));
```

- [ ] **Step 2: Implement.** `api/crates/bt-api/src/auth/permissions.rs`:

```rust
use bt_domain::Permission;

use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// 403 unless the caller's role grants the permission.
pub fn require_permission(auth: &AuthUser, p: Permission) -> AppResult<()> {
    if bt_domain::permissions_of(&auth.role).contains(&p) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
```

`auth/mod.rs`: add `pub mod permissions;` next to the existing modules.

`routes/auth.rs` — fill the fields:

```rust
    Ok(Json(LoginResponse {
        token,
        user: UserDto {
            id, name, email,
            permissions: bt_domain::permissions_of(&role).to_vec(),
            role,
        },
    }))
```

```rust
    Ok(Json(MeResponse {
        id, name, email,
        permissions: bt_domain::permissions_of(&role).to_vec(),
        role,
        team_id: team.map(|t| t.0),
    }))
```

(Compute `permissions` BEFORE moving `role` into the struct — order the fields as shown.)

`openapi.rs` `components(schemas(...))`: add `bt_domain::Permission,` after the review schemas.

- [ ] **Step 3: Run the auth tests + the whole API suite (compile check after DTO change):**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api
```

Expected: all PASS (the two extended tests prove the payloads).

- [ ] **Step 4: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): require_permission guard + permissions in login/me (slice #5a)"
```

---

### Task 4: `GET /v1/reviews/pending` + `Review.hr_comment`/`resolved_at`

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (extend `Review`; add `PendingReview`, `RejectReview`)
- Modify: `api/crates/bt-api/src/routes/reviews.rs` (extend `RvRow`/`RV_SELECT`/`rv_from`; make helpers `pub(crate)`)
- Create: `api/crates/bt-api/src/routes/approvals.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`, `openapi.rs`

- [ ] **Step 1: Extend domain DTOs.** In `bt-domain/src/lib.rs`: add to `Review` (after `finalized_at`):

```rust
    pub hr_comment: String,
    pub resolved_at: Option<String>,
```

Append after `CalibrationPeer`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PendingReview {
    pub review: Review,
    pub member_id: uuid::Uuid,
    pub member_name: String,
    pub member_hue: i32,
    pub team_name: String,
    pub discipline_label: String,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct RejectReview {
    pub comment: String,
}
```

- [ ] **Step 2: Extend the Review row mapping** in `routes/reviews.rs`:

`RvRow` becomes (two columns appended):

```rust
type RvRow = (
    Uuid, String, String, i32, Option<i32>, Option<String>, Option<i32>, String,
    chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>,
    String, Option<chrono::DateTime<chrono::Utc>>,
);
```

`RV_SELECT` becomes:

```rust
const RV_SELECT: &str = "SELECT id, period, status::text, from_grade_ord, target_ord, \
    decision::text, to_grade_ord, summary, created_at, finalized_at, \
    hr_comment, resolved_at FROM performance_reviews";
```

`rv_from` gains the two fields:

```rust
        hr_comment: r.10,
        resolved_at: r.11.map(|d| d.to_rfc3339()),
```

Change visibility so `approvals.rs` can reuse them — `type RvRow`, `const RV_SELECT`,
`fn rv_from`, `async fn rv_scores`, `async fn rv_member_status` all become `pub(crate)`:

```rust
pub(crate) type RvRow = (
...
pub(crate) const RV_SELECT: &str = ...
pub(crate) fn rv_from(...)
pub(crate) async fn rv_scores(...)
pub(crate) async fn rv_member_status(...)
```

- [ ] **Step 3: Create `routes/approvals.rs`** with the pending handler stubbed and its tests:

```rust
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::{PendingReview, Permission, RejectReview, Review};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::auth::permissions::require_permission;
use crate::error::{AppError, AppResult};
use crate::routes::reviews::{rv_from, rv_member_status, rv_scores, RvRow, RV_SELECT};

#[utoipa::path(
    get, path = "/v1/reviews/pending",
    responses((status = 200, body = [PendingReview]), (status = 403))
)]
pub async fn list_pending_reviews(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<PendingReview>>> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use crate::app::{build_router, AppState};
    use crate::auth::password::hash_password;
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

    /// Insert an hr_admin into the seeded workspace and return their token.
    /// Self-contained: does not depend on the demo seed providing an HR user.
    async fn hr_token(pool: &sqlx::PgPool) -> String {
        let ws: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM workspaces LIMIT 1")
            .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1, 'hr.test@x.io', $2, 'HR Test', 'hr_admin'::user_role, 200) \
             ON CONFLICT DO NOTHING",
        ).bind(ws.0).bind(hash).execute(pool).await.unwrap();
        login_token(pool, "hr.test@x.io").await
    }

    /// Drive Анна's review to pending via the lead wizard endpoints; returns review id.
    async fn pending_review_for_anna(pool: &sqlx::PgPool, lead_token: &str) -> String {
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Анна Лебедева'",
        ).fetch_one(pool).await.unwrap();
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/members/{}/reviews", anna.0))
                .header("authorization", format!("Bearer {lead_token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str().unwrap().to_string();
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("PATCH").uri(format!("/v1/reviews/{id}"))
                .header("authorization", format!("Bearer {lead_token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"decision":"promote"}"#)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/reviews/{id}/finalize"))
                .header("authorization", format!("Bearer {lead_token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        id
    }

    async fn get_pending(pool: &sqlx::PgPool, token: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri("/v1/reviews/pending")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn pending_queue_requires_permission(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_pending(&pool, &lead).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn pending_queue_lists_reviews_with_member_context(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let id = pending_review_for_anna(&pool, &lead).await;
        let hr = hr_token(&pool).await;

        let (status, json) = get_pending(&pool, &hr).await;
        assert_eq!(status, StatusCode::OK);
        let items = json.as_array().unwrap();
        let anna = items.iter()
            .find(|p| p["review"]["id"] == serde_json::json!(id))
            .expect("Анна's pending review is in the queue");
        assert_eq!(anna["member_name"], "Анна Лебедева");
        assert_eq!(anna["discipline_label"].as_str().unwrap().is_empty(), false);
        assert_eq!(anna["team_name"].as_str().unwrap().is_empty(), false);
        assert_eq!(anna["review"]["status"], "pending");
        assert_eq!(anna["review"]["scores"].as_array().unwrap().len(), 6);
    }
}
```

- [ ] **Step 4: Wiring.**

`routes/mod.rs`: add `pub mod approvals;`

`app.rs` — IMPORTANT: register BEFORE the `/v1/reviews/:id` route so axum doesn't try to
parse `pending` as a uuid (static segments win over captures in axum 0.7, but keep the
explicit order for readability):

```rust
.route("/v1/reviews/pending", get(routes::approvals::list_pending_reviews))
```

`openapi.rs`: `paths(...)` add `crate::routes::approvals::list_pending_reviews,`;
`components(schemas(...))` add `bt_domain::PendingReview,` and `bt_domain::RejectReview,`.

- [ ] **Step 5: Run — expect the two new tests to FAIL (unimplemented), others PASS:**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api approvals::
```

- [ ] **Step 6: Implement the handler:**

```rust
pub async fn list_pending_reviews(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<PendingReview>>> {
    require_permission(&auth, Permission::ApproveReviews)?;

    let ctx: Vec<(Uuid, Uuid, String, i32, String, String)> = sqlx::query_as(
        "SELECT pr.id, tm.id, tm.name, tm.hue, t.name, d.label \
         FROM performance_reviews pr \
         JOIN team_members tm ON tm.id = pr.member_id \
         JOIN teams t ON t.id = tm.team_id \
         JOIN member_grades mg ON mg.member_id = pr.member_id \
         JOIN disciplines d ON d.id = mg.discipline_id \
         WHERE pr.status = 'pending' \
         ORDER BY pr.finalized_at ASC",
    )
    .fetch_all(&state.pool).await?;

    let mut out = Vec::with_capacity(ctx.len());
    for (review_id, member_id, member_name, member_hue, team_name, discipline_label) in ctx {
        let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
            .bind(review_id).fetch_one(&state.pool).await?;
        let scores = rv_scores(&state.pool, review_id).await?;
        out.push(PendingReview {
            review: rv_from(r, scores),
            member_id, member_name, member_hue, team_name, discipline_label,
        });
    }
    Ok(Json(out))
}
```

- [ ] **Step 7: Run — expect PASS (and the full suite still green):**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api
```

- [ ] **Step 8: Commit**

```bash
git add api/crates/bt-api/src api/crates/bt-domain/src
git commit -m "feat(api): pending reviews queue + hr_comment/resolved_at on Review (slice #5a)"
```

---

### Task 5: `POST /v1/reviews/{id}/approve` + `/reject`

**Files:**
- Modify: `api/crates/bt-api/src/routes/approvals.rs`
- Modify: `api/crates/bt-api/src/app.rs`, `openapi.rs` (paths only)

- [ ] **Step 1: Add failing tests** to `approvals.rs` `mod tests`:

```rust
    async fn post_action(
        pool: &sqlx::PgPool, token: &str, id: &str, action: &str, body: Option<&str>,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method("POST")
            .uri(format!("/v1/reviews/{id}/{action}"))
            .header("authorization", format!("Bearer {token}"));
        let req = if let Some(b) = body {
            builder = builder.header("content-type", "application/json");
            builder.body(Body::from(b.to_string())).unwrap()
        } else {
            builder.body(Body::empty()).unwrap()
        };
        let resp = app(pool.clone()).oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn approve_promote_applies_decision(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let id = pending_review_for_anna(&pool, &lead).await;
        let hr = hr_token(&pool).await;

        let (status, json) = post_action(&pool, &hr, &id, "approve", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["status"], "final");
        assert!(json["resolved_at"].is_string());

        let anna: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Анна Лебедева'",
        ).fetch_one(&pool).await.unwrap();
        let mg: (i32, f64, Option<i32>, Option<chrono::NaiveDate>, Option<chrono::NaiveDate>) =
            sqlx::query_as(
                "SELECT grade_ord, compa, target_ord, last_review, next_review \
                 FROM member_grades WHERE member_id = $1",
            ).bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(mg.0, 6, "promote applied: IC5 → IC6");
        assert!((mg.1 - 0.22).abs() < 1e-9, "compa reset to the low band");
        assert_eq!(mg.2, None, "target reached → cleared");
        assert_eq!(mg.3, Some(chrono::Utc::now().date_naive()), "last_review = today");
        assert!(mg.4.unwrap() > chrono::Utc::now().date_naive(), "next_review in the future");

        // Lead scores became the official block levels (prefill was her block levels,
        // untouched in the wizard → equal values; assert one known block).
        let core: (i32,) = sqlx::query_as(
            "SELECT mbl.level_ord FROM member_block_levels mbl \
             JOIN grade_blocks gb ON gb.id = mbl.block_id \
             JOIN member_grades mg ON mg.id = mbl.member_grade_id \
             WHERE mg.member_id = $1 AND gb.key = 'core'",
        ).bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(core.0, 5);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn approve_hold_copies_levels_keeps_grade(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let id = pending_review_for_anna_with(&pool, &lead, "hold").await;
        let hr = hr_token(&pool).await;

        let (status, json) = post_action(&pool, &hr, &id, "approve", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["status"], "final");

        let anna: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Анна Лебедева'",
        ).fetch_one(&pool).await.unwrap();
        let mg: (i32, f64, Option<i32>) = sqlx::query_as(
            "SELECT grade_ord, compa, target_ord FROM member_grades WHERE member_id = $1",
        ).bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(mg.0, 5, "hold keeps the grade");
        assert!((mg.1 - 0.62).abs() < 1e-9, "compa untouched on hold");
        assert_eq!(mg.2, Some(6), "target untouched on hold");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn reject_returns_draft_with_comment(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let id = pending_review_for_anna(&pool, &lead).await;
        let hr = hr_token(&pool).await;

        let (s_empty, _) = post_action(&pool, &hr, &id, "reject", Some(r#"{"comment":"   "}"#)).await;
        assert_eq!(s_empty, StatusCode::BAD_REQUEST);

        let (status, json) = post_action(
            &pool, &hr, &id, "reject", Some(r#"{"comment":"Мало свидетельств по infra"}"#),
        ).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["status"], "draft");
        assert_eq!(json["hr_comment"], "Мало свидетельств по infra");
        assert!(json["finalized_at"].is_null());
        assert!(json["to_grade_ord"].is_null());

        // Lead sees the comment in the ordinary member reviews list.
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Анна Лебедева'",
        ).fetch_one(&pool).await.unwrap();
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/reviews", anna.0))
                .header("authorization", format!("Bearer {lead}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let arr: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(arr.as_array().unwrap().iter()
            .any(|r| r["hr_comment"] == "Мало свидетельств по infra" && r["status"] == "draft"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn approve_and_reject_409_on_non_pending(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let id = pending_review_for_anna(&pool, &lead).await;
        let hr = hr_token(&pool).await;

        let (s1, _) = post_action(&pool, &hr, &id, "approve", None).await;
        assert_eq!(s1, StatusCode::OK);
        let (s2, _) = post_action(&pool, &hr, &id, "approve", None).await;
        assert_eq!(s2, StatusCode::CONFLICT);
        let (s3, _) = post_action(&pool, &hr, &id, "reject", Some(r#"{"comment":"late"}"#)).await;
        assert_eq!(s3, StatusCode::CONFLICT);
        // Lead has no permission at all:
        let (s4, _) = post_action(&pool, &lead, &id, "approve", None).await;
        assert_eq!(s4, StatusCode::FORBIDDEN);
    }
```

Also add the `pending_review_for_anna_with` helper (generalizes the existing one — refactor
`pending_review_for_anna` to delegate):

```rust
    async fn pending_review_for_anna_with(
        pool: &sqlx::PgPool, lead_token: &str, decision: &str,
    ) -> String {
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Анна Лебедева'",
        ).fetch_one(pool).await.unwrap();
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/members/{}/reviews", anna.0))
                .header("authorization", format!("Bearer {lead_token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str().unwrap().to_string();
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("PATCH").uri(format!("/v1/reviews/{id}"))
                .header("authorization", format!("Bearer {lead_token}"))
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"decision":"{decision}"}}"#))).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri(format!("/v1/reviews/{id}/finalize"))
                .header("authorization", format!("Bearer {lead_token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        id
    }

    async fn pending_review_for_anna(pool: &sqlx::PgPool, lead_token: &str) -> String {
        pending_review_for_anna_with(pool, lead_token, "promote").await
    }
```

(Replace the Task-4 version of `pending_review_for_anna` with this pair.)

- [ ] **Step 2: Stubs + wiring, run — expect FAIL.**

Stubs in `approvals.rs`:

```rust
#[utoipa::path(
    post, path = "/v1/reviews/{id}/approve",
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses(
        (status = 200, body = Review), (status = 403), (status = 404),
        (status = 409, description = "Review is not pending"),
    )
)]
pub async fn approve_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Review>> {
    unimplemented!()
}

#[utoipa::path(
    post, path = "/v1/reviews/{id}/reject", request_body = RejectReview,
    params(("id" = uuid::Uuid, Path, description = "Review id")),
    responses(
        (status = 200, body = Review), (status = 400, description = "Empty comment"),
        (status = 403), (status = 404), (status = 409, description = "Review is not pending"),
    )
)]
pub async fn reject_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<RejectReview>,
) -> AppResult<Json<Review>> {
    unimplemented!()
}
```

`app.rs` (after the pending route):

```rust
.route("/v1/reviews/:id/approve", axum::routing::post(routes::approvals::approve_review))
.route("/v1/reviews/:id/reject", axum::routing::post(routes::approvals::reject_review))
```

`openapi.rs` `paths(...)`:

```rust
crate::routes::approvals::approve_review,
crate::routes::approvals::reject_review,
```

Run: `api/scripts/test.sh -p bt-api approvals::` → the four new tests FAIL.

- [ ] **Step 3: Implement:**

```rust
pub async fn approve_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Review>> {
    require_permission(&auth, Permission::ApproveReviews)?;
    rv_member_status(&state.pool, id).await?; // 404 if no such review

    let ctx: (Uuid, Option<String>, Option<i32>) = sqlx::query_as(
        "SELECT member_id, decision::text, to_grade_ord FROM performance_reviews WHERE id = $1",
    )
    .bind(id).fetch_one(&state.pool).await?;
    let (member_id, decision, to_grade) = ctx;

    let mut tx = state.pool.begin().await?;
    // Concurrency-safe transition: only one approve/reject wins.
    let updated = sqlx::query(
        "UPDATE performance_reviews SET status = 'final', resolved_at = now(), resolved_by = $2 \
         WHERE id = $1 AND status = 'pending'",
    )
    .bind(id).bind(auth.id).execute(&mut *tx).await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::Conflict("review is not pending".into()));
    }

    // Lead scores become the official per-block picture — for ANY decision.
    sqlx::query(
        "INSERT INTO member_block_levels (member_grade_id, block_id, level_ord) \
         SELECT mg.id, rs.block_id, rs.lead_ord \
         FROM review_scores rs \
         JOIN performance_reviews pr ON pr.id = rs.review_id \
         JOIN member_grades mg ON mg.member_id = pr.member_id \
         WHERE rs.review_id = $1 \
         ON CONFLICT (member_grade_id, block_id) DO UPDATE SET level_ord = EXCLUDED.level_ord",
    )
    .bind(id).execute(&mut *tx).await?;

    if decision.as_deref() == Some("promote") {
        let to = to_grade.unwrap_or(0).max(1);
        sqlx::query(
            "UPDATE member_grades SET grade_ord = $2, compa = 0.22, \
             target_ord = CASE WHEN target_ord IS NOT NULL AND $2 >= target_ord \
                               THEN NULL ELSE target_ord END \
             WHERE member_id = $1",
        )
        .bind(member_id).bind(to).execute(&mut *tx).await?;
    }
    sqlx::query(
        "UPDATE member_grades SET last_review = CURRENT_DATE, \
         next_review = (CURRENT_DATE + INTERVAL '6 months')::date \
         WHERE member_id = $1",
    )
    .bind(member_id).execute(&mut *tx).await?;
    tx.commit().await?;

    let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
        .bind(id).fetch_one(&state.pool).await?;
    let scores = rv_scores(&state.pool, id).await?;
    Ok(Json(rv_from(r, scores)))
}

pub async fn reject_review(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<RejectReview>,
) -> AppResult<Json<Review>> {
    require_permission(&auth, Permission::ApproveReviews)?;
    if body.comment.trim().is_empty() {
        return Err(AppError::BadRequest("comment is required to return a review".into()));
    }
    rv_member_status(&state.pool, id).await?; // 404 if no such review

    let updated = sqlx::query(
        "UPDATE performance_reviews SET status = 'draft', hr_comment = $2, \
         finalized_at = NULL, to_grade_ord = NULL \
         WHERE id = $1 AND status = 'pending'",
    )
    .bind(id).bind(body.comment.trim()).execute(&state.pool).await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::Conflict("review is not pending".into()));
    }

    let r: RvRow = sqlx::query_as(&format!("{RV_SELECT} WHERE id = $1"))
        .bind(id).fetch_one(&state.pool).await?;
    let scores = rv_scores(&state.pool, id).await?;
    Ok(Json(rv_from(r, scores)))
}
```

- [ ] **Step 4: Run all approvals + full suite — expect PASS:**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api
```

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): approve/reject pending reviews — decision finally applied (slice #5a)"
```

---

### Task 6: Seed — HR user + Игорь's pending review (+ fix the calibration test)

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs`
- Modify: `api/crates/bt-api/src/routes/reviews.rs` (calibration test only)

- [ ] **Step 1: Seed the HR user.** In `seed_demo`, right after the lead user INSERT
(`let lead_id = …` block, ~line 29-40), add:

```rust
    // HR administrator (slice #5a): sees the approvals queue, no team.
    sqlx::query(
        "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
         VALUES ($1, $2, $3, $4, 'hr_admin'::user_role, $5)",
    )
    .bind(ws_id).bind("o.klimova@beeteam.io").bind(seed_hash("demo1234"))
    .bind("Ольга Климова").bind(200)
    .execute(&mut *tx).await?;
```

(Match the exact column list/binding style of the lead INSERT above it — read it first.)

- [ ] **Step 2: Seed Игорь's pending review.** After the slice-#4 block
(`// ── Self-assessment + review history for Анна (slice #4) ──`), before `tx.commit()`:

```rust
    // ── Pending review for Игорь (slice #5a): the HR queue is non-empty out of the box ──
    {
        let igor: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM team_members WHERE name = 'Игорь Петров' AND team_id = $1",
        ).bind(team_id).fetch_one(&mut *tx).await?;
        let mg: (uuid::Uuid, uuid::Uuid) = sqlx::query_as(
            "SELECT id, discipline_id FROM member_grades WHERE member_id = $1",
        ).bind(igor.0).fetch_one(&mut *tx).await?;

        let submitted = now - day * 2;
        let period = format!(
            "{} {}",
            if chrono::Datelike::month(&submitted) <= 6 { "H1" } else { "H2" },
            chrono::Datelike::year(&submitted)
        );
        let review: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO performance_reviews \
             (member_id, period, status, from_grade_ord, target_ord, decision, to_grade_ord, \
              summary, created_by, created_at, finalized_at) \
             VALUES ($1,$2,'pending',4,5,'promote'::review_decision,5,$3,$4,$5,$5) RETURNING id",
        )
        .bind(igor.0).bind(&period)
        .bind("Стабильно закрывает сервисы уровня IC5: вёл миграцию платёжного контура, поднял перфоманс-тесты. Готов к повышению.")
        .bind(lead_id).bind(submitted)
        .fetch_one(&mut *tx).await?;

        // Lead scores: his block levels [4,5,4,4,3,3] with three +1 bumps.
        // self_ord stays NULL — Игорь has no seeded self-assessment.
        let lead_scores: [(&str, i32); 6] =
            [("stack", 5), ("core", 5), ("arch", 5), ("infra", 4), ("ai", 4), ("impact", 3)];
        for (bkey, lvl) in lead_scores.iter() {
            let block: (uuid::Uuid,) = sqlx::query_as(
                "SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2",
            ).bind(*bkey).bind(mg.1).fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO review_scores (review_id, block_id, self_ord, lead_ord) \
                 VALUES ($1,$2,NULL,$3)",
            )
            .bind(review.0).bind(block.0).bind(*lvl)
            .execute(&mut *tx).await?;
        }
    }
```

- [ ] **Step 3: Extend seed test asserts** (in the same test that checks self-assessments):

```rust
        let users: (i64,) = sqlx::query_as("SELECT count(*) FROM users")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(users.0, 2, "lead + HR admin");
        let pending: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM performance_reviews WHERE status = 'pending'",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(pending.0, 1, "Игорь's review awaits HR");
```

- [ ] **Step 4: Fix the broken calibration test.** In `routes/reviews.rs`,
`calibration_returns_same_discipline_same_grade_peers` currently does
`post_review(&pool, &token, igor)` — with the seeded pending review that now returns 409.
Replace the review-creation lines with a lookup of the seeded review:

Replace:

```rust
        let igor = member_id(&pool, "Игорь Петров").await;
        let (_, draft) = post_review(&pool, &token, igor).await;
        let id = draft["id"].as_str().unwrap();
```

with:

```rust
        // Игорь already has a seeded pending review (slice #5a) — use it.
        let row: (uuid::Uuid,) = sqlx::query_as(
            "SELECT pr.id FROM performance_reviews pr \
             JOIN team_members tm ON tm.id = pr.member_id \
             WHERE tm.name = 'Игорь Петров' AND pr.status = 'pending'",
        ).fetch_one(&pool).await.unwrap();
        let id = row.0.to_string();
        let id = id.as_str();
```

- [ ] **Step 5: Run both crates — expect PASS:**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db && api/scripts/test.sh -p bt-api
```

(Full bt-api run matters: the seeded pending review must not break any other test.)

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-db/src/seed.rs api/crates/bt-api/src/routes/reviews.rs
git commit -m "feat(seed): HR admin Ольга + pending review for Игорь (slice #5a)"
```

---

### Task 7: Regenerate web API types

**Files:**
- Modify: `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Re-seed dev DB + start the API:**

```bash
cd /Users/lebedev.v/projects/beeteam
docker compose up -d postgres
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api
```

(Keep it running. If an old bt-api process is alive, `pkill -f "target/debug/bt-api"` first.)

- [ ] **Step 2: Regenerate + verify (second terminal):**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api
grep -c "PendingReview" lib/api/schema.d.ts && grep -c '"/v1/reviews/pending"' lib/api/schema.d.ts
```

Expected: both counts > 0.

- [ ] **Step 3: Commit**

```bash
git add lib/api/schema.d.ts
git commit -m "feat(api): register approval paths + regen web types (slice #5a)"
```

---

### Task 8: Web session permissions + approval hooks

**Files:**
- Modify: `web/lib/auth.ts`
- Create: `web/lib/query/approvals.ts`

- [ ] **Step 1: Extend the server session.** `web/lib/auth.ts` — `SessionUser` gains
`permissions`:

```ts
export type SessionUser = {
  id: string; name: string; email: string; role: string;
  teamId: string | null;
  permissions: string[];
};
```

and `getSessionUser` maps it (extend the `me` type annotation and the return object):

```ts
    const me = (await res.json()) as {
      id: string; name: string; email: string; role: string;
      team_id: string | null; permissions?: string[];
    };
    return {
      id: me.id, name: me.name, email: me.email, role: me.role,
      teamId: me.team_id, permissions: me.permissions ?? [],
    };
```

Add a tiny helper at the bottom:

```ts
export function hasPermission(user: Pick<SessionUser, "permissions">, p: string): boolean {
  return user.permissions.includes(p);
}
```

- [ ] **Step 2: Create `web/lib/query/approvals.ts`:**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type PendingReview = components["schemas"]["PendingReview"];

export function usePendingReviews() {
  return useQuery<PendingReview[]>({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/reviews/pending");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useResolveMutation(action: "approve" | "reject") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reviewId, comment }: { reviewId: string; comment?: string }) => {
      const { data, error } =
        action === "approve"
          ? await api.POST("/v1/reviews/{id}/approve", { params: { path: { id: reviewId } } })
          : await api.POST("/v1/reviews/{id}/reject", {
              params: { path: { id: reviewId } },
              body: { comment: comment ?? "" },
            });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-reviews"] });
      qc.invalidateQueries({ queryKey: ["member-reviews"] });
    },
  });
}

export function useApproveReview() {
  return useResolveMutation("approve");
}

export function useRejectReview() {
  return useResolveMutation("reject");
}
```

- [ ] **Step 3: Verify + commit:**

```bash
cd /Users/lebedev.v/projects/beeteam/web && npx tsc --noEmit && pnpm vitest run 2>&1 | tail -3
git add lib/auth.ts lib/query/approvals.ts
git commit -m "feat(web): session permissions + approval hooks (slice #5a)"
```

---

### Task 9: Permission-driven sidebar, page guards, login redirect (TDD)

**Files:**
- Modify: `web/components/Sidebar.tsx`
- Modify: `web/components/NavItem.tsx` (add the `approvals` icon)
- Create: `web/components/NoAccess.tsx`
- Modify: `web/app/(app)/page.tsx`, `web/app/(app)/calendar/page.tsx`,
  `web/app/(app)/profile/[id]/page.tsx` (manage_team guards)
- Modify: `web/app/login/LoginForm.tsx` (permission-based redirect)
- Create: `web/components/__tests__/SidebarNav.test.tsx`

- [ ] **Step 1: Failing test** — `web/components/__tests__/SidebarNav.test.tsx`. Test the
pure visibility helper (no router mocks needed):

```tsx
import { describe, it, expect } from "vitest";
import { visibleNavItems } from "../Sidebar";

const ids = (perms: string[]) => visibleNavItems(perms).map((n) => n.id);

describe("visibleNavItems", () => {
  it("lead sees the team workspace and no approvals", () => {
    const v = ids(["manage_team"]);
    expect(v).toContain("team");
    expect(v).toContain("calendar");
    expect(v).toContain("grades");
    expect(v).not.toContain("approvals");
  });

  it("hr sees approvals + grades only", () => {
    const v = ids(["approve_reviews", "edit_framework", "edit_salary_bands"]);
    expect(v).toEqual(["grades", "approvals"]);
  });

  it("no permissions → only ungated items", () => {
    expect(ids([])).toEqual(["grades"]);
  });
});
```

Run: `cd web && pnpm vitest run components/__tests__/SidebarNav.test.tsx` → FAIL
(`visibleNavItems` not exported).

- [ ] **Step 2: Rework `Sidebar.tsx`.** Replace the `TEAM_NAV` block and rendering with a
permission-aware list (full new file):

```tsx
"use client";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { NavItem } from "./NavItem";
import { Bell, LogOut } from "lucide-react";
import { hasPermission, type SessionUser } from "@/lib/auth";
import { usePendingReviews } from "@/lib/query/approvals";

type Nav = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  count?: number;
  disabled?: boolean;
  requires: string | null; // permission, or null = visible to everyone
};

const NAV: Nav[] = [
  { id: "team", label: "Моя команда", icon: "team", count: 8, href: "/", requires: "manage_team" },
  { id: "calendar", label: "Календарь", icon: "calendar", href: "/calendar", requires: "manage_team" },
  { id: "grades", label: "Грейды", icon: "layers", href: "/grades", requires: null },
  { id: "approvals", label: "Согласование", icon: "approvals", href: "/approvals", requires: "approve_reviews" },
  { id: "fields", label: "Конструктор полей", icon: "fields", disabled: true, requires: "manage_team" },
  { id: "export", label: "Экспорт", icon: "download", disabled: true, requires: "manage_team" },
];

const ADMIN_NAV = [
  { id: "admin-team", label: "Команды", icon: "team", disabled: true },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
] as const;

export function visibleNavItems(permissions: string[]): Nav[] {
  return NAV.filter((n) => n.requires === null || permissions.includes(n.requires));
}

function ApprovalsCount() {
  const pending = usePendingReviews();
  const n = pending.data?.length ?? 0;
  if (n === 0) return null;
  return <span className="tabular text-ink-3 text-xs">{n}</span>;
}

export function Sidebar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = visibleNavItems(user.permissions);
  const isHr = hasPermission(user, "approve_reviews");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-elev p-4">
      <div className="flex items-center justify-between px-1.5">
        <Logo className="text-[15px]" />
        <button className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Уведомления">
          <Bell size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">
          {isHr ? "HR" : "Команда"}
        </div>
        {items.map((n) => {
          const active = n.href
            ? n.href === "/"
              ? pathname === "/"
              : pathname.startsWith(n.href)
            : false;
          return (
            <NavItem
              key={n.id}
              label={n.label}
              icon={n.icon}
              count={n.count}
              active={active}
              disabled={n.disabled ?? false}
              href={n.href}
              trailing={n.id === "approvals" ? <ApprovalsCount /> : undefined}
            />
          );
        })}
      </div>

      {!isHr && (
        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
          {ADMIN_NAV.map((n) => (
            <NavItem key={n.id} label={n.label} icon={n.icon} disabled={n.disabled} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-line bg-bg-elev p-2.5">
        <Avatar name={user.name} hue={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">{user.name}</div>
          <div className="text-[11.5px] text-ink-3">{user.role}</div>
        </div>
        <button onClick={logout} className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint" title="Выйти" aria-label="Выйти">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
```

`NavItem.tsx` changes: add to `ICONS` map `approvals: ClipboardCheck` (import
`ClipboardCheck` from lucide-react), and add an optional `trailing?: React.ReactNode` prop
rendered after the count:

```tsx
      {count != null && <span className="tabular text-ink-3 text-xs">{count}</span>}
      {trailing}
```

(and `trailing` in the props type/destructuring.)

- [ ] **Step 3: `web/components/NoAccess.tsx`:**

```tsx
import Link from "next/link";
import { ShieldOff } from "lucide-react";

export function NoAccess() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <ShieldOff size={28} className="text-ink-4" />
      <div className="text-[15px] font-semibold text-ink">Недостаточно прав</div>
      <p className="max-w-[360px] text-[12.5px] leading-relaxed text-ink-3">
        У вашей роли нет доступа к этому разделу.
      </p>
      <Link href="/grades" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
        К грейдам
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Page guards.**

`web/app/(app)/page.tsx`:

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { TeamListClient } from "./TeamListClient";

export default async function TeamPage() {
  const user = await getSessionUser(); // layout already guaranteed non-null
  if (user && !hasPermission(user, "manage_team")) {
    // HR lands on the queue instead of an empty team screen.
    if (hasPermission(user, "approve_reviews")) redirect("/approvals");
    return <NoAccess />;
  }
  return <TeamListClient teamId={user?.teamId ?? null} />;
}
```

`web/app/(app)/calendar/page.tsx`:

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export default async function CalendarPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "manage_team")) return <NoAccess />;
  return <CalendarClient teamId={user?.teamId ?? null} />;
}
```

`web/app/(app)/profile/[id]/page.tsx`: make the component async, add the same guard at the
top (before the existing return; keep everything else intact):

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
// …existing imports stay…

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await getSessionUser();
  if (user && !hasPermission(user, "manage_team")) return <NoAccess />;
  // …existing body unchanged…
```

- [ ] **Step 5: Login redirect.** `web/app/login/LoginForm.tsx` — the submit handler
currently does `router.push("/")` after a successful POST to `/api/auth/login`. The route
returns `{ user }` (UserDto now carries `permissions`). Change to:

```tsx
      const data = (await res.json()) as { user?: { permissions?: string[] } };
      const perms = data.user?.permissions ?? [];
      router.push(perms.includes("approve_reviews") && !perms.includes("manage_team") ? "/approvals" : "/");
```

(Read the file first and adapt to its exact shape — only the destination logic changes.)

- [ ] **Step 6: Run tests — expect PASS** (`SidebarNav.test.tsx` green, suite green,
tsc clean):

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run && npx tsc --noEmit
```

Note: `/approvals/page.tsx` doesn't exist until Task 10 — the sidebar link 404s in the
browser but nothing in the test suite references the route. That's fine for this commit.

- [ ] **Step 7: Commit**

```bash
git add components app lib
git commit -m "feat(web): permission-driven sidebar + page guards + HR login redirect (slice #5a)"
```

---

### Task 10: «Согласование» screen (TDD)

**Files:**
- Create: `web/app/(app)/approvals/page.tsx`
- Create: `web/components/approvals/ApprovalsClient.tsx`
- Create: `web/components/approvals/ApprovalDetail.tsx`
- Create: `web/components/approvals/ScoresReadonly.tsx`
- Create: `web/components/approvals/RejectDialog.tsx`
- Modify: `web/components/grades/ReviewHistory.tsx` (export `DECISION_LABEL`)
- Create: `web/components/__tests__/Approvals.test.tsx`

- [ ] **Step 1: Failing tests** — `web/components/__tests__/Approvals.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScoresReadonly } from "../approvals/ScoresReadonly";
import { ApprovalDetail } from "../approvals/ApprovalDetail";
import { RejectDialog } from "../approvals/RejectDialog";

const SCORES = [
  { block_id: "b1", block_key: "stack", block_name: "Стек", self_ord: 5, lead_ord: 5 },
  { block_id: "b2", block_key: "arch", block_name: "Архитектура", self_ord: null, lead_ord: 5 },
];

const REVIEW = {
  id: "r1", period: "H1 2026", status: "pending", from_grade_ord: 4, target_ord: 5,
  decision: "promote", to_grade_ord: 5, summary: "Готов к повышению",
  created_at: "2026-06-10T10:00:00Z", finalized_at: "2026-06-11T10:00:00Z",
  hr_comment: "", resolved_at: null, scores: SCORES,
};

const PENDING = {
  review: REVIEW, member_id: "m1", member_name: "Игорь Петров", member_hue: 200,
  team_name: "Платформа", discipline_label: "Backend",
};

describe("ScoresReadonly", () => {
  it("renders rows with mismatch pills and the no-self note", () => {
    render(<ScoresReadonly scores={SCORES as never} />);
    expect(screen.getByText("Стек")).toBeInTheDocument();
    expect(screen.getByText("совпадает")).toBeInTheDocument();
    expect(screen.getByText(/Самооценка не получена/)).toBeInTheDocument();
  });
});

describe("ApprovalDetail", () => {
  it("renders member header, decision, summary and actions", () => {
    render(
      <ApprovalDetail item={PENDING as never} onApprove={() => {}} onReject={() => {}} busy={false} />,
    );
    expect(screen.getByText("Игорь Петров")).toBeInTheDocument();
    expect(screen.getByText(/Платформа · Backend/)).toBeInTheDocument();
    expect(screen.getByText("Готов к повышению")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Согласовать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть лиду" })).toBeInTheDocument();
  });

  it("fires onApprove from the confirm dialog with effects listed", () => {
    const onApprove = vi.fn();
    render(<ApprovalDetail item={PENDING as never} onApprove={onApprove} onReject={() => {}} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Согласовать" }));
    expect(screen.getByText(/IC4 → IC5/)).toBeInTheDocument();
    expect(screen.getByText(/следующее ревью через 6 мес/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(onApprove).toHaveBeenCalledWith("r1");
  });
});

describe("RejectDialog", () => {
  it("disables submit until a comment is entered", () => {
    const onSubmit = vi.fn();
    render(<RejectDialog onSubmit={onSubmit} onClose={() => {}} busy={false} />);
    const btn = screen.getByRole("button", { name: "Вернуть лиду" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Причина возврата"), { target: { value: "Мало свидетельств" } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith("Мало свидетельств");
  });
});
```

Run: `pnpm vitest run components/__tests__/Approvals.test.tsx` → FAIL (modules missing).

- [ ] **Step 2: Export the decision labels.** In `web/components/grades/ReviewHistory.tsx`
change `const DECISION_LABEL` to `export const DECISION_LABEL`.

- [ ] **Step 3: `ScoresReadonly.tsx`:**

```tsx
import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";
import type { ReviewScore } from "@/lib/query/reviews";

export function ScoresReadonly({ scores }: { scores: ReviewScore[] }) {
  const hasSelf = scores.some((s) => s.self_ord != null);
  return (
    <div className="space-y-1.5">
      {!hasSelf && (
        <p className="text-[12px] text-ink-3">Самооценка не получена — показана только оценка лида.</p>
      )}
      {scores.map((s) => {
        const gap = s.self_ord != null ? s.self_ord - s.lead_ord : null;
        return (
          <div key={s.block_id} className="flex items-center gap-3 rounded-lg bg-bg-tint px-3 py-2">
            <span className="w-[160px] truncate text-[12.5px] text-ink-2">{s.block_name}</span>
            <span className="text-[12px] tabular text-ink-3">
              {s.self_ord != null ? <>○ IC{s.self_ord}</> : "—"}
            </span>
            <span className={cn("text-[12px] font-semibold tabular text-ink")}>● IC{s.lead_ord}</span>
            <span className="ml-auto">
              {gap != null && gap !== 0 && (
                <Pill variant={Math.abs(gap) >= 2 ? "miss" : "warn"}>
                  расхождение {gap > 0 ? `+${gap}` : gap}
                </Pill>
              )}
              {gap === 0 && <Pill variant="ok" dot>совпадает</Pill>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `RejectDialog.tsx`:**

```tsx
"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";

export function RejectDialog({
  onSubmit, onClose, busy,
}: {
  onSubmit: (comment: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <Modal title="Вернуть лиду" onClose={onClose}>
      <label htmlFor="reject-comment" className="mb-2 block text-[12.5px] text-ink-2">
        Причина возврата
      </label>
      <textarea
        id="reject-comment"
        rows={4}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Что нужно доработать лиду перед повторной отправкой…"
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
          Отмена
        </button>
        <button
          type="button"
          disabled={comment.trim().length === 0 || busy}
          onClick={() => onSubmit(comment.trim())}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        >
          Вернуть лиду
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: `ApprovalDetail.tsx`:**

```tsx
"use client";
import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { Modal } from "@/components/Modal";
import { DECISION_LABEL } from "@/components/grades/ReviewHistory";
import { ScoresReadonly } from "./ScoresReadonly";
import { RejectDialog } from "./RejectDialog";
import type { PendingReview } from "@/lib/query/approvals";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function ApprovalDetail({
  item, onApprove, onReject, busy,
}: {
  item: PendingReview;
  onApprove: (reviewId: string) => void;
  onReject: (reviewId: string, comment: string) => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const r = item.review;
  const promo = r.decision === "promote";
  const effects = promo
    ? `IC${r.from_grade_ord} → IC${r.to_grade_ord ?? r.from_grade_ord} · compa в низ новой полосы · следующее ревью через 6 мес`
    : "уровни по блокам обновятся по оценке лида · следующее ревью через 6 мес";

  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={item.member_name} hue={item.member_hue} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold text-ink">{item.member_name}</div>
          <div className="text-[12px] text-ink-3">
            {item.team_name} · {item.discipline_label} · {r.period} · отправлено {fmt(r.finalized_at)}
          </div>
        </div>
        <Pill variant="accent">
          {r.decision ? DECISION_LABEL[r.decision] ?? r.decision : "—"}
        </Pill>
      </div>

      <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-4">
        Оценка по блокам · IC{r.from_grade_ord}{r.target_ord != null && <> → цель IC{r.target_ord}</>}
      </div>
      <ScoresReadonly scores={r.scores} />

      {r.summary && (
        <div className="mt-4">
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-4">Резюме лида</div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{r.summary}</p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-line-2 pt-4">
        <button type="button" onClick={() => setRejecting(true)} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">
          <Undo2 size={14} /> Вернуть лиду
        </button>
        <button type="button" onClick={() => setConfirming(true)} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          <Check size={14} /> Согласовать
        </button>
      </div>

      {confirming && (
        <Modal title="Согласовать ревью" onClose={() => setConfirming(false)}>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {item.member_name} · {effects}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
              Отмена
            </button>
            <button type="button" disabled={busy}
              onClick={() => { setConfirming(false); onApprove(r.id); }}
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
      {rejecting && (
        <RejectDialog
          busy={busy}
          onClose={() => setRejecting(false)}
          onSubmit={(comment) => { setRejecting(false); onReject(r.id, comment); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: `ApprovalsClient.tsx`:**

```tsx
"use client";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { cn } from "@/lib/utils";
import { DECISION_LABEL } from "@/components/grades/ReviewHistory";
import { usePendingReviews, useApproveReview, useRejectReview } from "@/lib/query/approvals";
import { ApprovalDetail } from "./ApprovalDetail";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ApprovalsClient() {
  const pending = usePendingReviews();
  const approve = useApproveReview();
  const reject = useRejectReview();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (pending.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (pending.isError)
    return <div className="m-6 rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить очередь.</div>;

  const items = pending.data ?? [];
  const selected = items.find((p) => p.review.id === selectedId) ?? items[0] ?? null;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-[20px] font-bold tracking-tight text-ink">Согласование</h1>
      <p className="mb-5 text-[12.5px] text-ink-3">
        Performance Review, ожидающие решения HR · {items.length}
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-bg-elev p-8 text-center text-[13px] text-ink-3">
          Нет ревью на согласовании.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-2">
            {items.map((p) => (
              <button
                key={p.review.id}
                type="button"
                onClick={() => setSelectedId(p.review.id)}
                data-active={selected?.review.id === p.review.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
                  selected?.review.id === p.review.id
                    ? "border-brand bg-brand-soft/40"
                    : "border-line bg-bg-elev hover:bg-bg-tint",
                )}
              >
                <Avatar name={p.member_name} hue={p.member_hue} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.member_name}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {p.team_name} · {p.discipline_label} ·{" "}
                    <span className="tabular">IC{p.review.from_grade_ord} → IC{p.review.to_grade_ord ?? p.review.from_grade_ord}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill variant="accent">
                    {p.review.decision ? DECISION_LABEL[p.review.decision] ?? p.review.decision : "—"}
                  </Pill>
                  <span className="text-[11px] text-ink-4">{fmt(p.review.finalized_at)}</span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <ApprovalDetail
              item={selected}
              busy={busy}
              onApprove={(reviewId) => approve.mutate({ reviewId }, { onSuccess: () => setSelectedId(null) })}
              onReject={(reviewId, comment) =>
                reject.mutate({ reviewId, comment }, { onSuccess: () => setSelectedId(null) })}
            />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `web/app/(app)/approvals/page.tsx`:**

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { ApprovalsClient } from "@/components/approvals/ApprovalsClient";

export default async function ApprovalsPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "approve_reviews")) return <NoAccess />;
  return <ApprovalsClient />;
}
```

- [ ] **Step 8: Run — expect PASS** (new tests + suite + tsc):

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add app components
git commit -m "feat(web): согласование screen — queue, detail, approve/reject (slice #5a)"
```

---

### Task 11: Lead-side return visibility (TDD)

**Files:**
- Modify: `web/components/review/ReviewModal.tsx` (hr_comment banner)
- Modify: `web/components/grades/GradeHero.tsx` (returned pill)
- Modify: `web/components/grades/ReviewHistory.tsx` (resolved_at date)
- Modify: `web/app/(app)/profile/[id]/GradeTab.tsx` (pass `returned`)
- Modify: `web/components/__tests__/ReviewHistory.test.tsx`

- [ ] **Step 1: Failing tests.** In `ReviewHistory.test.tsx`:

Update the fixtures (the `Review` type now has the new fields):

```tsx
const FINAL = {
  id: "r1", period: "H2 2025", status: "final", from_grade_ord: 4, target_ord: 5,
  decision: "promote", to_grade_ord: 5, summary: "Повышение до IC5",
  created_at: "2025-11-01T10:00:00Z", finalized_at: "2025-11-01T10:00:00Z",
  hr_comment: "", resolved_at: "2025-11-03T10:00:00Z", scores: [],
};
```

Add tests:

```tsx
  it("final rows show the resolved date", () => {
    render(<ReviewHistory reviews={[FINAL] as never} codeOf={codeOf} />);
    expect(screen.getByText(/3 нояб\. 2025/)).toBeInTheDocument();
  });
```

and in the `GradeHero review action` describe:

```tsx
  it("shows the returned pill for a draft returned by HR", () => {
    render(<GradeHero {...HERO} activeReview="draft" returned onOpenReview={() => {}} />);
    expect(screen.getByText("возвращено HR")).toBeInTheDocument();
    expect(screen.queryByText("черновик")).not.toBeInTheDocument();
  });
```

Run: `pnpm vitest run components/__tests__/ReviewHistory.test.tsx` → the two new tests FAIL.

- [ ] **Step 2: Implement.**

`ReviewHistory.tsx` — date uses resolved first:

```tsx
                <span className="ml-auto text-[11px] text-ink-4">{fmt(r.resolved_at ?? r.finalized_at)}</span>
```

`GradeHero.tsx` — add optional prop `returned?: boolean` (type + destructure with default
`false`); the draft pill becomes:

```tsx
              {activeReview === "draft" && (
                <Pill variant="accent">{returned ? "возвращено HR" : "черновик"}</Pill>
              )}
```

`GradeTab.tsx` — pass it (next to the other GradeHero props):

```tsx
          returned={Boolean(activeDraft && activeDraft.hr_comment)}
```

`ReviewModal.tsx` — at the TOP of the body div (`<div className="max-h-[62vh] …">`),
before the step content:

```tsx
        {review.status === "draft" && review.hr_comment && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-brand/40 bg-brand-soft p-3 text-[12.5px] text-ink-2">
            <Undo2 size={15} className="mt-0.5 shrink-0 text-brand-strong" />
            <div>
              <b>Возвращено HR:</b> {review.hr_comment}
            </div>
          </div>
        )}
```

(import `Undo2` in the existing lucide-react import line.)

- [ ] **Step 3: Run — expect PASS:**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components app
git commit -m "feat(web): возвращено-HR banner + pill + resolved dates for leads (slice #5a)"
```

---

### Task 12: e2e + full verification

**Files:**
- Create: `web/e2e/approvals.spec.ts`

- [ ] **Step 1: Re-seed the dev DB** (Игорь must be pending, Анна clean):

```bash
cd /Users/lebedev.v/projects/beeteam
pkill -f "target/debug/bt-api" || true
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api
```

- [ ] **Step 2: Write `web/e2e/approvals.spec.ts`.** Serial; assertions are scoped to
Игорь (other specs may leave Анна pending if run earlier — never assert total emptiness):

```ts
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("HR returns Игорь's review to the lead", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await expect(page.getByText("Согласование")).toBeVisible();

  await page.getByRole("button", { name: /Игорь Петров/ }).click();
  await expect(page.getByText("Готов к повышению")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть лиду" }).first().click();
  await page.getByLabel("Причина возврата").fill("Добавьте свидетельства по infra-блоку");
  await page.getByRole("button", { name: "Вернуть лиду" }).last().click();

  await expect(page.getByRole("button", { name: /Игорь Петров/ })).toHaveCount(0, { timeout: 10_000 });
});

test("lead re-finalizes the returned review", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Игорь Петров" }).first().click();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();

  await expect(page.getByText("возвращено HR")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Продолжить ревью/ }).click();
  const dialog = page.getByRole("dialog", { name: "Performance Review" });
  await expect(dialog.getByText(/Возвращено HR: Добавьте свидетельства/)).toBeVisible();

  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  // Decision «promote» persisted through the return — finalize is enabled.
  await dialog.getByRole("button", { name: "Завершить ревью" }).click();
  await expect(page.getByText("На согласовании HR")).toBeVisible({ timeout: 10_000 });
});

test("HR approves and Игорь becomes IC5", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });

  await page.getByRole("button", { name: /Игорь Петров/ }).click();
  await page.getByRole("button", { name: "Согласовать" }).click();
  await expect(page.getByText(/IC4 → IC5/).last()).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("button", { name: /Игорь Петров/ })).toHaveCount(0, { timeout: 10_000 });

  // Switch to the lead and verify the applied grade.
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Игорь Петров" }).first().click();
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page.getByText("IC5", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("История ревью")).toBeVisible();
});
```

- [ ] **Step 3: Run the spec:**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e e2e/approvals.spec.ts
```

Expected: 3 passed. Debug locator failures against test-results/ artifacts; fix TEST
locators to match real UI (report any app-code change). Note the spec mutates the DB —
re-seed before re-running.

- [ ] **Step 4: Full verification** (re-seed first so review.spec.ts has a clean Анна and
approvals.spec.ts a pending Игорь):

```bash
cd /Users/lebedev.v/projects/beeteam
pkill -f "target/debug/bt-api" || true
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api &
sleep 20
api/scripts/test.sh 2>&1 | grep -E "test result"
cd web && pnpm vitest run 2>&1 | tail -3 && npx tsc --noEmit && pnpm test:e2e 2>&1 | tail -5
```

Expected: API suites green; vitest green; tsc clean; ALL e2e specs pass (auth, teamlist,
profile, meeting-drawer, goals, files, calendar, grades, member-grade, grade-evidence,
review, approvals). If review.spec and approvals.spec conflict on ordering, re-seed and run
them individually — both must pass on a fresh seed.

- [ ] **Step 5: Commit**

```bash
git add e2e/approvals.spec.ts
git commit -m "test(e2e): HR approval flow — return, re-finalize, approve (slice #5a)"
```

---

### Task 13: Local review gate

Re-seed once more (fresh queue with Игорь pending), bring everything up
(`docker compose up -d`, `cargo run -p bt-api`, `pnpm dev`) and hand off for visual review:
HR login `o.klimova@beeteam.io` / `demo1234` → «Согласование»; lead login as usual.
**Wait for the user's merge command** — no merge, no push.
