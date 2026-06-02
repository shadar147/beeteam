use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::MeetingDetail;
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/v1/meetings/{id}",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Meeting detail (all note fields)", body = MeetingDetail),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
    )
)]
pub async fn get_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    let member: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT member_id FROM meetings WHERE id = $1")
            .bind(meeting_id)
            .fetch_optional(&state.pool)
            .await?;
    let member_id = member.ok_or(AppError::NotFound)?.0;
    require_member_access(&auth, member_id, &state.pool).await?;

    let r: (
        uuid::Uuid, uuid::Uuid, chrono::DateTime<chrono::Utc>, String, i32,
        Option<String>, Option<i32>, Option<String>, Option<String>,
        Option<String>, Option<String>, Vec<String>, Option<String>,
    ) = sqlx::query_as(
        "SELECT id, member_id, date, state::text, duration_min, mood, mood_score, \
                blockers, goals, feedback_to, feedback_from, development, relationships \
         FROM meetings WHERE id = $1",
    )
    .bind(meeting_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(MeetingDetail {
        id: r.0, member_id: r.1, date: r.2, state: r.3, duration_min: r.4,
        mood: r.5, mood_score: r.6, blockers: r.7, goals: r.8,
        feedback_to: r.9, feedback_from: r.10, development: r.11, relationships: r.12,
    }))
}
