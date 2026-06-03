use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{CreateMeetingRequest, MeetingDetail, UpdateMeetingRequest};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

/// Load a meeting plus its member's team default template id. None if no such meeting.
pub(crate) async fn load_meeting_detail(
    pool: &PgPool,
    meeting_id: Uuid,
) -> AppResult<Option<MeetingDetail>> {
    let r: Option<(
        uuid::Uuid, uuid::Uuid, chrono::DateTime<chrono::Utc>, String, i32,
        Option<String>, Option<i32>, Option<String>, Option<String>,
        Option<String>, Option<String>, Vec<String>, Option<String>, Option<uuid::Uuid>,
    )> = sqlx::query_as(
        "SELECT m.id, m.member_id, m.date, m.state::text, m.duration_min, m.mood, m.mood_score, \
                m.blockers, m.goals, m.feedback_to, m.feedback_from, m.development, m.relationships, \
                t.default_template_id \
         FROM meetings m \
         JOIN team_members tm ON tm.id = m.member_id \
         JOIN teams t ON t.id = tm.team_id \
         WHERE m.id = $1",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|r| MeetingDetail {
        id: r.0, member_id: r.1, date: r.2, state: r.3, duration_min: r.4,
        mood: r.5, mood_score: r.6, blockers: r.7, goals: r.8,
        feedback_to: r.9, feedback_from: r.10, development: r.11, relationships: r.12,
        template_id: r.13,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/meetings/{id}",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Meeting detail (all note fields)", body = MeetingDetail),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
    )
)]
pub async fn get_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, detail.member_id, &state.pool).await?;
    Ok(Json(detail))
}

#[utoipa::path(
    post,
    path = "/v1/meetings",
    request_body = CreateMeetingRequest,
    responses(
        (status = 201, description = "Created planned meeting", body = MeetingDetail),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn create_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateMeetingRequest>,
) -> AppResult<(StatusCode, Json<MeetingDetail>)> {
    require_member_access(&auth, body.member_id, &state.pool).await?;

    let row: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
         SELECT tm.workspace_id, tm.id, COALESCE($2, now()), 'planned'::meeting_state, 45 \
         FROM team_members tm WHERE tm.id = $1 RETURNING id",
    )
    .bind(body.member_id)
    .bind(body.date)
    .fetch_one(&state.pool)
    .await?;

    let detail = load_meeting_detail(&state.pool, row.0).await?.ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(detail)))
}

#[utoipa::path(
    patch,
    path = "/v1/meetings/{id}",
    request_body = UpdateMeetingRequest,
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Updated meeting", body = MeetingDetail),
        (status = 400, description = "Invalid payload"),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
    )
)]
pub async fn update_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
    Json(body): Json<UpdateMeetingRequest>,
) -> AppResult<Json<MeetingDetail>> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;

    sqlx::query(
        "UPDATE meetings SET \
           date          = COALESCE($2, date), \
           duration_min  = COALESCE($3, duration_min), \
           mood          = COALESCE($4, mood), \
           mood_score    = COALESCE($5, mood_score), \
           blockers      = COALESCE($6, blockers), \
           goals         = COALESCE($7, goals), \
           feedback_to   = COALESCE($8, feedback_to), \
           feedback_from = COALESCE($9, feedback_from), \
           development   = COALESCE($10, development), \
           relationships = COALESCE($11, relationships), \
           updated_at    = now() \
         WHERE id = $1",
    )
    .bind(meeting_id)
    .bind(body.date)
    .bind(body.duration_min)
    .bind(body.mood)
    .bind(body.mood_score)
    .bind(body.blockers)
    .bind(body.goals)
    .bind(body.feedback_to)
    .bind(body.feedback_from)
    .bind(body.development.as_deref())
    .bind(body.relationships)
    .execute(&state.pool)
    .await?;

    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}

#[utoipa::path(
    post,
    path = "/v1/meetings/{id}/complete",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Completed meeting", body = MeetingDetail),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
        (status = 409, description = "Meeting is not planned"),
    )
)]
pub async fn complete_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;
    if existing.state != "planned" {
        return Err(AppError::Conflict("meeting is not planned".into()));
    }
    sqlx::query("UPDATE meetings SET state = 'done'::meeting_state, updated_at = now() WHERE id = $1")
        .bind(meeting_id)
        .execute(&state.pool)
        .await?;
    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}

