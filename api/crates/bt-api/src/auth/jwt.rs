use bt_domain::Claims;
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};

const TOKEN_TTL_SECS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Build a 7-day HS256 token for a user.
pub fn encode_jwt(sub: uuid::Uuid, role: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = Claims {
        sub,
        role: role.to_string(),
        exp: Utc::now().timestamp() + TOKEN_TTL_SECS,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

/// Validate a token and return its claims. Errors on bad signature or expiry.
pub fn decode_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_then_decode_round_trips() {
        let id = uuid::Uuid::new_v4();
        let token = encode_jwt(id, "lead", "test-secret").unwrap();
        let claims = decode_jwt(&token, "test-secret").unwrap();
        assert_eq!(claims.sub, id);
        assert_eq!(claims.role, "lead");
        assert!(claims.exp > Utc::now().timestamp());
    }

    #[test]
    fn decode_rejects_wrong_secret() {
        let token = encode_jwt(uuid::Uuid::new_v4(), "lead", "secret-a").unwrap();
        assert!(decode_jwt(&token, "secret-b").is_err());
    }
}
