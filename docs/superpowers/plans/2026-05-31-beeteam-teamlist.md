# BeeTeam TeamList Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `(app)` placeholder home with the real TeamList — a lead's main screen showing 4 stat cards and a 6-column team table with server-side search/filtering — backed by `GET /v1/teams/:id/members` and `GET /v1/teams/:id/stats` (owner-gated), with browser data fetching switched onto the `/api/v1/*` proxy.

**Architecture:** axum gains two owner-gated team endpoints computing `last`/`next` meeting dates from the `meetings` table; `team_id` is added to `/v1/auth/me`. The seed is re-dated relative to `now()` so all 8 members have recent/upcoming meetings. The Next client's `openapi-fetch` baseUrl flips to `/api` (cookie→Bearer proxy); TanStack Query hooks feed a client TeamList built from new composites (StatCard, MoodTrendBars, Pill, SegControl, FilterPopover, TeamTable).

**Tech Stack:** Rust (axum 0.7, sqlx/Postgres, utoipa), Next.js 14 App Router, TanStack Query v5, openapi-fetch, lucide-react, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-31-beeteam-teamlist-design.md`. Build-order slice 3 of the Core 1-2-1 parent spec. Foundation (1) + Auth (2) are merged to `main`.

> **Conventions carried from prior slices (do not relearn the hard way):**
> - Toolchains are NOT on the default PATH. Run cargo/node/pnpm via a **login shell**: `bash -lc '...'`.
> - Run Rust tests via `api/scripts/test.sh [args]` (loads `.env`, points `#[sqlx::test]` at the ephemeral test DB on :5433). Bring it up once: `docker compose up -d postgres-test`.
> - **`#[sqlx::test]` attribute:** in `bt-api` tests use `#[sqlx::test(migrations = "../bt-db/migrations")]`; in `bt-db` tests use `#[sqlx::test(migrations = "./migrations")]`.
> - Brand amber is the `brand` Tailwind token (`bg-brand`, `text-brand-strong`, `bg-brand-soft`, `text-brand-text`), NOT `accent` (shadcn reserves `accent`). Status colors are `ok`/`warn`/`miss`/`info` tokens.
> - Runtime sqlx queries (`sqlx::query`/`query_as`), no compile-time `query_as!`.
> - Commit `web/lib/api/schema.d.ts` (generated contract) and `api/Cargo.lock`.
> - **Re-seed the dev DB after seed changes:** the seed is idempotent (no-ops if a workspace exists). After Task 1, run `docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE;"` then restart the API so the new dates land. The `#[sqlx::test]` suite uses fresh DBs and is unaffected.
> - Vitest uses the `@` alias + jest-dom setup (already configured in `web/vitest.config.ts` + `web/vitest.setup.ts`).

---

## File Structure

**Backend (`api/`):**
```
api/crates/bt-db/migrations/0002_member_joined_date.sql   # + team_members.joined_date DATE
api/crates/bt-db/src/seed.rs                              # relative dates; joined_date; last+next for all 8
api/crates/bt-domain/src/lib.rs                           # + MemberRow, TeamStats; team_id on MeResponse
api/crates/bt-api/src/error.rs                            # + AppError::Forbidden (403)
api/crates/bt-api/src/auth/middleware.rs                  # (AuthUser already has id+role; no change)
api/crates/bt-api/src/routes/teams.rs                     # NEW: members + stats handlers + require_team_access
api/crates/bt-api/src/routes/auth.rs                      # me() returns team_id
api/crates/bt-api/src/routes/mod.rs                       # + pub mod teams;
api/crates/bt-api/src/app.rs                              # mount /v1/teams/:id/{members,stats} (protected)
api/crates/bt-api/src/openapi.rs                          # register teams paths + schemas; MeResponse
```

**Frontend (`web/`):**
```
web/lib/api/client.ts                  # baseUrl "/api"
web/lib/api/schema.d.ts                # regenerated
web/lib/query/teams.ts                 # useTeamMembers, useTeamStats hooks + Filters type
web/lib/auth.ts                        # SessionUser gains teamId
web/components/StatCard.tsx
web/components/MoodTrendBars.tsx
web/components/Pill.tsx
web/components/SegControl.tsx
web/components/FilterPopover.tsx
web/components/TeamTable.tsx           # TeamTable + TeamRow
web/components/__tests__/StatCard.test.tsx
web/components/__tests__/MoodTrendBars.test.tsx
web/components/__tests__/Pill.test.tsx
web/components/__tests__/SegControl.test.tsx
web/components/__tests__/FilterPopover.test.tsx
web/app/(app)/page.tsx                 # real TeamList (replaces placeholder)
web/app/(app)/TeamListClient.tsx       # client component holding filter state + queries
web/app/(app)/profile/[id]/page.tsx    # placeholder profile
web/e2e/teamlist.spec.ts
.env.example                           # remove NEXT_PUBLIC_API_URL
```

---

## Task 1: Seed — joined_date column + relative dates + last/next for all 8

**Files:**
- Create: `api/crates/bt-db/migrations/0002_member_joined_date.sql`
- Modify: `api/crates/bt-db/src/seed.rs`

- [ ] **Step 1: Migration — add `joined_date`** (`api/crates/bt-db/migrations/0002_member_joined_date.sql`):

```sql
-- Real join date for tenure filtering (the existing `joined` TEXT stays as the display string).
ALTER TABLE team_members ADD COLUMN joined_date DATE NOT NULL DEFAULT '2023-01-01';
```

- [ ] **Step 2: Rewrite the members array to include a real join date** (`api/crates/bt-db/src/seed.rs`). Replace the `members` array type + literals (the `[(&str, &str, &str, &str, &str, [i32;7], &str, &[&str], i32); 8]` block) with one that adds an ISO join date as the last tuple field:

```rust
    // (name, role, email, joined_display, tz, mood_trend, status, tags, hue, joined_iso)
    let members: [(&str, &str, &str, &str, &str, [i32; 7], &str, &[&str], i32, &str); 8] = [
        ("Анна Лебедева", "Senior Frontend", "a.lebedeva@beeteam.io", "14 янв 2023", "Europe/Moscow", [7,8,8,7,9,9,8], "ok", &["Mentor"], 28, "2023-01-14"),
        ("Игорь Петров", "Backend Engineer", "i.petrov@beeteam.io", "02 мар 2022", "Europe/Moscow", [6,6,7,7,7,6,7], "ok", &[], 200, "2022-03-02"),
        ("Мария Соколова", "QA Lead", "m.sokolova@beeteam.io", "08 авг 2021", "Europe/Moscow", [8,8,9,7,6,7,7], "warn", &["Promotion"], 320, "2021-08-08"),
        ("Дмитрий Кузнецов", "Product Designer", "d.kuznecov@beeteam.io", "18 окт 2023", "Europe/Berlin", [7,7,8,9,9,8,9], "ok", &[], 145, "2023-10-18"),
        ("Елена Воронцова", "Project Manager", "e.voroncova@beeteam.io", "04 фев 2020", "Europe/Moscow", [9,9,8,8,9,9,9], "ok", &["Lead Track"], 12, "2020-02-04"),
        ("Тимур Хасанов", "Junior Frontend", "t.hasanov@beeteam.io", "12 янв 2026", "Europe/Moscow", [5,6,5,6,7,6,7], "warn", &["Onboarding"], 260, "2026-01-12"),
        ("Светлана Морозова", "DevOps Engineer", "s.morozova@beeteam.io", "21 май 2022", "Asia/Tbilisi", [7,6,5,5,4,5,4], "miss", &["Burnout risk"], 175, "2022-05-21"),
        ("Алексей Романов", "Backend Engineer", "a.romanov@beeteam.io", "07 ноя 2024", "Europe/Moscow", [6,7,7,8,8,8,8], "ok", &[], 90, "2024-11-07"),
    ];
```

