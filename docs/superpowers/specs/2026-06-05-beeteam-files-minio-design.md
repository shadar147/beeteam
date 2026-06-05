# BeeTeam — Files + MinIO slice — Design Spec

**Date:** 2026-06-05
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-05-29-beeteam-core-design.md` (build-order slice 7)
**Predecessor slices:** EmployeeProfile (slice 4, read-only Files tab), MeetingDrawer (slice 5), Goals CRUD (slice 6) — all merged to `main`.

## Context

The profile's «Файлы» tab is read-only from seed: list/grid views, type filter, stats card, rendered from `files` metadata via `GET /v1/members/:id/files`. Download, «Скачать .zip», and the footer dropzone are stubs; seeded `files.storage_key` values are synthetic (`seed/…`) with no real objects. MinIO is configured in `docker-compose.yml` (S3 :9000, console :9001, root `beeteam`/`beeteam-secret`) and S3 env vars exist in `.env`/`.env.example`, but there is **no** `aws-sdk-s3` dependency, **no** bucket bootstrap, and the Next `/api/v1/[...path]` proxy reads bodies as `req.text()` (not binary-safe). The MeetingDrawer's `file` FieldControl is a stub; the seeded «Базовый» template has no file field.

This slice (7) makes files real: upload, download, delete, meeting attachments, and a server-built .zip — using **presigned-direct** transfer to MinIO (browser ⇄ MinIO directly; bytes never traverse Next/axum except the generated .zip).

## Locked decisions

| Area | Decision |
|------|----------|
| Transfer mechanism | **Presigned-direct.** `POST /v1/files` creates the row + returns a presigned PUT URL; the browser PUTs bytes straight to MinIO :9000. `GET /v1/files/:id/download` returns a presigned GET URL the browser opens. Matches the parent spec |
| Scope (all in v1) | Dropzone upload (Files tab) + per-file download + **delete** + **drawer attachments** + **«Скачать .zip»** |
| Drawer attachments | A dedicated **«Вложения»** section in the MeetingDrawer (upload/list/delete files linked to the meeting via `files.meeting_id`), NOT a template `file` field (the seeded template has none). The `file` FieldControl is also upgraded to the shared uploader for completeness |
| Seeded files | `storage_key` starts with `seed/` and has no object. Download → **409** «демо-файл недоступен»; .zip **skips** them; delete removes the row (object delete skipped) |
| Upload size limit | **50 MB** (client-side check + server `validator` → 400) |
| CORS | MinIO must allow the browser origin for direct PUT/GET → add `MINIO_API_CORS_ALLOW_ORIGIN=*` to the `minio` service env in `docker-compose.yml` |
| Create-flow | Single POST creates the `files` row immediately and returns the presigned PUT. A failed PUT leaves an orphan row (download later 404s) — accepted dev tradeoff; no separate confirm step |
| Bucket bootstrap | API ensures the bucket exists on boot (`ensure_bucket`) |

## Architecture

```
Browser
  FilesTab dropzone / MeetingDrawer «Вложения» / FileRow download·delete
    └─ files.ts: uploadFile / downloadFile / useDeleteFile
         ├─ POST /v1/files (JSON) ─────────────► axum → INSERT row + presign PUT ──► {file_id, upload_url}
         ├─ PUT upload_url (bytes) ────────────► MinIO :9000   (direct, CORS)
         ├─ GET /v1/files/:id/download (JSON) ─► axum → presign GET ──► {download_url}
         │     open download_url ─────────────► MinIO :9000   (direct)
         ├─ DELETE /v1/files/:id ──────────────► axum → delete_object + DELETE row
         └─ GET /api/v1/members/:id/files.zip ─► Next proxy (binary passthrough) → axum → zip(MinIO objects)
axum AppState gains { s3: aws_sdk_s3::Client, bucket: String }; storage.rs wraps presign/get/delete/ensure_bucket.
```

## Backend

### Dependencies + infra
- Workspace deps: `aws-sdk-s3` (feature `rt-tokio` + presigning), `aws-config`, `aws-credential-types`. (Use whatever minimal set compiles; the SDK's `presigning` API is required.)
- `docker-compose.yml`: add `MINIO_API_CORS_ALLOW_ORIGIN: "*"` to the `minio` service environment.
- `main.rs`: read `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`; build an `aws_sdk_s3::Client` with `endpoint_url`, static credentials, region, and `force_path_style(true)`; call `ensure_bucket`; put `s3` + `bucket` into `AppState`.

### `bt-api/src/storage.rs` (new)
- `ensure_bucket(s3, bucket)` — create the bucket if missing (ignore "already owned" errors).
- `presign_put(s3, bucket, key, content_type, expiry) -> String`.
- `presign_get(s3, bucket, key, expiry) -> String`.
- `delete_object(s3, bucket, key)`.
- `get_object_bytes(s3, bucket, key) -> Vec<u8>` (used by the zip builder; returns an error/None for missing keys so the zip can skip).
- `kind_from_mime(mime: &str, name: &str) -> &'static str` — maps to the `file_kind` enum (`pdf`/`img`/`video`/`sheet`/`doc`), defaulting to `doc`.
- Expiry constant (e.g. 900s).

