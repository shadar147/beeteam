# Porting guide: `web/` (Next.js + React) → `web-vue/` (Nuxt 4 + Vue 3)

The goal is a **1:1 port**: same screens, same markup semantics, same Tailwind
classes, same API calls, same behaviour. `web/` is the source of truth and stays
untouched. Do not redesign, rename user-visible text, or "improve" logic. Parity is
proven by the same Playwright specs (`web-vue/e2e`, copied from `web/e2e`) passing
and by screenshots matching.

## Stack
Nuxt 4 (`ssr: false`, Nitro BFF in `server/`), Vue 3 `<script setup lang="ts">`,
Tailwind v3 (same config + tokens as `web/`), `@tanstack/vue-query` v5,
Pinia, `openapi-fetch` (same generated `schema.d.ts`), `lucide-vue-next`,
`reka-ui` only where a headless primitive is really needed, Vitest +
`@testing-library/vue`, Playwright.

## Already done (do not rewrite)
`nuxt.config.ts`, `tailwind.config.ts`, `app/assets/css/*`, `server/**` (login,
logout, me, `/api/v1/*` proxy, cookie gate), `app/middleware/auth.global.ts`,
`app/composables/useSessionUser.ts`, `app/plugins/vue-query.ts`,
`app/stores/drawer.ts`, `app/lib/api/*`, `app/lib/permissions.ts`, `app/lib/utils.ts`,
vitest/playwright configs.

## File mapping
| React (`web/`) | Vue (`web-vue/`) |
|---|---|
| `components/X.tsx` | `app/components/X.vue` (same sub-folder, same name) |
| `components/ui/button.tsx` | `app/components/ui/Button.vue` |
| `app/(app)/profile/[id]/*Tab.tsx` | `app/components/profile/*Tab.vue` |
| `app/(app)/TeamListClient.tsx`, `*Client.tsx` | keep as component, same name |
| `app/(app)/<route>/page.tsx` | `app/pages/<route>.vue` (thin: permission check + client component) |
| `app/(app)/layout.tsx` | `app/layouts/default.vue` |
| `app/login/*` | `app/pages/login.vue` (`definePageMeta({ layout: "auth" })`) + `app/components/LoginForm.vue` |
| `lib/x.ts` | `app/lib/x.ts` (pure TS: copy, adjust imports only) |
| `lib/query/x.ts` | `app/lib/query/x.ts` |
| `lib/store/drawer.ts` (zustand) | `app/stores/drawer.ts` (Pinia, done) |
| `components/__tests__/X.test.tsx` | `app/components/__tests__/X.test.ts` |
| `lib/__tests__/x.test.ts` | `app/lib/__tests__/x.test.ts` |

## Rules for components and lib (IMPORTANT)
1. **Explicit imports only** inside `app/components/**` and `app/lib/**`: import
   `ref/computed/watch` from `vue`, child components by path
   (`import Pill from "~/components/Pill.vue"`), `RouterLink`, `useRoute`,
   `useRouter` from `vue-router`, the store from `~/stores/drawer`. No Nuxt
   auto-imports and no `NuxtLink`/`navigateTo`/`useState` there — this keeps
   components testable with plain Vitest. Pages, layouts and middleware may use
   Nuxt auto-imports.
2. **Default export = the component** (normal SFC). Non-component exports a React
   file had (helper fns, constants, types, e.g. `visibleNavItems` in `Sidebar.tsx`)
   go in a sibling `X.ts` next to `X.vue` if tests or other files import them —
   or in a second plain `<script lang="ts">` block if tiny.
3. **Props**: `defineProps<{...}>()` with the same names/types as React. Callback
   props become emits: `onClose` → `emit("close")`, `onChange(v)` → `emit("change", v)`;
   controlled `value`+`onChange` pairs become `v-model` (`modelValue` /
   `update:modelValue`) **only if** every call site is a plain two-way binding,
   otherwise keep `value` + `@change`. `children` → default slot; render-prop/
   node props → named slots. `className` prop → `class` prop merged with `cn()`.
4. **Markup parity**: keep element types, `aria-*`, `role`, labels, `data-*`
   attributes, visible text and Tailwind classes identical — the e2e specs select
   by role/label/text and by things like `aside`, `a[href^="/profile/"]`.
   `className` → `class`, `htmlFor` → `for`, `onClick` → `@click`,
   `{cond && <X/>}` → `v-if`, `.map` → `v-for` with `:key`.
   `<Link href>` → `<RouterLink :to>`.
5. **State**: `useState` → `ref`, `useMemo` → `computed`, `useEffect` →
   `watch`/`watchEffect`/`onMounted`+`onUnmounted` (keep cleanup!), `useRef` DOM →
   template ref. Session user is passed down as a prop exactly like in React;
   pages get it from `useSessionUser()`.
