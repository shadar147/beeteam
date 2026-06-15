# BeeTeam — Framework Editor (slice #5b-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR-admin edit mode on `/grades` — draft-edit the competency matrix (cells, blocks), the IC1–IC7 level descriptions, and a discipline's meta, plus create a discipline by copying a base's block structure; applied only on «Сохранить», gated by `EditFramework`.

**Architecture:** Three write endpoints under `require_permission(EditFramework)` in `routes/grades.rs` — bulk `PATCH /levels`, reconciling `PUT /disciplines/{id}` (update/insert/delete-if-empty blocks in one transaction; 409 if a removed block has referencing data), `POST /disciplines` (copy structure). No schema migration. The web client snapshots the active discipline + levels into a React draft on entering edit mode; «Сохранить» orchestrates the PATCH+PUT and invalidates the framework query; «Отмена» discards.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres 16, Next.js 14 (server session → props), TanStack Query v5, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-15-beeteam-framework-editor-design.md`

**Conventions:**
- Rust tests: `api/scripts/test.sh <args>` (isolated test DB; NEVER bare `cargo test`, except `cargo test -p bt-domain` which hits no DB).
- Web: `cd web && pnpm vitest run`, `npx tsc --noEmit`.
- Read stays open; only the three writes are gated. The HR user `o.klimova@beeteam.io` (seeded in #5a) has `EditFramework`; the lead `e.glebov@beeteam.io` does not.
- The new DTOs validate manually in the handlers (the codebase's `validator` usage is range-only; nested validation is done by hand to stay version-proof).

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
cd /Users/lebedev.v/projects/beeteam
git checkout -b feat/framework-editor
```

---

### Task 1: Domain DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (append after `Discipline`/`GradesFramework`, before the test module)

- [ ] **Step 1: Add the request DTOs**

```rust
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateLevel {
    pub ord: i32,
    pub name: String,
    pub exp: String,
    pub autonomy: String,
    pub scope: String,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateLevels {
    pub levels: Vec<UpdateLevel>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct PutCell {
    pub level_ord: i32,
    pub text: Option<String>,
    pub required: bool,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct PutBlock {
    pub id: Option<uuid::Uuid>, // Some = existing, None = new
    pub name: String,
    pub cells: Vec<PutCell>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct PutDiscipline {
    pub label: String,
    pub icon: String,
    pub description: String,
    pub blocks: Vec<PutBlock>, // array order = ord
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateDiscipline {
    pub label: String,
    pub icon: String,
    pub description: String,
    pub copy_from_discipline_id: uuid::Uuid,
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain
```

Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add crates/bt-domain/src/lib.rs
git commit -m "feat(domain): framework editor request DTOs (slice #5b-i)"
```

---

### Task 2: `PATCH /v1/grades/levels`

**Files:**
- Modify: `api/crates/bt-api/src/routes/grades.rs` (add helper `workspace_of`, handler `update_levels`, tests)
- Modify: `api/crates/bt-api/src/app.rs` (route)
- Modify: `api/crates/bt-api/src/openapi.rs` (path + schemas)

- [ ] **Step 1: Add a `workspace_of` helper + a `levels_of` helper at the top of the module** (after the imports, before `get_framework`):

```rust
pub(crate) async fn workspace_of(pool: &sqlx::PgPool, user_id: Uuid) -> AppResult<Uuid> {
    let ws: Option<(Uuid,)> = sqlx::query_as("SELECT workspace_id FROM users WHERE id = $1")
        .bind(user_id).fetch_optional(pool).await?;
    Ok(ws.ok_or(AppError::Unauthorized)?.0)
}

pub(crate) async fn levels_of(pool: &sqlx::PgPool, workspace_id: Uuid) -> AppResult<Vec<GradeLevel>> {
    let rows = sqlx::query_as::<_, (i32, String, String, String, String, String, bool, f64, f64, f64)>(
        "SELECT ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high \
         FROM grade_levels WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| GradeLevel {
        ord: r.0, code: r.1, name: r.2, exp: r.3, autonomy: r.4, scope: r.5,
        mgr: r.6, band_low: r.7, band_mid: r.8, band_high: r.9,
    }).collect())
}
```

Refactor `get_framework`'s inline workspace lookup + levels query to call these two helpers (replace the `let ws: (Uuid,) = …; let workspace_id = ws.0;` block with `let workspace_id = workspace_of(&state.pool, auth.id).await?;` and the levels `sqlx::query_as…collect()` block with `let levels = levels_of(&state.pool, workspace_id).await?;`).

- [ ] **Step 2: Add the handler** (imports: extend the `use bt_domain::{…}` line with `UpdateLevels`; add `use crate::auth::permissions::require_permission; use bt_domain::Permission;`):

```rust
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

    Ok(Json(levels_of(&state.pool, workspace_id).await?))
}
```

- [ ] **Step 3: Wire** — `app.rs`, change the grades route to add PATCH:

```rust
.route("/v1/grades/framework", get(routes::grades::get_framework))
.route("/v1/grades/levels", axum::routing::patch(routes::grades::update_levels))
```

`openapi.rs` — `paths(...)` add `crate::routes::grades::update_levels,`; `components(schemas(...))` add `bt_domain::UpdateLevels,` and `bt_domain::UpdateLevel,` (and, registered now so Tasks 3–4 only touch paths: `bt_domain::PutDiscipline, bt_domain::PutBlock, bt_domain::PutCell, bt_domain::CreateDiscipline,`).

- [ ] **Step 4: Add tests** to `routes/grades.rs` `mod tests`:

```rust
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
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api grades::
```

(The refactor of `get_framework` is covered by the existing `framework_returns_levels_and_disciplines` test in the same run.)

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): PATCH grades levels under EditFramework (slice #5b-i)"
```

