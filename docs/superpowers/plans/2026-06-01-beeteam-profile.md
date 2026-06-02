# BeeTeam EmployeeProfile Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/profile/:id` placeholder with a read-only EmployeeProfile — a header plus three tabs (История 1-2-1 / Цели и развитие / Файлы) — backed by 5 ownership-guarded GET endpoints.

**Architecture:** Two new tables (`development_items`, `competencies`) via migration `0003_profile`; seed data for the Goals/Files tabs; `require_member_access` enforcing team-lead ownership on all 5 endpoints; runtime-`sqlx` handlers returning serde/utoipa DTOs; the Next `/api/v1/*` cookie→Bearer proxy unchanged. Frontend: a server layout fetches the header + handles 403, client tabs are selected by `?tab=`, and small single-purpose composites render the three tabs from TanStack Query hooks.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres; Next.js 14 App Router, TypeScript, TanStack Query, openapi-fetch, Tailwind (CSS-var design tokens), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-01-beeteam-profile-design.md`

---

## Conventions in this codebase (read once before starting)

- **Backend crates:** migrations in `api/crates/bt-db/migrations/`; seed in `api/crates/bt-db/src/seed.rs`; DTOs in `api/crates/bt-domain/src/lib.rs`; handlers in `api/crates/bt-api/src/routes/`; router in `api/crates/bt-api/src/app.rs`; OpenAPI registry in `api/crates/bt-api/src/openapi.rs`; errors in `api/crates/bt-api/src/error.rs` (`AppError::Forbidden` → 403, `AppResult<T>`); auth extractor `AuthUser { id, role }` injected by `require_auth`.
- **sqlx style:** runtime `sqlx::query_as::<_, (tuple...)>(...)` with positional `$1` binds, `.fetch_all`/`.fetch_optional`/`.fetch_one`, then `.map(|r| Dto { ... })`. Enums are read with `::text` casts and bound as `$n::enum_type`.
- **Backend tests:** live in a `#[cfg(test)] mod tests` at the bottom of each route file; use `#[sqlx::test(migrations = "../bt-db/migrations")]`; build the app with `app(pool)` and drive it via `tower::ServiceExt::oneshot`. Run with `api/scripts/test.sh` (forces the :5433 test DB). Helpers `seed_team`/`login_token`/`get_members` already exist in `routes/teams.rs` — copy their shape.
- **Frontend:** components in `web/components/` (PascalCase `.tsx`); tests in `web/components/__tests__/*.test.tsx` (Vitest + Testing Library, `pnpm test`); query hooks in `web/lib/query/`; the openapi-fetch client is `web/lib/api/client.ts` (`api.GET("/v1/...")`); generated types in `web/lib/api/schema.d.ts` via `pnpm gen:api` (needs the API running on :8080); design tokens are Tailwind classes backed by CSS vars (`bg-brand`, `text-ink-3`, `border-line`, `bg-ok-soft`…). **Use `brand`, never `accent`** (see memory). Numbers/dates/percents get the `tabular` class. `cn()` lives in `web/lib/utils`.
- **e2e:** `web/e2e/*.spec.ts` (`pnpm test:e2e`); login helper fills «Корпоративная почта» / «Пароль» with `e.glebov@beeteam.io` / `demo1234`. The dev server needs the dev DB seeded and the API running.
- **Re-seed after seed changes:** the seed is idempotent (`SELECT count(*) FROM workspaces > 0` → no-op). After Task 2 you MUST `TRUNCATE workspaces CASCADE` then restart the API to repopulate the dev DB (see the `reseed-dev-db-after-seed-changes` memory). Tests are unaffected (each `#[sqlx::test]` gets a fresh DB).

---

## File Structure

**Backend (create / modify):**
- Create `api/crates/bt-db/migrations/0003_profile.sql` — `development_items` + `competencies` tables + indexes.
- Modify `api/crates/bt-db/src/seed.rs` — goals/files/dev-items/competencies for Anna + base set for the other 7.
- Modify `api/crates/bt-domain/src/lib.rs` — `MemberDetail`, `MeetingListItem`, `MeetingDetail`, `Goal`, `DevItem`, `Competency`, `GoalsResponse`, `FileMeta` DTOs.
- Create `api/crates/bt-api/src/routes/members.rs` — `require_member_access` + 4 member handlers (detail / meetings / goals / files).
- Create `api/crates/bt-api/src/routes/meetings.rs` — `get_meeting` handler.
- Modify `api/crates/bt-api/src/routes/mod.rs` — `pub mod members; pub mod meetings;`.
- Modify `api/crates/bt-api/src/app.rs` — register 5 routes under the `protected` router.
- Modify `api/crates/bt-api/src/openapi.rs` — register paths + DTO schemas.

**Frontend (create / modify):**
- Create `web/lib/query/profile.ts` — `useMemberDetail`, `useMemberMeetings`, `useMeeting`, `useMemberGoals`, `useMemberFiles`.
- Create composites in `web/components/`: `MonthCalendar.tsx`, `NoteBlock.tsx`, `MeetingDetailCard.tsx`, `Feed.tsx`, `OkrCard.tsx`, `DevItem.tsx`, `CompetencyBar.tsx`, `FileGlyph.tsx`, `FileRow.tsx`, `FileTile.tsx`.
- Create `web/components/ProfileHeader.tsx`.
- Modify (replace placeholder) `web/app/(app)/profile/[id]/layout.tsx` (new) + `page.tsx` + create `HistoryTab.tsx`, `GoalsTab.tsx`, `FilesTab.tsx` in that route folder.
- Tests in `web/components/__tests__/`: one per non-trivial composite.
- Create `web/e2e/profile.spec.ts`.

---

# Phase A — Backend

### Task 1: Migration `0003_profile` (development_items + competencies)

**Files:**
- Create: `api/crates/bt-db/migrations/0003_profile.sql`

- [ ] **Step 1: Write the migration**

Create `api/crates/bt-db/migrations/0003_profile.sql`:

```sql
-- Goals tab: dev-plan items + competency bars (OKRs already live in `goals`).
CREATE TABLE development_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL,                   -- Курс / Доклад / Книга / Сертификат / Менторство (free text)
  status       TEXT NOT NULL DEFAULT 'planned', -- planned | in_progress | done
  note         TEXT,                            -- e.g. "Прогресс 60%", "Глава 4 / 12"
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE competencies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  score        INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  ord          INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_dev_items_member ON development_items(member_id);
CREATE INDEX idx_competencies_member ON competencies(member_id);
```

- [ ] **Step 2: Verify migrations compile/apply against the test DB**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db seed_is_idempotent_and_loads_team`
Expected: PASS — the existing seed test runs all three migrations on a fresh test DB. If the SQL is malformed it fails at migration time.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/migrations/0003_profile.sql
git commit -m "feat(db): 0003_profile — development_items + competencies tables"
```

---

### Task 2: Seed Goals/Files data

The seed currently inserts members + meetings but **no goals, files, dev-items, or competencies**. Add them. `seed.rs` already holds `member_ids: Vec<(Uuid, &str)>`, `anna_id: Option<Uuid>`, `ws_id`, `now`, `day`, and the `opt()` helper. Insert this block **after the per-member meetings loop and before `tx.commit()`** (currently near line 200).

**Files:**
- Modify: `api/crates/bt-db/src/seed.rs` (insert before `tx.commit().await?;`)

- [ ] **Step 1: Write the failing seed assertions**

In the existing `#[cfg(test)] mod tests` in `seed.rs`, add a test alongside `seed_is_idempotent_and_loads_team`:

```rust
    #[sqlx::test(migrations = "./migrations")]
    async fn seed_populates_goals_files_dev_competencies(pool: PgPool) {
        seed_demo(&pool).await.unwrap();

        // Anna is the showcase member: 3 OKRs, 5 dev-items, 5 competencies, 7 files.
        let anna: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM team_members WHERE name = 'Анна Лебедева'")
                .fetch_one(&pool).await.unwrap();

        let okrs: (i64,) = sqlx::query_as("SELECT count(*) FROM goals WHERE member_id = $1")
            .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(okrs.0, 3, "Anna OKRs");

        let dev: (i64,) =
            sqlx::query_as("SELECT count(*) FROM development_items WHERE member_id = $1")
                .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(dev.0, 5, "Anna dev-items");

        let comp: (i64,) =
            sqlx::query_as("SELECT count(*) FROM competencies WHERE member_id = $1")
                .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(comp.0, 5, "Anna competencies");

        let files: (i64,) = sqlx::query_as("SELECT count(*) FROM files WHERE member_id = $1")
            .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(files.0, 7, "Anna files");

        // Every member has at least one OKR, a competency set, and a file (tabs aren't empty).
        let bare: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM team_members tm \
             WHERE NOT EXISTS (SELECT 1 FROM goals g WHERE g.member_id = tm.id) \
                OR NOT EXISTS (SELECT 1 FROM competencies c WHERE c.member_id = tm.id) \
                OR NOT EXISTS (SELECT 1 FROM files f WHERE f.member_id = tm.id)",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(bare.0, 0, "no member has an empty Goals or Files tab");

        // One file is linked to a meeting (drives the meeting_label in the files endpoint).
        let linked: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM files WHERE member_id = $1 AND meeting_id IS NOT NULL",
        ).bind(anna.0).fetch_one(&pool).await.unwrap();
        assert!(linked.0 >= 1, "at least one Anna file linked to a meeting");
    }
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db seed_populates_goals_files_dev_competencies`
Expected: FAIL — counts are 0 (nothing seeded yet).