### DTOs (`bt-domain`)
```rust
#[derive(Deserialize, ToSchema, Validate)]
pub struct CreateFileRequest {
    pub member_id: uuid::Uuid,
    pub meeting_id: Option<uuid::Uuid>,
    pub name: String,
    pub mime: String,
    #[validate(range(min = 1, max = 52_428_800, message = "file too large"))] // 50 MB
    pub size_bytes: i64,
}
#[derive(Serialize, ToSchema)]
pub struct FileUpload { pub file_id: uuid::Uuid, pub upload_url: String }
#[derive(Serialize, ToSchema)]
pub struct FileDownload { pub download_url: String }
```
Reuse the existing `FileMeta` for list responses (unchanged).

### Endpoints (`routes/files.rs`, under `require_auth` + ownership)
```
POST   /v1/files
  body CreateFileRequest → 201 FileUpload
  validate; require_member_access(body.member_id); kind = kind_from_mime;
  storage_key = "{member_id}/{uuid}/{name}"; uploaded_by = caller's name;
  INSERT files (...); upload_url = presign_put(key, mime); return {file_id, upload_url}
GET    /v1/files/:id/download
  → 200 FileDownload
  resolve member from row → guard; if storage_key starts with "seed/" → 409 Conflict
  «демо-файл недоступен»; else download_url = presign_get(key) → {download_url}
DELETE /v1/files/:id
  → 204
  resolve member from row → guard; if not a seed key → delete_object(key); DELETE row
GET    /v1/members/:id/files.zip
  → 200 application/zip
  require_member_access(member_id); build a zip of the member's files (get_object_bytes per
  non-seed key, skip missing); Content-Disposition: attachment; filename "files.zip"
```
- `uploaded_by` is the authenticated caller's display name (looked up from `users` by `auth.id`), not client-supplied.
- Member resolution for download/delete mirrors the goals/meetings pattern (`SELECT member_id FROM files WHERE id=$1` → 404 if none → `require_member_access`).
- `POST /v1/files` ownership covers `meeting_id` implicitly (the meeting belongs to the same member); no extra meeting check needed in v1.

### Backend tests (sqlx + a test MinIO or presign-shape assertions)
- `POST /v1/files`: 201 with a non-empty `upload_url`, a `files` row created with the derived `kind` and a non-seed `storage_key`; foreign member → 403; `size_bytes` over 50 MB → 400.
- `download`: a seed-key file → 409; a normally-created file → 200 with a `download_url`; foreign → 403.
- `delete`: → 204, row gone; foreign → 403.
- `files.zip`: → 200 `application/zip`, body starts with the zip magic (`PK`); foreign → 403.
- The S3 interactions in tests run against the dev/test MinIO (the API already has an `s3` client); if wiring a real MinIO into `#[sqlx::test]` is impractical, presign helpers are unit-tested for URL shape (contains bucket + key) and the handlers' DB/authz effects are asserted with the object-store calls tolerant of a missing object. (The plan picks the concrete approach; prefer real MinIO if reachable on :9000 in the test environment, else assert DB + presign-shape.)

## Frontend

### Next proxy — binary-safe responses
`web/app/api/v1/[...path]/route.ts`: when the upstream response `content-type` is not JSON (e.g. `application/zip`), return `new NextResponse(res.body)` / `await res.arrayBuffer()` instead of `res.text()`, preserving `content-type` and `content-disposition`. Requests stay JSON (binary upload bypasses the proxy via presigned-direct).

