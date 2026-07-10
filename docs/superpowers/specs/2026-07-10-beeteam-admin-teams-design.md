# BeeTeam — Admin: Teams (slice A of the Administration subsystem)

**Status:** Design approved
**Date:** 2026-07-10
**Depends on:** RBAC (#5a) — `Permission`, `permissions_of`, `require_permission`/`has_permission`,
`permissions` in the session, `hasPermission`, HR user Ольга Климова; the org-structure schema from
#1 (`teams`, `team_members`, `users`, `field_templates`); the CRUD patterns from goals/framework
(create/update/delete handlers, TanStack Query mutations, Modal).

## Goal

Stand up the HR **Administration** area and its first screen — **Команды** (teams management). Introduce
a typed admin permission, fix the broken sidebar gating, add the `/admin/teams` route, and give HR full
CRUD over teams: list (with real member counts + lead), create, edit (name/mission/color/lead/cadence/
visibility), and delete (empty teams only). This is the foundation the People/Roles (B) and Workspace
Settings (C) slices build on.

**Administration decomposition (locked, user choice):** A = teams + admin foundation (THIS SPEC);
B = people & roles (users + team_members, the `team_members.user_id` bridge, «Лиды», add-employee);
C = workspace settings («Общие»). Each is its own spec→plan→slice.

## Scope

**In:**
- `Permission::ManageWorkspace` (`manage_workspace`), granted to `hr_admin`.
- `GET /v1/teams` (list), `POST /v1/teams` (create), `PATCH /v1/teams/{id}` (update),
  `DELETE /v1/teams/{id}` (delete-if-empty → 409), `GET /v1/leads` (assignable leads) — all under
  `ManageWorkspace`.
- `/admin/teams` page (server-gated on `manage_workspace`), `TeamsAdminClient`, `TeamEditModal`.
- Sidebar fix: «Администрирование» section shown to `manage_workspace` holders (not the current
  inverted `!isHr`); «Команды» becomes an active link; «Лиды»/«Настройки» stay disabled.
- Hooks `web/lib/query/teams.ts`; regenerated web types.

**Out (deferred):**
- People & roles — user/team_member CRUD, role changes, assigning a lead by *creating* an account,
  the `team_members.user_id` bridge, «Лиды» screen, add-employee form — **slice B**.
- Workspace settings («Общие»: name/domain/cadence/toggles) — **slice C**.
- Mock prototype features with no backend: SSO/AD/SAML, integrations (Google/Slack/Jira/Webhooks),
  billing/«Тариф», «Рассылка», Excel «Экспорт», retention-policy enforcement — **out entirely**.
- Team-level aggregates that need mood arrays (avg mood, «В графике/Внимание» status pills) — deferred;
  slice A shows a simple status (has-lead vs «Без лида»).
- Editing the 1-2-1 field template («Конструктор полей») — separate slice.

## Decisions (locked)

1. **New typed permission `ManageWorkspace`** (user choice) on `hr_admin`; the admin area gates on it.
   No role-branching on the frontend — permission only. Fixes the sidebar's inverted `!isHr` gate.
2. **Delete blocks non-empty teams** (user choice): `DELETE /v1/teams/{id}` returns **409** if any
   `team_members` reference the team; only empty teams delete (204). Mirrors the #5b-i block-in-use
   pattern. Moving/removing members is slice B, so in practice A only deletes just-created empty teams.
3. **No migration.** The `teams` table already has every needed column; slice A only adds write paths
   and the permission (permissions are code, not schema).
4. **Create auto-assigns the field template** (YAGNI): the server sets a new team's
   `default_template_id` to the workspace's existing field template (first by `created_at`, or NULL if
   none), so a new team's 1-2-1s have fields. The form does not expose a template picker (that belongs
   to the future template-editor slice).
5. **Assignable leads = workspace `users` with role `lead` or `hr_admin`.** A team's lead is optional
   (`lead_id` nullable). Creating *new* lead accounts is slice B.
6. **Admin CRUD is permission-gated (`ManageWorkspace`), independent of the ownership-gated lead
   sub-resources** (`/v1/teams/{id}/members|stats|calendar` keep `require_team_access`). Both live under
   `/v1/teams` with different guards.

## Data model

No migration. Writes target the existing `teams` table (`0001_init.sql`):
`teams(id, workspace_id, name, mission NULL, color DEFAULT '#F5A524', lead_id → users(id) ON DELETE SET
NULL, default_template_id → field_templates(id) ON DELETE SET NULL, default_cadence cadence DEFAULT
'2w', visibility DEFAULT 'private')`. Reads also touch `team_members` (count), `users` (lead name/hue),
`field_templates` (auto-pick on create). Enums: `cadence` = {1w, 2w, 4w}; `visibility` = {private, hr,
org}.

## API

All five gate with `require_permission(ManageWorkspace)` → 403, and scope to the caller's workspace via
`workspace_of(auth.id)`.

```
GET /v1/teams
  200 → TeamRow[] : { id, name, mission: Option<String>, color, lead_id: Option<Uuid>,
                      lead_name: Option<String>, lead_hue: Option<i32>, member_count: i64,
                      default_cadence, visibility }
  (LEFT JOIN users for lead; COUNT team_members grouped by team; ORDER BY name.)

POST /v1/teams
  body: CreateTeam { name, mission: Option<String>, color, lead_id: Option<Uuid>,
                     default_cadence, visibility }
  400 on: empty name; cadence ∉ {1w,2w,4w}; visibility ∉ {private,hr,org}; color not a #RRGGBB hex;
       lead_id present but not a user in this workspace.
  Sets default_template_id = (SELECT id FROM field_templates WHERE workspace_id=$ ORDER BY created_at
       LIMIT 1)  (nullable).
  201 → TeamRow (member_count 0)

PATCH /v1/teams/{id}
  404 unless the team is in the caller's workspace.
  body: UpdateTeam { name, mission: Option<String>, color, lead_id: Option<Uuid>,
                     default_cadence, visibility }   // full replace of these fields
  Same 400 validation as POST (incl. lead_id-in-workspace). lead_id = null clears the lead.
  200 → TeamRow

DELETE /v1/teams/{id}
  404 unless in workspace. 409 if EXISTS team_members WHERE team_id = $.  Else DELETE → 204.

GET /v1/leads
  200 → AssignableLead[] : { id, name, hue, role }   // users with role in (lead, hr_admin), ORDER BY name
```