- [ ] **Step 3: Add the seed block**

Insert before `tx.commit().await?;` in `seed_demo`. Anna gets the showcase set; everyone gets a base set so no tab is empty.

```rust
    // ── Goals tab: OKRs (goals) + dev plan (development_items) + competencies ──
    // Anna is the showcase profile (ported from flows.jsx GoalsTab).
    let aid = anna_id.expect("seed: Anna must exist");

    // (quarter, title, key_result, progress, status, due_days_from_now)
    let anna_okrs: [(&str, &str, &str, i32, &str, i64); 3] = [
        ("Q2 2026", "Ускорить ключевые экраны", "LCP < 1.5s на 90% сессий", 60, "ontrack", 40),
        ("Q2 2026", "Дизайн-система v2", "Покрыть 80% компонентов токенами", 35, "risk", 25),
        ("Q1 2026", "Онбординг джунов", "2 ментируемых вышли на self-review", 100, "done", -10),
    ];
    for o in anna_okrs.iter() {
        sqlx::query(
            "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
             VALUES ($1,$2,$3,$4,$5,$6,$7::goal_status,$8)",
        )
        .bind(ws_id).bind(aid).bind(o.0).bind(o.1).bind(o.2).bind(o.3).bind(o.4)
        .bind(now + day * (o.5 as i32))
        .execute(&mut *tx).await?;
    }

    // (title, kind, status, note, ord)
    let anna_dev: [(&str, &str, &str, &str, i32); 5] = [
        ("Advanced React Performance", "Курс", "in_progress", "Прогресс 60%", 0),
        ("Доклад на внутреннем митапе", "Доклад", "planned", "Тема: rendering budget", 1),
        ("Designing Data-Intensive Applications", "Книга", "in_progress", "Глава 4 / 12", 2),
        ("AWS Solutions Architect", "Сертификат", "planned", "", 3),
        ("Менторство двух джунов", "Менторство", "done", "Q1 завершён", 4),
    ];
    for d in anna_dev.iter() {
        sqlx::query(
            "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
             VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(ws_id).bind(aid).bind(d.0).bind(d.1).bind(d.2).bind(opt(d.3)).bind(d.4)
        .execute(&mut *tx).await?;
    }

    // (label, score, ord) — competency bars 0..10
    let anna_comp: [(&str, i32, i32); 5] = [
        ("Frontend архитектура", 9, 0),
        ("Коммуникация", 8, 1),
        ("Менторство", 8, 2),
        ("Системный дизайн", 6, 3),
        ("Бэкенд", 5, 4),
    ];
    for c in anna_comp.iter() {
        sqlx::query(
            "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(ws_id).bind(aid).bind(c.0).bind(c.1).bind(c.2)
        .execute(&mut *tx).await?;
    }

    // Anna's files (one linked to her most recent done meeting → meeting_label).
    let anna_last_done: Option<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM meetings WHERE member_id = $1 AND state = 'done' ORDER BY date DESC LIMIT 1",
    ).bind(aid).fetch_optional(&mut *tx).await?;
    let anna_meeting_id = anna_last_done.map(|r| r.0);

    // (name, mime, kind, size_bytes, uploaded_by, days_ago, link_to_meeting)
    let anna_files: [(&str, &str, &str, i64, &str, i64, bool); 7] = [
        ("Итоги 1-2-1.pdf", "application/pdf", "pdf", 184_320, "Евгений Глебов", 7, true),
        ("План развития Q2.docx", "application/vnd.openxmlformats", "doc", 41_984, "Анна Лебедева", 9, false),
        ("Скрин дашборда.png", "image/png", "img", 612_400, "Анна Лебедева", 12, false),
        ("Метрики LCP.xlsx", "application/vnd.ms-excel", "sheet", 28_672, "Анна Лебедева", 14, false),
        ("Демо рефактора.mp4", "video/mp4", "video", 8_388_608, "Анна Лебедева", 20, false),
        ("Архитектура DS v2.pdf", "application/pdf", "pdf", 256_000, "Анна Лебедева", 28, false),
        ("Заметки ретро.docx", "application/vnd.openxmlformats", "doc", 18_944, "Анна Лебедева", 33, false),
    ];
    for f in anna_files.iter() {
        let meeting_bind = if f.6 { anna_meeting_id } else { None };
        sqlx::query(
            "INSERT INTO files (workspace_id, member_id, meeting_id, name, mime, kind, size_bytes, storage_key, uploaded_by, created_at) \
             VALUES ($1,$2,$3,$4,$5,$6::file_kind,$7,$8,$9,$10)",
        )
        .bind(ws_id).bind(aid).bind(meeting_bind)
        .bind(f.0).bind(f.1).bind(f.2).bind(f.3)
        .bind(format!("seed/{}", f.0))   // synthetic storage_key; download is a stub
        .bind(f.4).bind(now - day * (f.5 as i32))
        .execute(&mut *tx).await?;
    }

    // ── Base set for the other 7 members so their tabs aren't empty ──
    let base_comp: [(&str, i32); 5] = [
        ("Профессионализм", 7), ("Коммуникация", 6), ("Командная работа", 7),
        ("Инициатива", 5), ("Развитие", 6),
    ];
    for (mid, _status) in member_ids.iter() {
        if Some(*mid) == anna_id { continue; }

        // 1 OKR
        sqlx::query(
            "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
             VALUES ($1,$2,'Q2 2026','Цель квартала','Ключевой результат',45,'ontrack'::goal_status,$3)",
        )
        .bind(ws_id).bind(mid).bind(now + day * 30)
        .execute(&mut *tx).await?;

        // 1 dev-item
        sqlx::query(
            "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
             VALUES ($1,$2,'Внутренний курс','Курс','in_progress','Прогресс 40%',0)",
        )
        .bind(ws_id).bind(mid).execute(&mut *tx).await?;

        // 5 competencies
        for (i, c) in base_comp.iter().enumerate() {
            sqlx::query(
                "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
                 VALUES ($1,$2,$3,$4,$5)",
            )
            .bind(ws_id).bind(mid).bind(c.0).bind(c.1).bind(i as i32)
            .execute(&mut *tx).await?;
        }

        // 2 files
        for (i, (name, mime, kind, size)) in [
            ("Заметки 1-2-1.pdf", "application/pdf", "pdf", 96_000_i64),
            ("План на квартал.docx", "application/vnd.openxmlformats", "doc", 22_528_i64),
        ].iter().enumerate() {
            sqlx::query(
                "INSERT INTO files (workspace_id, member_id, name, mime, kind, size_bytes, storage_key, uploaded_by, created_at) \
                 VALUES ($1,$2,$3,$4,$5::file_kind,$6,$7,'Евгений Глебов',$8)",
            )
            .bind(ws_id).bind(mid).bind(name).bind(mime).bind(kind).bind(size)
            .bind(format!("seed/{name}")).bind(now - day * (10 * (i as i32 + 1)))
            .execute(&mut *tx).await?;
        }
    }
```

- [ ] **Step 4: Run the seed test to confirm it passes**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db`
Expected: PASS — both `seed_is_idempotent_and_loads_team` and `seed_populates_goals_files_dev_competencies`.

- [ ] **Step 5: Re-seed the dev DB** (so the running app sees the new data)

Run: `cd /Users/lebedev.v/projects/beeteam && docker compose exec -T postgres psql -U postgres -d beeteam -c "TRUNCATE workspaces CASCADE;"`
Then restart the API (it re-runs `seed_demo` on boot). Verify: `docker compose exec -T postgres psql -U postgres -d beeteam -c "SELECT count(*) FROM development_items;"` returns a non-zero count.
(If the psql connection string differs locally, use the values from repo-root `.env` `DATABASE_URL`.)

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/src/seed.rs
git commit -m "feat(db): seed OKRs, dev-items, competencies, files (Anna + base set)"
```

---

### Task 3: Profile DTOs

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (append after the existing `MemberRow`/`TeamStats` DTOs)

- [ ] **Step 1: Add the DTOs**

Append to `api/crates/bt-domain/src/lib.rs`. Match the existing derive set (`Debug, Clone, Serialize, Deserialize, ToSchema`):