---

### Task 3: `PUT /v1/grades/disciplines/{id}` (reconcile)

**Files:**
- Modify: `api/crates/bt-api/src/routes/grades.rs` (add `load_discipline`, `put_discipline`, tests)
- Modify: `api/crates/bt-api/src/app.rs`, `openapi.rs` (path only)

- [ ] **Step 1: Add the `load_discipline` helper** (after `levels_of`):

```rust
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
```

- [ ] **Step 2: Add the handler** (extend the `use bt_domain::{…}` line with `Discipline, GradeBlock, PutDiscipline`; add `use std::collections::HashSet;`):

```rust
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
```

- [ ] **Step 3: Wire** — `app.rs` after the levels route:

```rust
.route("/v1/grades/disciplines/:id", axum::routing::put(routes::grades::put_discipline))
```

`openapi.rs` `paths(...)`: add `crate::routes::grades::put_discipline,`.

- [ ] **Step 4: Add tests** (the `put_disc` helper returns status + json):

```rust
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

    /// (discipline_id, blocks[(id, key, name, ord)]) for a seeded discipline by key.
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
        let (id, blocks) = disc_blocks(&pool, "qa").await; // qa has no graded members → safe
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
        let (id, blocks) = disc_blocks(&pool, "qa").await;
        let mut block_json: Vec<String> = blocks.iter().map(|b|
            format!(r#"{{"id":"{}","name":"{}","cells":[]}}"#, b.0, b.1)).collect();
        block_json.push(r#"{"id":null,"name":"Новый блок","cells":[{"level_ord":1,"text":"t","required":true}]}"#.into());
        let body = format!(r#"{{"label":"QA","icon":"check","description":"","blocks":[{}]}}"#, block_json.join(","));
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
        let (id, blocks) = disc_blocks(&pool, "qa").await; // no graded members
        // Omit the last block.
        let keep = &blocks[..blocks.len() - 1];
        let block_json: Vec<String> = keep.iter().map(|b|
            format!(r#"{{"id":"{}","name":"{}","cells":[]}}"#, b.0, b.1)).collect();
        let body = format!(r#"{{"label":"QA","icon":"check","description":"","blocks":[{}]}}"#, block_json.join(","));
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
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api grades::
```

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): reconciling PUT discipline (cells/blocks/meta) with 409-on-used (slice #5b-i)"
```

---

### Task 4: `POST /v1/grades/disciplines` (create from copy)

**Files:**
- Modify: `api/crates/bt-api/src/routes/grades.rs` (handler `create_discipline`, tests)
- Modify: `api/crates/bt-api/src/app.rs`, `openapi.rs` (path only)

- [ ] **Step 1: Add the handler** (extend `use bt_domain::{…}` with `CreateDiscipline`):

```rust
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
```

- [ ] **Step 2: Wire** — `app.rs` after the PUT route:

```rust
.route("/v1/grades/disciplines", axum::routing::post(routes::grades::create_discipline))
```

`openapi.rs` `paths(...)`: add `crate::routes::grades::create_discipline,`.

- [ ] **Step 3: Add tests**

```rust
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
```

- [ ] **Step 4: Run the full API suite — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api
```

- [ ] **Step 5: Commit**

```bash
git add api/crates/bt-api/src
git commit -m "feat(api): POST create discipline from a copied structure (slice #5b-i)"
```

---

### Task 5: Regenerate web API types

**Files:**
- Modify: `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Re-seed dev DB + start the API**

```bash
cd /Users/lebedev.v/projects/beeteam
pkill -f "target/debug/bt-api" || true
docker compose up -d postgres
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api
```

(Keep it running. Dev Postgres is on host port 5442.)

- [ ] **Step 2: Regenerate + verify (second terminal)**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api
grep -c "PutDiscipline" lib/api/schema.d.ts && grep -c '"/v1/grades/disciplines"' lib/api/schema.d.ts
```

Expected: both counts > 0.

- [ ] **Step 3: Commit**

```bash
git add lib/api/schema.d.ts
git commit -m "feat(api): register framework-editor paths + regen web types (slice #5b-i)"
```

---

### Task 6: Query hooks

**Files:**
- Modify: `web/lib/query/grades.ts`

- [ ] **Step 1: Add the mutation hooks + request types**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type GradesFramework = components["schemas"]["GradesFramework"];
export type Discipline = components["schemas"]["Discipline"];
export type GradeBlock = components["schemas"]["GradeBlock"];
export type GradeLevel = components["schemas"]["GradeLevel"];
export type MatrixCell = components["schemas"]["MatrixCell"];
export type UpdateLevels = components["schemas"]["UpdateLevels"];
export type PutDiscipline = components["schemas"]["PutDiscipline"];
export type CreateDiscipline = components["schemas"]["CreateDiscipline"];

export function useGradesFramework() {
  return useQuery<GradesFramework>({
    queryKey: ["grades-framework"],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/grades/framework");
      if (error) throw error;
      return data!;
    },
  });
}

