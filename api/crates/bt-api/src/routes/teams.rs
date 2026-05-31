use axum::extract::{Path, Query, State};
use axum::Json;
use bt_domain::MemberRow;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// Authorize that `auth` may read `team_id`. v1: only the team's lead may.
/// This is the seam where hr_admin / skip-level rules will land later.
pub async fn require_team_access(auth: &AuthUser, team_id: Uuid, pool: &PgPool) -> AppResult<()> {
    let owns: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM teams WHERE id = $1 AND lead_id = $2")
            .bind(team_id)
            .bind(auth.id)
            .fetch_optional(pool)
            .await?;
    if owns.is_some() {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

#[derive(Debug, Deserialize)]
pub struct MemberFilters {
    pub q: Option<String>,
    pub role: Option<String>,
    pub tenure: Option<String>, // new | mid | sen
    pub mood: Option<String>,   // up | flat | down
    pub since: Option<String>,  // lt1w | lt2w | gt4w
    pub tags: Option<String>,   // comma-separated
}

#[utoipa::path(
    get,
    path = "/v1/teams/{id}/members",
    params(("id" = uuid::Uuid, Path, description = "Team id")),
    responses(
        (status = 200, description = "Team members", body = [MemberRow]),
        (status = 403, description = "Not the team's lead"),
    )
)]
pub async fn list_members(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(team_id): Path<Uuid>,
    Query(f): Query<MemberFilters>,
) -> AppResult<Json<Vec<MemberRow>>> {
    require_team_access(&auth, team_id, &state.pool).await?;

    let tags_vec: Option<Vec<String>> = f.tags.as_ref().and_then(|s| {
        let v: Vec<String> = s.split(',').filter(|x| !x.is_empty()).map(|x| x.to_string()).collect();
        if v.is_empty() { None } else { Some(v) }
    });

    let rows: Vec<MemberRow> = sqlx::query_as::<_, (
        uuid::Uuid, String, String, String, String, String, i32,
        Vec<String>, String, Vec<i32>,
        Option<chrono::DateTime<chrono::Utc>>, Option<chrono::DateTime<chrono::Utc>>,
    )>(
        r#"
        SELECT
          tm.id, tm.name, tm.role, tm.email, tm.joined, tm.tz, tm.hue,
          tm.tags, tm.status::text, tm.mood_trend,
          (SELECT max(m.date) FROM meetings m
             WHERE m.member_id = tm.id AND m.state = 'done')                       AS last_meet,
          (SELECT min(m.date) FROM meetings m
             WHERE m.member_id = tm.id AND m.state = 'planned' AND m.date >= now()) AS next_meet
        FROM team_members tm
        WHERE tm.team_id = $1
          AND ($2::text IS NULL OR tm.name ILIKE '%'||$2||'%' OR tm.role ILIKE '%'||$2||'%')
          AND ($3::text IS NULL OR tm.role = $3)
          AND ($4::text IS NULL OR
               ($4 = 'new' AND tm.joined_date >  (current_date - interval '1 year')) OR
               ($4 = 'mid' AND tm.joined_date <= (current_date - interval '1 year')
                          AND tm.joined_date >  (current_date - interval '3 years')) OR
               ($4 = 'sen' AND tm.joined_date <= (current_date - interval '3 years')))
          AND ($5::text IS NULL OR
               ($5 = 'up'   AND tm.mood_trend[array_length(tm.mood_trend,1)] > tm.mood_trend[1]) OR
               ($5 = 'down' AND tm.mood_trend[array_length(tm.mood_trend,1)] < tm.mood_trend[1]) OR
               ($5 = 'flat' AND tm.mood_trend[array_length(tm.mood_trend,1)] = tm.mood_trend[1]))
          AND ($7::text[] IS NULL OR tm.tags && $7)
        ORDER BY tm.name
        "#,
    )
    .bind(team_id)
    .bind(f.q.as_deref())
    .bind(f.role.as_deref())
    .bind(f.tenure.as_deref())
    .bind(f.mood.as_deref())
    .bind(f.since.as_deref()) // $6 — positional placeholder; `since` applied in Rust below
    .bind(tags_vec.as_deref())
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| MemberRow {
        id: r.0, name: r.1, role: r.2, email: r.3, joined: r.4, tz: r.5, hue: r.6,
        tags: r.7, status: r.8, mood_trend: r.9, last_meet: r.10, next_meet: r.11,
    })
    .collect();

    // `since` filters by age of last_meet — applied in Rust (depends on the computed column).
    let rows = match f.since.as_deref() {
        Some("lt1w") => filter_since(rows, 7, true),
        Some("lt2w") => filter_since(rows, 14, true),
        Some("gt4w") => filter_since(rows, 28, false),
        _ => rows,
    };

    Ok(Json(rows))
}

/// Keep rows whose last_meet is within `days` (when `within`) or older than `days` (when not).
/// Rows with no last_meet count as "older than any window".
fn filter_since(rows: Vec<MemberRow>, days: i64, within: bool) -> Vec<MemberRow> {
    let now = chrono::Utc::now();
    rows.into_iter().filter(|r| match r.last_meet {
        Some(d) => {
            let age = (now - d).num_days();
            if within { age <= days } else { age > days }
        }
        None => !within,
    }).collect()
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

    /// Returns (lead_token, team_id).
    async fn seed_team(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'lead@x.io',$2,'Lead X','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'T-team',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        for (name, role, status) in [("Алиса","Frontend","ok"), ("Борис","Backend","warn")] {
            sqlx::query(
                "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
                 VALUES ($1,$2,$3,$4,$5,'2022',$6,'{6,7,8}',$7::member_status,'{}',40,'2022-01-01')",
            ).bind(ws.0).bind(team.0).bind(name).bind(role)
             .bind(format!("{}@x.io", role)).bind("Europe/Moscow").bind(status)
             .execute(pool).await.unwrap();
        }
        let token = login_token(pool, "lead@x.io").await;
        (token, team.0)
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type","application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#))).unwrap()
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        v["token"].as_str().unwrap().to_string()
    }

    async fn get_members(pool: sqlx::PgPool, token: &str, team_id: uuid::Uuid, query: &str)
        -> (StatusCode, serde_json::Value)
    {
        let uri = format!("/v1/teams/{team_id}/members{query}");
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(uri)
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn lists_all_members_without_filters(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        let (status, json) = get_members(pool, &token, team, "").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json.as_array().unwrap().len(), 2);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn filters_by_search_q(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        let (_, json) = get_members(pool, &token, team, "?q=Алиса").await;
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["name"], "Алиса");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn forbids_non_lead(pool: sqlx::PgPool) {
        let (_token, team) = seed_team(&pool).await;
        let ws2: (uuid::Uuid,) = sqlx::query_as("INSERT INTO workspaces (name) VALUES ('U') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query("INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'other@x.io',$2,'Other','lead'::user_role,40)")
            .bind(ws2.0).bind(hash).execute(&pool).await.unwrap();
        let token = login_token(&pool, "other@x.io").await;
        let (status, _) = get_members(pool, &token, team, "").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