```rust
/// Full header for the EmployeeProfile screen.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberDetail {
    pub id: uuid::Uuid,
    pub name: String,
    pub role: String,
    pub email: String,
    pub joined: String,
    pub tz: String,
    pub hue: i32,
    pub status: String,
    pub tags: Vec<String>,
    pub mood_trend: Vec<i32>,
    pub last_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub next_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub meetings_total: i64,
}

/// One row in the History feed / calendar.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MeetingListItem {
    pub id: uuid::Uuid,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,
    pub mood: Option<String>,
    pub mood_score: Option<i32>,
    pub preview: String,
}

/// Expanded meeting for the MeetingDetailCard.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MeetingDetail {
    pub id: uuid::Uuid,
    pub member_id: uuid::Uuid,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,
    pub duration_min: i32,
    pub mood: Option<String>,
    pub mood_score: Option<i32>,
    pub blockers: Option<String>,
    pub goals: Option<String>,
    pub feedback_to: Option<String>,
    pub feedback_from: Option<String>,
    pub development: Vec<String>,
    pub relationships: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Goal {
    pub id: uuid::Uuid,
    pub quarter: String,
    pub title: String,
    pub key_result: String,
    pub progress: i32,
    pub status: String,
    pub due: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DevItem {
    pub id: uuid::Uuid,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Competency {
    pub id: uuid::Uuid,
    pub label: String,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GoalsResponse {
    pub okrs: Vec<Goal>,
    pub development: Vec<DevItem>,
    pub competencies: Vec<Competency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FileMeta {
    pub id: uuid::Uuid,
    pub name: String,
    pub mime: String,
    pub kind: String,
    pub size_bytes: i64,
    pub meeting_label: Option<String>,
    pub uploaded_by: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

- [ ] **Step 2: Confirm the domain crate compiles**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: builds clean (DTOs aren't used yet — that's fine; no `dead_code` warnings because they're `pub`).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs
git commit -m "feat(domain): profile DTOs (MemberDetail, MeetingDetail, GoalsResponse, FileMeta)"
```

---

### Task 4: `require_member_access` + `GET /members/:id`

**Files:**
- Create: `api/crates/bt-api/src/routes/members.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`

- [ ] **Step 1: Create the module skeleton + access guard + first handler**

Create `api/crates/bt-api/src/routes/members.rs`:

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::{Competency, DevItem, FileMeta, Goal, GoalsResponse, MemberDetail, MeetingListItem};
use sqlx::PgPool;
use uuid::Uuid;

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
    if owns.is_some() { Ok(()) } else { Err(AppError::Forbidden) }
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
          (SELECT count(*) FROM meetings m WHERE m.member_id = tm.id)              AS meetings_total
        FROM team_members tm
        WHERE tm.id = $1
        "#,
    )
    .bind(member_id)
    .fetch_optional(&state.pool)
    .await?;

    let r = r.ok_or(AppError::NotFound)?;
    Ok(Json(MemberDetail {
        id: r.0, name: r.1, role: r.2, email: r.3, joined: r.4, tz: r.5, hue: r.6,
        status: r.7, tags: r.8, mood_trend: r.9, last_meet: r.10, next_meet: r.11,
        meetings_total: r.12,
    }))
}
```

- [ ] **Step 2: Wire the module**

In `api/crates/bt-api/src/routes/mod.rs` add:

```rust
pub mod members;
```

(after `pub mod health;`).

- [ ] **Step 3: Register the route + write the failing test**

In `api/crates/bt-api/src/app.rs`, add to the `protected` router (after the existing `/v1/teams/:id/stats` line):

```rust
        .route("/v1/members/:id", get(routes::members::get_member))
```

Then add a test module at the bottom of `members.rs`. Copy the proven helper shape from `routes/teams.rs` (two leads, each owning a team with one member):

```rust
#[cfg(test)]
mod tests {
    use crate::app::app;
    use crate::auth::password::hash_password;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Seeds two leads. lead_a owns team_a with member Anna; lead_b owns team_b with member Bob.
    /// Returns (token_a, anna_id, token_b, bob_id).
    async fn seed_two_teams(
        pool: &sqlx::PgPool,
    ) -> (String, uuid::Uuid, String, uuid::Uuid) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();

        let mut tokens_members = Vec::new();
        for (email, mname, mrole) in [
            ("a@x.io", "Анна", "Frontend"),
            ("b@x.io", "Боб", "Backend"),
        ] {
            let lead: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
                 VALUES ($1,$2,$3,'Lead','lead'::user_role,40) RETURNING id",
            ).bind(ws.0).bind(email).bind(&hash).fetch_one(pool).await.unwrap();
            let team: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
                 VALUES ($1,'team',$2,'2w'::cadence,'private'::visibility) RETURNING id",
            ).bind(ws.0).bind(lead.0).fetch_one(pool).await.unwrap();
            let member: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO team_members \
                 (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
                 VALUES ($1,$2,$3,$4,$5,'2023',$6,'{6,7,8}','ok'::member_status,'{}',28,'2023-01-01') RETURNING id",
            )
            .bind(ws.0).bind(team.0).bind(mname).bind(mrole)
            .bind(format!("{mname}@x.io")).bind("Europe/Moscow")
            .fetch_one(pool).await.unwrap();
            tokens_members.push((login_token(pool, email).await, member.0));
        }
        let (token_a, anna) = tokens_members[0].clone();
        let (token_b, bob) = tokens_members[1].clone();
        (token_a, anna, token_b, bob)
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        v["token"].as_str().unwrap().to_string()
    }

    async fn get(pool: sqlx::PgPool, token: &str, uri: &str) -> (StatusCode, serde_json::Value) {
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(uri)
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
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
}
```

> Note: `login_token` may already exist as a shared helper in `routes/teams.rs`. If the `app(pool)` signature differs (some helpers take `pool` by value, some by ref), match whatever `routes/teams.rs` tests already do — copy, don't invent.

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api member_detail`
Expected: FAIL before Steps 1–3 land; after they land, PASS. (If running TDD strictly, write the test first against a not-yet-registered route → 404, then implement.)

- [ ] **Step 5: Run to confirm PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api member_detail`
Expected: `member_detail_happy_path` PASS, `member_detail_foreign_is_forbidden` PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/members.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): require_member_access + GET /v1/members/:id"
```

---

### Task 5: `GET /members/:id/meetings` + `GET /meetings/:id`

**Files:**
- Modify: `api/crates/bt-api/src/routes/members.rs` (add `list_member_meetings`)
- Create: `api/crates/bt-api/src/routes/meetings.rs` (add `get_meeting`)
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`

- [ ] **Step 1: Add `list_member_meetings` to `members.rs`**

The `preview` is the first non-empty of blockers/goals (for done), else a state hint, computed in Rust:

```rust
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
```

- [ ] **Step 2: Create `meetings.rs` with `get_meeting`**

`/meetings/:id` resolves the member from the meeting, then checks access. Create `api/crates/bt-api/src/routes/meetings.rs`:

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::members::require_member_access;
use crate::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::MeetingDetail;
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/v1/meetings/{id}",
    params(("id" = uuid::Uuid, Path, description = "Meeting id")),
    responses(
        (status = 200, description = "Meeting detail (all note fields)", body = MeetingDetail),
        (status = 403, description = "Meeting's member not on the caller's team"),
        (status = 404, description = "No such meeting"),
    )
)]
pub async fn get_meeting(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(meeting_id): Path<Uuid>,
) -> AppResult<Json<MeetingDetail>> {
    // Resolve the member first so we can authorize before returning any data.
    let member: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT member_id FROM meetings WHERE id = $1")
            .bind(meeting_id)
            .fetch_optional(&state.pool)
            .await?;
    let member_id = member.ok_or(AppError::NotFound)?.0;
    require_member_access(&auth, member_id, &state.pool).await?;

    let r: (
        uuid::Uuid, uuid::Uuid, chrono::DateTime<chrono::Utc>, String, i32,
        Option<String>, Option<i32>, Option<String>, Option<String>,
        Option<String>, Option<String>, Vec<String>, Option<String>,
    ) = sqlx::query_as(
        "SELECT id, member_id, date, state::text, duration_min, mood, mood_score, \
                blockers, goals, feedback_to, feedback_from, development, relationships \
         FROM meetings WHERE id = $1",
    )
    .bind(meeting_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(MeetingDetail {
        id: r.0, member_id: r.1, date: r.2, state: r.3, duration_min: r.4,
        mood: r.5, mood_score: r.6, blockers: r.7, goals: r.8,
        feedback_to: r.9, feedback_from: r.10, development: r.11, relationships: r.12,
    }))
}
```

- [ ] **Step 3: Wire modules + routes**

In `routes/mod.rs` add `pub mod meetings;`. In `app.rs` add to `protected`:

```rust
        .route("/v1/members/:id/meetings", get(routes::members::list_member_meetings))
        .route("/v1/meetings/:id", get(routes::meetings::get_meeting))
```

- [ ] **Step 4: Write the tests**

Add to the `tests` module in `members.rs`. First extend `seed_two_teams` to insert a done meeting (with notes) and a planned meeting for Anna. Replace the Anna member insert + add meetings — or add a small helper. For clarity, add a dedicated helper that seeds meetings for a member:

```rust
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
        let (_, _, token_b, _) = seed_two_teams(&pool).await;
        let (token_a, anna, _, _) = (/* re-fetch */ token_b.clone(), uuid::Uuid::nil(), 0, 0).0;
        // Simpler: seed a meeting on Anna (team A) and request it with lead B's token.
        let (ta, anna_id, tb, _bob) = seed_two_teams(&pool).await;
        let mid = seed_meeting(&pool, anna_id, "done", true).await;
        let _ = (token_a, anna);
        let (status, _) = get(pool, &tb, &format!("/v1/meetings/{mid}")).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = ta;
    }
```

> The `meeting_detail_foreign_member_is_forbidden` body above is intentionally written cleanly when you implement it — seed once with `seed_two_teams`, seed a meeting on Anna (team A), then request with `token_b`. Drop the throwaway first lines; they're shown only to flag the gotcha (one `seed_two_teams` per test). Final form:
> ```rust
>     #[sqlx::test(migrations = "../bt-db/migrations")]
>     async fn meeting_detail_foreign_member_is_forbidden(pool: sqlx::PgPool) {
>         let (_token_a, anna, token_b, _bob) = seed_two_teams(&pool).await;
>         let mid = seed_meeting(&pool, anna, "done", true).await;
>         let (status, _) = get(pool, &token_b, &format!("/v1/meetings/{mid}")).await;
>         assert_eq!(status, StatusCode::FORBIDDEN);
>     }
> ```

- [ ] **Step 5: Run the tests**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api meeting`
Expected: `member_meetings_list_ordered_with_preview`, `meeting_detail_returns_all_note_fields`, `meeting_detail_foreign_member_is_forbidden` all PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/members.rs api/crates/bt-api/src/routes/meetings.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/members/:id/meetings + GET /v1/meetings/:id"
```

---

### Task 6: `GET /members/:id/goals` + `GET /members/:id/files`

**Files:**
- Modify: `api/crates/bt-api/src/routes/members.rs` (add `get_member_goals`, `list_member_files`)
- Modify: `api/crates/bt-api/src/app.rs`

- [ ] **Step 1: Add `get_member_goals`**

Three independent queries (OKRs / dev / competencies), assembled into `GoalsResponse`:

```rust
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
```

- [ ] **Step 2: Add `list_member_files`**

`meeting_label = "1-2-1 от <DD.MM.YYYY>"` when `meeting_id` is set. Build the label from the joined meeting date in Rust:

```rust
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
        uuid::Uuid, String, String, String, i64, String,
        chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>,
    )> = sqlx::query_as(
        "SELECT f.id, f.name, f.mime, f.kind::text, f.size_bytes, f.uploaded_by, f.created_at, m.date \
         FROM files f LEFT JOIN meetings m ON m.id = f.meeting_id \
         WHERE f.member_id = $1 ORDER BY f.created_at DESC",
    )
    .bind(member_id)
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|r| FileMeta {
            id: r.0, name: r.1, mime: r.2, kind: r.3, size_bytes: r.4, uploaded_by: r.5,
            created_at: r.6,
            meeting_label: r.7.map(|d| format!("1-2-1 от {}", d.format("%d.%m.%Y"))),
        })
        .collect();
    Ok(Json(out))
}
```

- [ ] **Step 3: Register routes**

In `app.rs` `protected`:

```rust
        .route("/v1/members/:id/goals", get(routes::members::get_member_goals))
        .route("/v1/members/:id/files", get(routes::members::list_member_files))
```

- [ ] **Step 4: Write the tests**

Add to `members.rs` tests. Seed goals/dev/competencies/files on Anna inline:

```rust
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
```

- [ ] **Step 5: Run the tests**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: all member/meeting/goals/files tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/routes/members.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/members/:id/goals + /files"
```

---

### Task 7: Register OpenAPI + regenerate frontend types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`
- Modify: `web/lib/api/schema.d.ts` (generated — do not hand-edit)

- [ ] **Step 1: Register paths + schemas**

In `api/crates/bt-api/src/openapi.rs`, add to `paths(...)`:

```rust
        crate::routes::members::get_member,
        crate::routes::members::list_member_meetings,
        crate::routes::members::get_member_goals,
        crate::routes::members::list_member_files,
        crate::routes::meetings::get_meeting,
```

and to `components(schemas(...))`:

```rust
        bt_domain::MemberDetail,
        bt_domain::MeetingListItem,
        bt_domain::MeetingDetail,
        bt_domain::Goal,
        bt_domain::DevItem,
        bt_domain::Competency,
        bt_domain::GoalsResponse,
        bt_domain::FileMeta,
```

- [ ] **Step 2: Build + boot the API, verify the OpenAPI doc**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Then start the API (however the project runs it — `cargo run -p bt-api` or the dev script) and:
Run: `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/members/{id}/goals"'`
Expected: prints `"/v1/members/{id}/goals"` (paths registered).

- [ ] **Step 3: Regenerate TS types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Then confirm: `grep -c "MemberDetail\|GoalsResponse\|FileMeta\|MeetingDetail" lib/api/schema.d.ts`
Expected: non-zero (the new schemas are present).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register profile endpoints in OpenAPI + regen web types"
```

---

# Phase B — Frontend

> All `components/` files below are client-renderable presentational pieces (no `"use client"` needed unless they use hooks/state). The tab components and hooks ARE `"use client"`. Reuse `Avatar`, `Pill`, `SegControl`, `MoodTrendBars`, `cn`. Use `tabular` on numbers/dates.

### Task 8: Query hooks

**Files:**
- Create: `web/lib/query/profile.ts`

- [ ] **Step 1: Write the hooks**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type MemberDetail = components["schemas"]["MemberDetail"];
export type MeetingListItem = components["schemas"]["MeetingListItem"];
export type MeetingDetail = components["schemas"]["MeetingDetail"];
export type GoalsResponse = components["schemas"]["GoalsResponse"];
export type Goal = components["schemas"]["Goal"];
export type DevItem = components["schemas"]["DevItem"];
export type Competency = components["schemas"]["Competency"];
export type FileMeta = components["schemas"]["FileMeta"];

export function useMemberDetail(id: string) {
  return useQuery<MemberDetail>({
    queryKey: ["member", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberMeetings(id: string) {
  return useQuery<MeetingListItem[]>({
    queryKey: ["member-meetings", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/meetings", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMeeting(id: string | null) {
  return useQuery<MeetingDetail>({
    queryKey: ["meeting", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/meetings/{id}", { params: { path: { id: id! } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberGoals(id: string) {
  return useQuery<GoalsResponse>({
    queryKey: ["member-goals", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/goals", { params: { path: { id } } });
      if (error) throw error;
      return data!;
    },
  });
}

export function useMemberFiles(id: string) {
  return useQuery<FileMeta[]>({
    queryKey: ["member-files", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/members/{id}/files", { params: { path: { id } } });
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: no errors referencing `lib/query/profile.ts` (the path/schema keys must match the regenerated `schema.d.ts`).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/profile.ts
git commit -m "feat(web): profile query hooks"
```

---

### Task 9: `MonthCalendar` composite

Pure presentational: given a month, a list of meeting-days (date + state), a selected id, and callbacks, renders a 7×6 grid with RU weekday headers, month nav, «Сегодня», a today accent ring, and per-day chips (✓ done / ○ planned / ✕ miss).

