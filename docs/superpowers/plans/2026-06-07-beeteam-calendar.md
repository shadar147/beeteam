# BeeTeam CalendarScreen Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `/calendar` screen — month / week / list views of the lead's whole team's meetings for a date range, plus sidebar widgets — backed by one new range endpoint, with meeting clicks opening the existing MeetingDrawer.

**Architecture:** One new lead-scoped endpoint `GET /v1/teams/:id/calendar?from&to` returns `CalendarMeeting[]` (with member name + hue). Frontend: a `CalendarClient` owns view/anchor/status, computes the range, loads `useTeamCalendar`, and renders `CalendarMonth`/`CalendarWeek`/`CalendarList` + `CalendarSidebar`. The Sidebar «Календарь» entry is enabled and made route-aware. No schema changes.

**Tech Stack:** Rust (axum, sqlx, utoipa), Postgres; Next.js 14 App Router, TypeScript, TanStack Query, Tailwind tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-07-beeteam-calendar-design.md`

---

## Conventions (read once)

- Backend: handler lives in `api/crates/bt-api/src/routes/teams.rs` (alongside `list_members`/`team_stats` + `require_team_access`); DTO in `bt-domain/src/lib.rs`; route registered in `app.rs`; OpenAPI in `openapi.rs`. Use runtime `sqlx::query_as::<_,(tuple)>` + `.map(|r| Dto{..})` (see `list_members`). `axum::extract::Query` is already used in teams.rs.
- Backend tests: teams.rs has a `#[cfg(test)] mod tests` with `seed_team(&pool) -> (token, team_id)` (seeds a lead + team + members «Алиса»/«Борис», NO meetings), `login_token`, and request helpers (`get_members`/`get_stats`) driving `app(pool).oneshot(...)`. Reuse `seed_team`/`login_token`; add a `get_calendar` helper + a `seed_meeting_for` helper. Run `api/scripts/test.sh -p bt-api`.
- Frontend: components in `web/components/` (calendar ones under `web/components/calendar/`); route `web/app/(app)/calendar/page.tsx`; hooks `web/lib/query/*.ts`; openapi-fetch client `web/lib/api/client.ts`; generated types `web/lib/api/schema.d.ts` via `pnpm gen:api` (API on :8080). Tokens: `bg-brand`/`brand-text` (NEVER `accent`), `bg-bg-elev`, `bg-bg-tint`/`bg-bg-sunken`, `border-line`/`border-line-2`/`border-line-strong`, `text-ink/ink-2/ink-3`, `bg-info-soft`/`text-info`, `bg-ok-soft`/`text-ok`, `bg-miss-soft`/`text-miss`, `bg-brand-soft`, `ring-brand`, `tabular`. `cn()` from `@/lib/utils`. Reuse `Avatar` (`{name, hue, size}`), `Pill` (`{variant, dot, children}`), `SegControl` (`{options:{value,label}[], value, onChange}`), `useDrawerStore` (`open(id)`).
- Meeting click → `useDrawerStore.open(id)`; the `<MeetingDrawerHost/>` is already mounted in `(app)/layout.tsx`.
- Dev DB on host port 5442; API on :8080 (restart before `gen:api`). The seed creates meetings with relative-to-now dates, so the current month shows data.
- Reference the existing `web/components/MonthCalendar.tsx` for the Monday-based 42-cell grid math (`lead = (first.getDay()+6)%7`, `sameDay`), but the calendar month view is a NEW multi-meeting component.

---

## File Structure

**Backend:**
- Modify `api/crates/bt-domain/src/lib.rs` — `CalendarMeeting` DTO.
- Modify `api/crates/bt-api/src/routes/teams.rs` — `CalendarRange` query struct + `team_calendar` handler + tests.
- Modify `api/crates/bt-api/src/app.rs`, `openapi.rs`.

**Frontend:**
- Create `web/lib/calendar.ts` — RU constants, range helpers, `shortName`, `STATE_META`, `sameDay`.
- Create `web/lib/query/calendar.ts` — `useTeamCalendar`.
- Create `web/components/calendar/CalendarMonth.tsx`, `CalendarWeek.tsx`, `CalendarList.tsx`, `CalendarSidebar.tsx`, `CalendarClient.tsx`.
- Create `web/app/(app)/calendar/page.tsx`.
- Modify `web/components/Sidebar.tsx` + `web/components/NavItem.tsx` (enable «Календарь», route-aware active).
- Tests in `web/components/__tests__/` + `web/lib/__tests__/calendar.test.ts` + `web/e2e/calendar.spec.ts`.

---

# Phase A — Backend

### Task 1: `CalendarMeeting` DTO + `GET /v1/teams/:id/calendar`

**Files:**
- Modify: `api/crates/bt-domain/src/lib.rs`, `api/crates/bt-api/src/routes/teams.rs`, `api/crates/bt-api/src/app.rs`

- [ ] **Step 1: Add the DTO to `bt-domain/src/lib.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CalendarMeeting {
    pub id: uuid::Uuid,
    pub member_id: uuid::Uuid,
    pub member_name: String,
    pub hue: i32,
    pub date: chrono::DateTime<chrono::Utc>,
    pub state: String,
    pub duration_min: i32,
}
```

