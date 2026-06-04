# BeeTeam Goals CRUD Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the profile's «Цели и развитие» tab fully editable — add/edit/delete OKRs, development items, and competencies — via a lightweight modal, backed by nine new mutating endpoints.

**Architecture:** Nine flat-resource endpoints (`POST/PATCH/DELETE` on `/v1/goals`, `/v1/development-items`, `/v1/competencies`) in a new `routes/goals.rs`, each guarded by the existing `require_member_access` and validated with `validator`, mirroring the slice-5 meeting mutations. Frontend: a reusable `Modal`, nine `useMutation` hooks that invalidate `["member-goals", memberId]`, three entity forms, three edit-modal wrappers, and «+ Добавить»/«Изменить» affordances wired into `GoalsTab`.

**Tech Stack:** Rust (axum, sqlx, utoipa, validator), Postgres; Next.js 14, TypeScript, TanStack Query (mutations), Tailwind tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-04-beeteam-goals-crud-design.md`

---

## Conventions (read once)

- Mirror the slice-5 mutation patterns: read `api/crates/bt-api/src/routes/meetings.rs` (create/update/delete: `Json<T>` body, `body.validate()→AppError::BadRequest`, `require_member_access`, COALESCE update, `RETURNING`/re-select, `StatusCode::CREATED`/`NO_CONTENT`) and `web/lib/query/meetings.ts` (useMutation + `api.POST/PATCH/DELETE`, `if (error) throw error`, `onSuccess` invalidation).
- Errors: `AppError::{Forbidden→403, NotFound→404, BadRequest(String)→400, Conflict→409, Db}`, `AppResult<T>`. Ownership guard `require_member_access(&auth, member_id, &pool)` is `pub` in `routes/members.rs`.
- DTOs in `api/crates/bt-domain/src/lib.rs` (response DTOs `Goal`, `DevItem`, `Competency` already exist; add request DTOs). Derive `Deserialize, ToSchema, Validate` on requests.
- Routes registered in `api/crates/bt-api/src/app.rs` protected router; modules in `api/crates/bt-api/src/routes/mod.rs`; OpenAPI in `openapi.rs`.
- Backend tests: `#[sqlx::test(migrations = "../bt-db/migrations")]`, drive `app(pool)` via `tower::ServiceExt::oneshot`; run `api/scripts/test.sh -p bt-api` (`docker compose up -d postgres-test` if needed).
- Frontend: components `web/components/*.tsx`; hooks `web/lib/query/*.ts`; openapi-fetch client `web/lib/api/client.ts`; generated types `web/lib/api/schema.d.ts` via `pnpm gen:api` (needs API on :8080). Tokens: `bg-brand`/`brand-text` (NEVER `accent`), `bg-bg-elev`, `border-line`, `text-ink/ink-2/ink-3`, `tabular`. `cn()` from `@/lib/utils`. `Pill` (variant+dot+children), `SegControl` (`{options:{value,label}[], value, onChange}`). Tests `web/components/__tests__/*.test.tsx`; run `cd web && pnpm test`.
- Dev DB on host port 5442; API on :8080 (restart after backend changes / before `gen:api`).
- The read path `useMemberGoals(id)` → `["member-goals", id]` is unchanged; all mutations invalidate that key.

---

## File Structure

**Backend:**
- Modify `api/crates/bt-domain/src/lib.rs` — 6 request DTOs (Create/Update × Goal/DevItem/Competency).
- Create `api/crates/bt-api/src/routes/goals.rs` — 9 handlers + a `goal_status` validator helper + a `#[cfg(test)] mod tests`.
- Modify `api/crates/bt-api/src/routes/mod.rs`, `app.rs`, `openapi.rs`.

**Frontend:**
- Create `web/components/Modal.tsx` — reusable modal.
- Create `web/lib/query/goals.ts` — 9 mutation hooks.
- Create `web/components/goals/OkrForm.tsx`, `DevItemForm.tsx`, `CompetencyForm.tsx`.
- Create `web/components/goals/GoalEditModal.tsx`, `DevItemEditModal.tsx`, `CompetencyEditModal.tsx`.
- Modify `web/components/OkrCard.tsx`, `DevItemRow.tsx`, `CompetencyBar.tsx` — optional `onEdit` affordance.
- Modify `web/app/(app)/profile/[id]/GoalsTab.tsx` — modal state + «+ Добавить»/«Изменить» wiring.
- Tests in `web/components/__tests__/` + `web/e2e/goals-crud.spec.ts`.

---

# Phase A — Backend