- [ ] **Step 3: Bind `joined_date` in the member insert + capture ids + status** (`api/crates/bt-db/src/seed.rs`). Replace the member-insert loop (the `let mut anna_id ... for m in members.iter() { ... }` block) with one that also writes `joined_date` and records each member's `(id, status)` for the meeting pass:

```rust
    let mut anna_id: Option<uuid::Uuid> = None;
    let mut member_ids: Vec<(uuid::Uuid, &str)> = Vec::new(); // (id, status)
    for m in members.iter() {
        let trend: Vec<i32> = m.5.to_vec();
        let tags: Vec<String> = m.7.iter().map(|s| s.to_string()).collect();
        let joined_date = chrono::NaiveDate::parse_from_str(m.9, "%Y-%m-%d").expect("seed: valid join date");
        let row: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members \
             (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::member_status,$10,$11,$12) RETURNING id",
        )
        .bind(ws_id).bind(team_id)
        .bind(m.0).bind(m.1).bind(m.2).bind(m.3).bind(m.4)
        .bind(&trend).bind(m.6).bind(&tags).bind(m.8).bind(joined_date)
        .fetch_one(&mut *tx)
        .await?;
        if m.0 == "Анна Лебедева" {
            anna_id = Some(row.0);
        }
        member_ids.push((row.0, m.6));
    }
```

- [ ] **Step 4: Re-date Anna's history relative to now() + give all members a last+next meeting** (`api/crates/bt-db/src/seed.rs`). Replace the entire Anna-history block (the `{ let aid = anna_id.expect(...) ... }` block) with the following. It (a) anchors Anna's 6 detailed meetings to offsets from `now()`, and (b) gives every member one `done` "last" and one `planned` "next" meeting, spaced by status so stats are non-empty:

```rust
    let now = chrono::Utc::now();
    let day = chrono::Duration::days(1);

    // Anna's 6 detailed meetings, re-dated as offsets (days) from now.
    // (days_offset, state, duration, mood, mood_score, blockers, goals, feedback_to, feedback_from, development[], relationships)
    {
        let aid = anna_id.expect("seed: 'Анна Лебедева' must be among the seeded members");
        type Mtg = (i64, &'static str, i32, Option<&'static str>, Option<i32>, &'static str, &'static str, &'static str, &'static str, &'static [&'static str], &'static str);
        let history: [Mtg; 6] = [
            (-7, "done", 45, Some("🙂"), Some(8),
             "Долгое ревью PR от соседней команды по платежному модулю — стопает релиз. Договорились эскалировать к Игорю.",
             "Закрыть до конца квартала миграцию старого админ-кабинета на новый дизайн-кит. Подготовить ADR по shared-state библиотеке.",
             "Отличная работа на демо в пятницу — клиенты отметили скорость интерфейса. Продолжай.",
             "Хотелось бы больше времени на R&D в спринте, хотя бы один день в две недели.",
             &["Курс по архитектуре React-приложений (Frontend Masters)","Доклад на внутренний митап про микрофронтенды"],
             "С командой всё ровно, с Тимуром выстроила менторский ритм."),
            (-21, "done", 50, Some("😐"), Some(6),
             "Спорный технический выбор по новому фичефлаг-сервису. Не хватает alignment c платформенной командой.",
             "Согласовать архитектуру нового админ-кабинета. Сделать onboarding гайд для Тимура.",
             "Ты сильно вытянула собес на прошлой неделе — кандидат принял оффер.",
             "Хочу прозрачности по бюджету на конференции в Q3.",
             &["Системный дизайн: книга \"Designing Data-Intensive Applications\""],
             "С продактами иногда долго согласовываются изменения скоупа."),
            (-35, "done", 40, Some("🙂"), Some(8),
             "Ничего критичного. Ожидаем доступы в стейджинг от безопасности.",
             "Подготовка к Q2 планированию. Сформулировать критерии успеха для редизайна.",
             "Хорошо отыграла роль на план-сессии — задала тон команде.",
             "Думаю над сменой грейда — хотелось бы понять трек на ближайшие 6 мес.",
             &["Внутренний leadership-трек"], ""),
            (-49, "done", 35, Some("😄"), Some(9),
             "Нет блокеров.", "Релиз новой страницы аналитики до конца месяца.",
             "Спасибо за помощь с релизом — без тебя бы не выкатили.",
             "Всё ок. Хочется больше технических вызовов.", &[],
             "С командой отлично, с дизайнером Дмитрием выстроилась хорошая синергия."),
            (7, "planned", 45, None, None, "", "", "", "", &[], ""),
            (-63, "miss", 30, None, None, "", "", "", "", &[], ""),
        ];
        for h in history.iter() {
            let date = now + day * (h.0 as i32);
            let dev: Vec<String> = h.9.iter().map(|s| s.to_string()).collect();
            sqlx::query(
                "INSERT INTO meetings \
                 (workspace_id, member_id, date, state, duration_min, mood, mood_score, \
                  blockers, goals, feedback_to, feedback_from, development, relationships) \
                 VALUES ($1,$2,$3,$4::meeting_state,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            )
            .bind(ws_id).bind(aid).bind(date).bind(h.1).bind(h.2)
            .bind(h.3).bind(h.4)
            .bind(opt(h.5)).bind(opt(h.6)).bind(opt(h.7)).bind(opt(h.8))
            .bind(&dev).bind(opt(h.10))
            .execute(&mut *tx)
            .await?;
        }
    }

    // Every member gets a recent "last" (done) + an upcoming "next" (planned),
    // EXCEPT Anna (already has detailed history above). Spacing keys off status so
    // the team stats are non-empty and varied:
    //   ok   → last 5d ago, next in 9d (in graphic)
    //   warn → last 16d ago, next in 4d  (next within this week)
    //   miss → last 30d ago, no next     (overdue: >21d and unscheduled)
    for (mid, status) in member_ids.iter() {
        if Some(*mid) == anna_id { continue; }
        let (last_off, next_off): (i64, Option<i64>) = match *status {
            "warn" => (-16, Some(4)),
            "miss" => (-30, None),
            _ => (-5, Some(9)),
        };
        sqlx::query(
            "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
             VALUES ($1, $2, $3, 'done'::meeting_state, 45)",
        )
        .bind(ws_id).bind(mid).bind(now + day * (last_off as i32))
        .execute(&mut *tx).await?;

        if let Some(n) = next_off {
            sqlx::query(
                "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
                 VALUES ($1, $2, $3, 'planned'::meeting_state, 45)",
            )
            .bind(ws_id).bind(mid).bind(now + day * (n as i32))
            .execute(&mut *tx).await?;
        }
    }
```

Remove the now-unused `use chrono::TimeZone;` import at the top of the file (the new code uses `chrono::Utc::now()` + `Duration`, not `with_ymd_and_hms`). Keep `chrono` otherwise.