- [ ] **Step 2: Build the domain crate**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-domain`
Expected: clean.

- [ ] **Step 3: Add the query struct + handler to `routes/teams.rs`**

Confirm the imports at the top of teams.rs include `axum::extract::Query`, `axum::Json`, `bt_domain::*` (or add `use bt_domain::CalendarMeeting;`). Add:

```rust
#[derive(Debug, serde::Deserialize)]
pub struct CalendarRange {
    pub from: String,
    pub to: String,
}

#[utoipa::path(
    get,
    path = "/v1/teams/{id}/calendar",
    params(
        ("id" = uuid::Uuid, Path, description = "Team id"),
        ("from" = String, Query, description = "RFC3339 start (inclusive)"),
        ("to" = String, Query, description = "RFC3339 end (exclusive)"),
    ),
    responses(
        (status = 200, description = "Team meetings in range", body = [CalendarMeeting]),
        (status = 400, description = "Invalid from/to"),
        (status = 403, description = "Not the team's lead"),
    )
)]
pub async fn team_calendar(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
    Path(team_id): Path<Uuid>,
    Query(range): Query<CalendarRange>,
) -> AppResult<Json<Vec<CalendarMeeting>>> {
    require_team_access(&auth, team_id, &state.pool).await?;

    let from = chrono::DateTime::parse_from_rfc3339(&range.from)
        .map_err(|_| AppError::BadRequest("invalid 'from'".into()))?
        .with_timezone(&chrono::Utc);
    let to = chrono::DateTime::parse_from_rfc3339(&range.to)
        .map_err(|_| AppError::BadRequest("invalid 'to'".into()))?
        .with_timezone(&chrono::Utc);

    let rows: Vec<CalendarMeeting> = sqlx::query_as::<_, (
        uuid::Uuid, uuid::Uuid, String, i32, chrono::DateTime<chrono::Utc>, String, i32,
    )>(
        "SELECT m.id, m.member_id, tm.name, tm.hue, m.date, m.state::text, m.duration_min \
         FROM meetings m JOIN team_members tm ON tm.id = m.member_id \
         WHERE tm.team_id = $1 AND m.date >= $2 AND m.date < $3 \
         ORDER BY m.date",
    )
    .bind(team_id).bind(from).bind(to)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| CalendarMeeting {
        id: r.0, member_id: r.1, member_name: r.2, hue: r.3, date: r.4, state: r.5, duration_min: r.6,
    })
    .collect();

    Ok(Json(rows))
}
```

Confirm `AppError`, `AppResult`, `AuthUser`, `AppState`, `State`, `Path`, `require_team_access` are already imported in teams.rs (they are — used by `list_members`). Add any missing (e.g. `use bt_domain::CalendarMeeting;`).

- [ ] **Step 4: Register the route**

In `api/crates/bt-api/src/app.rs` protected router, next to the other team routes:
```rust
        .route("/v1/teams/:id/calendar", get(routes::teams::team_calendar))
