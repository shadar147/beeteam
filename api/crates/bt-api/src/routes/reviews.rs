use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{CalibrationPeer, Review, ReviewScore, UpdateReview};
use chrono::Datelike;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;

pub(crate) type RvRow = (
    Uuid, String, String, i32, Option<i32>, Option<String>, Option<i32>, String,
    chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>,
    String, Option<chrono::DateTime<chrono::Utc>>,
);

pub(crate) const RV_SELECT: &str = "SELECT id, period, status::text, from_grade_ord, target_ord, \
    decision::text, to_grade_ord, summary, created_at, finalized_at, \
    hr_comment, resolved_at FROM performance_reviews";

pub(crate) fn rv_from(r: RvRow, scores: Vec<ReviewScore>) -> Review {
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
        hr_comment: r.10,
        resolved_at: r.11.map(|d| d.to_rfc3339()),
        scores,
    }
}

pub(crate) async fn rv_scores(pool: &sqlx::PgPool, review_id: Uuid) -> AppResult<Vec<ReviewScore>> {
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
pub(crate) async fn rv_member_status(pool: &sqlx::PgPool, id: Uuid) -> AppResult<(Uuid, String)> {
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
    let (member_id, status) = rv_member_status(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    if status != "draft" {
        return Err(AppError::Conflict("only drafts can be deleted".into()));
    }
    sqlx::query("DELETE FROM performance_reviews WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

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
        let core = scores.iter().find(|s| s["block_key"] == "core").unwrap();
        assert_eq!(core["self_ord"], 6);
        assert_eq!(core["lead_ord"], 5);
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
}
