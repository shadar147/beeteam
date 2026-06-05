use axum::Json;
use bt_domain::Health;

#[utoipa::path(
    get,
    path = "/v1/health",
    responses((status = 200, description = "Service is healthy", body = Health))
)]
pub async fn health() -> Json<Health> {
    Json(Health::ok())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app::{build_router, AppState};

    #[sqlx::test]
    async fn health_returns_ok(pool: sqlx::PgPool) {
        let router = build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
        });
        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/v1/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["status"], "ok");
    }
}
