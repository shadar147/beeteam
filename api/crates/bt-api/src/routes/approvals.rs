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

    /// Drive Анна's review to pending via the lead wizard endpoints; returns review id.
    async fn pending_review_for_anna(pool: &sqlx::PgPool, lead_token: &str) -> String {
        pending_review_for_anna_with(pool, lead_token, "promote").await
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
    async fn pending_queue_requires_permission(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_pending(&pool, &lead).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
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
