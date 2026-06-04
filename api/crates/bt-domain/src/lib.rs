use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

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

/// The 4 TeamList stat cards.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TeamStats {
    pub this_week: i64,
    pub overdue: i64,
    pub avg_mood: f64,
    pub avg_mood_delta: f64,
    pub notes_quarter: i64,
}

/// Full header for the EmployeeProfile screen.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberDetail {
    pub id: uuid::Uuid,
    pub name: String,
    pub role: String,
    pub email: String,
    pub joined: String,
    pub tz: String,
    pub hue: i32,
    pub status: String,
    pub tags: Vec<String>,
    pub mood_trend: Vec<i32>,
    pub last_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub next_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub meetings_total: i64,
}

/// One row in the History feed / calendar.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MeetingListItem {
    pub id: uuid::Uuid,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,
    pub mood: Option<String>,
    pub mood_score: Option<i32>,
    pub preview: String,
}

/// Expanded meeting for the MeetingDetailCard.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MeetingDetail {
    pub id: uuid::Uuid,
    pub member_id: uuid::Uuid,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,
    pub duration_min: i32,
    pub mood: Option<String>,
    pub mood_score: Option<i32>,
    pub blockers: Option<String>,
    pub goals: Option<String>,
    pub feedback_to: Option<String>,
    pub feedback_from: Option<String>,
    pub development: Vec<String>,
    pub relationships: Option<String>,
    pub template_id: Option<uuid::Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Goal {
    pub id: uuid::Uuid,
    pub quarter: String,
    pub title: String,
    pub key_result: String,
    pub progress: i32,
    pub status: String,
    pub due: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DevItem {
    pub id: uuid::Uuid,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Competency {
    pub id: uuid::Uuid,
    pub label: String,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GoalsResponse {
    pub okrs: Vec<Goal>,
    pub development: Vec<DevItem>,
    pub competencies: Vec<Competency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FileMeta {
    pub id: uuid::Uuid,
    pub name: String,
    pub mime: String,
    pub kind: String,
    pub size_bytes: i64,
    pub meeting_label: Option<String>,
    pub uploaded_by: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Create a new (planned) 1-2-1 for a member.
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateMeetingRequest {
    pub member_id: uuid::Uuid,
    /// Defaults to now() when omitted.
    pub date: Option<chrono::DateTime<chrono::Utc>>,
}

/// Autosave patch — every field optional; provided fields are written.
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateMeetingRequest {
    pub date: Option<chrono::DateTime<chrono::Utc>>,
    #[validate(range(min = 1, message = "duration_min must be positive"))]
    pub duration_min: Option<i32>,
    pub mood: Option<String>,
    #[validate(range(min = 1, max = 10, message = "mood_score must be 1..10"))]
    pub mood_score: Option<i32>,
    pub blockers: Option<String>,
    pub goals: Option<String>,
    pub feedback_to: Option<String>,
    pub feedback_from: Option<String>,
    pub development: Option<Vec<String>>,
    pub relationships: Option<String>,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateGoalRequest {
    pub member_id: uuid::Uuid,
    pub quarter: String,
    pub title: String,
    pub key_result: String,
    #[validate(range(min = 0, max = 100, message = "progress must be 0..100"))]
    pub progress: i32,
    pub status: String,
    pub due: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateGoalRequest {
    pub quarter: Option<String>,
    pub title: Option<String>,
    pub key_result: Option<String>,
    #[validate(range(min = 0, max = 100, message = "progress must be 0..100"))]
    pub progress: Option<i32>,
    pub status: Option<String>,
    pub due: Option<chrono::DateTime<chrono::Utc>>,
}

/// A meeting form field definition (from a template), for rendering the drawer.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FieldDef {
    pub id: uuid::Uuid,
    pub ord: i32,
    pub kind: String,
    pub title: String,
    pub required: bool,
    pub placeholder: Option<String>,
    pub hint: Option<String>,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TemplateDetail {
    pub id: uuid::Uuid,
    pub name: String,
    pub fields: Vec<FieldDef>,
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