### Task 1: Goal DTOs + `routes/goals.rs` goals CRUD

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`
- Create: `api/crates/bt-api/src/routes/goals.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`

- [ ] **Step 1: Add Goal request DTOs to `bt-domain/src/lib.rs`**

`use validator::Validate;` is already imported (slice 5). Append:

```rust
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateGoalRequest {
    pub member_id: uuid::Uuid,
    pub quarter: String,
    pub title: String,
    pub key_result: String,
    #[validate(range(min = 0, max = 100, message = "progress must be 0..100"))]
    pub progress: i32,
    pub status: String,
    pub due: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateGoalRequest {
    pub quarter: Option<String>,
    pub title: Option<String>,
    pub key_result: Option<String>,
    #[validate(range(min = 0, max = 100, message = "progress must be 0..100"))]
    pub progress: Option<i32>,
    pub status: Option<String>,
    pub due: Option<chrono::DateTime<chrono::Utc>>,
}
```

- [ ] **Step 2: Build the domain crate**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: clean.

- [ ] **Step 3: Create `routes/goals.rs` with the goals handlers + status validator**

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{Goal, CreateGoalRequest, UpdateGoalRequest};
use uuid::Uuid;
use validator::Validate;

fn validate_goal_status(s: &str) -> AppResult<()> {
    if matches!(s, "ontrack" | "risk" | "done") {
        Ok(())
    } else {
        Err(AppError::BadRequest("invalid goal status".into()))
    }
}

async fn goal_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM goals WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

type GoalRow = (uuid::Uuid, String, String, String, i32, String, chrono::DateTime<chrono::Utc>);
fn goal_from(r: GoalRow) -> Goal {
    Goal { id: r.0, quarter: r.1, title: r.2, key_result: r.3, progress: r.4, status: r.5, due: r.6 }
}
const GOAL_COLS: &str = "id, quarter, title, key_result, progress, status::text, due";

#[utoipa::path(
    post, path = "/v1/goals", request_body = CreateGoalRequest,
    responses((status = 201, body = Goal), (status = 400), (status = 403))
)]
pub async fn create_goal(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateGoalRequest>,
) -> AppResult<(StatusCode, Json<Goal>)> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    validate_goal_status(&body.status)?;
    require_member_access(&auth, body.member_id, &state.pool).await?;

    let r: GoalRow = sqlx::query_as(&format!(
        "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
         SELECT tm.workspace_id, tm.id, $2, $3, $4, $5, $6::goal_status, $7 \
         FROM team_members tm WHERE tm.id = $1 RETURNING {GOAL_COLS}"
    ))
    .bind(body.member_id).bind(body.quarter).bind(body.title).bind(body.key_result)
    .bind(body.progress).bind(body.status).bind(body.due)
    .fetch_one(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(goal_from(r))))
}

#[utoipa::path(
    patch, path = "/v1/goals/{id}", request_body = UpdateGoalRequest,
    params(("id" = uuid::Uuid, Path, description = "Goal id")),
    responses((status = 200, body = Goal), (status = 400), (status = 403), (status = 404))
)]
pub async fn update_goal(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateGoalRequest>,
) -> AppResult<Json<Goal>> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    if let Some(s) = &body.status { validate_goal_status(s)?; }
    let member_id = goal_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;

    let r: GoalRow = sqlx::query_as(&format!(
        "UPDATE goals SET \
           quarter    = COALESCE($2, quarter), \
           title      = COALESCE($3, title), \
           key_result = COALESCE($4, key_result), \
           progress   = COALESCE($5, progress), \
           status     = COALESCE($6::goal_status, status), \
           due        = COALESCE($7, due) \
         WHERE id = $1 RETURNING {GOAL_COLS}"
    ))
    .bind(id).bind(body.quarter).bind(body.title).bind(body.key_result)
    .bind(body.progress).bind(body.status).bind(body.due)
    .fetch_one(&state.pool).await?;
    Ok(Json(goal_from(r)))
}

#[utoipa::path(
    delete, path = "/v1/goals/{id}",
    params(("id" = uuid::Uuid, Path, description = "Goal id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_goal(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = goal_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    sqlx::query("DELETE FROM goals WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Wire module + routes**

In `routes/mod.rs` add `pub mod goals;`. In `app.rs` protected router add:
```rust
        .route("/v1/goals", axum::routing::post(routes::goals::create_goal))
        .route("/v1/goals/:id", axum::routing::patch(routes::goals::update_goal)
            .delete(routes::goals::delete_goal))
```

- [ ] **Step 5: Add the test module + goal tests**

Append to `goals.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::app::app;
    use crate::auth::password::hash_password;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Workspace + lead + team + member Anna. Returns (token, anna_id).
    pub(super) async fn seed(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'a@x.io',$2,'Lead','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'team',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Анна','FE','anna@x.io','2023','Europe/Moscow','{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "a@x.io").await, anna.0)
    }

    /// A second lead+team+member, foreign to `seed`'s caller. Returns (token, member_id).
    pub(super) async fn seed_foreign(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('F') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'b@x.io',$2,'L2','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'t2',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let bob: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Боб','BE','bob@x.io','2023','Europe/Moscow','{5,5,5}','ok'::member_status,'{}',10,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "b@x.io").await, bob.0)
    }

    pub(super) async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    pub(super) async fn req(pool: sqlx::PgPool, method: &str, uri: &str, token: &str, body: Option<serde_json::Value>)
        -> (StatusCode, serde_json::Value)
    {
        let mut b = Request::builder().method(method).uri(uri)
            .header("authorization", format!("Bearer {token}"));
        let body = match body {
            Some(j) => { b = b.header("content-type", "application/json"); Body::from(j.to_string()) }
            None => Body::empty(),
        };
        let resp = app(pool).oneshot(b.body(body).unwrap()).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    fn goal_body(member: uuid::Uuid) -> serde_json::Value {
        serde_json::json!({
            "member_id": member, "quarter": "Q2 2026", "title": "Ускорить экраны",
            "key_result": "LCP < 1.5s", "progress": 60, "status": "ontrack",
            "due": "2026-07-01T00:00:00Z"
        })
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_goal_ok_and_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (status, json) = req(pool.clone(), "POST", "/v1/goals", &token, Some(goal_body(anna))).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["title"], "Ускорить экраны");
        assert_eq!(json["progress"], 60);

        let (ftoken, bob) = seed_foreign(&pool).await;
        let _ = ftoken;
        let (fstatus, _) = req(pool, "POST", "/v1/goals", &token, Some(goal_body(bob))).await;
        assert_eq!(fstatus, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_goal_rejects_bad_progress(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let mut body = goal_body(anna);
        body["progress"] = serde_json::json!(101);
        let (status, _) = req(pool, "POST", "/v1/goals", &token, Some(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_goal_updates_then_delete_gone(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (_, g) = req(pool.clone(), "POST", "/v1/goals", &token, Some(goal_body(anna))).await;
        let id = g["id"].as_str().unwrap().to_string();
        let (ps, pj) = req(pool.clone(), "PATCH", &format!("/v1/goals/{id}"), &token,
            Some(serde_json::json!({"progress": 100, "status": "done"}))).await;
        assert_eq!(ps, StatusCode::OK);
        assert_eq!(pj["progress"], 100);
        assert_eq!(pj["status"], "done");
        assert_eq!(pj["title"], "Ускорить экраны"); // untouched
        let (ds, _) = req(pool.clone(), "DELETE", &format!("/v1/goals/{id}"), &token, None).await;
        assert_eq!(ds, StatusCode::NO_CONTENT);
        let (gs, gj) = req(pool, "GET", &format!("/v1/members/{anna}/goals"), &token, None).await;
        assert_eq!(gs, StatusCode::OK);
        assert_eq!(gj["okrs"].as_array().unwrap().len(), 0);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_delete_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let (_, g) = req(pool.clone(), "POST", "/v1/goals", &token, Some(goal_body(anna))).await;
        let id = g["id"].as_str().unwrap().to_string();
        let (ps, _) = req(pool.clone(), "PATCH", &format!("/v1/goals/{id}"), &ftoken,
            Some(serde_json::json!({"progress": 10}))).await;
        let (ds, _) = req(pool, "DELETE", &format!("/v1/goals/{id}"), &ftoken, None).await;
        assert_eq!(ps, StatusCode::FORBIDDEN);
        assert_eq!(ds, StatusCode::FORBIDDEN);
    }
}
```

- [ ] **Step 6: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: the 4 new goal tests + all prior PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/goals.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): goals CRUD (POST/PATCH/DELETE /v1/goals)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Development-items CRUD

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`, `api/crates/bt-api/src/routes/goals.rs`, `app.rs`

- [ ] **Step 1: Add DevItem request DTOs to `bt-domain/src/lib.rs`**

```rust
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateDevItemRequest {
    pub member_id: uuid::Uuid,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateDevItemRequest {
    pub title: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub note: Option<String>,
}
```

- [ ] **Step 2: Add handlers to `goals.rs`**

Extend imports: `use bt_domain::{Goal, CreateGoalRequest, UpdateGoalRequest, DevItem, CreateDevItemRequest, UpdateDevItemRequest};`. Add:

```rust
type DevRow = (uuid::Uuid, String, String, String, Option<String>);
fn dev_from(r: DevRow) -> DevItem {
    DevItem { id: r.0, title: r.1, kind: r.2, status: r.3, note: r.4 }
}
const DEV_COLS: &str = "id, title, kind, status, note";

async fn dev_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM development_items WHERE id = $1")
        .bind(id).fetch_optional(pool).await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

#[utoipa::path(
    post, path = "/v1/development-items", request_body = CreateDevItemRequest,
    responses((status = 201, body = DevItem), (status = 403))
)]
pub async fn create_dev_item(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateDevItemRequest>,
) -> AppResult<(StatusCode, Json<DevItem>)> {
    require_member_access(&auth, body.member_id, &state.pool).await?;
    let r: DevRow = sqlx::query_as(&format!(
        "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
         SELECT tm.workspace_id, tm.id, $2, $3, $4, $5, \
                COALESCE((SELECT max(ord)+1 FROM development_items WHERE member_id = $1), 0) \
         FROM team_members tm WHERE tm.id = $1 RETURNING {DEV_COLS}"
    ))
    .bind(body.member_id).bind(body.title).bind(body.kind).bind(body.status).bind(body.note)
    .fetch_one(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(dev_from(r))))
}

#[utoipa::path(
    patch, path = "/v1/development-items/{id}", request_body = UpdateDevItemRequest,
    params(("id" = uuid::Uuid, Path, description = "Dev item id")),
    responses((status = 200, body = DevItem), (status = 403), (status = 404))
)]
pub async fn update_dev_item(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateDevItemRequest>,
) -> AppResult<Json<DevItem>> {
    let member_id = dev_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    let r: DevRow = sqlx::query_as(&format!(
        "UPDATE development_items SET \
           title  = COALESCE($2, title), \
           kind   = COALESCE($3, kind), \
           status = COALESCE($4, status), \
           note   = COALESCE($5, note) \
         WHERE id = $1 RETURNING {DEV_COLS}"
    ))
    .bind(id).bind(body.title).bind(body.kind).bind(body.status).bind(body.note)
    .fetch_one(&state.pool).await?;
    Ok(Json(dev_from(r)))
}

#[utoipa::path(
    delete, path = "/v1/development-items/{id}",
    params(("id" = uuid::Uuid, Path, description = "Dev item id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_dev_item(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = dev_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    sqlx::query("DELETE FROM development_items WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Register routes in `app.rs`**

```rust
        .route("/v1/development-items", axum::routing::post(routes::goals::create_dev_item))
        .route("/v1/development-items/:id", axum::routing::patch(routes::goals::update_dev_item)
            .delete(routes::goals::delete_dev_item))
```

- [ ] **Step 4: Add tests (append to the `mod tests` in goals.rs, reusing seed/seed_foreign/req)**

```rust
    fn dev_body(member: uuid::Uuid) -> serde_json::Value {
        serde_json::json!({ "member_id": member, "title": "Курс по перфу", "kind": "Курс", "status": "in_progress", "note": "Прогресс 60%" })
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn dev_item_crud_and_ord_append(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (s1, j1) = req(pool.clone(), "POST", "/v1/development-items", &token, Some(dev_body(anna))).await;
        assert_eq!(s1, StatusCode::CREATED);
        assert_eq!(j1["title"], "Курс по перфу");
        // second create appends after the first (ord) — verify via the goals read order
        req(pool.clone(), "POST", "/v1/development-items", &token,
            Some(serde_json::json!({ "member_id": anna, "title": "Книга", "kind": "Книга", "status": "planned" }))).await;
        let (_, goals) = req(pool.clone(), "GET", &format!("/v1/members/{anna}/goals"), &token, None).await;
        let dev = goals["development"].as_array().unwrap();
        assert_eq!(dev.len(), 2);
        assert_eq!(dev[0]["title"], "Курс по перфу"); // ord 0 first
        assert_eq!(dev[1]["title"], "Книга");          // ord 1 next

        let id = j1["id"].as_str().unwrap().to_string();
        let (ps, pj) = req(pool.clone(), "PATCH", &format!("/v1/development-items/{id}"), &token,
            Some(serde_json::json!({"status": "done"}))).await;
        assert_eq!(ps, StatusCode::OK);
        assert_eq!(pj["status"], "done");
        assert_eq!(pj["title"], "Курс по перфу");
        let (ds, _) = req(pool, "DELETE", &format!("/v1/development-items/{id}"), &token, None).await;
        assert_eq!(ds, StatusCode::NO_CONTENT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn dev_item_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/development-items", &token, Some(dev_body(anna))).await;
        let id = j["id"].as_str().unwrap().to_string();
        let (ps, _) = req(pool.clone(), "PATCH", &format!("/v1/development-items/{id}"), &ftoken,
            Some(serde_json::json!({"status":"done"}))).await;
        let (ds, _) = req(pool, "DELETE", &format!("/v1/development-items/{id}"), &ftoken, None).await;
        assert_eq!(ps, StatusCode::FORBIDDEN);
        assert_eq!(ds, StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 5: Run tests → PASS** `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/goals.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): development-items CRUD (ord-append)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Competencies CRUD

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`, `api/crates/bt-api/src/routes/goals.rs`, `app.rs`

- [ ] **Step 1: Add Competency request DTOs to `bt-domain/src/lib.rs`**

```rust
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateCompetencyRequest {
    pub member_id: uuid::Uuid,
    pub label: String,
    #[validate(range(min = 0, max = 10, message = "score must be 0..10"))]
    pub score: i32,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateCompetencyRequest {
    pub label: Option<String>,
    #[validate(range(min = 0, max = 10, message = "score must be 0..10"))]
    pub score: Option<i32>,
}
```

- [ ] **Step 2: Add handlers to `goals.rs`**

Extend imports with `Competency, CreateCompetencyRequest, UpdateCompetencyRequest`. Add:

```rust
type CompRow = (uuid::Uuid, String, i32);
fn comp_from(r: CompRow) -> Competency { Competency { id: r.0, label: r.1, score: r.2 } }
const COMP_COLS: &str = "id, label, score";

async fn comp_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM competencies WHERE id = $1")
        .bind(id).fetch_optional(pool).await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

#[utoipa::path(
    post, path = "/v1/competencies", request_body = CreateCompetencyRequest,
    responses((status = 201, body = Competency), (status = 400), (status = 403))
)]
pub async fn create_competency(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateCompetencyRequest>,
) -> AppResult<(StatusCode, Json<Competency>)> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    require_member_access(&auth, body.member_id, &state.pool).await?;
    let r: CompRow = sqlx::query_as(&format!(
        "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
         SELECT tm.workspace_id, tm.id, $2, $3, \
                COALESCE((SELECT max(ord)+1 FROM competencies WHERE member_id = $1), 0) \
         FROM team_members tm WHERE tm.id = $1 RETURNING {COMP_COLS}"
    ))
    .bind(body.member_id).bind(body.label).bind(body.score)
    .fetch_one(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(comp_from(r))))
}

#[utoipa::path(
    patch, path = "/v1/competencies/{id}", request_body = UpdateCompetencyRequest,
    params(("id" = uuid::Uuid, Path, description = "Competency id")),
    responses((status = 200, body = Competency), (status = 400), (status = 403), (status = 404))
)]
pub async fn update_competency(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateCompetencyRequest>,
) -> AppResult<Json<Competency>> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    let member_id = comp_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    let r: CompRow = sqlx::query_as(&format!(
        "UPDATE competencies SET label = COALESCE($2, label), score = COALESCE($3, score) \
         WHERE id = $1 RETURNING {COMP_COLS}"
    ))
    .bind(id).bind(body.label).bind(body.score)
    .fetch_one(&state.pool).await?;
    Ok(Json(comp_from(r)))
}

#[utoipa::path(
    delete, path = "/v1/competencies/{id}",
    params(("id" = uuid::Uuid, Path, description = "Competency id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_competency(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = comp_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    sqlx::query("DELETE FROM competencies WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Register routes in `app.rs`**

```rust
        .route("/v1/competencies", axum::routing::post(routes::goals::create_competency))
        .route("/v1/competencies/:id", axum::routing::patch(routes::goals::update_competency)
            .delete(routes::goals::delete_competency))
```

- [ ] **Step 4: Add tests (append to `mod tests`)**

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn competency_crud_and_validation(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (s1, j1) = req(pool.clone(), "POST", "/v1/competencies", &token,
            Some(serde_json::json!({"member_id": anna, "label": "Frontend", "score": 9}))).await;
        assert_eq!(s1, StatusCode::CREATED);
        assert_eq!(j1["label"], "Frontend");
        assert_eq!(j1["score"], 9);

        // bad score → 400
        let (sb, _) = req(pool.clone(), "POST", "/v1/competencies", &token,
            Some(serde_json::json!({"member_id": anna, "label": "X", "score": 11}))).await;
        assert_eq!(sb, StatusCode::BAD_REQUEST);

        let id = j1["id"].as_str().unwrap().to_string();
        let (ps, pj) = req(pool.clone(), "PATCH", &format!("/v1/competencies/{id}"), &token,
            Some(serde_json::json!({"score": 7}))).await;
        assert_eq!(ps, StatusCode::OK);
        assert_eq!(pj["score"], 7);
        assert_eq!(pj["label"], "Frontend");
        let (ds, _) = req(pool, "DELETE", &format!("/v1/competencies/{id}"), &token, None).await;
        assert_eq!(ds, StatusCode::NO_CONTENT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn competency_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/competencies", &token,
            Some(serde_json::json!({"member_id": anna, "label": "FE", "score": 5}))).await;
        let id = j["id"].as_str().unwrap().to_string();
        let (ps, _) = req(pool, "PATCH", &format!("/v1/competencies/{id}"), &ftoken,
            Some(serde_json::json!({"score": 1}))).await;
        assert_eq!(ps, StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 5: Run tests → PASS** `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/goals.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): competencies CRUD (ord-append)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: OpenAPI registration + regenerate types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`, `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Register paths + schemas**

In `openapi.rs` add to `paths(...)`:
```rust
        crate::routes::goals::create_goal,
        crate::routes::goals::update_goal,
        crate::routes::goals::delete_goal,
        crate::routes::goals::create_dev_item,
        crate::routes::goals::update_dev_item,
        crate::routes::goals::delete_dev_item,
        crate::routes::goals::create_competency,
        crate::routes::goals::update_competency,
        crate::routes::goals::delete_competency,
```
and to `components(schemas(...))`:
```rust
        bt_domain::CreateGoalRequest,
        bt_domain::UpdateGoalRequest,
        bt_domain::CreateDevItemRequest,
        bt_domain::UpdateDevItemRequest,
        bt_domain::CreateCompetencyRequest,
        bt_domain::UpdateCompetencyRequest,
```

- [ ] **Step 2: Build + boot API + verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Restart the API on :8080, then:
Run: `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/development-items"'`
Expected: prints `"/v1/development-items"`.

- [ ] **Step 3: Regenerate types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Then: `grep -c "CreateGoalRequest\|CreateDevItemRequest\|CreateCompetencyRequest" lib/api/schema.d.ts` → non-zero.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register goals/dev-items/competencies CRUD in OpenAPI; regen web types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — Frontend

### Task 5: Reusable `Modal`

**Files:**
- Create: `web/components/Modal.tsx`
- Test: `web/components/__tests__/Modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders title + children", () => {
    render(<Modal title="Новая цель" onClose={() => {}}><p>тело</p></Modal>);
    expect(screen.getByText("Новая цель")).toBeInTheDocument();
    expect(screen.getByText("тело")).toBeInTheDocument();
  });

  it("calls onClose on Escape and on scrim click", () => {
    const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}><p>x</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("modal-scrim"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test Modal`

- [ ] **Step 3: Implement `web/components/Modal.tsx`**

```typescript
"use client";
import { useEffect } from "react";

export function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div data-testid="modal-scrim" className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label={title}
        className="relative z-10 w-full max-w-[460px] rounded-lg border border-line bg-bg-elev shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button type="button" aria-label="Закрыть" className="text-ink-3 hover:text-ink" onClick={onClose}>✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run → PASS.** `cd web && pnpm test Modal`

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Modal.tsx web/components/__tests__/Modal.test.tsx
git commit -m "feat(web): reusable Modal (scrim + Esc close)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Goals mutation hooks

**Files:**
- Create: `web/lib/query/goals.ts`

- [ ] **Step 1: Implement `web/lib/query/goals.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CreateGoalRequest = components["schemas"]["CreateGoalRequest"];
export type UpdateGoalRequest = components["schemas"]["UpdateGoalRequest"];
export type CreateDevItemRequest = components["schemas"]["CreateDevItemRequest"];
export type UpdateDevItemRequest = components["schemas"]["UpdateDevItemRequest"];
export type CreateCompetencyRequest = components["schemas"]["CreateCompetencyRequest"];
export type UpdateCompetencyRequest = components["schemas"]["UpdateCompetencyRequest"];

function useGoalsInvalidator(memberId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["member-goals", memberId] });
}

// ── OKRs ──
export function useCreateGoal(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateGoalRequest) => {
      const { data, error } = await api.POST("/v1/goals", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateGoal(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateGoalRequest }) => {
      const { data, error } = await api.PATCH("/v1/goals/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteGoal(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/goals/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ── Development items ──
export function useCreateDevItem(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateDevItemRequest) => {
      const { data, error } = await api.POST("/v1/development-items", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateDevItem(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateDevItemRequest }) => {
      const { data, error } = await api.PATCH("/v1/development-items/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteDevItem(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/development-items/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ── Competencies ──
export function useCreateCompetency(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (body: CreateCompetencyRequest) => {
      const { data, error } = await api.POST("/v1/competencies", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useUpdateCompetency(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (v: { id: string; body: UpdateCompetencyRequest }) => {
      const { data, error } = await api.PATCH("/v1/competencies/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: invalidate,
  });
}
export function useDeleteCompetency(memberId: string) {
  const invalidate = useGoalsInvalidator(memberId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/competencies/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean (path literals + body types match `schema.d.ts`).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/goals.ts
git commit -m "feat(web): goals/dev-items/competencies mutation hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Entity forms (`OkrForm` / `DevItemForm` / `CompetencyForm`)

**Files:**
- Create: `web/components/goals/OkrForm.tsx`, `DevItemForm.tsx`, `CompetencyForm.tsx`
- Test: `web/components/__tests__/GoalsForms.test.tsx`

Each form emits a plain values object via `onSubmit`; the modal wrapper (Task 8) maps it to create/update bodies. `due` is edited as a date (`YYYY-MM-DD`) and converted to ISO on submit.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OkrForm } from "../goals/OkrForm";
import { DevItemForm } from "../goals/DevItemForm";
import { CompetencyForm } from "../goals/CompetencyForm";

describe("Goals forms", () => {
  it("OkrForm submits entered values (due as ISO)", () => {
    const onSubmit = vi.fn();
    render(<OkrForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Цель"), { target: { value: "Ускорить" } });
    fireEvent.change(screen.getByLabelText("Ключевой результат"), { target: { value: "LCP<1.5s" } });
    fireEvent.change(screen.getByLabelText("Прогресс"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Срок"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0][0];
    expect(body.title).toBe("Ускорить");
    expect(body.progress).toBe(60);
    expect(body.due).toMatch(/^2026-07-01T/);
  });

  it("CompetencyForm submits label + numeric score", () => {
    const onSubmit = vi.fn();
    render(<CompetencyForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Компетенция"), { target: { value: "Frontend" } });
    fireEvent.change(screen.getByLabelText("Оценка"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ label: "Frontend", score: 9 }));
  });

  it("DevItemForm submits title/kind/status", () => {
    const onSubmit = vi.fn();
    render(<DevItemForm onSubmit={onSubmit} pending={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Курс" } });
    fireEvent.change(screen.getByLabelText("Тип"), { target: { value: "Курс" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Курс", kind: "Курс", status: "planned" }));
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test GoalsForms`

- [ ] **Step 3: Implement `web/components/goals/OkrForm.tsx`**

```typescript
"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import type { Goal } from "@/lib/query/profile";

export type OkrValues = {
  quarter: string; title: string; key_result: string; progress: number; status: string; due: string;
};

function isoToDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function OkrForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: Goal;
  onSubmit: (v: OkrValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [quarter, setQuarter] = useState(initial?.quarter ?? "Q2 2026");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [keyResult, setKeyResult] = useState(initial?.key_result ?? "");
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [status, setStatus] = useState(initial?.status ?? "ontrack");
  const [due, setDue] = useState(initial ? isoToDate(initial.due) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !keyResult.trim() || !due) return;
    onSubmit({
      quarter, title: title.trim(), key_result: keyResult.trim(),
      progress: Math.max(0, Math.min(100, progress)), status,
      due: new Date(due).toISOString(),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Цель"><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Ключевой результат"><input className={inp} value={keyResult} onChange={(e) => setKeyResult(e.target.value)} /></Field>
      <Field label="Квартал"><input className={inp} value={quarter} onChange={(e) => setQuarter(e.target.value)} /></Field>
      <Field label="Прогресс">
        <input type="number" min={0} max={100} className={inp} value={progress}
          onChange={(e) => setProgress(Number(e.target.value))} />
      </Field>
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Статус</div>
        <SegControl
          options={[{ value: "ontrack", label: "В работе" }, { value: "risk", label: "Под риском" }, { value: "done", label: "Готово" }]}
          value={status} onChange={setStatus} />
      </div>
      <Field label="Срок"><input type="date" className={inp} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Associates the label with the control via the accessible name.
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export function FormFooter({
  pending, error, onDelete,
}: { pending: boolean; error: string | null; onDelete?: () => void }) {
  return (
    <>
      {error && <div className="rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{error}</div>}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={pending}
            className="ml-auto rounded-md border border-miss/40 px-3 py-1.5 text-[13px] text-miss disabled:opacity-60">
            Удалить
          </button>
        )}
      </div>
    </>
  );
}
```

> Note on `getByLabelText`: wrapping the control inside `<label>` with the text in a `<span>` makes the label's accessible name match — `screen.getByLabelText("Цель")` resolves the `<input>`. This is why `Field` uses `<label>`, not a sibling `<div>`.

- [ ] **Step 4: Implement `web/components/goals/DevItemForm.tsx`**

```typescript
"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { Field, FormFooter } from "./OkrForm";
import type { DevItem } from "@/lib/query/profile";

export type DevItemValues = { title: string; kind: string; status: string; note: string };

const KINDS = ["Курс", "Доклад", "Книга", "Сертификат", "Менторство"];
const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function DevItemForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: DevItem;
  onSubmit: (v: DevItemValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planned");
  const [note, setNote] = useState(initial?.note ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !kind.trim()) return;
    onSubmit({ title: title.trim(), kind: kind.trim(), status, note: note.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Название"><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Тип">
        <input className={inp} list="dev-kinds" value={kind} onChange={(e) => setKind(e.target.value)} />
        <datalist id="dev-kinds">{KINDS.map((k) => <option key={k} value={k} />)}</datalist>
      </Field>
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Статус</div>
        <SegControl
          options={[{ value: "planned", label: "Запланировано" }, { value: "in_progress", label: "В работе" }, { value: "done", label: "Готово" }]}
          value={status} onChange={setStatus} />
      </div>
      <Field label="Заметка"><input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}
```

- [ ] **Step 5: Implement `web/components/goals/CompetencyForm.tsx`**

```typescript
"use client";
import { useState } from "react";
import { Field, FormFooter } from "./OkrForm";
import type { Competency } from "@/lib/query/profile";

export type CompetencyValues = { label: string; score: number };

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

export function CompetencyForm({
  initial, onSubmit, onDelete, pending, error,
}: {
  initial?: Competency;
  onSubmit: (v: CompetencyValues) => void;
  onDelete?: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [score, setScore] = useState(initial?.score ?? 5);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSubmit({ label: label.trim(), score: Math.max(0, Math.min(10, score)) });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[13px]">
      <Field label="Компетенция"><input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Оценка">
        <input type="number" min={0} max={10} className={inp} value={score}
          onChange={(e) => setScore(Number(e.target.value))} />
      </Field>
      <FormFooter pending={pending} error={error} onDelete={onDelete} />
    </form>
  );
}
```

- [ ] **Step 6: Run → PASS.** `cd web && pnpm test GoalsForms` then `pnpm exec tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/goals/OkrForm.tsx web/components/goals/DevItemForm.tsx web/components/goals/CompetencyForm.tsx web/components/__tests__/GoalsForms.test.tsx
git commit -m "feat(web): OkrForm + DevItemForm + CompetencyForm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Edit modals + GoalsTab wiring

**Files:**
- Create: `web/components/goals/GoalEditModal.tsx`, `DevItemEditModal.tsx`, `CompetencyEditModal.tsx`
- Modify: `web/components/OkrCard.tsx`, `DevItemRow.tsx`, `CompetencyBar.tsx`, `web/app/(app)/profile/[id]/GoalsTab.tsx`

- [ ] **Step 1: Implement the three edit modals**

`web/components/goals/GoalEditModal.tsx`:
```typescript
"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { OkrForm, type OkrValues } from "./OkrForm";
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from "@/lib/query/goals";
import type { Goal } from "@/lib/query/profile";

export function GoalEditModal({ memberId, goal, onClose }: { memberId: string; goal?: Goal; onClose: () => void }) {
  const create = useCreateGoal(memberId);
  const update = useUpdateGoal(memberId);
  const del = useDeleteGoal(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: OkrValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (goal) update.mutate({ id: goal.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (goal && confirm("Удалить цель?"))
      del.mutate(goal.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={goal ? "Изменить цель" : "Новая цель"} onClose={onClose}>
      <OkrForm initial={goal} onSubmit={submit} onDelete={goal ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
```

`web/components/goals/DevItemEditModal.tsx`:
```typescript
"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { DevItemForm, type DevItemValues } from "./DevItemForm";
import { useCreateDevItem, useUpdateDevItem, useDeleteDevItem } from "@/lib/query/goals";
import type { DevItem } from "@/lib/query/profile";

export function DevItemEditModal({ memberId, item, onClose }: { memberId: string; item?: DevItem; onClose: () => void }) {
  const create = useCreateDevItem(memberId);
  const update = useUpdateDevItem(memberId);
  const del = useDeleteDevItem(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: DevItemValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (item) update.mutate({ id: item.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (item && confirm("Удалить пункт?"))
      del.mutate(item.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={item ? "Изменить пункт" : "Новый пункт развития"} onClose={onClose}>
      <DevItemForm initial={item} onSubmit={submit} onDelete={item ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
```

`web/components/goals/CompetencyEditModal.tsx`:
```typescript
"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { CompetencyForm, type CompetencyValues } from "./CompetencyForm";
import { useCreateCompetency, useUpdateCompetency, useDeleteCompetency } from "@/lib/query/goals";
import type { Competency } from "@/lib/query/profile";

export function CompetencyEditModal({ memberId, competency, onClose }: { memberId: string; competency?: Competency; onClose: () => void }) {
  const create = useCreateCompetency(memberId);
  const update = useUpdateCompetency(memberId);
  const del = useDeleteCompetency(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: CompetencyValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (competency) update.mutate({ id: competency.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (competency && confirm("Удалить компетенцию?"))
      del.mutate(competency.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={competency ? "Изменить компетенцию" : "Новая компетенция"} onClose={onClose}>
      <CompetencyForm initial={competency} onSubmit={submit} onDelete={competency ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
```

- [ ] **Step 2: Add an optional `onEdit` affordance to the three read components**

`OkrCard.tsx` — add `onEdit?: () => void` to props; render a small button when provided. Change the signature to `export function OkrCard({ okr, onEdit }: { okr: Goal; onEdit?: () => void })` and put, inside the top `flex items-start justify-between` row, after the Pill:
```typescript
        {onEdit && (
          <button type="button" onClick={onEdit} className="ml-1 text-[12px] text-ink-3 hover:text-ink">Изменить</button>
        )}
```
`DevItemRow.tsx` — add `onEdit?: () => void`; signature `export function DevItemRow({ item, onEdit }: { item: DevItem; onEdit?: () => void })`; append at the end of the row (after the text `<div>`), inside the outer flex:
```typescript
      {onEdit && (
        <button type="button" onClick={onEdit} className="ml-auto text-[12px] text-ink-3 hover:text-ink">Изменить</button>
      )}
```
`CompetencyBar.tsx` — add `onEdit?: () => void`; signature `export function CompetencyBar({ competency, onEdit }: { competency: Competency; onEdit?: () => void })`; in the label row (the `flex justify-between`), wrap the score span and add the button:
```typescript
        <span className="flex items-center gap-2">
          <span className="text-ink-3 tabular">{competency.score}/10</span>
          {onEdit && <button type="button" onClick={onEdit} className="text-[12px] text-ink-3 hover:text-ink">Изменить</button>}
        </span>
```
(Existing read-only usages pass no `onEdit` → no button → existing component tests still pass.)

- [ ] **Step 3: Wire `GoalsTab.tsx`**

Replace `web/app/(app)/profile/[id]/GoalsTab.tsx` with the version that adds modal state + «+ Добавить» buttons + per-item «Изменить»:

```typescript
"use client";
import { useState } from "react";
import { OkrCard } from "@/components/OkrCard";
import { DevItemRow } from "@/components/DevItemRow";
import { CompetencyBar } from "@/components/CompetencyBar";
import { GoalEditModal } from "@/components/goals/GoalEditModal";
import { DevItemEditModal } from "@/components/goals/DevItemEditModal";
import { CompetencyEditModal } from "@/components/goals/CompetencyEditModal";
import { useMemberGoals, type Goal, type DevItem, type Competency } from "@/lib/query/profile";

type ModalState =
  | { type: "okr"; entity?: Goal }
  | { type: "dev"; entity?: DevItem }
  | { type: "comp"; entity?: Competency }
  | null;

const addBtn = "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-bg-tint";

export function GoalsTab({ memberId }: { memberId: string }) {
  const goals = useMemberGoals(memberId);
  const [modal, setModal] = useState<ModalState>(null);

  if (goals.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (goals.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить цели.{" "}
        <button className="underline" onClick={() => goals.refetch()}>Повторить</button>
      </div>
    );

  const { okrs, development, competencies } = goals.data!;

  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-6">
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Цели на {okrs[0]?.quarter ?? "квартал"}</h2>
            <button className={addBtn} onClick={() => setModal({ type: "okr" })}>+ Добавить</button>
          </div>
          {okrs.length ? (
            <div className="space-y-3">
              {okrs.map((o) => <OkrCard key={o.id} okr={o} onEdit={() => setModal({ type: "okr", entity: o })} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Целей пока нет</p>
          )}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">План развития</h2>
            <button className={addBtn} onClick={() => setModal({ type: "dev" })}>+ Добавить</button>
          </div>
          {development.length ? (
            <div className="rounded-lg border border-line bg-bg-elev px-4">
              {development.map((d) => <DevItemRow key={d.id} item={d} onEdit={() => setModal({ type: "dev", entity: d })} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">План развития пуст</p>
          )}
        </section>
      </div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Компетенции</h2>
          <button className={addBtn} onClick={() => setModal({ type: "comp" })}>+ Добавить</button>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-4">
          {competencies.length ? (
            competencies.map((c) => <CompetencyBar key={c.id} competency={c} onEdit={() => setModal({ type: "comp", entity: c })} />)
          ) : (
            <p className="text-[13px] text-ink-3">Нет данных</p>
          )}
        </div>
      </section>

      {modal?.type === "okr" && <GoalEditModal memberId={memberId} goal={modal.entity} onClose={() => setModal(null)} />}
      {modal?.type === "dev" && <DevItemEditModal memberId={memberId} item={modal.entity} onClose={() => setModal(null)} />}
      {modal?.type === "comp" && <CompetencyEditModal memberId={memberId} competency={modal.entity} onClose={() => setModal(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + full unit suite**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; all tests pass (the existing OkrCard/DevItemRow/CompetencyBar tests still pass since `onEdit` is optional).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/goals/GoalEditModal.tsx web/components/goals/DevItemEditModal.tsx web/components/goals/CompetencyEditModal.tsx web/components/OkrCard.tsx web/components/DevItemRow.tsx web/components/CompetencyBar.tsx "web/app/(app)/profile/[id]/GoalsTab.tsx"
git commit -m "feat(web): goals edit modals + GoalsTab add/edit wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Playwright e2e

**Files:**
- Create: `web/e2e/goals-crud.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type Page } from "@playwright/test";

async function openAnnaGoals(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Цели и развитие" }).click();
  await expect(page).toHaveURL(/tab=goals/);
  await expect(page.getByText("Компетенции")).toBeVisible({ timeout: 10_000 });
}

test("add an OKR via the modal", async ({ page }) => {
  await openAnnaGoals(page);
  // The OKR section's «+ Добавить» is the first one (Цели section).
  await page.getByRole("button", { name: "+ Добавить" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Цель").fill("Снизить флаки тесты");
  await dialog.getByLabel("Ключевой результат").fill("0 флак-фейлов за спринт");
  await dialog.getByLabel("Срок").fill("2026-09-01");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Снизить флаки тесты")).toBeVisible({ timeout: 10_000 });
});

test("add then delete a competency", async ({ page }) => {
  await openAnnaGoals(page);
  // Competencies section «+ Добавить» is the last one.
  await page.getByRole("button", { name: "+ Добавить" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Новая компетенция" });
  await dialog.getByLabel("Компетенция").fill("Наблюдаемость");
  await dialog.getByLabel("Оценка").fill("7");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Наблюдаемость")).toBeVisible({ timeout: 10_000 });

  // Edit → delete it (confirm dialog auto-accept).
  page.on("dialog", (d) => d.accept());
  await page.getByText("Наблюдаемость").locator("xpath=ancestor::div[1]").getByRole("button", { name: "Изменить" }).click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Наблюдаемость")).toBeHidden({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run** (API on :8080 + dev DB seeded; Playwright starts `pnpm dev`)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e goals-crud`
If a selector is ambiguous, refine it in the TEST (don't weaken assertions). Likely tweaks: the «+ Добавить» buttons are not unique — `.first()` (Цели) and `.last()` (Компетенции) disambiguate; the «Изменить» locator for the competency uses an ancestor lookup — if brittle, scope via the competencies `<section>` instead. The `getByLabel` calls rely on the `<label>`-wrapped `Field` from Task 7.

- [ ] **Step 3: Run the full e2e suite (regression)**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e`
Expected: all specs PASS (profile/teamlist/auth/meeting-drawer unaffected; the profile spec asserts «Компетенции» which still renders).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/goals-crud.spec.ts
git commit -m "test(web): goals CRUD e2e — add OKR, add+delete competency

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification
- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api` → all PASS.
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e: `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: profile → Цели и развитие → «+ Добавить» on each section opens the right modal; create persists + appears; «Изменить» edits; «Удалить» removes; foreign-member edit is impossible from the UI.
- [ ] Then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- All three sections editable (OKR/dev/competency) → Tasks 1/2/3 (backend), 7/8 (forms+modals+wiring) ✓
- Modal + explicit Save → Task 5 (Modal) + Task 7 forms (submit button) + Task 8 modals ✓
- Flat-resource endpoints `/v1/goals`, `/v1/development-items`, `/v1/competencies` (POST/PATCH/DELETE) → Tasks 1–3 ✓
- Edit affordance = explicit «Изменить» (not whole-card click); «+ Добавить» per section → Task 8 ✓
- Ownership: create guards body.member_id; PATCH/DELETE resolve member from row → guard; foreign → 403 → Tasks 1–3 handlers + tests ✓
- `ord` append for dev/competency → Tasks 2/3 (`COALESCE(max(ord)+1,0)`) + ord-order test ✓
- Local modal state (no zustand) → Task 8 GoalsTab `useState` ✓
- validator: progress 0..100, score 0..10, goal status whitelist → Tasks 1/3 DTOs + `validate_goal_status` + tests (`create_goal_rejects_bad_progress`, `competency_crud_and_validation` bad-score) ✓
- workspace_id server-derived on create → INSERT…SELECT FROM team_members ✓
- OpenAPI + gen:api → Task 4 ✓
- Forms (OKR fields incl. quarter/status SegControl/progress/due; dev kind datalist + status; competency label+score) → Task 7 ✓
- Error inline in modal, modal stays open on failure → Task 8 (`onError: setError`) ✓
- Read path unchanged; invalidate `["member-goals", memberId]` → Task 6 hooks ✓
- e2e add OKR + add/delete competency → Task 9 ✓
- Preserve brand token, Russian microcopy, tabular → enforced in component code + conventions ✓

**Placeholder scan:** no TBD/TODO; every code step has full code. Status whitelist, ord-append, and date↔ISO conversion are concrete (not vague).

**Type consistency:** `OkrValues`/`DevItemValues`/`CompetencyValues` (Task 7) spread into create bodies (`{member_id, ...v}`) match `CreateGoalRequest`/`CreateDevItemRequest`/`CreateCompetencyRequest` (Tasks 1–3 DTOs) and as update bodies match the Update* DTOs (all-optional supersets). Hook names `useCreate/Update/Delete{Goal,DevItem,Competency}(memberId)` consistent across Tasks 6 and 8. `Field`/`FormFooter` are defined in `OkrForm.tsx` and imported by the other two forms. Response DTOs `Goal`/`DevItem`/`Competency` (reused from slice 4) returned by all handlers. Backend `GOAL_COLS`/`DEV_COLS`/`COMP_COLS` match the `goal_from`/`dev_from`/`comp_from` tuple mappers.

**Known stubs (per spec):** «Написать»/«Экспорт» header buttons; drag-reordering; career-track/mentorship; export.
