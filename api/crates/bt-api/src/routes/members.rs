use axum::extract::{Path, State};
use axum::Json;
use bt_domain::MemberDetail;
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// Ownership guard: the member must belong to a team led by the caller, else 403.
pub async fn require_member_access(auth: &AuthUser, member_id: Uuid, pool: &PgPool) -> AppResult<()> {
    let owns: Option<(Uuid,)> = sqlx::query_as(
        "SELECT tm.id FROM team_members tm \
         JOIN teams t ON t.id = tm.team_id \
         WHERE tm.id = $1 AND t.lead_id = $2",
    )
    .bind(member_id)
    .bind(auth.id)
    .fetch_optional(pool)
    .await?;
    if owns.is_some() {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

#[utoipa::path(
    get,
    path = "/v1/members/{id}",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "Member detail (profile header)", body = MemberDetail),
        (status = 403, description = "Member not on the caller's team"),
        (status = 404, description = "No such member"),
    )
)]
pub async fn get_member(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<MemberDetail>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let r: Option<(
        uuid::Uuid, String, String, String, String, String, i32, String,
        Vec<String>, Vec<i32>,
        Option<chrono::DateTime<chrono::Utc>>, Option<chrono::DateTime<chrono::Utc>>, i64,
    )> = sqlx::query_as(
        r#"
        SELECT
          tm.id, tm.name, tm.role, tm.email, tm.joined, tm.tz, tm.hue, tm.status::text,
          tm.tags, tm.mood_trend,
          (SELECT max(m.date) FROM meetings m
             WHERE m.member_id = tm.id AND m.state = 'done')                       AS last_meet,
          (SELECT min(m.date) FROM meetings m
             WHERE m.member_id = tm.id AND m.state = 'planned' AND m.date >= now()) AS next_meet,
          (SELECT count(*) FROM meetings m WHERE m.member_id = tm.id)              AS meetings_total
        FROM team_members tm
        WHERE tm.id = $1
        "#,
    )
    .bind(member_id)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(AppError::NotFound)?;
    Ok(Json(MemberDetail {
        id: r.0,
        name: r.1,
        role: r.2,
        email: r.3,
        joined: r.4,
        tz: r.5,
        hue: r.6,
        status: r.7,
        tags: r.8,
        mood_trend: r.9,
        last_meet: r.10,
        next_meet: r.11,
        meetings_total: r.12,
    }))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app::{build_router, AppState};
    use crate::auth::password::hash_password;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
        })
    }

    /// Seeds two leads. lead_a owns team_a with member Anna; lead_b owns team_b with member Bob.
    /// Returns (token_a, anna_id, token_b, bob_id).
    async fn seed_two_teams(pool: &sqlx::PgPool) -> (String, uuid::Uuid, String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool)
                .await
                .unwrap();
        let hash = hash_password("demo1234").unwrap();

        let mut tokens_members = Vec::new();
        for (email, mname, mrole) in [("a@x.io", "Анна", "Frontend"), ("b@x.io", "Боб", "Backend")] {
            let lead: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
                 VALUES ($1,$2,$3,'Lead','lead'::user_role,40) RETURNING id",
            )
            .bind(ws.0)
            .bind(email)
            .bind(&hash)
            .fetch_one(pool)
            .await
            .unwrap();

            let team: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
                 VALUES ($1,'team',$2,'2w'::cadence,'private'::visibility) RETURNING id",
            )
            .bind(ws.0)
            .bind(lead.0)
            .fetch_one(pool)
            .await
            .unwrap();

            let member: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO team_members \
                 (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
                 VALUES ($1,$2,$3,$4,$5,'2023',$6,'{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
            )
            .bind(ws.0)
            .bind(team.0)
            .bind(mname)
            .bind(mrole)
            .bind(format!("{mname}@x.io"))
            .bind("Europe/Moscow")
            .fetch_one(pool)
            .await
            .unwrap();

            tokens_members.push((login_token(pool, email).await, member.0));
        }

        let (token_a, anna) = tokens_members[0].clone();
        let (token_b, bob) = tokens_members[1].clone();
        (token_a, anna, token_b, bob)
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(format!(
                        r#"{{"email":"{email}","password":"demo1234"}}"#
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        v["token"].as_str().unwrap().to_string()
    }

    async fn get(pool: sqlx::PgPool, token: &str, uri: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_detail_happy_path(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        let (status, json) = get(pool, &token_a, &format!("/v1/members/{anna}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["name"], "Анна");
        assert_eq!(json["meetings_total"], 0);
        assert!(json["mood_trend"].is_array());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_detail_foreign_is_forbidden(pool: sqlx::PgPool) {
        let (token_a, _, _, bob) = seed_two_teams(&pool).await;
        let (status, _) = get(pool, &token_a, &format!("/v1/members/{bob}")).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
