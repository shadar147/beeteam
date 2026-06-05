# BeeTeam Files + MinIO Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make files real — presigned-direct upload/download to MinIO, delete, a server-built `.zip`, and a MeetingDrawer attachments section.

**Architecture:** A new `aws-sdk-s3` client lives in `AppState`; `storage.rs` wraps presign/get/delete/ensure-bucket. Four endpoints (`POST /v1/files`, `GET /v1/files/:id/download`, `DELETE /v1/files/:id`, `GET /v1/members/:id/files.zip`) guarded by `require_member_access`. Bytes flow browser⇄MinIO directly via presigned URLs (never through Next/axum) except the generated zip, which streams through a binary-safe Next proxy. Frontend: a `FileDropzone` + `files.ts` helpers wire the Files tab and a drawer «Вложения» section.

**Tech Stack:** Rust (axum, sqlx, utoipa, validator, **aws-sdk-s3**, **zip**), Postgres, MinIO; Next.js 14, TypeScript, TanStack Query, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-05-beeteam-files-minio-design.md`

---

## Conventions (read once)

- Mirror slice-5/6 mutation patterns: read `api/crates/bt-api/src/routes/goals.rs` (handlers: `Json<T>` body, `body.validate()→BadRequest`, `require_member_access`, member-from-row resolution, `StatusCode::CREATED/NO_CONTENT`; tests use a local `app(pool)` helper + `tower::ServiceExt::oneshot` + `seed`/`seed_foreign`/`req` helpers).
- **MinIO is NOT required for backend tests.** `aws-sdk-s3` presigning signs locally (no network); object ops (`delete_object`, `get_object_bytes`) are best-effort (errors ignored/skipped). So POST/download/delete/zip handlers are testable against the DB alone. The S3 client in `AppState` is pure config (constructing it does no network I/O).
- Errors: `AppError::{Forbidden→403, NotFound→404, BadRequest→400, Conflict→409, Db}`, `AppResult<T>`. `require_member_access(&auth, member_id, &pool)` is `pub` in `routes/members.rs`.
- DTOs in `bt-domain/src/lib.rs` (`FileMeta` already exists). Routes registered in `app.rs` protected router; modules in `routes/mod.rs`; OpenAPI in `openapi.rs`.
- Backend tests: `api/scripts/test.sh -p bt-api` (`docker compose up -d postgres-test` if needed). Frontend: `cd web && pnpm test` / `pnpm test:e2e`; types via `pnpm gen:api` (API on :8080). Tokens: `bg-brand`/`brand-text` (NEVER `accent`), `bg-bg-elev`, `border-line`, `border-line-strong`, `text-ink/ink-2/ink-3`, `bg-miss-soft`/`text-miss`, `tabular`. `cn()` from `@/lib/utils`.
- Dev DB on host port 5442; MinIO S3 on :9000, console :9001 (root `beeteam`/`beeteam-secret`). API on :8080 (restart after backend changes / before `gen:api`).
- **aws-sdk-s3 version caveat:** the code below targets aws-sdk-s3 1.x. If the resolved crate version's presigning/config API differs (e.g. `PresignedRequest::uri()`, `force_path_style`, `BehaviorVersion`), adjust to the installed version and confirm with `cargo build`. Do not invent APIs — check the crate docs/source under `~/.cargo` if a symbol doesn't resolve.

---

## File Structure

**Backend:**
- Modify `api/Cargo.toml` (+ `bt-api/Cargo.toml`) — add `aws-sdk-s3`, `zip`.
- Create `api/crates/bt-api/src/storage.rs` — S3 client builder + presign/get/delete/ensure-bucket + `kind_from_mime`.
- Modify `api/crates/bt-api/src/app.rs` — `AppState { …, s3, bucket }`; update every test-module `app(pool)` helper.
- Modify `api/crates/bt-api/src/main.rs` — build client, ensure bucket, thread into AppState.
- Modify `api/crates/bt-domain/src/lib.rs` — `CreateFileRequest`, `FileUpload`, `FileDownload`.
- Create `api/crates/bt-api/src/routes/files.rs` — 4 handlers + tests.
- Modify `routes/mod.rs`, `openapi.rs`.

**Frontend:**
- Modify `web/app/api/v1/[...path]/route.ts` — binary-safe responses.
- Create `web/lib/query/files.ts` — `uploadFile`, `downloadFile`, `useDeleteFile`, `zipUrl`.
- Create `web/components/FileDropzone.tsx`.
- Modify `web/app/(app)/profile/[id]/FilesTab.tsx`, `web/components/FileRow.tsx`, `web/components/FileTile.tsx`.
- Modify `web/components/MeetingDrawer.tsx` (+ a small `useMeetingFiles` hook) and `web/components/FieldControl.tsx`.
- Tests: `web/components/__tests__/FileDropzone.test.tsx`, `web/e2e/files.spec.ts`.

---

# Phase A — Backend

### Task 1: S3 infra — deps, `storage.rs`, AppState, main.rs, CORS

**Files:**
- Modify: `api/Cargo.toml`, `api/crates/bt-api/Cargo.toml`, `docker-compose.yml`, `api/crates/bt-api/src/app.rs`, `api/crates/bt-api/src/main.rs`, `api/crates/bt-api/src/routes/mod.rs`
- Create: `api/crates/bt-api/src/storage.rs`

- [ ] **Step 1: Add dependencies**

In `api/Cargo.toml` `[workspace.dependencies]`:
```toml
aws-sdk-s3 = { version = "1", features = ["behavior-version-latest"] }
zip = { version = "2", default-features = false, features = ["deflate"] }
```
In `api/crates/bt-api/Cargo.toml` `[dependencies]`:
```toml
aws-sdk-s3 = { workspace = true }
zip = { workspace = true }
```

- [ ] **Step 2: Add MinIO CORS to docker-compose**

In `docker-compose.yml`, under the `minio` service `environment:` map, add:
```yaml
      MINIO_API_CORS_ALLOW_ORIGIN: "*"