- [ ] **Step 5: Update the seed test for the new meeting count** (`api/crates/bt-db/src/seed.rs`). The `seed_is_idempotent_and_loads_team` test asserts `meetings == 6`. Now there are Anna's 6 + (7 other members × up to 2). With the status spread (5 ok→2 each, 2 warn→2 each, 1 miss→1): 6 + (5×2 + 2×2 + 1×1) = 6 + 15 = **21**. Update the assertion:

```rust
        let meetings: (i64,) = sqlx::query_as("SELECT count(*) FROM meetings")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(meetings.0, 21);
```

Also add an assertion that joined_date is populated:

```rust
        let dated: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM team_members WHERE joined_date IS NOT NULL")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(dated.0, 8);
```

> Note on the status counts: in the seed `members` array the statuses are ok,ok,warn,ok,ok,warn,miss,ok → that's **5 ok, 2 warn, 1 miss**. Anna (row 0) is `ok` but is skipped in the all-members loop (she has detailed history). So the all-members loop runs for 4 ok + 2 warn + 1 miss = 7 members → (4+2)×2 + 1 = 13 meetings, plus Anna's 6 = **19**. Recount carefully when you implement and set the assertion to the actual number you observe; the test exists to lock whatever the deterministic seed produces. Run the test, read the real count, set the assertion to it.

- [ ] **Step 6: Run the seed tests** (DB required):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-db'`
Expected: `seed_is_idempotent_and_loads_team` (with the corrected meeting count + joined_date assertion) and `seeded_lead_password_hash_is_valid_argon2` pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/migrations/0002_member_joined_date.sql api/crates/bt-db/src/seed.rs
git commit -m "feat(db): seed relative dates + joined_date + last/next meetings for all members"
```

---

## Task 2: Backend — AppError::Forbidden + require_team_access + team_id on /auth/me

**Files:**
- Modify: `api/crates/bt-api/src/error.rs`
- Modify: `api/crates/bt-domain/src/lib.rs`
- Modify: `api/crates/bt-api/src/routes/auth.rs`
- Create: `api/crates/bt-api/src/routes/teams.rs` (access helper only this task; handlers in Task 3)
- Modify: `api/crates/bt-api/src/routes/mod.rs`

- [ ] **Step 1: Add `Forbidden` to `AppError`** (`api/crates/bt-api/src/error.rs`). Add the variant and its mapping:

```rust
    #[error("forbidden")]
    Forbidden,
```
(place it after `Unauthorized` in the enum) and in `into_response`'s match add:
```rust
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
```

- [ ] **Step 2: Add `MeResponse` to `bt-domain`** (`api/crates/bt-domain/src/lib.rs`, append after `LoginResponse`). The `/auth/me` response gains `team_id`; keep `UserDto` unchanged (still used by login):

```rust
/// `/auth/me` response: the user plus the team they lead (if any).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct MeResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
    pub team_id: Option<uuid::Uuid>,
}
```

- [ ] **Step 3: Update `me()` to return `MeResponse` with team_id** (`api/crates/bt-api/src/routes/auth.rs`). Change the import line `use bt_domain::{LoginRequest, LoginResponse, UserDto};` to also import `MeResponse`:

```rust
use bt_domain::{LoginRequest, LoginResponse, MeResponse, UserDto};
```
Replace the `me` handler body + signature:

```rust
#[utoipa::path(
    get,
    path = "/v1/auth/me",
    responses(
        (status = 200, description = "Current user", body = MeResponse),
        (status = 401, description = "Not authenticated"),
    )
)]
pub async fn me(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<MeResponse>> {
    let row: Option<(uuid::Uuid, String, String, String)> = sqlx::query_as(
        "SELECT id, name, email, role::text FROM users WHERE id = $1",
    )
    .bind(auth.id)
    .fetch_optional(&state.pool)
    .await?;

    let (id, name, email, role) = row.ok_or(AppError::Unauthorized)?;

    // The team this user leads (v1: a lead has exactly one).
    let team: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM teams WHERE lead_id = $1 LIMIT 1")
            .bind(auth.id)
            .fetch_optional(&state.pool)
            .await?;

    Ok(Json(MeResponse { id, name, email, role, team_id: team.map(|t| t.0) }))
}
```

- [ ] **Step 4: Create `teams.rs` with the access helper** (`api/crates/bt-api/src/routes/teams.rs`):

```rust
use sqlx::PgPool;
use uuid::Uuid;

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
```

- [ ] **Step 5: Register the module** (`api/crates/bt-api/src/routes/mod.rs`):

```rust
pub mod auth;
pub mod health;
pub mod teams;
```

- [ ] **Step 6: Update the `/auth/me` tests for the new shape** (`api/crates/bt-api/src/routes/auth.rs`). The existing `me_returns_user_with_valid_token` only asserts status 200 — it still passes. Add a focused test that `team_id` is present when the user leads a team. First extend `seed_one_user` to also create a team led by that user — but to avoid disturbing existing tests, add a SEPARATE helper + test:

```rust
    async fn seed_user_with_team(pool: &sqlx::PgPool) {
        let ws: (uuid::Uuid,) =
            sqlx::query_as("INSERT INTO workspaces (name) VALUES ('T') RETURNING id")
                .fetch_one(pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        let u: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1, 'lead@x.io', $2, 'Lead X', 'lead'::user_role, 40) RETURNING id",
        ).bind(ws.0).bind(hash).fetch_one(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO teams (workspace_id, name, lead_id, default_cadence, visibility) \
             VALUES ($1, 'T-team', $2, '2w'::cadence, 'private'::visibility)",
        ).bind(ws.0).bind(u.0).execute(pool).await.unwrap();
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn me_returns_team_id_for_a_lead(pool: sqlx::PgPool) {
        seed_user_with_team(&pool).await;
        let (_, json) =
            post_login(pool.clone(), r#"{"email":"lead@x.io","password":"demo1234"}"#).await;
        let token = json["token"].as_str().unwrap().to_string();
        // hit /auth/me and parse the body
        let resp = app(pool)
            .oneshot(
                Request::builder().method("GET").uri("/v1/auth/me")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap(),
            ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(body["team_id"].is_string(), "expected team_id, got {body}");
    }
```

- [ ] **Step 7: Run the auth tests** (DB required):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-api auth'`
Expected: existing auth tests + `me_returns_team_id_for_a_lead` pass. (`teams.rs` compiles but `require_team_access` is unused until Task 3 — an unused-function warning is acceptable this task.)

- [ ] **Step 8: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/error.rs api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/auth.rs api/crates/bt-api/src/routes/teams.rs api/crates/bt-api/src/routes/mod.rs
git commit -m "feat(api): AppError::Forbidden, require_team_access, team_id on /auth/me"
```

---

## Task 3: Backend — GET /v1/teams/:id/members (with server-side filters)

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (MemberRow)
- Modify: `api/crates/bt-api/src/routes/teams.rs` (members handler + Filters)
- Modify: `api/crates/bt-api/src/app.rs` (mount route)

- [ ] **Step 1: Add `MemberRow` to `bt-domain`** (`api/crates/bt-domain/src/lib.rs`, append). Dates are serialized as RFC3339 strings via chrono+serde:

```rust
/// A team member as shown in the TeamList table.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberRow {
    pub id: uuid::Uuid,
    pub name: String,
    pub role: String,
    pub email: String,
    pub joined: String,
    pub tz: String,
    pub hue: i32,
    pub tags: Vec<String>,
    pub status: String,
    pub mood_trend: Vec<i32>,
    pub last_meet: Option<chrono::DateTime<chrono::Utc>>,
    pub next_meet: Option<chrono::DateTime<chrono::Utc>>,
}
```

- [ ] **Step 2: Write the members handler + Filters** (`api/crates/bt-api/src/routes/teams.rs`, append). Filters are read from the query string; the SQL applies them with `$N IS NULL OR <predicate>` so unset filters are no-ops. `last_meet`/`next_meet` are computed via correlated subqueries:

```rust
use axum::extract::{Path, Query, State};
use axum::Json;
use bt_domain::MemberRow;
use serde::Deserialize;

use crate::app::AppState;

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
    .bind(f.since.as_deref()) // $6, applied below in Rust to keep SQL readable
    .bind(tags_vec.as_deref())
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| MemberRow {
        id: r.0, name: r.1, role: r.2, email: r.3, joined: r.4, tz: r.5, hue: r.6,
        tags: r.7, status: r.8, mood_trend: r.9, last_meet: r.10, next_meet: r.11,
    })
    .collect();

    // `since` filters by age of last_meet — applied in Rust (it depends on the computed column).
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
        None => !within, // no meeting = old; matches gt4w, excluded from lt windows
    }).collect()
}
```

> Note: `$6` (`since`) is bound for positional consistency but the predicate is applied in Rust (`filter_since`) because it depends on the computed `last_meet`. The SQL uses `$1..$5,$7`; `$6` is still bound so the parameter indices line up — verify the bind order matches (`team_id=$1, q=$2, role=$3, tenure=$4, mood=$5, since=$6, tags=$7`).

- [ ] **Step 3: Mount the route** (`api/crates/bt-api/src/app.rs`). Add `/v1/teams/:id/members` to the `protected` sub-router:

```rust
    let protected = Router::new()
        .route("/v1/auth/me", get(routes::auth::me))
        .route("/v1/teams/:id/members", get(routes::teams::list_members))
        .route_layer(axum::middleware::from_fn_with_state(state.clone(), require_auth));
