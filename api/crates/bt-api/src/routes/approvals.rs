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
