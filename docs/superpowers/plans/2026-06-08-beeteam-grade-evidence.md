# Grade Evidence in 1-2-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the lead capture demonstrated competencies during a 1-2-1 (block + level + note + status), accumulate them per member, and surface them on the profile «Грейд» tab as a timeline and as growth-checklist counts.

**Architecture:** One `grade_evidence` table + `evidence_status` enum. Three endpoints (`POST /v1/evidence`, `DELETE /v1/evidence/{id}`, `GET /v1/members/{id}/evidence`) mirroring the existing competency-mutation handlers. A new capture section in the (single-scroll) `MeetingDrawer`, split into a pure `CompetencyCaptureView` + a hook-wiring container. The profile tab replaces the `EvidencePlaceholder` with a real timeline and wires counts into `GrowChecklist`.

**Tech Stack:** Rust (axum, sqlx, utoipa, validator) · Postgres · Next.js 14 (App Router, TanStack Query, openapi-fetch) · Vitest + Testing Library · Playwright.

**Spec:** `docs/superpowers/specs/2026-06-08-beeteam-grade-evidence-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `api/crates/bt-db/migrations/0006_grade_evidence.sql` | enum + `grade_evidence` table | Create |
| `api/crates/bt-domain/src/lib.rs` | `Evidence`, `CreateEvidence` DTOs | Modify |
| `api/crates/bt-api/src/routes/evidence.rs` | POST/GET/DELETE handlers + tests | Create |
| `api/crates/bt-api/src/routes/mod.rs` | `pub mod evidence;` | Modify |
| `api/crates/bt-api/src/app.rs` | mount routes | Modify |
| `api/crates/bt-api/src/openapi.rs` | register paths + schemas | Modify |
| `web/lib/api/schema.d.ts` | regenerated types | Regen |
| `api/crates/bt-db/src/seed.rs` | seed Анна's evidence + seed test | Modify |
| `web/lib/query/evidence.ts` | `useMemberEvidence` / `useCreateEvidence` / `useDeleteEvidence` | Create |
| `web/components/meeting/CompetencyCaptureView.tsx` | pure capture UI | Create |
| `web/components/meeting/CompetencyCapture.tsx` | hook-wiring container | Create |
| `web/components/MeetingDrawer.tsx` | mount the capture section | Modify |
| `web/components/grades/EvidenceTimeline.tsx` | profile evidence list | Create |
| `web/components/grades/EvidencePlaceholder.tsx` | (removed — replaced by timeline) | Delete |
| `web/components/grades/GrowChecklist.tsx` | optional per-item evidence count | Modify |
| `web/app/(app)/profile/[id]/GradeTab.tsx` | add evidence query; wire timeline + counts | Modify |
| `web/components/__tests__/EvidenceViews.test.tsx` | unit tests | Create |
| `web/e2e/grade-evidence.spec.ts` | e2e | Create |

---

### Task 1: Migration — grade_evidence

**Files:**
- Create: `api/crates/bt-db/migrations/0006_grade_evidence.sql`

- [ ] **Step 1: Write the migration**

`api/crates/bt-db/migrations/0006_grade_evidence.sql`:

```sql
-- Grade evidence captured during 1-2-1s (slice #3).
CREATE TYPE evidence_status AS ENUM ('demonstrated', 'partial');

CREATE TABLE grade_evidence (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  block_id   uuid NOT NULL REFERENCES grade_blocks(id),
  level_ord  int  NOT NULL CHECK (level_ord BETWEEN 1 AND 7),
  status     evidence_status NOT NULL DEFAULT 'demonstrated',
  note       text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grade_evidence_member ON grade_evidence(member_id, created_at DESC);
CREATE INDEX idx_grade_evidence_meeting ON grade_evidence(meeting_id);
```

Confirm `0006` is the next number (highest existing is `0005_member_grades`).

- [ ] **Step 2: Verify the migration applies**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-db seed_is_idempotent_and_loads_team`
Expected: PASS (the harness applies all migrations including 0006). Test DB is Postgres on host port 5433; if unreachable, report — do not change config.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/migrations/0006_grade_evidence.sql
git commit -m "feat(db): grade_evidence table + evidence_status enum (slice #3)"
```

---

### Task 2: Domain DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`

**Context:** The file uses `use serde::{Deserialize, Serialize};`, `use utoipa::ToSchema;`, and `use validator::Validate;`. Request DTOs derive `Deserialize, ToSchema, Validate`; response DTOs derive `Debug, Clone, Serialize, Deserialize, ToSchema`. Match the existing `CreateCompetencyRequest` style (it uses `#[validate(range(...))]`).

- [ ] **Step 1: Add the DTOs**

Append near the other grade DTOs in `api/crates/bt-domain/src/lib.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Evidence {
    pub id: uuid::Uuid,
    pub meeting_id: Option<uuid::Uuid>,
    pub block_key: String,
    pub block_name: String,
    pub level_ord: i32,
    pub status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, ToSchema, Validate)]
pub struct CreateEvidence {
    pub member_id: uuid::Uuid,
    pub meeting_id: Option<uuid::Uuid>,
    pub block_id: uuid::Uuid,
    #[validate(range(min = 1, max = 7, message = "level_ord must be 1..7"))]
    pub level_ord: i32,
    pub status: String,
    pub note: String,
}
```

(If the existing DTOs reference these traits via different import aliases, match them — read the top of the file first.)

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: success.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs
git commit -m "feat(domain): Evidence + CreateEvidence DTOs (slice #3)"
```

---

### Task 3: API handlers + routes

**Files:**
- Create: `api/crates/bt-api/src/routes/evidence.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs` (add `pub mod evidence;`)
- Modify: `api/crates/bt-api/src/app.rs` (mount routes)

**Context:** Follow `routes/goals.rs`'s competency handlers exactly: `body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;` then `require_member_access(&auth, member_id, &state.pool).await?;`. `require_member_access` lives in `routes::members`. The enum is written with `$n::evidence_status` and read with `status::text` (mirrors `member_status` usage). Use `chrono::DateTime<chrono::Utc>` for `created_at` and `.to_rfc3339()` to stringify.

- [ ] **Step 1: Write the handlers**

`api/crates/bt-api/src/routes/evidence.rs`:

```rust
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use bt_domain::{CreateEvidence, Evidence};
use uuid::Uuid;
use validator::Validate;

use crate::app::AppState;
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;

type EvRow = (
    Uuid, Option<Uuid>, String, String, i32, String, String, chrono::DateTime<chrono::Utc>,
);

const EV_SELECT: &str = "SELECT ge.id, ge.meeting_id, gb.key, gb.name, ge.level_ord, \
    ge.status::text, ge.note, ge.created_at \
    FROM grade_evidence ge JOIN grade_blocks gb ON gb.id = ge.block_id";

fn ev_from(r: EvRow) -> Evidence {
    Evidence {
        id: r.0,
        meeting_id: r.1,
        block_key: r.2,
        block_name: r.3,
        level_ord: r.4,
        status: r.5,
        note: r.6,
        created_at: r.7.to_rfc3339(),
    }
}

async fn ev_member(pool: &sqlx::PgPool, id: Uuid) -> AppResult<Uuid> {
    let r: Option<(Uuid,)> = sqlx::query_as("SELECT member_id FROM grade_evidence WHERE id = $1")
        .bind(id).fetch_optional(pool).await?;
    Ok(r.ok_or(AppError::NotFound)?.0)
}

#[utoipa::path(
    post, path = "/v1/evidence", request_body = CreateEvidence,
    responses((status = 201, body = Evidence), (status = 400), (status = 403))
)]
pub async fn create_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<CreateEvidence>,
) -> AppResult<(StatusCode, Json<Evidence>)> {
    body.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;
    if body.status != "demonstrated" && body.status != "partial" {
        return Err(AppError::BadRequest("status must be demonstrated|partial".into()));
    }
    require_member_access(&auth, body.member_id, &state.pool).await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO grade_evidence (member_id, meeting_id, block_id, level_ord, status, note, created_by) \
         VALUES ($1,$2,$3,$4,$5::evidence_status,$6,$7) RETURNING id",
    )
    .bind(body.member_id).bind(body.meeting_id).bind(body.block_id)
    .bind(body.level_ord).bind(&body.status).bind(&body.note).bind(auth.id)
    .fetch_one(&state.pool).await?;

    let r: EvRow = sqlx::query_as(&format!("{EV_SELECT} WHERE ge.id = $1"))
        .bind(id.0).fetch_one(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(ev_from(r))))
}

