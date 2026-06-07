# BeeTeam Grades Foundation Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only grade framework — disciplines, IC1–IC7 levels, a normalized block×level competency matrix, and salary bands — surfaced on a `/grades` screen (Уровни / Матрица / Вилки).

**Architecture:** New normalized tables (`disciplines`, `grade_levels`, `grade_blocks`, `matrix_cells`) seeded from the prototype's `grades-data.js`, scoped per workspace. One combined `GET /v1/grades/framework` (any authenticated lead, workspace-resolved) returns the nested framework. Frontend: a `GradesClient` with discipline tabs + Уровни/Матрица/Вилки sub-tabs (read-only; matrix cells open a detail Modal); the Sidebar «Грейды» entry is enabled.

**Tech Stack:** Rust (axum, sqlx, utoipa), Postgres; Next.js 14, TypeScript, TanStack Query, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-07-beeteam-grades-foundation-design.md`

---

## Conventions (read once)

- Backend: migrations in `api/crates/bt-db/migrations/` (latest is `0003_profile`; create `0004_grades.sql`). Seed in `api/crates/bt-db/src/seed.rs`. DTOs in `bt-domain/src/lib.rs`. Handlers in `api/crates/bt-api/src/routes/`; new `routes/grades.rs`. Router `app.rs`; OpenAPI `openapi.rs`. Errors `AppError`/`AppResult`. Auth extractor `AuthUser { id, role }` (id = the user's uuid).
- This endpoint is **workspace-scoped, not team-scoped**: resolve `workspace_id` via `SELECT workspace_id FROM users WHERE id = $1` (auth.id). No `require_team_access`/`require_member_access` (the framework is company-wide; any authenticated user may read).
- sqlx: runtime `query_as::<_,(tuple)>`; for "WHERE x = ANY($1)" bind a `Vec<Uuid>` as `&[Uuid]` → `$1::uuid[]`. Band columns are `DOUBLE PRECISION` → bind/read as `f64`.
- Backend tests: `#[sqlx::test(migrations = "../bt-db/migrations")]`; seed via `seed_demo` OR a local seed; drive `app(pool)` via `oneshot`. Run `api/scripts/test.sh -p bt-api` / `-p bt-db`.
- Frontend: route `web/app/(app)/grades/page.tsx`; hook `web/lib/query/grades.ts`; components `web/components/grades/`; openapi-fetch `api.GET`; types via `pnpm gen:api` (API on :8080). Reuse `Pill`, `SegControl`, `Modal` (`@/components/Modal`), `cn`. Tokens: `bg-brand`/`brand-text` (NEVER `accent`), `bg-bg-elev`/`bg-bg-tint`/`bg-bg-sunken`, `border-line`/`border-line-2`, `text-ink/ink-2/ink-3/ink-4`, `tabular`. Sidebar route-aware pattern is from slice 8 (`usePathname` + `next/link`).
- Dev DB on host port 5442; re-seed after seed changes (`TRUNCATE workspaces CASCADE` + restart API). API on :8080 (restart before gen:api).
- **Data source of truth:** `design_handoff_beeteam/grades-data.js` — `levels` (7), `bands`, `BLOCK_IDS = ['stack','core','arch','infra','ai','impact']`, shared `aiCells`/`impactCells`, and `disciplines` (backend/frontend/mobile/qa/devops) each with `blockNames` + `matrix` (block→[7 texts]). The seed ports this. Addon tracks (`addons`) are NOT seeded (deferred).

---

## File Structure

**Backend:**
- Create `api/crates/bt-db/migrations/0004_grades.sql`.
- Modify `api/crates/bt-db/src/seed.rs` — seed levels/disciplines/blocks/cells.
- Modify `api/crates/bt-domain/src/lib.rs` — `GradeLevel`, `MatrixCell`, `GradeBlock`, `Discipline`, `GradesFramework`.
- Create `api/crates/bt-api/src/routes/grades.rs` — `get_framework`.
- Modify `routes/mod.rs`, `app.rs`, `openapi.rs`.

**Frontend:**
- Create `web/lib/query/grades.ts` — `useGradesFramework`.
- Create `web/components/grades/GradeLevels.tsx`, `GradeMatrix.tsx`, `GradeBands.tsx`, `GradesClient.tsx`.
- Create `web/app/(app)/grades/page.tsx`.
- Modify `web/components/Sidebar.tsx` (enable «Грейды»).
- Tests: `web/components/__tests__/GradeViews.test.tsx`, `web/e2e/grades.spec.ts`.

---

# Phase A — Backend

### Task 1: Migration `0004_grades` + seed

**Files:**
- Create: `api/crates/bt-db/migrations/0004_grades.sql`
- Modify: `api/crates/bt-db/src/seed.rs`