```

- [ ] **Step 5: Add tests to the teams.rs `mod tests`**

Add a `get_calendar` request helper and a meeting-seeding helper, then the tests. (Reuse the existing `seed_team`/`login_token`; `seed_team` seeds members «Алиса»/«Борис» with no meetings.)

```rust
    async fn get_calendar(pool: sqlx::PgPool, token: &str, team_id: uuid::Uuid, query: &str)
        -> (StatusCode, serde_json::Value)
    {
        let uri = format!("/v1/teams/{team_id}/calendar{query}");
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri(uri)
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    /// Insert a meeting for the first member of `team_id` at the given RFC3339 instant.
    async fn seed_meeting_at(pool: &sqlx::PgPool, team_id: uuid::Uuid, when_rfc3339: &str) {
        let m: (uuid::Uuid, uuid::Uuid) = sqlx::query_as(
            "SELECT tm.id, tm.workspace_id FROM team_members tm WHERE tm.team_id = $1 ORDER BY tm.name LIMIT 1",
        ).bind(team_id).fetch_one(pool).await.unwrap();
        let when = chrono::DateTime::parse_from_rfc3339(when_rfc3339).unwrap()
            .with_timezone(&chrono::Utc);
        sqlx::query(
            "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
             VALUES ($1, $2, $3, 'planned'::meeting_state, 45)",
        ).bind(m.1).bind(m.0).bind(when).execute(pool).await.unwrap();
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn calendar_returns_in_range_with_member(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        seed_meeting_at(&pool, team, "2026-06-15T10:00:00Z").await; // in range
        seed_meeting_at(&pool, team, "2026-08-01T10:00:00Z").await; // out of range
        let (status, json) = get_calendar(
            pool, &token, team, "?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z",
        ).await;
        assert_eq!(status, StatusCode::OK);
        let arr = json.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["member_name"], "Алиса");
        assert!(arr[0]["hue"].is_number());
        assert_eq!(arr[0]["state"], "planned");
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn calendar_range_boundaries(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        seed_meeting_at(&pool, team, "2026-06-01T00:00:00Z").await; // == from → included
        seed_meeting_at(&pool, team, "2026-07-01T00:00:00Z").await; // == to → excluded
        let (_, json) = get_calendar(
            pool, &token, team, "?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z",
        ).await;
        assert_eq!(json.as_array().unwrap().len(), 1);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn calendar_bad_range_400(pool: sqlx::PgPool) {
        let (token, team) = seed_team(&pool).await;
        let (status, _) = get_calendar(pool, &token, team, "?from=nope&to=also-nope").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn calendar_foreign_lead_403(pool: sqlx::PgPool) {
        let (_token, team) = seed_team(&pool).await;
        // a different lead in another workspace
        let ws2: (uuid::Uuid,) = sqlx::query_as("INSERT INTO workspaces (name) VALUES ('U') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let hash = hash_password("demo1234").unwrap();
        sqlx::query(
            "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
             VALUES ($1,'other@x.io',$2,'Other','lead'::user_role,40)",
        ).bind(ws2.0).bind(hash).execute(&pool).await.unwrap();
        let token = login_token(&pool, "other@x.io").await;
        let (status, _) = get_calendar(
            pool, &token, team, "?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z",
        ).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
```

> If `seed_team`/`login_token`/`hash_password`/`app`/the body-read imports differ slightly from the above, match the EXACT shapes already in teams.rs's test module (copy its idioms). The `forbids_non_lead` test already in teams.rs shows the foreign-lead seeding pattern — mirror it.

- [ ] **Step 6: Run tests → PASS**

Run: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api`
Expected: the 4 new calendar tests + all prior PASS. (docker compose up -d postgres-test if needed.)

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-domain/src/lib.rs api/crates/bt-api/src/routes/teams.rs api/crates/bt-api/src/app.rs
git commit -m "feat(api): GET /v1/teams/:id/calendar (team meetings in range)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: OpenAPI + regenerate types

**Files:**
- Modify: `api/crates/bt-api/src/openapi.rs`, `web/lib/api/schema.d.ts` (generated)

- [ ] **Step 1: Register path + schema**

In `openapi.rs` add to `paths(...)`:
```rust
        crate::routes::teams::team_calendar,
```
and to `components(schemas(...))`:
```rust
        bt_domain::CalendarMeeting,
```

- [ ] **Step 2: Build + boot API + verify**

Run: `cd /Users/lebedev.v/projects/beeteam/api && cargo build -p bt-api`
Ensure dev DB up (`docker compose up -d postgres`), restart the API on :8080, then:
Run: `curl -s http://localhost:8080/api-docs/openapi.json | grep -o '"/v1/teams/{id}/calendar"'`
Expected: prints `"/v1/teams/{id}/calendar"`.

- [ ] **Step 3: Regenerate types**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm gen:api`
Then: `grep -c "CalendarMeeting" lib/api/schema.d.ts` → non-zero.

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add api/crates/bt-api/src/openapi.rs web/lib/api/schema.d.ts
git commit -m "feat(api): register team calendar in OpenAPI; regen web types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — Frontend

### Task 3: `web/lib/calendar.ts` utilities

**Files:**
- Create: `web/lib/calendar.ts`
- Test: `web/lib/__tests__/calendar.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { shortName, STATE_META, monthRange, weekRange, listRange, sameDay } from "@/lib/calendar";

describe("calendar utils", () => {
  it("shortName → first name + initial", () => {
    expect(shortName("Анна Лебедева")).toBe("Анна Л.");
    expect(shortName("Борис")).toBe("Борис");
    expect(shortName("")).toBe("");
  });

  it("STATE_META maps states to labels", () => {
    expect(STATE_META.planned.label).toBe("Запланирована");
    expect(STATE_META.done.label).toBe("Проведена");
    expect(STATE_META.miss.label).toBe("Пропущена");
  });

  it("monthRange spans 42 days (6 weeks), Monday-aligned, covering the month", () => {
    const r = monthRange(new Date(2026, 5, 15)); // June 2026
    const from = new Date(r.from), to = new Date(r.to);
    expect((from.getDay() + 6) % 7).toBe(0); // Monday
    expect(Math.round((+to - +from) / 86_400_000)).toBe(42);
    expect(from <= new Date(2026, 5, 1)).toBe(true); // covers June 1
  });

  it("weekRange is 7 days Monday→Monday", () => {
    const r = weekRange(new Date(2026, 5, 17)); // a Wednesday
    const from = new Date(r.from), to = new Date(r.to);
    expect((from.getDay() + 6) % 7).toBe(0);
    expect(Math.round((+to - +from) / 86_400_000)).toBe(7);
  });

  it("listRange spans 35 days (−7…+28)", () => {
    const r = listRange(new Date(2026, 5, 15));
    const from = new Date(r.from), to = new Date(r.to);
    expect(Math.round((+to - +from) / 86_400_000)).toBe(35);
  });

  it("sameDay compares y/m/d", () => {
    expect(sameDay(new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 23))).toBe(true);
    expect(sameDay(new Date(2026, 5, 1), new Date(2026, 5, 2))).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test calendar`

- [ ] **Step 3: Implement `web/lib/calendar.ts`**

```typescript
export const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const RU_MONTHS_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
export const RU_DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const STATE_META: Record<string, { label: string; dot: string }> = {
  planned: { label: "Запланирована", dot: "bg-info" },
  done: { label: "Проведена", dot: "bg-ok" },
  miss: { label: "Пропущена", dot: "bg-miss" },
};

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Анна Лебедева" → "Анна Л."; single word unchanged. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

/** Monday on/before the given date. */
export function mondayOf(d: Date): Date {
  const lead = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - lead);
}

export type Range = { from: string; to: string };
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 6-week (42-day) window covering the anchor's month, Monday-aligned. */
export function monthRange(anchor: Date): Range {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = mondayOf(first);
  return { from: iso(start), to: iso(addDays(start, 42)) };
}

/** 7-day window for the anchor's week (Monday→next Monday). */
export function weekRange(anchor: Date): Range {
  const start = mondayOf(anchor);
  return { from: iso(start), to: iso(addDays(start, 7)) };
}

/** Agenda window: anchor−7 … anchor+28 (35 days). */
export function listRange(anchor: Date): Range {
  const start = addDays(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), -7);
  return { from: iso(start), to: iso(addDays(start, 35)) };
}
```

- [ ] **Step 4: Run → PASS.** `cd web && pnpm test calendar`

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/calendar.ts web/lib/__tests__/calendar.test.ts
git commit -m "feat(web): calendar date/range/name utilities

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `useTeamCalendar` hook

**Files:**
- Create: `web/lib/query/calendar.ts`

- [ ] **Step 1: Implement**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CalendarMeeting = components["schemas"]["CalendarMeeting"];

export function useTeamCalendar(teamId: string | null, fromISO: string, toISO: string) {
  return useQuery<CalendarMeeting[]>({
    queryKey: ["team-calendar", teamId, fromISO, toISO],
    enabled: teamId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/teams/{id}/calendar", {
        params: { path: { id: teamId! }, query: { from: fromISO, to: toISO } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit`
Expected: clean (path + query keys match `schema.d.ts`).

- [ ] **Step 3: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/lib/query/calendar.ts
git commit -m "feat(web): useTeamCalendar hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `CalendarMonth` / `CalendarWeek` / `CalendarList`

**Files:**
- Create: `web/components/calendar/CalendarMonth.tsx`, `CalendarWeek.tsx`, `CalendarList.tsx`
- Test: `web/components/__tests__/CalendarViews.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CalendarMonth } from "../calendar/CalendarMonth";
import { CalendarList } from "../calendar/CalendarList";
import type { CalendarMeeting } from "@/lib/query/calendar";

function mtg(id: string, date: string, name = "Анна Лебедева"): CalendarMeeting {
  return { id, member_id: "x", member_name: name, hue: 28, date, state: "planned", duration_min: 45 };
}

describe("CalendarMonth", () => {
  const month = new Date(2026, 5, 1);
  const today = new Date(2026, 5, 15);

  it("shows up to 3 chips + overflow on a busy day", () => {
    const day = "2026-06-10T09:00:00Z";
    const meetings = [mtg("a", day, "Анна Лебедева"), mtg("b", day, "Борис Петров"), mtg("c", day, "Вера Сидорова"), mtg("d", day, "Глеб Орлов")];
    render(<CalendarMonth month={month} today={today} meetings={meetings} onSelect={() => {}} />);
    expect(screen.getByText("Анна Л.")).toBeInTheDocument();
    expect(screen.getByText(/\+1 ещё/)).toBeInTheDocument(); // 4 → 3 chips + "+1 ещё"
  });

  it("clicking a chip calls onSelect with the meeting id", () => {
    const onSelect = vi.fn();
    render(<CalendarMonth month={month} today={today} meetings={[mtg("m1", "2026-06-10T09:00:00Z")]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Анна Л."));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });
});

describe("CalendarList", () => {
  it("renders rows and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<CalendarList meetings={[mtg("m1", "2026-06-10T09:00:00Z")]} onSelect={onSelect} />);
    const row = screen.getByText("Анна Лебедева");
    expect(row).toBeInTheDocument();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("shows an empty state", () => {
    render(<CalendarList meetings={[]} onSelect={() => {}} />);
    expect(screen.getByText("Встреч нет")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test CalendarViews`

- [ ] **Step 3: Implement `web/components/calendar/CalendarMonth.tsx`**

```typescript
"use client";
import { cn } from "@/lib/utils";
import { RU_DOW, sameDay, shortName, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

export function CalendarMonth({
  month, today, meetings, onSelect,
}: {
  month: Date;
  today: Date;
  meetings: CalendarMeeting[];
  onSelect: (id: string) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, m, 1 - lead);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayMtgs = meetings.filter((x) => sameDay(new Date(x.date), d));
    return { d, dayMtgs, inMonth: d.getMonth() === m };
  });

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
        {RU_DOW.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ d, dayMtgs, inMonth }, i) => {
          const isToday = sameDay(d, today);
          const shown = dayMtgs.slice(0, 3);
          const extra = dayMtgs.length - shown.length;
          return (
            <div key={i}
              className={cn(
                "min-h-[84px] rounded-md border p-1",
                inMonth ? "border-line-2 bg-bg-elev" : "border-transparent bg-bg-tint/40",
                isToday && "ring-1 ring-brand",
              )}>
              <div className={cn("mb-0.5 text-right text-[11px] tabular", inMonth ? "text-ink-3" : "text-ink-4")}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {shown.map((mt) => (
                  <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-ink-2 hover:bg-bg-tint">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_META[mt.state]?.dot ?? "bg-ink-4")} />
                    <span className="truncate">{shortName(mt.member_name)}</span>
                  </button>
                ))}
                {extra > 0 && <div className="px-1 text-[10px] text-ink-3">+{extra} ещё</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `web/components/calendar/CalendarWeek.tsx`**

```typescript
"use client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { RU_DOW, sameDay, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarWeek({
  weekStart, today, meetings, onSelect,
}: {
  weekStart: Date; // Monday
  today: Date;
  meetings: CalendarMeeting[];
  onSelect: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const dayMtgs = meetings
          .filter((x) => sameDay(new Date(x.date), d))
          .sort((a, b) => +new Date(a.date) - +new Date(b.date));
        const isToday = sameDay(d, today);
        return (
          <div key={i} className={cn("rounded-lg border bg-bg-elev p-2", isToday ? "border-brand" : "border-line")}>
            <div className="mb-2 text-[11px] text-ink-3">
              {RU_DOW[i]} <span className="tabular">{d.getDate()}</span>
            </div>
            <div className="space-y-1">
              {dayMtgs.map((mt) => (
                <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                  className="flex w-full items-center gap-1.5 rounded-md border border-line-2 bg-bg-tint p-1.5 text-left hover:bg-bg-sunken">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_META[mt.state]?.dot ?? "bg-ink-4")} />
                  <Avatar name={mt.member_name} hue={mt.hue} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] text-ink">{mt.member_name}</span>
                    <span className="block text-[10px] text-ink-3 tabular">{hhmm(mt.date)} · {mt.duration_min} мин</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Implement `web/components/calendar/CalendarList.tsx`**

```typescript
"use client";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { RU_MONTHS, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

const PILL: Record<string, "info" | "ok" | "miss"> = { planned: "info", done: "ok", miss: "miss" };

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarList({
  meetings, onSelect,
}: { meetings: CalendarMeeting[]; onSelect: (id: string) => void }) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
        Встреч нет
      </div>
    );
  }
  const sorted = [...meetings].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const groups: { key: string; label: string; items: CalendarMeeting[] }[] = [];
  for (const mt of sorted) {
    const key = dayKey(mt.date);
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: dayLabel(mt.date), items: [] }; groups.push(g); }
    g.items.push(mt);
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-1 text-[12px] font-medium text-ink-3 tabular">{g.label}</div>
          <div className="rounded-lg border border-line bg-bg-elev">
            {g.items.map((mt) => (
              <button key={mt.id} type="button" onClick={() => onSelect(mt.id)}
                className="flex w-full items-center gap-3 border-b border-line-2 px-3 py-2.5 text-left last:border-b-0 hover:bg-bg-tint">
                <span className="w-12 shrink-0 text-[12px] text-ink-3 tabular">{hhmm(mt.date)}</span>
                <Avatar name={mt.member_name} hue={mt.hue} size="sm" />
                <span className="flex-1 truncate text-[13px] text-ink">{mt.member_name}</span>
                <Pill variant={PILL[mt.state] ?? "default"} dot>{STATE_META[mt.state]?.label ?? mt.state}</Pill>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run → PASS + typecheck.** `cd web && pnpm test CalendarViews && pnpm exec tsc --noEmit`

> If the `CalendarMonth` chip test matches "Анна Л." in multiple cells (June 10 could appear once in-month; the 42-cell grid contains June 10 exactly once), `getByText` is fine. If a name collides, scope with `getAllByText(...)[0]`. Keep the component as written.

- [ ] **Step 7: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/calendar/CalendarMonth.tsx web/components/calendar/CalendarWeek.tsx web/components/calendar/CalendarList.tsx web/components/__tests__/CalendarViews.test.tsx
git commit -m "feat(web): CalendarMonth + CalendarWeek + CalendarList views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `CalendarSidebar` (Upcoming / WeekLoad / Legend)

**Files:**
- Create: `web/components/calendar/CalendarSidebar.tsx`
- Test: `web/components/__tests__/CalendarSidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CalendarSidebar } from "../calendar/CalendarSidebar";
import type { CalendarMeeting } from "@/lib/query/calendar";

function mtg(id: string, date: string, state = "planned"): CalendarMeeting {
  return { id, member_id: "x", member_name: "Анна Лебедева", hue: 28, date, state, duration_min: 45 };
}

describe("CalendarSidebar", () => {
  it("renders the three widget headers", () => {
    render(<CalendarSidebar meetings={[]} today={new Date(2026, 5, 15)} onSelect={() => {}} />);
    expect(screen.getByText("Ближайшие встречи")).toBeInTheDocument();
    expect(screen.getByText("Загрузка по неделе")).toBeInTheDocument();
    expect(screen.getByText("Легенда")).toBeInTheDocument();
  });

  it("shows empty upcoming copy when no planned meetings", () => {
    render(<CalendarSidebar meetings={[]} today={new Date(2026, 5, 15)} onSelect={() => {}} />);
    expect(screen.getByText("Ничего не запланировано")).toBeInTheDocument();
  });

  it("lists an upcoming planned meeting and fires onSelect", () => {
    const onSelect = vi.fn();
    const today = new Date(2026, 5, 15);
    const soon = new Date(2026, 5, 17, 11, 0).toISOString();
    render(<CalendarSidebar meetings={[mtg("m1", soon)]} today={today} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Анна Лебедева"));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && pnpm test CalendarSidebar`

- [ ] **Step 3: Implement `web/components/calendar/CalendarSidebar.tsx`**

```typescript
"use client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { RU_DOW, RU_MONTHS, sameDay, STATE_META } from "@/lib/calendar";
import type { CalendarMeeting } from "@/lib/query/calendar";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarSidebar({
  meetings, today, onSelect,
}: { meetings: CalendarMeeting[]; today: Date; onSelect: (id: string) => void }) {
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21);
  const upcoming = meetings
    .filter((m) => m.state === "planned" && new Date(m.date) >= today && new Date(m.date) <= horizon)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 6);

  // Week load: count meetings per weekday (Mon..Sun) within the current displayed set.
  const loads = [0, 0, 0, 0, 0, 0, 0];
  for (const m of meetings) {
    const idx = (new Date(m.date).getDay() + 6) % 7;
    loads[idx] += 1;
  }
  const maxLoad = Math.max(1, ...loads);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Ближайшие встречи</h3>
        {upcoming.length === 0 ? (
          <p className="text-[12px] text-ink-3">Ничего не запланировано</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onSelect(m.id)}
                  className="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-bg-tint">
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="text-[13px] font-semibold leading-none tabular">{new Date(m.date).getDate()}</span>
                    <span className="text-[10px] text-ink-3">{RU_MONTHS[new Date(m.date).getMonth()]}</span>
                  </span>
                  <Avatar name={m.member_name} hue={m.hue} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink">{m.member_name}</span>
                    <span className="block text-[10px] text-ink-3 tabular">{hhmm(m.date)} · {m.duration_min} мин</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Загрузка по неделе</h3>
        <div className="flex items-end justify-between gap-1" style={{ height: 64 }}>
          {loads.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-brand" style={{ height: `${4 + (n / maxLoad) * 44}px` }} title={`${n}`} />
              <span className="text-[10px] text-ink-3">{RU_DOW[i]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-bg-elev p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Легенда</h3>
        <ul className="space-y-1 text-[12px] text-ink-2">
          {(["planned", "done", "miss"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", STATE_META[s].dot)} />
              {STATE_META[s].label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run → PASS.** `cd web && pnpm test CalendarSidebar`

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/calendar/CalendarSidebar.tsx web/components/__tests__/CalendarSidebar.test.tsx
git commit -m "feat(web): CalendarSidebar (upcoming + week load + legend)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `CalendarClient` + `calendar/page.tsx`

**Files:**
- Create: `web/components/calendar/CalendarClient.tsx`, `web/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Implement `web/components/calendar/CalendarClient.tsx`**

```typescript
"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { useTeamCalendar } from "@/lib/query/calendar";
import { useDrawerStore } from "@/lib/store/drawer";
import { monthRange, weekRange, listRange, mondayOf, RU_MONTHS_FULL } from "@/lib/calendar";
import { CalendarMonth } from "./CalendarMonth";
import { CalendarWeek } from "./CalendarWeek";
import { CalendarList } from "./CalendarList";
import { CalendarSidebar } from "./CalendarSidebar";

type View = "month" | "week" | "list";

export function CalendarClient({ teamId }: { teamId: string | null }) {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [status, setStatus] = useState("all");
  const open = useDrawerStore((s) => s.open);
  const today = new Date();

  if (teamId == null) {
    return <div className="p-10 text-center text-[14px] text-ink-3">Календарь доступен лидам команды</div>;
  }

  const range = view === "month" ? monthRange(anchor) : view === "week" ? weekRange(anchor) : listRange(anchor);
  const cal = useTeamCalendar(teamId, range.from, range.to);
  const meetings = (cal.data ?? []).filter((m) => status === "all" || m.state === status);

  function shift(dir: -1 | 1) {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + 14 * dir);
    setAnchor(d);
  }

  const title = view === "month"
    ? `${RU_MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`
    : view === "week"
      ? `Неделя с ${mondayOf(anchor).getDate()} ${RU_MONTHS_FULL[mondayOf(anchor).getMonth()].toLowerCase()}`
      : "Список встреч";

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Календарь</h1>
          <p className="text-[13px] text-ink-3 tabular">Все 1-2-1 встречи команды · {title}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">.ics</button>
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">+ Запланировать</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SegControl
            options={[{ value: "month", label: "Месяц" }, { value: "week", label: "Неделя" }, { value: "list", label: "Список" }]}
            value={view} onChange={(v) => setView(v as View)} />
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Назад" className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint" onClick={() => shift(-1)}>‹</button>
            <button type="button" className="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint" onClick={() => setAnchor(new Date())}>Сегодня</button>
            <button type="button" aria-label="Вперёд" className="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint" onClick={() => shift(1)}>›</button>
          </div>
        </div>
        <SegControl
          options={[
            { value: "all", label: "Все" }, { value: "planned", label: "Запланировано" },
            { value: "done", label: "Проведено" }, { value: "miss", label: "Пропущено" },
          ]}
          value={status} onChange={setStatus} />
      </div>

      <div className="grid grid-cols-[1.7fr_minmax(280px,1fr)] gap-5">
        <div>
          {cal.isLoading ? (
            <div className="rounded-lg border border-line bg-bg-elev p-10 text-center text-[13px] text-ink-3">Загрузка…</div>
          ) : cal.isError ? (
            <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
              Не удалось загрузить календарь.{" "}
              <button className="underline" onClick={() => cal.refetch()}>Повторить</button>
            </div>
          ) : view === "month" ? (
            <CalendarMonth month={anchor} today={today} meetings={meetings} onSelect={open} />
          ) : view === "week" ? (
            <CalendarWeek weekStart={mondayOf(anchor)} today={today} meetings={meetings} onSelect={open} />
          ) : (
            <CalendarList meetings={meetings} onSelect={open} />
          )}
        </div>
        <CalendarSidebar meetings={cal.data ?? []} today={today} onSelect={open} />
      </div>
    </div>
  );
}
```

> Note: `useTeamCalendar` is called unconditionally below the `teamId == null` early return — but that early return sits ABOVE the hook, which would violate Rules of Hooks. FIX: move the `teamId == null` guard to render `null`/the message via a wrapper, OR keep the hook above the guard. Implement it so ALL hooks (`useState`×3, `useDrawerStore`, `useTeamCalendar`) run BEFORE any early return: call `useTeamCalendar(teamId, range.from, range.to)` with `teamId` possibly null (the hook is `enabled: teamId != null`, so it no-ops), compute `range` from `anchor` regardless, and put the `teamId == null` check in the RETURN (JSX) only. Restructure: declare all hooks first; then `if (teamId == null) return <…>;`. Since `useTeamCalendar` already guards on `enabled`, calling it with `teamId` (string|null) is fine — but its signature takes `string | null`, so pass `teamId` directly. Ensure no hook is below the early return.

- [ ] **Step 2: Implement `web/app/(app)/calendar/page.tsx`**

```typescript
import { getSessionUser } from "@/lib/auth";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export default async function CalendarPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  return <CalendarClient teamId={user?.teamId ?? null} />;
}
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; all tests pass. (Confirm the hooks-ordering fix from the note above — `useTeamCalendar` must not be called after the `teamId == null` return.)

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/calendar/CalendarClient.tsx "web/app/(app)/calendar/page.tsx"
git commit -m "feat(web): CalendarClient + /calendar route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Enable the Sidebar «Календарь» entry (route-aware)

**Files:**
- Modify: `web/components/Sidebar.tsx`, `web/components/NavItem.tsx`

- [ ] **Step 1: Read both files first**

`web/components/Sidebar.tsx` has a `TEAM_NAV` array of `{ id, label, icon, count?, active, disabled }` and renders `NavItem`s. `web/components/NavItem.tsx` renders one entry. Adapt them to: (a) give the team + calendar entries an `href` (`/` and `/calendar`); (b) drop `disabled` on calendar; (c) compute `active` from the current path via `usePathname()` instead of the hardcoded flag; (d) render real navigation with `next/link`.

- [ ] **Step 2: Make `Sidebar` route-aware**

Make `Sidebar` a client component (`"use client";` at top — it currently receives `user` as a prop from the server layout; a client component can still take serializable props). Add `import { usePathname } from "next/navigation";`. Replace the static `active` flags with computed ones. Concretely:
- Change the nav config so `team` has `href: "/"` and `calendar` has `href: "/calendar"`, and remove `disabled: true` from `calendar`. Keep `grades`/`fields`/`export` as `disabled: true` (no href).
- In the component: `const pathname = usePathname();` and pass `active={item.href === "/" ? pathname === "/" : !!item.href && pathname.startsWith(item.href)}` to each `NavItem` (exact match for `/` so it isn't always active).

If `Sidebar` is currently a server component with no `"use client"`, adding `"use client"` is fine — it only renders presentational nav + the passed `user`. Confirm it doesn't use server-only APIs (it shouldn't).

- [ ] **Step 3: Make `NavItem` navigate**

Update `NavItem` to render an enabled entry as a `next/link` `<Link href={href}>` (keeping the existing icon/label/count markup + active styling), and a disabled entry as the current non-interactive element. Props: add `href?: string` and keep `active`/`disabled`. When `disabled` or no `href`, render the inert version; otherwise a `<Link>`.

Example shape (adapt to the real markup/classes in NavItem):
```typescript
import Link from "next/link";
// ...
if (disabled || !href) {
  return <div className={cn(baseClasses, "cursor-default opacity-50")}>{inner}</div>;
}
return <Link href={href} className={cn(baseClasses, active && activeClasses)}>{inner}</Link>;
```

- [ ] **Step 4: Typecheck + tests + manual nav check**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm exec tsc --noEmit && pnpm test`
Expected: clean + green. (If a Sidebar/NavItem unit test exists and asserts the old disabled calendar entry, update it to reflect the enabled, route-aware entry — don't weaken unrelated assertions.)

- [ ] **Step 5: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/components/Sidebar.tsx web/components/NavItem.tsx
git commit -m "feat(web): enable Календарь nav (route-aware active via usePathname)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Playwright e2e

**Files:**
- Create: `web/e2e/calendar.spec.ts`

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

test("navigate to the calendar and switch views", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Календарь" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  // Sidebar widgets present.
  await expect(page.getByText("Ближайшие встречи")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Легенда")).toBeVisible();
  // Switch views.
  await page.getByRole("button", { name: "Список" }).click();
  await page.getByRole("button", { name: "Неделя" }).click();
  await page.getByRole("button", { name: "Месяц" }).click();
});

test("clicking a meeting opens the drawer", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Календарь" }).click();
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  // Switch to the list view (deterministic clickable rows) and open the first meeting.
  await page.getByRole("button", { name: "Список" }).click();
  const firstMeeting = page.locator("button", { hasText: /Лебедева|Глебов|[А-Я][а-я]+ [А-Я]\.?/ }).first();
  // The drawer shows a state pill «Завершена»/«Запланирована» when open.
  await firstMeeting.click();
  await expect(page.getByText(/Завершена|Запланирована/).first()).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run** (API on :8080 + dev DB seeded; Playwright starts `pnpm dev`)

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e calendar`
The seed creates meetings around now, so the current month/list has data. If the second test's meeting locator is flaky (no row in the default list window, or ambiguous), refine it: scope to a `CalendarList` row, or assert on a known seeded member name visible in the list. If the list is empty for the current window, switch the test to the month view and click a chip. Do NOT weaken assertions to pass on an empty calendar — ensure the seeded data is in range (it is: relative-to-now dates within ±a few weeks).

- [ ] **Step 3: Run the full e2e suite (regression)**

Run: `cd /Users/lebedev.v/projects/beeteam/web && pnpm test:e2e`
Expected: all specs PASS (auth/teamlist/profile/meeting-drawer/goals-crud/files unaffected; note teamlist's nav now uses real links — confirm its assertions still hold).

- [ ] **Step 4: Commit**

```bash
cd /Users/lebedev.v/projects/beeteam
git add web/e2e/calendar.spec.ts
git commit -m "test(web): calendar e2e — nav, view switching, meeting→drawer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification
- [ ] Backend: `cd /Users/lebedev.v/projects/beeteam && api/scripts/test.sh -p bt-api` → all PASS.
- [ ] Frontend unit: `cd web && pnpm test` → all PASS.
- [ ] Typecheck: `cd web && pnpm exec tsc --noEmit` → clean.
- [ ] e2e: `cd web && pnpm test:e2e` → all PASS.
- [ ] Manual: Sidebar «Календарь» is enabled + active on `/calendar`; month shows team meeting chips (+N ещё on busy days); week shows day-columns; list groups by day; status filter narrows; ‹/Сегодня/› navigate; clicking a meeting opens the drawer; sidebar widgets render.
- [ ] Then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- New lead-scoped range endpoint `GET /v1/teams/:id/calendar?from&to` → `CalendarMeeting[]` with member name+hue → Task 1 ✓ (range/403/400/boundary tests)
- OpenAPI + gen:api → Task 2 ✓
- Month (multi-chip, +N) / Week (day-columns, no hour grid) / List (agenda) → Task 5 ✓
- Sidebar widgets Upcoming / WeekLoad / Legend → Task 6 ✓
- CalendarClient: view/anchor/status, range per view, client status filter, ‹/Сегодня/›, loading/error/empty, no-teamId message → Task 7 ✓
- `/calendar` route (server page → client) → Task 7 ✓
- Sidebar enablement + route-aware active (usePathname, next/link) → Task 8 ✓
- Meeting click → useDrawerStore.open → Tasks 5/6/7 (pass `open` as onSelect) ✓
- «+ Запланировать»/«.ics» stubs; week as day-columns; new CalendarMonth → Task 5/7 ✓
- e2e nav + view-switch + meeting→drawer → Task 9 ✓
- Preserve brand token, RU microcopy, Monday-first, tabular → enforced in component code + conventions ✓

**Placeholder scan:** no TBD/TODO; all code shown. The Task 7 hooks-ordering note is an explicit instruction (call all hooks before the `teamId==null` return), not a vague placeholder. Task 8 adapts to the real NavItem markup (instructed to read it first) — the shape + behavior are concrete.

**Type consistency:** `CalendarMeeting` (Task 1 DTO) → generated type (Task 2) → `useTeamCalendar` return (Task 4) → consumed by CalendarMonth/Week/List/Sidebar (Tasks 5/6) and CalendarClient (Task 7). `monthRange`/`weekRange`/`listRange`/`shortName`/`STATE_META`/`sameDay`/`RU_*` (Task 3) used by the views/sidebar/client. `onSelect` is `(id:string)=>void` everywhere, wired to `useDrawerStore.open`. `mondayOf` is defined in both `lib/calendar.ts` (private) and `CalendarClient` (local) — acceptable duplication of a 2-line helper; alternatively export it from `lib/calendar.ts` and import in CalendarClient (preferred — note for the implementer).

**One implementer note:** in Task 7, export `mondayOf` from `web/lib/calendar.ts` and import it in `CalendarClient` rather than redefining, to keep the Monday math in one place. And ensure all hooks precede the `teamId == null` early return (Rules of Hooks).
