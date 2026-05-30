use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(crate::routes::health::health),
    components(schemas(bt_domain::Health)),
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
        assert!(json["components"]["schemas"]["Health"].is_object());
    }
}