- [ ] **Step 1: Create the migration**

`api/crates/bt-db/migrations/0004_grades.sql`:
```sql
-- Grade framework (read-only foundation): disciplines, IC1–IC7 levels, block×level matrix, bands.
CREATE TABLE disciplines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  ord          INT NOT NULL DEFAULT 0
);
CREATE TABLE grade_levels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ord          INT NOT NULL,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  exp          TEXT NOT NULL DEFAULT '',
  autonomy     TEXT NOT NULL DEFAULT '',
  scope        TEXT NOT NULL DEFAULT '',
  mgr          BOOLEAN NOT NULL DEFAULT false,
  band_low     DOUBLE PRECISION NOT NULL,
  band_mid     DOUBLE PRECISION NOT NULL,
  band_high    DOUBLE PRECISION NOT NULL
);
CREATE TABLE grade_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  ord           INT NOT NULL DEFAULT 0
);
CREATE TABLE matrix_cells (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id  UUID NOT NULL REFERENCES grade_blocks(id) ON DELETE CASCADE,
  level_ord INT NOT NULL,
  text      TEXT,
  required  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (block_id, level_ord)
);
CREATE INDEX idx_disciplines_ws ON disciplines(workspace_id);
CREATE INDEX idx_grade_levels_ws ON grade_levels(workspace_id);
CREATE INDEX idx_grade_blocks_disc ON grade_blocks(discipline_id);
CREATE INDEX idx_matrix_cells_block ON matrix_cells(block_id);
```

