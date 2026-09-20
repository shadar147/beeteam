# Admin: Teams (Administration slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the HR Administration area and its first screen — Teams CRUD — behind a new `ManageWorkspace` permission.

**Architecture:** A new `ManageWorkspace` permission (on `hr_admin`) gates a new permission-scoped route module `routes/admin.rs` (team list/create/update/delete + assignable-leads list), separate from the ownership-gated reads in `teams.rs`. The frontend adds `/admin/teams` (server-gated → `NoAccess`), a `TeamsAdminClient` table, and a `TeamEditModal`, plus a sidebar fix so «Администрирование» shows to `manage_workspace` holders.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres 16, Next.js 14 + TanStack Query + openapi-fetch, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-beeteam-admin-teams-design.md`

**Test commands (never bare `cargo test` for DB crates):**
- Domain (no DB): `cargo test --manifest-path api/Cargo.toml -p bt-domain`
- API/DB (isolated test DB): `bash api/scripts/test.sh -p bt-api <filter>`
- Web unit: `cd web && npm test -- <file-substring>` (all: `npm test`)
- Web typecheck: `cd web && npx tsc --noEmit`
- Web e2e: `cd web && npm run test:e2e -- <file-substring>`

**Key facts from the codebase:**
- `teams` table (`0001_init.sql:53-63`): `id, workspace_id, name, mission NULL, color DEFAULT '#F5A524', lead_id → users(id) ON DELETE SET NULL, default_template_id → field_templates(id) ON DELETE SET NULL, default_cadence cadence DEFAULT '2w', visibility visibility DEFAULT 'private'`. Enums `cadence` = {1w,2w,4w}, `visibility` = {private,hr,org}. `field_templates` has NO `created_at` (has `updated_at`, `system`).
- `workspace_of(pool, user_id) -> AppResult<Uuid>` is `pub(crate)` in `routes/grades.rs:13`.
- `require_permission(&auth, Permission) -> AppResult<()>` and `has_permission(&auth, Permission) -> bool` in `auth/permissions.rs`.
- Seed (`seed_demo`): HR `o.klimova@beeteam.io` (hr_admin), lead `e.glebov@beeteam.io` (lead), 1 team «Платформенный отдел» led by Евгений with 8 `team_members`, 1 `field_templates` row «Базовый». Password `demo1234`.
- App routes registered in `app.rs` (protected group lines 36-81), style `.route("/p", get(h))` / `axum::routing::patch(h)`; `get` imported at line 1.
- Server pages import `{ getSessionUser, hasPermission }` from `@/lib/auth`; gate pattern: `if (user && !hasPermission(user, "perm")) return <NoAccess/>` (`approvals/page.tsx`). `NoAccess` at `@/components/NoAccess`.

---

## File Structure

**Backend**
- `api/crates/bt-domain/src/lib.rs` — **modify**: `Permission::ManageWorkspace` + `permissions_of`; new DTOs `TeamRow`, `AssignableLead`, `TeamInput`.
- `api/crates/bt-api/src/routes/admin.rs` — **create**: `list_teams`, `list_leads`, `create_team`, `update_team`, `delete_team` + `load_team_row`/`validate_team_input` helpers + tests.
- `api/crates/bt-api/src/routes/mod.rs` — **modify**: `pub mod admin;`.
- `api/crates/bt-api/src/app.rs` — **modify**: register the 5 admin routes.
- `api/crates/bt-api/src/openapi.rs` — **modify**: register paths + schemas.

**Frontend**
- `web/lib/api/schema.d.ts` — **regenerate**.
- `web/lib/query/teams.ts` — **create**: `useTeams`, `useAssignableLeads`, `useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`.
- `web/app/(app)/admin/teams/page.tsx` — **create**: server gate → `TeamsAdminClient`.
- `web/components/admin/TeamsAdminClient.tsx` — **create**: the teams table + header + delete.
- `web/components/admin/TeamEditModal.tsx` — **create**: create/edit modal.
- `web/components/Sidebar.tsx` — **modify**: enable «Команды», gate «Администрирование» on `manage_workspace`.
- `web/components/__tests__/AdminTeams.test.tsx` — **create**: modal + client unit tests.
- `web/e2e/admin-teams.spec.ts` — **create**: HR CRUD + lead no-access.

---

## Task 1: Permission + DTOs (bt-domain)

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`

- [ ] **Step 1: Add the permission variant + grant, and the DTOs**

In `api/crates/bt-domain/src/lib.rs`, add `ManageWorkspace` to the `Permission` enum (after `EditSalaryBands`):

```rust
    EditSalaryBands,  // 5b: exact band numbers
    ManageWorkspace,  // admin: teams / people / settings
```

Grant it to `hr_admin` in `permissions_of` (extend the `hr_admin` arm):

```rust
        "hr_admin" => &[
            Permission::ApproveReviews,
            Permission::EditFramework,
            Permission::EditSalaryBands,
            Permission::ManageWorkspace,
        ],
```

