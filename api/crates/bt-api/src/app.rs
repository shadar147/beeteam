use axum::routing::get;
use axum::Router;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::routes;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

/// Build the application router. Pure function of state — used by tests too.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/v1/health", get(routes::health::health))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}