DTOs in bt-domain: `TeamRow`, `AssignableLead` (Serialize+ToSchema); `CreateTeam`, `UpdateTeam`
(Deserialize+ToSchema). Register the paths + schemas in `openapi.rs`; regenerate web types. Handlers
follow the goals/meetings write pattern (validate → require_permission → workspace scope → SQL →
201/200/204), `AppError` for 400/403/404/409.

## Frontend

**Permission to the client.** `web/app/(app)/admin/teams/page.tsx` is a server component: reads
`getSessionUser`; if `!hasPermission(user, "manage_workspace")` renders `<NoAccess/>` (mirroring
`approvals/page.tsx`); else renders `<TeamsAdminClient/>`.

**Sidebar** (`web/components/Sidebar.tsx`): the «Администрирование» section renders when the user has
`manage_workspace` (replace the `!isHr` condition). «Команды» gets `href: "/admin/teams"`,
`requires: "manage_workspace"`, `disabled: false`. «Лиды» and «Настройки» keep `disabled: true`.

**`TeamsAdminClient`:**
- Header: «N команд · M сотрудников · K без лида» (derived from the list) + a «Новая команда» button.
- Table rows: team (a mono initials tile + name), lead (Avatar + name, or «— не назначен —» in the
  `miss` color), member count, status pill («Без лида» when `lead_id == null`, else «Активна»), and a
  ⋯ menu → «Редактировать» / «Удалить».
- Delete → `confirm()` → `DELETE`; a 409 shows a banner «Нельзя удалить команду с сотрудниками —
  сначала переместите или удалите их.»; other errors show a generic banner.

**`TeamEditModal`** (create & edit, `Modal`-based):
- Fields: Название (required, ≥2 chars), Миссия (optional), a color palette (preset hexes incl. the
  brand `#F5A524`), lead `<select>` (options from `GET /v1/leads` + «— не назначен —»), cadence
  segmented control (1w/2w/4w), visibility `<select>` (private/hr/org with Russian labels). «Сохранить»
  disabled until valid; calls `POST` (create) or `PATCH` (edit), then closes + invalidates `["teams"]`.

**Hooks `web/lib/query/teams.ts`:** `useTeams()` (`["teams"]`), `useAssignableLeads()` (`["leads"]`),
`useCreateTeam()`, `useUpdateTeam()`, `useDeleteTeam()` — all invalidate `["teams"]`. Russian microcopy
from the prototype; amber on the `brand` token. The Next proxy already forwards POST/PATCH/DELETE.

## Edge cases

- No `manage_workspace` → no «Администрирование» section, no `/admin/teams`; a direct API call → 403.
- Empty name / bad cadence / bad visibility / bad color / lead_id not in workspace → 400; Save disabled
  client-side for the client-checkable ones.
- Delete a team with members → 409, banner, team kept.
- `lead_id = null` → team shows «Без лида»; assigning later via PATCH clears the flag.
- New team with no workspace template → `default_template_id` NULL (acceptable; 1-2-1 fields empty until
  a template exists).
- Concurrent edits by two admins → last-write-wins (one HR-admin per workspace; acceptable).

## Testing

- **bt-api** (`routes/teams.rs mod tests`, existing patterns): `GET /teams` — HR sees the seeded team
  with `member_count = 8` and the lead's name; lead (no ManageWorkspace) → 403. `POST` — HR creates a
  team (201, member_count 0, default_template_id set to the seeded template); empty name / bad cadence
  / bad visibility / bad color → 400; unknown lead_id → 400. `PATCH` — rename + reassign lead persists;
  foreign-workspace/unknown id → 404. `DELETE` — a fresh empty team → 204; the seeded team (8 members)
  → 409 and still present. `GET /leads` — returns Евгений (lead) and Ольга (hr_admin).
- **web unit** (Vitest): `TeamEditModal` (Save disabled until a valid name; cadence/visibility/lead
  setters fire; create vs edit title); `TeamsAdminClient` (renders rows, «Без лида» when no lead, the
  «N команд · M сотрудников» header, «Новая команда» opens the modal). Gate: `page`-level check that a
  non-`manage_workspace` user gets `<NoAccess/>` (or test the client only renders for HR).
- **e2e `admin-teams.spec.ts`** (HR Ольга): open `/admin/teams` → «Новая команда» → fill name → save →
  the new team appears → rename via ⋯ → delete it (empty → succeeds). Plus a lead check: `e.glebov`
  has no «Команды» nav item and `/admin/teams` shows «Нет доступа». ⚠ The e2e creates and then deletes
  its own team, leaving shared state clean for other specs.

## Out-of-scope hooks for later slices

- **Slice B (people & roles):** adds the `team_members.user_id` bridge, user/employee CRUD, role
  changes, «Лиды» (assign a lead, create the account), add-employee; extends `GET /v1/leads` with the
  1-2-1-discipline metric and write paths.
- **Slice C (workspace settings):** `PATCH /v1/workspaces/{id}` for name/domain/default_cadence + the
  real toggles; renders the mock settings sections as disabled «скоро».
