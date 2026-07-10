# BeeTeam — Salary Bands (slice #5b-ii)

**Status:** Design approved
**Date:** 2026-07-10
**Depends on:** Grades Foundation (#1) — `grade_levels.band_low/mid/high`, `GET /v1/grades/framework`,
`GradeBands`/`GradesClient`; RBAC (#5a) — `Permission::EditSalaryBands`, `require_permission`,
`permissions` in the session, `hasPermission`, HR user Ольга Климова; Framework Editor (#5b-i) —
the `/grades` edit-mode pattern, `PATCH /v1/grades/levels` (the exact mirror for band writes).

## Goal

Turn the salary bands from abstract, uniform multipliers into **real gross salaries in tenge (₸)**,
visible in exact figures only to holders of `EditSalaryBands`, and editable by them — together with a
workspace-wide **income-tax rate** used to show the net («на руки») figure. Everyone else keeps the
relative bars (now server-normalized so no real number ever leaves the server). This is the **final
slice of BT_GRADES** (#1 → #5b-ii).

## Scope

**In:**
- Migration `0009`: `workspaces.salary_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0.10`;
  CHECK on `grade_levels` enforcing `band_low ≤ band_mid ≤ band_high AND band_low > 0`.
- Re-seed the 7 levels' bands with realistic KZ-IT **gross** ₸/month figures (monotonically rising).
- Server-side masking: `GET /v1/grades/framework` returns exact `band_*` + `tax_rate` **only** to
  callers with `EditSalaryBands`; everyone gets a normalized `band_shape` for the bars.
- `PATCH /v1/grades/bands` — bulk-edit the 7 bands + the tax rate under `EditSalaryBands`.
- `/grades` «Вилки» tab: exact ₸ columns (gross + net) for HR; a dedicated **bands-edit** mode
  (`BandsEditor`) gated by `EditSalaryBands`, independent of the framework-edit mode.
- `formatTenge` helper; `useUpdateBands()` hook.

**Out (deferred / YAGNI):**
- A specific employee's actual pay (`compa × band` in ₸): `compa` stays a stored snapshot, untouched.
- Multi-currency; multiple taxes (ОПВ/ВОСМС) — a single ИПН-style rate only.
- Per-discipline bands — bands stay workspace-global (one IC1–IC7 ladder per workspace).
- Editing the IC1–IC7 ladder itself (fixed since #1); `code/ord/mgr` and the text columns are never
  written here (those belong to `PATCH /levels` under `EditFramework`).

## Decisions (locked)

1. **Absolute tenge, stored gross** (user choice): `band_low/mid/high` are real ₸/month **before**
   tax. Net («на руки») = `gross × (1 − tax_rate)`, computed for display only, never stored.
2. **One workspace-wide tax rate** (user choice): `workspaces.salary_tax_rate`, default `0.10` (ИПН
   10%), editable by HR in the same «Сохранить» as the bands.
3. **Server-side masking** (user choice): exact `band_*` and `tax_rate` are gated by `EditSalaryBands`
   at the endpoint. The bars are driven by a normalized `band_shape` sent to everyone, so no real
   figure reaches an unprivileged client even via the network. Gating is by `EditSalaryBands` **only**
   — `EditFramework` does not unlock salary figures.
4. **Bands-edit is its own mode**, separate from the #5b-i framework-edit mode, entered from the
   «Вилки» tab and gated by `EditSalaryBands`. The two modes are mutually exclusive via tab visibility
   (Вилки is already hidden during framework-edit).
5. **Validation in the app** (400) + a **DB CHECK** as defense-in-depth: `band_low ≤ band_mid ≤
   band_high`, `band_low > 0`, `tax_rate ∈ [0, 0.99]`. The old multiplier seed (0.73 ≤ 1.0 ≤ 1.27)
   also satisfies the CHECK, so the migration is safe against pre-existing data.
6. **Last-write-wins** (single HR-admin per workspace); no row locking. Mirrors #5b-i.
7. **Re-seed required** after the seed change (per project convention: TRUNCATE workspaces CASCADE,
   restart the API).

## Data model

Migration `0009_salary_bands.sql`:

```sql
ALTER TABLE workspaces
  ADD COLUMN salary_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0.10;

ALTER TABLE grade_levels
  ADD CONSTRAINT band_order
  CHECK (band_low <= band_mid AND band_mid <= band_high AND band_low > 0);
```

`grade_levels` columns are unchanged (already `DOUBLE PRECISION NOT NULL`); only the seeded **values**
change. `salary_tax_rate` is per workspace, one row, `[0, 0.99]`.

**Seed** (`bt-db/src/seed.rs`, the `levels` array — gross ₸/month, low/mid/high):

| Code | Name | low | mid | high |
|------|------|----:|----:|-----:|
| IC1 | Trainee | 300 000 | 380 000 | 470 000 |
| IC2 | Junior | 450 000 | 560 000 | 700 000 |
| IC3 | Middle | 680 000 | 850 000 | 1 080 000 |
| IC4 | Middle+ | 1 000 000 | 1 250 000 | 1 550 000 |
| IC5 | Senior | 1 400 000 | 1 800 000 | 2 250 000 |
| IC6 | Staff / Tech Lead | 2 000 000 | 2 550 000 | 3 200 000 |
| IC7 | Principal | 2 900 000 | 3 700 000 | 4 600 000 |

Text/`mgr` columns keep their current seed values. `salary_tax_rate` relies on the `0.10` default.
Global max `band_high` = 4 600 000 (IC7) → normalizes `band_shape` to `1.0` at the top.

## API

Both reads/writes scope to the caller's workspace via `workspace_of`. `GET` stays open to all
authenticated users but masks the figures.

**DTOs (bt-domain):**

```rust
// new — normalized bar geometry, always sent (0..1, low/mid/high ÷ global max band_high)
pub struct BandShape { pub low: f64, pub mid: f64, pub high: f64 }   // Serialize + ToSchema

// changed — exact bands become nullable (present only with EditSalaryBands)
pub struct GradeLevel {
    pub ord, code, name, exp, autonomy, scope, mgr,  // unchanged
    pub band_shape: BandShape,        // always
    pub band_low:  Option<f64>,       // Some only with EditSalaryBands
    pub band_mid:  Option<f64>,
    pub band_high: Option<f64>,
}

// changed — carries the (gated) workspace tax rate
pub struct GradesFramework {
    pub levels: Vec<GradeLevel>,
    pub disciplines: Vec<Discipline>,
    pub tax_rate: Option<f64>,        // Some only with EditSalaryBands
}

// new — the band-edit payload
pub struct UpdateBand  { pub ord: i32, pub band_low: f64, pub band_mid: f64, pub band_high: f64 }
pub struct UpdateBands { pub tax_rate: f64, pub levels: Vec<UpdateBand> }  // Deserialize + ToSchema
```

`levels_of(pool, workspace_id, show_bands: bool)` — one query as today; computes `global_max =
max(band_high)`, fills `band_shape` for every row, and sets `band_low/mid/high` to `Some(..)` when
`show_bands` else `None`. `get_framework` and `update_levels` both call it with
`has_permission(&auth, EditSalaryBands)` (a new non-throwing bool helper alongside the existing
`require_permission`). `update_levels`'s returned ladder is thus masked unless the caller **also**
holds `EditSalaryBands`.

```
GET /v1/grades/framework                       (unchanged path; behavior extended)
  show = has_permission(auth, EditSalaryBands)
  levels    = levels_of(.., show)              // band_shape always; band_* Some iff show
  tax_rate  = show ? Some(SELECT salary_tax_rate FROM workspaces WHERE id = ws) : None
  200 → GradesFramework

PATCH /v1/grades/bands
  require_permission(auth, EditSalaryBands)     → 403
  body: UpdateBands { tax_rate, levels: [{ ord, band_low, band_mid, band_high }] }
  400 unless every level has band_low ≤ band_mid ≤ band_high AND band_low > 0,
      and tax_rate ∈ [0, 0.99].
  One transaction:
    UPDATE grade_levels SET band_low/mid/high WHERE ord = $ AND workspace_id = $   (per level;
      never touches name/exp/autonomy/scope/code/mgr — the mirror of PATCH /levels)
    UPDATE workspaces SET salary_tax_rate = $ WHERE id = $
  Ignores rows with an unknown ord.
  200 → GradeLevel[]   (the refreshed ladder, exact — caller holds the permission)
```

Register `UpdateBands`, `UpdateBand`, `BandShape` + the new path in `openapi.rs`; regenerate web
types (`web/lib/api/schema.d.ts`) so `band_*` become `number | null`, `band_shape` appears, and
`GradesFramework.tax_rate` becomes `number | null`.

## Frontend

**Permission to the client.** `web/app/(app)/grades/page.tsx` also passes
`canEditBands={hasPermission(user, "edit_salary_bands")}` to `GradesClient` (alongside the existing
`canEdit` for framework editing).

**View — `GradeBands.tsx`:**
- Bars come from `band_shape` (for everyone) — `left = shape.low*100`, `width = (shape.high−shape.low)*100`,
  mid marker at `shape.mid*100`. Spread `±{round((shape.high−shape.low)/(2·shape.mid)·100)}%`
  (scale-invariant — the same value the client computed before).
- If `band_low != null` (HR): add two right-aligned figures per level — **оклад (gross)** as the
  range `formatTenge(band_low) – formatTenge(band_high)`, and **на руки (net)** as
  `formatTenge(round(band_low·(1−tax_rate))) – formatTenge(round(band_high·(1−tax_rate)))`;
  header shows «ИПН {round(tax_rate·100)}%» (matches the approved preview).
- The lead callout stays verbatim: «Вид лида: полосы без точных окладов. Вилки общие для всех
  дисциплин на одном грейде. Точные цифры — у HR-администратора.»

**Edit — bands-edit mode in `GradesClient` + new `BandsEditor.tsx`:**
- On the «Вилки» tab, a «Редактировать вилки» button renders only when `canEditBands`. Clicking it
  enters `editingBands` (a state distinct from the #5b-i `editing`), snapshotting the 7 levels' exact
  bands + `tax_rate` into a draft.
- `BandsEditor`: a row per level with three ₸ inputs (`band_low/mid/high`, gross) + one workspace
  **tax-rate** input entered as a **percent** (0–99, shown as `%`, converted to a fraction on save).
  A live **net** preview per level (`gross·(1−rate)`) updates as inputs change. «Отмена» discards;
  «Сохранить» → `PATCH /v1/grades/bands`, then exit and invalidate `["grades-framework"]`.
- «Сохранить» is disabled while any field is empty/NaN, any level violates `low ≤ mid ≤ high` /
  `low > 0`, or the rate is outside 0–99; an inline hint names the offending row. The 400 is a
  server-side backstop, surfaced as a generic banner.

**Helpers / hooks:**
- `formatTenge(n)` → `n.toLocaleString("ru-RU")` + ` ₸` (space thousands separator, e.g. `1 300 000 ₸`).
- `useUpdateBands()` in `web/lib/query/grades.ts` — `PATCH /v1/grades/bands`, invalidates
  `["grades-framework"]`. Russian microcopy from the prototype; amber on the `brand` token.

## Edge cases

- No `EditSalaryBands` → `band_*`/`tax_rate` are `null`; the tab shows only bars + spread; no
  «Редактировать вилки»; a direct `PATCH /bands` → 403.
- `EditFramework` **without** `EditSalaryBands` → framework editing works but salary figures stay
  masked (gating is by `EditSalaryBands` only).
- Inverted band (`low > mid` or `mid > high`), non-positive `low`, or `tax_rate` ∉ [0, 0.99] →
  Save disabled client-side; a crafted request → 400; the DB CHECK is the last line.
- `tax_rate = 0` → net equals gross (allowed). Rate shown «ИПН 0%».
- Unknown `ord` in the payload is ignored (no insert of phantom levels).
- «Отмена» discards the whole bands draft.
- Concurrent edits by two HR admins → last-write-wins (acceptable; one HR-admin per workspace).

## Testing

- **bt-api** (`routes/grades.rs mod tests`, existing patterns):
  - `framework_masks_bands_without_permission`: a lead → `band_low/mid/high` are `None`, `band_shape`
    is present, `tax_rate` is `None`.
  - `framework_shows_bands_with_permission`: HR Ольга → `band_*` `Some`, `tax_rate` `Some(0.10)`;
    top level's `band_shape.high == 1.0`.
  - `patch_bands_updates_numbers_and_tax`: HR edits one level's bands + `tax_rate`; both persist;
    that level's `name/exp` are untouched.
  - `patch_bands_rejects_invalid`: inverted band → 400; `tax_rate = 1.5` → 400.
  - `patch_bands_forbidden_for_lead`: lead → 403.
- **web unit** (Vitest):
  - `GradeBands`: with `band_low = null` → bars + spread, no ₸ text; with exact bands + `tax_rate`
    → gross range + net range, `net_low == round(band_low·(1−rate))`,
    `net_high == round(band_high·(1−rate))`, «ИПН N%» header.
  - `BandsEditor`: editing an input fires the setter; the net preview updates; Save disabled on an
    inverted band / empty field / bad rate.
  - `formatTenge`: `1300000 → "1 300 000 ₸"`.
  - `GradesClient`: «Редактировать вилки» shown only when `canEditBands`.
- **e2e `grades-bands.spec.ts`** (HR Ольга): open `/grades` → «Вилки» → sees exact ₸ + «ИПН 10%» →
  «Редактировать вилки» → change one band and the rate → «Сохранить» → reload → the change persists;
  **then restore the original band + rate** so the shared workspace state is unchanged for other
  specs in the same un-reseeded run. Plus a lead check: on «Вилки» there is no «Редактировать вилки»
  and no exact ₸ (bars only).

## Closes BT_GRADES

With #5b-ii merged, the grade subsystem is complete end-to-end: framework (#1), member grade &
evidence (#2–#3), performance review (#4), RBAC + HR approval (#5a), framework editor (#5b-i), and
salary bands (#5b-ii).
