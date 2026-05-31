use axum::extract::State;
use axum::Extension;
use axum::Json;
use bt_domain::{LoginRequest, LoginResponse, UserDto};

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::auth::{jwt, password};
use crate::error::{AppError, AppResult};

#[utoipa::path(
    post,
    path = "/v1/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Authenticated", body = LoginResponse),
        (status = 401, description = "Invalid credentials"),
    )
)]
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // Identical 401 whether the email is unknown or the password is wrong.
    let row: Option<(uuid::Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT id, name, email, role::text, password_hash FROM users WHERE email = $1",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, name, email, role, hash) = row.ok_or(AppError::Unauthorized)?;

    if !password::verify_password(&body.password, &hash) {
        return Err(AppError::Unauthorized);
    }

    let token = jwt::encode_jwt(id, &role, &state.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;

    Ok(Json(LoginResponse {
        token,
        user: UserDto { id, name, email, role },
    }))
}

#[utoipa::path(
    get,
    path = "/v1/auth/me",
    responses(
        (status = 200, description = "Current user", body = UserDto),
        (status = 401, description = "Not authenticated"),
    )
)]
pub async fn me(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<UserDto>> {
    let row: Option<(uuid::Uuid, String, String, String)> = sqlx::query_as(
        "SELECT id, name, email, role::text FROM users WHERE id = $1",
    )
    .bind(auth.id)
    .fetch_optional(&state.pool)
    .await?;

    let (id, name, email, role) = row.ok_or(AppError::Unauthorized)?;
    Ok(Json(UserDto { id, name, email, role }))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app::{build_router, AppState};
    use crate::auth::password::hash_password;

    async fn seed_one_user(pool: &sqlx::PgPool) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1, 'lead@x.io', $2, 'Lead X', 'lead'::user_role, 40)",
        )
        .bind(ws.0).bind(hash).execute(pool).await.unwrap();
    }

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState { pool, jwt_secret: "test-secret".into() })
    }

    async fn post_login(pool: sqlx::PgPool, body: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn login_succeeds_with_correct_password(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (status, json) =
            post_login(pool, r#"{"email":"lead@x.io","password":"demo1234"}"#).await;
        assert_eq!(status, StatusCode::OK);
        assert!(json["token"].as_str().unwrap().len() > 10);
        assert_eq!(json["user"]["email"], "lead@x.io");
        assert_eq!(json["user"]["role"], "lead");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn login_rejects_wrong_password(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (status, _) =
            post_login(pool, r#"{"email":"lead@x.io","password":"nope"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn login_rejects_unknown_email(pool: sqlx::PgPool) {
        let (status, _) =
            post_login(pool, r#"{"email":"ghost@x.io","password":"demo1234"}"#).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    async fn get_me(pool: sqlx::PgPool, bearer: Option<&str>) -> StatusCode {
        let mut builder = Request::builder().method("GET").uri("/v1/auth/me");
        if let Some(b) = bearer {
            builder = builder.header("authorization", format!("Bearer {b}"));
        }
        app(pool)
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn me_returns_user_with_valid_token(pool: sqlx::PgPool) {
        seed_one_user(&pool).await;
        let (_, json) =
            post_login(pool.clone(), r#"{"email":"lead@x.io","password":"demo1234"}"#).await;
        let token = json["token"].as_str().unwrap().to_string();
        assert_eq!(get_me(pool, Some(&token)).await, StatusCode::OK);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn me_rejects_missing_token(pool: sqlx::PgPool) {
        assert_eq!(get_me(pool, None).await, StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn me_rejects_garbage_token(pool: sqlx::PgPool) {
        assert_eq!(get_me(pool, Some("not.a.jwt")).await, StatusCode::UNAUTHORIZED);
    }
}
