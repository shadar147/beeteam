use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use crate::routes::members::require_member_access;
use crate::storage;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::Json;
use bt_domain::{CreateFileRequest, FileDownload, FileUpload};
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
    let storage_key = format!("{}/{}/{}", body.member_id, file_id, storage::safe_filename(&body.name));

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
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, key) in rows {
            if key.starts_with("seed/") { continue; }
            if let Some(bytes) = storage::get_object_bytes(&state.s3, &state.bucket, &key).await {
                zw.start_file(&storage::safe_filename(&name), opts).map_err(|e| AppError::BadRequest(e.to_string()))?;
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

    /// Workspace + lead + team + member Anna. Returns (token, anna_id).
    pub(super) async fn seed(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'a@x.io',$2,'Lead','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'team',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let anna: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Анна','FE','anna@x.io','2023','Europe/Moscow','{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "a@x.io").await, anna.0)
    }

    /// A second lead+team+member, foreign to `seed`'s caller. Returns (token, member_id).
    pub(super) async fn seed_foreign(pool: &sqlx::PgPool) -> (String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('F') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let lead: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'b@x.io',$2,'L2','lead'::user_role,40) RETURNING id",
        ).bind(ws.0).bind(&hash).fetch_one(pool).await.unwrap();
        let team: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1,'t2',$2,'2w'::cadence,'private'::visibility) RETURNING id",
        ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
        let bob: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,'Боб','BE','bob@x.io','2023','Europe/Moscow','{5,5,5}','ok'::member_status,'{}',10,'2023-01-01') RETURNING id",
        ).bind(ws.0).bind(team.0).fetch_one(pool).await.unwrap();
        (login_token(pool, "b@x.io").await, bob.0)
    }

    pub(super) async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    pub(super) async fn req(pool: sqlx::PgPool, method: &str, uri: &str, token: &str, body: Option<serde_json::Value>)
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
}