export function useUpdateLevels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateLevels) => {
      const { data, error } = await api.PATCH("/v1/grades/levels", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}

export function usePutDiscipline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PutDiscipline }) => {
      const { data, error, response } = await api.PUT("/v1/grades/disciplines/{id}", {
        params: { path: { id } },
        body,
      });
      // Carry the HTTP status so the caller can show a specific 409 (block in use) banner.
      if (error) throw Object.assign(new Error("put discipline failed"), { status: response.status });
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}

export function useCreateDiscipline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDiscipline) => {
      const { data, error } = await api.POST("/v1/grades/disciplines", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd /Users/lebedev.v/projects/beeteam/web && npx tsc --noEmit && pnpm vitest run 2>&1 | tail -3
git add lib/query/grades.ts
git commit -m "feat(web): framework editor mutation hooks (slice #5b-i)"
```

---

### Task 7: `CellEditor` + `LevelsEditor` (TDD)

**Files:**
- Create: `web/components/grades/CellEditor.tsx`
- Create: `web/components/grades/LevelsEditor.tsx`
- Create: `web/components/__tests__/FrameworkEditor.test.tsx`

The editor works on a client draft. Define the draft types in a shared module first.

- [ ] **Step 1: Create `web/components/grades/editorTypes.ts`**

```ts
export type DraftCell = { level: number; text: string | null; required: boolean };
export type DraftBlock = { id: string | null; key: string; name: string; cells: DraftCell[] };
export type DraftLevel = { ord: number; code: string; name: string; exp: string; autonomy: string; scope: string };
export type Draft = {
  discId: string;
  label: string;
  icon: string;
  description: string;
  blocks: DraftBlock[];
  levels: DraftLevel[];
  levelsDirty: boolean;
};

/** Empty 7-cell array (level 1..7, required true, no text) for a fresh block. */
export function emptyCells(): DraftCell[] {
  return Array.from({ length: 7 }, (_, i) => ({ level: i + 1, text: null, required: true }));
}
```

- [ ] **Step 2: Failing tests** — `web/components/__tests__/FrameworkEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CellEditor } from "../grades/CellEditor";
import { LevelsEditor } from "../grades/LevelsEditor";
import type { DraftLevel } from "../grades/editorTypes";

describe("CellEditor", () => {
  it("applies edited text", () => {
    const onApply = vi.fn();
    render(
      <CellEditor blockName="Стек" levelCode="IC3" levelName="Middle" initial="старый" onApply={onApply} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Текст компетенции"), { target: { value: "новый текст" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(onApply).toHaveBeenCalledWith({ text: "новый текст", required: true });
  });

  it("marks «не требуется» as required=false, text null", () => {
    const onApply = vi.fn();
    render(<CellEditor blockName="Стек" levelCode="IC1" levelName="Junior" initial="x" onApply={onApply} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /не требуется/i }));
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(onApply).toHaveBeenCalledWith({ text: null, required: false });
  });
});

const LEVELS: DraftLevel[] = [
  { ord: 1, code: "IC1", name: "Junior", exp: "0–1", autonomy: "a1", scope: "s1" },
  { ord: 2, code: "IC2", name: "Middle", exp: "1–3", autonomy: "a2", scope: "s2" },
];

describe("LevelsEditor", () => {
  it("edits a level field and fires the setter", () => {
    const onChange = vi.fn();
    render(<LevelsEditor levels={LEVELS} onChange={onChange} />);
    const nameInputs = screen.getAllByLabelText("Название уровня");
    fireEvent.change(nameInputs[0], { target: { value: "Стажёр" } });
    expect(onChange).toHaveBeenCalledWith(1, { name: "Стажёр" });
  });
});
```

Run: `cd web && pnpm vitest run components/__tests__/FrameworkEditor.test.tsx` → FAIL.

- [ ] **Step 3: Implement `CellEditor.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/Modal";

