use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::MeetingDetail;
use sqlx::PgPool;
use uuid::Uuid;

/// Load a meeting plus its member's team default template id. None if no such meeting.
pub(crate) async fn load_meeting_detail(
    pool: &PgPool,
    meeting_id: Uuid,
) -> AppResult<Option<MeetingDetail>> {
    let r: Option<(
        uuid::Uuid, uuid::Uuid, chrono::DateTime<chrono::Utc>, String, i32,
        Option<String>, Option<i32>, Option<String>, Option<String>,
        Option<String>, Option<String>, Vec<String>, Option<String>, Option<uuid::Uuid>,
    )> = sqlx::query_as(
        "SELECT m.id, m.member_id, m.date, m.state::text, m.duration_min, m.mood, m.mood_score, \
                m.blockers, m.goals, m.feedback_to, m.feedback_from, m.development, m.relationships, \
                t.default_template_id \
         FROM meetings m \
         JOIN team_members tm ON tm.id = m.member_id \
         JOIN teams t ON t.id = tm.team_id \
         WHERE m.id = $1",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|r| MeetingDetail {
        id: r.0, member_id: r.1, date: r.2, state: r.3, duration_min: r.4,
        mood: r.5, mood_score: r.6, blockers: r.7, goals: r.8,
        feedback_to: r.9, feedback_from: r.10, development: r.11, relationships: r.12,
        template_id: r.13,
    }))
}

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
    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, detail.member_id, &state.pool).await?;
    Ok(Json(detail))
}