```
Then recreate MinIO: `docker compose up -d minio` (wait for healthy).

- [ ] **Step 3: Create `api/crates/bt-api/src/storage.rs`**

```rust
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::Client;
use std::time::Duration;

const PRESIGN_EXPIRY_SECS: u64 = 900; // 15 min

/// Build an S3 client for MinIO (path-style, static creds).
pub fn build_client(endpoint: &str, region: &str, access: &str, secret: &str) -> Client {
    let creds = aws_sdk_s3::config::Credentials::new(
        access.to_string(), secret.to_string(), None, None, "static",
    );
    let conf = aws_sdk_s3::config::Builder::new()
        .endpoint_url(endpoint.to_string())
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
        .credentials_provider(creds)
        .force_path_style(true)
        .build();
    Client::from_conf(conf)
}

/// Build a client from env (used by main + tests). Defaults target the dev MinIO.
pub fn client_from_env() -> Client {
    let endpoint = std::env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".into());
    let region = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into());
    let access = std::env::var("S3_ACCESS_KEY").unwrap_or_else(|_| "beeteam".into());
    let secret = std::env::var("S3_SECRET_KEY").unwrap_or_else(|_| "beeteam-secret".into());
    build_client(&endpoint, &region, &access, &secret)
}

pub fn bucket_from_env() -> String {
    std::env::var("S3_BUCKET").unwrap_or_else(|_| "beeteam".into())
}

/// Create the bucket if missing. Best-effort: a "you already own it" error is fine.
pub async fn ensure_bucket(s3: &Client, bucket: &str) {
    let _ = s3.create_bucket().bucket(bucket).send().await;
}

pub async fn presign_put(s3: &Client, bucket: &str, key: &str, content_type: &str) -> String {
    let cfg = PresigningConfig::expires_in(Duration::from_secs(PRESIGN_EXPIRY_SECS))
        .expect("valid presign config");
    let req = s3.put_object().bucket(bucket).key(key).content_type(content_type)
        .presigned(cfg).await.expect("presign put");
    req.uri().to_string()
}

pub async fn presign_get(s3: &Client, bucket: &str, key: &str) -> String {
    let cfg = PresigningConfig::expires_in(Duration::from_secs(PRESIGN_EXPIRY_SECS))
        .expect("valid presign config");
    let req = s3.get_object().bucket(bucket).key(key)
        .presigned(cfg).await.expect("presign get");
    req.uri().to_string()
}

/// Best-effort delete; ignores errors (missing object / storage hiccup must not block row deletion).
pub async fn delete_object(s3: &Client, bucket: &str, key: &str) {
    let _ = s3.delete_object().bucket(bucket).key(key).send().await;
}

/// Fetch object bytes; None on any error (missing object / unreachable) so the zip can skip it.
pub async fn get_object_bytes(s3: &Client, bucket: &str, key: &str) -> Option<Vec<u8>> {
    let out = s3.get_object().bucket(bucket).key(key).send().await.ok()?;
    let data = out.body.collect().await.ok()?;
    Some(data.into_bytes().to_vec())
}

/// Map a mime/filename to the `file_kind` enum value.
pub fn kind_from_mime(mime: &str, name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if mime == "application/pdf" || lower.ends_with(".pdf") { return "pdf"; }
    if mime.starts_with("image/") { return "img"; }
    if mime.starts_with("video/") { return "video"; }
    if mime.contains("spreadsheet") || mime.contains("excel")
        || lower.ends_with(".xlsx") || lower.ends_with(".xls") || lower.ends_with(".csv") {
        return "sheet";
    }
    "doc"
}

#[cfg(test)]
mod tests {
    use super::kind_from_mime;
    #[test]
    fn maps_kinds() {
        assert_eq!(kind_from_mime("application/pdf", "x.pdf"), "pdf");
        assert_eq!(kind_from_mime("image/png", "a.png"), "img");
        assert_eq!(kind_from_mime("video/mp4", "a.mp4"), "video");
        assert_eq!(kind_from_mime("application/vnd.ms-excel", "a.xls"), "sheet");
        assert_eq!(kind_from_mime("application/octet-stream", "a.docx"), "doc");
    }
}
```

Add `pub mod storage;` to `api/crates/bt-api/src/main.rs` (or wherever modules are declared — check whether the crate declares modules in `main.rs` or a `lib.rs`; add it next to `mod routes;`/`mod app;`).

- [ ] **Step 4: Add `s3` + `bucket` to `AppState`**

In `api/crates/bt-api/src/app.rs`, extend the struct:
```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub web_origin: String,
    pub s3: aws_sdk_s3::Client,
    pub bucket: String,
}
```

- [ ] **Step 5: Thread it through `main.rs`**

In `api/crates/bt-api/src/main.rs`, after the pool/seed setup and before `build_router`, add:
```rust
    let s3 = crate::storage::client_from_env();
    let bucket = crate::storage::bucket_from_env();
    crate::storage::ensure_bucket(&s3, &bucket).await;
