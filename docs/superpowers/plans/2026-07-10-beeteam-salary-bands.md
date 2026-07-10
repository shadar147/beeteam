# Salary Bands (slice #5b-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn salary bands into real gross tenge (₸/month) with a workspace income-tax rate, expose exact figures + editing only under `EditSalaryBands`, and mask them server-side for everyone else — closing BT_GRADES.

**Architecture:** `grade_levels.band_*` are reinterpreted as gross ₸ (re-seeded); a new `workspaces.salary_tax_rate` holds the ИПН rate. `GET /v1/grades/framework` always returns a normalized `band_shape` (for the bars) but only fills exact `band_*` + `tax_rate` when the caller holds `EditSalaryBands`. A new `PATCH /v1/grades/bands` (the mirror of `PATCH /levels`) writes bands + rate under `EditSalaryBands`. The frontend adds an exact-numbers view (gross + net = gross×(1−rate)) and a dedicated bands-edit mode on the «Вилки» tab.

**Tech Stack:** Rust (axum, sqlx runtime queries, utoipa), Postgres 16, Next.js 14 + TanStack Query + openapi-fetch, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-beeteam-salary-bands-design.md`

**Test commands (never bare `cargo test` for DB crates):**
- Domain (no DB): `cargo test -p bt-domain`
- API/DB (isolated test DB): `bash api/scripts/test.sh -p bt-api <filter>`
- Web unit: `cd web && npm test -- <file-substring>` (all: `npm test`)
- Web typecheck: `cd web && npx tsc --noEmit`
- Web e2e: `cd web && npm run test:e2e -- <file-substring>`

---

## File Structure

**Backend**
- `api/crates/bt-db/migrations/0009_salary_bands.sql` — **create**: `workspaces.salary_tax_rate` + `grade_levels` band-order CHECK.
- `api/crates/bt-db/src/seed.rs` — **modify** (`levels` array, ~line 340): gross ₸ band values.
- `api/crates/bt-domain/src/lib.rs` — **modify**: `BandShape` (new), `GradeLevel` (bands → `Option`, add `band_shape`), `GradesFramework` (add `tax_rate`), `UpdateBand`/`UpdateBands` (new).
- `api/crates/bt-api/src/auth/permissions.rs` — **modify**: add non-throwing `has_permission`.
- `api/crates/bt-api/src/routes/grades.rs` — **modify**: `levels_of` (add `show_bands`), `get_framework` (mask + `tax_rate`), `update_levels` (call-site), `update_bands` (new handler) + tests.
- `api/crates/bt-api/src/app.rs` — **modify** (after line 77): register `PATCH /v1/grades/bands`.
- `api/crates/bt-api/src/openapi.rs` — **modify**: register the new path + `BandShape`/`UpdateBands`/`UpdateBand` schemas.

**Frontend**
- `web/lib/api/schema.d.ts` — **regenerate** (`npm run gen:api`).
- `web/lib/format.ts` — **create**: `formatTenge`.
- `web/lib/query/grades.ts` — **modify**: `UpdateBands` type + `useUpdateBands` hook.
- `web/components/grades/GradeBands.tsx` — **modify**: bars from `band_shape`; exact gross/net columns for HR.
- `web/components/grades/editorTypes.ts` — **modify**: `DraftBand` + `BandsDraft`.
- `web/components/grades/BandsEditor.tsx` — **create**: the editable bands table.
- `web/components/grades/GradesClient.tsx` — **modify**: `canEditBands`, bands-edit mode, «Редактировать вилки».
- `web/app/(app)/grades/page.tsx` — **modify**: pass `canEditBands`.
- `web/components/__tests__/GradeViews.test.tsx` — **modify**: fixtures to the new `GradeLevel` shape.
- `web/components/__tests__/FrameworkEditor.test.tsx` — **modify**: mock fixture + render calls.
- `web/components/__tests__/SalaryBands.test.tsx` — **create**: GradeBands / BandsEditor / formatTenge / gating.
- `web/e2e/grades-bands.spec.ts` — **create**: HR edits bands + rate; lead sees neither.

---

## Task 1: Migration 0009 + gross-tenge re-seed

**Files:**
- Create: `api/crates/bt-db/migrations/0009_salary_bands.sql`
- Modify: `api/crates/bt-db/src/seed.rs:340-348`
- Test: `api/crates/bt-api/src/routes/grades.rs` (mod tests)

- [ ] **Step 1: Create the migration**

Create `api/crates/bt-db/migrations/0009_salary_bands.sql`:

```sql
-- Salary bands become real money: a workspace income-tax rate + a band-ordering guard.
ALTER TABLE workspaces
  ADD COLUMN salary_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0.10;

ALTER TABLE grade_levels
  ADD CONSTRAINT band_order
  CHECK (band_low <= band_mid AND band_mid <= band_high AND band_low > 0);
```

- [ ] **Step 2: Re-seed the levels with gross ₸/month**

In `api/crates/bt-db/src/seed.rs`, replace the `levels` array (currently lines 340-348) — keep every text/`mgr` value, change only the three trailing `f64`s:

```rust
    let levels: [(&str, &str, &str, &str, &str, bool, f64, f64, f64); 7] = [
        ("IC1", "Trainee", "0–6 мес", "Работает под плотным менторством", "Учебные задачи, pet-проекты", false, 300_000.0, 380_000.0, 470_000.0),
        ("IC2", "Junior", "6 мес–1.5 г", "Делает задачи по чёткому ТЗ с ревью", "Отдельные тикеты", false, 450_000.0, 560_000.0, 700_000.0),
        ("IC3", "Middle", "1.5–3 года", "Самостоятельно решает типовые задачи", "Фича целиком", false, 680_000.0, 850_000.0, 1_080_000.0),
        ("IC4", "Middle+", "3–5 лет", "Автономен в рамках сервиса", "Несколько связанных фич, модуль", false, 1_000_000.0, 1_250_000.0, 1_550_000.0),
        ("IC5", "Senior", "5+ лет", "Принимает архитектурные решения в своей зоне", "Сервис или подсистема", true, 1_400_000.0, 1_800_000.0, 2_250_000.0),
        ("IC6", "Staff / Tech Lead", "7+ лет", "Определяет технические стандарты команды", "Несколько сервисов, кросс-команды", true, 2_000_000.0, 2_550_000.0, 3_200_000.0),
        ("IC7", "Principal", "10+ лет", "Задаёт технологическое направление", "Весь домен, архитектура компании", true, 2_900_000.0, 3_700_000.0, 4_600_000.0),
    ];
