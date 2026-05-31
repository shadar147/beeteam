use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Liveness/readiness payload returned by `GET /v1/health`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct Health {
    pub status: String,
    pub version: String,
}

impl Health {
    pub fn ok() -> Self {
        Self {
            status: "ok".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

/// JWT claims for an authenticated session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Claims {
    pub sub: uuid::Uuid, // user id
    pub role: String,
    pub exp: i64, // unix seconds
}

/// Login request body.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Public user shape returned to the client.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct UserDto {
    pub id: uuid::Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
}

/// Successful login payload.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserDto,
}

/// `/auth/me` response: the user plus the team they lead (if any).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct MeResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
    pub team_id: Option<uuid::Uuid>,
}

/// A team member as shown in the TeamList table.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberRow {
    pub id: uuid::Uuid,
    pub name: String,
    pub role: String,
    pub email: String,
    pub joined: String,
    pub tz: String,
    pub hue: i32,
    pub tags: Vec<String>,
    pub status: String,
    pub mood_trend: Vec<i32>,
    pub last_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub next_meet: Option<chrono::DateTime<chrono::Utc>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_ok_serializes_to_expected_json() {
        let json = serde_json::to_value(Health::ok()).unwrap();
        assert_eq!(json["status"], "ok");
        assert!(json["version"].is_string());
    }
}