#[utoipa::path(
    delete,
    path = "/v1/meetings/{id}",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
        (status = 409, description = "Cannot delete a completed meeting"),
    )
)]
pub async fn delete_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;
    if existing.state == "done" {
        return Err(AppError::Conflict("cannot delete a completed meeting".into()));
    }
    sqlx::query("DELETE FROM meetings WHERE id = $1")
        .bind(meeting_id)
        .execute(&state.pool)
        .await?;
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
        })
    }

    /// Seeds a workspace, a lead, a team (with the Базовый template as default), and Anna.
    /// Returns (token, anna_id, template_id).
    async fn seed(pool: &sqlx::PgPool) -> (String, uuid::Uuid, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let tpl: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO field_templates (workspace_id, name, system) VALUES ($1,'Базовый',true) RETURNING id",
        ).bind(ws.0).fetch_one(pool).await.unwrap();
        sqlx::query("INSERT INTO field_defs (template_id, ord, type, title) VALUES ($1,0,'mood'::field_type,'Настроение')")
            .bind(tpl.0).execute(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'a@x.io',$2,'Lead','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_template_id, default_cadence, visibility) \
             VALUES ($1,'team',$2,$3,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).bind(tpl.0).fetch_one(pool).await.unwrap();
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Анна','Frontend','anna@x.io','2023','Europe/Moscow','{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "a@x.io").await, anna.0, tpl.0)
    }

    /// Seeds a second lead+team+member (foreign to `seed`'s caller). Returns (token, member_id).
    async fn seed_foreign(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('F') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'b@x.io',$2,'Lead2','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'team2',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let bob: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Боб','BE','bob@x.io','2023','Europe/Moscow','{5,5,5}','ok'::member_status,'{}',10,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "b@x.io").await, bob.0)
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

    async fn req(pool: sqlx::PgPool, method: &str, uri: &str, token: &str, body: Option<serde_json::Value>)
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

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_makes_planned_meeting_with_template(pool: sqlx::PgPool) {
        let (token, anna, tpl) = seed(&pool).await;
        let (status, json) = req(pool, "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["state"], "planned");
        assert_eq!(json["template_id"], tpl.to_string());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_foreign_member_is_forbidden(pool: sqlx::PgPool) {
        let (token, _anna, _tpl) = seed(&pool).await;
        let (foreign_token, bob) = seed_foreign(&pool).await;
        let _ = foreign_token;
        let (status, _) = req(pool, "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": bob}))).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_writes_typed_columns(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap();
        let (status, json) = req(pool, "PATCH", &format!("/v1/meetings/{id}"), &token,
            Some(serde_json::json!({
                "blockers": "Флака", "mood_score": 8,
                "development": ["Курс","Книга"]
            }))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["blockers"], "Флака");
        assert_eq!(json["mood_score"], 8);
        assert_eq!(json["development"][1], "Книга");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_rejects_bad_mood_score(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap();
        let (status, _) = req(pool, "PATCH", &format!("/v1/meetings/{id}"), &token,
            Some(serde_json::json!({"mood_score": 99}))).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn complete_transitions_then_conflicts(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap().to_string();
        let (s1, j1) = req(pool.clone(), "POST", &format!("/v1/meetings/{id}/complete"), &token, None).await;
        assert_eq!(s1, StatusCode::OK);
        assert_eq!(j1["state"], "done");
        let (s2, _) = req(pool, "POST", &format!("/v1/meetings/{id}/complete"), &token, None).await;
        assert_eq!(s2, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_planned_then_gone_and_done_conflicts(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        // planned → delete → 204 → 404
        let (_, m1) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id1 = m1["id"].as_str().unwrap().to_string();
        let (sd, _) = req(pool.clone(), "DELETE", &format!("/v1/meetings/{id1}"), &token, None).await;
        assert_eq!(sd, StatusCode::NO_CONTENT);
        let (sg, _) = req(pool.clone(), "GET", &format!("/v1/meetings/{id1}"), &token, None).await;
        assert_eq!(sg, StatusCode::NOT_FOUND);
        // done → delete → 409
        let (_, m2) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id2 = m2["id"].as_str().unwrap().to_string();
        req(pool.clone(), "POST", &format!("/v1/meetings/{id2}/complete"), &token, None).await;
        let (s409, _) = req(pool, "DELETE", &format!("/v1/meetings/{id2}"), &token, None).await;
        assert_eq!(s409, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn mutations_foreign_member_forbidden(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (foreign_token, _bob) = seed_foreign(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap().to_string();
        let (s1, _) = req(pool.clone(), "PATCH", &format!("/v1/meetings/{id}"), &foreign_token,
            Some(serde_json::json!({"blockers":"x"}))).await;
        let (s2, _) = req(pool.clone(), "POST", &format!("/v1/meetings/{id}/complete"), &foreign_token, None).await;
        let (s3, _) = req(pool, "DELETE", &format!("/v1/meetings/{id}"), &foreign_token, None).await;
        assert_eq!(s1, StatusCode::FORBIDDEN);
        assert_eq!(s2, StatusCode::FORBIDDEN);
        assert_eq!(s3, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn template_returns_ordered_fields(pool: sqlx::PgPool) {
        let (token, _anna, tpl) = seed(&pool).await;
        let (status, json) = req(pool, "GET", &format!("/v1/templates/{tpl}"), &token, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["name"], "Базовый");
        assert_eq!(json["fields"][0]["kind"], "mood");
        assert_eq!(json["fields"][0]["title"], "Настроение");
    }
}
