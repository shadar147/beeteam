use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health,
        crate::routes::auth::login,
        crate::routes::auth::me,
        crate::routes::teams::list_members,
        crate::routes::teams::team_stats,
    ),
    components(schemas(
        bt_domain::Health,
        bt_domain::LoginRequest,
        bt_domain::UserDto,
        bt_domain::LoginResponse,
        bt_domain::MeResponse,
        bt_domain::MemberRow,
        bt_domain::TeamStats,
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
