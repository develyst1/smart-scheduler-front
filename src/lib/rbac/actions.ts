// REQ-092 RBAC Stage 3 (TASK-386, SPEC-079 §2) — the ACTION side of access. 🔴 The FE keeps NO list of action names or
// labels: `GET /permissions` (the BE's `ACTION_REGISTRY`, TASK-385) is the only source, rendered as the Users page's
// checklist. What the FE has is (1) `can()`, ONE gate every mutate control asks, and (2) the key STRINGS used at the
// sites, typed only by shape — plus, for the test alone, a checked-in SNAPSHOT of the BE's 46 keys so that every
// key a site uses is pinned to exist (no cross-repo import; the report states the snapshot equals the BE's list).
//
// 🔑 The server is the guard (`403 FORBIDDEN "ไม่มีสิทธิ์ทำรายการนี้"` — its own sentence, distinct from the menu one).
// Not granted ⇒ the control is HIDDEN, not disabled: a disabled button invites a question the user cannot answer.

import type { MenuAccess } from "./menus";

/** The shape of an action key — the registry (BE) owns the actual names. */
export type ActionKey = `action:${string}.${string}`;

/**
 * REQ-097 (TASK-406/407) — a LINKED account (`teacherId` set) is scoped by the server to its own calendar: every write
 * but `attend` and the own-leave is `403 SCOPE_TEACHER` regardless of role (a linked super admin too). These two are
 * the only act keys whose doors may show under the flag; the rest are hidden by the same gate that hides an ungranted
 * one. The FE mirrors the server's set; it decides nothing.
 */
export const TEACHER_SCOPE_ACTIONS: readonly ActionKey[] = ["action:calendar.status", "action:calendar.teacher-leave"];

/** "May this user do this act?" — a super admin may do all; anyone else needs the grant; a scoped account only its two. Pure. */
export const can = (me: MenuAccess | null | undefined, action: ActionKey): boolean =>
  !!me && (!me.teacherId || TEACHER_SCOPE_ACTIONS.includes(action)) && (me.isSuperAdmin || me.actions.includes(action));

/** The two body-level refusals and the route-level one — the server's own sentences, told apart by the client. */
export const ACTION_FORBIDDEN_SENTENCE = "ไม่มีสิทธิ์ทำรายการนี้";
export const DISCOUNT_FORBIDDEN_SENTENCE = "ไม่มีสิทธิ์ให้ส่วนลด";
export const LEAVE_OVERRIDE_FORBIDDEN_SENTENCE = "ไม่มีสิทธิ์ยกเว้นกฎแจ้งลาล่วงหน้า";
/** REQ-097 — the route-level refusal for a linked account outside its set (the server's sentence, told apart by code). */
export const SCOPE_TEACHER_CODE = "SCOPE_TEACHER";

/**
 * 🔴 TEST-ONLY SNAPSHOT of the BE's `ACTION_KEYS` (`lib/permissions.ts`, TASK-385 — 46: 44 route keys + the two
 * body-level ones; TASK-390 added the 47th, `bookings.course-rental`; TASK-392 the 48th, `people.student-archive`; TASK-394 the 49th, `calendar.other-series`; TASK-397 the 50th, `calendar.group-series`; TASK-401 the four `camp.*` ⇒ 54; TASK-406 the 55th, `calendar.teacher-leave`). Nothing at runtime reads it. `action-gate.test.ts` walks `src` for every `can("action:…")` literal
 * and refuses one that is not here; the report states this list equals the BE's, key for key, and updating it is a
 * task, not a drift. `area` = the part between `action:` and the dot.
 */
export const ACTION_KEYS_SNAPSHOT = [
  "action:calendar.book",
  "action:calendar.booking-edit",
  "action:calendar.status",
  "action:calendar.leave-override",
  "action:calendar.pause",
  "action:calendar.badges",
  "action:calendar.note",
  "action:calendar.rental",
  "action:calendar.rental-sale",
  "action:calendar.other-series", // TASK-394/395 — the SERIES; a single OTHER stays under `book`
  "action:calendar.group-series", // TASK-397/398 — a DUO/Group series; seats are sold under `bookings.course-create`
  "action:calendar.teacher-leave", // TASK-406/407 — a LINKED account's own leave (`POST /teachers/me/leave`); the link is the identity
  "action:bookings.bulk-confirm",
  "action:bookings.course-create",
  "action:bookings.course-edit",
  "action:bookings.course-plan",
  "action:bookings.course-expiry",
  "action:bookings.course-extra-session",
  "action:bookings.course-confirm",
  "action:bookings.course-drop",
  "action:bookings.course-cancel",
  "action:bookings.course-import",
  "action:bookings.voucher-create",
  "action:bookings.voucher-import",
  "action:bookings.course-rental", // TASK-390/391 — the REMOVE from a course's remaining sessions; the set is under course-create
  "action:people.student-create",
  "action:people.student-edit",
  "action:people.student-delete",
  "action:people.parent-create",
  "action:people.parent-edit",
  "action:people.parent-students",
  "action:people.parent-suspend",
  "action:people.parent-line-unlink",
  "action:people.student-archive", // TASK-392/393 — archive + restore, one key
  "action:teachers.create",
  "action:teachers.edit",
  "action:teachers.archive",
  "action:teachers.budget",
  "action:teachers.limit-override",
  "action:teachers.work-days",
  "action:teachers.availability",
  "action:teachers.type-order",
  "action:teachers.calendar-link",
  "action:link-requests.decide",
  "action:link-requests.unlink",
  "action:badges.type-create",
  "action:badges.type-edit",
  "action:badges.value-create",
  "action:badges.value-edit",
  "action:camp.week-open", // TASK-401/402 — Balance camp
  "action:camp.sell",
  "action:camp.redeem",
  "action:camp.day-mark",
  "action:settings.edit",
  "action:sales.discount",
] as const;
