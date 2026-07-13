use axum::extract::State;
use axum::Json;
use bt_domain::{AssignableLead, Permission, TeamRow};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::auth::permissions::require_permission;
use crate::error::{AppError, AppResult};
use crate::routes::grades::workspace_of;

/// The SELECT that assembles a TeamRow (lead join + member count). Optionally filtered to one id.
async fn team_rows(pool: &sqlx::PgPool, workspace_id: Uuid, only: Option<Uuid>) -> AppResult<Vec<TeamRow>> {
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, String, Option<Uuid>, Option<String>, Option<i32>, i64, String, String)>(
        "SELECT t.id, t.name, t.mission, t.color, t.lead_id, u.name, u.hue, \
                (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count, \
                t.default_cadence::text, t.visibility::text \
         FROM teams t LEFT JOIN users u ON u.id = t.lead_id \
         WHERE t.workspace_id = $1 AND ($2::uuid IS NULL OR t.id = $2) \
         ORDER BY t.name",
    )
    .bind(workspace_id).bind(only).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| TeamRow {
        id: r.0, name: r.1, mission: r.2, color: r.3, lead_id: r.4, lead_name: r.5, lead_hue: r.6,
        member_count: r.7, default_cadence: r.8, visibility: r.9,
    }).collect())
}

pub(crate) async fn load_team_row(pool: &sqlx::PgPool, workspace_id: Uuid, id: Uuid) -> AppResult<TeamRow> {
    team_rows(pool, workspace_id, Some(id)).await?.into_iter().next().ok_or(AppError::NotFound)
}

#[utoipa::path(get, path = "/v1/teams", responses((status = 200, body = [TeamRow]), (status = 403)))]
pub async fn list_teams(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<TeamRow>>> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    Ok(Json(team_rows(&state.pool, workspace_id, None).await?))
}

#[utoipa::path(get, path = "/v1/leads", responses((status = 200, body = [AssignableLead]), (status = 403)))]
pub async fn list_leads(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<Vec<AssignableLead>>> {
    require_permission(&auth, Permission::ManageWorkspace)?;
    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    let rows = sqlx::query_as::<_, (Uuid, String, i32, String)>(
        "SELECT id, name, hue, role::text FROM users \
         WHERE workspace_id = $1 AND role IN ('lead','hr_admin') ORDER BY name",
    ).bind(workspace_id).fetch_all(&state.pool).await?;
    Ok(Json(rows.into_iter().map(|r| AssignableLead { id: r.0, name: r.1, hue: r.2, role: r.3 }).collect()))
}

#[cfg(test)]
mod tests {
    use crate::app::{build_router, AppState};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool, jwt_secret: "test-secret".into(), web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(), bucket: crate::storage::bucket_from_env(),
        })
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#))).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    async fn get_json(pool: &sqlx::PgPool, token: &str, uri: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri(uri)
                .header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_teams_shows_seeded_team_with_count(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (status, json) = get_json(&pool, &hr, "/v1/teams").await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["member_count"], 8);
        assert_eq!(arr[0]["lead_name"], "Евгений Глебов");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_teams_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_json(&pool, &lead, "/v1/teams").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_leads_returns_lead_and_hr(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (status, json) = get_json(&pool, &hr, "/v1/leads").await;
        assert_eq!(status, StatusCode::OK);
        let names: Vec<&str> = json.as_array().unwrap().iter().map(|l| l["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"Евгений Глебов"));
        assert!(names.contains(&"Ольга Климова"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_leads_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (status, _) = get_json(&pool, &lead, "/v1/leads").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