- [ ] **Step 2: Verify the migration applies**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db seed_is_idempotent_and_loads_team`
Expected: PASS (migrations 0001–0004 apply on a fresh test DB).

- [ ] **Step 3: Add the seed block**

In `seed.rs`'s `seed_demo`, before `tx.commit()`, add the grades seed. Levels + bands first:

```rust
    // ── Grade framework (read-only foundation) ──
    // (code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high)
    let levels: [(&str, &str, &str, &str, &str, bool, f64, f64, f64); 7] = [
        ("IC1", "Trainee", "0–6 мес", "Работает под плотным менторством", "Учебные задачи, pet-проекты", false, 0.78, 1.0, 1.25),
        ("IC2", "Junior", "6 мес–1.5 г", "Делает задачи по чёткому ТЗ с ревью", "Отдельные тикеты", false, 0.73, 1.0, 1.27),
        ("IC3", "Middle", "1.5–3 года", "Самостоятельно решает типовые задачи", "Фича целиком", false, 0.78, 1.0, 1.22),
        ("IC4", "Middle+", "3–5 лет", "Автономен в рамках сервиса", "Несколько связанных фич, модуль", false, 0.85, 1.0, 1.15),
        ("IC5", "Senior", "5+ лет", "Принимает архитектурные решения в своей зоне", "Сервис или подсистема", true, 0.86, 1.0, 1.14),
        ("IC6", "Staff / Tech Lead", "7+ лет", "Определяет технические стандарты команды", "Несколько сервисов, кросс-команды", true, 0.85, 1.0, 1.15),
        ("IC7", "Principal", "10+ лет", "Задаёт технологическое направление", "Весь домен, архитектура компании", true, 0.87, 1.0, 1.13),
    ];
    for (i, l) in levels.iter().enumerate() {
        sqlx::query(
            "INSERT INTO grade_levels (workspace_id, ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(ws_id).bind((i + 1) as i32)
        .bind(l.0).bind(l.1).bind(l.2).bind(l.3).bind(l.4).bind(l.5).bind(l.6).bind(l.7).bind(l.8)
        .execute(&mut *tx).await?;
    }

    // Shared block cells (identical across disciplines).
    let ai_cells: [&str; 7] = [
        "Использует AI-ассистента для объяснения кода и поиска ошибок.",
        "Применяет AI в ежедневной работе. Критически проверяет результат.",
        "Prompt engineering с контекстом и ролью. Выстроенный AI-workflow.",
        "Project instructions, multi-step workflows. Промпты с примерами и constraints.",
        "Настраивает AI-workflow для команды: shared prompts, MCP, CLI.",
        "AI-стратегия команды: delegation, security, multi-agent подходы.",
        "Определяет AI-стратегию компании, governance и стандарты.",
    ];
    let impact_cells: [&str; 7] = [
        "Учится у команды, задаёт вопросы. Влияние в пределах своих задач.",
        "Помогает на стендапах, аккуратно ведёт тикеты.",
        "Помогает джунам, участвует в обсуждениях. Влияет на свою фичу.",
        "Менторит 1–2 человек, выступает на внутренних обсуждениях.",
        "Менторская программа, доклады. Влияет на несколько команд и найм.",
        "Определяет инженерную культуру, развивает лидов.",
        "Формирует tech-бренд компании, влияет на стратегию найма.",
    ];

    // One discipline = (key, label, icon, desc, [(block_key, block_name, [7 cells]); 6]).
    // Block order: stack, core, arch, infra, ai, impact. ai/impact reuse the shared arrays.
    // Backend is given in full here; PORT frontend/mobile/qa/devops the SAME WAY from
    // design_handoff_beeteam/grades-data.js (their blockNames + matrix). A cell whose text is
    // exactly "Не требуется." becomes required=false with NULL text.
    type Disc = (&'static str, &'static str, &'static str, &'static str, [(&'static str, &'static str, [&'static str; 7]); 6]);
    let backend: Disc = (
        "backend", "Backend", "fields", "Серверная разработка, API, данные, нагрузка.",
        [
            ("stack", "Серверный стек", [
                "Знает синтаксис языка, ООП, MVC. Пишет простой CRUD под руководством.",
                "Уверенно пишет на проде. ORM, миграции, валидация, очереди. Покрывает тестами.",
                "Самостоятельно проектирует REST API. Service container, events, middleware. Рефакторит legacy.",
                "Оптимизирует performance (N+1, кеш-слой). Сложные запросы и query builders. Профилирование.",
                "Архитектурные паттерны (DDD, hexagonal, CQRS). Проектирует сложные доменные модели.",
                "Определяет стандарты кодирования команды. Сложные code review. Пишет RFC.",
                "Задаёт технологическую стратегию платформы. Решения уровня всего домена.",
            ]),
            ("core", "Базы данных и хранилища", [
                "Базовый SQL (SELECT/JOIN). Понимает, что такое таблица и индекс.",
                "Пишет рабочие запросы, делает миграции. Транзакции, базовые constraints.",
                "Проектирует схемы БД. Осознанно использует индексы и кеш.",
                "Оптимизирует через EXPLAIN. Партиционирование, шардирование. Очереди.",
                "Схемы для high-load. Выбор СУБД. Репликация.",
                "Стратегия data layer: consistency, миграции без downtime, governance.",
                "Дата-стратегия бизнеса: data lake, compliance, долгосрочная архитектура.",
            ]),
            ("arch", "Архитектура и системный дизайн", [
                "Не требуется.",
                "Понимает REST, HTTP-методы, статус-коды, клиент-серверную модель.",
                "Проектирует API для своей фичи. SOLID, базовые паттерны.",
                "Декомпозирует фичу на сервисы. Trade-offs. Distributed tracing.",
                "Системы из нескольких сервисов. Event-driven, CQRS, Saga, API Gateway.",
                "Архитектор на уровне продукта: распределённые системы под бизнес.",
                "Стратегия архитектуры всей компании, участие в C-level решениях.",
            ]),
            ("infra", "Инфраструктура и DevOps", [
                "Базовые Linux-команды. Запуск через docker-compose.",
                "Docker на уровне пользователя. Переменные окружения, .env.",
                "Пишет Dockerfile. Понимает CI/CD. Базовый мониторинг.",
                "CI под свой сервис. Ansible-плейбуки. Blue-green deploy.",
                "Infrastructure as Code. Canary deploy. On-call, алертинг.",
                "DevOps-культура команды: observability, SLO/SLI, incident management.",
                "Инфраструктурная стратегия компании, выбор облака, cost.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    // PORT these four from grades-data.js (same Disc shape; blockNames + matrix per discipline;
    // ai/impact blocks reuse ai_cells/impact_cells). Block names per discipline come from each
    // discipline's `blockNames`. Keep block order stack/core/arch/infra/ai/impact.
    let frontend: Disc = ( "frontend", "Frontend", "fields", /* desc */ "...",
        [ ("stack", "...", [/*7*/ "..","..","..","..","..","..",".."]),
          ("core", "...", ["..","..","..","..","..","..",".."]),
          ("arch", "...", ["..","..","..","..","..","..",".."]),
          ("infra", "...", ["..","..","..","..","..","..",".."]),
          ("ai", "AI-инструменты", ai_cells), ("impact", "Командное влияние", impact_cells) ] );
    let mobile: Disc = ( "mobile", "Mobile", "fields", "...", [ /* port from grades-data.js */
          ("stack","...",["..","..","..","..","..","..",".."]),("core","...",["..","..","..","..","..","..",".."]),
          ("arch","...",["..","..","..","..","..","..",".."]),("infra","...",["..","..","..","..","..","..",".."]),
          ("ai","AI-инструменты",ai_cells),("impact","Командное влияние",impact_cells) ] );
    let qa: Disc = ( "qa", "QA", "fields", "...", [ /* port from grades-data.js */
          ("stack","...",["..","..","..","..","..","..",".."]),("core","...",["..","..","..","..","..","..",".."]),
          ("arch","...",["..","..","..","..","..","..",".."]),("infra","...",["..","..","..","..","..","..",".."]),
          ("ai","AI-инструменты",ai_cells),("impact","Командное влияние",impact_cells) ] );
    let devops: Disc = ( "devops", "DevOps", "fields", "...", [ /* port from grades-data.js */
          ("stack","...",["..","..","..","..","..","..",".."]),("core","...",["..","..","..","..","..","..",".."]),
          ("arch","...",["..","..","..","..","..","..",".."]),("infra","...",["..","..","..","..","..","..",".."]),
          ("ai","AI-инструменты",ai_cells),("impact","Командное влияние",impact_cells) ] );

    for (d_ord, disc) in [backend, frontend, mobile, qa, devops].iter().enumerate() {
        let drow: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO disciplines (workspace_id, key, label, icon, description, ord) \
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        )
        .bind(ws_id).bind(disc.0).bind(disc.1).bind(disc.2).bind(disc.3).bind(d_ord as i32)
        .fetch_one(&mut *tx).await?;
        for (b_ord, (bkey, bname, cells)) in disc.4.iter().enumerate() {
            let brow: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO grade_blocks (discipline_id, key, name, ord) VALUES ($1,$2,$3,$4) RETURNING id",
            )
            .bind(drow.0).bind(*bkey).bind(*bname).bind(b_ord as i32)
            .fetch_one(&mut *tx).await?;
            for (lvl, text) in cells.iter().enumerate() {
                let required = *text != "Не требуется.";
                let stored: Option<&str> = if required { Some(*text) } else { None };
                sqlx::query(
                    "INSERT INTO matrix_cells (block_id, level_ord, text, required) VALUES ($1,$2,$3,$4)",
                )
                .bind(brow.0).bind((lvl + 1) as i32).bind(stored).bind(required)
                .execute(&mut *tx).await?;
            }
        }
    }
```

IMPORTANT: the `"..."` placeholders for frontend/mobile/qa/devops MUST be replaced with the real `blockNames` + `matrix` arrays from `design_handoff_beeteam/grades-data.js` (read that file; each discipline has `blockNames: {stack,core,arch,infra,ai,impact}` and `matrix: {stack:[7], core:[7], arch:[7], infra:[7], ai: aiCells, impact: impactCells}`). Do not ship the `".."` placeholders. Use each discipline's `desc` too. (`ws_id` is already in scope in `seed_demo`.)

- [ ] **Step 4: Add a seed test**

In `seed.rs` `#[cfg(test)] mod tests`, add:
```rust
    #[sqlx::test(migrations = "./migrations")]
    async fn seed_loads_grade_framework(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let levels: (i64,) = sqlx::query_as("SELECT count(*) FROM grade_levels").fetch_one(&pool).await.unwrap();
        assert_eq!(levels.0, 7, "7 levels");
        let disc: (i64,) = sqlx::query_as("SELECT count(*) FROM disciplines").fetch_one(&pool).await.unwrap();
        assert_eq!(disc.0, 5, "5 disciplines");
        // each discipline has 6 blocks → 30 blocks; each block 7 cells → 210 cells.
        let blocks: (i64,) = sqlx::query_as("SELECT count(*) FROM grade_blocks").fetch_one(&pool).await.unwrap();
        assert_eq!(blocks.0, 30, "6 blocks × 5 disciplines");
        let cells: (i64,) = sqlx::query_as("SELECT count(*) FROM matrix_cells").fetch_one(&pool).await.unwrap();
        assert_eq!(cells.0, 210, "30 blocks × 7 levels");
        // backend/arch/IC1 is "Не требуется." → required=false
        let not_req: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM matrix_cells mc \
             JOIN grade_blocks b ON b.id = mc.block_id \
             JOIN disciplines d ON d.id = b.discipline_id \
             WHERE d.key='backend' AND b.key='arch' AND mc.level_ord=1 AND mc.required=false",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(not_req.0, 1, "backend/arch/IC1 not required");
    }
```

- [ ] **Step 5: Run bt-db tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db`
Expected: all PASS (incl. `seed_loads_grade_framework`).

- [ ] **Step 6: Re-seed the dev DB**

Run: `docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE;"` then restart the API. Verify: `docker compose exec -T postgres psql -U beeteam -d beeteam -c "SELECT count(*) FROM matrix_cells;"` → 210.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-db/migrations/0004_grades.sql api/crates/bt-db/src/seed.rs
git commit -m "feat(db): grade framework schema + seed (disciplines/levels/matrix/bands)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: DTOs + `GET /v1/grades/framework`

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`
- Create: `api/crates/bt-api/src/routes/grades.rs`
- Modify: `api/crates/bt-api/src/routes/mod.rs`, `app.rs`

- [ ] **Step 1: Add DTOs to `bt-domain/src/lib.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GradeLevel {
    pub ord: i32,
    pub code: String,
    pub name: String,
    pub exp: String,
    pub autonomy: String,
    pub scope: String,
    pub mgr: bool,
    pub band_low: f64,
    pub band_mid: f64,
    pub band_high: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MatrixCell {
    pub level: i32,
    pub text: Option<String>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GradeBlock {
    pub id: uuid::Uuid,
    pub key: String,
    pub name: String,
    pub ord: i32,
    pub cells: Vec<MatrixCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Discipline {
    pub id: uuid::Uuid,
    pub key: String,
    pub label: String,
    pub icon: String,
    pub description: String,
    pub ord: i32,
    pub blocks: Vec<GradeBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GradesFramework {
    pub levels: Vec<GradeLevel>,
    pub disciplines: Vec<Discipline>,
}
```

- [ ] **Step 2: Build the domain crate**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: clean.

- [ ] **Step 3: Create `routes/grades.rs`**

```rust
use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use axum::extract::State;
use axum::Json;
use bt_domain::{Discipline, GradeBlock, GradeLevel, GradesFramework, MatrixCell};
use uuid::Uuid;

#[utoipa::path(
    get, path = "/v1/grades/framework",
    responses((status = 200, description = "Grade framework", body = GradesFramework))
)]
pub async fn get_framework(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<GradesFramework>> {
    let ws: (Uuid,) = sqlx::query_as("SELECT workspace_id FROM users WHERE id = $1")
        .bind(auth.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let workspace_id = ws.0;

    let levels: Vec<GradeLevel> = sqlx::query_as::<_, (
        i32, String, String, String, String, String, bool, f64, f64, f64,
    )>(
        "SELECT ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high \
         FROM grade_levels WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| GradeLevel {
        ord: r.0, code: r.1, name: r.2, exp: r.3, autonomy: r.4, scope: r.5,
        mgr: r.6, band_low: r.7, band_mid: r.8, band_high: r.9,
    })
    .collect();

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

    Ok(Json(GradesFramework { levels, disciplines }))
}
```

- [ ] **Step 4: Wire module + route**

`routes/mod.rs`: add `pub mod grades;`. `app.rs` protected router: `.route("/v1/grades/framework", get(routes::grades::get_framework))`.

- [ ] **Step 5: Add a test**

Add to `grades.rs` a `#[cfg(test)] mod tests`. It needs a seeded framework — call `bt_db::seed::seed_demo(&pool)` to populate, then log in as the seeded lead. (Look at how other route tests obtain a token; the seeded lead is `e.glebov@beeteam.io` / `demo1234`.) Use the local `app(pool)` helper pattern (copy from `routes/teams.rs` tests — build `AppState` incl. `s3`/`bucket` via `crate::storage::client_from_env()`/`bucket_from_env()`).

```rust
#[cfg(test)]
mod tests {
    use crate::app::app;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

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
        assert!(json["levels"][0]["band_mid"].is_number());
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
}
```

> If `bt_db::seed::seed_demo` isn't re-callable in a route test (path/visibility), confirm `bt-db` exposes `pub mod seed` with `pub async fn seed_demo` (it does — used by `main.rs`). The `seed_demo` early-returns if a workspace already exists, but `#[sqlx::test]` gives a fresh DB, so it seeds.

- [ ] **Step 6: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: the new test + all prior PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/grades.rs api/crates/bt-api/src/routes/mod.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/grades/framework (workspace grade framework)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: OpenAPI + regenerate types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`, `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Register**

In `openapi.rs` add to `paths(...)`: `crate::routes::grades::get_framework,`. Add to `components(schemas(...))`:
```rust
        bt_domain::GradeLevel,
        bt_domain::MatrixCell,
        bt_domain::GradeBlock,
        bt_domain::Discipline,
        bt_domain::GradesFramework,
```

- [ ] **Step 2: Build + boot + verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`. Restart the API on :8080 (dev DB up). Then `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/grades/framework"'` → prints it.

- [ ] **Step 3: gen:api**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`. Then `grep -c "GradesFramework\|Discipline\|MatrixCell" lib/api/schema.d.ts` → non-zero.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register grades framework in OpenAPI; regen web types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — Frontend

### Task 4: `useGradesFramework` hook

**Files:**
- Create: `web/lib/query/grades.ts`

- [ ] **Step 1: Implement**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type GradesFramework = components["schemas"]["GradesFramework"];
export type Discipline = components["schemas"]["Discipline"];
export type GradeBlock = components["schemas"]["GradeBlock"];
export type GradeLevel = components["schemas"]["GradeLevel"];
export type MatrixCell = components["schemas"]["MatrixCell"];

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
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/grades.ts
git commit -m "feat(web): useGradesFramework hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `GradeLevels` / `GradeMatrix` / `GradeBands` + cell Modal

**Files:**
- Create: `web/components/grades/GradeLevels.tsx`, `GradeMatrix.tsx`, `GradeBands.tsx`
- Test: `web/components/__tests__/GradeViews.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GradeLevels } from "../grades/GradeLevels";
import { GradeMatrix } from "../grades/GradeMatrix";
import { GradeBands } from "../grades/GradeBands";
import type { GradeLevel, Discipline } from "@/lib/query/grades";

const LEVELS: GradeLevel[] = [
  { ord: 1, code: "IC1", name: "Trainee", exp: "0–6 мес", autonomy: "Менторство", scope: "Учеба", mgr: false, band_low: 0.78, band_mid: 1.0, band_high: 1.25 },
  { ord: 5, code: "IC5", name: "Senior", exp: "5+ лет", autonomy: "Архитектура", scope: "Сервис", mgr: true, band_low: 0.86, band_mid: 1.0, band_high: 1.14 },
];

const DISC: Discipline = {
  id: "d1", key: "backend", label: "Backend", icon: "fields", description: "API", ord: 0,
  blocks: [
    { id: "b1", key: "stack", name: "Серверный стек", ord: 0, cells: [
      { level: 1, text: "CRUD под руководством", required: true },
      { level: 2, text: "ORM, миграции", required: true },
    ] },
    { id: "b2", key: "arch", name: "Архитектура", ord: 1, cells: [
      { level: 1, text: null, required: false },
      { level: 2, text: "REST, HTTP", required: true },
    ] },
  ],
};

describe("Grade views", () => {
  it("GradeLevels lists levels with a manager badge", () => {
    render(<GradeLevels levels={LEVELS} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText("Trainee")).toBeInTheDocument();
    expect(screen.getByText("менеджерский трек")).toBeInTheDocument(); // only IC5 is mgr
  });

  it("GradeMatrix renders block rows and opens a cell modal", () => {
    render(<GradeMatrix discipline={DISC} levels={LEVELS} />);
    expect(screen.getByText("Серверный стек")).toBeInTheDocument();
    // a required cell shows truncated text; click → modal with full text
    fireEvent.click(screen.getByText("CRUD под руководством"));
    expect(screen.getByText(/Что должен демонстрировать/)).toBeInTheDocument();
  });

  it("GradeMatrix dims a not-required cell", () => {
    render(<GradeMatrix discipline={DISC} levels={LEVELS} />);
    // arch/IC1 is not required → rendered as «—», not clickable content
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("GradeBands renders a band per level", () => {
    render(<GradeBands levels={LEVELS} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText(/Точные цифры/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test GradeViews`

- [ ] **Step 3: Implement `web/components/grades/GradeLevels.tsx`**

```typescript
import { Pill } from "@/components/Pill";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeLevels({ levels }: { levels: GradeLevel[] }) {
  return (
    <div className="space-y-2">
      {levels.map((l) => (
        <div key={l.ord} className="rounded-lg border border-line bg-bg-elev p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-bg-tint px-2 py-0.5 text-[13px] font-semibold text-ink tabular">{l.code}</span>
            <span className="text-[14px] font-semibold text-ink">{l.name}</span>
            <span className="text-[12px] text-ink-3">· {l.exp}</span>
            {l.mgr && <Pill variant="info">менеджерский трек</Pill>}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[12px] text-ink-2">
            <div><span className="text-ink-3">Автономия: </span>{l.autonomy}</div>
            <div><span className="text-ink-3">Масштаб: </span>{l.scope}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `web/components/grades/GradeMatrix.tsx`**

```typescript
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import type { Discipline, GradeLevel, MatrixCell } from "@/lib/query/grades";

export function GradeMatrix({ discipline, levels }: { discipline: Discipline; levels: GradeLevel[] }) {
  const [open, setOpen] = useState<{ block: string; code: string; text: string } | null>(null);
  const cols = [...levels].sort((a, b) => a.ord - b.ord);

  function cellOf(block: { cells: MatrixCell[] }, ord: number) {
    return block.cells.find((c) => c.level === ord);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-bg-elev p-2 text-[11px] font-medium text-ink-3">Блок</th>
            {cols.map((l) => (
              <th key={l.ord} className="min-w-[150px] p-2 text-[11px] font-medium text-ink-3 tabular">{l.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {discipline.blocks.map((b) => (
            <tr key={b.id} className="border-t border-line-2 align-top">
              <td className="sticky left-0 z-10 bg-bg-elev p-2 text-[12px] font-medium text-ink">{b.name}</td>
              {cols.map((l) => {
                const c = cellOf(b, l.ord);
                if (!c || !c.required || !c.text) {
                  return <td key={l.ord} className="p-2 text-center text-[12px] text-ink-4">—</td>;
                }
                return (
                  <td key={l.ord} className="p-1">
                    <button type="button"
                      onClick={() => setOpen({ block: b.name, code: l.code, text: c.text! })}
                      className="line-clamp-3 w-full rounded-md border border-line-2 bg-bg-tint p-1.5 text-left text-[11px] text-ink-2 hover:bg-bg-sunken">
                      {c.text}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {open && (
        <Modal title={`${open.block} · ${open.code}`} onClose={() => setOpen(null)}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Что должен демонстрировать сотрудник на этом уровне</div>
          <p className="text-[13px] text-ink-2">{open.text}</p>
        </Modal>
      )}
    </div>
  );
}
```

> If `line-clamp-3` isn't enabled in this Tailwind config, the text still renders (cosmetic). Leave as-is.

- [ ] **Step 5: Implement `web/components/grades/GradeBands.tsx`**

```typescript
import type { GradeLevel } from "@/lib/query/grades";

export function GradeBands({ levels }: { levels: GradeLevel[] }) {
  const cols = [...levels].sort((a, b) => a.ord - b.ord);
  const maxHigh = Math.max(1, ...cols.map((l) => l.band_high));
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="space-y-2">
        {cols.map((l) => (
          <div key={l.ord} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-[12px] font-semibold text-ink tabular">{l.code}</span>
            <div className="relative h-3 flex-1 rounded-full bg-bg-sunken">
              <div
                className="absolute h-3 rounded-full bg-brand-soft"
                style={{ left: `${(l.band_low / maxHigh) * 100}%`, width: `${((l.band_high - l.band_low) / maxHigh) * 100}%` }}
              />
              <div className="absolute top-0 h-3 w-0.5 bg-brand" style={{ left: `${(l.band_mid / maxHigh) * 100}%` }} />
            </div>
            <span className="w-28 shrink-0 text-right text-[11px] text-ink-3 tabular">
              {l.band_low.toFixed(2)} · {l.band_mid.toFixed(2)} · {l.band_high.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">Точные цифры — у HR-администратора.</p>
    </div>
  );
}
```

- [ ] **Step 6: Run → PASS + typecheck.** `cd web && pnpm test GradeViews && pnpm exec tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/grades/GradeLevels.tsx web/components/grades/GradeMatrix.tsx web/components/grades/GradeBands.tsx web/components/__tests__/GradeViews.test.tsx
git commit -m "feat(web): GradeLevels + GradeMatrix (cell modal) + GradeBands

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `GradesClient` + `/grades` page

**Files:**
- Create: `web/components/grades/GradesClient.tsx`, `web/app/(app)/grades/page.tsx`

- [ ] **Step 1: Implement `GradesClient.tsx`**

```typescript
"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { useGradesFramework } from "@/lib/query/grades";
import { GradeLevels } from "./GradeLevels";
import { GradeMatrix } from "./GradeMatrix";
import { GradeBands } from "./GradeBands";

type Tab = "levels" | "matrix" | "bands";

export function GradesClient() {
  const fw = useGradesFramework();
  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");

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
  const activeKey = disc ?? disciplines[0].key;
  const active = disciplines.find((d) => d.key === activeKey) ?? disciplines[0];

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-ink">Грейды</h1>
        <p className="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegControl
          options={disciplines.map((d) => ({ value: d.key, label: d.label }))}
          value={activeKey} onChange={setDisc} />
        <SegControl
          options={[{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={tab} onChange={(v) => setTab(v as Tab)} />
      </div>

      {tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `web/app/(app)/grades/page.tsx`**

```typescript
import { GradesClient } from "@/components/grades/GradesClient";

export default function GradesPage() {
  return <GradesClient />;
}
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: clean + green.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/grades/GradesClient.tsx "web/app/(app)/grades/page.tsx"
git commit -m "feat(web): GradesClient + /grades route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Enable the Sidebar «Грейды» entry

**Files:**
- Modify: `web/components/Sidebar.tsx`

- [ ] **Step 1: Enable + route it**

Read `web/components/Sidebar.tsx`. The `TEAM_NAV` array has `{ id: "grades", label: "Грейды", icon: "layers", disabled: true }`. Change it to `{ id: "grades", label: "Грейды", icon: "layers", href: "/grades", disabled: false }`. The active-state computation + `next/link` rendering are already in place (slice 8): an entry with `href` and `!disabled` renders as a Link and is active when `pathname.startsWith(href)`. Keep «Конструктор полей»/«Экспорт» disabled.

- [ ] **Step 2: Typecheck + tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: clean + green (no Sidebar test asserts «Грейды» disabled; if one does, update it to the enabled entry).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Sidebar.tsx
git commit -m "feat(web): enable Грейды nav → /grades

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Playwright e2e

**Files:**
- Create: `web/e2e/grades.spec.ts`

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

test("navigate to grades and open a matrix cell", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Грейды" }).click();
  await expect(page).toHaveURL(/\/grades$/);
  await expect(page.getByRole("heading", { name: "Грейды" })).toBeVisible();
  // discipline tabs + matrix grid (default tab = Матрица).
  await expect(page.getByRole("button", { name: "Backend" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Серверный стек")).toBeVisible();
  // click a matrix cell → detail modal.
  await page.getByText("Знает синтаксис языка", { exact: false }).first().click();
  await expect(page.getByText(/Что должен демонстрировать/)).toBeVisible({ timeout: 10_000 });
});

test("switch to Уровни and Вилки tabs", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Грейды" }).click();
  await expect(page.getByRole("heading", { name: "Грейды" })).toBeVisible();
  await page.getByRole("button", { name: "Уровни" }).click();
  await expect(page.getByText("Trainee")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText(/Точные цифры/)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run** (API on :8080 + dev DB re-seeded with the framework; Playwright starts `pnpm dev`)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e grades`
Expected: both pass. If «Знает синтаксис языка» isn't visible (its cell text differs after porting), pick any backend/stack/IC1 cell text that the seed actually contains, or click the first matrix cell button. Refine selectors against the real DOM; don't weaken assertions.

- [ ] **Step 3: Full e2e suite**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e`
Expected: all specs PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/grades.spec.ts
git commit -m "test(web): grades e2e — nav, matrix cell modal, tab switching

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification
- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-db && api/scripts/test.sh -p bt-api` → all PASS.
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e: `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: Sidebar «Грейды» active on `/grades`; discipline tabs switch the matrix; cells open a detail modal; «не требуется» cells dimmed; Уровни shows IC1–IC7 (mgr badge on IC5+); Вилки shows band bars.
- [ ] Then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- Schema (disciplines/grade_levels/grade_blocks/matrix_cells, DOUBLE PRECISION bands, normalized cells) → Task 1 ✓
- Seed from grades-data.js (7 levels, 5 disciplines, matrices, «не требуется»→required=false) → Task 1 ✓ (placeholders for the 4 non-backend disciplines explicitly flagged to port from the file)
- Combined `GET /v1/grades/framework`, workspace-resolved, any authenticated lead, no team scoping → Task 2 ✓
- DTOs `GradeLevel/MatrixCell/GradeBlock/Discipline/GradesFramework` → Task 2 ✓
- OpenAPI + gen:api → Task 3 ✓
- `useGradesFramework` → Task 4 ✓
- GradeLevels (mgr badge) / GradeMatrix (grid + cell Modal + dimmed not-required) / GradeBands (bars + HR note) → Task 5 ✓
- GradesClient (discipline tabs + Уровни/Матрица/Вилки, default Матрица) + /grades page → Task 6 ✓
- Sidebar «Грейды» enablement (route-aware, slice-8 pattern) → Task 7 ✓
- e2e nav + cell modal + tab switch → Task 8 ✓
- Deferred (editor/addons/member-grades/evidence/review/hr-gating) — not in any task ✓
- Preserve brand token, RU microcopy, tabular, Modal/Pill/SegControl reuse → enforced in component code + conventions ✓

**Placeholder scan:** the ONLY placeholders are the `".."` cell strings for frontend/mobile/qa/devops in the seed — these are explicitly called out (Task 1 Step 3) as "port from grades-data.js; do not ship the placeholders," with the exact source structure named. The backend discipline is fully inline as the concrete pattern. No other TBD/TODO.

**Type consistency:** `GradesFramework`/`Discipline`/`GradeBlock`/`GradeLevel`/`MatrixCell` (Task 2 DTOs) → generated types (Task 3) → hook aliases (Task 4) → consumed by GradeLevels/GradeMatrix/GradeBands (Task 5) and GradesClient (Task 6). `MatrixCell.level`/`text`/`required`, block `cells`, `band_low/mid/high` consistent across backend SQL, DTO, and components. `seed_loads_grade_framework` counts (7/5/30/210) match the schema + seed structure.

**One implementer note:** Task 1's biggest effort is porting the 4 non-backend disciplines' matrices verbatim from `design_handoff_beeteam/grades-data.js` — read that file's `disciplines.{frontend,mobile,qa,devops}` (`blockNames` + `matrix`) and the shared `aiCells`/`impactCells`. The seed test asserts exactly 210 cells, so all 5×6×7 must be present.