**Files:**
- Create: `web/components/MonthCalendar.tsx`
- Test: `web/components/__tests__/MonthCalendar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MonthCalendar } from "../MonthCalendar";

const MEETINGS = [
  { id: "m1", date: "2026-06-10T09:00:00Z", state: "done" },
  { id: "m2", date: "2026-06-20T09:00:00Z", state: "planned" },
];

describe("MonthCalendar", () => {
  it("renders the month title and a 6-week grid", () => {
    render(
      <MonthCalendar
        month={new Date("2026-06-01T00:00:00Z")}
        today={new Date("2026-06-15T00:00:00Z")}
        meetings={MEETINGS}
        selectedId={null}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />,
    );
    expect(screen.getByText(/Июнь 2026/i)).toBeInTheDocument();
    // 7 weekday headers + 42 day cells
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("calls onSelect with the meeting id when a meeting-day is clicked", () => {
    const onSelect = vi.fn();
    render(
      <MonthCalendar
        month={new Date("2026-06-01T00:00:00Z")}
        today={new Date("2026-06-15T00:00:00Z")}
        meetings={MEETINGS}
        selectedId={null}
        onSelect={onSelect}
        onMonthChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("10"));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test MonthCalendar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
"use client";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export type CalMeeting = { id: string; date: string; state: string };

const CHIP: Record<string, { glyph: string; cls: string }> = {
  done: { glyph: "✓", cls: "bg-ok-soft text-ok" },
  planned: { glyph: "○", cls: "bg-info-soft text-info" },
  miss: { glyph: "✕", cls: "bg-miss-soft text-miss" },
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MonthCalendar({
  month, today, meetings, selectedId, onSelect, onMonthChange,
}: {
  month: Date;
  today: Date;
  meetings: CalMeeting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMonthChange: (next: Date) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  // Monday-based offset (JS getDay: 0=Sun).
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, m, 1 - lead);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const mtg = meetings.find((x) => sameDay(new Date(x.date), d));
    return { d, mtg, inMonth: d.getMonth() === m };
  });

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink tabular">{MONTHS[m]} {year}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Предыдущий месяц"
            className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            onClick={() => onMonthChange(new Date(year, m - 1, 1))}>‹</button>
          <button type="button"
            className="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint"
            onClick={() => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))}>Сегодня</button>
          <button type="button" aria-label="Следующий месяц"
            className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
            onClick={() => onMonthChange(new Date(year, m + 1, 1))}>›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div role="grid" className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ d, mtg, inMonth }, i) => {
          const isToday = sameDay(d, today);
          const chip = mtg ? CHIP[mtg.state] : null;
          const selected = mtg && mtg.id === selectedId;
          return (
            <button
              key={i}
              role="gridcell"
              type="button"
              disabled={!mtg}
              onClick={() => mtg && onSelect(mtg.id)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded text-[12px] tabular",
                inMonth ? "text-ink-2" : "text-ink-4",
                isToday && "ring-1 ring-brand",
                selected && "bg-brand-soft",
                mtg ? "hover:bg-bg-tint" : "cursor-default",
              )}
            >
              {d.getDate()}
              {chip && (
                <span className={cn("absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full text-[8px] leading-3", chip.cls)}>
                  {chip.glyph}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run → pass**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test MonthCalendar`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/MonthCalendar.tsx web/components/__tests__/MonthCalendar.test.tsx
git commit -m "feat(web): MonthCalendar composite"
```

---

### Task 10: `NoteBlock` + `MeetingDetailCard`

`NoteBlock` renders a labelled note and **renders nothing when empty**. `MeetingDetailCard` branches on state: `done` → status pill + date/duration + mood/relationships grid + NoteBlocks + development list; `planned` → a CTA card with stub buttons.

**Files:**
- Create: `web/components/NoteBlock.tsx`, `web/components/MeetingDetailCard.tsx`
- Test: `web/components/__tests__/MeetingDetailCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MeetingDetailCard } from "../MeetingDetailCard";
import type { MeetingDetail } from "@/lib/query/profile";

const DONE: MeetingDetail = {
  id: "m1", member_id: "x", date: "2026-05-25T09:00:00Z", state: "done",
  duration_min: 45, mood: "🙂", mood_score: 8,
  blockers: "Флака в CI", goals: "", feedback_to: "Хвалю", feedback_from: null,
  development: ["Курс по перфу"], relationships: "Тёплые",
};