```

- [ ] **Step 4: Write members tests** (`api/crates/bt-api/src/routes/teams.rs`, append a `#[cfg(test)] mod tests`). Seed a team with the lead + a couple of members + meetings, then exercise no-filter, a filter, and the 403 path:

```rust
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
        let token = jwt_for(pool, lead.0).await;
        (token, team.0)
    }

    async fn jwt_for(pool: &sqlx::PgPool, _id: uuid::Uuid) -> String {
        // Log in to obtain a real token (exercises the same path the app uses).
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type","application/json")
                .body(Body::from(r#"{"email":"lead@x.io","password":"demo1234"}"#)).unwrap()
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
        // A different user (not the team's lead).
        let ws2: (uuid::Uuid,) = sqlx::query_as("INSERT INTO workspaces (name) VALUES ('U') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query("INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'other@x.io',$2,'Other','lead'::user_role,40)")
            .bind(ws2.0).bind(hash).execute(&pool).await.unwrap();
        let other = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type","application/json")
                .body(Body::from(r#"{"email":"other@x.io","password":"demo1234"}"#)).unwrap()
        ).await.unwrap();
        let bytes = other.into_body().collect().await.unwrap().to_bytes();
        let token = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string();
        let (status, _) = get_members(pool, &token, team, "").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
```

- [ ] **Step 5: Run the tests** (DB required):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh -p bt-api teams'`
Expected: `lists_all_members_without_filters`, `filters_by_search_q`, `forbids_non_lead` pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/teams.rs api/crates/bt-api/src/app.rs api/Cargo.lock
git commit -m "feat(api): GET /v1/teams/:id/members with server-side filters (owner-gated)"
```

---

## Task 4: Backend — GET /v1/teams/:id/stats + OpenAPI registration

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (TeamStats)
- Modify: `api/crates/bt-api/src/routes/teams.rs` (stats handler)
- Modify: `api/crates/bt-api/src/app.rs` (mount route)
- Modify: `api/crates/bt-api/src/openapi.rs` (register paths + schemas)

- [ ] **Step 1: Add `TeamStats` to `bt-domain`** (`api/crates/bt-domain/src/lib.rs`, append):

```rust
/// The 4 TeamList stat cards.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TeamStats {
    pub this_week: i64,
    pub overdue: i64,
    pub avg_mood: f64,
    pub avg_mood_delta: f64,
    pub notes_quarter: i64,
}
```

- [ ] **Step 2: Write the stats handler** (`api/crates/bt-api/src/routes/teams.rs`, append before the `#[cfg(test)]` block). Import `TeamStats` by extending the existing `use bt_domain::MemberRow;` line to `use bt_domain::{MemberRow, TeamStats};`:

```rust
#[utoipa::path(
    get,
    path = "/v1/teams/{id}/stats",
    params(("id" = uuid::Uuid, Path, description = "Team id")),
    responses(
        (status = 200, description = "Team stats", body = TeamStats),
        (status = 403, description = "Not the team's lead"),
    )
)]
pub async fn team_stats(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(team_id): Path<Uuid>,
) -> AppResult<Json<TeamStats>> {
    require_team_access(&auth, team_id, &state.pool).await?;

    // this_week: members whose next planned meeting is within 7 days.
    let this_week: (i64,) = sqlx::query_as(
        r#"SELECT count(*) FROM team_members tm WHERE tm.team_id = $1 AND EXISTS (
             SELECT 1 FROM meetings m WHERE m.member_id = tm.id AND m.state='planned'
               AND m.date >= now() AND m.date < now() + interval '7 days')"#,
    ).bind(team_id).fetch_one(&state.pool).await?;

    // overdue: members whose latest done meeting is >21d ago, or who have none.
    let overdue: (i64,) = sqlx::query_as(
        r#"SELECT count(*) FROM team_members tm WHERE tm.team_id = $1 AND
             COALESCE((SELECT max(m.date) FROM meetings m
                        WHERE m.member_id = tm.id AND m.state='done'),
                      'epoch') < now() - interval '21 days'"#,
    ).bind(team_id).fetch_one(&state.pool).await?;

    // avg of the latest mood value, and delta vs the first value, across members.
    let (avg_mood, avg_mood_delta): (Option<f64>, Option<f64>) = sqlx::query_as(
        r#"SELECT
             avg(tm.mood_trend[array_length(tm.mood_trend,1)])::float8,
             (avg(tm.mood_trend[array_length(tm.mood_trend,1)])
              - avg(tm.mood_trend[1]))::float8
           FROM team_members tm
           WHERE tm.team_id = $1 AND array_length(tm.mood_trend,1) > 0"#,
    ).bind(team_id).fetch_one(&state.pool).await?;

    // notes_quarter: done meetings team-wide since the start of the current quarter.
    let notes_quarter: (i64,) = sqlx::query_as(
        r#"SELECT count(*) FROM meetings m
           JOIN team_members tm ON tm.id = m.member_id
           WHERE tm.team_id = $1 AND m.state='done'
             AND m.date >= date_trunc('quarter', now())"#,
    ).bind(team_id).fetch_one(&state.pool).await?;

    Ok(Json(TeamStats {
        this_week: this_week.0,
        overdue: overdue.0,
        avg_mood: (avg_mood.unwrap_or(0.0) * 10.0).round() / 10.0,
        avg_mood_delta: (avg_mood_delta.unwrap_or(0.0) * 10.0).round() / 10.0,
        notes_quarter: notes_quarter.0,
    }))
}
```

- [ ] **Step 3: Mount the stats route** (`api/crates/bt-api/src/app.rs`). Add to the `protected` sub-router:

