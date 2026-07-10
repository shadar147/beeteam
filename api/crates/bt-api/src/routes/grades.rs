use crate::auth::middleware::AuthUser;
use crate::auth::permissions::{has_permission, require_permission};
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum::extract::Path;
use bt_domain::{BandShape, CreateDiscipline, Discipline, GradeBlock, GradeLevel, GradesFramework, MatrixCell, Permission, PutDiscipline, UpdateLevels};
use std::collections::HashSet;
use uuid::Uuid;

pub(crate) async fn workspace_of(pool: &sqlx::PgPool, user_id: Uuid) -> AppResult<Uuid> {
    let ws: Option<(Uuid,)> = sqlx::query_as("SELECT workspace_id FROM users WHERE id = $1")
        .bind(user_id).fetch_optional(pool).await?;
    Ok(ws.ok_or(AppError::Unauthorized)?.0)
}

pub(crate) async fn levels_of(pool: &sqlx::PgPool, workspace_id: Uuid, show_bands: bool) -> AppResult<Vec<GradeLevel>> {
    let rows = sqlx::query_as::<_, (i32, String, String, String, String, String, bool, f64, f64, f64)>(
        "SELECT ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high \
         FROM grade_levels WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id).fetch_all(pool).await?;
    let global_max = rows.iter().map(|r| r.9).fold(1.0_f64, f64::max);
    Ok(rows.into_iter().map(|r| GradeLevel {
        ord: r.0, code: r.1, name: r.2, exp: r.3, autonomy: r.4, scope: r.5, mgr: r.6,
        band_shape: BandShape { low: r.7 / global_max, mid: r.8 / global_max, high: r.9 / global_max },
        band_low: if show_bands { Some(r.7) } else { None },
        band_mid: if show_bands { Some(r.8) } else { None },
        band_high: if show_bands { Some(r.9) } else { None },
    }).collect())
}

pub(crate) async fn load_discipline(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Discipline> {
    let d: (Uuid, String, String, String, String, i32) = sqlx::query_as(
        "SELECT id, key, label, icon, description, ord FROM disciplines WHERE id = $1",
    ).bind(id).fetch_one(pool).await?;
    let blocks_rows: Vec<(Uuid, String, String, i32)> = sqlx::query_as(
        "SELECT id, key, name, ord FROM grade_blocks WHERE discipline_id = $1 ORDER BY ord",
    ).bind(id).fetch_all(pool).await?;
    let block_ids: Vec<Uuid> = blocks_rows.iter().map(|b| b.0).collect();
    let cell_rows: Vec<(Uuid, i32, Option<String>, bool)> = sqlx::query_as(
        "SELECT block_id, level_ord, text, required FROM matrix_cells \
         WHERE block_id = ANY($1) ORDER BY level_ord",
    ).bind(&block_ids).fetch_all(pool).await?;
    let blocks = blocks_rows.into_iter().map(|b| {
        let cells = cell_rows.iter().filter(|c| c.0 == b.0)
            .map(|c| MatrixCell { level: c.1, text: c.2.clone(), required: c.3 }).collect();
        GradeBlock { id: b.0, key: b.1, name: b.2, ord: b.3, cells }
    }).collect();
    Ok(Discipline { id: d.0, key: d.1, label: d.2, icon: d.3, description: d.4, ord: d.5, blocks })
}

#[utoipa::path(
    get, path = "/v1/grades/framework",
    responses((status = 200, description = "Grade framework", body = GradesFramework))
)]
pub async fn get_framework(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<GradesFramework>> {
    let workspace_id = workspace_of(&state.pool, auth.id).await?;

    let show_bands = has_permission(&auth, Permission::EditSalaryBands);
    let levels = levels_of(&state.pool, workspace_id, show_bands).await?;

    let disc_rows: Vec<(Uuid, String, String, String, String, i32)> = sqlx::query_as(
        "SELECT id, key, label, icon, description, ord FROM disciplines \
         WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id)
    .fetch_all(&state.pool).await?;
    let disc_ids: Vec<Uuid> = disc_rows.iter().map(|d| d.0).collect();

    let block_rows: Vec<(Uuid, Uuid, String, String, i32)> = sqlx::query_as(
        "SELECT id, discipline_id, key, name, ord FROM grade_blocks \
         WHERE discipline_id = ANY($1) ORDER BY ord",
    )
    .bind(&disc_ids)
    .fetch_all(&state.pool).await?;
    let block_ids: Vec<Uuid> = block_rows.iter().map(|b| b.0).collect();

    let cell_rows: Vec<(Uuid, i32, Option<String>, bool)> = sqlx::query_as(
        "SELECT block_id, level_ord, text, required FROM matrix_cells \
         WHERE block_id = ANY($1) ORDER BY level_ord",
    )
    .bind(&block_ids)
    .fetch_all(&state.pool).await?;

    // assemble nested
    let disciplines = disc_rows.into_iter().map(|d| {
        let blocks = block_rows.iter().filter(|b| b.1 == d.0).map(|b| {
            let cells = cell_rows.iter().filter(|c| c.0 == b.0)
                .map(|c| MatrixCell { level: c.1, text: c.2.clone(), required: c.3 })
                .collect();
            GradeBlock { id: b.0, key: b.2.clone(), name: b.3.clone(), ord: b.4, cells }
        }).collect();
        Discipline { id: d.0, key: d.1, label: d.2, icon: d.3, description: d.4, ord: d.5, blocks }
    }).collect();

    let tax_rate = if show_bands {
        let r: (f64,) = sqlx::query_as("SELECT salary_tax_rate FROM workspaces WHERE id = $1")
            .bind(workspace_id).fetch_one(&state.pool).await?;
        Some(r.0)
    } else {
        None
    };

    Ok(Json(GradesFramework { levels, disciplines, tax_rate }))
}

#[utoipa::path(
    patch, path = "/v1/grades/levels", request_body = UpdateLevels,
    responses((status = 200, body = [GradeLevel]), (status = 400), (status = 403))
)]
pub async fn update_levels(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<UpdateLevels>,
) -> AppResult<Json<Vec<GradeLevel>>> {
    require_permission(&auth, Permission::EditFramework)?;
    if body.levels.iter().any(|l| l.name.trim().is_empty()) {
        return Err(AppError::BadRequest("level name must not be empty".into()));
    }
    let workspace_id = workspace_of(&state.pool, auth.id).await?;

    let mut tx = state.pool.begin().await?;
    for l in &body.levels {
        sqlx::query(
            "UPDATE grade_levels SET name = $3, exp = $4, autonomy = $5, scope = $6 \
             WHERE ord = $2 AND workspace_id = $1",
        )
        .bind(workspace_id).bind(l.ord).bind(&l.name).bind(&l.exp).bind(&l.autonomy).bind(&l.scope)
        .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    Ok(Json(levels_of(&state.pool, workspace_id, has_permission(&auth, Permission::EditSalaryBands)).await?))
}

#[utoipa::path(
    put, path = "/v1/grades/disciplines/{id}", request_body = PutDiscipline,
    params(("id" = uuid::Uuid, Path, description = "Discipline id")),
    responses(
        (status = 200, body = Discipline), (status = 400), (status = 403),
        (status = 404), (status = 409, description = "A removed block still has data"),
    )
)]
pub async fn put_discipline(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<PutDiscipline>,
) -> AppResult<Json<Discipline>> {
    require_permission(&auth, Permission::EditFramework)?;
    if body.label.trim().is_empty() {
        return Err(AppError::BadRequest("discipline label must not be empty".into()));
    }
    if body.blocks.iter().any(|b| b.name.trim().is_empty()) {
        return Err(AppError::BadRequest("block name must not be empty".into()));
    }
    if body.blocks.iter().any(|b| b.cells.iter().any(|c| !(1..=7).contains(&c.level_ord))) {
        return Err(AppError::BadRequest("level_ord must be 1..7".into()));
    }

    let workspace_id = workspace_of(&state.pool, auth.id).await?;
    let owned: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM disciplines WHERE id = $1 AND workspace_id = $2",
    ).bind(id).bind(workspace_id).fetch_optional(&state.pool).await?;
    if owned.is_none() {
        return Err(AppError::NotFound);
    }

    // Provided existing-block ids: unique + must belong to this discipline.
    let provided: Vec<Uuid> = body.blocks.iter().filter_map(|b| b.id).collect();
    let mut seen = HashSet::new();
    for bid in &provided {
        if !seen.insert(*bid) {
            return Err(AppError::BadRequest("duplicate block id in payload".into()));
        }
    }
    let current: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM grade_blocks WHERE discipline_id = $1",
    ).bind(id).fetch_all(&state.pool).await?;
    let current_ids: HashSet<Uuid> = current.iter().map(|r| r.0).collect();
    for bid in &provided {
        if !current_ids.contains(bid) {
            return Err(AppError::BadRequest("block does not belong to this discipline".into()));
        }
    }
    let provided_set: HashSet<Uuid> = provided.iter().copied().collect();
    let removed: Vec<Uuid> = current_ids.iter().filter(|c| !provided_set.contains(c)).copied().collect();

    // 409 pre-check: a removed block must have no referencing data (read-only, before any write).
    for bid in &removed {
        let used: (i64,) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM member_block_levels WHERE block_id = $1) \
                  + (SELECT count(*) FROM grade_evidence     WHERE block_id = $1) \
                  + (SELECT count(*) FROM review_scores      WHERE block_id = $1) \
                  + (SELECT count(*) FROM self_assessments   WHERE block_id = $1)",
        ).bind(bid).fetch_one(&state.pool).await?;
        if used.0 > 0 {
            return Err(AppError::Conflict("block in use".into()));
        }
    }

    let mut tx = state.pool.begin().await?;
    sqlx::query("UPDATE disciplines SET label = $2, icon = $3, description = $4 WHERE id = $1")
        .bind(id).bind(&body.label).bind(&body.icon).bind(&body.description)
        .execute(&mut *tx).await?;
    for bid in &removed {
        sqlx::query("DELETE FROM grade_blocks WHERE id = $1").bind(bid).execute(&mut *tx).await?;
    }
    for (i, b) in body.blocks.iter().enumerate() {
        let block_id = match b.id {
            Some(bid) => {
                sqlx::query("UPDATE grade_blocks SET name = $2, ord = $3 WHERE id = $1")
                    .bind(bid).bind(&b.name).bind(i as i32).execute(&mut *tx).await?;
                bid
            }
            None => {
                let key = format!("blk_{}", &Uuid::new_v4().simple().to_string()[..8]);
                let row: (Uuid,) = sqlx::query_as(
                    "INSERT INTO grade_blocks (discipline_id, key, name, ord) \
                     VALUES ($1, $2, $3, $4) RETURNING id",
                ).bind(id).bind(&key).bind(&b.name).bind(i as i32).fetch_one(&mut *tx).await?;
                row.0
            }
        };
        for cell in &b.cells {
            sqlx::query(
                "INSERT INTO matrix_cells (block_id, level_ord, text, required) \
                 VALUES ($1, $2, $3, $4) \
                 ON CONFLICT (block_id, level_ord) DO UPDATE \
                 SET text = EXCLUDED.text, required = EXCLUDED.required",
            ).bind(block_id).bind(cell.level_ord).bind(&cell.text).bind(cell.required)
            .execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;

    Ok(Json(load_discipline(&state.pool, id).await?))
}

#[utoipa::path(
    post, path = "/v1/grades/disciplines", request_body = CreateDiscipline,
    responses((status = 201, body = Discipline), (status = 400), (status = 403), (status = 404))
)]
pub async fn create_discipline(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateDiscipline>,
) -> AppResult<(StatusCode, Json<Discipline>)> {
    require_permission(&auth, Permission::EditFramework)?;
    if body.label.trim().is_empty() {
        return Err(AppError::BadRequest("discipline label must not be empty".into()));
    }
    let workspace_id = workspace_of(&state.pool, auth.id).await?;

    let src: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM disciplines WHERE id = $1 AND workspace_id = $2",
    ).bind(body.copy_from_discipline_id).bind(workspace_id).fetch_optional(&state.pool).await?;
    if src.is_none() {
        return Err(AppError::NotFound);
    }
    let src_blocks: Vec<(String, i32)> = sqlx::query_as(
        "SELECT name, ord FROM grade_blocks WHERE discipline_id = $1 ORDER BY ord",
    ).bind(body.copy_from_discipline_id).fetch_all(&state.pool).await?;

    let mut tx = state.pool.begin().await?;
    let next_ord: (Option<i32>,) = sqlx::query_as(
        "SELECT max(ord) FROM disciplines WHERE workspace_id = $1",
    ).bind(workspace_id).fetch_one(&mut *tx).await?;
    let ord = next_ord.0.unwrap_or(-1) + 1;
    let disc_key = format!("disc_{}", &Uuid::new_v4().simple().to_string()[..8]);
    let drow: (Uuid,) = sqlx::query_as(
        "INSERT INTO disciplines (workspace_id, key, label, icon, description, ord) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    ).bind(workspace_id).bind(&disc_key).bind(&body.label).bind(&body.icon).bind(&body.description).bind(ord)
    .fetch_one(&mut *tx).await?;

    for (i, (name, _)) in src_blocks.iter().enumerate() {
        let block_key = format!("blk_{}", &Uuid::new_v4().simple().to_string()[..8]);
        let brow: (Uuid,) = sqlx::query_as(
            "INSERT INTO grade_blocks (discipline_id, key, name, ord) VALUES ($1, $2, $3, $4) RETURNING id",
        ).bind(drow.0).bind(&block_key).bind(name).bind(i as i32).fetch_one(&mut *tx).await?;
        for lvl in 1..=7i32 {
            sqlx::query(
                "INSERT INTO matrix_cells (block_id, level_ord, text, required) VALUES ($1, $2, NULL, true)",
            ).bind(brow.0).bind(lvl).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(load_discipline(&state.pool, drow.0).await?)))
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
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
        })
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    async fn get_framework_json(pool: &sqlx::PgPool, token: &str) -> serde_json::Value {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri("/v1/grades/framework")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    async fn patch_levels(pool: &sqlx::PgPool, token: &str, body: &str) -> StatusCode {
        app(pool.clone()).oneshot(
            Request::builder().method("PATCH").uri("/v1/grades/levels")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())).unwrap(),
        ).await.unwrap().status()
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_levels_updates_text_only(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let status = patch_levels(&pool, &hr,
            r#"{"levels":[{"ord":1,"name":"Стажёр+","exp":"0–1 год","autonomy":"a","scope":"s"}]}"#).await;
        assert_eq!(status, StatusCode::OK);

        let row: (String, f64, bool) = sqlx::query_as(
            "SELECT name, band_mid, mgr FROM grade_levels WHERE ord = 1 \
             AND workspace_id = (SELECT workspace_id FROM users WHERE email='o.klimova@beeteam.io')",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, "Стажёр+");
        assert!(row.1 > 0.0, "band_mid untouched");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_levels_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let status = patch_levels(&pool, &lead,
            r#"{"levels":[{"ord":1,"name":"X","exp":"","autonomy":"","scope":""}]}"#).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_levels_rejects_empty_name(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let status = patch_levels(&pool, &hr,
            r#"{"levels":[{"ord":1,"name":"  ","exp":"","autonomy":"","scope":""}]}"#).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    async fn put_disc(pool: &sqlx::PgPool, token: &str, id: &str, body: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("PUT").uri(format!("/v1/grades/disciplines/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    /// (discipline_id, blocks[(id, name, ord)]) for a seeded discipline by key.
    async fn disc_blocks(pool: &sqlx::PgPool, key: &str) -> (uuid::Uuid, Vec<(uuid::Uuid, String, i32)>) {
        let d: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM disciplines WHERE key = $1").bind(key)
            .fetch_one(pool).await.unwrap();
        let blocks: Vec<(uuid::Uuid, String, i32)> = sqlx::query_as(
            "SELECT id, name, ord FROM grade_blocks WHERE discipline_id = $1 ORDER BY ord",
        ).bind(d.0).fetch_all(pool).await.unwrap();
        (d.0, blocks)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn put_renames_block_and_edits_cell(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (id, blocks) = disc_blocks(&pool, "mobile").await; // mobile has no graded members → safe
        // Build a payload that keeps all blocks, renames the first, and sets its IC1 cell.
        let block_json: Vec<String> = blocks.iter().enumerate().map(|(i, b)| {
            let name = if i == 0 { "Стек QA+" } else { b.1.as_str() };
            format!(r#"{{"id":"{}","name":"{}","cells":[{{"level_ord":1,"text":"Новый текст IC1","required":true}}]}}"#, b.0, name)
        }).collect();
        let body = format!(r#"{{"label":"QA","icon":"check","description":"","blocks":[{}]}}"#, block_json.join(","));
        let (status, json) = put_disc(&pool, &hr, &id.to_string(), &body).await;
        assert_eq!(status, StatusCode::OK);
        let first = &json["blocks"][0];
        assert_eq!(first["name"], "Стек QA+");
        let ic1 = first["cells"].as_array().unwrap().iter().find(|c| c["level"] == 1).unwrap();
        assert_eq!(ic1["text"], "Новый текст IC1");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn put_adds_new_block_with_generated_key(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (id, blocks) = disc_blocks(&pool, "mobile").await;
        let mut block_json: Vec<String> = blocks.iter().map(|b|
            format!(r#"{{"id":"{}","name":"{}","cells":[]}}"#, b.0, b.1)).collect();
        block_json.push(r#"{"id":null,"name":"Новый блок","cells":[{"level_ord":1,"text":"t","required":true}]}"#.into());
        let body = format!(r#"{{"label":"Mobile","icon":"spark","description":"","blocks":[{}]}}"#, block_json.join(","));
        let (status, json) = put_disc(&pool, &hr, &id.to_string(), &body).await;
        assert_eq!(status, StatusCode::OK);
        let added = json["blocks"].as_array().unwrap().iter().find(|b| b["name"] == "Новый блок").unwrap();
        assert!(added["id"].is_string() && !added["id"].as_str().unwrap().is_empty());
        assert!(added["key"].as_str().unwrap().starts_with("blk_"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn put_deletes_empty_block(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (id, blocks) = disc_blocks(&pool, "mobile").await; // no graded members
        // Omit the last block.
        let keep = &blocks[..blocks.len() - 1];
        let block_json: Vec<String> = keep.iter().map(|b|
            format!(r#"{{"id":"{}","name":"{}","cells":[]}}"#, b.0, b.1)).collect();
        let body = format!(r#"{{"label":"Mobile","icon":"spark","description":"","blocks":[{}]}}"#, block_json.join(","));
        let (status, json) = put_disc(&pool, &hr, &id.to_string(), &body).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["blocks"].as_array().unwrap().len(), blocks.len() - 1);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn put_409_when_removing_block_with_data(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        // frontend has graded members (Анна) → its blocks carry member_block_levels.
        let (id, blocks) = disc_blocks(&pool, "frontend").await;
        let keep = &blocks[..blocks.len() - 1]; // drop one → it has data → 409
        let block_json: Vec<String> = keep.iter().map(|b|
            format!(r#"{{"id":"{}","name":"{}","cells":[]}}"#, b.0, b.1)).collect();
        let body = format!(r#"{{"label":"Frontend","icon":"layers","description":"","blocks":[{}]}}"#, block_json.join(","));
        let (status, _) = put_disc(&pool, &hr, &id.to_string(), &body).await;
        assert_eq!(status, StatusCode::CONFLICT);
        // Rollback check: the block is still there.
        let after = disc_blocks(&pool, "frontend").await;
        assert_eq!(after.1.len(), blocks.len());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn put_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (id, _) = disc_blocks(&pool, "qa").await;
        let (status, _) = put_disc(&pool, &lead, &id.to_string(),
            r#"{"label":"QA","icon":"check","description":"","blocks":[]}"#).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    async fn post_disc(pool: &sqlx::PgPool, token: &str, body: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/grades/disciplines")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
        (status, json)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn post_creates_discipline_copying_structure_with_empty_cells(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let (backend_id, backend_blocks) = disc_blocks(&pool, "backend").await;
        let body = format!(
            r#"{{"label":"Дизайн","icon":"spark","description":"Продуктовый дизайн","copy_from_discipline_id":"{backend_id}"}}"#
        );
        let (status, json) = post_disc(&pool, &hr, &body).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["label"], "Дизайн");
        let blocks = json["blocks"].as_array().unwrap();
        assert_eq!(blocks.len(), backend_blocks.len(), "block structure copied");
        // cells are empty (required=true, text null) → 7 per block
        let b0 = &blocks[0];
        assert_eq!(b0["cells"].as_array().unwrap().len(), 7);
        assert!(b0["cells"][0]["text"].is_null());
        assert_eq!(b0["cells"][0]["required"], true);
        assert!(b0["key"].as_str().unwrap().starts_with("blk_"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn post_404_for_unknown_copy_from(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let body = format!(
            r#"{{"label":"X","icon":"layers","description":"","copy_from_discipline_id":"{}"}}"#,
            uuid::Uuid::new_v4()
        );
        let (status, _) = post_disc(&pool, &hr, &body).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn post_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let (backend_id, _) = disc_blocks(&pool, "backend").await;
        let body = format!(r#"{{"label":"X","icon":"layers","description":"","copy_from_discipline_id":"{backend_id}"}}"#);
        let (status, _) = post_disc(&pool, &lead, &body).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn framework_returns_levels_and_disciplines(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri("/v1/grades/framework")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["levels"].as_array().unwrap().len(), 7);
        assert_eq!(json["levels"][0]["code"], "IC1");
        assert!(json["levels"][0]["band_mid"].is_null(), "lead: exact bands masked");
        assert!(json["levels"][0]["band_shape"]["high"].is_number());
        assert!(json["tax_rate"].is_null(), "lead: tax rate masked");
        let disc = json["disciplines"].as_array().unwrap();
        assert_eq!(disc.len(), 5);
        let backend = disc.iter().find(|d| d["key"] == "backend").unwrap();
        assert_eq!(backend["blocks"].as_array().unwrap().len(), 6);
        let arch = backend["blocks"].as_array().unwrap().iter().find(|b| b["key"] == "arch").unwrap();
        assert_eq!(arch["cells"].as_array().unwrap().len(), 7);
        // arch/IC1 is "Не требуется." → required=false, text null
        assert_eq!(arch["cells"][0]["required"], false);
        assert!(arch["cells"][0]["text"].is_null());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn seed_bands_are_gross_tenge(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let row: (f64, f64) = sqlx::query_as(
            "SELECT band_mid, band_high FROM grade_levels WHERE ord = 7 \
             AND workspace_id = (SELECT id FROM workspaces LIMIT 1)",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, 3_700_000.0);
        assert_eq!(row.1, 4_600_000.0);

        let ic1: (f64, f64) = sqlx::query_as(
            "SELECT band_low, band_mid FROM grade_levels WHERE ord = 1 \
             AND workspace_id = (SELECT id FROM workspaces LIMIT 1)",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(ic1.0, 300_000.0);
        assert_eq!(ic1.1, 380_000.0);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn framework_masks_bands_without_permission(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let json = get_framework_json(&pool, &lead).await;
        assert!(json["levels"][0]["band_low"].is_null());
        assert!(json["levels"][0]["band_mid"].is_null());
        assert!(json["levels"][0]["band_high"].is_null());
        assert!(json["levels"][0]["band_shape"]["low"].is_number());
        assert!(json["tax_rate"].is_null());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn framework_shows_bands_with_permission(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let json = get_framework_json(&pool, &hr).await;
        assert!(json["levels"][0]["band_mid"].is_number());
        assert!(json["levels"][0]["band_low"].is_number());
        assert!(json["levels"][0]["band_high"].is_number());
        assert!((json["tax_rate"].as_f64().unwrap() - 0.10).abs() < 1e-9);
        let ic7 = json["levels"].as_array().unwrap().iter().find(|l| l["code"] == "IC7").unwrap();
        assert!((ic7["band_shape"]["high"].as_f64().unwrap() - 1.0).abs() < 1e-9);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn check_constraint_rejects_inverted_band(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        // Directly violate band_low <= band_high — the CHECK must reject it.
        let res = sqlx::query("UPDATE grade_levels SET band_low = band_high + 1 WHERE ord = 1")
            .execute(&pool).await;
        assert!(res.is_err(), "CHECK band_order must reject low > high");

        // Also reject a valid low but mid > high.
        let res2 = sqlx::query("UPDATE grade_levels SET band_mid = band_high + 1 WHERE ord = 1")
            .execute(&pool).await;
        assert!(res2.is_err(), "CHECK band_order must reject mid > high");
    }
}