describe("MeetingDetailCard", () => {
  it("shows note blocks for a done meeting and hides empty ones", () => {
    render(<MeetingDetailCard meeting={DONE} />);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
    expect(screen.getByText("Флака в CI")).toBeInTheDocument();
    expect(screen.getByText("Курс по перфу")).toBeInTheDocument();
    // goals is "" → its block label must not render
    expect(screen.queryByText("Цели")).not.toBeInTheDocument();
  });

  it("renders the planned CTA branch", () => {
    render(<MeetingDetailCard meeting={{ ...DONE, state: "planned", blockers: null, development: [] }} />);
    expect(screen.getByText("Запланирована")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Провести сейчас" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test MeetingDetailCard`
Expected: FAIL.

- [ ] **Step 3: Implement `NoteBlock.tsx`**

```typescript
export function NoteBlock({ label, children }: { label: string; children?: React.ReactNode }) {
  const text = typeof children === "string" ? children.trim() : children;
  if (!text || (Array.isArray(text) && text.length === 0)) return null;
  return (
    <div className="rounded-md border border-line-2 bg-bg-tint p-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="text-[13px] text-ink-2">{text}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `MeetingDetailCard.tsx`**

```typescript
import { Pill } from "./Pill";
import { NoteBlock } from "./NoteBlock";
import type { MeetingDetail } from "@/lib/query/profile";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function MeetingDetailCard({ meeting }: { meeting: MeetingDetail }) {
  const dateStr = fmtDate(meeting.date);

  if (meeting.state !== "done") {
    return (
      <div className="rounded-lg border border-line bg-bg-elev p-4">
        <Pill variant="info" dot>Запланирована</Pill>
        <div className="mt-2 text-[14px] font-medium text-ink tabular">{dateStr}</div>
        <p className="mt-1 text-[13px] text-ink-3">Встреча ещё не проведена.</p>
        <div className="mt-3 flex gap-2">
          {/* stubs — wired in the MeetingDrawer slice */}
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">Провести сейчас</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Перенести</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Отменить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="flex items-center justify-between">
        <Pill variant="ok" dot>Завершена</Pill>
        <span className="text-[12px] text-ink-3 tabular">{dateStr} · {meeting.duration_min} мин</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-line-2 bg-bg-tint p-3">
          <div className="text-[11px] uppercase text-ink-3">Настроение</div>
          <div className="text-[15px] text-ink tabular">{meeting.mood ?? "—"} {meeting.mood_score ?? ""}</div>
        </div>
        <div className="rounded-md border border-line-2 bg-bg-tint p-3">
          <div className="text-[11px] uppercase text-ink-3">Отношения</div>
          <div className="text-[13px] text-ink-2">{meeting.relationships ?? "—"}</div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <NoteBlock label="Блокеры">{meeting.blockers ?? ""}</NoteBlock>
        <NoteBlock label="Цели">{meeting.goals ?? ""}</NoteBlock>
        <NoteBlock label="Фидбек к сотруднику">{meeting.feedback_to ?? ""}</NoteBlock>
        <NoteBlock label="Фидбек от сотрудника">{meeting.feedback_from ?? ""}</NoteBlock>
        {meeting.development.length > 0 && (
          <div className="rounded-md border border-line-2 bg-bg-tint p-3">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Развитие</div>
            <ul className="list-disc pl-4 text-[13px] text-ink-2">
              {meeting.development.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run → pass**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test MeetingDetailCard`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/NoteBlock.tsx web/components/MeetingDetailCard.tsx web/components/__tests__/MeetingDetailCard.test.tsx
git commit -m "feat(web): NoteBlock + MeetingDetailCard composites"
```

---

### Task 11: `Feed` / `FeedItem`

Right column of the History tab: all meetings as a list of date-chip + state-derived title + 2-line preview, active item highlighted, click selects.

**Files:**
- Create: `web/components/Feed.tsx`
- Test: `web/components/__tests__/Feed.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Feed } from "../Feed";
import type { MeetingListItem } from "@/lib/query/profile";

const ITEMS: MeetingListItem[] = [
  { id: "m1", date: "2026-05-25T09:00:00Z", state: "done", mood: "🙂", mood_score: 8, preview: "Флака в CI" },
  { id: "m2", date: "2026-06-20T09:00:00Z", state: "planned", mood: null, mood_score: null, preview: "Запланирована" },
];

describe("Feed", () => {
  it("renders a state-derived title and marks the active item", () => {
    render(<Feed items={ITEMS} activeId="m1" onSelect={() => {}} />);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
    expect(screen.getByText("Запланирована")).toBeInTheDocument();
    expect(screen.getByTestId("feed-item-m1")).toHaveAttribute("data-active", "true");
  });

  it("selects on click", () => {
    const onSelect = vi.fn();
    render(<Feed items={ITEMS} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("feed-item-m2"));
    expect(onSelect).toHaveBeenCalledWith("m2");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test Feed`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
"use client";
import { cn } from "@/lib/utils";
import type { MeetingListItem } from "@/lib/query/profile";

const TITLE: Record<string, string> = { done: "Завершена", planned: "Запланирована", miss: "Пропущена" };

function chip(iso: string) {
  const d = new Date(iso);
  return { day: d.getDate(), mon: d.toLocaleDateString("ru-RU", { month: "short" }) };
}

export function Feed({
  items, activeId, onSelect,
}: { items: MeetingListItem[]; activeId: string | null; onSelect: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-8 text-center text-[13px] text-ink-3">
        Встреч пока нет
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((m) => {
        const c = chip(m.date);
        const active = m.id === activeId;
        return (
          <button
            key={m.id}
            type="button"
            data-testid={`feed-item-${m.id}`}
            data-active={active}
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border p-3 text-left",
              active ? "border-brand bg-brand-soft" : "border-line bg-bg-elev hover:bg-bg-tint",
            )}
          >
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-bg-tint text-ink-2">
              <span className="text-[15px] font-semibold leading-none tabular">{c.day}</span>
              <span className="text-[10px] text-ink-3">{c.mon}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">{TITLE[m.state] ?? m.state}</span>
              <span className="line-clamp-2 text-[12px] text-ink-3">{m.preview}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

> If `line-clamp-2` isn't enabled in this Tailwind setup, the text still renders (the test only checks presence). Leave as-is; visual polish is fine.

- [ ] **Step 4: Run → pass**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test Feed`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Feed.tsx web/components/__tests__/Feed.test.tsx
git commit -m "feat(web): Feed/FeedItem composite"
```

---

### Task 12: Goals composites — `OkrCard` + `DevItem` + `CompetencyBar`

**Files:**
- Create: `web/components/OkrCard.tsx`, `web/components/DevItemRow.tsx`, `web/components/CompetencyBar.tsx`
- Test: `web/components/__tests__/GoalsComposites.test.tsx`

> File named `DevItemRow.tsx` (not `DevItem.tsx`) to avoid colliding with the `DevItem` **type** exported from `lib/query/profile.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OkrCard } from "../OkrCard";
import { DevItemRow } from "../DevItemRow";
import { CompetencyBar } from "../CompetencyBar";
import type { Goal, DevItem, Competency } from "@/lib/query/profile";

const OKR: Goal = {
  id: "g1", quarter: "Q2 2026", title: "Ускорить экраны", key_result: "LCP < 1.5s",
  progress: 60, status: "risk", due: "2026-07-01T00:00:00Z",
};

describe("Goals composites", () => {
  it("OkrCard shows the risk label and progress", () => {
    render(<OkrCard okr={OKR} />);
    expect(screen.getByText("Под риском")).toBeInTheDocument();
    expect(screen.getByText("LCP < 1.5s")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("DevItemRow renders title, kind and note", () => {
    const d: DevItem = { id: "d1", title: "Курс по перфу", kind: "Курс", status: "in_progress", note: "Прогресс 60%" };
    render(<DevItemRow item={d} />);
    expect(screen.getByText("Курс по перфу")).toBeInTheDocument();
    expect(screen.getByText("Прогресс 60%")).toBeInTheDocument();
  });

  it("CompetencyBar sets width from score", () => {
    const c: Competency = { id: "c1", label: "Frontend", score: 8 };
    render(<CompetencyBar competency={c} />);
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByTestId("comp-fill")).toHaveStyle({ width: "80%" });
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test GoalsComposites`
Expected: FAIL.

- [ ] **Step 3: Implement `OkrCard.tsx`**

```typescript
import { Pill } from "./Pill";
import type { Goal } from "@/lib/query/profile";

const STATUS: Record<string, { label: string; variant: "info" | "warn" | "ok" }> = {
  ontrack: { label: "В работе", variant: "info" },
  risk: { label: "Под риском", variant: "warn" },
  done: { label: "Готово", variant: "ok" },
};

function fmtDue(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function OkrCard({ okr }: { okr: Goal }) {
  const s = STATUS[okr.status] ?? STATUS.ontrack;
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{okr.title}</span>
        <Pill variant={s.variant} dot>{s.label}</Pill>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{okr.key_result}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${okr.progress}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3 tabular">
        <span>{okr.progress}%</span>
        <span>до {fmtDue(okr.due)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `DevItemRow.tsx`**

```typescript
import { cn } from "@/lib/utils";
import type { DevItem } from "@/lib/query/profile";

const DOT: Record<string, string> = {
  in_progress: "bg-brand",
  planned: "border border-line-strong",
  done: "bg-ok",
};

export function DevItemRow({ item }: { item: DevItem }) {
  return (
    <div className="flex items-start gap-3 border-b border-line-2 py-2.5 last:border-b-0">
      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", DOT[item.status] ?? DOT.planned)} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{item.title}</div>
        <div className="text-[11px] text-ink-3">
          {item.kind}{item.note ? ` · ${item.note}` : ""}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `CompetencyBar.tsx`**

```typescript
import type { Competency } from "@/lib/query/profile";

export function CompetencyBar({ competency }: { competency: Competency }) {
  const pct = Math.max(0, Math.min(10, competency.score)) * 10;
  return (
    <div className="py-1.5">
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-ink-2">{competency.label}</span>
        <span className="text-ink-3 tabular">{competency.score}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-sunken">
        <div data-testid="comp-fill" className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run → pass**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test GoalsComposites`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/OkrCard.tsx web/components/DevItemRow.tsx web/components/CompetencyBar.tsx web/components/__tests__/GoalsComposites.test.tsx
git commit -m "feat(web): OkrCard + DevItemRow + CompetencyBar composites"
```

---

### Task 13: Files composites — `FileGlyph` + `FileRow` + `FileTile`

**Files:**
- Create: `web/components/FileGlyph.tsx`, `web/components/FileRow.tsx`, `web/components/FileTile.tsx`
- Create: `web/lib/files.ts` (shared `humanSize` helper)
- Test: `web/components/__tests__/FilesComposites.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FileGlyph } from "../FileGlyph";
import { FileRow } from "../FileRow";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

const FILE: FileMeta = {
  id: "f1", name: "Итоги.pdf", mime: "application/pdf", kind: "pdf",
  size_bytes: 184320, meeting_label: "1-2-1 от 25.05.2026", uploaded_by: "Лид",
  created_at: "2026-05-25T09:00:00Z",
};

describe("Files composites", () => {
  it("humanSize formats bytes", () => {
    expect(humanSize(184320)).toBe("180 КБ");
    expect(humanSize(8388608)).toBe("8 МБ");
    expect(humanSize(512)).toBe("512 Б");
  });

  it("FileGlyph shows the kind label", () => {
    render(<FileGlyph kind="pdf" />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("FileRow shows name, meeting link and size", () => {
    render(<FileRow file={FILE} />);
    expect(screen.getByText("Итоги.pdf")).toBeInTheDocument();
    expect(screen.getByText("1-2-1 от 25.05.2026")).toBeInTheDocument();
    expect(screen.getByText("180 КБ")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test FilesComposites`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/files.ts`**

```typescript
/** Human-readable byte size with Russian units, rounded to whole units. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${Math.round(mb / 1024)} ГБ`;
}

export const FILE_KINDS = [
  { value: "all", label: "Все" },
  { value: "doc", label: "Документы" },
  { value: "img", label: "Изображения" },
  { value: "video", label: "Видео" },
  { value: "pdf", label: "PDF" },
  { value: "sheet", label: "Таблицы" },
] as const;
```

- [ ] **Step 4: Implement `FileGlyph.tsx`**

```typescript
import { cn } from "@/lib/utils";

const GLYPH: Record<string, { label: string; cls: string }> = {
  doc: { label: "DOC", cls: "bg-info-soft text-info" },
  img: { label: "IMG", cls: "bg-ok-soft text-ok" },
  pdf: { label: "PDF", cls: "bg-miss-soft text-miss" },
  video: { label: "MP4", cls: "bg-brand-soft text-brand-text" },
  sheet: { label: "XLS", cls: "bg-warn-soft text-warn" },
};

export function FileGlyph({ kind, size = 40 }: { kind: string; size?: number }) {
  const g = GLYPH[kind] ?? { label: "FILE", cls: "bg-bg-tint text-ink-3" };
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-md text-[10px] font-semibold", g.cls)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {g.label}
    </span>
  );
}
```

- [ ] **Step 5: Implement `FileRow.tsx`**

```typescript
import { FileGlyph } from "./FileGlyph";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

export function FileRow({ file }: { file: FileMeta }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-2 px-3 py-2.5 last:border-b-0 hover:bg-bg-tint">
      <FileGlyph kind={file.kind} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{file.name}</div>
        <div className="text-[11px] text-ink-3">
          {file.meeting_label ? <span>{file.meeting_label} · </span> : null}
          {file.uploaded_by}
        </div>
      </div>
      <span className="text-[12px] text-ink-3 tabular">{humanSize(file.size_bytes)}</span>
      {/* download stub — wired in the Files slice */}
      <button type="button" aria-label="Скачать" className="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken">↓</button>
    </div>
  );
}
```

- [ ] **Step 6: Implement `FileTile.tsx`**

```typescript
import { FileGlyph } from "./FileGlyph";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

export function FileTile({ file }: { file: FileMeta }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-bg-elev p-4 text-center hover:bg-bg-tint">
      <FileGlyph kind={file.kind} size={48} />
      <div className="w-full truncate text-[12px] font-medium text-ink">{file.name}</div>
      <div className="text-[11px] text-ink-3 tabular">{humanSize(file.size_bytes)}</div>
    </div>
  );
}
```

- [ ] **Step 7: Run → pass**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test FilesComposites`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/files.ts web/components/FileGlyph.tsx web/components/FileRow.tsx web/components/FileTile.tsx web/components/__tests__/FilesComposites.test.tsx
git commit -m "feat(web): FileGlyph + FileRow + FileTile composites + humanSize"
```

---

### Task 14: `ProfileHeader` + route layout (server component, 403 handling)

**Files:**
- Create: `web/components/ProfileHeader.tsx`
- Replace: `web/app/(app)/profile/[id]/page.tsx` (was the placeholder)
- Create: `web/app/(app)/profile/[id]/layout.tsx`

> The layout is a **server component** that fetches `/v1/members/:id` directly (so `require_member_access` is enforced server-side and a 403 shows «Нет доступа к этому профилю» before any client tab mounts). Fetch through the same internal API the proxy uses, forwarding the session cookie. Mirror `getSessionUser()`'s token handling (see `web/lib/auth.ts`).

- [ ] **Step 1: Implement `ProfileHeader.tsx`**

```typescript
import Link from "next/link";
import { Avatar } from "./Avatar";
import { Pill } from "./Pill";
import { MoodTrendBars } from "./MoodTrendBars";
import type { MemberDetail } from "@/lib/query/profile";

export function ProfileHeader({ member }: { member: MemberDetail }) {
  const latestMood = member.mood_trend.at(-1) ?? null;
  return (
    <div className="border-b border-line bg-bg-elev px-6 pb-4 pt-5">
      <Link href="/" className="text-[12px] text-ink-3 hover:text-ink-2">← Моя команда / {member.name}</Link>
      <div className="mt-3 flex items-start gap-4">
        <Avatar name={member.name} hue={member.hue} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold text-ink">{member.name}</h1>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {member.role} · с {member.joined} · {member.email} · {member.tz}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill variant={member.status === "ok" ? "ok" : member.status === "warn" ? "warn" : "miss"} dot>
              {member.status === "ok" ? "В норме" : member.status === "warn" ? "Внимание" : "Риск"}
            </Pill>
            <Pill variant="info">{member.meetings_total} встреч за год</Pill>
            {latestMood != null && (
              <span className="inline-flex items-center gap-1.5">
                <MoodTrendBars trend={member.mood_trend} />
                <span className="text-[12px] text-ink-3 tabular">Настроение {latestMood}/10</span>
              </span>
            )}
            {member.tags.map((t) => <Pill key={t}>{t}</Pill>)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* stubs */}
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Написать</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Экспорт</button>
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">Начать 1-2-1</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the server layout with tab nav + 403 handling**

Replace nothing yet — create `web/app/(app)/profile/[id]/layout.tsx`:

```typescript
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { ProfileHeader } from "@/components/ProfileHeader";
import type { MemberDetail } from "@/lib/query/profile";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

const TABS = [
  { key: "history", label: "История 1-2-1" },
  { key: "goals", label: "Цели и развитие" },
  { key: "files", label: "Файлы" },
];

export default async function ProfileLayout({
  params, children,
}: { params: { id: string }; children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API}/v1/members/${params.id}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (res.status === 403) {
    return (
      <div className="p-10 text-center">
        <p className="text-[15px] font-medium text-ink-2">Нет доступа к этому профилю</p>
        <Link href="/" className="mt-2 inline-block text-[13px] text-brand-text underline">← Вернуться к команде</Link>
      </div>
    );
  }
  if (!res.ok) {
    return <div className="p-10 text-center text-[14px] text-miss">Не удалось загрузить профиль.</div>;
  }
  const member: MemberDetail = await res.json();

  return (
    <div>
      <ProfileHeader member={member} />
      <nav className="flex gap-1 border-b border-line bg-bg-elev px-6">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/profile/${params.id}?tab=${t.key}`}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-[13px] text-ink-2 hover:text-ink data-[active=true]:border-brand data-[active=true]:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="p-6">{children}</div>
    </div>
  );
}
```

> The active-tab underline is finalized in Task 15 (the page reads `?tab` and we mark the active link). Keeping nav in the layout means it persists across tab switches. For active styling, the page sets it; simplest robust approach: render the nav in the page instead. **Decision:** move the `<nav>` into `page.tsx` (Step in Task 15) so it can read `searchParams.tab` and set `data-active`. Leave the layout rendering only the breadcrumb-less `ProfileHeader` + `{children}`. Update this layout's return to:

```typescript
  return (
    <div>
      <ProfileHeader member={member} />
      {children}
    </div>
  );
```

(Drop the `<nav>` and the `TABS`/`Link` import here; they move to the page.)

- [ ] **Step 3: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean (confirm `SESSION_COOKIE` is exported from `lib/auth.ts` — it is used by the proxy route).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/ProfileHeader.tsx web/app/(app)/profile/[id]/layout.tsx
git commit -m "feat(web): ProfileHeader + server profile layout (403 handling)"
```

---

### Task 15: Tabs + page wiring (History / Goals / Files)

**Files:**
- Replace: `web/app/(app)/profile/[id]/page.tsx`
- Create: `web/app/(app)/profile/[id]/HistoryTab.tsx`, `GoalsTab.tsx`, `FilesTab.tsx`

- [ ] **Step 1: Implement `HistoryTab.tsx`**

```typescript
"use client";
import { useState } from "react";
import { MonthCalendar, type CalMeeting } from "@/components/MonthCalendar";
import { MeetingDetailCard } from "@/components/MeetingDetailCard";
import { Feed } from "@/components/Feed";
import { useMemberMeetings, useMeeting } from "@/lib/query/profile";

export function HistoryTab({ memberId }: { memberId: string }) {
  const meetings = useMemberMeetings(memberId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const detail = useMeeting(selectedId);

  if (meetings.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (meetings.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить встречи.{" "}
        <button className="underline" onClick={() => meetings.refetch()}>Повторить</button>
      </div>
    );

  const items = meetings.data ?? [];
  const calMeetings: CalMeeting[] = items.map((m) => ({ id: m.id, date: m.date, state: m.state }));

  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-6">
      <div className="space-y-4">
        <MonthCalendar
          month={month}
          today={new Date()}
          meetings={calMeetings}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMonthChange={setMonth}
        />
        {selectedId && detail.data ? (
          <MeetingDetailCard meeting={detail.data} />
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[13px] text-ink-3">
            Выберите встречу в календаре или ленте
          </div>
        )}
      </div>
      <Feed items={items} activeId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
```

- [ ] **Step 2: Implement `GoalsTab.tsx`**

```typescript
"use client";
import { OkrCard } from "@/components/OkrCard";
import { DevItemRow } from "@/components/DevItemRow";
import { CompetencyBar } from "@/components/CompetencyBar";
import { useMemberGoals } from "@/lib/query/profile";

export function GoalsTab({ memberId }: { memberId: string }) {
  const goals = useMemberGoals(memberId);

  if (goals.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (goals.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить цели.{" "}
        <button className="underline" onClick={() => goals.refetch()}>Повторить</button>
      </div>
    );

  const { okrs, development, competencies } = goals.data!;

  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-6">
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Цели на {okrs[0]?.quarter ?? "квартал"}</h2>
          {okrs.length ? (
            <div className="space-y-3">{okrs.map((o) => <OkrCard key={o.id} okr={o} />)}</div>
          ) : (
            <p className="text-[13px] text-ink-3">Целей пока нет</p>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-ink">План развития</h2>
          {development.length ? (
            <div className="rounded-lg border border-line bg-bg-elev px-4">
              {development.map((d) => <DevItemRow key={d.id} item={d} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">План развития пуст</p>
          )}
        </section>
      </div>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Компетенции</h2>
        <div className="rounded-lg border border-line bg-bg-elev p-4">
          {competencies.length ? (
            competencies.map((c) => <CompetencyBar key={c.id} competency={c} />)
          ) : (
            <p className="text-[13px] text-ink-3">Нет данных</p>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Implement `FilesTab.tsx`**

```typescript
"use client";
import { useMemo, useState } from "react";
import { SegControl } from "@/components/SegControl";
import { FileRow } from "@/components/FileRow";
import { FileTile } from "@/components/FileTile";
import { humanSize, FILE_KINDS } from "@/lib/files";
import { useMemberFiles } from "@/lib/query/profile";

export function FilesTab({ memberId }: { memberId: string }) {
  const files = useMemberFiles(memberId);
  const [kind, setKind] = useState("all");
  const [view, setView] = useState("list");

  const all = files.data ?? [];
  const shown = useMemo(() => (kind === "all" ? all : all.filter((f) => f.kind === kind)), [all, kind]);
  const totalBytes = all.reduce((s, f) => s + f.size_bytes, 0);
  const last = all[0]?.created_at;

  const kindOptions = FILE_KINDS.map((k) =>
    k.value === "all" ? { value: "all", label: `Все · ${all.length}` } : k,
  );

  if (files.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (files.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить файлы.{" "}
        <button className="underline" onClick={() => files.refetch()}>Повторить</button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegControl options={kindOptions} value={kind} onChange={setKind} />
        <div className="flex items-center gap-2">
          <SegControl
            options={[{ value: "list", label: "Список" }, { value: "grid", label: "Плитки" }]}
            value={view}
            onChange={setView}
          />
          {/* stub */}
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Скачать .zip</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[13px]">
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Всего</div>
          <div className="text-[16px] font-semibold text-ink tabular">{all.length} файлов</div>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Объём</div>
          <div className="text-[16px] font-semibold text-ink tabular">{humanSize(totalBytes)}</div>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Последний</div>
          <div className="text-[16px] font-semibold text-ink tabular">
            {last ? new Date(last).toLocaleDateString("ru-RU") : "—"}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
          Файлов пока нет
        </div>
      ) : view === "list" ? (
        <div className="rounded-lg border border-line bg-bg-elev">
          {shown.map((f) => <FileRow key={f.id} file={f} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {shown.map((f) => <FileTile key={f.id} file={f} />)}
        </div>
      )}

      {/* footer drop-zone — stub */}
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[12px] text-ink-3">
        Перетащите файлы сюда, чтобы загрузить (скоро)
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `page.tsx` (tab nav + switch)**

Replace `web/app/(app)/profile/[id]/page.tsx` entirely:

```typescript
import Link from "next/link";
import { HistoryTab } from "./HistoryTab";
import { GoalsTab } from "./GoalsTab";
import { FilesTab } from "./FilesTab";

const TABS = [
  { key: "history", label: "История 1-2-1" },
  { key: "goals", label: "Цели и развитие" },
  { key: "files", label: "Файлы" },
];

export default function ProfilePage({
  params, searchParams,
}: { params: { id: string }; searchParams: { tab?: string } }) {
  const tab = searchParams.tab ?? "history";

  return (
    <>
      <nav className="-mt-2 mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/profile/${params.id}?tab=${t.key}`}
            data-active={tab === t.key}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-[13px] text-ink-2 hover:text-ink data-[active=true]:border-brand data-[active=true]:font-medium data-[active=true]:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "goals" ? (
        <GoalsTab memberId={params.id} />
      ) : tab === "files" ? (
        <FilesTab memberId={params.id} />
      ) : (
        <HistoryTab memberId={params.id} />
      )}
    </>
  );
}
```

- [ ] **Step 5: Typecheck + unit tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: typecheck clean; all component tests PASS.

- [ ] **Step 6: Manual smoke (API + dev server running, dev DB re-seeded from Task 2)**

Open `http://localhost:3000`, log in (`e.glebov@beeteam.io` / `demo1234`), click Anna's row. Verify: header «Анна Лебедева», three tabs; History shows calendar + feed, clicking a meeting day shows its detail; «Цели и развитие» shows OKR cards + competencies; «Файлы» shows the stats card + list, the type filter narrows the list, and «Плитки» switches to tiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/app/(app)/profile/[id]/page.tsx web/app/(app)/profile/[id]/HistoryTab.tsx web/app/(app)/profile/[id]/GoalsTab.tsx web/app/(app)/profile/[id]/FilesTab.tsx
git commit -m "feat(web): profile tabs (History/Goals/Files) + tab nav"
```

---

### Task 16: Playwright e2e

**Files:**
- Create: `web/e2e/profile.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```typescript
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("opens Anna's profile and walks the three tabs", async ({ page }) => {
  await login(page);

  // Open Anna from the team list.
  await page.getByText("Анна Лебедева").click();
  await expect(page).toHaveURL(/\/profile\//);
  await expect(page.getByRole("heading", { name: "Анна Лебедева" })).toBeVisible();

  // History (default): calendar + feed, click a meeting → detail.
  await expect(page.getByText("История 1-2-1")).toBeVisible();
  const feedItem = page.locator('[data-testid^="feed-item-"]').first();
  await expect(feedItem).toBeVisible({ timeout: 10_000 });
  await feedItem.click();

  // Goals tab.
  await page.getByRole("link", { name: "Цели и развитие" }).click();
  await expect(page).toHaveURL(/tab=goals/);
  await expect(page.getByText("Компетенции")).toBeVisible({ timeout: 10_000 });

  // Files tab.
  await page.getByRole("link", { name: "Файлы" }).click();
  await expect(page).toHaveURL(/tab=files/);
  await expect(page.getByText(/Всего/)).toBeVisible({ timeout: 10_000 });
});

test("a foreign member id is forbidden at the API", async ({ request }) => {
  // The profile endpoints enforce require_member_access; an unauthenticated
  // (or foreign) request must not return member data. The Next proxy forwards
  // no cookie here → 401/403, never 200.
  const res = await request.get("/api/v1/members/00000000-0000-0000-0000-000000000000");
  expect([401, 403, 404]).toContain(res.status());
});
```

> The negative test hits the proxy without a session, so it asserts the endpoint is guarded (no 200). A stricter "foreign authenticated lead → 403" requires a second seeded lead; the backend tests in Task 4–6 already cover that exhaustively, so the e2e keeps it light.

- [ ] **Step 2: Run e2e (API + seeded dev DB required)**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e profile`
Expected: both tests PASS. (Playwright auto-starts `pnpm dev`; the API must be running separately on :8080 with the re-seeded dev DB.)

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/profile.spec.ts
git commit -m "test(web): profile e2e — tabs walkthrough + guarded endpoint"
```

---

## Final verification

- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh` → all PASS.
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e: `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: profile header (no grade pill), all three tabs render Anna's seeded data; a teammate of a *different* lead returns «Нет доступа к этому профилю».
- [ ] Then use `superpowers:finishing-a-development-branch` to merge.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- Migration `0003_profile` (development_items + competencies) → Task 1 ✓
- Seed OKR/dev/competencies/files for Anna + base for others → Task 2 ✓
- `require_member_access` on all 5 endpoints (incl. `/meetings/:id` member-from-meeting) → Task 4 (guard + member detail), Task 5 (meetings list + meeting detail), Task 6 (goals + files); each has a foreign-lead 403 test ✓
- 5 GET endpoints with the exact DTO shapes → Tasks 3–6 ✓ (MemberDetail incl. `meetings_total`; MeetingListItem `preview` = first non-empty blockers/goals else state hint; MeetingDetail all note fields; GoalsResponse 3 sections; FileMeta `meeting_label`) ✓
- OpenAPI + `pnpm gen:api` → Task 7 ✓
- Routing `app/(app)/profile/[id]` server layout (header + 403) + client tabs by `?tab` (history default) → Tasks 14–15 ✓
- Header per `screens.jsx:401` (breadcrumb, Avatar XL, meta, status/meetings/mood/tags pills, stub actions, **no grade pill**) → Task 14 ✓
- History tab grid 1.45/1 (MonthCalendar + MeetingDetailCard + Feed; done vs planned branch; NoteBlock hides empty) → Tasks 9–11, 15 ✓
- Goals tab (OKR cards, dev plan dots by status, competency bars; career/mentorship deferred) → Tasks 12, 15 ✓
- Files tab read-only (type filter incl. «Все·N», list/grid, stats card, glyphs, download/.zip/dropzone stubs) → Tasks 13, 15 ✓
- States: loading/error/empty with the spec's Russian copy («Встреч пока нет», «Целей пока нет», «Файлов пока нет», «Нет доступа к этому профилю») → Tasks 11/14/15 ✓
- Vitest coverage (MonthCalendar, MeetingDetailCard, Feed, OkrCard, CompetencyBar, FileGlyph/FileRow) → Tasks 9–13 ✓
- Playwright (login→TeamList→Anna→tabs; guarded endpoint) → Task 16 ✓
- Stubs rendered, no behavior; mutations out of scope → buttons are inert throughout ✓
- Preserve: `brand` token (not accent), tabular-nums, Russian microcopy verbatim, pill dot+border, no grade pill → enforced in component code + conventions note ✓

**Type consistency:** DTO field names (Task 3) are used verbatim by the hooks (Task 8) via generated types, and by the composites. `DevItem` type vs `DevItemRow` component named distinctly to avoid collision. `MeetingListItem.preview`/`state` feed `Feed` and `MonthCalendar`. `meeting_label`/`size_bytes`/`kind` feed `FileRow`/`FileTile`/`humanSize`. Calendar `state` chip keys (`done`/`planned`/`miss`) match `meeting_state` enum values.

**Known follow-up baked into the plan:** Task 14 Step 2 explicitly relocates the tab `<nav>` from the layout into `page.tsx` (so it can read `searchParams.tab`); the layout ends up rendering only `ProfileHeader` + `{children}`.
