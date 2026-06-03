# BeeTeam MeetingDrawer Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-lifecycle MeetingDrawer (create / conduct-with-autosave / complete / reschedule / cancel) backed by the first mutating API endpoints, wiring up the read-only profile's meeting-action stubs.

**Architecture:** New mutating endpoints (`POST/PATCH/complete/DELETE /meetings`, `GET /templates/:id`) guarded by the existing `require_member_access`, returning the existing `MeetingDetail` (extended with `template_id`) via a shared `load_meeting_detail` helper; request DTOs validated with the `validator` crate. Frontend: a `zustand` store holds the open meeting id, a `MeetingDrawer` (mounted once in `(app)/layout`) seeds a local `useReducer` form from `useMeeting`, renders fields from the team's template via `FieldControl`, and debounce-autosaves through a `PATCH` mutation; the profile's stub buttons call create/complete/delete and open the drawer.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa, **validator** — new), Postgres; Next.js 14 App Router, TypeScript, TanStack Query (mutations), **zustand** (new), Tailwind tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-03-beeteam-meetingdrawer-design.md`

---

## Conventions (read once)

- Backend crates: seed `api/crates/bt-db/src/seed.rs`; DTOs `api/crates/bt-domain/src/lib.rs`; handlers `api/crates/bt-api/src/routes/`; router `api/crates/bt-api/src/app.rs`; OpenAPI `api/crates/bt-api/src/openapi.rs`. Errors: `AppError::{Forbidden→403, NotFound→404, BadRequest(String)→400, Conflict→409 (ADD in Task 2), Db}`, `AppResult<T>`. Auth extractor `AuthUser{id,role}`; ownership guard `require_member_access(&auth, member_id, &pool)` in `routes/members.rs`.
- sqlx: runtime `sqlx::query_as::<_, (tuple)>` with `$n` binds; enums read with `::text`, bound with `$n::enum`. POST/PATCH bodies via axum `Json<T>` extractor (see `routes/auth.rs::login`).
- Backend tests: `#[sqlx::test(migrations = "../bt-db/migrations")]`, drive `app(pool)` via `tower::ServiceExt::oneshot`; run `api/scripts/test.sh -p bt-api` (forces :5433 test DB; `docker compose up -d postgres-test` if needed).
- Frontend: components `web/components/*.tsx`; route files under `web/app/(app)/profile/[id]/`; query/mutation hooks `web/lib/query/*.ts`; openapi-fetch client `web/lib/api/client.ts` (`api.GET/POST/PATCH/DELETE`); generated types `web/lib/api/schema.d.ts` via `pnpm gen:api` (needs API on :8080). Tokens: `bg-brand`/`brand-text` (NEVER `accent`), `bg-bg-elev`, `border-line`, `text-ink/ink-2/ink-3`, `tabular`. `cn()` from `@/lib/utils`. Tests `web/components/__tests__/*.test.tsx` + route-folder colocated tests; run `cd web && pnpm test`.
- Dev DB is on host port **5442** (container 5432); no host `psql` — use `docker compose exec -T postgres psql -U beeteam -d beeteam`. Re-seed after seed changes: `TRUNCATE workspaces CASCADE` + restart API.
- The API is currently running on :8080 from the previous session; restart it after backend changes you want to see in the browser / before `pnpm gen:api`.

---

## File Structure

**Backend:**
- Modify `api/crates/bt-db/src/seed.rs` — realign «Базовый» to 7 field_defs; update seed test count.
- Modify `api/Cargo.toml` (workspace deps) + `api/crates/bt-domain/Cargo.toml` + `api/crates/bt-api/Cargo.toml` — add `validator`.
- Modify `api/crates/bt-domain/src/lib.rs` — `CreateMeetingRequest`, `UpdateMeetingRequest`, `TemplateDetail`, `FieldDef`; add `template_id` to `MeetingDetail`.
- Modify `api/crates/bt-api/src/error.rs` — add `AppError::Conflict` → 409.
- Modify `api/crates/bt-api/src/routes/meetings.rs` — `load_meeting_detail` helper; refactor `get_meeting`; add `create_meeting`, `update_meeting`, `complete_meeting`, `delete_meeting`.
- Create `api/crates/bt-api/src/routes/templates.rs` — `get_template`.
- Modify `api/crates/bt-api/src/routes/mod.rs`, `app.rs`, `openapi.rs`.

**Frontend:**
- Create `web/lib/store/drawer.ts` — zustand store.
- Create `web/lib/query/meetings.ts` — `useTemplate`, `useCreateMeeting`, `useMeetingAutosave`, `useCompleteMeeting`, `useDeleteMeeting`.
- Create `web/lib/meeting-form.ts` — `MeetingForm` type, `formFromMeeting`, `formToPatch`, `meetingFormReducer`.
- Create `web/components/MoodPicker.tsx`, `web/components/FieldControl.tsx`, `web/components/MeetingDrawer.tsx`, `web/components/MeetingDrawerHost.tsx`, `web/components/ProfileActions.tsx`.
- Modify `web/app/(app)/layout.tsx` (mount host), `web/components/MeetingDetailCard.tsx` (wire buttons + «Редактировать»), `web/components/ProfileHeader.tsx` (use ProfileActions).
- Tests in `web/components/__tests__/` + `web/lib/__tests__/`; `web/e2e/meeting-drawer.spec.ts`.

---

# Phase A — Backend

### Task 1: Realign the seed template to 7 fields

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs` (the `base_fields` array near line 51, and the seed test near line 364)

- [ ] **Step 1: Update the failing seed test first**

In `seed.rs`'s `#[cfg(test)] mod tests`, the test `seed_is_idempotent_and_loads_team` asserts the field count. Change the assertion from `6` to `7`. Find:

```rust
        assert_eq!(fields.0, 6);
```
Replace with:
```rust
        assert_eq!(fields.0, 7);
```

- [ ] **Step 2: Run it → expect FAIL**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db seed_is_idempotent_and_loads_team`
Expected: FAIL — seed still inserts 6 fields, assertion wants 7.

- [ ] **Step 3: Realign the `base_fields` array**

Replace the existing `base_fields` array + insert loop (the `[(&str,&str,&str); 6]` block) with this 7-field version aligned 1:1 to the `meetings` columns:

```rust
    // 1:1 with the typed `meetings` columns (MeetingDrawer maps title→column).
    let base_fields: [(&str, &str, &str); 7] = [
        ("mood", "Настроение", ""),
        ("longtext", "Блокеры", "Что мешает в работе?"),
        ("longtext", "Цели", "Над чем работаем?"),
        ("longtext", "Фидбек сотруднику", "Что хочется отметить и улучшить"),
        ("longtext", "Фидбек от сотрудника", "Что говорит сотрудник"),
        ("longtext", "Развитие", "По пункту на строку"),
        ("longtext", "Отношения", "Как в команде?"),
    ];
    for (i, (ty, title, ph)) in base_fields.iter().enumerate() {
        sqlx::query(
            "INSERT INTO field_defs (template_id, ord, type, title, placeholder) \
             VALUES ($1, $2, $3::field_type, $4, $5)",
        )
        .bind(tpl_id)
        .bind(i as i32)
        .bind(*ty)
        .bind(*title)
        .bind(opt(*ph))
        .execute(&mut *tx)
        .await?;
    }
