# CLAUDE.md

This file guides Claude Code (and other AI agents) when working in this repository.

## Project: Smart Tutoring Scheduler & Attendance Report System (Frontend)

A back-office (Backend-for-staff) web app for a tutoring school/institute. It replaces the
current manual Excel workflow with a system that manages **teacher schedules** and **student
attendance**, with the explicit goal of reducing **human error**.

- **Audience:** internal staff/admins (not students or parents directly).
- **Repo scope:** this repo (`smart-scheduler-front`) is the **frontend**.
- **Status:** greenfield. As of this writing the repo contains only requirement docs
  ([Requirement.md](Requirement.md), [requirement.png](requirement.png)) — no app code yet.

> The authoritative business spec is **[Requirement.md](Requirement.md)** (Thai). When in
> doubt about a rule, read it before implementing. This file summarizes the key logic; the
> spec wins on conflicts.

## Tech stack (intended)

The `.gitignore` is the standard **Next.js** template, so target:

- **Next.js** (App Router) + **React** + **TypeScript**
- **Ant Design** as the default UI library (house pattern). See the
  `nextjs-antd-pattern` skill for scaffolding components, hooks, services, and types.
- Package manager: npm/yarn (lockfile will decide once added).

Common commands once the app is scaffolded:

```bash
npm install      # install deps
npm run dev      # local dev server
npm run build    # production build
npm run lint     # lint
```

## Domain model (data entities)

### Teachers
Three types, which drive scheduling priority:
1. **Full-time** — flat-rate; schedule to full capacity **first**.
2. **Part-time** — flat-rate; scheduled alongside full-time first.
3. **Freelance** — paid per actual teaching hour; gets remaining slots after full/part-time.

- **Availability control:** staff can disable a single teacher — or **all Freelance teachers** —
  so they don't appear in the booking grid for a given period (e.g. to cut Freelance cost).

### Students / Booking types
1. **First Trial** — one-time trial (customer requests via Line). System should auto-classify/
   tag these (e.g. distinct color/tag) so staff can follow up.
2. **Single Session** — pay-per-hour, no course commitment.
3. **Course Package** — 4 / 6 / 10 sessions, each with an **expiry window** (weeks/months).
4. **Voucher** — packages of 5 / 10 / 15 hours; expiry **~2× longer** than courses (e.g. 6 months).
   Vouchers are **not** fixed to a time slot and **cannot** pick a specific teacher (system
   assigns by availability).

## Core business logic (Phase 1)

### Calendar Dashboard (single-page overview)
- One screen showing **every teacher's schedule for a given day**, time-axis **10:00–18:00**.
- See free/full slots at a glance — no per-teacher drill-down required.
- UI must be clean and calm: **avoid loud/excessive colors**; one-page horizontal scroll across
  all teachers for the day.

### Auto-recurring booking
- Registering a course (e.g. 10 sessions, Sundays 10:00) **auto-locks that slot forward** for
  the quota (e.g. ~10–13 weeks ahead).

### Leave (cancellation) & extension logic
- When a student takes leave (e.g. sick), staff records it; the system **removes that day's
  session** and **auto-appends an extra slot** in a following week.
- **Leave quota is bound to the package** and is strictly enforced:
  - **4-session course:** max **1** leave (schedule may extend to **week 5** max).
  - **6-session course:** max **2** leaves.
  - **10-session course:** max **3** leaves (schedule may extend to **week 13** max).
- Exceeding quota **locks** further rescheduling unless an **admin manually unlocks** it
  (special cases only, e.g. serious accident).

### Booking workflow statuses
Model bookings with explicit states, e.g.:
`Pending → Confirmed → Cancelled / Sick Leave → Extended`.
Keep a **leave counter** tied precisely to the course package to enforce quotas.

## Phase 2 — Notifications & reports
- **Instant notification on confirm:** when staff click **"Confirm schedule"**, send a message
  **immediately** (not 1 hour before class). Delivery channel is **Line** (emphasized by client).
- **Daily summary report:** dashboard totaling per day — students booked, on leave, actually
  attended — so staff can act on the aggregate numbers.

## Phase 3 — Integration / future (only if feasible)
- Current front-desk software is **"Alis To Soft"** (registration, payments, course balance,
  hour deduction with Line alerts to parents, stock).
- **Option 1:** integrate via API so recording attendance/leave here auto-deducts hours in
  Alis To Soft (today it's keyed manually in both systems).
- **Option 2 (build it all):** if no API, later add finance, **Freelance payroll by actual
  hours taught**, and stock — consolidating into a single system.

## Guidance for changes

- **Domain logic is the hard part, not the UI.** Quota counting, expiry windows, and the
  leave/extension rules are the source of correctness bugs — implement them against
  [Requirement.md](Requirement.md) and keep them testable/isolated from UI.
- Preserve the **teacher-priority** ordering (full/part-time before freelance) wherever slots
  are auto-assigned.
- Keep the calendar UI **uncluttered** — restraint with color is an explicit client request.
- Thai is the primary language of the spec and likely the UI; preserve Thai domain terms in
  user-facing copy unless told otherwise.
