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