#[utoipa::path(
    delete, path = "/v1/evidence/{id}",
    params(("id" = uuid::Uuid, Path, description = "Evidence id")),
    responses((status = 204), (status = 403), (status = 404))
)]
pub async fn delete_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let member_id = ev_member(&state.pool, id).await?;
    require_member_access(&auth, member_id, &state.pool).await?;
    sqlx::query("DELETE FROM grade_evidence WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get, path = "/v1/members/{id}/evidence",
    params(("id" = uuid::Uuid, Path, description = "Member id")),
    responses((status = 200, body = [Evidence]), (status = 403))
)]
pub async fn list_member_evidence(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(member_id): Path<Uuid>,
) -> AppResult<Json<Vec<Evidence>>> {
    require_member_access(&auth, member_id, &state.pool).await?;
    let rows: Vec<EvRow> = sqlx::query_as(&format!("{EV_SELECT} WHERE ge.member_id = $1 ORDER BY ge.created_at DESC"))
        .bind(member_id).fetch_all(&state.pool).await?;
    Ok(Json(rows.into_iter().map(ev_from).collect()))
}
```

- [ ] **Step 2: Register module + routes**

In `api/crates/bt-api/src/routes/mod.rs`, add `pub mod evidence;` (alongside the other `pub mod` lines).

In `api/crates/bt-api/src/app.rs`, after the `/v1/members/:id/grade` route, add:

```rust
        .route("/v1/members/:id/evidence", get(routes::evidence::list_member_evidence))
        .route("/v1/evidence", axum::routing::post(routes::evidence::create_evidence))
        .route("/v1/evidence/:id", axum::routing::delete(routes::evidence::delete_evidence))