```

- [ ] **Step 4: Run all bt-db tests → expect PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db`
Expected: PASS (seed idempotent test now sees 7 fields; other seed tests unaffected).

- [ ] **Step 5: Re-seed the dev DB**

Run: `cd /Users/lebedev.v/projects/beeteam && docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE;"`
Then restart the API (it re-runs migrations + `seed_demo` on boot). Verify: `docker compose exec -T postgres psql -U beeteam -d beeteam -c "SELECT count(*) FROM field_defs;"` → 7.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/src/seed.rs
git commit -m "feat(db): realign Базовый template to 7 fields (1:1 with meeting columns)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add `validator`, the `Conflict` error, and request/response DTOs

**Files:**
- Modify: `api/Cargo.toml`, `api/crates/bt-domain/Cargo.toml`
- Modify: `api/crates/bt-api/src/error.rs`
- Modify: `api/crates/bt-domain/src/lib.rs`

- [ ] **Step 1: Add `validator` to workspace + bt-domain**

In `api/Cargo.toml` under `[workspace.dependencies]`, add:
```toml
validator = { version = "0.18", features = ["derive"] }
```
In `api/crates/bt-domain/Cargo.toml` under `[dependencies]`, add:
```toml
validator = { workspace = true }
```

- [ ] **Step 2: Add `AppError::Conflict`**

In `api/crates/bt-api/src/error.rs`, add a variant to the enum:
```rust
    #[error("conflict: {0}")]
    Conflict(String),
```
and in the `IntoResponse` match add:
```rust
            AppError::Conflict(_) => (StatusCode::CONFLICT, self.to_string()),
```
(Place it next to `BadRequest`. `StatusCode` is already imported.)

- [ ] **Step 3: Add DTOs to `bt-domain/src/lib.rs`**

Append the request DTOs (with `Validate`) and template DTOs, and extend `MeetingDetail`. First, add the import at the top (next to the existing serde/utoipa imports):
```rust
use validator::Validate;
```
Then add `pub template_id: Option<uuid::Uuid>,` as the LAST field of the existing `MeetingDetail` struct:
```rust
    pub relationships: Option<String>,
    pub template_id: Option<uuid::Uuid>,
}
```
Then append:
```rust
/// Create a new (planned) 1-2-1 for a member.
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateMeetingRequest {
    pub member_id: uuid::Uuid,
    /// Defaults to now() when omitted.
    pub date: Option<chrono::DateTime<chrono::Utc>>,
}

/// Autosave patch — every field optional; provided fields are written.
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct UpdateMeetingRequest {
    pub date: Option<chrono::DateTime<chrono::Utc>>,
    #[validate(range(min = 1, message = "duration_min must be positive"))]
    pub duration_min: Option<i32>,
    pub mood: Option<String>,
    #[validate(range(min = 1, max = 10, message = "mood_score must be 1..10"))]
    pub mood_score: Option<i32>,
    pub blockers: Option<String>,
    pub goals: Option<String>,
    pub feedback_to: Option<String>,
    pub feedback_from: Option<String>,
    pub development: Option<Vec<String>>,
    pub relationships: Option<String>,
}

/// A meeting form field definition (from a template), for rendering the drawer.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FieldDef {
    pub id: uuid::Uuid,
    pub ord: i32,
    pub kind: String, // field_defs.type cast ::text
    pub title: String,
    pub required: bool,
    pub placeholder: Option<String>,
    pub hint: Option<String>,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TemplateDetail {
    pub id: uuid::Uuid,
    pub name: String,
    pub fields: Vec<FieldDef>,
}
```

- [ ] **Step 4: Build the domain crate**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: clean build (validator resolves; DTOs compile).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/Cargo.toml api/crates/bt-domain/Cargo.toml api/crates/bt-api/src/error.rs api/crates/bt-domain/src/lib.rs
git commit -m "feat(domain): meeting request DTOs + validator; template DTOs; Conflict error; MeetingDetail.template_id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `load_meeting_detail` helper + refactor `get_meeting` (adds `template_id`)

**Files:**
- Modify: `api/crates/bt-api/src/routes/meetings.rs`

- [ ] **Step 1: Add the shared loader + refactor `get_meeting`**

Replace the body SELECT in `meetings.rs` with a reusable helper that also resolves the team's `default_template_id`. Add this `pub(crate)` helper and rewrite `get_meeting` to use it:

```rust
use bt_domain::MeetingDetail;
use sqlx::PgPool;

/// Load a meeting plus its member's team default template id. None if no such meeting.
pub(crate) async fn load_meeting_detail(
    pool: &PgPool,
    meeting_id: Uuid,
) -> AppResult<Option<MeetingDetail>> {
    let r: Option<(
        uuid::Uuid, uuid::Uuid, chrono::DateTime<chrono::Utc>, String, i32,
        Option<String>, Option<i32>, Option<String>, Option<String>,
        Option<String>, Option<String>, Vec<String>, Option<String>, Option<uuid::Uuid>,
    )> = sqlx::query_as(
        "SELECT m.id, m.member_id, m.date, m.state::text, m.duration_min, m.mood, m.mood_score, \
                m.blockers, m.goals, m.feedback_to, m.feedback_from, m.development, m.relationships, \
                t.default_template_id \
         FROM meetings m \
         JOIN team_members tm ON tm.id = m.member_id \
         JOIN teams t ON t.id = tm.team_id \
         WHERE m.id = $1",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|r| MeetingDetail {
        id: r.0, member_id: r.1, date: r.2, state: r.3, duration_min: r.4,
        mood: r.5, mood_score: r.6, blockers: r.7, goals: r.8,
        feedback_to: r.9, feedback_from: r.10, development: r.11, relationships: r.12,
        template_id: r.13,
    }))
}
```

Then rewrite `get_meeting` to reuse it (keep the `#[utoipa::path]` attribute as-is):

```rust
pub async fn get_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    let detail = load_meeting_detail(&state.pool, meeting_id).await?;
    let detail = detail.ok_or(AppError::NotFound)?;
    require_member_access(&auth, detail.member_id, &state.pool).await?;
    Ok(Json(detail))
}
```

- [ ] **Step 2: Build + run existing meeting tests**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api meeting`
Expected: the slice-4 tests (`meeting_detail_returns_all_note_fields`, `meeting_detail_foreign_member_is_forbidden`) still PASS. The response now includes `template_id` (the seeded test data has a team without `default_template_id` set unless seeded — those tests seed via `seed_two_teams`/`seed_meeting`; `template_id` will be null there, which is fine — assertions don't check it).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/meetings.rs
git commit -m "refactor(api): load_meeting_detail helper; MeetingDetail carries template_id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `POST /meetings` + `PATCH /meetings/:id`

**Files:**
- Modify: `api/crates/bt-api/src/routes/meetings.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs` (register routes)

- [ ] **Step 1: Add the handlers**

Add to `meetings.rs` (extend the `use` lines: `use bt_domain::{MeetingDetail, CreateMeetingRequest, UpdateMeetingRequest};`, `use validator::Validate;`, and `use axum::http::StatusCode;`):

```rust
#[utoipa::path(
    post,
    path = "/v1/meetings",
    request_body = CreateMeetingRequest,
    responses(
        (status = 201, description = "Created planned meeting", body = MeetingDetail),
        (status = 403, description = "Member not on the caller's team"),
    )
)]
pub async fn create_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateMeetingRequest>,
) -> AppResult<(StatusCode, Json<MeetingDetail>)> {
    require_member_access(&auth, body.member_id, &state.pool).await?;

    // workspace_id is derived from the member so the caller can't spoof it.
    let row: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
         SELECT tm.workspace_id, tm.id, COALESCE($2, now()), 'planned'::meeting_state, 45 \
         FROM team_members tm WHERE tm.id = $1 RETURNING id",
    )
    .bind(body.member_id)
    .bind(body.date)
    .fetch_one(&state.pool)
    .await?;

    let detail = load_meeting_detail(&state.pool, row.0).await?.ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(detail)))
}

