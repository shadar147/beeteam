use axum::extract::{Path, State};
use axum::Json;
use bt_domain::{Competency, DevItem, FileMeta, Goal, GoalsResponse, MeetingListItem, MemberDetail, MemberGrade, BlockLevel};
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
          (SELECT count(*) FROM meetings m
             WHERE m.member_id = tm.id AND m.date >= now() - interval '1 year')    AS meetings_total
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

#[utoipa::path(
    get,
    path = "/v1/members/{id}/meetings",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "All meetings, newest first", body = [MeetingListItem]),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn list_member_meetings(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<MeetingListItem>>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let rows: Vec<(
        uuid::Uuid, chrono::DateTime<chrono::Utc>, String,
        Option<String>, Option<i32>, Option<String>, Option<String>,
    )> = sqlx::query_as(
        "SELECT id, date, state::text, mood, mood_score, blockers, goals \
         FROM meetings WHERE member_id = $1 ORDER BY date DESC",
    )
    .bind(member_id)
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|r| {
            let preview = first_nonempty(&[r.5.as_deref(), r.6.as_deref()])
                .map(str::to_string)
                .unwrap_or_else(|| state_hint(&r.2));
            MeetingListItem { id: r.0, date: r.1, state: r.2, mood: r.3, mood_score: r.4, preview }
        })
        .collect();
    Ok(Json(out))
}

#[utoipa::path(
    get,
    path = "/v1/members/{id}/goals",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "OKRs + dev plan + competencies", body = GoalsResponse),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn get_member_goals(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<GoalsResponse>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let okrs: Vec<Goal> = sqlx::query_as::<_, (
        uuid::Uuid, String, String, String, i32, String, chrono::DateTime<chrono::Utc>,
    )>(
        "SELECT id, quarter, title, key_result, progress, status::text, due \
         FROM goals WHERE member_id = $1 ORDER BY due",
    )
    .bind(member_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| Goal { id: r.0, quarter: r.1, title: r.2, key_result: r.3, progress: r.4, status: r.5, due: r.6 })
    .collect();

    let development: Vec<DevItem> = sqlx::query_as::<_, (
        uuid::Uuid, String, String, String, Option<String>,
    )>(
        "SELECT id, title, kind, status, note FROM development_items \
         WHERE member_id = $1 ORDER BY ord",
    )
    .bind(member_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| DevItem { id: r.0, title: r.1, kind: r.2, status: r.3, note: r.4 })
    .collect();

    let competencies: Vec<Competency> = sqlx::query_as::<_, (uuid::Uuid, String, i32)>(
        "SELECT id, label, score FROM competencies WHERE member_id = $1 ORDER BY ord",
    )
    .bind(member_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| Competency { id: r.0, label: r.1, score: r.2 })
    .collect();

    Ok(Json(GoalsResponse { okrs, development, competencies }))
}

#[utoipa::path(
    get,
    path = "/v1/members/{id}/files",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "File metadata (read-only)", body = [FileMeta]),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn list_member_files(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<FileMeta>>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let rows: Vec<(
        uuid::Uuid, String, String, String, i64, Option<uuid::Uuid>, String,
        chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>,
    )> = sqlx::query_as(
        "SELECT f.id, f.name, f.mime, f.kind::text, f.size_bytes, f.meeting_id, f.uploaded_by, f.created_at, m.date \
         FROM files f LEFT JOIN meetings m ON m.id = f.meeting_id \
         WHERE f.member_id = $1 ORDER BY f.created_at DESC",
    )
    .bind(member_id)
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|r| FileMeta {
            id: r.0, name: r.1, mime: r.2, kind: r.3, size_bytes: r.4,
            meeting_id: r.5, uploaded_by: r.6, created_at: r.7,
            meeting_label: r.8.map(|d| format!("1-2-1 от {}", d.format("%d.%m.%Y"))),
        })
        .collect();
    Ok(Json(out))
}

#[utoipa::path(
    get,
    path = "/v1/members/{id}/grade",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses(
        (status = 200, description = "Member grade, or null if unassigned", body = MemberGrade),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn get_member_grade(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Option<MemberGrade>>> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let row: Option<(
        String, i32, Option<i32>, f64, i32, bool,
        Option<chrono::NaiveDate>, Option<chrono::NaiveDate>, Uuid,
    )> = sqlx::query_as(
        "SELECT d.key, mg.grade_ord, mg.target_ord, mg.compa, mg.ready_months, mg.mgr_track, \
                mg.next_review, mg.last_review, mg.id \
         FROM member_grades mg \
         JOIN disciplines d ON d.id = mg.discipline_id \
         WHERE mg.member_id = $1",
    )
    .bind(member_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(r) = row else { return Ok(Json(None)) };

    let block_levels: Vec<BlockLevel> = sqlx::query_as::<_, (String, i32)>(
        "SELECT gb.key, mbl.level_ord \
         FROM member_block_levels mbl \
         JOIN grade_blocks gb ON gb.id = mbl.block_id \
         WHERE mbl.member_grade_id = $1 \
         ORDER BY gb.ord",
    )
    .bind(r.8)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|(block_key, level_ord)| BlockLevel { block_key, level_ord })
    .collect();

    Ok(Json(Some(MemberGrade {
        discipline_key: r.0,
        grade_ord: r.1,
        target_ord: r.2,
        compa: r.3,
        ready_months: r.4,
        mgr_track: r.5,
        next_review: r.6.map(|d| d.to_string()),
        last_review: r.7.map(|d| d.to_string()),
        block_levels,
    })))
}

fn first_nonempty<'a>(opts: &[Option<&'a str>]) -> Option<&'a str> {
    opts.iter().flatten().copied().find(|s| !s.trim().is_empty())
}

