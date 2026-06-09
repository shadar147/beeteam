use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health,
        crate::routes::auth::login,
        crate::routes::auth::me,
        crate::routes::teams::list_members,
        crate::routes::teams::team_stats,
        crate::routes::members::get_member,
        crate::routes::members::list_member_meetings,
        crate::routes::members::get_member_goals,
        crate::routes::members::list_member_files,
        crate::routes::members::get_member_grade,
        crate::routes::meetings::get_meeting,
        crate::routes::meetings::create_meeting,
        crate::routes::meetings::update_meeting,
        crate::routes::meetings::complete_meeting,
        crate::routes::meetings::delete_meeting,
        crate::routes::goals::create_goal,
        crate::routes::goals::update_goal,
        crate::routes::goals::delete_goal,
        crate::routes::goals::create_dev_item,
        crate::routes::goals::update_dev_item,
        crate::routes::goals::delete_dev_item,
        crate::routes::goals::create_competency,
        crate::routes::goals::update_competency,
        crate::routes::goals::delete_competency,
        crate::routes::templates::get_template,
        crate::routes::files::create_file,
        crate::routes::files::download_file,
        crate::routes::files::delete_file,
        crate::routes::files::download_files_zip,
        crate::routes::teams::team_calendar,
        crate::routes::grades::get_framework,
        crate::routes::evidence::create_evidence,
        crate::routes::evidence::delete_evidence,
        crate::routes::evidence::list_member_evidence,
    ),
    components(schemas(
        bt_domain::Health,
        bt_domain::LoginRequest,
        bt_domain::UserDto,
        bt_domain::LoginResponse,
        bt_domain::MeResponse,
        bt_domain::MemberRow,
        bt_domain::TeamStats,
        bt_domain::MemberDetail,
        bt_domain::MeetingListItem,
        bt_domain::MeetingDetail,
        bt_domain::Goal,
        bt_domain::DevItem,
        bt_domain::Competency,
        bt_domain::GoalsResponse,
        bt_domain::FileMeta,
        bt_domain::CreateFileRequest,
        bt_domain::FileUpload,
        bt_domain::FileDownload,
        bt_domain::CreateMeetingRequest,
        bt_domain::UpdateMeetingRequest,
        bt_domain::CreateGoalRequest,
        bt_domain::UpdateGoalRequest,
        bt_domain::CreateDevItemRequest,
        bt_domain::UpdateDevItemRequest,
        bt_domain::CreateCompetencyRequest,
        bt_domain::UpdateCompetencyRequest,
        bt_domain::FieldDef,
        bt_domain::TemplateDetail,
        bt_domain::CalendarMeeting,
        bt_domain::GradeLevel,
        bt_domain::MatrixCell,
        bt_domain::GradeBlock,
        bt_domain::Discipline,
        bt_domain::GradesFramework,
        bt_domain::MemberGrade,
        bt_domain::BlockLevel,
        bt_domain::Evidence,
        bt_domain::CreateEvidence,
    )),
    info(title = "BeeTeam API", version = "0.1.0")
)]
pub struct ApiDoc;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openapi_contains_health_path() {
        let doc = ApiDoc::openapi();
        let json = serde_json::to_value(doc).unwrap();
        assert!(json["paths"]["/v1/health"].is_object());
        assert!(json["paths"]["/v1/auth/login"].is_object());
        assert!(json["paths"]["/v1/auth/me"].is_object());
        assert!(json["components"]["schemas"]["LoginResponse"].is_object());
        assert!(json["paths"]["/v1/teams/{id}/members"].is_object());
        assert!(json["paths"]["/v1/teams/{id}/stats"].is_object());
        assert!(json["components"]["schemas"]["TeamStats"].is_object());
    }
}