export function CellEditor({
  blockName, levelCode, levelName, initial, onApply, onClose,
}: {
  blockName: string;
  levelCode: string;
  levelName: string;
  initial: string | null;
  onApply: (cell: { text: string | null; required: boolean }) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(initial ?? "");
  const [na, setNa] = useState(initial === null);

  const apply = () => {
    if (na) onApply({ text: null, required: false });
    else onApply({ text: val, required: true });
    onClose();
  };

  return (
    <Modal title={`${blockName} · ${levelCode} ${levelName}`} onClose={onClose}>
      <label htmlFor="cell-text" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
        Текст компетенции
      </label>
      <textarea
        id="cell-text"
        rows={5}
        value={na ? "" : val}
        disabled={na}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Опишите компетенцию как наблюдаемое поведение…"
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand disabled:opacity-50"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setNa((v) => !v)}
          className={`rounded-md border px-2.5 py-1.5 text-[12.5px] ${na ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2 hover:bg-bg-tint"}`}>
          Отметить «не требуется»
        </button>
        <button type="button" onClick={() => { setNa(false); setVal(""); }}
          className="rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:bg-bg-tint">
          Очистить
        </button>
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12px] text-ink-3">
        <Sparkles size={14} className="mt-0.5 shrink-0" />
        Формулируйте как наблюдаемое поведение («проектирует…», «оптимизирует…»), а не как знание.
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
          Отмена
        </button>
        <button type="button" onClick={apply}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
          Применить
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Implement `LevelsEditor.tsx`**

```tsx
import { Layers } from "lucide-react";
import { GradeChip } from "./GradeChip";
import type { DraftLevel } from "./editorTypes";

export function LevelsEditor({
  levels, onChange,
}: {
  levels: DraftLevel[];
  onChange: (ord: number, patch: Partial<Omit<DraftLevel, "ord" | "code">>) => void;
}) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
        <Layers size={15} className="mt-0.5 shrink-0" />
        Уровни общие для всех дисциплин. Изменения коснутся всей системы грейдов.
      </div>
      {rows.map((l) => (
        <div key={l.ord} className="grid items-start gap-4 rounded-xl border border-line bg-bg-elev p-4"
          style={{ gridTemplateColumns: "60px 200px 1fr 1fr" }}>
          <GradeChip ord={l.ord} code={l.code} />
          <div className="space-y-1.5">
            <input aria-label="Название уровня" value={l.name}
              onChange={(e) => onChange(l.ord, { name: e.target.value })}
              className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand" />
            <input aria-label="Опыт" value={l.exp}
              onChange={(e) => onChange(l.ord, { exp: e.target.value })}
              className="w-full rounded-md border border-line bg-bg px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-brand" />
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Автономность</div>
            <textarea aria-label="Автономность" rows={2} value={l.autonomy}
              onChange={(e) => onChange(l.ord, { autonomy: e.target.value })}
              className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
          <div>
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Масштаб влияния</div>
            <textarea aria-label="Масштаб влияния" rows={2} value={l.scope}
              onChange={(e) => onChange(l.ord, { scope: e.target.value })}
              className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/FrameworkEditor.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add components/grades components/__tests__/FrameworkEditor.test.tsx
git commit -m "feat(web): CellEditor + LevelsEditor draft components (slice #5b-i)"
```

---

### Task 8: `MatrixEditor` (TDD)

**Files:**
- Create: `web/components/grades/MatrixEditor.tsx`
- Modify: `web/components/__tests__/FrameworkEditor.test.tsx` (append)

- [ ] **Step 1: Append failing tests**

```tsx
import { MatrixEditor } from "../grades/MatrixEditor";
import { emptyCells, type DraftBlock } from "../grades/editorTypes";

const BLOCKS: DraftBlock[] = [
  { id: "b1", key: "stack", name: "Стек", cells: emptyCells() },
  { id: "b2", key: "core", name: "Ядро", cells: emptyCells() },
];
const COLS = LEVELS; // reuse the 2-level fixture from Task 7's describe scope

describe("MatrixEditor", () => {
  it("renames a block", () => {
    const onRename = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={onRename}
      onMove={() => {}} onDelete={() => {}} onAdd={() => {}} onOpenCell={() => {}} />);
    fireEvent.change(screen.getAllByLabelText("Имя блока")[0], { target: { value: "Стек+" } });
    expect(onRename).toHaveBeenCalledWith(0, "Стек+");
  });

  it("adds a block", () => {
    const onAdd = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={() => {}} onDelete={() => {}} onAdd={onAdd} onOpenCell={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Добавить блок/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("moves and deletes blocks; up disabled at the top", () => {
    const onMove = vi.fn();
    const onDelete = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={onMove} onDelete={onDelete} onAdd={() => {}} onOpenCell={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Блок вверх" })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Блок вниз" })[0]);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByRole("button", { name: "Удалить блок" })[1]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("opens a cell editor on cell click", () => {
    const onOpenCell = vi.fn();
    render(<MatrixEditor blocks={BLOCKS} levels={COLS} onRename={() => {}}
      onMove={() => {}} onDelete={() => {}} onAdd={() => {}} onOpenCell={onOpenCell} />);
    fireEvent.click(screen.getAllByTestId("edit-cell-b1-1")[0]);
    expect(onOpenCell).toHaveBeenCalledWith(0, 1);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `MatrixEditor.tsx`**

```tsx
import { ArrowUp, ArrowDown, Trash2, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftBlock, DraftLevel } from "./editorTypes";

export function MatrixEditor({
  blocks, levels, onRename, onMove, onDelete, onAdd, onOpenCell,
}: {
  blocks: DraftBlock[];
  levels: DraftLevel[];
  onRename: (blockIdx: number, name: string) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (blockIdx: number) => void;
  onAdd: () => void;
  onOpenCell: (blockIdx: number, levelOrd: number) => void;
}) {
  const cols = [...levels].sort((a, b) => a.ord - b.ord);
  const cellOf = (b: DraftBlock, ord: number) => b.cells.find((c) => c.level === ord);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[900px] gap-px overflow-hidden rounded-xl border border-line bg-line"
          style={{ gridTemplateColumns: `220px repeat(${cols.length}, minmax(150px, 1fr))` }}>
          <div className="bg-bg-tint px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Блок · уровень
          </div>
          {cols.map((l) => (
            <div key={l.ord} className="flex flex-col gap-px bg-brand px-3 py-2.5 text-[#1A1100]">
              <span className="text-[13px] font-extrabold tabular">{l.code}</span>
              <span className="text-[11px] font-semibold opacity-85">{l.name}</span>
            </div>
          ))}

          {blocks.map((b, bi) => (
            <div key={b.id ?? `new-${bi}`} className="contents">
              <div className="flex items-center gap-1.5 bg-bg-tint px-2.5 py-2.5">
                <div className="flex flex-col">
                  <button type="button" aria-label="Блок вверх" disabled={bi === 0}
                    onClick={() => onMove(bi, bi - 1)}
                    className="text-ink-4 hover:text-ink disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button type="button" aria-label="Блок вниз" disabled={bi === blocks.length - 1}
                    onClick={() => onMove(bi, bi + 1)}
                    className="text-ink-4 hover:text-ink disabled:opacity-30"><ArrowDown size={13} /></button>
                </div>
                <input aria-label="Имя блока" value={b.name}
                  onChange={(e) => onRename(bi, e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-brand" />
                <button type="button" aria-label="Удалить блок" onClick={() => onDelete(bi)}
                  className="text-ink-4 hover:text-miss"><Trash2 size={13} /></button>
              </div>
              {cols.map((l) => {
                const c = cellOf(b, l.ord);
                const empty = !(c && c.required && c.text);
                return (
                  <button key={l.ord} type="button" data-testid={`edit-cell-${b.id ?? `new-${bi}`}-${l.ord}`}
                    onClick={() => onOpenCell(bi, l.ord)}
                    className={cn(
                      "group relative flex items-center gap-1 p-3 text-left text-[12px] leading-relaxed transition-colors",
                      empty ? "bg-bg-tint text-ink-4 italic hover:bg-brand-soft" : "bg-bg-elev text-ink-2 hover:bg-brand-soft",
                    )}>
                    <span className="min-w-0 flex-1">
                      {c && !c.required ? "Не требуется." : c?.text || "добавить…"}
                    </span>
                    <Pencil size={11} className="shrink-0 text-ink-4 opacity-0 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
        <Plus size={14} /> Добавить блок компетенций
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/FrameworkEditor.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add components/grades components/__tests__/FrameworkEditor.test.tsx
git commit -m "feat(web): MatrixEditor draft grid (slice #5b-i)"
```

---

### Task 9: `NewDisciplineModal` (TDD)

**Files:**
- Create: `web/components/grades/NewDisciplineModal.tsx`
- Modify: `web/components/__tests__/FrameworkEditor.test.tsx` (append)

- [ ] **Step 1: Append failing tests**

```tsx
import { NewDisciplineModal } from "../grades/NewDisciplineModal";

describe("NewDisciplineModal", () => {
  const bases = [{ id: "d1", label: "Backend" }, { id: "d2", label: "Frontend" }];

  it("disables create until a label is entered", () => {
    const onCreate = vi.fn();
    render(<NewDisciplineModal bases={bases} onCreate={onCreate} onClose={() => {}} creating={false} />);
    const btn = screen.getByRole("button", { name: "Создать" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Название дисциплины"), { target: { value: "Дизайн" } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Дизайн", copy_from_discipline_id: "d1" }),
    );
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `NewDisciplineModal.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";

const ICONS = [
  { key: "layers", Icon: Layers },
  { key: "fields", Icon: SlidersHorizontal },
  { key: "spark", Icon: Sparkles },
  { key: "check", Icon: CircleCheck },
  { key: "settings", Icon: Settings },
];

export function NewDisciplineModal({
  bases, onCreate, onClose, creating,
}: {
  bases: { id: string; label: string }[];
  onCreate: (body: { label: string; icon: string; description: string; copy_from_discipline_id: string }) => void;
  onClose: () => void;
  creating: boolean;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("layers");
  const [base, setBase] = useState(bases[0]?.id ?? "");
  const valid = label.trim().length >= 2 && base !== "";

  return (
    <Modal title="Новая дисциплина" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Иконка</div>
          <div className="flex gap-2">
            {ICONS.map(({ key, Icon }) => (
              <button key={key} type="button" aria-label={`Иконка ${key}`} onClick={() => setIcon(key)}
                className={cn("grid h-9 w-9 place-items-center rounded-lg border",
                  icon === key ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-3 hover:bg-bg-tint")}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="disc-label" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
            Название дисциплины
          </label>
          <input id="disc-label" value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand" />
        </div>
        <div>
          <label htmlFor="disc-desc" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">Описание</label>
          <input id="disc-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand" />
        </div>
        <div>
          <label htmlFor="disc-base" className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
            Скопировать структуру блоков из…
          </label>
          <select id="disc-base" value={base} onChange={(e) => setBase(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand">
            {bases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">Отмена</button>
        <button type="button" disabled={!valid || creating}
          onClick={() => onCreate({ label: label.trim(), icon, description: description.trim(), copy_from_discipline_id: base })}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          Создать
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Run — expect PASS**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run components/__tests__/FrameworkEditor.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add components/grades components/__tests__/FrameworkEditor.test.tsx
git commit -m "feat(web): NewDisciplineModal (slice #5b-i)"
```

---

### Task 10: Wire edit mode into `GradesClient` + page `canEdit` (TDD)

**Files:**
- Modify: `web/app/(app)/grades/page.tsx`
- Modify: `web/components/grades/GradesClient.tsx`
- Modify: `web/components/__tests__/FrameworkEditor.test.tsx` (append a gating test)

- [ ] **Step 1: Append a gating test** (GradesClient needs the react-query provider + the framework fetch; mock the hooks module so the test stays a pure render):

```tsx
import { GradesClient } from "../grades/GradesClient";

vi.mock("@/lib/query/grades", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/grades")>();
  return {
    ...actual,
    useGradesFramework: () => ({
      isLoading: false, isError: false,
      data: {
        levels: [{ ord: 1, code: "IC1", name: "Junior", exp: "", autonomy: "", scope: "", mgr: false, band_low: 1, band_mid: 2, band_high: 3 }],
        disciplines: [{ id: "d1", key: "backend", label: "Backend", icon: "fields", description: "", ord: 0, blocks: [] }],
      },
    }),
    useUpdateLevels: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePutDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

describe("GradesClient edit gating", () => {
  it("shows «Редактировать» only when canEdit", () => {
    const { rerender } = render(<GradesClient canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
    rerender(<GradesClient canEdit={true} />);
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
  });

  it("enters edit mode and hides the Вилки tab", () => {
    render(<GradesClient canEdit={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(screen.getByText("режим редактирования")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вилки" })).not.toBeInTheDocument();
  });
});
```

Run → FAIL (GradesClient takes no `canEdit` yet, no edit button).

- [ ] **Step 2: Update `web/app/(app)/grades/page.tsx`** to a server component passing `canEdit`:

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { GradesClient } from "@/components/grades/GradesClient";

export default async function GradesPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  return <GradesClient canEdit={user ? hasPermission(user, "edit_framework") : false} />;
}
```

- [ ] **Step 3: Rewrite `web/components/grades/GradesClient.tsx`** with edit mode. Full file:

```tsx
"use client";
import { useState } from "react";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings, Pencil, Check, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegControl } from "@/components/SegControl";
import {
  useGradesFramework, useUpdateLevels, usePutDiscipline, useCreateDiscipline,
  type Discipline, type PutDiscipline as PutDisciplineBody,
} from "@/lib/query/grades";
import { GradeLevels } from "./GradeLevels";
import { GradeMatrix } from "./GradeMatrix";
import { GradeBands } from "./GradeBands";
import { LevelsEditor } from "./LevelsEditor";
import { MatrixEditor } from "./MatrixEditor";
import { CellEditor } from "./CellEditor";
import { NewDisciplineModal } from "./NewDisciplineModal";
import { emptyCells, type Draft, type DraftBlock, type DraftLevel } from "./editorTypes";

type Tab = "levels" | "matrix" | "bands";

const DISC_ICONS: Record<string, LucideIcon> = {
  fields: SlidersHorizontal, layers: Layers, spark: Sparkles, check: CircleCheck, settings: Settings,
};
const ICON_KEYS = ["layers", "fields", "spark", "check", "settings"] as const;

function snapshot(disc: Discipline, levels: DraftLevel[]): Draft {
  const blocks: DraftBlock[] = [...disc.blocks]
    .sort((a, b) => a.ord - b.ord)
    .map((b) => ({
      id: b.id,
      key: b.key,
      name: b.name,
      cells: Array.from({ length: 7 }, (_, i) => {
        const c = b.cells.find((x) => x.level === i + 1);
        return { level: i + 1, text: c?.text ?? null, required: c?.required ?? true };
      }),
    }));
  return { discId: disc.id, label: disc.label, icon: disc.icon, description: disc.description, blocks, levels, levelsDirty: false };
}

export function GradesClient({ canEdit }: { canEdit: boolean }) {
  const fw = useGradesFramework();
  const updateLevels = useUpdateLevels();
  const putDiscipline = usePutDiscipline();
  const createDiscipline = useCreateDiscipline();

  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openCell, setOpenCell] = useState<{ blockIdx: number; levelOrd: number } | null>(null);
  const [newDisc, setNewDisc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (fw.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (fw.isError)
    return (
      <div className="p-6">
        <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
          Не удалось загрузить грейды.{" "}
          <button className="underline" onClick={() => fw.refetch()}>Повторить</button>
        </div>
      </div>
    );

  const { levels, disciplines } = fw.data!;
  if (disciplines.length === 0) {
    return <div className="p-6 text-center text-[14px] text-ink-3">Карта грейдов пока не настроена</div>;
  }
  const editing = draft !== null;
  const activeKey = disc ?? disciplines[0].key;
  const active = disciplines.find((d) => d.key === activeKey) ?? disciplines[0];
  const sortedLevels = [...levels].sort((a, b) => a.ord - b.ord);

  const enterEdit = () => {
    const lv: DraftLevel[] = sortedLevels.map((l) => ({
      ord: l.ord, code: l.code, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope,
    }));
    setDraft(snapshot(active, lv));
    setTab("matrix");
    setError(null);
  };
  const cancelEdit = () => { setDraft(null); setError(null); };

  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      if (draft.levelsDirty) {
        await updateLevels.mutateAsync({
          levels: draft.levels.map((l) => ({ ord: l.ord, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope })),
        });
      }
      const body: PutDisciplineBody = {
        label: draft.label, icon: draft.icon, description: draft.description,
        blocks: draft.blocks.map((b) => ({
          id: b.id, name: b.name,
          cells: b.cells.map((c) => ({ level_ord: c.level, text: c.text, required: c.required })),
        })),
      };
      await putDiscipline.mutateAsync({ id: draft.discId, body });
      setDraft(null);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      setError(status === 409
        ? "Нельзя удалить блок, по которому уже есть данные сотрудников. Верните блок и сохраните снова."
        : "Не удалось сохранить изменения. Попробуйте ещё раз.");
    }
  };

  // draft mutators
  const setMeta = (patch: Partial<Pick<Draft, "label" | "icon" | "description">>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const setLevel = (ord: number, patch: Partial<DraftLevel>) =>
    setDraft((d) => (d ? { ...d, levelsDirty: true, levels: d.levels.map((l) => (l.ord === ord ? { ...l, ...patch } : l)) } : d));
  const renameBlock = (i: number, name: string) =>
    setDraft((d) => (d ? { ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, name } : b)) } : d));
  const moveBlock = (from: number, to: number) =>
    setDraft((d) => {
      if (!d || to < 0 || to >= d.blocks.length) return d;
      const blocks = d.blocks.slice();
      [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
      return { ...d, blocks };
    });
  const deleteBlock = (i: number) =>
    setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((_, j) => j !== i) } : d));
  const addBlock = () =>
    setDraft((d) => (d ? { ...d, blocks: [...d.blocks, { id: null, key: "", name: "Новый блок", cells: emptyCells() }] } : d));
  const applyCell = (blockIdx: number, levelOrd: number, cell: { text: string | null; required: boolean }) =>
    setDraft((d) => (d ? {
      ...d,
      blocks: d.blocks.map((b, j) => j !== blockIdx ? b : {
        ...b, cells: b.cells.map((c) => (c.level === levelOrd ? { ...c, text: cell.text, required: cell.required } : c)),
      }),
    } : d));

  const busy = updateLevels.isPending || putDiscipline.isPending;

  return (
    <div className="p-6">
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-ink">
            Грейды
            {editing && <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">режим редактирования</span>}
          </h1>
          <p className="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!editing && canEdit && (
            <button type="button" onClick={enterEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              <Pencil size={14} /> Редактировать
            </button>
          )}
          {editing && (
            <>
              <button type="button" onClick={cancelEdit} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">
                <X size={14} /> Отмена
              </button>
              <button type="button" onClick={save} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
                <Check size={14} /> Сохранить
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{error}</div>
      )}

      {/* discipline cards */}
      <div className="mb-[18px] grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {disciplines.map((d) => {
          const Icon = DISC_ICONS[d.icon] ?? Layers;
          const on = d.key === activeKey;
          const dimmed = editing && !on;
          return (
            <button key={d.key} type="button"
              onClick={() => !editing && setDisc(d.key)}
              disabled={dimmed}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                on ? "border-brand bg-brand-soft ring-[3px] ring-brand/10" : "border-line bg-bg-elev hover:bg-bg-tint",
                dimmed && "opacity-40",
              )}>
              <span className={cn("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]",
                on ? "bg-brand text-[#1A1100]" : "bg-bg-tint text-ink-3")}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold tracking-tight text-ink">{d.label}</span>
                {d.description && <span className="block text-[11px] leading-snug text-ink-3">{d.description}</span>}
              </span>
            </button>
          );
        })}
        {editing && (
          <button type="button" onClick={() => setNewDisc(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line p-3 text-[13px] text-ink-3 hover:bg-bg-tint">
            + Новая дисциплина
          </button>
        )}
      </div>

      {/* discipline meta editor */}
      {editing && draft && (
        <div className="mb-4 rounded-xl border border-line bg-bg-elev p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-3">Дисциплина</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {ICON_KEYS.map((k) => {
                const Icon = DISC_ICONS[k];
                return (
                  <button key={k} type="button" aria-label={`Иконка ${k}`} onClick={() => setMeta({ icon: k })}
                    className={cn("grid h-8 w-8 place-items-center rounded-lg border",
                      draft.icon === k ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-3 hover:bg-bg-tint")}>
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
            <input aria-label="Название дисциплины" value={draft.label} onChange={(e) => setMeta({ label: e.target.value })}
              className="min-w-[160px] flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand" />
            <input aria-label="Описание дисциплины" value={draft.description} onChange={(e) => setMeta({ description: e.target.value })}
              placeholder="Описание" className="min-w-[200px] flex-[2] rounded-md border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <SegControl
          options={editing
            ? [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }]
            : [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={tab === "bands" && editing ? "matrix" : tab}
          onChange={(v) => setTab(v as Tab)} />
      </div>

      {editing && draft ? (
        tab === "levels" ? (
          <LevelsEditor levels={draft.levels} onChange={setLevel} />
        ) : (
          <MatrixEditor
            blocks={draft.blocks} levels={draft.levels}
            onRename={renameBlock} onMove={moveBlock} onDelete={deleteBlock} onAdd={addBlock}
            onOpenCell={(blockIdx, levelOrd) => setOpenCell({ blockIdx, levelOrd })} />
        )
      ) : tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}

      {editing && draft && openCell && (() => {
        const block = draft.blocks[openCell.blockIdx];
        const lvl = draft.levels.find((l) => l.ord === openCell.levelOrd)!;
        const cell = block.cells.find((c) => c.level === openCell.levelOrd)!;
        return (
          <CellEditor
            blockName={block.name} levelCode={lvl.code} levelName={lvl.name} initial={cell.text}
            onApply={(c) => applyCell(openCell.blockIdx, openCell.levelOrd, c)}
            onClose={() => setOpenCell(null)} />
        );
      })()}

      {editing && newDisc && (
        <NewDisciplineModal
          bases={disciplines.map((d) => ({ id: d.id, label: d.label }))}
          creating={createDiscipline.isPending}
          onClose={() => setNewDisc(false)}
          onCreate={async (b) => {
            try {
              const created = await createDiscipline.mutateAsync(b);
              setNewDisc(false);
              setDraft(null);            // leave edit mode; the new discipline is now in the framework
              setDisc(created.key);      // switch to it
            } catch {
              setError("Не удалось создать дисциплину.");
            }
          }} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the unit suite — expect PASS** (the gating test + everything else):

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm vitest run && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app components
git commit -m "feat(web): grades edit mode — draft, save/cancel, gating (slice #5b-i)"
```

---

### Task 11: e2e + full verification

**Files:**
- Create: `web/e2e/grades-editor.spec.ts`

- [ ] **Step 1: Re-seed dev DB + ensure API running**

```bash
cd /Users/lebedev.v/projects/beeteam
pkill -f "target/debug/bt-api" || true
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api
```

- [ ] **Step 2: Write `web/e2e/grades-editor.spec.ts`** — isolated: create a NEW discipline, edit ITS matrix, save; never touch the 5 seeded disciplines, the global levels, or delete shared blocks:

```ts
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead does not see the edit button on /grades", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto("/grades");
  await expect(page.getByText("Карта компетенций по дисциплинам")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(0);
});

test("HR creates a discipline and edits its matrix", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Редактировать" }).click();
  await expect(page.getByText("режим редактирования")).toBeVisible();

  // New discipline copying Backend's structure.
  await page.getByRole("button", { name: /Новая дисциплина/ }).click();
  await page.getByLabel("Название дисциплины").fill("Дизайн e2e");
  await page.getByRole("button", { name: "Создать" }).click();

  // After create, the client switches to the new discipline in read mode. Re-enter edit.
  await expect(page.getByText("Дизайн e2e")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Редактировать" }).click();
  await expect(page.getByText("режим редактирования")).toBeVisible();

  // Add a block, name it, then save.
  await page.getByRole("button", { name: /Добавить блок/ }).click();
  await page.getByLabel("Имя блока").last().fill("Композиция");
  await page.getByRole("button", { name: "Сохранить" }).click();

  // After save: reload and confirm the block persisted on the new discipline.
  await expect(page.getByText("режим редактирования")).toHaveCount(0, { timeout: 10_000 });
  await page.reload();
  await page.getByRole("button", { name: /Дизайн e2e/ }).click();
  await expect(page.getByText("Композиция")).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: Run the spec**

```bash
cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e e2e/grades-editor.spec.ts
```

Expected: 2 passed. Debug locator issues via test-results/ artifacts; fix TEST locators to the real UI (report any app-code change). The spec accumulates a discipline per run; re-seed before re-running.

- [ ] **Step 4: Full verification** (re-seed first):

```bash
cd /Users/lebedev.v/projects/beeteam
pkill -f "target/debug/bt-api" || true
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
cd api && cargo run -p bt-api &
sleep 20
api/scripts/test.sh 2>&1 | grep -E "test result"
cd web && pnpm vitest run 2>&1 | tail -3 && npx tsc --noEmit && pnpm test:e2e 2>&1 | tail -6
```

Expected: API suites green; vitest green; tsc clean; ALL e2e specs pass (auth, teamlist, profile, meeting-drawer, goals, files, calendar, grades, member-grade, grade-evidence, review, approvals, grades-editor).

- [ ] **Step 5: Commit**

```bash
git add e2e/grades-editor.spec.ts
git commit -m "test(e2e): framework editor — create discipline + edit matrix (slice #5b-i)"
```

---

### Task 12: Local review gate

Re-seed once more, bring everything up (`docker compose up -d`, `cargo run -p bt-api`, `pnpm dev`) and hand off for visual review: HR login `o.klimova@beeteam.io` / `demo1234` → «Грейды» → «Редактировать» (matrix cells, blocks, levels tab, new discipline). **Wait for the user's merge command** — no merge, no push.