Add the admin DTOs (place near the other grade/team DTOs, e.g. after `GradesFramework`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TeamRow {
    pub id: uuid::Uuid,
    pub name: String,
    pub mission: Option<String>,
    pub color: String,
    pub lead_id: Option<uuid::Uuid>,
    pub lead_name: Option<String>,
    pub lead_hue: Option<i32>,
    pub member_count: i64,
    pub default_cadence: String,
    pub visibility: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AssignableLead {
    pub id: uuid::Uuid,
    pub name: String,
    pub hue: i32,
    pub role: String,
}

/// Body for both POST /v1/teams and PATCH /v1/teams/{id} (full replace of these fields).
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct TeamInput {
    pub name: String,
    pub mission: Option<String>,
    pub color: String,
    pub lead_id: Option<uuid::Uuid>,
    pub default_cadence: String,
    pub visibility: String,
}
```

- [ ] **Step 2: Add a permission test**

If a `#[cfg(test)] mod tests` block does not already exist at the end of `lib.rs`, add one; otherwise append the test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hr_admin_can_manage_workspace() {
        assert!(permissions_of("hr_admin").contains(&Permission::ManageWorkspace));
        assert!(!permissions_of("lead").contains(&Permission::ManageWorkspace));
        assert!(!permissions_of("employee").contains(&Permission::ManageWorkspace));
    }
}
```

- [ ] **Step 3: Run — expect PASS**

Run: `cargo test --manifest-path api/Cargo.toml -p bt-domain`
Expected: PASS (incl. `hr_admin_can_manage_workspace`).

- [ ] **Step 4: Commit**

```bash
git add api/crates/bt-domain/src/lib.rs
git commit -m "feat(domain): ManageWorkspace permission + team admin DTOs (admin slice A)"
```

---

## Task 2: Admin read endpoints — list teams + assignable leads

**Files:**
- Create: `api/crates/bt-api/src/routes/admin.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `api/crates/bt-api/src/app.rs`, `api/crates/bt-api/src/openapi.rs`

- [ ] **Step 1: Create the module with the read endpoints + helper**

Create `api/crates/bt-api/src/routes/admin.rs`:

```rust
use axum::extract::State;
use axum::Json;
use bt_domain::{AssignableLead, Permission, TeamRow};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::auth::permissions::require_permission;
use crate::error::{AppError, AppResult};
use crate::routes::grades::workspace_of;

/// The SELECT that assembles a TeamRow (lead join + member count). Optionally filtered to one id.
async fn team_rows(pool: &sqlx::PgPool, workspace_id: Uuid, only: Option<Uuid>) -> AppResult<Vec<TeamRow>> {
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, String, Option<Uuid>, Option<String>, Option<i32>, i64, String, String)>(
        "SELECT t.id, t.name, t.mission, t.color, t.lead_id, u.name, u.hue, \
                (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count, \
                t.default_cadence::text, t.visibility::text \
         FROM teams t LEFT JOIN users u ON u.id = t.lead_id \
         WHERE t.workspace_id = $1 AND ($2::uuid IS NULL OR t.id = $2) \
         ORDER BY t.name",
    )
    .bind(workspace_id).bind(only).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| TeamRow {
        id: r.0, name: r.1, mission: r.2, color: r.3, lead_id: r.4, lead_name: r.5, lead_hue: r.6,
        member_count: r.7, default_cadence: r.8, visibility: r.9,
    }).collect())
}

pub(crate) async fn load_team_row(pool: &sqlx::PgPool, workspace_id: Uuid, id: Uuid) -> AppResult<TeamRow> {
    team_rows(pool, workspace_id, Some(id)).await?.into_iter().next().ok_or(AppError::NotFound)
}

#[utoipa::path(get, path = "/v1/teams", responses((status = 200, body = [TeamRow]), (status = 403)))]
pub async fn list_teams(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<TeamRow>>> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    Ok(Json(team_rows(&state.pool, workspace_id, None).await?))
}

#[utoipa::path(get, path = "/v1/leads", responses((status = 200, body = [AssignableLead]), (status = 403)))]
pub async fn list_leads(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<AssignableLead>>> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    let rows = sqlx::query_as::<_, (Uuid, String, i32, String)>(
        "SELECT id, name, hue, role::text FROM users \
         WHERE workspace_id = $1 AND role IN ('lead','hr_admin') ORDER BY name",
    ).bind(workspace_id).fetch_all(&state.pool).await?;
    Ok(Json(rows.into_iter().map(|r| AssignableLead { id: r.0, name: r.1, hue: r.2, role: r.3 }).collect()))
}
```

(The write handlers `create_team`/`update_team`/`delete_team` + `validate_team_input` are added in Task 3, which also extends the imports. This task compiles clean on its own.)

- [ ] **Step 2: Register the module and routes**

In `api/crates/bt-api/src/routes/mod.rs`, add (alphabetical, after `pub mod approvals;`... place near top):

```rust
pub mod admin;
```