#[utoipa::path(
    patch,
    path = "/v1/meetings/{id}",
    request_body = UpdateMeetingRequest,
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Updated meeting", body = MeetingDetail),
        (status = 400, description = "Invalid payload"),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
    )
)]
pub async fn update_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
    Json(body): Json<UpdateMeetingRequest>,
) -> AppResult<Json<MeetingDetail>> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;

    // COALESCE keeps the existing column when the field is omitted (None binds SQL NULL).
    sqlx::query(
        "UPDATE meetings SET \
           date          = COALESCE($2, date), \
           duration_min  = COALESCE($3, duration_min), \
           mood          = COALESCE($4, mood), \
           mood_score    = COALESCE($5, mood_score), \
           blockers      = COALESCE($6, blockers), \
           goals         = COALESCE($7, goals), \
           feedback_to   = COALESCE($8, feedback_to), \
           feedback_from = COALESCE($9, feedback_from), \
           development   = COALESCE($10, development), \
           relationships = COALESCE($11, relationships), \
           updated_at    = now() \
         WHERE id = $1",
    )
    .bind(meeting_id)
    .bind(body.date)
    .bind(body.duration_min)
    .bind(body.mood)
    .bind(body.mood_score)
    .bind(body.blockers)
    .bind(body.goals)
    .bind(body.feedback_to)
    .bind(body.feedback_from)
    .bind(body.development.as_deref())
    .bind(body.relationships)
    .execute(&state.pool)
    .await?;

    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}
```

> Note on clearing fields: `COALESCE($n, col)` means a `None` keeps the old value. To clear a text field the client sends an empty string `""` (not omitted) — that writes `""`. This matches the drawer, which always sends the current textarea value (possibly empty) for edited fields.

- [ ] **Step 2: Register the routes**

In `api/crates/bt-api/src/app.rs`, add to the `protected` router (next to `/v1/meetings/:id`):
```rust
        .route("/v1/meetings", axum::routing::post(routes::meetings::create_meeting))
        .route("/v1/meetings/:id", get(routes::meetings::get_meeting)
            .patch(routes::meetings::update_meeting))
```
(Replace the existing single `.route("/v1/meetings/:id", get(...))` line with the chained `get(...).patch(...)` form.)

- [ ] **Step 3: Add tests**

Add a `#[cfg(test)] mod tests` to `meetings.rs` with compact helpers (these mirror the proven shape in `members.rs`; meetings.rs needs its own copy):

```rust
#[cfg(test)]
mod tests {
    use crate::app::app;
    use crate::auth::password::hash_password;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Seeds a workspace, a lead, a team (with the Базовый template as default), and Anna.
    /// Returns (token, anna_id, template_id).
    async fn seed(pool: &sqlx::PgPool) -> (String, uuid::Uuid, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let tpl: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO field_templates (workspace_id, name, system) VALUES ($1,'Базовый',true) RETURNING id",
        ).bind(ws.0).fetch_one(pool).await.unwrap();
        sqlx::query("INSERT INTO field_defs (template_id, ord, type, title) VALUES ($1,0,'mood'::field_type,'Настроение')")
            .bind(tpl.0).execute(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'a@x.io',$2,'Lead','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_template_id, default_cadence, visibility) \
             VALUES ($1,'team',$2,$3,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).bind(tpl.0).fetch_one(pool).await.unwrap();
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Анна','Frontend','anna@x.io','2023','Europe/Moscow','{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "a@x.io").await, anna.0, tpl.0)
    }

    /// Seeds a second lead+team+member (foreign to `seed`'s caller). Returns (token, member_id).
    async fn seed_foreign(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('F') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'b@x.io',$2,'Lead2','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'team2',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let bob: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Боб','BE','bob@x.io','2023','Europe/Moscow','{5,5,5}','ok'::member_status,'{}',10,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "b@x.io").await, bob.0)
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

    async fn req(pool: sqlx::PgPool, method: &str, uri: &str, token: &str, body: Option<serde_json::Value>)
        -> (StatusCode, serde_json::Value)
    {
        let mut b = Request::builder().method(method).uri(uri)
            .header("authorization", format!("Bearer {token}"));
        let body = match body {
            Some(j) => { b = b.header("content-type", "application/json"); Body::from(j.to_string()) }
            None => Body::empty(),
        };
        let resp = app(pool).oneshot(b.body(body).unwrap()).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_makes_planned_meeting_with_template(pool: sqlx::PgPool) {
        let (token, anna, tpl) = seed(&pool).await;
        let (status, json) = req(pool, "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json["state"], "planned");
        assert_eq!(json["template_id"], tpl.to_string());
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_foreign_member_is_forbidden(pool: sqlx::PgPool) {
        let (token, _anna, _tpl) = seed(&pool).await;
        let (foreign_token, bob) = seed_foreign(&pool).await;
        let _ = foreign_token;
        let (status, _) = req(pool, "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": bob}))).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_writes_typed_columns(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap();
        let (status, json) = req(pool, "PATCH", &format!("/v1/meetings/{id}"), &token,
            Some(serde_json::json!({
                "blockers": "Флака", "mood_score": 8,
                "development": ["Курс","Книга"]
            }))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["blockers"], "Флака");
        assert_eq!(json["mood_score"], 8);
        assert_eq!(json["development"][1], "Книга");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_rejects_bad_mood_score(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap();
        let (status, _) = req(pool, "PATCH", &format!("/v1/meetings/{id}"), &token,
            Some(serde_json::json!({"mood_score": 99}))).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}
```

- [ ] **Step 4: Run tests → expect PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: the 4 new tests + all prior tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/meetings.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): POST /v1/meetings + PATCH /v1/meetings/:id (autosave)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `POST /meetings/:id/complete` + `DELETE /meetings/:id`

**Files:**
- Modify: `api/crates/bt-api/src/routes/meetings.rs`, `app.rs`

- [ ] **Step 1: Add the handlers**