fn state_hint(state: &str) -> String {
    match state {
        "planned" => "Запланирована".to_string(),
        "miss" => "Пропущена".to_string(),
        _ => "Без заметок".to_string(),
    }
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
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
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

    async fn seed_meeting(
        pool: &sqlx::PgPool, member_id: uuid::Uuid, state: &str, notes: bool,
    ) -> uuid::Uuid {
        let ws: (uuid::Uuid,) = sqlx::query_as(
            "SELECT workspace_id FROM team_members WHERE id = $1",
        ).bind(member_id).fetch_one(pool).await.unwrap();
        let (blockers, goals) = if notes {
            (Some("Блокер: флака в CI"), Some("Цель: вынести модуль"))
        } else { (None, None) };
        let row: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO meetings \
             (workspace_id, member_id, date, state, duration_min, mood, mood_score, \
              blockers, goals, feedback_to, feedback_from, development, relationships) \
             VALUES ($1,$2,now() - interval '7 days',$3::meeting_state,45,'🙂',8,\
                     $4,$5,'Хвалю за рефактор','Спасибо за поддержку',\
                     ARRAY['Курс по перфу'],'Тёплые') RETURNING id",
        )
        .bind(ws.0).bind(member_id).bind(state).bind(blockers).bind(goals)
        .fetch_one(pool).await.unwrap();
        row.0
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_meetings_list_ordered_with_preview(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        seed_meeting(&pool, anna, "done", true).await;
        let (status, json) = get(pool, &token_a, &format!("/v1/members/{anna}/meetings")).await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["preview"], "Блокер: флака в CI");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn meeting_detail_returns_all_note_fields(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        let mid = seed_meeting(&pool, anna, "done", true).await;
        let (status, json) = get(pool, &token_a, &format!("/v1/meetings/{mid}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["blockers"], "Блокер: флака в CI");
        assert_eq!(json["feedback_to"], "Хвалю за рефактор");
        assert_eq!(json["development"][0], "Курс по перфу");
        assert_eq!(json["relationships"], "Тёплые");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn meeting_detail_foreign_member_is_forbidden(pool: sqlx::PgPool) {
        let (_token_a, anna, token_b, _bob) = seed_two_teams(&pool).await;
        let mid = seed_meeting(&pool, anna, "done", true).await;
        let (status, _) = get(pool, &token_b, &format!("/v1/meetings/{mid}")).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
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

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_meetings_preview_falls_back_to_state_hint(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        // A planned meeting with no blockers/goals → preview is the state hint.
        seed_meeting(&pool, anna, "planned", false).await;
        let (status, json) = get(pool, &token_a, &format!("/v1/members/{anna}/meetings")).await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["preview"], "Запланирована");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn goals_returns_three_sections(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        let ws: (uuid::Uuid,) =
            sqlx::query_as("SELECT workspace_id FROM team_members WHERE id = $1")
                .bind(anna).fetch_one(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
             VALUES ($1,$2,'Q2','T','KR',60,'ontrack'::goal_status, now())",
        ).bind(ws.0).bind(anna).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
             VALUES ($1,$2,'Курс','Курс','in_progress','60%',0)",
        ).bind(ws.0).bind(anna).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
             VALUES ($1,$2,'Frontend',9,0)",
        ).bind(ws.0).bind(anna).execute(&pool).await.unwrap();

        let (status, json) = get(pool, &token_a, &format!("/v1/members/{anna}/goals")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["okrs"].as_array().unwrap().len(), 1);
        assert_eq!(json["development"].as_array().unwrap().len(), 1);
        assert_eq!(json["competencies"].as_array().unwrap().len(), 1);
        assert_eq!(json["competencies"][0]["score"], 9);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn files_includes_meeting_label(pool: sqlx::PgPool) {
        let (token_a, anna, _, _) = seed_two_teams(&pool).await;
        let mid = seed_meeting(&pool, anna, "done", true).await;
        let ws: (uuid::Uuid,) =
            sqlx::query_as("SELECT workspace_id FROM team_members WHERE id = $1")
                .bind(anna).fetch_one(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO files (workspace_id, member_id, meeting_id, name, mime, kind, size_bytes, storage_key, uploaded_by) \
             VALUES ($1,$2,$3,'Итоги.pdf','application/pdf','pdf'::file_kind,1024,'k','Лид')",
        ).bind(ws.0).bind(anna).bind(mid).execute(&pool).await.unwrap();

        let (status, json) = get(pool, &token_a, &format!("/v1/members/{anna}/files")).await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert!(arr[0]["meeting_label"].as_str().unwrap().starts_with("1-2-1 от "));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn goals_and_files_foreign_is_forbidden(pool: sqlx::PgPool) {
        let (_, anna, token_b, _) = seed_two_teams(&pool).await;
        let (s1, _) = get(pool.clone(), &token_b, &format!("/v1/members/{anna}/goals")).await;
        let (s2, _) = get(pool, &token_b, &format!("/v1/members/{anna}/files")).await;
        assert_eq!(s1, StatusCode::FORBIDDEN);
        assert_eq!(s2, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_returns_assigned(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["discipline_key"], "backend");
        assert_eq!(json["grade_ord"], 4);
        assert_eq!(json["target_ord"], 5);
        assert_eq!(json["block_levels"].as_array().unwrap().len(), 6);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_null_when_unassigned(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Дмитрий Кузнецов'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        assert!(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap().is_null());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_forbidden_for_foreign_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET")
                .uri(format!("/v1/members/{}/grade", uuid::Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn member_grade_requires_auth(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let id: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(&pool).await.unwrap();
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{}/grade", id.0))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}