```
and pass `s3, bucket` into the `AppState { … }` literal.

- [ ] **Step 6: Update EVERY test-module `app(pool)` helper**

`AppState` now has two more fields, so every place it's constructed must supply them. Find them:
`grep -rn "AppState {" api/crates/bt-api/src` and `grep -rn "build_router(" api/crates/bt-api/src`.
There is a local `app(pool)`-style helper in each route test module (e.g. `routes/goals.rs`, `routes/meetings.rs`, `routes/members.rs`, `routes/teams.rs`). In EACH, add to the `AppState { … }` literal:
```rust
        s3: crate::storage::client_from_env(),
        bucket: crate::storage::bucket_from_env(),
```
(Constructing the client does no network I/O, so tests stay offline-safe.)

- [ ] **Step 7: Build + run the full backend suite**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Then: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: clean build; ALL existing tests still pass (no behavior change yet) + the `kind_from_mime` unit test passes.

- [ ] **Step 8: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/Cargo.toml api/Cargo.lock api/crates/bt-api/Cargo.toml docker-compose.yml api/crates/bt-api/src/storage.rs api/crates/bt-api/src/app.rs api/crates/bt-api/src/main.rs
git commit -m "feat(api): S3/MinIO client in AppState + storage helpers + bucket bootstrap + CORS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: DTOs + `POST /v1/files` + `DELETE /v1/files/:id`

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`
- Create: `api/crates/bt-api/src/routes/files.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`

- [ ] **Step 1: Add DTOs to `bt-domain/src/lib.rs`**

```rust
#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateFileRequest {
    pub member_id: uuid::Uuid,
    pub meeting_id: Option<uuid::Uuid>,
    pub name: String,
    pub mime: String,
    #[validate(range(min = 1, max = 52_428_800, message = "file too large"))] // 50 MB
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FileUpload {
    pub file_id: uuid::Uuid,
    pub upload_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FileDownload {
    pub download_url: String,
}
```

- [ ] **Step 2: Create `routes/files.rs` with create + delete**

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use crate::routes::members::require_member_access;
use crate::storage;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{CreateFileRequest, FileUpload};
use uuid::Uuid;
use validator::Validate;

/// member_id owner of a file row, or 404.
async fn file_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM files WHERE id = $1")
        .bind(id).fetch_optional(pool).await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

#[utoipa::path(
    post, path = "/v1/files", request_body = CreateFileRequest,
    responses((status = 201, body = FileUpload), (status = 400), (status = 403))
)]
pub async fn create_file(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateFileRequest>,
) -> AppResult<(StatusCode, Json<FileUpload>)> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    require_member_access(&auth, body.member_id, &state.pool).await?;

    let kind = storage::kind_from_mime(&body.mime, &body.name);
    let file_id = Uuid::new_v4();
    let storage_key = format!("{}/{}/{}", body.member_id, file_id, body.name);

    // uploaded_by = caller's display name (server-side, not client-supplied).
    let uploader: (String,) = sqlx::query_as("SELECT name FROM users WHERE id = $1")
        .bind(auth.id).fetch_one(&state.pool).await?;

    sqlx::query(
        "INSERT INTO files (id, workspace_id, member_id, meeting_id, name, mime, kind, size_bytes, storage_key, uploaded_by) \
         SELECT $1, tm.workspace_id, $2, $3, $4, $5, $6::file_kind, $7, $8, $9 \
         FROM team_members tm WHERE tm.id = $2",
    )
    .bind(file_id).bind(body.member_id).bind(body.meeting_id)
    .bind(&body.name).bind(&body.mime).bind(kind).bind(body.size_bytes).bind(&storage_key)
    .bind(&uploader.0)
    .execute(&state.pool).await?;

    let upload_url = storage::presign_put(&state.s3, &state.bucket, &storage_key, &body.mime).await;
    Ok((StatusCode::CREATED, Json(FileUpload { file_id, upload_url })))
}