```rust
#[utoipa::path(
    post,
    path = "/v1/meetings/{id}/complete",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Completed meeting", body = MeetingDetail),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
        (status = 409, description = "Meeting is not planned"),
    )
)]
pub async fn complete_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;
    if existing.state != "planned" {
        return Err(AppError::Conflict("meeting is not planned".into()));
    }
    sqlx::query("UPDATE meetings SET state = 'done'::meeting_state, updated_at = now() WHERE id = $1")
        .bind(meeting_id)
        .execute(&state.pool)
        .await?;
    let detail = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}

#[utoipa::path(
    delete,
    path = "/v1/meetings/{id}",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
        (status = 409, description = "Cannot delete a completed meeting"),
    )
)]
pub async fn delete_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing = load_meeting_detail(&state.pool, meeting_id).await?.ok_or(AppError::NotFound)?;
    require_member_access(&auth, existing.member_id, &state.pool).await?;
    if existing.state == "done" {
        return Err(AppError::Conflict("cannot delete a completed meeting".into()));
    }
    sqlx::query("DELETE FROM meetings WHERE id = $1")
        .bind(meeting_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: Register routes**

In `app.rs`, extend the meetings route chain to:
```rust
        .route("/v1/meetings/:id", get(routes::meetings::get_meeting)
            .patch(routes::meetings::update_meeting)
            .delete(routes::meetings::delete_meeting))
        .route("/v1/meetings/:id/complete", axum::routing::post(routes::meetings::complete_meeting))
```

- [ ] **Step 3: Add tests** (append to the `mod tests` in meetings.rs)

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn complete_transitions_then_conflicts(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap().to_string();
        let (s1, j1) = req(pool.clone(), "POST", &format!("/v1/meetings/{id}/complete"), &token, None).await;
        assert_eq!(s1, StatusCode::OK);
        assert_eq!(j1["state"], "done");
        let (s2, _) = req(pool, "POST", &format!("/v1/meetings/{id}/complete"), &token, None).await;
        assert_eq!(s2, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_planned_then_gone_and_done_conflicts(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        // planned → delete → 204 → 404
        let (_, m1) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id1 = m1["id"].as_str().unwrap().to_string();
        let (sd, _) = req(pool.clone(), "DELETE", &format!("/v1/meetings/{id1}"), &token, None).await;
        assert_eq!(sd, StatusCode::NO_CONTENT);
        let (sg, _) = req(pool.clone(), "GET", &format!("/v1/meetings/{id1}"), &token, None).await;
        assert_eq!(sg, StatusCode::NOT_FOUND);
        // done → delete → 409
        let (_, m2) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id2 = m2["id"].as_str().unwrap().to_string();
        req(pool.clone(), "POST", &format!("/v1/meetings/{id2}/complete"), &token, None).await;
        let (s409, _) = req(pool, "DELETE", &format!("/v1/meetings/{id2}"), &token, None).await;
        assert_eq!(s409, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn mutations_foreign_member_forbidden(pool: sqlx::PgPool) {
        let (token, anna, _tpl) = seed(&pool).await;
        let (foreign_token, _bob) = seed_foreign(&pool).await;
        let (_, created) = req(pool.clone(), "POST", "/v1/meetings", &token,
            Some(serde_json::json!({"member_id": anna}))).await;
        let id = created["id"].as_str().unwrap().to_string();
        let (s1, _) = req(pool.clone(), "PATCH", &format!("/v1/meetings/{id}"), &foreign_token,
            Some(serde_json::json!({"blockers":"x"}))).await;
        let (s2, _) = req(pool.clone(), "POST", &format!("/v1/meetings/{id}/complete"), &foreign_token, None).await;
        let (s3, _) = req(pool, "DELETE", &format!("/v1/meetings/{id}"), &foreign_token, None).await;
        assert_eq!(s1, StatusCode::FORBIDDEN);
        assert_eq!(s2, StatusCode::FORBIDDEN);
        assert_eq!(s3, StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 4: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/meetings.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): POST /v1/meetings/:id/complete + DELETE /v1/meetings/:id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `GET /templates/:id`

**Files:**
- Create: `api/crates/bt-api/src/routes/templates.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`

- [ ] **Step 1: Create the handler**

`api/crates/bt-api/src/routes/templates.rs`:

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::{FieldDef, TemplateDetail};
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/v1/templates/{id}",
    params(("id" = uuid::Uuid, Path, description = "Template id")),
    responses(
        (status = 200, description = "Template with ordered field defs", body = TemplateDetail),
        (status = 404, description = "No such template"),
    )
)]
pub async fn get_template(
    State(state): State<AppState>,
    axum::Extension(_auth): axum::Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
) -> AppResult<Json<TemplateDetail>> {
    let tpl: Option<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT id, name FROM field_templates WHERE id = $1")
            .bind(template_id)
            .fetch_optional(&state.pool)
            .await?;
    let (id, name) = tpl.ok_or(AppError::NotFound)?;

    let fields: Vec<FieldDef> = sqlx::query_as::<_, (
        uuid::Uuid, i32, String, String, bool, Option<String>, Option<String>, Vec<String>,
    )>(
        "SELECT id, ord, type::text, title, required, placeholder, hint, options \
         FROM field_defs WHERE template_id = $1 ORDER BY ord",
    )
    .bind(template_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| FieldDef {
        id: r.0, ord: r.1, kind: r.2, title: r.3, required: r.4,
        placeholder: r.5, hint: r.6, options: r.7,
    })
    .collect();

    Ok(Json(TemplateDetail { id, name, fields }))
}
```

> Access note: templates are workspace-level form definitions, not member data; any authenticated lead may read one (consistent with the spec's read-only template access). No per-member guard.

- [ ] **Step 2: Wire module + route**

In `routes/mod.rs` add `pub mod templates;`. In `app.rs` `protected` router add:
```rust
        .route("/v1/templates/:id", get(routes::templates::get_template))
```

- [ ] **Step 3: Add a test** (append to meetings.rs `mod tests`, reusing `seed`)

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn template_returns_ordered_fields(pool: sqlx::PgPool) {
        let (token, _anna, tpl) = seed(&pool).await;
        let (status, json) = req(pool, "GET", &format!("/v1/templates/{tpl}"), &token, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["name"], "Базовый");
        assert_eq!(json["fields"][0]["kind"], "mood");
        assert_eq!(json["fields"][0]["title"], "Настроение");
    }
```

- [ ] **Step 4: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/templates.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/templates/:id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: OpenAPI registration + regenerate TS types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`, `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Register paths + schemas**

In `openapi.rs` add to `paths(...)`:
```rust
        crate::routes::meetings::create_meeting,
        crate::routes::meetings::update_meeting,
        crate::routes::meetings::complete_meeting,
        crate::routes::meetings::delete_meeting,
        crate::routes::templates::get_template,
```
and to `components(schemas(...))`:
```rust
        bt_domain::CreateMeetingRequest,
        bt_domain::UpdateMeetingRequest,
        bt_domain::FieldDef,
        bt_domain::TemplateDetail,
```

- [ ] **Step 2: Build + boot API + verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Restart the API (so :8080 serves the new doc), then:
Run: `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/meetings/{id}/complete"'`
Expected: prints `"/v1/meetings/{id}/complete"`.

- [ ] **Step 3: Regenerate types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Then: `grep -c "CreateMeetingRequest\|UpdateMeetingRequest\|TemplateDetail\|FieldDef" lib/api/schema.d.ts` → non-zero. Confirm `MeetingDetail` now has `template_id`.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register meeting mutations + template in OpenAPI; regen web types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — Frontend

### Task 8: zustand store + meeting form transforms + mutation hooks

**Files:**
- Create: `web/lib/store/drawer.ts`, `web/lib/meeting-form.ts`, `web/lib/query/meetings.ts`
- Test: `web/lib/__tests__/meeting-form.test.ts`
- Modify: `web/package.json` (add zustand)

- [ ] **Step 1: Install zustand**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm add zustand`
Expected: zustand added to dependencies.

- [ ] **Step 2: Write the failing transform test**

`web/lib/__tests__/meeting-form.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formFromMeeting, formToPatch, meetingFormReducer, toLocalInput, fromLocalInput } from "@/lib/meeting-form";
import type { MeetingDetail } from "@/lib/query/profile";