In `api/crates/bt-api/src/app.rs`, add the **read-only** routes in the protected group (right after line 39, the `/v1/teams/:id/calendar` route). Task 3 expands `/v1/teams` and adds `/v1/teams/:id` with the write handlers:

```rust
        .route("/v1/teams", get(routes::admin::list_teams))
        .route("/v1/leads", get(routes::admin::list_leads))
```

- [ ] **Step 3: Register in OpenAPI (read paths + all schemas)**

In `api/crates/bt-api/src/openapi.rs`, add to `paths(...)` (after the teams paths):

```rust
        crate::routes::admin::list_teams,
        crate::routes::admin::list_leads,
```

and to `schemas(...)`:

```rust
        bt_domain::TeamRow,
        bt_domain::AssignableLead,
        bt_domain::TeamInput,
```

- [ ] **Step 4: Add tests (write to fail, then pass)**

Append a test module to `api/crates/bt-api/src/routes/admin.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::app::{build_router, AppState};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool, jwt_secret: "test-secret".into(), web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(), bucket: crate::storage::bucket_from_env(),
        })
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#))).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    async fn get_json(pool: &sqlx::PgPool, token: &str, uri: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri(uri)
                .header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_teams_shows_seeded_team_with_count(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (status, json) = get_json(&pool, &hr, "/v1/teams").await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["member_count"], 8);
        assert_eq!(arr[0]["lead_name"], "Евгений Глебов");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_teams_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_json(&pool, &lead, "/v1/teams").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_leads_returns_lead_and_hr(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (status, json) = get_json(&pool, &hr, "/v1/leads").await;
        assert_eq!(status, StatusCode::OK);
        let names: Vec<&str> = json.as_array().unwrap().iter().map(|l| l["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"Евгений Глебов"));
        assert!(names.contains(&"Ольга Климова"));
    }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `bash api/scripts/test.sh -p bt-api admin::`
Expected: PASS (3 tests).
Run: `bash api/scripts/test.sh -p bt-api openapi` → PASS.

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-api/src/routes/admin.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs api/crates/bt-api/src/openapi.rs
git commit -m "feat(api): admin list teams + assignable leads under ManageWorkspace (admin slice A)"
```

---

## Task 3: Admin write endpoints — create / update / delete team

**Files:**
- Modify: `api/crates/bt-api/src/routes/admin.rs`, `api/crates/bt-api/src/app.rs`, `api/crates/bt-api/src/openapi.rs`

- [ ] **Step 1: Extend imports, add validation helper + the three handlers**

In `api/crates/bt-api/src/routes/admin.rs`, first extend the top imports to add `Path`, `StatusCode`, and `TeamInput`:

```rust
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{AssignableLead, Permission, TeamInput, TeamRow};
```

Then add (below `list_leads`):

