use bt_domain::Permission;

use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// 403 unless the caller's role grants the permission.
pub fn require_permission(auth: &AuthUser, p: Permission) -> AppResult<()> {
    if bt_domain::permissions_of(&auth.role).contains(&p) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