const M: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "planned",
  duration_min: 45, mood: "🙂", mood_score: 7,
  blockers: "B", goals: null, feedback_to: null, feedback_from: null,
  development: ["a", "b"], relationships: null, template_id: "t1",
};

describe("meeting-form", () => {
  it("formFromMeeting joins development with newlines", () => {
    const f = formFromMeeting(M);
    expect(f.development).toBe("a\nb");
    expect(f.mood_score).toBe(7);
    expect(f.blockers).toBe("B");
  });

  it("formToPatch splits development into a trimmed array, dropping blank lines", () => {
    const f = { ...formFromMeeting(M), development: "x\n\n y \n" };
    const patch = formToPatch(f);
    expect(patch.development).toEqual(["x", "y"]);
  });

  it("reducer sets a field immutably", () => {
    const f = formFromMeeting(M);
    const next = meetingFormReducer(f, { type: "set", field: "blockers", value: "Z" });
    expect(next.blockers).toBe("Z");
    expect(f.blockers).toBe("B");
  });

  it("date round-trips through the datetime-local helpers", () => {
    const iso = "2026-05-25T09:00:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
});
```

- [ ] **Step 3: Run → FAIL.** `cd web && pnpm test meeting-form`

- [ ] **Step 4: Implement `web/lib/meeting-form.ts`**

```typescript
import type { MeetingDetail } from "@/lib/query/profile";
import type { components } from "@/lib/api/schema";

export type UpdateMeetingRequest = components["schemas"]["UpdateMeetingRequest"];

/** Editable form state — development is a newline-joined textarea string; date is ISO. */
export type MeetingForm = {
  date: string; // ISO string
  duration_min: number;
  mood: string;
  mood_score: number | null;
  blockers: string;
  goals: string;
  feedback_to: string;
  feedback_from: string;
  development: string;
  relationships: string;
};

export function formFromMeeting(m: MeetingDetail): MeetingForm {
  return {
    date: m.date,
    duration_min: m.duration_min,
    mood: m.mood ?? "",
    mood_score: m.mood_score ?? null,
    blockers: m.blockers ?? "",
    goals: m.goals ?? "",
    feedback_to: m.feedback_to ?? "",
    feedback_from: m.feedback_from ?? "",
    development: (m.development ?? []).join("\n"),
    relationships: m.relationships ?? "",
  };
}

export function formToPatch(f: MeetingForm): UpdateMeetingRequest {
  return {
    date: f.date,
    duration_min: f.duration_min,
    mood: f.mood,
    mood_score: f.mood_score ?? undefined,
    blockers: f.blockers,
    goals: f.goals,
    feedback_to: f.feedback_to,
    feedback_from: f.feedback_from,
    development: f.development.split("\n").map((s) => s.trim()).filter(Boolean),
    relationships: f.relationships,
  };
}

/** ISO ↔ <input type="datetime-local"> (local "YYYY-MM-DDTHH:mm") conversions. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

export type MeetingFormAction =
  | { type: "set"; field: keyof MeetingForm; value: string | number | null }
  | { type: "reset"; form: MeetingForm };

export function meetingFormReducer(state: MeetingForm, action: MeetingFormAction): MeetingForm {
  switch (action.type) {
    case "set":
      return { ...state, [action.field]: action.value };
    case "reset":
      return action.form;
  }
}
```

- [ ] **Step 5: Run → PASS.** `cd web && pnpm test meeting-form`

- [ ] **Step 6: Create the zustand store `web/lib/store/drawer.ts`**

```typescript
import { create } from "zustand";

type DrawerState = {
  openMeetingId: string | null;
  open: (id: string) => void;
  close: () => void;
};

export const useDrawerStore = create<DrawerState>((set) => ({
  openMeetingId: null,
  open: (id) => set({ openMeetingId: id }),
  close: () => set({ openMeetingId: null }),
}));
```

- [ ] **Step 7: Create the mutation/query hooks `web/lib/query/meetings.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { UpdateMeetingRequest } from "@/lib/meeting-form";

export type TemplateDetail = components["schemas"]["TemplateDetail"];
export type FieldDef = components["schemas"]["FieldDef"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];

export function useTemplate(id: string | null | undefined) {
  return useQuery<TemplateDetail>({
    queryKey: ["template", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/templates/{id}", { params: { path: { id: id! } } });
      if (error) throw error;
      return data!;
    },
  });
}

/** Invalidate everything that reflects a member's meetings. */
function useInvalidateMeetings() {
  const qc = useQueryClient();
  return useCallback(
    (memberId: string, meetingId?: string) => {
      qc.invalidateQueries({ queryKey: ["member-meetings", memberId] });
      qc.invalidateQueries({ queryKey: ["member", memberId] });
      if (meetingId) qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
    },
    [qc],
  );
}

export function useCreateMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await api.POST("/v1/meetings", { body: { member_id: memberId } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (m) => invalidate(m.member_id, m.id),
  });
}

export function useCompleteMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST("/v1/meetings/{id}/complete", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (m) => invalidate(m.member_id, m.id),
  });
}

export function useDeleteMeeting() {
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: async (vars: { id: string; memberId: string }) => {
      const { error } = await api.DELETE("/v1/meetings/{id}", { params: { path: { id: vars.id } } });
      if (error) throw error;
      return vars;
    },
    onSuccess: (vars) => invalidate(vars.memberId, vars.id),
  });
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave PATCH. `schedule(patch)` coalesces rapid edits into one
 * request after `delay` ms; `flush()` sends any pending patch immediately.
 */