### Hooks + helpers (`web/lib/query/files.ts`)
- `uploadFile(file: File, opts: { memberId: string; meetingId?: string })` — `POST /v1/files` → `fetch(upload_url, { method: "PUT", headers: {"content-type": file.type}, body: file })` → on success invalidate `["member-files", memberId]` (and the meeting's attachment query). Throws on either step's failure.
- `useDeleteFile(memberId)` — `DELETE /v1/files/:id`, invalidates `["member-files", memberId]`.
- `downloadFile(id)` — `GET /v1/files/:id/download` → `window.open(download_url)`; on 409 throw a typed error so the UI shows «Демо-файл недоступен».
- `.zip`: a plain link/handler opening `/api/v1/members/:id/files.zip`.
- Mirror the slice-5/6 invalidation style; `uploadFile` is a plain async fn used inside `FileDropzone` (with local pending/error state), not necessarily a `useMutation`.

### Components
- `FileDropzone` (`web/components/FileDropzone.tsx`) — drag-and-drop + click-to-pick (`<input type=file>`), client-side 50 MB guard, pending/error state, calls `uploadFile`. Reused in the Files tab footer and the drawer «Вложения» section.
- `FilesTab`: replace the footer stub with `FileDropzone` (memberId); wire `FileRow`/`FileTile` download (↓ → `downloadFile`, 409 toast) + a delete control (confirm → `useDeleteFile`); «Скачать .zip» → open the zip URL.
- `FileRow`/`FileTile`: gain working download + an optional delete affordance (kebab/✕) — keep them backward-compatible (props optional) so existing tests pass.
- `MeetingDrawer`: add a **«Вложения»** section — lists files where `meeting_id = meeting.id` (a small `useMeetingFiles(meetingId)` query or filter), a `FileDropzone` (uploads with `meetingId` + the meeting's `member_id`), and per-file download/delete. Upgrade `FieldControl`'s `file` case to render `FileDropzone` (so it's functional if a template ever includes a file field).

### States
Upload: pending (spinner/“Загрузка…”), error inline («Не удалось загрузить файл»), size-over-limit blocked client-side. Download of a seed file → toast «Демо-файл недоступен для скачивания». Delete failure → toast, row stays. Empty attachments → «Вложений нет».

### Frontend tests
- Vitest: `FileDropzone` (selecting a file calls `uploadFile` with `{name, mime, size}` + PUTs to the returned url — fetch mocked; size-over-limit shows an error and does not upload). `FileRow` download/delete controls invoke the right handlers.
- Playwright e2e: profile → Файлы → upload a small file via `setInputFiles` → the new row appears → delete it → it disappears. (.zip and real download are smoke-checked via the API in the plan's verification.)

## Scope

### In scope
Backend: `aws-sdk-s3` wiring + `storage.rs` + bucket bootstrap + CORS; `CreateFileRequest`/`FileUpload`/`FileDownload` DTOs; `POST /v1/files`, `GET /v1/files/:id/download`, `DELETE /v1/files/:id`, `GET /v1/members/:id/files.zip`; OpenAPI + types. Frontend: binary-safe proxy; `files.ts` (uploadFile/downloadFile/useDeleteFile); `FileDropzone`; FilesTab upload/download/delete/zip wiring; MeetingDrawer «Вложения» section; `file` FieldControl upgrade; states.

### Deferred / stays stub
Upload progress bars beyond a spinner; multi-file drag batching niceties; virus scanning; per-file rename; thumbnails/previews; orphan-row cleanup job. CalendarScreen = slice 8.

### Boundary note
The slice manages `files` rows + their MinIO objects for members on the caller's team (and meeting-linked files via `meeting_id`). It does not change meetings/goals data. Bytes flow browser⇄MinIO directly except the generated `.zip`, which streams through the API + binary-safe proxy.

## Build order (vertical sub-steps)
1. Deps + `docker-compose` CORS + `storage.rs` (client init, `ensure_bucket`, presign/get/delete helpers, `kind_from_mime`) + `AppState { s3, bucket }` + `main.rs` wiring.
2. `CreateFileRequest`/`FileUpload`/`FileDownload` DTOs; `POST /v1/files` + `DELETE /v1/files/:id` + tests.
3. `GET /v1/files/:id/download` (seed → 409) + tests.
4. `GET /v1/members/:id/files.zip` + tests.
5. OpenAPI registration + `pnpm gen:api`.
6. Next proxy binary-safe responses.
7. `files.ts` hooks/helpers + `FileDropzone` + Vitest.
8. FilesTab upload/download/delete/zip wiring (FileRow/FileTile controls).
9. MeetingDrawer «Вложения» section + `file` FieldControl upgrade.
10. Playwright e2e, then merge.

## What to preserve when porting
Warm beige palette; amber on the `brand` token (NOT `accent`); tabular-nums on sizes/counts/dates; Russian microcopy verbatim («Скачать .zip», «Загрузить», «Перетащите файлы сюда», «Вложения», «Вложений нет», «Демо-файл недоступен для скачивания», «Не удалось загрузить файл»); the type-colored `FileGlyph`; the existing `humanSize`/`FILE_KINDS`; meaningful empty/error states; `[data-theme]`/`[data-density]` tokens. Reuse the existing read-only `FileRow`/`FileTile`/`FileGlyph`/`FilesTab` (extended, not rewritten) and the slice-5/6 ownership + invalidation patterns.