```rust
        .route("/v1/teams/:id/stats", get(routes::teams::team_stats))
```

- [ ] **Step 4: Register teams in OpenAPI** (`api/crates/bt-api/src/openapi.rs`). Update `paths(...)` and `components(schemas(...))`:

```rust
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health,
        crate::routes::auth::login,
        crate::routes::auth::me,
        crate::routes::teams::list_members,
        crate::routes::teams::team_stats,
    ),
    components(schemas(
        bt_domain::Health,
        bt_domain::LoginRequest,
        bt_domain::UserDto,
        bt_domain::LoginResponse,
        bt_domain::MeResponse,
        bt_domain::MemberRow,
        bt_domain::TeamStats,
    )),
    info(title = "BeeTeam API", version = "0.1.0")
)]
pub struct ApiDoc;
```
Update the openapi test to assert the new paths:
```rust
        assert!(json["paths"]["/v1/teams/{id}/members"].is_object());
        assert!(json["paths"]["/v1/teams/{id}/stats"].is_object());
        assert!(json["components"]["schemas"]["TeamStats"].is_object());
```

- [ ] **Step 5: Write a stats test** (`api/crates/bt-api/src/routes/teams.rs`, inside the existing `mod tests`). Reuse `seed_team` (Алиса ok + Борис warn, mood_trend `{6,7,8}` each, no meetings) and assert the shape:

```rust
    async fn get_stats(pool: sqlx::PgPool, token: &str, team_id: uuid::Uuid)
        -> (StatusCode, serde_json::Value)
    {
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(format!("/v1/teams/{team_id}/stats"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn stats_computes_shape(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        let (status, json) = get_stats(pool, &token, team).await;
        assert_eq!(status, StatusCode::OK);
        // No meetings seeded → both members overdue (no done meeting), none this week.
        assert_eq!(json["overdue"], 2);
        assert_eq!(json["this_week"], 0);
        // avg latest mood = 8 (both {6,7,8}); delta = 8 - 6 = 2.
        assert_eq!(json["avg_mood"], 8.0);
        assert_eq!(json["avg_mood_delta"], 2.0);
        assert_eq!(json["notes_quarter"], 0);
    }
```

- [ ] **Step 6: Run the full backend suite** (DB required):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh'`
Expected: all pass — health, auth (incl. me_returns_team_id_for_a_lead), teams (members ×3 + stats), openapi (with new asserts), db migration + seed.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/teams.rs api/crates/bt-api/src/app.rs api/crates/bt-api/src/openapi.rs
git commit -m "feat(api): GET /v1/teams/:id/stats + register teams in OpenAPI"
```

---

## Task 5: Regenerate types + switch client to the /api proxy

**Files:**
- Modify: `web/lib/api/client.ts`
- Modify: `web/lib/api/schema.d.ts` (generated)
- Modify: `web/lib/auth.ts` (SessionUser gains teamId)
- Modify: `.env.example` (remove NEXT_PUBLIC_API_URL)

- [ ] **Step 1: Re-seed the dev DB (Task 1 changed seed data) + regenerate types.**

Re-seed (idempotent seed won't overwrite existing rows):
```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres minio >/dev/null && docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE;"'
```
Start the API (it re-seeds on boot) and regenerate:
```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && lsof -ti :8080 | xargs -r kill 2>/dev/null; set -a && . ./.env && set +a && cd api && (cargo run -p bt-api &)'
```
Wait for it: `bash -lc 'for i in $(seq 1 40); do curl -s http://localhost:8080/v1/health >/dev/null && echo UP && break; sleep 2; done'`
Generate: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api'`
Verify: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && grep -c "/v1/teams/{id}/members\|/v1/teams/{id}/stats\|MemberRow\|TeamStats" lib/api/schema.d.ts'` → ≥ 4.
Stop the API: `bash -lc 'lsof -ti :8080 | xargs -r kill 2>/dev/null; echo stopped'`

- [ ] **Step 2: Switch the client baseUrl to the proxy** (`web/lib/api/client.ts`) — replace the whole file:

```ts
import createClient from "openapi-fetch";
import type { paths } from "./schema";

// Browser calls go through the Next proxy (/api/v1/*), which maps the httpOnly
// session cookie to a Bearer header. No direct browser→axum calls.
export const api = createClient<paths>({ baseUrl: "/api" });
```

- [ ] **Step 3: Remove the orphaned env var** (`.env.example`). Delete the two lines:
```
# Web → API base URL
NEXT_PUBLIC_API_URL=http://localhost:8080
```
(Leave `API_INTERNAL_URL` — the server-side proxy still uses it.)

- [ ] **Step 4: Add `teamId` to the session helper** (`web/lib/auth.ts`). Update the type + the cast:

```ts
export type SessionUser = { id: string; name: string; email: string; role: string; teamId: string | null };
```
And map the snake_case `team_id` from `/auth/me` to camelCase `teamId`. Replace the success branch:

```ts
    if (!res.ok) return null;
    const me = (await res.json()) as { id: string; name: string; email: string; role: string; team_id: string | null };
    return { id: me.id, name: me.name, email: me.email, role: me.role, teamId: me.team_id };
```

- [ ] **Step 5: Typecheck** (Sidebar consumes `SessionUser`; the added field is optional to it):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/api/client.ts web/lib/api/schema.d.ts web/lib/auth.ts .env.example
git commit -m "feat(web): route browser fetches through /api proxy; teamId in session; team types"
```

---

## Task 6: Frontend — query hooks (useTeamMembers, useTeamStats)

**Files:**
- Create: `web/lib/query/teams.ts`

- [ ] **Step 1: Write the hooks + Filters type** (`web/lib/query/teams.ts`):

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export type Filters = {
  q?: string;
  role?: string;
  tenure?: string;
  mood?: string;
  since?: string;
  tags?: string[];
};

function toQuery(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.role) out.role = f.role;
  if (f.tenure) out.tenure = f.tenure;
  if (f.mood) out.mood = f.mood;
  if (f.since) out.since = f.since;
  if (f.tags && f.tags.length) out.tags = f.tags.join(",");
  return out;
}

export function useTeamMembers(teamId: string | null, filters: Filters) {
  return useQuery({
    enabled: Boolean(teamId),
    queryKey: ["members", teamId, filters],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/members", {
        params: { path: { id: teamId! }, query: toQuery(filters) },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useTeamStats(teamId: string | null) {
  return useQuery({
    enabled: Boolean(teamId),
    queryKey: ["stats", teamId],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/stats", {
        params: { path: { id: teamId! } },
      });
      if (error) throw error;
      return data;
    },
  });
}
```

- [ ] **Step 2: Typecheck** (confirms the generated types accept these calls):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean. If `openapi-fetch` rejects the `query` shape, it's because the generated param type is stricter — in that case pass `query: toQuery(filters) as never` is NOT acceptable; instead confirm the generated `paths["/v1/teams/{id}/members"]["get"]["parameters"]["query"]` is `Record<string,string>`-compatible (it will be, since all our query params are optional strings). Report if it isn't.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/teams.ts
git commit -m "feat(web): TanStack Query hooks for team members + stats"
```

---

## Task 7: Frontend — Pill, StatCard, MoodTrendBars, SegControl composites

**Files:**
- Create: `web/components/Pill.tsx`, `web/components/StatCard.tsx`, `web/components/MoodTrendBars.tsx`, `web/components/SegControl.tsx`
- Create: `web/components/__tests__/Pill.test.tsx`, `StatCard.test.tsx`, `MoodTrendBars.test.tsx`, `SegControl.test.tsx`

- [ ] **Step 1: Pill** (`web/components/Pill.tsx`):

```tsx
import { cn } from "@/lib/utils";

