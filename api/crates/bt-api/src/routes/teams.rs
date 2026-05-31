use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// Authorize that `auth` may read `team_id`. v1: only the team's lead may.
/// This is the seam where hr_admin / skip-level rules will land later.
pub async fn require_team_access(auth: &AuthUser, team_id: Uuid, pool: &PgPool) -> AppResult<()> {
    let owns: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM teams WHERE id = $1 AND lead_id = $2")
            .bind(team_id)
            .bind(auth.id)
            .fetch_optional(pool)
            .await?;
    if owns.is_some() {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
