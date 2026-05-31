use axum::routing::get;
use axum::Json;
use axum::Router;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;

use crate::auth::middleware::require_auth;
use crate::openapi::ApiDoc;
use crate::routes;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
}

/// Build the application router. Pure function of state — used by tests too.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let protected = Router::new()
        .route("/v1/auth/me", get(routes::auth::me))
        .route_layer(axum::middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .route("/v1/health", get(routes::health::health))
        .route("/v1/auth/login", axum::routing::post(routes::auth::login))
        .route("/api-docs/openapi.json", get(openapi_json))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
