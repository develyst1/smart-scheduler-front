# CLAUDE.md — smart-scheduler-front (Frontoffice Web)

Guides Claude Code (and other agents) in this repo. For the cross-repo map see the
workspace root `../CLAUDE.md`.

## What this is

The **frontoffice web app** — the staff-facing screen that replaces the manual **Excel**
scheduling workflow for a tutoring school, to cut **human error**. Audience: **internal
staff/admins** (not students/parents). Part of **Option C (Ultimate)** — the scheduling
frontoffice; most-built repo in the workspace.

> Business spec (Thai): **[docs/requirement-timeline.md](docs/requirement-timeline.md)** (living
> spec, newest entry wins; synced from workspace root `docs/`). The hard part is **domain logic**,
> not the UI.
>
> **Tasks/scope live in the `smart-scheduler-requirement` repo, not a `todo.md`** (todo files were
> removed 2026-07-08 — do not recreate them). Open `smart-scheduler-requirement/requirement.html`
> and treat `Partial` / `Planned` items as the work queue. See the root `../CLAUDE.md` §"How work is
> assigned" for the full policy.

## Stack (as actually installed — see [package.json](package.json))

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Mantine v9** UI — `@mantine/core`, `@mantine/dates`, `@mantine/hooks`, `@mantine/notifications`
  > NOTE: this repo uses **Mantine**, not Ant Design. (An older draft of this file said AntD — that
  > was wrong.) Both FE repos standardize on Mantine.
- **Tailwind CSS v3** — utilities only; **semantic color names** are bridged to Mantine in
  [src/lib/ui/colors.ts](src/lib/ui/colors.ts)
- **TanStack Query v5** (server state) + **Axios** (HTTP) + **dayjs** (dates) + **lucide-react** (icons)
- Package manager: **bun** (`bun.lock`). Path alias **`@/*` → `./src/*`** ([tsconfig.json](tsconfig.json)).

```bash
bun install
bun run dev      # local dev server
bun run build    # production build
bun run lint     # lint
```

## Architecture — layered, framework-light domain

Data flows **page → partial → hook → service → (API)**, with pure domain logic kept aside:

| Layer | Location | Rule |
|-------|----------|------|
| **Types & domain constants** | `src/types/app/<domain>/index.ts` | Types + `const` maps (labels, colors, quotas). [example](src/types/app/scheduler/index.ts) |
| **Pure domain logic** | `src/lib/<domain>/*.ts` | Framework-free, no React/IO, **unit-testable** (e.g. [leave.ts](src/lib/scheduler/leave.ts)). |
| **UI helpers** | `src/lib/ui/*` | [notify.ts](src/lib/ui/notify.ts) (toast wrapper), [colors.ts](src/lib/ui/colors.ts) (semantic→Mantine). |
| **Data access** | `src/services/<domain>.service.ts` | The only place that talks to the backend. Calls **Scheduling API** by default (`NEXT_PUBLIC_API_URL`); mock via `NEXT_PUBLIC_USE_MOCK=true`. |
| **Server-state hooks** | `src/hooks/<domain>/*.ts` | TanStack Query `use*` hooks; query keys as `const`; mutations `invalidateQueries`. [example](src/hooks/scheduler/useScheduler.ts) |
| **Routes (thin)** | `src/app/(group)/.../page.tsx` | Server component that just renders a partial. [example](src/app/(admin)/scheduler/calendar/page.tsx) |
| **Feature UI** | `src/components/partials/<Feature>/<Feature>Content.tsx` | `"use client"` container + sub-components + `Modal/`. |
| **Layout / shared** | `src/components/layout/*`, `src/components/common/*` | Config-driven nav ([AdminLayout.config.ts](src/components/layout/AdminLayout/AdminLayout.config.ts)). |
| **Providers** | `src/context/*` | `MantineProviders`, `QueryProvider`. |

Conventions:
- Pages stay thin (delegate to a `*Content` partial). Mark client components `"use client"`.
- Use the semantic color set (`default/primary/secondary/success/warning/danger`) — **restrained
  color is an explicit client request**; keep the calendar calm/uncluttered.
- Toasts go through `notify(...)`; never hand-roll Mantine notifications in partials.
- The UI is **English-default** via the in-repo i18n layer ([src/lib/i18n](src/lib/i18n)); Thai is a
  toggle. Never hardcode user-facing copy — add keys to `dictionaries.ts` and render via `t(...)`.

## Connecting to the backend

`src/services/scheduler.service.ts` calls **`smart-scheduler-back`** (Bun + Hono) via Axios.
Set `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api`). Use `NEXT_PUBLIC_USE_MOCK=true`
for offline mock ([scheduler.mock.service.ts](src/services/scheduler.mock.service.ts)).
- **LINE push is the backend's job.** `confirmBooking` only calls the API; the server enqueues LINE
  via the outbox. The browser must never hold LINE tokens.
- **Overbooking (จองทับ)** — the old move-to-another-day/week/teacher reschedule flow and its
  `PENDING_RESCHEDULE` status were **removed 2026-07-11 (UC-006)**. Staff may now only overbook a
  slot whose occupant is on leave (`SICK_LEAVE`); a plain `createBooking` inserts into the freed
  slot, and overbooking an active slot 409s (`SLOT_TAKEN`). No `with-reschedule` endpoints exist.

## Domain logic you must not break (from requirement.md)

- **Calendar hours:** **09:00–18:00** (nine one-hour slots) — `TIME_SLOTS` in
  [types](src/types/app/scheduler/index.ts).
- **Teacher priority:** schedule **Full-time / Part-time first** (flat-rate), then **Freelance**
  (paid per actual hour). Preserve `TEACHER_TYPE_PRIORITY` ordering in any auto-assignment.
- **Booking types:** First Trial (tag/color, follow-up) · Single Session (1 hr) · Course Package
  (4/6/10, **fixed day+time**, with expiry) · Voucher (5/10/15 hrs → **3/6/9-month** validity from
  first booking, **no fixed slot, cannot pick a teacher**).
- **Leave quota bound to package size:** 4→**1** leave (extend ≤ week 5), 6→**2**, 10→**3**
  (extend ≤ week 13). Over quota → **lock** rescheduling until an **admin** unlocks (special cases).
  Mirrored here in [leave.ts](src/lib/scheduler/leave.ts), but the **backend is the source of truth**.
- **Manual Move/Add:** staff can move or add a session by hand for special cases.
- **Statuses:** `PENDING → CONFIRMED → ATTENDED / SICK_LEAVE → EXTENDED / CANCELLED`.

> ⚠️ `MAX_WEEK_BY_SIZE` for the 6-session course is coded as **week 8** — the spec only fixes
> 4→week 5 and 10→week 13. Confirm the real rule before trusting it.