```

- [ ] **Step 3: Write the failing tests**

Add a `#[cfg(test)] mod tests` to `evidence.rs`. Copy the `app(pool)` and `login_token` helpers verbatim from `api/crates/bt-api/src/routes/grades.rs`'s test module (same imports: `axum::body::Body`, `axum::http::{Request, StatusCode}`, `http_body_util::BodyExt`, `tower::ServiceExt`). Then:

```rust
    async fn igor_and_block(pool: &sqlx::PgPool) -> (uuid::Uuid, uuid::Uuid) {
        let m: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM team_members WHERE name = 'Игорь Петров'")
            .fetch_one(pool).await.unwrap();
        // a backend block (Игорь is backend)
        let b: (uuid::Uuid,) = sqlx::query_as(
            "SELECT gb.id FROM grade_blocks gb JOIN disciplines d ON d.id = gb.discipline_id \
             WHERE d.key = 'backend' AND gb.key = 'stack'",
        ).fetch_one(pool).await.unwrap();
        (m.0, b.0)
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_then_list_evidence(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":4,"status":"demonstrated","note":"good"}}"#
        );
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["block_key"], "stack");
        assert_eq!(json["level_ord"], 4);

        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/members/{member}/evidence"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let arr: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(arr.as_array().unwrap().iter().any(|e| e["block_key"] == "stack"));
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_rejects_bad_level(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":9,"status":"demonstrated","note":""}}"#
        );
        let resp = app(pool).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn create_rejects_bad_status(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":3,"status":"bogus","note":""}}"#
        );
        let resp = app(pool).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn delete_evidence_then_404(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let (member, block) = igor_and_block(&pool).await;
        let body = format!(
            r#"{{"member_id":"{member}","meeting_id":null,"block_id":"{block}","level_ord":2,"status":"partial","note":""}}"#
        );
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/evidence")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body)).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"].as_str().unwrap().to_string();

        let resp = app(pool.clone()).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/evidence/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let resp = app(pool).oneshot(
            Request::builder().method("DELETE").uri(format!("/v1/evidence/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn list_evidence_forbidden_for_foreign_member(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET")
                .uri(format!("/v1/members/{}/evidence", uuid::Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 4: Verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-api evidence`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/evidence.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): evidence create/list/delete endpoints (slice #3)"
```

---

### Task 4: Register OpenAPI + regen types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`
- Regen: `web/lib/api/schema.d.ts`

- [ ] **Step 1: Register**

In `api/crates/bt-api/src/openapi.rs`:
- add to `paths(...)`: `crate::routes::evidence::create_evidence, crate::routes::evidence::delete_evidence, crate::routes::evidence::list_member_evidence,`
- add to `components(schemas(...))`: `bt_domain::Evidence, bt_domain::CreateEvidence,`

- [ ] **Step 2: Build**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Expected: success.

- [ ] **Step 3: Regenerate web types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Verify: `grep -c "CreateEvidence" web/lib/api/schema.d.ts` > 0 and `grep -c "members/{id}/evidence" web/lib/api/schema.d.ts` > 0.
(If `gen:api` needs the API running, start it first: `cd /Users/lebedev.v/projects/beeteam && cargo run -p bt-api --manifest-path api/Cargo.toml &` then re-run; report if it fails.)

- [ ] **Step 4: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit (verify HEAD advances — known schema.d.ts commit quirk)**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register evidence paths + regen web types (slice #3)"
git status --porcelain    # must be empty for these files
git log --oneline -1      # must show this commit; if schema.d.ts still modified, re-run add+commit
```

---

### Task 5: Seed Анна's evidence

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs`

**Context:** Insert just before the final `tx.commit().await?;` (after the member-grades block added in slice #2). Available locals: `lead_id` (the lead user uuid), `anna_id: Option<Uuid>` (Анна's team_member id), `ws_id`. Анна's discipline is `frontend`; block keys are uniform (`stack`/`core`/`arch`/`infra`/`ai`/`impact`). Tie evidence to her existing `done` meetings (queryable in `tx` since they were inserted earlier). Status enum is written with `$n::evidence_status`.

- [ ] **Step 1: Write the failing seed test**

Add to the `#[cfg(test)] mod tests` block in `seed.rs`:

```rust
    #[sqlx::test(migrations = "./migrations")]
    async fn seed_loads_grade_evidence(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let n: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM grade_evidence ge \
             JOIN team_members tm ON tm.id = ge.member_id \
             WHERE tm.name = 'Анна Лебедева'",
        ).fetch_one(&pool).await.unwrap();
        assert!(n.0 >= 4, "Анна has seeded evidence");
    }
```

Run `cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-db seed_loads_grade_evidence` → confirm FAIL (0 rows).

- [ ] **Step 2: Write the seed insertion**

Insert before the final `tx.commit().await?;` in `seed_demo`:

```rust
    // ── Grade evidence for Анна (slice #3), tied to her recent done meetings ──
    {
        let aid = anna_id.expect("seed: Anna must exist");
        let fe: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM disciplines WHERE key = 'frontend' AND workspace_id = $1",
        ).bind(ws_id).fetch_one(&mut *tx).await?;
        // her two most recent done meetings (may be fewer; we guard with get())
        let done: Vec<(uuid::Uuid,)> = sqlx::query_as(
            "SELECT id FROM meetings WHERE member_id = $1 AND state = 'done' ORDER BY date DESC",
        ).bind(aid).fetch_all(&mut *tx).await?;
        let m0 = done.get(0).map(|r| r.0);
        let m1 = done.get(1).map(|r| r.0);
        // (block_key, level, status, meeting, note)
        let ev: [(&str, i32, &str, Option<uuid::Uuid>, &str); 6] = [
            ("arch",   6, "demonstrated", m0, "Спроектировала миграцию админ-кабинета — декомпозиция на модули, ADR по shared-state."),
            ("impact", 5, "demonstrated", m0, "Менторский ритм с Тимуром — 4/4 ревью за месяц."),
            ("arch",   6, "partial",      m1, "Начала проектировать модульную систему фичефлагов, не хватило alignment с платформой."),
            ("impact", 5, "demonstrated", m1, "Сильно вытянула собеседование — кандидат принял оффер."),
            ("stack",  6, "demonstrated", m0, "Задала критерии успеха редизайна, выступила как tech-owner на план-сессии."),
            ("ai",     6, "demonstrated", m1, "Настроила shared prompts и MCP-сервер для команды фронтенда."),
        ];
        for (bkey, level, status, meeting, note) in ev.iter() {
            let block: (uuid::Uuid,) = sqlx::query_as(
                "SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2",
            ).bind(*bkey).bind(fe.0).fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO grade_evidence (member_id, meeting_id, block_id, level_ord, status, note, created_by) \
                 VALUES ($1,$2,$3,$4,$5::evidence_status,$6,$7)",
            )
            .bind(aid).bind(*meeting).bind(block.0).bind(*level).bind(*status).bind(*note).bind(lead_id)
            .execute(&mut *tx).await?;
        }
    }
```

- [ ] **Step 3: Verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-db seed_loads_grade_evidence` → PASS.
Then: `cd /Users/lebedev.v/projects/beeteam/api && cargo test -p bt-db` → ALL pass (incl. idempotency).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/src/seed.rs
git commit -m "feat(seed): grade evidence for Анна (slice #3)"
```

---

### Task 6: Web query module

**Files:**
- Create: `web/lib/query/evidence.ts`

**Context:** Mirror `web/lib/query/goals.ts` mutation hooks (useMutation + invalidateQueries).

- [ ] **Step 1: Write the module**

`web/lib/query/evidence.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Evidence = components["schemas"]["Evidence"];
export type CreateEvidence = components["schemas"]["CreateEvidence"];

export function useMemberEvidence(id: string) {
  return useQuery<Evidence[]>({
    queryKey: ["member-evidence", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/evidence", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateEvidence(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateEvidence) => {
      const { data, error } = await api.POST("/v1/evidence", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-evidence", memberId] }),
  });
}

export function useDeleteEvidence(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/evidence/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-evidence", memberId] }),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/evidence.ts
git commit -m "feat(web): evidence query hooks (slice #3)"
```

---

### Task 7: Capture UI (view + container) + drawer mount

**Files:**
- Create: `web/components/meeting/CompetencyCaptureView.tsx` (pure)
- Create: `web/components/meeting/CompetencyCapture.tsx` (container)
- Modify: `web/components/MeetingDrawer.tsx`
- Create: `web/components/__tests__/EvidenceViews.test.tsx` (covers the View)

**Context:** The View is pure (no hooks) and unit-tested directly. The container wires `useMemberGrade`, `useGradesFramework`, `useMemberEvidence`, `useCreateEvidence`, `useDeleteEvidence`, maps a block key → block id via the framework discipline, and filters the logged list to the current meeting. Reuse `GradeChip` (`@/components/grades/GradeChip`).

- [ ] **Step 1: Write the failing View test**

`web/components/__tests__/EvidenceViews.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CompetencyCaptureView } from "../meeting/CompetencyCaptureView";

const GRADE = {
  gradeOrd: 4, gradeCode: "IC4", gradeName: "Middle+", disciplineLabel: "Backend",
  targetOrd: 5, targetCode: "IC5", readyMonths: 2,
};
const BLOCKS = [{ key: "stack", name: "Серверный стек" }, { key: "core", name: "Базы данных" }];
const LEVELS = [
  { ord: 1, code: "IC1" }, { ord: 2, code: "IC2" }, { ord: 3, code: "IC3" }, { ord: 4, code: "IC4" },
  { ord: 5, code: "IC5" }, { ord: 6, code: "IC6" }, { ord: 7, code: "IC7" },
];

describe("CompetencyCaptureView", () => {
  it("shows the no-grade fallback", () => {
    render(
      <CompetencyCaptureView grade={null} blocks={[]} growthHints={[]} levels={[]} logged={[]}
        onAdd={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByText(/не назначен грейд/)).toBeInTheDocument();
  });

  it("adds evidence with the selected block, level and demonstrated status", () => {
    const onAdd = vi.fn();
    render(
      <CompetencyCaptureView grade={GRADE} blocks={BLOCKS} growthHints={[]} levels={LEVELS} logged={[]}
        onAdd={onAdd} onRemove={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Блок"), { target: { value: "core" } });
    fireEvent.change(screen.getByLabelText("Заметка"), { target: { value: "профилировал N+1" } });
    fireEvent.click(screen.getByRole("button", { name: "Отметить IC5" }));
    expect(onAdd).toHaveBeenCalledWith("core", 5, "demonstrated", "профилировал N+1");
  });

  it("renders logged rows and removes", () => {
    const onRemove = vi.fn();
    render(
      <CompetencyCaptureView grade={GRADE} blocks={BLOCKS} growthHints={[]} levels={LEVELS}
        logged={[{ id: "e1", blockName: "Серверный стек", level: 4, status: "demonstrated", note: "ок" }]}
        onAdd={() => {}} onRemove={onRemove} />,
    );
    expect(screen.getByText("ок")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить свидетельство" }));
    expect(onRemove).toHaveBeenCalledWith("e1");
  });
});
```

Run `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec vitest run EvidenceViews` → confirm FAIL.

- [ ] **Step 2: Write `CompetencyCaptureView.tsx`**

```tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { GradeChip } from "@/components/grades/GradeChip";

type Grade = {
  gradeOrd: number; gradeCode: string; gradeName: string; disciplineLabel: string;
  targetOrd: number | null; targetCode: string | null; readyMonths: number;
};
type LoggedRow = { id: string; blockName: string; level: number; status: string; note: string };
type Hint = { key: string; name: string; text: string };

export function CompetencyCaptureView({
  grade, blocks, growthHints, levels, logged, onAdd, onRemove,
}: {
  grade: Grade | null;
  blocks: { key: string; name: string }[];
  growthHints: Hint[];
  levels: { ord: number; code: string }[];
  logged: LoggedRow[];
  onAdd: (blockKey: string, level: number, status: string, note: string) => void;
  onRemove: (id: string) => void;
}) {
  const [block, setBlock] = useState("");
  const [note, setNote] = useState("");

  if (!grade) {
    return <p className="text-[13px] text-ink-3">У сотрудника не назначен грейд (другая карьерная лестница).</p>;
  }

  function add(level: number, status: string) {
    if (!block) return;
    onAdd(block, level, status, note.trim());
    setBlock(""); setNote("");
  }

  const promo = grade.targetOrd != null && grade.targetOrd > grade.gradeOrd;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-tint p-2.5">
        <GradeChip ord={grade.gradeOrd} code={grade.gradeCode} size="sm" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{grade.gradeName} · {grade.disciplineLabel}</div>
          <div className="text-[11.5px] text-ink-3">
            {promo ? `цель — ${grade.targetCode} · стабильно ${grade.readyMonths} мес` : "подтверждает текущий уровень"}
          </div>
        </div>
      </div>

      {growthHints.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Что важно увидеть для {grade.targetCode}</div>
          {growthHints.map((h) => (
            <button key={h.key} type="button" onClick={() => setBlock(h.key)}
              className={cn("flex w-full items-start gap-2 rounded-md border p-2 text-left",
                block === h.key ? "border-brand bg-brand-soft" : "border-line hover:bg-bg-tint")}>
              <span className="text-[12.5px] font-semibold text-ink">{h.name}</span>
              <span className="flex-1 text-[11.5px] text-ink-3">{h.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <label htmlFor="ev-block" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Блок</label>
        <select id="ev-block" aria-label="Блок" value={block} onChange={(e) => setBlock(e.target.value)}
          className="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink">
          <option value="">— выберите блок —</option>
          {blocks.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
        </select>
        <label htmlFor="ev-note" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Заметка</label>
        <input id="ev-note" aria-label="Заметка" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Что конкретно проявил (контекст для ревью)…"
          className="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink" />
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Уровень проявления</div>
        <div className={cn("flex flex-wrap gap-1.5", !block && "pointer-events-none opacity-40")}>
          {levels.map((l) => (
            <button key={l.ord} type="button" aria-label={`Отметить ${l.code}`} onClick={() => add(l.ord, "demonstrated")}
              className="rounded-md border border-line p-0.5 hover:bg-bg-tint">
              <GradeChip ord={l.ord} code={l.code} size="sm" />
            </button>
          ))}
          <button type="button" disabled={!block} onClick={() => block && add(grade.gradeOrd, "partial")}
            className="rounded-md border border-line px-2 text-[11px] text-ink-3 hover:bg-bg-tint disabled:opacity-40">
            частично
          </button>
        </div>
      </div>

      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Отмечено в этой встрече ({logged.length})</div>
      {logged.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Пока ничего. Свидетельства накапливаются от встречи к встрече — так видно, стабильно сотрудник проявляет уровень или эпизодически.
        </p>
      ) : (
        <div className="space-y-1.5">
          {logged.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border border-line p-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", c.status === "partial" ? "bg-warn" : "bg-ok")} />
              <span className="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{c.blockName} · IC{c.level}</span>
              <span className="flex-1 truncate text-[12.5px] text-ink-2">{c.note || "без заметки"}</span>
              <button type="button" aria-label="Удалить свидетельство" onClick={() => onRemove(c.id)}
                className="text-ink-3 hover:text-ink">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the View test**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec vitest run EvidenceViews` → 3 tests PASS.

- [ ] **Step 4: Write the container `CompetencyCapture.tsx`**

```tsx
"use client";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { useMemberEvidence, useCreateEvidence, useDeleteEvidence } from "@/lib/query/evidence";
import { CompetencyCaptureView } from "./CompetencyCaptureView";

export function CompetencyCapture({ memberId, meetingId }: { memberId: string; meetingId: string }) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);
  const ev = useMemberEvidence(memberId);
  const create = useCreateEvidence(memberId);
  const del = useDeleteEvidence(memberId);

  if (fw.isLoading || mg.isLoading) return <p className="text-[12.5px] text-ink-3">Загрузка…</p>;

  const grade = mg.data ?? null;
  const framework = fw.data;
  const discipline = grade && framework ? framework.disciplines.find((d) => d.key === grade.discipline_key) : undefined;

  if (!grade || !discipline) {
    return <CompetencyCaptureView grade={null} blocks={[]} growthHints={[]} levels={[]} logged={[]} onAdd={() => {}} onRemove={() => {}} />;
  }

  const levels = [...framework!.levels].sort((a, b) => a.ord - b.ord);
  const levelByOrd = (ord: number) => levels.find((l) => l.ord === ord);
  const blockIdByKey = (key: string) => discipline.blocks.find((b) => b.key === key)?.id;
  const blockLevelOf = (key: string) => grade.block_levels.find((bl) => bl.block_key === key)?.level_ord ?? grade.grade_ord;

  const growthHints =
    grade.target_ord != null
      ? discipline.blocks
          .filter((b) => blockLevelOf(b.key) < grade.target_ord!)
          .map((b) => ({ key: b.key, name: b.name, text: b.cells.find((c) => c.level === grade.target_ord)?.text ?? "" }))
          .filter((h) => h.text.length > 0)
      : [];

  const logged = (ev.data ?? [])
    .filter((e) => e.meeting_id === meetingId)
    .map((e) => ({ id: e.id, blockName: e.block_name, level: e.level_ord, status: e.status, note: e.note }));

  const target = grade.target_ord != null ? levelByOrd(grade.target_ord) ?? null : null;

  return (
    <CompetencyCaptureView
      grade={{
        gradeOrd: grade.grade_ord,
        gradeCode: levelByOrd(grade.grade_ord)?.code ?? "",
        gradeName: levelByOrd(grade.grade_ord)?.name ?? "",
        disciplineLabel: discipline.label,
        targetOrd: grade.target_ord,
        targetCode: target?.code ?? null,
        readyMonths: grade.ready_months,
      }}
      blocks={discipline.blocks.map((b) => ({ key: b.key, name: b.name }))}
      growthHints={growthHints}
      levels={levels.map((l) => ({ ord: l.ord, code: l.code }))}
      logged={logged}
      onAdd={(blockKey, level, status, note) => {
        const block_id = blockIdByKey(blockKey);
        if (!block_id) return;
        create.mutate({ member_id: memberId, meeting_id: meetingId, block_id, level_ord: level, status, note });
      }}
      onRemove={(id) => del.mutate(id)}
    />
  );
}
```

- [ ] **Step 5: Mount in `MeetingDrawer.tsx`**

Add the import at the top: `import { CompetencyCapture } from "@/components/meeting/CompetencyCapture";`

In the render, right AFTER the «Вложения» section's closing `</div>` (the block that starts with `<div className="mt-4 border-t border-line pt-3">` for attachments) and still inside the `<>...</>`, add:

```tsx
              {meeting.data && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Проявленные компетенции</div>
                  <CompetencyCapture memberId={meeting.data.member_id} meetingId={meetingId} />
                </div>
              )}
```

- [ ] **Step 6: Typecheck + unit suite**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit` → exit 0.
Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec vitest run --silent` → all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/meeting/CompetencyCaptureView.tsx web/components/meeting/CompetencyCapture.tsx web/components/MeetingDrawer.tsx web/components/__tests__/EvidenceViews.test.tsx
git commit -m "feat(web): competency capture section in the 1-2-1 drawer (slice #3)"
```

---

### Task 8: Profile timeline + grow counts + e2e

**Files:**
- Create: `web/components/grades/EvidenceTimeline.tsx`
- Delete: `web/components/grades/EvidencePlaceholder.tsx`
- Modify: `web/components/grades/GrowChecklist.tsx`
- Modify: `web/app/(app)/profile/[id]/GradeTab.tsx`
- Modify: `web/components/__tests__/EvidenceViews.test.tsx` (add timeline + grow-count cases)
- Create: `web/e2e/grade-evidence.spec.ts`

**Context:** `GrowChecklist` currently takes `{ items: { blockName, targetCode, text }[], targetCode }`. Add an optional `evidenceCount` to each item. `GradeTab` currently renders `<EvidencePlaceholder />`; replace with `<EvidenceTimeline evidence={...} />` and compute counts.

- [ ] **Step 1: Add failing tests for the timeline + grow count**

Append to `web/components/__tests__/EvidenceViews.test.tsx`:

```tsx
import { EvidenceTimeline } from "../grades/EvidenceTimeline";
import { GrowChecklist } from "../grades/GrowChecklist";

describe("EvidenceTimeline", () => {
  it("renders rows", () => {
    render(<EvidenceTimeline evidence={[
      { id: "e1", meeting_id: null, block_key: "arch", block_name: "Архитектура", level_ord: 6, status: "demonstrated", note: "ADR", created_at: "2026-05-11T10:00:00Z" },
    ]} />);
    expect(screen.getByText("ADR")).toBeInTheDocument();
    expect(screen.getByText(/Архитектура · IC6/)).toBeInTheDocument();
  });
  it("renders the empty state", () => {
    render(<EvidenceTimeline evidence={[]} />);
    expect(screen.getByText(/Пока нет зафиксированных свидетельств/)).toBeInTheDocument();
  });
});

describe("GrowChecklist evidence count", () => {
  it("shows the count line when evidenceCount > 0", () => {
    render(<GrowChecklist targetCode="IC5" items={[
      { blockName: "Базы данных", targetCode: "IC5", text: "оптимизация", evidenceCount: 2 },
    ]} />);
    expect(screen.getByText(/2 свидетельств/)).toBeInTheDocument();
  });
});
```

Run `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec vitest run EvidenceViews` → confirm the new cases FAIL.

- [ ] **Step 2: Write `EvidenceTimeline.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/query/evidence";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function EvidenceTimeline({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Свидетельства из 1-2-1</div>
        <span className="rounded-full border border-line bg-bg-tint px-2 text-[11px] text-ink-3">{evidence.length}</span>
      </div>
      {evidence.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.
        </p>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => (
            <div key={e.id} className="flex gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.status === "partial" ? "bg-warn" : "bg-ok")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{e.block_name} · IC{e.level_ord}</span>
                  {e.status === "partial" && <span className="rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">частично</span>}
                  <span className="ml-auto text-[11px] text-ink-4">{fmt(e.created_at)}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{e.note || "без заметки"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Extend `GrowChecklist.tsx`**

Change the `GrowItem` type and the render to support `evidenceCount`:

```tsx
type GrowItem = { blockName: string; targetCode: string; text: string; evidenceCount?: number };

export function GrowChecklist({ items, targetCode }: { items: GrowItem[]; targetCode: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Что показать для {targetCode}</div>
      <div className="mb-3 text-[12px] text-ink-3">Конкретные компетенции из матрицы</div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.blockName} className="flex gap-3">
            <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
              (it.evidenceCount ?? 0) > 0 ? "border-ok bg-ok text-white" : "border-line")}>
              {(it.evidenceCount ?? 0) > 0 ? "✓" : ""}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{it.blockName} → {it.targetCode}</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{it.text}</div>
              {(it.evidenceCount ?? 0) > 0 && (
                <div className="mt-1 text-[11.5px] font-medium text-ok">{it.evidenceCount} свидетельств зафиксировано в 1-2-1</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add `import { cn } from "@/lib/utils";` at the top of `GrowChecklist.tsx` (it's needed now).

- [ ] **Step 4: Wire `GradeTab.tsx`**

- Replace the import `import { EvidencePlaceholder } from "@/components/grades/EvidencePlaceholder";` with `import { EvidenceTimeline } from "@/components/grades/EvidenceTimeline";` and add `import { useMemberEvidence } from "@/lib/query/evidence";`.
- Add the query near the others: `const ev = useMemberEvidence(memberId);`
- Include `ev.isLoading` in the loading guard and `ev.isError` in the error guard.
- After `growItems` is computed, add the count and attach it:

```tsx
  const evidence = ev.data ?? [];
  const growItemsWithCount = growItems.map((it, i) => {
    const block = discipline.blocks.filter((b) => blockLevelOf(b.key) < (grade.target_ord ?? 0))[i];
    const count = block ? evidence.filter((e) => e.block_key === block.key && grade.target_ord != null && e.level_ord >= grade.target_ord).length : 0;
    return { ...it, evidenceCount: count };
  });
```

  Then pass `items={growItemsWithCount}` to `GrowChecklist`, and replace `<EvidencePlaceholder />` with `<EvidenceTimeline evidence={evidence} />`.

  (Note: `growItems` is built by filtering `discipline.blocks` where `blockLevelOf(b.key) < grade.target_ord` and the filtered list is index-aligned, so the same filter reproduces the block per item. If the implementer finds it cleaner, compute `evidenceCount` inline while building `growItems` instead — the end result must be the count of evidence with `block_key === b.key && level_ord >= target_ord`.)

- [ ] **Step 5: Delete the placeholder**

```bash
git rm web/components/grades/EvidencePlaceholder.tsx
```

Confirm nothing else imports it: `grep -rn "EvidencePlaceholder" web/` returns nothing.

- [ ] **Step 6: Typecheck + unit suite**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit` → exit 0.
Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec vitest run --silent` → all pass.

- [ ] **Step 7: Write e2e `web/e2e/grade-evidence.spec.ts`**

```ts
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

test("capture a competency in a 1-2-1", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("button", { name: "Начать 1-2-1" }).click();
  const drawer = page.locator("aside");
  await expect(drawer.getByText("Проявленные компетенции")).toBeVisible({ timeout: 10_000 });
  await drawer.getByLabel("Блок").selectOption({ index: 1 });
  await drawer.getByLabel("Заметка").fill("e2e свидетельство");
  await drawer.getByRole("button", { name: "Отметить IC5" }).click();
  await expect(drawer.getByText("e2e свидетельство")).toBeVisible({ timeout: 10_000 });
});

test("profile grade tab shows the evidence timeline", async ({ page }) => {
  await openAnna(page);
  await page.getByRole("link", { name: "Грейд", exact: true }).click();
  await expect(page).toHaveURL(/tab=grade/);
  await expect(page.getByText("Свидетельства из 1-2-1")).toBeVisible({ timeout: 10_000 });
  // Анна has seeded evidence → at least one note from the seed is visible
  await expect(page.getByText(/Менторский ритм с Тимуром/)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 8: Run e2e (and full suites)**

Re-seed the dev DB first if needed (seed changed): start the API, then it self-seeds on an empty DB — if the dev DB already has a workspace, `TRUNCATE workspaces CASCADE` then restart the API (per the re-seed memory).

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec playwright test grade-evidence.spec.ts --reporter=line` → 2 tests PASS.
Then: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec playwright test --reporter=line` → all pass.
Then: `cd /Users/lebedev.v/projects/beeteam/api && cargo test` → all pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/grades/EvidenceTimeline.tsx web/components/grades/GrowChecklist.tsx "web/app/(app)/profile/[id]/GradeTab.tsx" web/components/__tests__/EvidenceViews.test.tsx web/e2e/grade-evidence.spec.ts
git rm web/components/grades/EvidencePlaceholder.tsx 2>/dev/null; git add -A web/components/grades/
git commit -m "feat(web): evidence timeline + grow-checklist counts in profile (slice #3)"
```

---

## Self-Review

**Spec coverage:**
- `grade_evidence` table + enum → Task 1. ✓
- DTOs `Evidence` / `CreateEvidence` → Task 2. ✓
- POST/DELETE/GET endpoints, `require_member_access`, validation (level + status), DESC order → Task 3. ✓
- OpenAPI + regen → Task 4. ✓
- Seed Анна's evidence → Task 5. ✓
- Query hooks → Task 6. ✓
- Full capture section (mini-hero, growth hints, block/note/level chips, partial, logged list w/ delete) → Task 7. ✓
- Profile timeline (replaces placeholder) + grow-checklist counts → Task 8. ✓
- Deferred (review/editor/addons) untouched. ✓
- Tests: api (create/list/bad-level/bad-status/delete-404/forbidden), unit (capture view, timeline, grow count), e2e (capture + timeline) → Tasks 3, 7, 8. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code.

**Type consistency:** `Evidence` fields (`id, meeting_id, block_key, block_name, level_ord, status, note, created_at`) identical across DTO (Task 2), handler `EV_SELECT`/`ev_from` (Task 3), hook (Task 6), View `logged` mapping (Task 7), timeline (Task 8). `CreateEvidence` fields (`member_id, meeting_id, block_id, level_ord, status, note`) match between DTO, handler, hook, and container `create.mutate` (Task 7). `CompetencyCaptureView` `onAdd(blockKey, level, status, note)` signature matches the test (Task 7) and the container (Task 7). `GrowItem.evidenceCount` matches between GrowChecklist (Task 8), its test (Task 8), and GradeTab's `growItemsWithCount` (Task 8). aria-labels (`Блок`, `Заметка`, `Отметить {code}`, `Удалить свидетельство`) consistent between View and tests/e2e.