#[utoipa::path(
    delete, path = "/v1/files/{id}",
    params(("id" = uuid::Uuid, Path, description = "File id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_file(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = file_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;

    let key: (String,) = sqlx::query_as("SELECT storage_key FROM files WHERE id = $1")
        .bind(id).fetch_one(&state.pool).await?;
    if !key.0.starts_with("seed/") {
        storage::delete_object(&state.s3, &state.bucket, &key.0).await; // best-effort
    }
    sqlx::query("DELETE FROM files WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Wire module + routes**

In `routes/mod.rs` add `pub mod files;`. In `app.rs` protected router add:
```rust
        .route("/v1/files", axum::routing::post(routes::files::create_file))
        .route("/v1/files/:id", axum::routing::delete(routes::files::delete_file))
```

- [ ] **Step 4: Add tests (new `#[cfg(test)] mod tests` in files.rs)**

Use the same local-helper shape as `routes/goals.rs` tests (`app(pool)` building `AppState` incl. `s3`/`bucket` from Task 1; `seed`/`seed_foreign`/`login_token`/`req`). Copy those helpers into files.rs's test module (they're `pub(super)` in goals.rs but each module keeps its own copy per the existing convention). Then:

```rust
    fn file_body(member: uuid::Uuid) -> serde_json::Value {
        serde_json::json!({ "member_id": member, "name": "report.pdf", "mime": "application/pdf", "size_bytes": 1024 })
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_file_returns_upload_url_and_row(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (status, json) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(anna))).await;
        assert_eq!(status, StatusCode::CREATED);
        assert!(json["upload_url"].as_str().unwrap().contains("report.pdf"));
        // a row exists with the derived kind + a non-seed storage_key
        let row: (String, String) = sqlx::query_as("SELECT kind::text, storage_key FROM files WHERE id = ($1::text)::uuid")
            .bind(json["file_id"].as_str().unwrap()).fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, "pdf");
        assert!(!row.1.starts_with("seed/"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_file_foreign_403_and_too_large_400(pool: sqlx::PgPool) {
        let (token, _anna) = seed(&pool).await;
        let (ftoken, bob) = seed_foreign(&pool).await;
        let _ = ftoken;
        let (s403, _) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(bob))).await;
        assert_eq!(s403, StatusCode::FORBIDDEN);

        let (token2, anna) = (token, _anna);
        let mut big = file_body(anna);
        big["size_bytes"] = serde_json::json!(60_000_000); // > 50 MB
        let (s400, _) = req(pool, "POST", "/v1/files", &token2, Some(big)).await;
        assert_eq!(s400, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_file_removes_row(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(anna))).await;
        let id = j["file_id"].as_str().unwrap().to_string();
        let (ds, _) = req(pool.clone(), "DELETE", &format!("/v1/files/{id}"), &token, None).await;
        assert_eq!(ds, StatusCode::NO_CONTENT);
        let cnt: (i64,) = sqlx::query_as("SELECT count(*) FROM files WHERE id = ($1::text)::uuid")
            .bind(&id).fetch_one(&pool).await.unwrap();
        assert_eq!(cnt.0, 0);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_file_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(anna))).await;
        let id = j["file_id"].as_str().unwrap().to_string();
        let (ds, _) = req(pool, "DELETE", &format!("/v1/files/{id}"), &ftoken, None).await;
        assert_eq!(ds, StatusCode::FORBIDDEN);
    }
```

> Note on the `($1::text)::uuid` cast in tests: `json["file_id"]` is a string; bind it as text and cast to uuid in SQL to avoid a Rust uuid parse. Alternatively `uuid::Uuid::parse_str(...)` and bind the Uuid — either is fine; match whichever compiles cleanly.

- [ ] **Step 5: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: the 4 new file tests + all prior PASS. (No MinIO needed — presign is local, delete is best-effort.)

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/files.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): POST /v1/files (presigned upload) + DELETE /v1/files/:id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `GET /v1/files/:id/download`

**Files:**
- Modify: `api/crates/bt-api/src/routes/files.rs`, `app.rs`

- [ ] **Step 1: Add the handler**

Extend the `use bt_domain::{...}` import with `FileDownload`. Add:

```rust
#[utoipa::path(
    get, path = "/v1/files/{id}/download",
    params(("id" = uuid::Uuid, Path, description = "File id")),
    responses((status = 200, body = FileDownload), (status = 403), (status = 404), (status = 409))
)]
pub async fn download_file(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<bt_domain::FileDownload>> {
    let member_id = file_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;

    let key: (String,) = sqlx::query_as("SELECT storage_key FROM files WHERE id = $1")
        .bind(id).fetch_one(&state.pool).await?;
    if key.0.starts_with("seed/") {
        return Err(AppError::Conflict("демо-файл недоступен для скачивания".into()));
    }
    let download_url = storage::presign_get(&state.s3, &state.bucket, &key.0).await;
    Ok(Json(bt_domain::FileDownload { download_url }))
}
```

- [ ] **Step 2: Register route**

In `app.rs` chain it onto the `/v1/files/:id` route or add a sibling:
```rust
        .route("/v1/files/:id/download", get(routes::files::download_file))
```
(`get` is imported in app.rs.)

- [ ] **Step 3: Add tests** (append to files.rs `mod tests`)

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn download_normal_file_returns_url(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(anna))).await;
        let id = j["file_id"].as_str().unwrap().to_string();
        let (ds, dj) = req(pool, "GET", &format!("/v1/files/{id}/download"), &token, None).await;
        assert_eq!(ds, StatusCode::OK);
        assert!(dj["download_url"].as_str().unwrap().contains("report.pdf"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn download_seed_file_409(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        // insert a seed-key file directly
        let ws: (uuid::Uuid,) = sqlx::query_as("SELECT workspace_id FROM team_members WHERE id = $1")
            .bind(anna).fetch_one(&pool).await.unwrap();
        let fid: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO files (workspace_id, member_id, name, mime, kind, size_bytes, storage_key, uploaded_by) \
             VALUES ($1,$2,'old.pdf','application/pdf','pdf'::file_kind,10,'seed/old.pdf','Лид') RETURNING id",
        ).bind(ws.0).bind(anna).fetch_one(&pool).await.unwrap();
        let (ds, _) = req(pool, "GET", &format!("/v1/files/{}/download", fid.0), &token, None).await;
        assert_eq!(ds, StatusCode::CONFLICT);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn download_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let (_, j) = req(pool.clone(), "POST", "/v1/files", &token, Some(file_body(anna))).await;
        let id = j["file_id"].as_str().unwrap().to_string();
        let (ds, _) = req(pool, "GET", &format!("/v1/files/{id}/download"), &ftoken, None).await;
        assert_eq!(ds, StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 4: Run tests → PASS** `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/files.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/files/:id/download (presigned; seed→409)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `GET /v1/members/:id/files.zip`

**Files:**
- Modify: `api/crates/bt-api/src/routes/files.rs`, `app.rs`

- [ ] **Step 1: Add the handler**

Extend imports: `use axum::response::Response; use axum::body::Body; use axum::http::header;`. Add:

```rust
#[utoipa::path(
    get, path = "/v1/members/{id}/files.zip",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses((status = 200, description = "Zip of the member's files"), (status = 403))
)]
pub async fn download_files_zip(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Response> {
    require_member_access(&auth, member_id, &state.pool).await?;

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT name, storage_key FROM files WHERE member_id = $1 ORDER BY created_at DESC",
    )
    .bind(member_id)
    .fetch_all(&state.pool)
    .await?;

    // Build the zip in memory. Skip seed keys and any object we can't fetch.
    use std::io::Write;
    let mut cursor = std::io::Cursor::new(Vec::<u8>::new());
    {
        let mut zw = zip::ZipWriter::new(&mut cursor);
        let opts: zip::write::FileOptions<()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, key) in rows {
            if key.starts_with("seed/") { continue; }
            if let Some(bytes) = storage::get_object_bytes(&state.s3, &state.bucket, &key).await {
                // de-dup identical names by prefixing nothing for v1; collisions overwrite is fine for a demo.
                zw.start_file(&name, opts).map_err(|e| AppError::BadRequest(e.to_string()))?;
                zw.write_all(&bytes).map_err(|e| AppError::BadRequest(e.to_string()))?;
            }
        }
        zw.finish().map_err(|e| AppError::BadRequest(e.to_string()))?;
    }
    let bytes = cursor.into_inner();

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"files.zip\"")
        .body(Body::from(bytes))
        .expect("zip response"))
}
```

> `zip` 2.x API: `FileOptions::default()` may require a type annotation for the extra-data generic (`FileOptions<()>` or `SimpleFileOptions`). If `FileOptions` doesn't resolve, use `zip::write::SimpleFileOptions::default().compression_method(...)`. Adjust to the installed `zip` version; confirm with `cargo build`.

- [ ] **Step 2: Register route**

In `app.rs` protected router:
```rust
        .route("/v1/members/:id/files.zip", get(routes::files::download_files_zip))
