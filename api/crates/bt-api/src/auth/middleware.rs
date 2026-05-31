use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::app::AppState;
use crate::auth::jwt;
use crate::error::AppError;

/// Authenticated principal, inserted into request extensions by `require_auth`.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: uuid::Uuid,
    pub role: String,
}

/// Axum middleware: require a valid `Authorization: Bearer <jwt>` header.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let claims = jwt::decode_jwt(token, &state.jwt_secret).map_err(|_| AppError::Unauthorized)?;

    req.extensions_mut().insert(AuthUser {
        id: claims.sub,
        role: claims.role,
    });

    Ok(next.run(req).await)
}
