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
    pub web_origin: String,
}

/// Build the application router. Pure function of state — used by tests too.
pub fn build_router(state: AppState) -> Router {
    let cors = match state.web_origin.parse::<axum::http::HeaderValue>() {
        Ok(origin) => CorsLayer::new()
            .allow_origin(origin)
            .allow_methods(Any)
            .allow_headers(Any),
        Err(_) => CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    };

    let protected = Router::new()
        .route("/v1/auth/me", get(routes::auth::me))
        .route("/v1/teams/:id/members", get(routes::teams::list_members))
        .route("/v1/teams/:id/stats", get(routes::teams::team_stats))
        .route("/v1/members/:id", get(routes::members::get_member))
        .route("/v1/members/:id/meetings", get(routes::members::list_member_meetings))
        .route("/v1/members/:id/goals", get(routes::members::get_member_goals))
        .route("/v1/members/:id/files", get(routes::members::list_member_files))
        .route("/v1/meetings/:id", get(routes::meetings::get_meeting))
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