type Variant = "default" | "ok" | "warn" | "miss" | "info" | "accent";

const STYLES: Record<Variant, string> = {
  default: "border-line bg-bg-elev text-ink-2",
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
  miss: "border-miss/30 bg-miss-soft text-miss",
  info: "border-info/30 bg-info-soft text-info",
  accent: "border-brand/30 bg-brand-soft text-brand-text",
};

export function Pill({
  variant = "default",
  dot = false,
  children,
  className,
}: {
  variant?: Variant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-pill={variant}
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium",
        STYLES[variant],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Pill test** (`web/components/__tests__/Pill.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Pill } from "../Pill";

describe("Pill", () => {
  it("renders children and exposes the variant", () => {
    render(<Pill variant="ok" dot>В графике</Pill>);
    const el = screen.getByText("В графике").closest("[data-pill]")!;
    expect(el).toHaveAttribute("data-pill", "ok");
  });
});
```

- [ ] **Step 3: StatCard** (`web/components/StatCard.tsx`):

```tsx
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  accentDot = false,
  danger = false,
  suffix,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentDot?: boolean;
  danger?: boolean;
  suffix?: string;
}) {
  return (
    <div className="relative rounded-lg border border-line bg-bg-elev p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className={cn("mt-1 text-[26px] font-bold tabular", danger ? "text-miss" : "text-ink")}>
        {value}
        {suffix && <span className="ml-1 text-[14px] text-ink-3">{suffix}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
      {accentDot && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand" />}
    </div>
  );
}
```

- [ ] **Step 4: StatCard test** (`web/components/__tests__/StatCard.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "../StatCard";

describe("StatCard", () => {
  it("renders value + suffix", () => {
    render(<StatCard label="Среднее настроение" value={7.8} suffix="/10" />);
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("applies danger color to the value", () => {
    render(<StatCard label="Просрочены" value={3} danger />);
    expect(screen.getByText("3")).toHaveClass("text-miss");
  });
});
```

- [ ] **Step 5: MoodTrendBars** (`web/components/MoodTrendBars.tsx`). Height 4–18px scaled by value (1..10), opacity rising left→right, color by value (≥7 brand, ≥5 warn, else miss):

```tsx
export function MoodTrendBars({ trend }: { trend: number[] }) {
  return (
    <span data-mood-bars className="inline-flex items-end gap-[3px]" style={{ height: 18 }}>
      {trend.map((v, i) => (
        <i
          key={i}
          data-bar
          style={{
            display: "block",
            width: 4,
            borderRadius: 2,
            height: `${4 + v * 1.4}px`,
            opacity: 0.35 + (i / Math.max(trend.length - 1, 1)) * 0.65,
            background:
              v >= 7 ? "var(--brand)" : v >= 5 ? "var(--warn)" : "var(--miss)",
          }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 6: MoodTrendBars test** (`web/components/__tests__/MoodTrendBars.test.tsx`):

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MoodTrendBars } from "../MoodTrendBars";

describe("MoodTrendBars", () => {
  it("renders one bar per value with value-scaled height", () => {
    const { container } = render(<MoodTrendBars trend={[5, 8]} />);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars.length).toBe(2);
    expect((bars[0] as HTMLElement).style.height).toBe("11px"); // 4 + 5*1.4
    expect((bars[1] as HTMLElement).style.height).toBe(`${4 + 8 * 1.4}px`); // 15.2px
  });

  it("colors high values with the brand token", () => {
    const { container } = render(<MoodTrendBars trend={[9]} />);
    const bar = container.querySelector("[data-bar]") as HTMLElement;
    expect(bar.style.background).toContain("--brand");
  });
});
```

- [ ] **Step 7: SegControl** (`web/components/SegControl.tsx`):

```tsx
import { cn } from "@/lib/utils";

export type SegOption = { value: string; label: string };

export function SegControl({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-bg-elev p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-seg={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-[12.5px] font-medium",
            value === o.value ? "bg-bg-tint text-ink shadow-1" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: SegControl test** (`web/components/__tests__/SegControl.test.tsx`):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SegControl } from "../SegControl";

const opts = [{ value: "all", label: "Все" }, { value: "overdue", label: "Просрочены" }];

describe("SegControl", () => {
  it("marks the active option with aria-pressed", () => {
    render(<SegControl options={opts} value="all" onChange={() => {}} />);
    expect(screen.getByText("Все")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Просрочены")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChange with the option value", () => {
    const onChange = vi.fn();
    render(<SegControl options={opts} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText("Просрочены"));
    expect(onChange).toHaveBeenCalledWith("overdue");
  });
});
```

- [ ] **Step 9: Run the composite tests:**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test Pill StatCard MoodTrendBars SegControl'`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Pill.tsx web/components/StatCard.tsx web/components/MoodTrendBars.tsx web/components/SegControl.tsx web/components/__tests__/Pill.test.tsx web/components/__tests__/StatCard.test.tsx web/components/__tests__/MoodTrendBars.test.tsx web/components/__tests__/SegControl.test.tsx
git commit -m "feat(web): Pill, StatCard, MoodTrendBars, SegControl composites"
```

---

## Task 8: Frontend — FilterPopover

**Files:**
- Create: `web/components/FilterPopover.tsx`
- Create: `web/components/__tests__/FilterPopover.test.tsx`

- [ ] **Step 1: FilterPopover** (`web/components/FilterPopover.tsx`). Self-contained: holds draft state, calls `onApply` with the chosen filter values; `activeCount` is exported for the trigger badge:

```tsx
"use client";
import { useState } from "react";
import { SegControl } from "./SegControl";
import type { Filters } from "@/lib/query/teams";

const ROLES = ["Frontend", "Backend", "QA", "Design", "DevOps", "PM"];
const TAGS = ["Mentor", "Promotion", "Lead Track", "Onboarding", "Burnout risk", "PIP", "Performance"];

export function activeFilterCount(f: Filters): number {
  return (f.role ? 1 : 0) + (f.tenure ? 1 : 0) + (f.mood ? 1 : 0) +
    (f.since ? 1 : 0) + (f.tags?.length ?? 0);
}

export function FilterPopover({
  value,
  onApply,
  onClose,
}: {
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTag = (t: string) =>
    set({ tags: draft.tags?.includes(t) ? draft.tags.filter((x) => x !== t) : [...(draft.tags ?? []), t] });

  return (
    <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-lg border border-line bg-bg-elev p-4 shadow-pop">
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Роль</div>
        <select
          className="h-9 w-full rounded-md border border-line bg-bg-elev px-2 text-[13px]"
          value={draft.role ?? ""}
          onChange={(e) => set({ role: e.target.value || undefined })}
        >
          <option value="">Все</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Стаж</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "new", label: "<1 года" },
            { value: "mid", label: "1–3" }, { value: "sen", label: "3+" },
          ]}
          value={draft.tenure ?? ""}
          onChange={(v) => set({ tenure: v || undefined })}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Тренд настроения</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "up", label: "↑" },
            { value: "flat", label: "→" }, { value: "down", label: "↓" },
          ]}
          value={draft.mood ?? ""}
          onChange={(v) => set({ mood: v || undefined })}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Теги</div>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              data-tag={t}
              aria-pressed={draft.tags?.includes(t) ?? false}
              onClick={() => toggleTag(t)}
              className={
                "rounded-full border px-2 py-0.5 text-[11.5px] " +
                (draft.tags?.includes(t)
                  ? "border-brand bg-brand-soft text-brand-text"
                  : "border-line text-ink-3 hover:text-ink-2")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Последняя 1-2-1</div>
        <SegControl
          options={[
            { value: "", label: "Все" }, { value: "lt1w", label: "<1 нед" },
            { value: "lt2w", label: "<2 нед" }, { value: "gt4w", label: ">4 нед" },
          ]}
          value={draft.since ?? ""}
          onChange={(v) => set({ since: v || undefined })}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-[13px] text-ink-3 hover:bg-bg-tint"
          onClick={() => { const cleared = {}; setDraft(cleared); onApply(cleared); onClose(); }}
        >
          Сбросить
        </button>
        <button
          type="button"
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-[#1A1100]"
          onClick={() => { onApply(draft); onClose(); }}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: FilterPopover test** (`web/components/__tests__/FilterPopover.test.tsx`):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterPopover, activeFilterCount } from "../FilterPopover";

describe("activeFilterCount", () => {
  it("counts set filters and each tag", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ role: "Backend", tags: ["Mentor", "PIP"] })).toBe(3);
  });
});