```

- [ ] **Step 3: Add a test** (append to files.rs `mod tests`)

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn files_zip_returns_zip(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        // A member with no fetchable objects → an empty-but-valid zip (no MinIO needed).
        let resp = app(pool).oneshot(
            axum::http::Request::builder()
                .method("GET").uri(format!("/v1/members/{anna}/files.zip"))
                .header("authorization", format!("Bearer {token}"))
                .body(axum::body::Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.headers()["content-type"], "application/zip");
        let bytes = http_body_util::BodyExt::collect(resp.into_body()).await.unwrap().to_bytes();
        assert_eq!(&bytes[0..2], b"PK"); // zip magic (empty archive still has the EOCD record)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn files_zip_foreign_403(pool: sqlx::PgPool) {
        let (token, anna) = seed(&pool).await;
        let (ftoken, _bob) = seed_foreign(&pool).await;
        let _ = (token, );
        let (s, _) = req(pool, "GET", &format!("/v1/members/{anna}/files.zip"), &ftoken, None).await;
        assert_eq!(s, StatusCode::FORBIDDEN);
    }
```

> The zip test builds the request directly (the `req` helper parses JSON; the zip body is binary). Use the raw `app(...).oneshot(...)` form shown. Confirm `http_body_util::BodyExt` is the same import the other tests use to read bodies.

- [ ] **Step 4: Run tests → PASS** `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/files.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/members/:id/files.zip (server-built zip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: OpenAPI + regenerate types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`, `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Register paths + schemas**

In `openapi.rs` add to `paths(...)`:
```rust
        crate::routes::files::create_file,
        crate::routes::files::download_file,
        crate::routes::files::delete_file,
        crate::routes::files::download_files_zip,
```
and to `components(schemas(...))`:
```rust
        bt_domain::CreateFileRequest,
        bt_domain::FileUpload,
        bt_domain::FileDownload,
```

- [ ] **Step 2: Build + boot API + verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Ensure MinIO is up: `docker compose up -d minio postgres` (wait healthy). Restart the API on :8080, then:
Run: `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/files"'`
Expected: prints `"/v1/files"`.

- [ ] **Step 3: Regenerate types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Then: `grep -c "CreateFileRequest\|FileUpload\|FileDownload" lib/api/schema.d.ts` → non-zero.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register files endpoints in OpenAPI; regen web types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — Frontend

### Task 6: Binary-safe Next proxy

**Files:**
- Modify: `web/app/api/v1/[...path]/route.ts`

- [ ] **Step 1: Pass through non-JSON response bodies**

The proxy currently does `const text = await res.text()` for every response, which corrupts binary (the `.zip`). Make it stream/arraybuffer non-JSON responses while keeping the 204/304 and JSON paths. Replace the response-construction portion of `proxy(...)` so that, after `const res = await fetch(...)`:

```typescript
  // 204/304 carry no body.
  if (res.status === 204 || res.status === 304) {
    return new NextResponse(null, { status: res.status });
  }
  const contentType = res.headers.get("content-type") ?? "application/json";
  // Binary (e.g. application/zip): pass the body through untouched, preserve disposition.
  if (!contentType.includes("application/json")) {
    const headers: Record<string, string> = { "content-type": contentType };
    const cd = res.headers.get("content-disposition");
    if (cd) headers["content-disposition"] = cd;
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": contentType },
  });
```