```rust
fn validate_team_input(b: &TeamInput) -> AppResult<()> {
    if b.name.trim().is_empty() {
        return Err(AppError::BadRequest("team name must not be empty".into()));
    }
    if !["1w", "2w", "4w"].contains(&b.default_cadence.as_str()) {
        return Err(AppError::BadRequest("cadence must be 1w|2w|4w".into()));
    }
    if !["private", "hr", "org"].contains(&b.visibility.as_str()) {
        return Err(AppError::BadRequest("visibility must be private|hr|org".into()));
    }
    let color_ok = b.color.len() == 7 && b.color.starts_with('#')
        && b.color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !color_ok {
        return Err(AppError::BadRequest("color must be a #RRGGBB hex".into()));
    }
    Ok(())
}

/// 400 if lead_id is Some but not a user in this workspace.
async fn check_lead(pool: &sqlx::PgPool, workspace_id: Uuid, lead_id: Option<Uuid>) -> AppResult<()> {
    if let Some(lid) = lead_id {
        let ok: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE id = $1 AND workspace_id = $2")
            .bind(lid).bind(workspace_id).fetch_optional(pool).await?;
        if ok.is_none() {
            return Err(AppError::BadRequest("lead_id is not a user in this workspace".into()));
        }
    }
    Ok(())
}

#[utoipa::path(post, path = "/v1/teams", request_body = TeamInput,
    responses((status = 201, body = TeamRow), (status = 400), (status = 403)))]
pub async fn create_team(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<TeamInput>,
) -> AppResult<(StatusCode, Json<TeamRow>)> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    validate_team_input(&body)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    check_lead(&state.pool, workspace_id, body.lead_id).await?;

    // Prefer the workspace's system template so new teams' 1-2-1s have fields.
    let template_id: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM field_templates WHERE workspace_id = $1 ORDER BY system DESC, updated_at LIMIT 1",
    ).bind(workspace_id).fetch_optional(&state.pool).await?;

    let row: (Uuid,) = sqlx::query_as(
        "INSERT INTO teams (workspace_id, name, mission, color, lead_id, default_template_id, default_cadence, visibility) \
         VALUES ($1, $2, $3, $4, $5, $6, $7::cadence, $8::visibility) RETURNING id",
    )
    .bind(workspace_id).bind(body.name.trim()).bind(&body.mission).bind(&body.color)
    .bind(body.lead_id).bind(template_id.map(|t| t.0))
    .bind(&body.default_cadence).bind(&body.visibility)
    .fetch_one(&state.pool).await?;

    Ok((StatusCode::CREATED, Json(load_team_row(&state.pool, workspace_id, row.0).await?)))
}

#[utoipa::path(patch, path = "/v1/teams/{id}", request_body = TeamInput,
    params(("id" = uuid::Uuid, Path, description = "Team id")),
    responses((status = 200, body = TeamRow), (status = 400), (status = 403), (status = 404)))]
pub async fn update_team(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<TeamInput>,
) -> AppResult<Json<TeamRow>> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    validate_team_input(&body)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    let owned: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM teams WHERE id = $1 AND workspace_id = $2")
        .bind(id).bind(workspace_id).fetch_optional(&state.pool).await?;
    if owned.is_none() {
        return Err(AppError::NotFound);
    }
    check_lead(&state.pool, workspace_id, body.lead_id).await?;

    sqlx::query(
        "UPDATE teams SET name = $3, mission = $4, color = $5, lead_id = $6, \
                default_cadence = $7::cadence, visibility = $8::visibility \
         WHERE id = $1 AND workspace_id = $2",
    )
    .bind(id).bind(workspace_id).bind(body.name.trim()).bind(&body.mission).bind(&body.color)
    .bind(body.lead_id).bind(&body.default_cadence).bind(&body.visibility)
    .execute(&state.pool).await?;

    Ok(Json(load_team_row(&state.pool, workspace_id, id).await?))
}

#[utoipa::path(delete, path = "/v1/teams/{id}",
    params(("id" = uuid::Uuid, Path, description = "Team id")),
    responses((status = 204), (status = 403), (status = 404), (status = 409, description = "Team has members")))]
pub async fn delete_team(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    let owned: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM teams WHERE id = $1 AND workspace_id = $2")
        .bind(id).bind(workspace_id).fetch_optional(&state.pool).await?;
    if owned.is_none() {
        return Err(AppError::NotFound);
    }
    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM team_members WHERE team_id = $1")
        .bind(id).fetch_one(&state.pool).await?;
    if count.0 > 0 {
        return Err(AppError::Conflict("team has members".into()));
    }
    sqlx::query("DELETE FROM teams WHERE id = $1 AND workspace_id = $2")
        .bind(id).bind(workspace_id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: Expand the route registration**

In `api/crates/bt-api/src/app.rs`, replace the read-only registration from Task 2 with the full set:

```rust
        .route("/v1/teams", get(routes::admin::list_teams).post(routes::admin::create_team))
        .route("/v1/teams/:id", axum::routing::patch(routes::admin::update_team).delete(routes::admin::delete_team))
        .route("/v1/leads", get(routes::admin::list_leads))
```

- [ ] **Step 3: Register the write paths in OpenAPI**

In `api/crates/bt-api/src/openapi.rs`, add to `paths(...)`:

```rust
        crate::routes::admin::create_team,
        crate::routes::admin::update_team,
        crate::routes::admin::delete_team,
