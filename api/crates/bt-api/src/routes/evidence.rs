use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{CreateEvidence, Evidence};
use uuid::Uuid;
use validator::Validate;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;

type EvRow = (
    Uuid, Option<Uuid>, String, String, i32, String, String, chrono::DateTime<chrono::Utc>,
);

const EV_SELECT: &str = "SELECT ge.id, ge.meeting_id, gb.key, gb.name, ge.level_ord, \
    ge.status::text, ge.note, ge.created_at \
    FROM grade_evidence ge JOIN grade_blocks gb ON gb.id = ge.block_id";

fn ev_from(r: EvRow) -> Evidence {
    Evidence {
        id: r.0,
        meeting_id: r.1,
        block_key: r.2,
        block_name: r.3,
        level_ord: r.4,
        status: r.5,
        note: r.6,
        created_at: r.7.to_rfc3339(),
    }
}

async fn ev_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM grade_evidence WHERE id = $1")
        .bind(id).fetch_optional(pool).await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

#[utoipa::path(
    post, path = "/v1/evidence", request_body = CreateEvidence,
    responses((status = 201, body = Evidence), (status = 400), (status = 403))
)]
pub async fn create_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateEvidence>,
) -> AppResult<(StatusCode, Json<Evidence>)> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    if body.status != "demonstrated" && body.status != "partial" {
        return Err(AppError::BadRequest("status must be demonstrated|partial".into()));
    }
    require_member_access(&auth, body.member_id, &state.pool).await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO grade_evidence (member_id, meeting_id, block_id, level_ord, status, note, created_by) \
         VALUES ($1,$2,$3,$4,$5::evidence_status,$6,$7) RETURNING id",
    )
    .bind(body.member_id).bind(body.meeting_id).bind(body.block_id)
    .bind(body.level_ord).bind(&body.status).bind(&body.note).bind(auth.id)
    .fetch_one(&state.pool).await?;

    let r: EvRow = sqlx::query_as(&format!("{EV_SELECT} WHERE ge.id = $1"))
        .bind(id.0).fetch_one(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(ev_from(r))))
}

#[utoipa::path(
    delete, path = "/v1/evidence/{id}",
    params(("id" = uuid::Uuid, Path, description = "Evidence id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = ev_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    sqlx::query("DELETE FROM grade_evidence WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get, path = "/v1/members/{id}/evidence",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses((status = 200, body = [Evidence]), (status = 403))
)]
pub async fn list_member_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<Evidence>>> {
    require_member_access(&auth, member_id, &state.pool).await?;
    let rows: Vec<EvRow> = sqlx::query_as(&format!("{EV_SELECT} WHERE ge.member_id = $1 ORDER BY ge.created_at DESC"))
        .bind(member_id).fetch_all(&state.pool).await?;
    Ok(Json(rows.into_iter().map(ev_from).collect()))
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

    async fn igor_and_block(pool: &sqlx::PgPool) -> (uuid::Uuid, uuid::Uuid) {
        let m: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(pool).await.unwrap();
        let b: (uuid::Uuid,) = sqlx::query_as(
            "SELECT gb.id FROM grade_blocks gb JOIN disciplines d ON d.id = gb.discipline_id \
             WHERE d.key = 'backend' AND gb.key = 'stack'",
        ).fetch_one(pool).await.unwrap();
        (m.0, b.0)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_then_list_evidence(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":4,"status":"demonstrated","note":"good"}}"#
        );
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["block_key"], "stack");
        assert_eq!(json["level_ord"], 4);

        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{member}/evidence"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let arr: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(arr.as_array().unwrap().iter().any(|e| e["block_key"] == "stack"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_rejects_bad_level(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":9,"status":"demonstrated","note":""}}"#
        );
        let resp = app(pool).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_rejects_bad_status(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":3,"status":"bogus","note":""}}"#
        );
        let resp = app(pool).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_evidence_then_404(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":2,"status":"partial","note":""}}"#
        );
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"].as_str().unwrap().to_string();

        let resp = app(pool.clone()).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/evidence/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let resp = app(pool).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/evidence/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_evidence_forbidden_for_foreign_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET")
                .uri(format!("/v1/members/{}/evidence", uuid::Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }
}
