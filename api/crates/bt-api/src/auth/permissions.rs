use bt_domain::Permission;

use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// True if the caller's role grants the permission.
pub fn has_permission(auth: &AuthUser, p: Permission) -> bool {
    bt_domain::permissions_of(&auth.role).contains(&p)
}

/// 403 unless the caller's role grants the permission.
pub fn require_permission(auth: &AuthUser, p: Permission) -> AppResult<()> {
    if has_permission(auth, p) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