(Keep the existing request-forwarding code above unchanged — requests are still JSON; binary uploads bypass the proxy via presigned-direct.)

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add "web/app/api/v1/[...path]/route.ts"
git commit -m "feat(web): proxy passes through binary (zip) responses untouched

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `files.ts` helpers + `FileDropzone`

**Files:**
- Create: `web/lib/query/files.ts`, `web/components/FileDropzone.tsx`
- Test: `web/components/__tests__/FileDropzone.test.tsx`

- [ ] **Step 1: Implement `web/lib/query/files.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const MAX_SIZE = 52_428_800; // 50 MB

export class FileTooLargeError extends Error {}
export class DemoFileError extends Error {}

/** POST /v1/files → presigned PUT → upload bytes straight to MinIO. */
export async function uploadFile(
  file: File,
  opts: { memberId: string; meetingId?: string },
): Promise<void> {
  if (file.size > MAX_SIZE) throw new FileTooLargeError("Файл больше 50 МБ");
  const { data, error } = await api.POST("/v1/files", {
    body: {
      member_id: opts.memberId,
      meeting_id: opts.meetingId,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
    },
  });
  if (error) throw error;
  const put = await fetch(data!.upload_url, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error("Не удалось загрузить файл");
}

/** GET presigned download → open it. Throws DemoFileError on a seed file (409). */
export async function downloadFile(id: string): Promise<void> {
  const { data, error, response } = await api.GET("/v1/files/{id}/download", {
    params: { path: { id } },
  });
  if (response.status === 409) throw new DemoFileError("Демо-файл недоступен для скачивания");
  if (error) throw error;
  window.open(data!.download_url, "_blank");
}

export function useDeleteFile(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/files/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-files", memberId] }),
  });
}

/** Direct URL for the member's zip (opened in a new tab / via download link). */
export function zipUrl(memberId: string): string {
  return `/api/v1/members/${memberId}/files.zip`;
}
```

> openapi-fetch returns `{ data, error, response }`; the `response` field gives the raw status for the 409 check. Confirm the client exposes `response` (openapi-fetch ≥0.9 does); if not, branch on `error` shape instead.

- [ ] **Step 2: Write the failing `FileDropzone` test**

`web/components/__tests__/FileDropzone.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileDropzone } from "../FileDropzone";
import * as files from "@/lib/query/files";

describe("FileDropzone", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uploads a picked file via uploadFile", async () => {
    const spy = vi.spyOn(files, "uploadFile").mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    render(<FileDropzone memberId="m1" onUploaded={onUploaded} />);
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["hi"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(f, { memberId: "m1", meetingId: undefined }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  it("shows an error when the file is too large", async () => {
    vi.spyOn(files, "uploadFile").mockRejectedValue(new files.FileTooLargeError("Файл больше 50 МБ"));
    render(<FileDropzone memberId="m1" onUploaded={() => {}} />);
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["x"], "big.bin", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(screen.getByText(/Файл больше 50 МБ/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run → FAIL.** `cd web && pnpm test FileDropzone`

- [ ] **Step 4: Implement `web/components/FileDropzone.tsx`**

```typescript
"use client";
import { useRef, useState } from "react";
import { uploadFile } from "@/lib/query/files";