describe("FilterPopover", () => {
  it("applies the chosen role and closes", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<FilterPopover value={{}} onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue("Все"), { target: { value: "Backend" } });
    fireEvent.click(screen.getByText("Применить"));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ role: "Backend" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reset applies empty filters", () => {
    const onApply = vi.fn();
    render(<FilterPopover value={{ role: "Backend" }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Сбросить"));
    expect(onApply).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 3: Run the tests:**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test FilterPopover'`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/FilterPopover.tsx web/components/__tests__/FilterPopover.test.tsx
git commit -m "feat(web): FilterPopover with role/tenure/mood/tags/since + active count"
```

---

## Task 9: Frontend — TeamTable + TeamRow

**Files:**
- Create: `web/components/TeamTable.tsx`

- [ ] **Step 1: TeamTable + TeamRow** (`web/components/TeamTable.tsx`). Consumes the generated `MemberRow` shape; rows navigate via `next/link`. Date formatting + relative "ago" are local helpers:

```tsx
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "./Avatar";
import { Pill } from "./Pill";
import { MoodTrendBars } from "./MoodTrendBars";
import type { components } from "@/lib/api/schema";

type Member = components["schemas"]["MemberRow"];

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "не назначено";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "сегодня";
  if (days > 0) return `${days} дн. назад`;
  return `через ${-days} дн.`;
}

function statusPill(status: string) {
  if (status === "ok") return <Pill variant="ok" dot>В графике</Pill>;
  if (status === "warn") return <Pill variant="warn" dot>Внимание</Pill>;
  return <Pill variant="miss" dot>Просрочена</Pill>;
}

export function TeamTable({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
        Никого не нашлось — попробуйте изменить фильтры.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg-elev">
      <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] gap-3 border-b border-line bg-bg-tint px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <div>Сотрудник</div><div>Последняя 1-2-1</div><div>Следующая встреча</div>
        <div>Настроение, тренд</div><div>Статус</div><div />
      </div>
      {members.map((m) => (
        <Link
          key={m.id}
          href={`/profile/${m.id}`}
          className="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] items-center gap-3 border-b border-line-2 px-4 py-3 last:border-b-0 hover:bg-bg-tint"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={m.name} hue={m.hue} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{m.name}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <span className="truncate">{m.role}</span>
                {m.tags.map((t) => <Pill key={t} variant="accent" className="h-[18px] text-[10.5px]">{t}</Pill>)}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[13px] tabular">{fmtDate(m.last_meet)}</div>
            <div className="text-[11.5px] text-ink-3">{ago(m.last_meet)}</div>
          </div>
          <div>
            <div className="text-[13px] tabular">{fmtDate(m.next_meet)}</div>
            <div className="text-[11.5px] text-ink-3">{ago(m.next_meet)}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <MoodTrendBars trend={m.mood_trend} />
            <span className="tabular text-[13px] font-semibold">
              {m.mood_trend.length ? m.mood_trend[m.mood_trend.length - 1].toFixed(1) : "—"}
            </span>
          </div>
          <div>{statusPill(m.status)}</div>
          <button
            type="button"
            aria-label="Действия"
            onClick={(e) => { e.preventDefault(); }}
            className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-sunken"
          >
            <MoreHorizontal size={15} />
          </button>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck:**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit'`
Expected: clean (the `components["schemas"]["MemberRow"]` type resolves from the regenerated schema).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/TeamTable.tsx
git commit -m "feat(web): TeamTable + TeamRow (6 columns, mood bars, status pills)"
```

---

## Task 10: Frontend — TeamList page + placeholder profile

**Files:**
- Create: `web/app/(app)/TeamListClient.tsx`
- Modify: `web/app/(app)/page.tsx`
- Create: `web/app/(app)/profile/[id]/page.tsx`

- [ ] **Step 1: Placeholder profile** (`web/app/(app)/profile/[id]/page.tsx`):

```tsx
import { Topbar } from "@/components/Topbar";

export default function ProfilePlaceholder() {
  return (
    <>
      <Topbar title="Профиль сотрудника" />
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-ink-3">
          <p className="text-[15px] font-medium text-ink-2">Профиль появится в следующем срезе</p>
          <p className="mt-1 text-[13px]">История 1-2-1, цели и файлы будут здесь.</p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: TeamListClient** (`web/app/(app)/TeamListClient.tsx`) — the client component holding filter state + queries:

```tsx
"use client";
import { useState } from "react";
import { Plus, Download, Search, Filter } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { SegControl } from "@/components/SegControl";
import { TeamTable } from "@/components/TeamTable";
import { FilterPopover, activeFilterCount } from "@/components/FilterPopover";
import { useTeamMembers, useTeamStats, type Filters } from "@/lib/query/teams";

const TABS = [
  { value: "all", label: "Все" },
  { value: "this-week", label: "На этой неделе" },
  { value: "overdue", label: "Просрочены" },
  { value: "attention", label: "Требуют внимания" },
];

export function TeamListClient({ teamId }: { teamId: string | null }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [popoverFilters, setPopoverFilters] = useState<Filters>({});
  const [showFilter, setShowFilter] = useState(false);

  // The segment tab maps to a server filter where it cleanly can (overdue→since gt4w);
  // "attention"/"this-week" are derived client-side from the returned rows + stats below.
  const filters: Filters = {
    ...popoverFilters,
    q: q || undefined,
    since: tab === "overdue" ? "gt4w" : popoverFilters.since,
  };

  const stats = useTeamStats(teamId);
  const members = useTeamMembers(teamId, filters);

  const rows = (members.data ?? []).filter((m) => {
    if (tab === "attention") return m.status !== "ok";
    if (tab === "this-week") return Boolean(m.next_meet) &&
      (new Date(m.next_meet!).getTime() - Date.now()) <= 7 * 86_400_000 &&
      new Date(m.next_meet!).getTime() >= Date.now();
    return true;
  });

  const count = activeFilterCount(popoverFilters);

  return (
    <>
      <Topbar title="Моя команда" />
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">Моя команда</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {members.data?.length ?? "…"} человек · Платформенный отдел · Q2 2026
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
              <Download size={14} /> Экспорт в Excel
            </button>
            <button className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]" title="Скоро">
              <Plus size={14} /> Сотрудник
            </button>
            <button className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-[#1A1100]" title="Скоро">
              <Plus size={14} /> Новая 1-2-1
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-3">
          <StatCard label="На этой неделе" value={stats.data?.this_week ?? "…"} sub="запланировано встреч" accentDot />
          <StatCard label="Просрочены" value={stats.data?.overdue ?? "…"} danger={(stats.data?.overdue ?? 0) > 0}
            sub={(stats.data?.overdue ?? 0) > 0 ? "давно не виделись" : "все встречи в графике"} />
          <StatCard label="Среднее настроение" value={stats.data?.avg_mood ?? "…"} suffix="/10"
            sub={stats.data ? `${stats.data.avg_mood_delta >= 0 ? "↑ +" : "↓ "}${stats.data.avg_mood_delta} за месяц` : undefined} />
          <StatCard label="Заметок за квартал" value={stats.data?.notes_quarter ?? "…"} sub="по всей команде" />
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line bg-bg-elev px-3">
            <Search size={15} className="text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по имени или роли"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>
          <SegControl options={TABS} value={tab} onChange={setTab} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg-elev px-3 text-[13px]"
            >
              <Filter size={13} /> Фильтр
              {count > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-[#1A1100]">{count}</span>}
            </button>
            {showFilter && (
              <FilterPopover value={popoverFilters} onApply={setPopoverFilters} onClose={() => setShowFilter(false)} />
            )}
          </div>
        </div>

        {members.isError ? (
          <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
            Не удалось загрузить команду.{" "}
            <button className="underline" onClick={() => members.refetch()}>Повторить</button>
          </div>
        ) : members.isLoading ? (
          <div className="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">Загрузка…</div>
        ) : (
          <TeamTable members={rows} />
        )}

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-bg-tint px-4 py-3.5 text-[13px] text-ink-3">
          <Plus size={14} />
          <span>Добавить сотрудника в команду — он получит приглашение по email</span>
          <button className="ml-auto rounded-md border border-line bg-bg-elev px-3 py-1.5 text-[13px]" title="Скоро">Добавить</button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2b: Replace the page** (`web/app/(app)/page.tsx`) — a server component that reads the session for `teamId` and hands it to the client:

```tsx
import { getSessionUser } from "@/lib/auth";
import { TeamListClient } from "./TeamListClient";

export default async function TeamPage() {
  const user = await getSessionUser(); // layout already guaranteed non-null
  return <TeamListClient teamId={user?.teamId ?? null} />;
}
```

- [ ] **Step 3: Typecheck + build:**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm build 2>&1 | tail -8'`
Expected: tsc clean; build succeeds with routes `/`, `/login`, `/profile/[id]`.

- [ ] **Step 4: Run the full Vitest suite** (nothing should have broken):

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test 2>&1 | tail -5'`
Expected: all green (tokens + Auth composites + StatCard/Pill/MoodTrendBars/SegControl/FilterPopover).

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add "web/app/(app)/TeamListClient.tsx" "web/app/(app)/page.tsx" "web/app/(app)/profile"
git commit -m "feat(web): real TeamList page + placeholder profile route"
```

---

## Task 11: End-to-end TeamList test (Playwright)

**Files:**
- Create: `web/e2e/teamlist.spec.ts`

- [ ] **Step 1: Write the e2e test** (`web/e2e/teamlist.spec.ts`). Reuses the login flow; uses the exact-label password pattern learned in the Auth slice:

```ts
import { test, expect } from "@playwright/test";

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill("e.glebov@beeteam.io");
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

test("team list shows stats and members", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Моя команда" })).toBeVisible();
  await expect(page.getByText("На этой неделе")).toBeVisible();
  await expect(page.getByText("Среднее настроение")).toBeVisible();
  // 8 seeded members → 8 rows linking to profiles.
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(8, { timeout: 10_000 });
});

test("search narrows the table", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder("Поиск по имени или роли").fill("Анна");
  await expect(page.locator('a[href^="/profile/"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByText("Анна Лебедева")).toBeVisible();
});

test("row navigates to the profile placeholder", async ({ page }) => {
  await login(page);
  await page.locator('a[href^="/profile/"]').first().click();
  await expect(page).toHaveURL(/\/profile\//);
  await expect(page.getByText("Профиль появится в следующем срезе")).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e end-to-end.** Re-seed the dev DB first (so all 8 have meetings), bring up infra + API, run Playwright. Ports must be free.

```bash
bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres minio >/dev/null && docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE;" && lsof -ti :8080 | xargs -r kill 2>/dev/null; lsof -ti :3000 | xargs -r kill 2>/dev/null; set -a && . ./.env && set +a && cd api && (cargo run -p bt-api &)'
```
Wait for API: `bash -lc 'for i in $(seq 1 40); do curl -s http://localhost:8080/v1/health >/dev/null && echo UP && break; sleep 2; done'`
Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm exec playwright test teamlist --reporter=line'`
Expected: 3 passed.
Stop: `bash -lc 'lsof -ti :8080 | xargs -r kill 2>/dev/null; lsof -ti :3000 | xargs -r kill 2>/dev/null; echo stopped'`

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/teamlist.spec.ts
git commit -m "test(web): e2e TeamList — stats + members + search + row navigation"
```

---

## Task 12: Full-stack verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Backend suite (isolated test DB)**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && docker compose up -d postgres-test >/dev/null && ./api/scripts/test.sh'`
Expected: all groups pass (health, auth incl. team_id, teams members ×3 + stats, openapi with new asserts, db migration + seed with corrected counts).

- [ ] **Step 2: Frontend unit tests + typecheck + build**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam/web && pnpm test && pnpm exec tsc --noEmit && pnpm build 2>&1 | tail -4'`
Expected: Vitest all green; tsc clean; build OK.

- [ ] **Step 3: Confirm clean tree**

Run: `bash -lc 'cd /Users/lebedev.v/projects/beeteam && git status --porcelain'`
Expected: empty.

This slice is complete when Steps 1–3 are green. Then proceed to `finishing-a-development-branch`.

---

## Done criteria

- `GET /v1/teams/:id/members` returns the team with computed `last_meet`/`next_meet`, applies server-side `q`/`role`/`tenure`/`mood`/`since`/`tags`, and 403s a non-lead.
- `GET /v1/teams/:id/stats` returns this_week / overdue / avg_mood / avg_mood_delta / notes_quarter, 403s a non-lead.
- `/v1/auth/me` includes the lead's `team_id`; `AppError::Forbidden` → 403.
- Seed re-dated relative to now() with `joined_date`; all 8 members have a last + (mostly) next meeting.
- Browser data fetching goes through `/api` (proxy); `NEXT_PUBLIC_API_URL` removed; `schema.d.ts` regenerated + committed.
- `(app)/page.tsx` renders the real TeamList (4 stat cards, search + tabs + FilterPopover, 6-col table) against live data; rows navigate to `/profile/:id` (placeholder).
- Vitest covers StatCard / Pill / MoodTrendBars / SegControl / FilterPopover; Playwright proves stats+members+search+navigation; a non-lead member request 403s.

The next slice (`...-beeteam-profile.md`) replaces the `/profile/[id]` placeholder with the real EmployeeProfile (header + History / Goals / Files tabs).
```
