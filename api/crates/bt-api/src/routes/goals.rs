use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{Goal, CreateGoalRequest, UpdateGoalRequest, DevItem, CreateDevItemRequest, UpdateDevItemRequest, Competency, CreateCompetencyRequest, UpdateCompetencyRequest};
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
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
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
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
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

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app::{build_router, AppState};
    use crate::auth::password::hash_password;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
        })
    }

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
}