export function FileDropzone({
  memberId, meetingId, onUploaded,
}: { memberId: string; meetingId?: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        await uploadFile(f, { memberId, meetingId });
      }
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="cursor-pointer rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[12px] text-ink-3 hover:bg-bg-sunken"
      >
        {busy ? "Загрузка…" : "Перетащите файлы сюда или нажмите, чтобы выбрать"}
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <div className="mt-2 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Run → PASS + typecheck.** `cd web && pnpm test FileDropzone && pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/files.ts web/components/FileDropzone.tsx web/components/__tests__/FileDropzone.test.tsx
git commit -m "feat(web): files upload/download/delete helpers + FileDropzone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Wire FilesTab (upload / download / delete / zip)

**Files:**
- Modify: `web/app/(app)/profile/[id]/FilesTab.tsx`, `web/components/FileRow.tsx`, `web/components/FileTile.tsx`

- [ ] **Step 1: Add download + delete affordances to `FileRow.tsx`**

Add optional handlers (backward compatible — read-only usages pass nothing → no buttons, existing tests unaffected). Change the signature to `export function FileRow({ file, onDownload, onDelete }: { file: FileMeta; onDownload?: (id: string) => void; onDelete?: (id: string) => void })` and replace the stub download button with:
```typescript
      {onDownload && (
        <button type="button" aria-label="Скачать" onClick={() => onDownload(file.id)}
          className="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken">↓</button>
      )}
      {onDelete && (
        <button type="button" aria-label="Удалить" onClick={() => onDelete(file.id)}
          className="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken">✕</button>
      )}
```
(Remove the old inert `↓` stub button.)

- [ ] **Step 2: Add an optional download to `FileTile.tsx`**

Add `onDownload?: (id: string) => void`; make the tile clickable when provided: wrap the tile content with `onClick={() => onDownload?.(file.id)}` and `cursor-pointer` when `onDownload` is set. Keep it backward compatible.

- [ ] **Step 3: Wire `FilesTab.tsx`**

Add imports:
```typescript
import { FileDropzone } from "@/components/FileDropzone";
import { downloadFile, useDeleteFile, zipUrl, DemoFileError } from "@/lib/query/files";
```
Inside the component (after `const files = useMemberFiles(memberId);`):
```typescript
  const del = useDeleteFile(memberId);
  const [toast, setToast] = useState<string | null>(null);

  async function onDownload(id: string) {
    setToast(null);
    try { await downloadFile(id); }
    catch (e) { setToast(e instanceof DemoFileError ? e.message : "Не удалось скачать файл"); }
  }
  function onDelete(id: string) {
    if (confirm("Удалить файл?")) del.mutate(id);
  }
```
(Add `import { useState } from "react";` if not present.) Wire:
- «Скачать .zip» button → `<a href={zipUrl(memberId)} className="...">Скачать .zip</a>` (replace the stub button; an anchor triggers the download through the binary-safe proxy).
- The footer dropzone stub → `<FileDropzone memberId={memberId} onUploaded={() => files.refetch()} />`.
- List rows → `<FileRow key={f.id} file={f} onDownload={onDownload} onDelete={onDelete} />`.
- Grid tiles → `<FileTile key={f.id} file={f} onDownload={onDownload} />`.
- Render a toast line when `toast` is set, e.g. above the list:
```typescript
  {toast && <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">{toast}</div>}
```

- [ ] **Step 4: Typecheck + unit tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; all unit tests pass (existing FileRow/FileTile/FilesComposites tests still pass since the new props are optional).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add "web/app/(app)/profile/[id]/FilesTab.tsx" web/components/FileRow.tsx web/components/FileTile.tsx
git commit -m "feat(web): FilesTab upload/download/delete/zip wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: MeetingDrawer «Вложения» section + `file` FieldControl upgrade

**Files:**
- Modify: `web/components/MeetingDrawer.tsx`, `web/lib/query/meetings.ts` (add `useMeetingFiles`), `web/components/FieldControl.tsx`

- [ ] **Step 1: Add a `useMeetingFiles` query hook to `web/lib/query/meetings.ts`**

The member's files endpoint returns `meeting_label` but not `meeting_id`; for the drawer we need files for ONE meeting. Add a derived hook that fetches the member's files and filters client-side is not possible (no meeting_id in FileMeta). Instead, reuse `useMemberMeetings`? No — simplest: filter the member's files by the meeting via a NEW lightweight read. To avoid a new endpoint, fetch the member's files and match on `meeting_label`. That's brittle. **Decision:** add `meeting_id` is overkill; instead the drawer lists files by re-querying the member's files and filtering to those whose `meeting_label` corresponds — still brittle.

**Chosen approach (no new endpoint):** the drawer's attachments are scoped by uploading with `meetingId` (so the row's `meeting_id` is set) and listing via the existing member files filtered to this meeting. Since `FileMeta` lacks `meeting_id`, add `meeting_id` to the `FileMeta` DTO + `list_member_files` SELECT (one extra column) so the client can filter. This is a small backend tweak:

In `api/crates/bt-domain/src/lib.rs`, add `pub meeting_id: Option<uuid::Uuid>,` to `FileMeta`. In `routes/members.rs` `list_member_files`, add `f.meeting_id` to the SELECT and the struct mapping. Re-run `cargo build -p bt-api`, then (after the API is rebuilt/booted) `pnpm gen:api` so `FileMeta` gains `meeting_id`. Commit this small change as part of this task.

Then in `web/lib/query/meetings.ts`:
```typescript
import { useMemberFiles } from "@/lib/query/profile";

/** Files attached to a specific meeting (filtered from the member's files). */
export function useMeetingFiles(memberId: string, meetingId: string) {
  const q = useMemberFiles(memberId);
  return { ...q, data: (q.data ?? []).filter((f) => f.meeting_id === meetingId) };
}
```

- [ ] **Step 2: Add the «Вложения» section to `MeetingDrawer.tsx`**

The drawer already has `meeting.data` with `member_id` + `id`. Import:
```typescript
import { FileDropzone } from "@/components/FileDropzone";
import { useMemberFiles } from "@/lib/query/profile";
import { downloadFile, useDeleteFile } from "@/lib/query/files";
```
Inside the component, after the existing hooks:
```typescript
  const memberFiles = useMemberFiles(meeting.data?.member_id ?? "");
  const delFile = useDeleteFile(meeting.data?.member_id ?? "");
  const attachments = (memberFiles.data ?? []).filter((f) => f.meeting_id === meetingId);
```
Add a section in the drawer body (after the template fields, before the footer):
```tsx
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Вложения</div>
          {attachments.length === 0 ? (
            <p className="text-[12px] text-ink-3">Вложений нет</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {attachments.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                  <button type="button" className="truncate text-left hover:underline" onClick={() => downloadFile(f.id).catch(() => {})}>{f.name}</button>
                  <button type="button" aria-label="Удалить" className="ml-auto text-ink-3 hover:text-ink"
                    onClick={() => { if (confirm("Удалить файл?")) delFile.mutate(f.id); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
          {meeting.data && (
            <FileDropzone
              memberId={meeting.data.member_id}
              meetingId={meetingId}
              onUploaded={() => memberFiles.refetch()}
            />
          )}
        </div>
```
(Place this only when `meeting.data` is loaded — it's inside the loaded branch already.)

- [ ] **Step 3: Upgrade the `file` FieldControl case**

In `web/components/FieldControl.tsx`, the `case "file"` currently renders a dead stub. It has no member/meeting context, so make it a soft note pointing to the attachments section rather than a fake control:
```typescript
    case "file":
      control = (
        <div className="rounded-md border border-dashed border-line-strong bg-bg-tint p-3 text-center text-[12px] text-ink-3">
          Используйте раздел «Вложения» ниже
        </div>
      );
      break;
```
(The dedicated «Вложения» section is the real uploader; the seeded template has no file field, so this branch is essentially documentation. Keep it non-stubby and honest.)

- [ ] **Step 4: Rebuild API + regen types (for the FileMeta.meeting_id field) + run checks**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api && cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api 2>&1 | grep "test result" | head -1`
(Existing `files_includes_meeting_label` test still passes; FileMeta gained a field, not changed one.)
Restart the API on :8080, then `cd web && pnpm gen:api`.
Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/members.rs web/lib/api/schema.d.ts web/lib/query/meetings.ts web/components/MeetingDrawer.tsx web/components/FieldControl.tsx
git commit -m "feat(web): MeetingDrawer attachments section (+ FileMeta.meeting_id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Playwright e2e

**Files:**
- Create: `web/e2e/files.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type Page } from "@playwright/test";

