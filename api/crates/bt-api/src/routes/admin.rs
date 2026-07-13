use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{AssignableLead, Permission, TeamInput, TeamRow};
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
    // Atomic guard: delete only if the team is still empty — no TOCTOU between check and delete.
    let deleted: Option<(Uuid,)> = sqlx::query_as(
        "DELETE FROM teams WHERE id = $1 AND workspace_id = $2 \
           AND NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = $1) RETURNING id",
    ).bind(id).bind(workspace_id).fetch_optional(&state.pool).await?;
    if deleted.is_none() {
        return Err(AppError::Conflict("team has members".into()));
    }
    Ok(StatusCode::NO_CONTENT)
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

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_leads_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_json(&pool, &lead, "/v1/leads").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

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
            Some("{\"name\":\"Mobile\",\"mission\":null,\"color\":\"#3D6DCB\",\"lead_id\":null,\"default_cadence\":\"2w\",\"visibility\":\"private\"}")).await;
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
        assert_eq!(get_json(&pool, &hr, "/v1/teams").await.1.as_array().unwrap().len(), 1);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn update_team_renames_and_reassigns_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let teams = get_json(&pool, &hr, "/v1/teams").await.1;
        let id = teams[0]["id"].as_str().unwrap();
        let leads = get_json(&pool, &hr, "/v1/leads").await.1;
        let olga = leads.as_array().unwrap().iter().find(|l| l["name"] == "Ольга Климова").unwrap()["id"].as_str().unwrap().to_string();
        let body = format!("{{\"name\":\"Платформа+\",\"mission\":\"миссия\",\"color\":\"#F5A524\",\"lead_id\":\"{olga}\",\"default_cadence\":\"1w\",\"visibility\":\"hr\"}}");
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
            "{\"name\":\"  \",\"color\":\"#F5A524\",\"default_cadence\":\"2w\",\"visibility\":\"private\"}",
            "{\"name\":\"X\",\"color\":\"#F5A524\",\"default_cadence\":\"9w\",\"visibility\":\"private\"}",
            "{\"name\":\"X\",\"color\":\"#F5A524\",\"default_cadence\":\"2w\",\"visibility\":\"nope\"}",
            "{\"name\":\"X\",\"color\":\"red\",\"default_cadence\":\"2w\",\"visibility\":\"private\"}",
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
            Some("{\"name\":\"X\",\"color\":\"#F5A524\",\"default_cadence\":\"2w\",\"visibility\":\"private\"}")).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn update_team_unknown_id_404(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let body = "{\"name\":\"X\",\"color\":\"#F5A524\",\"default_cadence\":\"2w\",\"visibility\":\"private\"}";
        let (status, _) = send(&pool, "PATCH", &format!("/v1/teams/{}", uuid::Uuid::new_v4()), &hr, Some(body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_team_unknown_lead_400(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let body = format!(
            "{{\"name\":\"X\",\"color\":\"#F5A524\",\"lead_id\":\"{}\",\"default_cadence\":\"2w\",\"visibility\":\"private\"}}",
            uuid::Uuid::new_v4());
        let (status, _) = send(&pool, "POST", "/v1/teams", &hr, Some(&body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}
