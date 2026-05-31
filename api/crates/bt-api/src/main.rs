mod app;
mod auth;
mod error;
mod openapi;
mod routes;

use app::{build_router, AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,bt_api=debug".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")?;
    let bind = std::env::var("API_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into());

    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-only-change-me".into());

    let pool = bt_db::pool(&database_url).await?;
    bt_db::migrate(&pool).await?;
    bt_db::seed::seed_demo(&pool).await?;

    let router = build_router(AppState { pool, jwt_secret });
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("bt-api listening on {bind}");
    axum::serve(listener, router).await?;
    Ok(())
}