async function openAnnaFiles(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.locator('a[href^="/profile/"]').filter({ hasText: "Анна Лебедева" }).first().click();
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();
  await page.getByRole("link", { name: "Файлы" }).click();
  await expect(page).toHaveURL(/tab=files/);
}

test("upload a file then delete it", async ({ page }) => {
  await openAnnaFiles(page);
  const unique = `e2e-${Date.now()}.txt`;
  // The dropzone's hidden <input type=file> accepts setInputFiles.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: unique, mimeType: "text/plain", buffer: Buffer.from("hello e2e"),
  });
  await expect(page.getByText(unique)).toBeVisible({ timeout: 15_000 });

  // Delete it (confirm auto-accept).
  page.on("dialog", (d) => d.accept());
  await page.getByText(unique).locator("xpath=ancestor::div[1]").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(unique)).toBeHidden({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run** (full stack up: MinIO + API on :8080 + dev DB; Playwright starts `pnpm dev`)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e files`
This test performs a REAL presigned upload to MinIO, so MinIO must be running (`docker compose up -d minio`) and CORS enabled (Task 1). If the upload row doesn't appear, check the browser console for a CORS error on the PUT — confirm `MINIO_API_CORS_ALLOW_ORIGIN` is set and MinIO was recreated. If a selector is ambiguous, refine it (scope to the row); do NOT weaken assertions.

- [ ] **Step 3: Run the full e2e suite (regression)**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e`
Expected: all specs PASS (auth/teamlist/profile/meeting-drawer/goals-crud unaffected).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/files.spec.ts
git commit -m "test(web): files e2e — upload then delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification
- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api` → all PASS (no MinIO required).
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e (MinIO + API up): `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: Files tab → drag a file → it appears; ↓ downloads it (opens MinIO presigned URL); ✕ deletes it; «Скачать .zip» downloads a zip; a seeded file's ↓ shows «Демо-файл недоступен». MeetingDrawer → «Вложения» → upload a file scoped to the meeting → it lists.
- [ ] Then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- Presigned-direct upload → Task 2 (`POST /files` returns presigned PUT) + Task 7 (`uploadFile` PUTs to MinIO) ✓
- Per-file download (presigned GET) → Task 3 + Task 7 (`downloadFile`) ✓
- Delete (row + object best-effort) → Task 2 ✓
- `.zip` (server-built, streamed via binary-safe proxy) → Task 4 + Task 6 ✓
- Drawer attachments («Вложения» section) → Task 9 ✓
- Seed files: download 409, zip skip, delete row-only → Tasks 2/3/4 ✓
- 50 MB limit (client + server validator) → Task 2 DTO + Task 7 `uploadFile` ✓
- MinIO CORS + bucket bootstrap + AppState client → Task 1 ✓
- `uploaded_by` server-derived; kind from mime → Task 2 ✓
- OpenAPI + gen:api → Task 5 ✓
- Ownership 403 on every endpoint → Tasks 2–4 tests ✓
- Backend tests don't require MinIO (presign local, object ops best-effort) → stated + Task 1/2/3/4 tests ✓
- Preserve brand token / Russian copy / FileGlyph / humanSize → enforced in component edits + conventions ✓

**Placeholder scan:** no TBD/TODO; every code step has full code. The aws-sdk-s3 / zip version caveats are explicit version-adjustment notes (not vague placeholders) — the implementer confirms via `cargo build`.

**Type consistency:** `CreateFileRequest`/`FileUpload`/`FileDownload` (Task 2) flow to generated types (Task 5) → `uploadFile`/`downloadFile` (Task 7). `FileMeta.meeting_id` added in Task 9 is produced by `list_member_files` and consumed by the drawer filter. `useDeleteFile(memberId)` signature consistent across Tasks 7/8/9. `zipUrl`/`downloadFile`/`DemoFileError` exports used by Task 8. Storage helpers (`presign_put/get`, `delete_object`, `get_object_bytes`, `kind_from_mime`, `client_from_env`, `bucket_from_env`, `ensure_bucket`) defined in Task 1 and used in Tasks 2–4.

**Known deferrals (per spec):** upload progress bars, thumbnails, rename, orphan-row cleanup, virus scan. CalendarScreen = slice 8.

**One in-plan correction:** Task 9 adds `FileMeta.meeting_id` (a small backend+regen tweak) because the drawer needs to scope attachments to one meeting and the existing `FileMeta` only had `meeting_label`. This is called out explicitly in Task 9 Step 1.