```

(The workspace `INSERT` at seed.rs:17-24 is unchanged — `salary_tax_rate` relies on the `DEFAULT 0.10`.)

- [ ] **Step 3: Add tests (write them to fail first)**

Add to the `mod tests` block in `api/crates/bt-api/src/routes/grades.rs` (before the closing `}` at line 539):

```rust
    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn seed_bands_are_gross_tenge(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let row: (f64, f64) = sqlx::query_as(
            "SELECT band_mid, band_high FROM grade_levels WHERE ord = 7 \
             AND workspace_id = (SELECT id FROM workspaces LIMIT 1)",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, 3_700_000.0);
        assert_eq!(row.1, 4_600_000.0);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn check_constraint_rejects_inverted_band(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        // Directly violate band_low <= band_high — the CHECK must reject it.
        let res = sqlx::query("UPDATE grade_levels SET band_low = band_high + 1 WHERE ord = 1")
            .execute(&pool).await;
        assert!(res.is_err(), "CHECK band_order must reject low > high");
    }
```

- [ ] **Step 4: Run — expect FAIL then PASS**

Run: `bash api/scripts/test.sh -p bt-api seed_bands_are_gross_tenge check_constraint_rejects_inverted_band`
Expected before Steps 1-2: FAIL (old seed value / no CHECK). After: PASS (2 tests).

- [ ] **Step 5: Verify nothing else broke**

Run: `bash api/scripts/test.sh -p bt-api grades`
Expected: PASS (all `routes::grades` tests — masking isn't implemented yet, so `framework_returns_levels_and_disciplines` still sees numbers).

- [ ] **Step 6: Commit**

```bash
git add api/crates/bt-db/migrations/0009_salary_bands.sql api/crates/bt-db/src/seed.rs api/crates/bt-api/src/routes/grades.rs
git commit -m "feat(db): gross-tenge salary bands + tax rate column (slice #5b-ii)"
```

---

## Task 2: Domain DTOs + server-side band masking

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs:342-354` (GradeLevel), `:384-387` (GradesFramework)
- Modify: `api/crates/bt-api/src/auth/permissions.rs`
- Modify: `api/crates/bt-api/src/routes/grades.rs:19-29` (levels_of), `:55-98` (get_framework), `:126` (update_levels call-site)
- Modify: `api/crates/bt-api/src/openapi.rs` (register BandShape)
- Test: `api/crates/bt-api/src/routes/grades.rs` (mod tests)

- [ ] **Step 1: Domain — add `BandShape`, nullable bands, `tax_rate`**

In `api/crates/bt-domain/src/lib.rs`, add `BandShape` and replace the `GradeLevel` struct (lines 342-354):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BandShape {
    pub low: f64,
    pub mid: f64,
    pub high: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GradeLevel {
    pub ord: i32,
    pub code: String,
    pub name: String,
    pub exp: String,
    pub autonomy: String,
    pub scope: String,
    pub mgr: bool,
    pub band_shape: BandShape,      // always sent — drives the bars
    pub band_low: Option<f64>,      // Some only with EditSalaryBands
    pub band_mid: Option<f64>,
    pub band_high: Option<f64>,
}
```

Replace `GradesFramework` (lines 384-387):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GradesFramework {
    pub levels: Vec<GradeLevel>,
    pub disciplines: Vec<Discipline>,
    pub tax_rate: Option<f64>,      // Some only with EditSalaryBands
}
```

- [ ] **Step 2: Permissions — add a non-throwing check**

Replace `api/crates/bt-api/src/auth/permissions.rs` body:

```rust
use bt_domain::Permission;

use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};

/// True if the caller's role grants the permission.
pub fn has_permission(auth: &AuthUser, p: Permission) -> bool {
    bt_domain::permissions_of(&auth.role).contains(&p)
}

/// 403 unless the caller's role grants the permission.
pub fn require_permission(auth: &AuthUser, p: Permission) -> AppResult<()> {
    if has_permission(auth, p) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
```

- [ ] **Step 3: `levels_of` computes shape + masks bands**

In `api/crates/bt-api/src/routes/grades.rs`:

Update the imports on line 2 and line 9:

```rust
use crate::auth::permissions::{has_permission, require_permission};
```
```rust
use bt_domain::{BandShape, CreateDiscipline, Discipline, GradeBlock, GradeLevel, GradesFramework, MatrixCell, Permission, PutDiscipline, UpdateBands, UpdateLevels};
```

Replace `levels_of` (lines 19-29):

```rust
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
```

- [ ] **Step 4: `get_framework` — gate exact figures + tax rate**

In `get_framework`, replace the `levels` line (61) and the final assembly/return (97):

```rust
    let show_bands = has_permission(&auth, Permission::EditSalaryBands);
    let levels = levels_of(&state.pool, workspace_id, show_bands).await?;
```

and, at the end, replace `Ok(Json(GradesFramework { levels, disciplines }))` with:

```rust
    let tax_rate = if show_bands {
        let r: (f64,) = sqlx::query_as("SELECT salary_tax_rate FROM workspaces WHERE id = $1")
            .bind(workspace_id).fetch_one(&state.pool).await?;
        Some(r.0)
    } else {
        None
    };

    Ok(Json(GradesFramework { levels, disciplines, tax_rate }))
```

- [ ] **Step 5: `update_levels` — mask its returned ladder too**

In `update_levels`, change the final return (line 126) so bands stay gated by `EditSalaryBands` (not `EditFramework`):

```rust
    Ok(Json(levels_of(&state.pool, workspace_id, has_permission(&auth, Permission::EditSalaryBands)).await?))
```

- [ ] **Step 6: Register `BandShape` in OpenAPI**

In `api/crates/bt-api/src/openapi.rs`, add to the `schemas(...)` list (after `bt_domain::GradeLevel,` on line 83):

```rust
        bt_domain::BandShape,
```

- [ ] **Step 7: Update the existing framework test + add masking tests**

In `api/crates/bt-api/src/routes/grades.rs` tests, first add a shared helper (place it just above `framework_returns_levels_and_disciplines`, ~line 514):

```rust
    async fn get_framework_json(pool: &sqlx::PgPool, token: &str) -> serde_json::Value {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("GET").uri("/v1/grades/framework")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }
```

In `framework_returns_levels_and_disciplines`, replace the single band assertion (line 528) `assert!(json["levels"][0]["band_mid"].is_number());` with:

```rust
        assert!(json["levels"][0]["band_mid"].is_null(), "lead: exact bands masked");
        assert!(json["levels"][0]["band_shape"]["high"].is_number());
        assert!(json["tax_rate"].is_null(), "lead: tax rate masked");
```

Add two new tests (before the closing `}` of `mod tests`):

```rust
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
        assert!((json["tax_rate"].as_f64().unwrap() - 0.10).abs() < 1e-9);
        // IC7 (the top band_high) normalizes to shape.high == 1.0
        let ic7 = json["levels"].as_array().unwrap().iter().find(|l| l["code"] == "IC7").unwrap();
        assert!((ic7["band_shape"]["high"].as_f64().unwrap() - 1.0).abs() < 1e-9);
    }
```

- [ ] **Step 8: Run — expect PASS**

Run: `cargo test -p bt-domain` → PASS (domain compiles).
Run: `bash api/scripts/test.sh -p bt-api grades` → PASS (masking + existing tests).
Run: `bash api/scripts/test.sh -p bt-api openapi` → PASS.

- [ ] **Step 9: Commit**

```bash
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/auth/permissions.rs api/crates/bt-api/src/routes/grades.rs api/crates/bt-api/src/openapi.rs
git commit -m "feat(api): mask exact bands + tax rate behind EditSalaryBands (slice #5b-ii)"
```

---

## Task 3: `PATCH /v1/grades/bands` endpoint

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs` (add UpdateBand/UpdateBands near UpdateLevels ~line 507)
- Modify: `api/crates/bt-api/src/routes/grades.rs` (new handler + tests)
- Modify: `api/crates/bt-api/src/app.rs:77` (register route)
- Modify: `api/crates/bt-api/src/openapi.rs` (path + schemas)

- [ ] **Step 1: Domain — the edit payload**

In `api/crates/bt-domain/src/lib.rs`, after `UpdateLevels` (line 507) add:

```rust
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateBand {
    pub ord: i32,
    pub band_low: f64,
    pub band_mid: f64,
    pub band_high: f64,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdateBands {
    pub tax_rate: f64,
    pub levels: Vec<UpdateBand>,
}
```

- [ ] **Step 2: Handler — write the test first**

Add to `api/crates/bt-api/src/routes/grades.rs` tests a helper + three tests:

```rust
    async fn patch_bands(pool: &sqlx::PgPool, token: &str, body: &str) -> StatusCode {
        app(pool.clone()).oneshot(
            Request::builder().method("PATCH").uri("/v1/grades/bands")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())).unwrap(),
        ).await.unwrap().status()
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_bands_updates_numbers_and_tax(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        let status = patch_bands(&pool, &hr,
            r#"{"tax_rate":0.12,"levels":[{"ord":1,"band_low":320000,"band_mid":400000,"band_high":500000}]}"#).await;
        assert_eq!(status, StatusCode::OK);

        let ws = "(SELECT workspace_id FROM users WHERE email='o.klimova@beeteam.io')";
        let row: (String, f64) = sqlx::query_as(&format!(
            "SELECT name, band_mid FROM grade_levels WHERE ord = 1 AND workspace_id = {ws}"))
            .fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, "Trainee", "text columns untouched");
        assert_eq!(row.1, 400000.0);
        let tax: (f64,) = sqlx::query_as(&format!(
            "SELECT salary_tax_rate FROM workspaces WHERE id = {ws}"))
            .fetch_one(&pool).await.unwrap();
        assert!((tax.0 - 0.12).abs() < 1e-9);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_bands_rejects_invalid(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let hr = login_token(&pool, "o.klimova@beeteam.io").await;
        // inverted band (low > mid)
        let s1 = patch_bands(&pool, &hr,
            r#"{"tax_rate":0.1,"levels":[{"ord":1,"band_low":500000,"band_mid":400000,"band_high":600000}]}"#).await;
        assert_eq!(s1, StatusCode::BAD_REQUEST);
        // tax rate out of range
        let s2 = patch_bands(&pool, &hr, r#"{"tax_rate":1.5,"levels":[]}"#).await;
        assert_eq!(s2, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn patch_bands_forbidden_for_lead(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let lead = login_token(&pool, "e.glebov@beeteam.io").await;
        let status = patch_bands(&pool, &lead,
            r#"{"tax_rate":0.1,"levels":[{"ord":1,"band_low":320000,"band_mid":400000,"band_high":500000}]}"#).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
```

- [ ] **Step 3: Run — expect FAIL (no handler/route yet)**

Run: `bash api/scripts/test.sh -p bt-api patch_bands`
Expected: FAIL — the route 404s / doesn't compile.

- [ ] **Step 4: Implement the handler**

In `api/crates/bt-api/src/routes/grades.rs`, add after `create_discipline` (before `#[cfg(test)]` at line 286):

```rust
#[utoipa::path(
    patch, path = "/v1/grades/bands", request_body = UpdateBands,
    responses((status = 200, body = [GradeLevel]), (status = 400), (status = 403))
)]
pub async fn update_bands(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Json(body): Json<UpdateBands>,
) -> AppResult<Json<Vec<GradeLevel>>> {
    require_permission(&auth, Permission::EditSalaryBands)?;
    if !(0.0..=0.99).contains(&body.tax_rate) {
        return Err(AppError::BadRequest("tax_rate must be in [0, 0.99]".into()));
    }
    for l in &body.levels {
        if !(l.band_low > 0.0 && l.band_low <= l.band_mid && l.band_mid <= l.band_high) {
            return Err(AppError::BadRequest("band must satisfy 0 < low <= mid <= high".into()));
        }
    }
    let workspace_id = workspace_of(&state.pool, auth.id).await?;

    let mut tx = state.pool.begin().await?;
    for l in &body.levels {
        sqlx::query(
            "UPDATE grade_levels SET band_low = $3, band_mid = $4, band_high = $5 \
             WHERE ord = $2 AND workspace_id = $1",
        )
        .bind(workspace_id).bind(l.ord).bind(l.band_low).bind(l.band_mid).bind(l.band_high)
        .execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE workspaces SET salary_tax_rate = $2 WHERE id = $1")
        .bind(workspace_id).bind(body.tax_rate).execute(&mut *tx).await?;
    tx.commit().await?;

    Ok(Json(levels_of(&state.pool, workspace_id, true).await?))
}
```

- [ ] **Step 5: Register the route**

In `api/crates/bt-api/src/app.rs`, after line 77 (`/v1/grades/levels`) add:

```rust
        .route("/v1/grades/bands", axum::routing::patch(routes::grades::update_bands))
```

- [ ] **Step 6: Register in OpenAPI**

In `api/crates/bt-api/src/openapi.rs`: add to `paths(...)` after `crate::routes::grades::update_levels,` (line 37):

```rust
        crate::routes::grades::update_bands,
```

and to `schemas(...)` after `bt_domain::UpdateLevel,` (line 101):

```rust
        bt_domain::UpdateBands,
        bt_domain::UpdateBand,
```

- [ ] **Step 7: Run — expect PASS**

Run: `cargo test -p bt-domain` → PASS.
Run: `bash api/scripts/test.sh -p bt-api grades` → PASS (incl. the 3 new band tests).
Run: `bash api/scripts/test.sh -p bt-api openapi` → PASS.

- [ ] **Step 8: Commit**

```bash
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/grades.rs api/crates/bt-api/src/app.rs api/crates/bt-api/src/openapi.rs
git commit -m "feat(api): PATCH /grades/bands edits bands + tax rate under EditSalaryBands (slice #5b-ii)"
```

---

## Task 4: Web types + `formatTenge` + `useUpdateBands` + GradeBands view

> **Orchestrator note:** before Step 1, the dev API must be running the Task-1..3 build so `/api-docs/openapi.json` includes the new schemas. Rebuild + restart the dev API first (`cargo run -p bt-api`), then regenerate.

**Files:**
- Regenerate: `web/lib/api/schema.d.ts`
- Create: `web/lib/format.ts`
- Modify: `web/lib/query/grades.ts`
- Modify: `web/components/grades/GradeBands.tsx`
- Modify: `web/components/grades/GradesClient.tsx:254` (pass `taxRate`)
- Modify: `web/components/__tests__/GradeViews.test.tsx`, `web/components/__tests__/FrameworkEditor.test.tsx`
- Create: `web/components/__tests__/SalaryBands.test.tsx`

- [ ] **Step 1: Regenerate the API types**

Run: `cd web && npm run gen:api`
Then confirm the deltas: `git diff web/lib/api/schema.d.ts` — expect `band_low/mid/high` become `number | null`, a new `band_shape` object, `GradesFramework.tax_rate` `number | null`, and new `UpdateBands`/`UpdateBand` schemas.

- [ ] **Step 2: `formatTenge` helper**

Create `web/lib/format.ts`:

```ts
/** "1 300 000 ₸" — rounded, ru-RU grouped, with the tenge sign. */
export function formatTenge(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₸`;
}
```

- [ ] **Step 3: `useUpdateBands` hook**

In `web/lib/query/grades.ts`, add the type (after line 12) and the hook (after `useCreateDiscipline`):

```ts
export type UpdateBands = components["schemas"]["UpdateBands"];
```
```ts
export function useUpdateBands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateBands) => {
      const { data, error } = await api.PATCH("/v1/grades/bands", { body });
      if (error) throw error;
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades-framework"] }),
  });
}
```

- [ ] **Step 4: GradeBands unit tests (write first)**

Create `web/components/__tests__/SalaryBands.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GradeBands } from "../grades/GradeBands";
import { formatTenge } from "@/lib/format";
import type { GradeLevel } from "@/lib/query/grades";

const shape = (low: number, mid: number, high: number) => ({ low, mid, high });

const MASKED: GradeLevel[] = [
  { ord: 1, code: "IC1", name: "Trainee", exp: "", autonomy: "", scope: "", mgr: false,
    band_shape: shape(0.62, 0.79, 0.98), band_low: null, band_mid: null, band_high: null },
];

const EXACT: GradeLevel[] = [
  { ord: 5, code: "IC5", name: "Senior", exp: "", autonomy: "", scope: "", mgr: true,
    band_shape: shape(0.30, 0.39, 0.49), band_low: 1_400_000, band_mid: 1_800_000, band_high: 2_250_000 },
];

describe("formatTenge", () => {
  it("groups thousands and appends ₸", () => {
    expect(formatTenge(1_300_000)).toMatch(/1\s300\s000\s₸/);
  });
});

describe("GradeBands", () => {
  it("masked: bars + spread, no ₸ numbers", () => {
    render(<GradeBands levels={MASKED} taxRate={null} />);
    expect(screen.getByText("IC1")).toBeInTheDocument();
    expect(screen.getByText(/Точные цифры/)).toBeInTheDocument();
    expect(screen.queryByText(/₸/)).not.toBeInTheDocument();
  });

  it("exact: shows gross and net (net = gross × (1 − rate))", () => {
    render(<GradeBands levels={EXACT} taxRate={0.1} />);
    // gross range endpoints
    expect(screen.getByText(new RegExp(formatTenge(1_400_000).replace("₸", "").trim()))).toBeInTheDocument();
    // net high = round(2 250 000 × 0.9) = 2 025 000
    expect(screen.getByText(new RegExp(formatTenge(2_025_000).replace("₸", "").trim()))).toBeInTheDocument();
    expect(screen.getByText(/ИПН 10%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

Run: `cd web && npm test -- SalaryBands`
Expected: FAIL (GradeBands still reads `band_high` as a number and has no `taxRate` prop / net columns).

- [ ] **Step 6: Rewrite GradeBands**

Replace `web/components/grades/GradeBands.tsx`:

```tsx
import { Shield } from "lucide-react";
import { GradeChip } from "./GradeChip";
import { formatTenge } from "@/lib/format";
import type { GradeLevel } from "@/lib/query/grades";

export function GradeBands({ levels, taxRate }: { levels: GradeLevel[]; taxRate?: number | null }) {
  const rows = [...levels].sort((a, b) => a.ord - b.ord);
  const exact = rows.length > 0 && rows[0].band_low != null;
  const rate = taxRate ?? 0;
  const cols = exact ? "170px 1fr 70px 190px 190px" : "200px 1fr 80px";

  return (
    <div className="space-y-3.5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <Shield size={16} className="mt-0.5 shrink-0 text-brand-strong" />
        {exact ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            <b className="font-semibold text-ink">Точные оклады (₸/мес, до налога).</b>{" "}
            <span className="text-ink-3">
              «На руки» — с учётом ИПН {Math.round(rate * 100)}%. Вилки общие для всех дисциплин на одном грейде.
            </span>
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            <b className="font-semibold text-ink">Вид лида: полосы без точных окладов.</b>{" "}
            <span className="text-ink-3">
              Вилки общие для всех дисциплин на одном грейде. Точные цифры — у HR-администратора.
            </span>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div
          className="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: cols }}
        >
          <div>Грейд</div>
          <div>Полоса (нижняя → медиана → верхняя)</div>
          <div className="text-right">Разброс</div>
          {exact && <div className="text-right">Оклад (до налога)</div>}
          {exact && <div className="text-right">На руки · ИПН {Math.round(rate * 100)}%</div>}
        </div>

        {rows.map((l) => {
          const lowPct = l.band_shape.low * 100;
          const highPct = l.band_shape.high * 100;
          const midPct = l.band_shape.mid * 100;
          const spread = l.band_shape.mid > 0
            ? Math.round(((l.band_shape.high - l.band_shape.low) / (2 * l.band_shape.mid)) * 100) : 0;
          return (
            <div
              key={l.ord}
              className="grid items-center gap-4 border-t border-line-2 px-[18px] py-3.5"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="flex items-center gap-2.5">
                <GradeChip ord={l.ord} code={l.code} size="sm" />
                <span className="text-[13px] font-semibold text-ink">{l.name}</span>
              </div>
              <div className="relative flex h-7 items-center">
                <div
                  className="absolute h-2 rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand"
                  style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
                />
                <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: `${lowPct}%` }} />
                <div className="absolute h-[18px] w-0.5 rounded bg-brand-strong" style={{ left: `${midPct}%` }} />
                <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: `calc(${highPct}% - 2px)` }} />
              </div>
              <div className="text-right text-[12.5px] tabular text-ink-2">±{spread}%</div>
              {exact && (
                <div className="text-right text-[12.5px] tabular text-ink">
                  {formatTenge(l.band_low!)} – {formatTenge(l.band_high!)}
                </div>
              )}
              {exact && (
                <div className="text-right text-[12.5px] tabular text-ink-2">
                  {formatTenge(Math.round(l.band_low! * (1 - rate)))} – {formatTenge(Math.round(l.band_high! * (1 - rate)))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Pass `taxRate` from GradesClient**

In `web/components/grades/GradesClient.tsx`, line 254, change `<GradeBands levels={levels} />` to:

```tsx
        <GradeBands levels={levels} taxRate={fw.data!.tax_rate} />
```

- [ ] **Step 8: Fix existing fixtures for the new `GradeLevel` shape**

In `web/components/__tests__/GradeViews.test.tsx`, replace the `LEVELS` fixture (lines 8-11):

```tsx
const LEVELS: GradeLevel[] = [
  { ord: 1, code: "IC1", name: "Trainee", exp: "0–6 мес", autonomy: "Менторство", scope: "Учеба", mgr: false, band_shape: { low: 0.62, mid: 0.79, high: 0.98 }, band_low: null, band_mid: null, band_high: null },
  { ord: 5, code: "IC5", name: "Senior", exp: "5+ лет", autonomy: "Архитектура", scope: "Сервис", mgr: true, band_shape: { low: 0.30, mid: 0.39, high: 0.49 }, band_low: null, band_mid: null, band_high: null },
];
```

In `web/components/__tests__/FrameworkEditor.test.tsx`, replace the mocked framework data (lines 12-18) so it matches the new shape and exposes `useUpdateBands`:

```tsx
    useGradesFramework: () => ({
      isLoading: false, isError: false,
      data: {
        levels: [{ ord: 1, code: "IC1", name: "Junior", exp: "", autonomy: "", scope: "", mgr: false, band_shape: { low: 0.33, mid: 0.66, high: 1 }, band_low: 1, band_mid: 2, band_high: 3 }],
        disciplines: [{ id: "d1", key: "backend", label: "Backend", icon: "fields", description: "", ord: 0, blocks: [] }],
        tax_rate: 0.1,
      },
    }),
    useUpdateLevels: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePutDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateBands: () => ({ mutateAsync: vi.fn(), isPending: false }),
```

Also update both `<GradesClient canEdit={...} />` renders in that file (lines 128, 130-131, 135) to add `canEditBands={false}` (Task 5 makes it required):

```tsx
    const { rerender } = render(<GradesClient canEdit={false} canEditBands={false} />);
    // ...
    rerender(<GradesClient canEdit={true} canEditBands={false} />);
    // ...
    render(<GradesClient canEdit={true} canEditBands={false} />);
```

- [ ] **Step 9: Run — expect PASS + typecheck**

Run: `cd web && npm test -- SalaryBands GradeViews FrameworkEditor` → PASS.
Run: `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 10: Commit**

```bash
git add web/lib/api/schema.d.ts web/lib/format.ts web/lib/query/grades.ts web/components/grades/GradeBands.tsx web/components/grades/GradesClient.tsx web/components/__tests__/
git commit -m "feat(web): exact tenge band view (gross + net) gated by EditSalaryBands (slice #5b-ii)"
```

---

## Task 5: BandsEditor + bands-edit mode

**Files:**
- Modify: `web/components/grades/editorTypes.ts`
- Create: `web/components/grades/BandsEditor.tsx`
- Modify: `web/components/grades/GradesClient.tsx`
- Modify: `web/app/(app)/grades/page.tsx`
- Modify: `web/components/__tests__/SalaryBands.test.tsx`, `web/components/__tests__/FrameworkEditor.test.tsx`

- [ ] **Step 1: Draft types**

In `web/components/grades/editorTypes.ts`, append:

```ts
export type DraftBand = { ord: number; code: string; name: string; band_low: number; band_mid: number; band_high: number };
export type BandsDraft = { taxPct: number; levels: DraftBand[] };

/** True when every band satisfies 0 < low ≤ mid ≤ high and the rate is 0..99. */
export function bandsDraftValid(d: BandsDraft): boolean {
  const rateOk = Number.isFinite(d.taxPct) && d.taxPct >= 0 && d.taxPct <= 99;
  const bandsOk = d.levels.every(
    (l) => [l.band_low, l.band_mid, l.band_high].every(Number.isFinite)
      && l.band_low > 0 && l.band_low <= l.band_mid && l.band_mid <= l.band_high,
  );
  return rateOk && bandsOk;
}
```

- [ ] **Step 2: BandsEditor unit tests (write first)**

Append to `web/components/__tests__/SalaryBands.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";
import { BandsEditor } from "../grades/BandsEditor";
import type { DraftBand } from "../grades/editorTypes";

const BANDS: DraftBand[] = [
  { ord: 1, code: "IC1", name: "Trainee", band_low: 300000, band_mid: 380000, band_high: 470000 },
];

describe("BandsEditor", () => {
  it("edits a band field and fires the setter", () => {
    const onBand = vi.fn();
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={onBand} onTax={() => {}} />);
    fireEvent.change(screen.getByLabelText("IC1 медиана"), { target: { value: "400000" } });
    expect(onBand).toHaveBeenCalledWith(1, { band_mid: 400000 });
  });

  it("edits the tax rate", () => {
    const onTax = vi.fn();
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={() => {}} onTax={onTax} />);
    fireEvent.change(screen.getByLabelText("Ставка ИПН, %"), { target: { value: "12" } });
    expect(onTax).toHaveBeenCalledWith(12);
  });

  it("shows a live net figure (gross × (1 − rate))", () => {
    render(<BandsEditor levels={BANDS} taxPct={10} onBand={() => {}} onTax={() => {}} />);
    // net mid = round(380000 × 0.9) = 342 000
    expect(screen.getByText(/342\s000/)).toBeInTheDocument();
  });
});
```

Note: `vi` is already imported at the top of the file via the earlier `describe` blocks — add `import { vi } from "vitest";` at the top if not present.

- [ ] **Step 3: Run — expect FAIL**

Run: `cd web && npm test -- SalaryBands`
Expected: FAIL (no `BandsEditor`).

- [ ] **Step 4: Implement BandsEditor**

Create `web/components/grades/BandsEditor.tsx`:

```tsx
"use client";
import { formatTenge } from "@/lib/format";
import type { DraftBand } from "./editorTypes";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/\s/g, "")));

export function BandsEditor({
  levels, taxPct, onBand, onTax,
}: {
  levels: DraftBand[];
  taxPct: number;
  onBand: (ord: number, patch: Partial<DraftBand>) => void;
  onTax: (pct: number) => void;
}) {
  const rate = Number.isFinite(taxPct) ? taxPct / 100 : 0;
  const cell = "w-[120px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand";
  const inputs: [keyof DraftBand, string][] = [
    ["band_low", "мин."], ["band_mid", "медиана"], ["band_high", "макс."],
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <label htmlFor="tax" className="text-[13px] font-medium text-ink">Ставка ИПН, %</label>
        <input
          id="tax" aria-label="Ставка ИПН, %" inputMode="decimal" value={String(taxPct)}
          onChange={(e) => onTax(num(e.target.value))}
          className="w-[80px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand"
        />
        <span className="text-[12px] text-ink-3">«На руки» считается как оклад × (1 − ставка).</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div className="grid items-center gap-3 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: "150px repeat(3, 120px) 1fr" }}>
          <div>Грейд</div><div className="text-right">Мин.</div><div className="text-right">Медиана</div>
          <div className="text-right">Макс.</div><div className="text-right">На руки (медиана)</div>
        </div>
        {levels.map((l) => {
          const netMid = Number.isFinite(l.band_mid) ? Math.round(l.band_mid * (1 - rate)) : 0;
          return (
            <div key={l.ord} className="grid items-center gap-3 border-t border-line-2 px-[18px] py-3"
              style={{ gridTemplateColumns: "150px repeat(3, 120px) 1fr" }}>
              <div className="text-[13px] font-semibold text-ink">{l.code} · {l.name}</div>
              {inputs.map(([field, label]) => (
                <input
                  key={field} aria-label={`${l.code} ${label}`} inputMode="numeric"
                  value={Number.isFinite(l[field] as number) ? String(l[field]) : ""}
                  onChange={(e) => onBand(l.ord, { [field]: num(e.target.value) } as Partial<DraftBand>)}
                  className={cell}
                />
              ))}
              <div className="text-right text-[12.5px] tabular text-ink-2">{formatTenge(netMid)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd web && npm test -- SalaryBands`
Expected: PASS.

- [ ] **Step 6: Wire bands-edit mode into GradesClient**

In `web/components/grades/GradesClient.tsx`:

Extend the imports (lines 6-17): add `useUpdateBands` to the query import, add `BandsEditor`, and add `BandsDraft`, `DraftBand`, `bandsDraftValid` to the editorTypes import:

```tsx
import {
  useGradesFramework, useUpdateLevels, usePutDiscipline, useCreateDiscipline, useUpdateBands,
  type Discipline, type PutDiscipline as PutDisciplineBody,
} from "@/lib/query/grades";
```
```tsx
import { BandsEditor } from "./BandsEditor";
import { emptyCells, bandsDraftValid, type Draft, type DraftBlock, type DraftLevel, type BandsDraft, type DraftBand } from "./editorTypes";
```

Change the component signature (line 41) and add the bands hook + state:

```tsx
export function GradesClient({ canEdit, canEditBands }: { canEdit: boolean; canEditBands: boolean }) {
  const fw = useGradesFramework();
  const updateLevels = useUpdateLevels();
  const putDiscipline = usePutDiscipline();
  const createDiscipline = useCreateDiscipline();
  const updateBands = useUpdateBands();

  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bandsDraft, setBandsDraft] = useState<BandsDraft | null>(null);
  const [openCell, setOpenCell] = useState<{ blockIdx: number; levelOrd: number } | null>(null);
  const [newDisc, setNewDisc] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

After `const editing = draft !== null;` (line 69) add:

```tsx
  const editingBands = bandsDraft !== null;
```

After `cancelEdit` (line 82) add the bands enter/cancel/save:

```tsx
  const enterBandsEdit = () => {
    setBandsDraft({
      taxPct: Math.round((fw.data!.tax_rate ?? 0) * 100),
      levels: sortedLevels.map((l): DraftBand => ({
        ord: l.ord, code: l.code, name: l.name,
        band_low: l.band_low ?? 0, band_mid: l.band_mid ?? 0, band_high: l.band_high ?? 0,
      })),
    });
    setTab("bands");
    setError(null);
  };
  const cancelBandsEdit = () => { setBandsDraft(null); setError(null); };
  const setBand = (ord: number, patch: Partial<DraftBand>) =>
    setBandsDraft((d) => (d ? { ...d, levels: d.levels.map((l) => (l.ord === ord ? { ...l, ...patch } : l)) } : d));
  const setTax = (pct: number) => setBandsDraft((d) => (d ? { ...d, taxPct: pct } : d));
  const saveBands = async () => {
    if (!bandsDraft) return;
    setError(null);
    try {
      await updateBands.mutateAsync({
        tax_rate: bandsDraft.taxPct / 100,
        levels: bandsDraft.levels.map((l) => ({
          ord: l.ord, band_low: l.band_low, band_mid: l.band_mid, band_high: l.band_high,
        })),
      });
      setBandsDraft(null);
    } catch {
      setError("Не удалось сохранить вилки. Проверьте значения и попробуйте ещё раз.");
    }
  };
  const bandsBusy = updateBands.isPending;
  const bandsValid = bandsDraft ? bandsDraftValid(bandsDraft) : false;
```

Update the «режим редактирования» badge (line 144) to also cover bands:

```tsx
            {editing && <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">режим редактирования</span>}
            {editingBands && <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">редактирование вилок</span>}
```

Replace the top-right action block (lines 148-167) with:

```tsx
        <div className="flex shrink-0 gap-2">
          {!editing && !editingBands && canEdit && (
            <button type="button" onClick={enterEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              <Pencil size={14} /> Редактировать
            </button>
          )}
          {!editing && !editingBands && tab === "bands" && canEditBands && (
            <button type="button" onClick={enterBandsEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              <Pencil size={14} /> Редактировать вилки
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
          {editingBands && (
            <>
              <button type="button" onClick={cancelBandsEdit} disabled={bandsBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">
                <X size={14} /> Отмена
              </button>
              <button type="button" onClick={saveBands} disabled={bandsBusy || !bandsValid}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
                <Check size={14} /> Сохранить
              </button>
            </>
          )}
        </div>
```

Update the `SegControl` block (lines 233-240) so the tab locks to «Вилки» during bands-edit:

```tsx
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <SegControl
          options={editing
            ? [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }]
            : [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={editingBands ? "bands" : tab === "bands" && editing ? "matrix" : tab}
          onChange={(v) => { if (!editingBands) setTab(v as Tab); }} />
      </div>
```

Replace the content render (lines 242-257) so bands-edit shows the editor:

```tsx
      {editing && draft ? (
        tab === "levels" ? (
          <LevelsEditor levels={draft.levels} onChange={setLevel} />
        ) : (
          <MatrixEditor
            blocks={draft.blocks} levels={draft.levels}
            onRename={renameBlock} onMove={moveBlock} onDelete={deleteBlock} onAdd={addBlock}
            onOpenCell={(blockIdx, levelOrd) => setOpenCell({ blockIdx, levelOrd })} />
        )
      ) : editingBands && bandsDraft ? (
        <BandsEditor levels={bandsDraft.levels} taxPct={bandsDraft.taxPct} onBand={setBand} onTax={setTax} />
      ) : tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} taxRate={fw.data!.tax_rate} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}
```

- [ ] **Step 7: Pass `canEditBands` from the server component**

Replace `web/app/(app)/grades/page.tsx`:

```tsx
import { getSessionUser, hasPermission } from "@/lib/auth";
import { GradesClient } from "@/components/grades/GradesClient";

export default async function GradesPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  return (
    <GradesClient
      canEdit={user ? hasPermission(user, "edit_framework") : false}
      canEditBands={user ? hasPermission(user, "edit_salary_bands") : false}
    />
  );
}
```

- [ ] **Step 8: Gating test for «Редактировать вилки»**

Append to `web/components/__tests__/SalaryBands.test.tsx` a GradesClient block (reuse the same `vi.mock` the FrameworkEditor test uses — declare it at the top of this file):

At the very top of `SalaryBands.test.tsx`, add the mock (below the imports):

```tsx
vi.mock("@/lib/query/grades", async (orig) => {
  const actual = await orig<typeof import("@/lib/query/grades")>();
  return {
    ...actual,
    useGradesFramework: () => ({
      isLoading: false, isError: false,
      data: {
        levels: [{ ord: 1, code: "IC1", name: "Junior", exp: "", autonomy: "", scope: "", mgr: false, band_shape: { low: 0.33, mid: 0.66, high: 1 }, band_low: 300000, band_mid: 380000, band_high: 470000 }],
        disciplines: [{ id: "d1", key: "backend", label: "Backend", icon: "fields", description: "", ord: 0, blocks: [] }],
        tax_rate: 0.1,
      },
    }),
    useUpdateLevels: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePutDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateBands: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
```

Then add the test block:

```tsx
import { GradesClient } from "../grades/GradesClient";

describe("GradesClient bands gating", () => {
  it("shows «Редактировать вилки» only on the Вилки tab when canEditBands", () => {
    render(<GradesClient canEdit={false} canEditBands={true} />);
    // default tab is «Матрица» → button hidden
    expect(screen.queryByRole("button", { name: "Редактировать вилки" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вилки" }));
    expect(screen.getByRole("button", { name: "Редактировать вилки" })).toBeInTheDocument();
  });

  it("hides «Редактировать вилки» without canEditBands", () => {
    render(<GradesClient canEdit={false} canEditBands={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Вилки" }));
    expect(screen.queryByRole("button", { name: "Редактировать вилки" })).not.toBeInTheDocument();
  });
});
```

Because this file now `vi.mock`s the grades module, the earlier `GradeBands`/`BandsEditor`/`formatTenge` tests must NOT rely on the real hooks — they render components directly, so they are unaffected. Keep `import { GradeBands } from "../grades/GradeBands";` etc. as-is; the mock only stubs hooks.

- [ ] **Step 9: Run — expect PASS + typecheck**

Run: `cd web && npm test -- SalaryBands FrameworkEditor GradeViews` → PASS.
Run: `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 10: Commit**

```bash
git add web/components/grades/editorTypes.ts web/components/grades/BandsEditor.tsx web/components/grades/GradesClient.tsx "web/app/(app)/grades/page.tsx" web/components/__tests__/SalaryBands.test.tsx
git commit -m "feat(web): HR bands editor with tax rate on the Вилки tab (slice #5b-ii)"
```

---

## Task 6: e2e — HR edits bands, lead sees neither

**Files:**
- Create: `web/e2e/grades-bands.spec.ts`

> **Orchestrator note:** the dev API (new build) + web must be running against a **freshly seeded** DB before this runs.

- [ ] **Step 1: Write the spec**

Create `web/e2e/grades-bands.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Корпоративная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("lead sees masked bands and no bands-edit button", async ({ page }) => {
  await login(page, "e.glebov@beeteam.io");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText("Вид лида: полосы без точных окладов")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Редактировать вилки" })).toHaveCount(0);
  await expect(page.getByText(/₸/)).toHaveCount(0);
});

test("HR edits a band and the tax rate, then restores them", async ({ page }) => {
  await login(page, "o.klimova@beeteam.io");
  await expect(page).toHaveURL(/\/approvals/, { timeout: 20_000 });
  await page.goto("/grades");
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText("Точные оклады")).toBeVisible({ timeout: 10_000 });

  // Enter edit, change IC1 median to a distinctive value + rate to 12%.
  await page.getByRole("button", { name: "Редактировать вилки" }).click();
  await expect(page.getByText("редактирование вилок")).toBeVisible();
  await page.getByLabel("IC1 медиана").fill("381000");
  await page.getByLabel("Ставка ИПН, %").fill("12");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("редактирование вилок")).toHaveCount(0, { timeout: 10_000 });

  // Reload → the change persisted (381 000 appears, ИПН 12%).
  await page.reload();
  await page.getByRole("button", { name: "Вилки" }).click();
  await expect(page.getByText(/381\s000/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/ИПН 12%/)).toBeVisible();

  // Restore original IC1 median (380 000) + rate (10%) so other specs' state is unchanged.
  await page.getByRole("button", { name: "Редактировать вилки" }).click();
  await page.getByLabel("IC1 медиана").fill("380000");
  await page.getByLabel("Ставка ИПН, %").fill("10");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("редактирование вилок")).toHaveCount(0, { timeout: 10_000 });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `cd web && npm run test:e2e -- grades-bands`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/grades-bands.spec.ts
git commit -m "test(e2e): HR salary-band editing; lead sees masked bands (slice #5b-ii)"
```

---

## Task 7: Full verification + local review

**Files:** none (verification only).

- [ ] **Step 1: Re-seed the dev DB** (seed changed in Task 1)

```bash
docker compose exec -T postgres psql -U beeteam -d beeteam -c "TRUNCATE workspaces CASCADE"
```
Then restart the dev API (`cargo run -p bt-api`) so the seed re-runs with the new gross bands + `salary_tax_rate` default.

- [ ] **Step 2: Full backend suite**

Run: `bash api/scripts/test.sh -p bt-db` → PASS.
Run: `bash api/scripts/test.sh -p bt-api` → PASS.
Run: `cargo test -p bt-domain` → PASS.

- [ ] **Step 3: Full web suite + typecheck + lint**

Run: `cd web && npm test` → PASS.
Run: `cd web && npx tsc --noEmit` → no errors.
Run: `cd web && npm run lint` → clean.

- [ ] **Step 4: Full e2e**

Run: `cd web && npm run test:e2e` → all specs PASS (bands spec restores its state, so shared specs are unaffected).

- [ ] **Step 5: Local visual review**

Bring the app up (API :8080, web :3000) on the fresh seed. As HR (o.klimova@beeteam.io) open `/grades` → «Вилки»: confirm exact ₸ (gross + net), «ИПН 10%», the editor round-trips a change; as lead (e.glebov@beeteam.io): only bars + «Точные цифры — у HR-администратора». Then wait for the merge command.

---

## Self-Review

**1. Spec coverage**
- Migration `0009` (tax rate + CHECK) → Task 1. ✓
- Gross-tenge re-seed → Task 1. ✓
- Server-side masking (`band_shape` always; exact `band_*`+`tax_rate` gated) → Task 2. ✓
- `PATCH /grades/bands` (validation, tx, 403) → Task 3. ✓
- `formatTenge`, `useUpdateBands`, exact gross/net view → Task 4. ✓
- Bands-edit mode, `BandsEditor`, «Редактировать вилки», `page.tsx` `canEditBands` → Task 5. ✓
- Tests: bt-api masking/patch/forbidden (Tasks 2-3); web unit GradeBands/BandsEditor/formatTenge/gating (Tasks 4-5); e2e (Task 6). ✓
- Edge cases: 403 without permission (Task 3 test), EditFramework-without-EditSalaryBands stays masked (Task 2 `update_levels` uses EditSalaryBands), invalid band/rate 400 + Save-disabled (Tasks 3, 5), reseed (Task 7). ✓

**2. Placeholder scan** — none; every code step is complete.

**3. Type consistency** — `BandShape{low,mid,high}`, `GradeLevel.band_shape` + `band_low/mid/high: Option<f64>`, `GradesFramework.tax_rate: Option<f64>`, `UpdateBands{tax_rate, levels:[UpdateBand{ord,band_low,band_mid,band_high}]}` used identically across domain, handler, hook, and drafts. `levels_of(pool, workspace_id, show_bands)` updated at all three call sites (get_framework, update_levels, update_bands). Frontend `DraftBand`/`BandsDraft`/`bandsDraftValid` and `BandsEditor` props (`levels/taxPct/onBand/onTax`) match GradesClient wiring. `canEditBands` added to GradesClient and every render site (page.tsx, both test files). ✓