export function useMeetingAutosave(meetingId: string, memberId: string, delay = 800) {
  const invalidate = useInvalidateMeetings();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<UpdateMeetingRequest | null>(null);

  const mutation = useMutation({
    mutationFn: async (patch: UpdateMeetingRequest) => {
      const { data, error } = await api.PATCH("/v1/meetings/{id}", {
        params: { path: { id: meetingId } },
        body: patch,
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => invalidate(memberId, meetingId),
  });

  const send = useCallback(() => {
    if (pending.current) {
      mutation.mutate(pending.current);
      pending.current = null;
    }
  }, [mutation]);

  const schedule = useCallback(
    (patch: UpdateMeetingRequest) => {
      pending.current = patch;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(send, delay);
    },
    [send, delay],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    send();
  }, [send]);

  const status: SaveStatus = mutation.isPending
    ? "saving"
    : mutation.isError
      ? "error"
      : mutation.isSuccess
        ? "saved"
        : "idle";

  return { schedule, flush, status };
}
```

- [ ] **Step 8: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean (path literals match `schema.d.ts`; `api.POST/PATCH/DELETE` typed).

- [ ] **Step 9: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/package.json web/pnpm-lock.yaml web/lib/store/drawer.ts web/lib/meeting-form.ts web/lib/query/meetings.ts web/lib/__tests__/meeting-form.test.ts
git commit -m "feat(web): drawer store + meeting form transforms + create/patch/complete/delete/template hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `MoodPicker` + `FieldControl`

**Files:**
- Create: `web/components/MoodPicker.tsx`, `web/components/FieldControl.tsx`
- Test: `web/components/__tests__/FieldControl.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FieldControl } from "../FieldControl";
import type { FieldDef } from "@/lib/query/meetings";

const moodDef: FieldDef = { id: "f0", ord: 0, kind: "mood", title: "Настроение", required: false, placeholder: null, hint: null, options: [] };
const textDef: FieldDef = { id: "f1", ord: 1, kind: "longtext", title: "Блокеры", required: false, placeholder: "Что мешает?", hint: null, options: [] };

describe("FieldControl", () => {
  it("longtext fires onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<FieldControl field={textDef} value="" moodScore={null} onChange={onChange} onMood={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Что мешает?"), { target: { value: "Флака" } });
    expect(onChange).toHaveBeenCalledWith("Флака");
  });

  it("mood picks an emoji + score", () => {
    const onMood = vi.fn();
    render(<FieldControl field={moodDef} value="🙂" moodScore={7} onChange={() => {}} onMood={onMood} />);
    fireEvent.click(screen.getByRole("button", { name: "😄" }));
    expect(onMood).toHaveBeenCalledWith("😄", 8);
  });

  it("file kind renders a disabled placeholder", () => {
    const fileDef: FieldDef = { ...textDef, id: "f2", kind: "file", title: "Файл" };
    render(<FieldControl field={fileDef} value="" moodScore={null} onChange={() => {}} onMood={() => {}} />);
    expect(screen.getByText(/Загрузка файлов появится позже/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test FieldControl`

- [ ] **Step 3: Implement `web/components/MoodPicker.tsx`**

```typescript
"use client";
import { cn } from "@/lib/utils";

// Emoji → score: index 0..4 maps to 2/4/6/8/10.
const MOODS = ["😞", "😐", "🙂", "😄", "🤩"];

export function MoodPicker({
  value, score, onChange,
}: { value: string; score: number | null; onChange: (emoji: string, score: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {MOODS.map((e, i) => {
        const s = (i + 1) * 2;
        const active = e === value;
        return (
          <button
            key={e}
            type="button"
            aria-label={e}
            aria-pressed={active}
            onClick={() => onChange(e, s)}
            className={cn(
              "rounded-md px-2 py-1 text-[20px] leading-none",
              active ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-bg-tint",
            )}
          >
            {e}
          </button>
        );
      })}
      <span className="ml-1 text-[12px] text-ink-3 tabular">{score != null ? `${score}/10` : "—"}</span>
    </div>
  );
}
```

- [ ] **Step 4: Implement `web/components/FieldControl.tsx`**

```typescript
"use client";
import { MoodPicker } from "./MoodPicker";
import type { FieldDef } from "@/lib/query/meetings";

export function FieldControl({
  field, value, moodScore, onChange, onMood,
}: {
  field: FieldDef;
  value: string;
  moodScore: number | null;
  onChange: (value: string) => void;
  onMood: (emoji: string, score: number) => void;
}) {
  const label = (
    <div className="mb-1 text-[12px] font-medium text-ink-2">{field.title}</div>
  );

  let control: React.ReactNode;
  switch (field.kind) {
    case "mood":
      control = <MoodPicker value={value} score={moodScore} onChange={onMood} />;
      break;
    case "longtext":
      control = (
        <textarea
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-line bg-bg-elev p-2 text-[13px] text-ink"
        />
      );
      break;
    case "text":
    case "date":
      control = (
        <input
          type="text"
          value={value}
          placeholder={field.placeholder ?? (field.kind === "date" ? "ДД.ММ.ГГГГ" : "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
        />
      );
      break;
    case "scale":
      control = (
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              className={cnScale(value === String(n))}
            >
              {n}
            </button>
          ))}
        </div>
      );
      break;
    case "select":
      control = (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "checklist":
      control = (
        <div className="space-y-1">
          {field.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={value.split(",").includes(o)}
                onChange={(e) => {
                  const set = new Set(value.split(",").filter(Boolean));
                  if (e.target.checked) set.add(o); else set.delete(o);
                  onChange(Array.from(set).join(","));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    case "file":
    default:
      control = (
        <div className="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3">
          Загрузка файлов появится позже
        </div>
      );
  }

  return <div className="py-2">{label}{control}</div>;
}

function cnScale(active: boolean): string {
  return `h-7 w-7 rounded text-[12px] tabular ${active ? "bg-brand text-brand-text" : "border border-line text-ink-2 hover:bg-bg-tint"}`;
}
```

- [ ] **Step 5: Run → PASS.** `cd web && pnpm test FieldControl`

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/MoodPicker.tsx web/components/FieldControl.tsx web/components/__tests__/FieldControl.test.tsx
git commit -m "feat(web): FieldControl (all field kinds; file disabled) + MoodPicker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: `MeetingDrawer` + `MeetingDrawerHost` + autosave wiring

**Files:**
- Create: `web/components/MeetingDrawer.tsx`, `web/components/MeetingDrawerHost.tsx`
- Modify: `web/app/(app)/layout.tsx` (mount host)
- Test: `web/components/__tests__/MeetingDrawer.test.tsx`

The drawer maps each template field's `title` to a `MeetingForm` key. Define that mapping once.

- [ ] **Step 1: Write the failing test** (renders fields from a template, shows footer per state)

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingDrawer } from "../MeetingDrawer";
import type { MeetingDetail, TemplateDetail } from "@/lib/query/meetings";

vi.mock("@/lib/query/profile", () => ({
  useMeeting: () => ({ data: MEETING, isLoading: false, isError: false }),
}));
vi.mock("@/lib/query/meetings", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/meetings")>();
  return {
    ...actual,
    useTemplate: () => ({ data: TEMPLATE, isLoading: false, isError: false }),
    useMeetingAutosave: () => ({ schedule: vi.fn(), flush: vi.fn(), status: "idle" }),
    useCompleteMeeting: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteMeeting: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

const MEETING: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "planned",
  duration_min: 45, mood: "🙂", mood_score: 7, blockers: "B", goals: null,
  feedback_to: null, feedback_from: null, development: [], relationships: null, template_id: "t1",
};
const TEMPLATE: TemplateDetail = {
  id: "t1", name: "Базовый",
  fields: [
    { id: "f0", ord: 0, kind: "mood", title: "Настроение", required: false, placeholder: null, hint: null, options: [] },
    { id: "f1", ord: 1, kind: "longtext", title: "Блокеры", required: false, placeholder: "Что мешает?", hint: null, options: [] },
  ],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("MeetingDrawer", () => {
  it("renders template fields and the planned footer", () => {
    render(wrap(<MeetingDrawer meetingId="m1" onClose={() => {}} />));
    expect(screen.getByText("Настроение")).toBeInTheDocument();
    expect(screen.getByText("Блокеры")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test MeetingDrawer`

- [ ] **Step 3: Implement `web/components/MeetingDrawer.tsx`**

```typescript
"use client";
import { useEffect, useReducer } from "react";
import { useMeeting } from "@/lib/query/profile";
import {
  useTemplate, useMeetingAutosave, useCompleteMeeting, useDeleteMeeting,
} from "@/lib/query/meetings";
import {
  formFromMeeting, formToPatch, meetingFormReducer, toLocalInput, fromLocalInput, type MeetingForm,
} from "@/lib/meeting-form";
import { FieldControl } from "./FieldControl";
import { Pill } from "./Pill";

// template field title → MeetingForm key
const TITLE_TO_FIELD: Record<string, keyof MeetingForm> = {
  "Настроение": "mood",
  "Блокеры": "blockers",
  "Цели": "goals",
  "Фидбек сотруднику": "feedback_to",
  "Фидбек от сотрудника": "feedback_from",
  "Развитие": "development",
  "Отношения": "relationships",
};

const EMPTY: MeetingForm = {
  date: "", duration_min: 45, mood: "", mood_score: null, blockers: "", goals: "",
  feedback_to: "", feedback_from: "", development: "", relationships: "",
};

export function MeetingDrawer({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const meeting = useMeeting(meetingId);
  const template = useTemplate(meeting.data?.template_id ?? null);
  const memberId = meeting.data?.member_id ?? "";
  const autosave = useMeetingAutosave(meetingId, memberId);
  const complete = useCompleteMeeting();
  const del = useDeleteMeeting();

  const [form, dispatch] = useReducer(meetingFormReducer, EMPTY);

  // Seed the form once the meeting loads.
  useEffect(() => {
    if (meeting.data) dispatch({ type: "reset", form: formFromMeeting(meeting.data) });
  }, [meeting.data]);

  function edit(field: keyof MeetingForm, value: string | number | null) {
    const next = meetingFormReducer(form, { type: "set", field, value });
    dispatch({ type: "set", field, value });
    autosave.schedule(formToPatch(next));
  }

  const done = meeting.data?.state === "done";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Закрыть" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => { autosave.flush(); onClose(); }} />
      <aside className="flex h-full w-[92vw] max-w-[720px] flex-col bg-bg-elev shadow-pop">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Pill variant={done ? "ok" : "info"} dot>{done ? "Завершена" : "Запланирована"}</Pill>
            <span className="text-[12px] text-ink-3" data-save-status={autosave.status}>
              {autosave.status === "saving" ? "● Сохранение…" : autosave.status === "error" ? "● Не сохранено" : autosave.status === "saved" ? "● Сохранено" : ""}
            </span>
          </div>
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => { autosave.flush(); onClose(); }}>✕</button>
        </header>

        {!done && form.date && (
          <div className="flex items-center gap-2 border-b border-line px-5 py-2 text-[12px] text-ink-3">
            <span>Перенести:</span>
            <input
              type="datetime-local"
              aria-label="Дата встречи"
              value={toLocalInput(form.date)}
              onChange={(e) => edit("date", fromLocalInput(e.target.value))}
              className="rounded-md border border-line bg-bg-elev px-2 py-1 text-[12px] text-ink tabular"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {meeting.isLoading || template.isLoading ? (
            <div className="text-[13px] text-ink-3">Загрузка…</div>
          ) : meeting.isError ? (
            <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
              Не удалось загрузить встречу.{" "}
              <button className="underline" onClick={() => meeting.refetch()}>Повторить</button>
            </div>
          ) : (
            (template.data?.fields ?? []).map((f) => {
              const key = TITLE_TO_FIELD[f.title];
              const value = key ? String(form[key] ?? "") : "";
              return (
                <FieldControl
                  key={f.id}
                  field={f}
                  value={f.kind === "mood" ? form.mood : value}
                  moodScore={form.mood_score}
                  onChange={(v) => key && edit(key, v)}
                  onMood={(emoji, score) => { edit("mood", emoji); edit("mood_score", score); }}
                />
              );
            })
          )}
        </div>

        <footer className="flex gap-2 border-t border-line px-5 py-3">
          {!done && (
            <button
              type="button"
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
              onClick={() => { autosave.flush(); complete.mutate(meetingId, { onSuccess: onClose }); }}
            >
              Завершить
            </button>
          )}
          {!done && (
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
              onClick={() => {
                if (confirm("Удалить встречу?")) del.mutate({ id: meetingId, memberId }, { onSuccess: onClose });
              }}
            >
              Отменить
            </button>
          )}
          <button type="button" className="ml-auto rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2" onClick={() => { autosave.flush(); onClose(); }}>
            Закрыть
          </button>
        </footer>
      </aside>
    </div>
  );
}
```

> Reschedule: the `datetime-local` control in the header (planned meetings only) edits `form.date` through the same `edit()` → debounced PATCH path, satisfying the spec's «Перенести». The footer keeps Завершить/Отменить/Закрыть.

- [ ] **Step 4: Implement `web/components/MeetingDrawerHost.tsx`** (client; reads store)

```typescript
"use client";
import { useDrawerStore } from "@/lib/store/drawer";
import { MeetingDrawer } from "./MeetingDrawer";

export function MeetingDrawerHost() {
  const openMeetingId = useDrawerStore((s) => s.openMeetingId);
  const close = useDrawerStore((s) => s.close);
  if (!openMeetingId) return null;
  return <MeetingDrawer meetingId={openMeetingId} onClose={close} />;
}
```

- [ ] **Step 5: Mount the host in `web/app/(app)/layout.tsx`**

Add the import and render the host once (it's a client component inside the server layout):
```typescript
import { MeetingDrawerHost } from "@/components/MeetingDrawerHost";
```
and inside the returned JSX, after `<main>...</main>`:
```typescript
      <main className="flex-1 min-w-0">{children}</main>
      <MeetingDrawerHost />
```

- [ ] **Step 6: Run → PASS + typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test MeetingDrawer && pnpm exec tsc --noEmit`
Expected: drawer test PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/MeetingDrawer.tsx web/components/MeetingDrawerHost.tsx "web/app/(app)/layout.tsx" web/components/__tests__/MeetingDrawer.test.tsx
git commit -m "feat(web): MeetingDrawer (template-driven form + autosave + complete/cancel) mounted app-wide

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Wire the slice-4 stubs to open the drawer

**Files:**
- Create: `web/components/ProfileActions.tsx`
- Modify: `web/components/ProfileHeader.tsx`, `web/components/MeetingDetailCard.tsx`

- [ ] **Step 1: Create `web/components/ProfileActions.tsx`** (client; «Начать 1-2-1» creates + opens)

```typescript
"use client";
import { useCreateMeeting } from "@/lib/query/meetings";
import { useDrawerStore } from "@/lib/store/drawer";

export function ProfileActions({ memberId }: { memberId: string }) {
  const create = useCreateMeeting();
  const open = useDrawerStore((s) => s.open);
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Написать</button>
      <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Экспорт</button>
      <button
        type="button"
        disabled={create.isPending}
        className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        onClick={() => create.mutate(memberId, { onSuccess: (m) => open(m.id) })}
      >
        Начать 1-2-1
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Use it in `ProfileHeader.tsx`**

Replace the static `<div className="flex shrink-0 gap-2"> ... 3 buttons ... </div>` block with:
```typescript
        <ProfileActions memberId={member.id} />
```
and add the import at the top:
```typescript
import { ProfileActions } from "./ProfileActions";
```
(ProfileHeader stays a server component; it renders the client `ProfileActions`.)

- [ ] **Step 3: Wire `MeetingDetailCard.tsx`**

`MeetingDetailCard` renders inside the client `HistoryTab`, so it can use the store. Add `"use client";` at the top, import the store + delete hook, and wire the buttons. Replace the planned-branch button row:
```typescript
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">Провести сейчас</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Перенести</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Отменить</button>
        </div>
```
with:
```typescript
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
            onClick={() => open(meeting.id)}>Провести сейчас</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
            onClick={() => open(meeting.id)}>Перенести</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
            onClick={() => { if (confirm("Удалить встречу?")) del.mutate({ id: meeting.id, memberId: meeting.member_id }); }}>
            Отменить
          </button>
        </div>
```
Add to the top of the file:
```typescript
"use client";
import { useDrawerStore } from "@/lib/store/drawer";
import { useDeleteMeeting } from "@/lib/query/meetings";
```
and at the top of the `MeetingDetailCard` function body:
```typescript
  const open = useDrawerStore((s) => s.open);
  const del = useDeleteMeeting();
```
For the `done` branch, add a «Редактировать» button. After the `<div className="flex items-center justify-between">...</div>` header in the done branch, append within the card:
```typescript
      <button type="button" className="mt-3 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
        onClick={() => open(meeting.id)}>Редактировать</button>
```

- [ ] **Step 4: Typecheck + existing tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; the existing `MeetingDetailCard` test still passes (it asserts the planned CTA «Провести сейчас» exists and the done branch — still present; it doesn't assert handlers). If the MeetingDetailCard test renders without a QueryClientProvider and now fails because `useDeleteMeeting` needs one, wrap the test's render in a `QueryClientProvider` (update `web/components/__tests__/MeetingDetailCard.test.tsx` to add the provider wrapper, mirroring the MeetingDrawer test's `wrap()` helper).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/ProfileActions.tsx web/components/ProfileHeader.tsx web/components/MeetingDetailCard.tsx web/components/__tests__/MeetingDetailCard.test.tsx
git commit -m "feat(web): wire profile/meeting-card stubs to open the MeetingDrawer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Playwright e2e

**Files:**
- Create: `web/e2e/meeting-drawer.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function openAnna(page: Page) {
  await login(page);
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
}

test("start a 1-2-1, type notes, complete it", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();

  // Drawer opens with the template fields.
  await expect(page.getByText("Настроение")).toBeVisible({ timeout: 10_000 });
  const blockers = page.locator("textarea").first();
  await blockers.fill("Обсудили блокеры по релизу");

  await page.getByRole("button", { name: "Завершить" }).click();
  // Drawer closes; the new meeting shows as completed in the feed.
  await expect(page.getByText("Завершена").first()).toBeVisible({ timeout: 10_000 });
});

test("start then cancel removes the planned meeting", async ({ page }) => {
  await openAnna(page);
  // Count current feed items, start one, cancel it, expect the drawer to close.
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();
  await expect(page.getByRole("button", { name: "Завершить" })).toBeVisible({ timeout: 10_000 });
  page.on("dialog", (d) => d.accept()); // confirm() → OK
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByRole("button", { name: "Завершить" })).toBeHidden({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run** (API on :8080 + dev DB seeded; Playwright starts `pnpm dev`)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e meeting-drawer`
Expected: both tests PASS. If a selector is ambiguous (e.g. multiple textareas), refine the selector in the TEST (don't weaken the assertion) — e.g. target the textarea under the «Блокеры» label. If the dev server is cold, the first assertion's 10s timeout covers compile.

- [ ] **Step 3: Run the full e2e suite** (catch regressions in the profile/teamlist specs)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e`
Expected: all specs PASS (profile/teamlist/auth unaffected; the «Начать 1-2-1» button still present).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/meeting-drawer.spec.ts
git commit -m "test(web): MeetingDrawer e2e — start/conduct/complete + start/cancel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db && api/scripts/test.sh -p bt-api` → all PASS.
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e: `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: profile → «Начать 1-2-1» opens the drawer; typing autosaves (● Сохранение…→Сохранено); «Завершить» marks the meeting done; a planned meeting's «Отменить» removes it; «Редактировать» on a done meeting reopens the drawer.
- [ ] Then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- Seed realign to 7 fields 1:1 with columns → Task 1 ✓
- Full action set (create/conduct+autosave/complete/reschedule/cancel) → Tasks 4–5 (create/patch/complete/delete) + drawer autosave Task 10. Reschedule = a `datetime-local` control in the drawer header (planned only) editing `form.date` → PATCH (Tasks 8 helpers + 10 control) ✓
- Template drives structure → PATCH writes typed columns → Task 4 (COALESCE update) + Task 10 (TITLE_TO_FIELD mapping) ✓
- Cancel = DELETE (planned only; done → 409) → Task 5 ✓
- Complete = separate POST endpoint (planned→done; re-complete 409) → Task 5 ✓
- Start-now (create planned at now, open drawer) → Task 4 (`COALESCE($2, now())`) + Task 11 ProfileActions ✓
- Autosave: local useReducer + debounced PATCH + ● indicator + flush on complete/close → Tasks 8 (hook) + 10 (drawer) ✓
- Zustand open-state, drawer mounted in (app)/layout → Tasks 8 (store) + 10 (host + layout) ✓
- FieldControl all kinds; file disabled placeholder → Task 9 ✓
- Template alignment: development one-per-line → TEXT[] → Tasks 1 (placeholder copy), 8 (formToPatch split), 4 (array bind) ✓
- Ownership on all mutations (403 foreign) → Tasks 4–5 tests ✓; templates readable by any lead → Task 6 ✓
- validator (mood_score 1..10, duration>0) → Task 2 + Task 4 test `patch_rejects_bad_mood_score` ✓
- OpenAPI + gen:api → Task 7 ✓
- Wire header/planned-card/done-card stubs → Task 11 ✓
- e2e start/conduct/complete + cancel → Task 12 ✓
- Preserve brand token, Russian microcopy, tabular → enforced in component code + conventions ✓

**Placeholder scan:** no TBD/TODO; every code step has full code. «Перенести» is a concrete `datetime-local` control (Task 10) backed by the `toLocalInput`/`fromLocalInput` helpers (Task 8, with a round-trip test).

**Type consistency:** `MeetingForm` keys (Task 8) match `TITLE_TO_FIELD` values (Task 10) and `formToPatch` output matches `UpdateMeetingRequest` (Task 2 DTO). `FieldDef.kind` (DTO Task 2) is consumed by `FieldControl` switch (Task 9) and `useTemplate`/`TemplateDetail` (Task 8). `MeetingDetail.template_id` (Task 2) is produced by `load_meeting_detail` (Task 3) and read by the drawer (Task 10). Store API `open/close/openMeetingId` (Task 8) used by host (Task 10) + ProfileActions/MeetingDetailCard (Task 11). Hook names `useCreateMeeting/useCompleteMeeting/useDeleteMeeting/useMeetingAutosave/useTemplate` consistent across Tasks 8/10/11.

**Known follow-ups (stay stubs per spec):** «Написать»/«Экспорт», the `file` field upload (MinIO is slice 7), kebab menus.