6. **Icons**: `lucide-react` → `lucide-vue-next` (same names; pass `:size`,
   `:stroke-width`, `class`).
7. **Queries** (`app/lib/query/*.ts`): same function names, query keys, endpoints
   and invalidations as React. Parameters accept `MaybeRefOrGetter<T>`; read them
   with `toValue()` inside `queryFn`, put the ref/getter itself (or a `computed`)
   in `queryKey` so it is reactive, and use `enabled: computed(() => ...)`.
   ```ts
   export function useTeamStats(teamId: MaybeRefOrGetter<string | null>) {
     return useQuery({
       queryKey: ["team-stats", computed(() => toValue(teamId))],
       enabled: computed(() => toValue(teamId) != null),
       queryFn: async () => {
         const { data, error } = await api.GET("/v1/teams/{id}/stats", { params: { path: { id: toValue(teamId)! } } });
         if (error) throw error;
         return data!;
       },
     });
   }
   ```
   In templates remember query results are refs: `members.data.value` in script,
   `members.data` auto-unwrapped only at top level — destructure
   (`const { data: members, isLoading } = useTeamMembers(...)`) to keep templates clean.
8. **Server-side fetches in React server components** (e.g. profile layout fetching
   the member, `getSessionUser()` in pages) become client-side: `useSessionUser()`
   for the user, a vue-query hook for data. Keep the same 403 / error / NoAccess
   branches and texts.
9. **Permissions/redirects in pages**: replicate with `useSessionUser()` +
   `hasPermission()`; redirects via `await navigateTo("/approvals", { replace: true })`
   in the page's `<script setup>`.
10. **Tests**: port every case of the React unit test 1:1 to
    `@testing-library/vue` (`render`, `screen`, `fireEvent`), wrapping with
    `VueQueryPlugin` / `createTestingPinia`-free plain `createPinia()` / a
    memory `createRouter` when the component needs them. Mock query modules with
    `vi.mock("~/lib/query/x")` the same way the React tests do. Do not drop cases.
11. Follow the repo's code-quality stance: no speculative abstractions, no dead
    code, comments only where the "why" is not obvious (carry over the useful
    comments from the React source).

## How to verify your package
- Dev servers are already running: React reference on http://localhost:3000, Vue on
  http://localhost:3001 (HMR), API on :8080. Do **not** start/stop servers or touch the DB
  directly. Demo logins: lead `e.glebov@beeteam.io`, HR `o.klimova@beeteam.io`, password `demo1234`.
- Unit tests (only yours): `cd /home/claude/beeteam/web-vue && pnpm exec vitest run app/components/__tests__/X.test.ts`
- E2E (only yours): `/home/claude/tools/e2e-vue.sh e2e/<spec>.spec.ts` — it takes a
  global lock, reseeds the DB and runs against :3001. Never run Playwright any other way.
  Specs must pass **unmodified**; if a spec truly cannot work because of a
  framework difference, report it instead of editing it.
- Types: `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.app.json 2>&1 | grep "<your files>"` —
  other packages are being written in parallel, ignore errors in files you don't own.
- Visual check: screenshot both apps with Playwright (chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, require `@playwright/test`
  from `/home/claude/beeteam/web-vue`) and compare your screens at 1440×900.
- Only create/modify files your package owns. Do not run `git` commands that
  change state (no commit/checkout/stash); the orchestrator commits.

## Shared building blocks (already ported — read the source before using)
Primitives in `app/components/`: `Avatar` (`name`, `hue`, `size?`; `initialsOf` lives in
`~/components/Avatar` .ts sibling), `Pill` (`variant?`, `dot?`, default slot), `Modal`
(`title`; emits `close`; default slot), `SegControl` (`options`, `value`; emits
`change(value)` — not v-model; type `SegOption` exported from the .vue), `MoodTrendBars`
(`trend`), `StatCard`, `FileDropzone` (`memberId`, `meetingId?`; emits `uploaded`),
`grades/GradeChip` (`ord`, `code`, `size?`), `NoAccess` (needs a router in tests),
`Topbar` (`title`), `Logo`, `ui/Button`.

Query hooks in `app/lib/query/*`: same names as React. Every plain-value parameter is
`MaybeRefOrGetter<T>` — pass a getter (`() => props.memberId`) so keys stay reactive.
Results and mutation flags (`data`, `isLoading`, `isPending`) are refs. `useMeetingAutosave`
and `useReviewAutosave` return `status` as a `ComputedRef`; as in React nothing flushes
on unmount — call `flush()` yourself where React did.

Session user: pages use `useSessionUser()` (auto-import); components receive it as a prop.
Drawer: `import { useDrawerStore } from "~/stores/drawer"` (`open(id)`, `close()`, `openMeetingId`).