```

- [ ] **Step 4: Add tests (write to fail, then pass)**

Add to the `mod tests` block in `admin.rs` a POST/PATCH/DELETE helper set + tests:

```rust
    async fn send(pool: &sqlx::PgPool, method: &str, uri: &str, token: &str, body: Option<&str>) -> (StatusCode, serde_json::Value) {
        let mut req = Request::builder().method(method).uri(uri)
            .header("authorization", format!("Bearer {token}"));
        if body.is_some() { req = req.header("content-type", "application/json"); }
        let resp = app(pool.clone()).oneshot(
            req.body(body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty)).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_team_then_delete_empty(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (status, json) = send(&pool, "POST", "/v1/teams", &hr,
            Some(r#"{"name":"Mobile","mission":null,"color":"#3D6DCB","lead_id":null,"default_cadence":"2w","visibility":"private"}"#)).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["name"], "Mobile");
        assert_eq!(json["member_count"], 0);
        let id = json["id"].as_str().unwrap();
        let (dstatus, _) = send(&pool, "DELETE", &format!("/v1/teams/{id}"), &hr, None).await;
        assert_eq!(dstatus, StatusCode::NO_CONTENT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_team_with_members_409(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let teams = get_json(&pool, &hr, "/v1/teams").await.1;
        let id = teams[0]["id"].as_str().unwrap();
        let (status, _) = send(&pool, "DELETE", &format!("/v1/teams/{id}"), &hr, None).await;
        assert_eq!(status, StatusCode::CONFLICT);
        // still there
        assert_eq!(get_json(&pool, &hr, "/v1/teams").await.1.as_array().unwrap().len(), 1);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn update_team_renames_and_reassigns_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let teams = get_json(&pool, &hr, "/v1/teams").await.1;
        let id = teams[0]["id"].as_str().unwrap();
        // reassign the lead to Ольга (hr_admin is an assignable lead)
        let leads = get_json(&pool, &hr, "/v1/leads").await.1;
        let olga = leads.as_array().unwrap().iter().find(|l| l["name"] == "Ольга Климова").unwrap()["id"].as_str().unwrap().to_string();
        let body = format!(r#"{{"name":"Платформа+","mission":"миссия","color":"#F5A524","lead_id":"{olga}","default_cadence":"1w","visibility":"hr"}}"#);
        let (status, json) = send(&pool, "PATCH", &format!("/v1/teams/{id}"), &hr, Some(&body)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["name"], "Платформа+");
        assert_eq!(json["lead_name"], "Ольга Климова");
        assert_eq!(json["default_cadence"], "1w");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_team_validation_400(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        for body in [
            r#"{"name":"  ","color":"#F5A524","default_cadence":"2w","visibility":"private"}"#,
            r#"{"name":"X","color":"#F5A524","default_cadence":"9w","visibility":"private"}"#,
            r#"{"name":"X","color":"#F5A524","default_cadence":"2w","visibility":"nope"}"#,
            r#"{"name":"X","color":"red","default_cadence":"2w","visibility":"private"}"#,
        ] {
            let (status, _) = send(&pool, "POST", "/v1/teams", &hr, Some(body)).await;
            assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
        }
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_team_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = send(&pool, "POST", "/v1/teams", &lead,
            Some(r#"{"name":"X","color":"#F5A524","default_cadence":"2w","visibility":"private"}"#)).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `cargo test --manifest-path api/Cargo.toml -p bt-domain` → PASS.
Run: `bash api/scripts/test.sh -p bt-api admin::` → PASS (8 admin tests).
Run: `bash api/scripts/test.sh -p bt-api openapi` → PASS.

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-api/src/routes/admin.rs api/crates/bt-api/src/app.rs api/crates/bt-api/src/openapi.rs
git commit -m "feat(api): create/update/delete team (delete-if-empty 409) under ManageWorkspace (admin slice A)"
```

---

## Task 4: Web types + `teams.ts` hooks

> **Orchestrator note:** rebuild + restart the dev API (Task 1–3 build) before Step 1 so `/api-docs/openapi.json` has the new schemas.

**Files:**
- Regenerate: `web/lib/api/schema.d.ts`
- Create: `web/lib/query/teams.ts`

- [ ] **Step 1: Regenerate the API types**

Run: `cd web && npm run gen:api`
Confirm `git diff web/lib/api/schema.d.ts` shows new `TeamRow`, `AssignableLead`, `TeamInput` schemas and the `/v1/teams`, `/v1/teams/{id}`, `/v1/leads` operations. If not, STOP and report (API not serving the new schema).

- [ ] **Step 2: Create the hooks**

Create `web/lib/query/teams.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type TeamRow = components["schemas"]["TeamRow"];
export type AssignableLead = components["schemas"]["AssignableLead"];
export type TeamInput = components["schemas"]["TeamInput"];

export function useTeams() {
  return useQuery<TeamRow[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams");
      if (error) throw error;
      return data!;
    },
  });
}

export function useAssignableLeads() {
  return useQuery<AssignableLead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/leads");
      if (error) throw error;
      return data!;
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TeamInput) => {
      const { data, error } = await api.POST("/v1/teams", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; body: TeamInput }) => {
      const { data, error } = await api.PATCH("/v1/teams/{id}", { params: { path: { id: v.id } }, body: v.body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE("/v1/teams/{id}", { params: { path: { id } } });
      // Carry the HTTP status so the UI can show a specific 409 (team-has-members) banner.
      if (error) throw Object.assign(new Error("delete team failed"), { status: response.status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/api/schema.d.ts web/lib/query/teams.ts
git commit -m "feat(web): teams admin API types + query hooks (admin slice A)"
```

---

## Task 5: Sidebar fix + /admin/teams page + client + modal

**Files:**
- Modify: `web/components/Sidebar.tsx`
- Create: `web/app/(app)/admin/teams/page.tsx`, `web/components/admin/TeamsAdminClient.tsx`, `web/components/admin/TeamEditModal.tsx`
- Create: `web/components/__tests__/AdminTeams.test.tsx`

- [ ] **Step 1: Fix the Sidebar admin section**

In `web/components/Sidebar.tsx`, replace the `ADMIN_NAV` const (lines 29-33) with:

```tsx
const ADMIN_NAV: { id: string; label: string; icon: string; href?: string; disabled?: boolean }[] = [
  { id: "admin-team", label: "Команды", icon: "team", href: "/admin/teams" },
  { id: "admin-leads", label: "Лиды", icon: "user", disabled: true },
  { id: "admin-settings", label: "Настройки", icon: "settings", disabled: true },
];
```

Add, right after `const isHr = hasPermission(user, "approve_reviews");`:

```tsx
  const canAdmin = hasPermission(user, "manage_workspace");
```

Replace the admin section block (the `{!isHr && ( ... )}` at lines 92-99) with:

```tsx
      {canAdmin && (
        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Администрирование</div>
          {ADMIN_NAV.map((n) => (
            <NavItem
              key={n.id}
              label={n.label}
              icon={n.icon}
              href={n.href}
              active={n.href ? pathname.startsWith(n.href) : false}
              disabled={n.disabled ?? false}
            />
          ))}
        </div>
      )}
```

- [ ] **Step 2: Create the server-gated page**

Create `web/app/(app)/admin/teams/page.tsx`:

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { TeamsAdminClient } from "@/components/admin/TeamsAdminClient";

export default async function AdminTeamsPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "manage_workspace")) return <NoAccess />;
  return <TeamsAdminClient />;
}
```

- [ ] **Step 3: Create TeamEditModal**

Create `web/components/admin/TeamEditModal.tsx`:

```tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import type { AssignableLead, TeamInput, TeamRow } from "@/lib/query/teams";

const COLORS = ["#F5A524", "#3D6DCB", "#2D8F5C", "#C04A3B", "#7C5CBF", "#0E9AA7", "#D8870A", "#5B5644"];
const CADENCES: [string, string][] = [["1w", "Раз в неделю"], ["2w", "Раз в две недели"], ["4w", "Раз в месяц"]];
const VIS: [string, string][] = [["private", "Приватная"], ["hr", "HR"], ["org", "Вся компания"]];

export function TeamEditModal({
  initial, leads, saving, error, onClose, onSave,
}: {
  initial: TeamRow | null;
  leads: AssignableLead[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: TeamInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mission, setMission] = useState(initial?.mission ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [leadId, setLeadId] = useState<string>(initial?.lead_id ?? "");
  const [cadence, setCadence] = useState(initial?.default_cadence ?? "2w");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "private");

  const valid = name.trim().length >= 2;
  const submit = () => {
    if (!valid) return;
    onSave({
      name: name.trim(),
      mission: mission.trim() === "" ? null : mission.trim(),
      color,
      lead_id: leadId === "" ? null : leadId,
      default_cadence: cadence,
      visibility,
    });
  };

  const input = "w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <Modal title={initial ? "Редактировать команду" : "Новая команда"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <div className="rounded-md border border-miss/30 bg-miss-soft p-2.5 text-[12.5px] text-miss">{error}</div>}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Название</div>
          <input aria-label="Название команды" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Миссия</div>
          <input aria-label="Миссия" className={input} value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Необязательно" />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Цвет</div>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Цвет ${c}`} onClick={() => setColor(c)}
                className={cn("h-7 w-7 rounded-md border", color === c ? "ring-2 ring-brand ring-offset-1" : "border-line")}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Лид</div>
          <select aria-label="Лид" className={input} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">— не назначен —</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Регулярность 1-2-1</div>
          <select aria-label="Регулярность" className={input} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {CADENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Видимость</div>
          <select aria-label="Видимость" className={input} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">Отмена</button>
          <button type="button" onClick={submit} disabled={!valid || saving}
            className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">Сохранить</button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Create TeamsAdminClient**

Create `web/components/admin/TeamsAdminClient.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  useTeams, useAssignableLeads, useCreateTeam, useUpdateTeam, useDeleteTeam,
  type TeamRow, type TeamInput,
} from "@/lib/query/teams";
import { TeamEditModal } from "./TeamEditModal";

export function TeamsAdminClient() {
  const teams = useTeams();
  const leads = useAssignableLeads();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [modal, setModal] = useState<{ open: boolean; team: TeamRow | null }>({ open: false, team: null });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (teams.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (teams.isError) return <div className="p-6 text-[13px] text-miss">Не удалось загрузить команды.</div>;

  const rows = teams.data!;
  const totalMembers = rows.reduce((s, t) => s + t.member_count, 0);
  const noLead = rows.filter((t) => t.lead_id == null).length;
  const saving = createTeam.isPending || updateTeam.isPending;

  const save = async (body: TeamInput) => {
    setError(null);
    try {
      if (modal.team) await updateTeam.mutateAsync({ id: modal.team.id, body });
      else await createTeam.mutateAsync(body);
      setModal({ open: false, team: null });
    } catch {
      setError("Не удалось сохранить команду. Попробуйте ещё раз.");
    }
  };

  const remove = async (t: TeamRow) => {
    setMenuFor(null);
    if (!confirm(`Удалить команду «${t.name}»?`)) return;
    setError(null);
    try {
      await deleteTeam.mutateAsync(t.id);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      setError(status === 409
        ? "Нельзя удалить команду с сотрудниками — сначала переместите или удалите их."
        : "Не удалось удалить команду.");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Команды</h1>
          <p className="text-[13px] text-ink-3 tabular">{rows.length} команд · {totalMembers} сотрудников · {noLead} без лида</p>
        </div>
        <button type="button" onClick={() => { setError(null); setModal({ open: true, team: null }); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
          <Plus size={14} /> Новая команда
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div className="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: "minmax(180px,1.4fr) 1.2fr 110px 130px 44px" }}>
          <div>Команда</div><div>Лид</div><div>Сотрудников</div><div>Статус</div><div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id} className="grid items-center gap-4 border-t border-line-2 px-[18px] py-3"
            style={{ gridTemplateColumns: "minmax(180px,1.4fr) 1.2fr 110px 130px 44px" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold text-ink-2 tabular"
                style={{ background: "var(--bg-tint)" }}>{t.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-[13.5px] font-semibold text-ink">{t.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {t.lead_id != null
                ? <><Avatar name={t.lead_name ?? ""} hue={t.lead_hue ?? 40} size="sm" /><span className="text-[13px]">{t.lead_name}</span></>
                : <span className="text-[13px] italic text-miss">— не назначен —</span>}
            </div>
            <div className="tabular text-[14px] font-semibold text-ink">{t.member_count}</div>
            <div>
              {t.lead_id == null
                ? <span className="rounded-full bg-miss-soft px-2 py-0.5 text-[11px] font-medium text-miss">Без лида</span>
                : <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">Активна</span>}
            </div>
            <div className="relative">
              <button type="button" aria-label={`Меню ${t.name}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"><MoreHorizontal size={14} /></button>
              {menuFor === t.id && (
                <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-bg-elev shadow-pop">
                  <button type="button" onClick={() => { setMenuFor(null); setError(null); setModal({ open: true, team: t }); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bg-tint"><Pencil size={13} /> Редактировать</button>
                  <button type="button" onClick={() => remove(t)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-miss hover:bg-bg-tint"><Trash2 size={13} /> Удалить</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <TeamEditModal
          initial={modal.team}
          leads={leads.data ?? []}
          saving={saving}
          error={error}
          onClose={() => setModal({ open: false, team: null })}
          onSave={save}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Unit tests (write, watch fail, then pass after Steps 3-4 exist)**

Create `web/components/__tests__/AdminTeams.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamEditModal } from "../admin/TeamEditModal";
import type { AssignableLead, TeamRow } from "@/lib/query/teams";

const LEADS: AssignableLead[] = [{ id: "u1", name: "Евгений Глебов", hue: 40, role: "lead" }];

describe("TeamEditModal", () => {
  it("disables save until the name is ≥2 chars, then submits a TeamInput", () => {
    const onSave = vi.fn();
    render(<TeamEditModal initial={null} leads={LEADS} saving={false} error={null} onClose={() => {}} onSave={onSave} />);
    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Название команды"), { target: { value: "Mobile" } });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Лид"), { target: { value: "u1" } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Mobile", lead_id: "u1", default_cadence: "2w", visibility: "private",
    }));
  });

  it("prefills fields when editing an existing team", () => {
    const team: TeamRow = { id: "t1", name: "Платформа", mission: "миссия", color: "#3D6DCB",
      lead_id: "u1", lead_name: "Евгений Глебов", lead_hue: 40, member_count: 8, default_cadence: "1w", visibility: "hr" };
    render(<TeamEditModal initial={team} leads={LEADS} saving={false} error={null} onClose={() => {}} onSave={() => {}} />);
    expect((screen.getByLabelText("Название команды") as HTMLInputElement).value).toBe("Платформа");
    expect(screen.getByRole("heading", { name: "Редактировать команду" })).toBeInTheDocument();
  });
});

vi.mock("@/lib/query/teams", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/teams")>();
  return {
    ...actual,
    useTeams: () => ({ isLoading: false, isError: false, data: [
      { id: "t1", name: "Платформа", mission: null, color: "#F5A524", lead_id: "u1", lead_name: "Евгений Глебов", lead_hue: 40, member_count: 8, default_cadence: "2w", visibility: "private" },
      { id: "t2", name: "Internal", mission: null, color: "#F5A524", lead_id: null, lead_name: null, lead_hue: null, member_count: 0, default_cadence: "2w", visibility: "private" },
    ] }),
    useAssignableLeads: () => ({ data: LEADS }),
    useCreateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

import { TeamsAdminClient } from "../admin/TeamsAdminClient";

describe("TeamsAdminClient", () => {
  it("renders the header counts, rows, and «Без лида»", () => {
    render(<TeamsAdminClient />);
    expect(screen.getByText("2 команд · 8 сотрудников · 1 без лида")).toBeInTheDocument();
    expect(screen.getByText("Платформа")).toBeInTheDocument();
    expect(screen.getByText("Без лида")).toBeInTheDocument();
  });

  it("«Новая команда» opens the create modal", () => {
    render(<TeamsAdminClient />);
    fireEvent.click(screen.getByRole("button", { name: /Новая команда/ }));
    expect(screen.getByRole("heading", { name: "Новая команда" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run — expect PASS + typecheck + lint**

Run: `cd web && npm test -- AdminTeams` → PASS.
Run: `cd web && npx tsc --noEmit` → no errors.
Run: `cd web && npm run lint` → clean (aside from the pre-existing `FilesTab.tsx` warning).

- [ ] **Step 7: Commit**

```bash
git add web/components/Sidebar.tsx "web/app/(app)/admin/teams/page.tsx" web/components/admin/ web/components/__tests__/AdminTeams.test.tsx
git commit -m "feat(web): admin teams page, table, edit modal + sidebar fix (admin slice A)"
```

---

## Task 6: e2e — HR manages teams; lead has no access

**Files:**
- Create: `web/e2e/admin-teams.spec.ts`

> **Orchestrator note:** dev API (new build) + web must be running against a freshly seeded DB.

- [ ] **Step 1: Write the spec**

Create `web/e2e/admin-teams.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead has no «Команды» nav and /admin/teams denies access", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Команды" })).toHaveCount(0);
  await page.goto("/admin/teams");
  await expect(page.getByText("Недостаточно прав")).toBeVisible({ timeout: 10_000 });
});

test("HR creates, renames, and deletes an empty team", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/admin/teams");
  await expect(page.getByRole("heading", { name: "Команды" })).toBeVisible({ timeout: 10_000 });

  // Create
  await page.getByRole("button", { name: /Новая команда/ }).click();
  await page.getByLabel("Название команды").fill("QA e2e");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("QA e2e")).toBeVisible({ timeout: 10_000 });

  // Rename via the row menu
  await page.getByRole("button", { name: "Меню QA e2e" }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByLabel("Название команды").fill("QA e2e 2");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("QA e2e 2")).toBeVisible({ timeout: 10_000 });

  // Delete (empty → succeeds). Accept the confirm() dialog.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Меню QA e2e 2" }).click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("QA e2e 2")).toHaveCount(0, { timeout: 10_000 });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `cd web && npm run test:e2e -- admin-teams`
Expected: 2 tests PASS. If a selector fails, inspect the rendered UI and adjust (do not weaken the core assertions: lead → «Недостаточно прав»; HR create/rename/delete round-trip). The created team is deleted at the end, leaving shared state clean.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/admin-teams.spec.ts
git commit -m "test(e2e): HR team CRUD; lead denied /admin/teams (admin slice A)"
```

---

## Task 7: Full verification + local review

**Files:** none (verification only).

- [ ] **Step 1: Re-seed the dev DB** (only if a prior e2e run left it dirty)

```bash
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
```
Then restart the dev API (`cargo run -p bt-api`) so the seed re-runs.

- [ ] **Step 2: Full backend suite**

Run: `cargo test --manifest-path api/Cargo.toml -p bt-domain` → PASS.
Run: `bash api/scripts/test.sh -p bt-db` → PASS.
Run: `bash api/scripts/test.sh -p bt-api` → PASS.

- [ ] **Step 3: Full web suite + typecheck + lint**

Run: `cd web && npm test` → PASS.
Run: `cd web && npx tsc --noEmit` → no errors.
Run: `cd web && npm run lint` → clean (aside from the pre-existing `FilesTab.tsx` warning).

- [ ] **Step 4: Full e2e**

Run: `cd web && npm run test:e2e` → all specs PASS (the admin-teams spec cleans up its own team).

- [ ] **Step 5: Local visual review**

Bring the app up (API :8080, web :3000) on the fresh seed. As HR (o.klimova@beeteam.io) open `/admin/teams`: the «Администрирование» → «Команды» item is present; the seeded team shows «8 сотрудников» + Евгений as lead; create a team, rename it, delete it. As lead (e.glebov@beeteam.io): no «Администрирование» section; `/admin/teams` shows «Недостаточно прав». Then wait for the merge command.

---

## Self-Review

**1. Spec coverage**
- `ManageWorkspace` permission on hr_admin → Task 1. ✓
- `GET /v1/teams`, `GET /v1/leads` → Task 2. ✓
- `POST` / `PATCH` / `DELETE /v1/teams` (delete-if-empty 409) → Task 3. ✓
- Validation (name/cadence/visibility/color/lead-in-workspace) → Task 3. ✓
- Create auto-assigns the workspace template → Task 3 (`ORDER BY system DESC, updated_at`). ✓
- Web types + hooks → Task 4. ✓
- Sidebar fix + `/admin/teams` gate + client + modal → Task 5. ✓
- Tests: bt-api list/create/update/delete/409/forbidden/validation/leads (Tasks 2-3); web unit modal + client (Task 5); e2e HR CRUD + lead no-access (Task 6). ✓
- Edge cases: 403 without permission (Task 2/3), 409 non-empty delete (Task 3), «Без лида» (Task 5), NoAccess gate (Task 5/6). ✓

**2. Placeholder scan** — none; every code step is complete. (The Task 2 note about temporary read-only route registration is an explicit, resolved instruction, not a placeholder.)

**3. Type consistency** — `TeamRow`/`AssignableLead`/`TeamInput` fields identical across domain, handlers (`team_rows`/`load_team_row`), hooks, modal, and client. `ManageWorkspace` (snake_case `manage_workspace`) used uniformly in `require_permission`, `hasPermission`, page gate, and sidebar. Routes `/v1/teams`, `/v1/teams/{id}`, `/v1/leads` consistent between app.rs, openapi.rs, and the hooks. `default_cadence`/`visibility` validated against the same sets everywhere.
