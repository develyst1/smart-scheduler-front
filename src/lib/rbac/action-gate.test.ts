import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_FORBIDDEN_SENTENCE, ACTION_KEYS_SNAPSHOT, DISCOUNT_FORBIDDEN_SENTENCE, LEAVE_OVERRIDE_FORBIDDEN_SENTENCE, can } from "./actions";

/**
 * REQ-092 Stage 3 / TASK-386 — ONE gate (`can`) on every mutate control; the `Actions` checklist rendered from
 * `GET /permissions`; the action refusal told apart from the menu one.
 *
 * 🔑 The FE keeps NO list of action names: `ACTION_KEYS_SNAPSHOT` is a test-only mirror of the BE's `ACTION_KEYS` (46,
 * TASK-385) and the report states it equals the BE's list key for key. This file walks `src` for every `can("action:…")`
 * literal and refuses one the snapshot does not know — so a typo at a site cannot silently open a control — and pins
 * which snapshot keys have NO site (the two acts the FE never calls today). Hidden, never disabled.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
const SITE_FILES = walk("src/components").concat(walk("src/app"));
// every `"action:…"` literal at a site — the `can("…")` shape and the `can(isEdit ? "…" : "…")` shape alike
const sites = SITE_FILES.flatMap((f) => [...codeOf(f).matchAll(/"(action:[a-z.-]+)"/g)].map((m) => ({ file: f.replace(/\\/g, "/"), key: m[1] })));
const KEYS = [...ACTION_KEYS_SNAPSHOT] as string[];
/** One entry per `"action:…"` literal at a site: `file → key`, sorted. A file with two literals appears twice. */
const siteLine = (s: { file: string; key: string }) => `${s.file} → ${s.key}`;

/**
 * 🔻 **TASK-709 (F-012) — every count in this file is now the LIST it counted, so a change breaks ONE assertion and its diff NAMES what moved.**
 * It replaced `sites.length === 110` and `new Set(files).size === 40` — one population counted at two levels, neither saying what it held; the
 * site list below already carries each file, so a separate file list would make a gate in a new file break two assertions again. ✅ Nothing is
 * loosened: each list must equal today's set EXACTLY (`toEqual`, never `toContain` / `>=`). 🔑 **When you add a gate, add its line here** — that
 * is the whole job, and the diff of the failing run is the line to add.
 * (TASK-696's named check — `LinkParentDialog` asking `people.parent-create` — is covered by the list itself.)
 */
const SITE_INVENTORY = [
  "src/components/common/DiscountSection.tsx → action:sales.discount",
  "src/components/common/UndoControl.tsx → action:calendar.undo",
  "src/components/partials/Badges/BadgesContent.tsx → action:badges.type-create",
  "src/components/partials/Badges/BadgesContent.tsx → action:badges.type-edit",
  "src/components/partials/Badges/BadgesContent.tsx → action:badges.value-create",
  "src/components/partials/Badges/BadgesContent.tsx → action:badges.value-edit",
  "src/components/partials/Bookings/BookingsContent.tsx → action:bookings.course-create",
  "src/components/partials/Bookings/BookingsContent.tsx → action:bookings.course-import",
  "src/components/partials/Bookings/BookingsContent.tsx → action:bookings.voucher-create",
  "src/components/partials/Bookings/BookingsContent.tsx → action:bookings.voucher-import",
  "src/components/partials/Bookings/BookingsContent.tsx → action:calendar.rental-sale",
  "src/components/partials/Bookings/BookingsTable.tsx → action:bookings.bulk-confirm",
  "src/components/partials/Bookings/ChangeTeacherTimeDialog.tsx → action:bookings.course-plan",
  "src/components/partials/Bookings/CoursePackagePanel.tsx → action:bookings.coach-rate",
  "src/components/partials/Bookings/CoursePackagePanel.tsx → action:bookings.course-edit",
  "src/components/partials/Bookings/CoursePackagePanel.tsx → action:bookings.course-expiry",
  "src/components/partials/Bookings/CoursePackagePanel.tsx → action:bookings.course-rental",
  "src/components/partials/Bookings/CreateCourseModal.tsx → action:bookings.course-create",
  "src/components/partials/Bookings/CreatePlanFlow.tsx → action:bookings.course-create",
  "src/components/partials/Bookings/CreateVoucherModal.tsx → action:bookings.voucher-create",
  "src/components/partials/Bookings/DropResumeDialog.tsx → action:bookings.course-drop",
  "src/components/partials/Bookings/EditExpiryDialog.tsx → action:bookings.course-expiry",
  "src/components/partials/Bookings/EndCourseDialog.tsx → action:bookings.course-cancel",
  "src/components/partials/Bookings/ImportBalanceModal.tsx → action:bookings.course-import",
  "src/components/partials/Bookings/ImportBalanceModal.tsx → action:bookings.voucher-import",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-cancel",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-confirm",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-drop",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-extra-session",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-plan",
  "src/components/partials/Bookings/PlanModal.tsx → action:bookings.course-plan",
  "src/components/partials/Bookings/PlanModal.tsx → action:calendar.booking-edit",
  "src/components/partials/Bookings/PlanModal.tsx → action:calendar.note",
  "src/components/partials/Bookings/PlanModal.tsx → action:calendar.status",
  "src/components/partials/Bookings/VoucherPanel.tsx → action:bookings.course-cancel",
  "src/components/partials/Bookings/VoucherPanel.tsx → action:bookings.course-expiry",
  "src/components/partials/Calendar/CalendarContent.tsx → action:calendar.teacher-leave",
  "src/components/partials/Calendar/CalendarGrid.tsx → action:calendar.book",
  "src/components/partials/Calendar/CalendarHeader.tsx → action:calendar.status",
  "src/components/partials/Calendar/CalendarWeekGrid.tsx → action:calendar.book",
  "src/components/partials/Calendar/CancelLeaveButton.tsx → action:calendar.status",
  "src/components/partials/Calendar/LeaveDayPanel.tsx → action:calendar.status",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:bookings.course-create",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.badges",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.book",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.book",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.book",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.booking-edit",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.booking-edit",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.booking-edit",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.booking-edit",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.group-series",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.leave-override",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.other-series",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.pause",
  "src/components/partials/Calendar/Modal/BookingModal.tsx → action:calendar.status",
  "src/components/partials/Calendar/Modal/CampBlockPanel.tsx → action:camp.week-open",
  "src/components/partials/Calendar/Modal/CancelBookingDialog.tsx → action:calendar.status",
  "src/components/partials/Calendar/Modal/ClashResolveBox.tsx → action:calendar.booking-edit",
  "src/components/partials/Calendar/Modal/RentalSection.tsx → action:calendar.rental",
  "src/components/partials/Camp/CampCardModal.tsx → action:camp.redeem",
  "src/components/partials/Camp/CampCardModal.tsx → action:camp.sell",
  "src/components/partials/Camp/CampContent.tsx → action:camp.week-open",
  "src/components/partials/Camp/CampContent.tsx → action:camp.week-open",
  "src/components/partials/Camp/CampContent.tsx → action:camp.week-open",
  "src/components/partials/Camp/CampContent.tsx → action:camp.week-open",
  "src/components/partials/Camp/WeekRoster.tsx → action:camp.day-mark",
  "src/components/partials/Camp/WeekRoster.tsx → action:camp.redeem",
  "src/components/partials/Camp/WeekRoster.tsx → action:camp.sell",
  "src/components/partials/Camp/WeekRoster.tsx → action:camp.week-open",
  "src/components/partials/LinkRequests/LinkRequestsContent.tsx → action:link-requests.decide",
  "src/components/partials/LinkRequests/LinkRequestsContent.tsx → action:link-requests.unlink",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:bookings.course-confirm",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.booking-edit",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.booking-edit",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.group-series",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.other-cancel-all",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.other-cancel-all",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.other-series",
  "src/components/partials/OtherSeries/OtherSeriesModal.tsx → action:calendar.status",
  "src/components/partials/People/LinkParentDialog.tsx → action:people.parent-create",
  "src/components/partials/People/ParentFormModal.tsx → action:people.parent-create",
  "src/components/partials/People/ParentFormModal.tsx → action:people.parent-edit",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-archive",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-archive",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-create",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-edit",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-line-unlink",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-students",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-students",
  "src/components/partials/People/PeopleContent.tsx → action:people.parent-suspend",
  "src/components/partials/People/PeopleContent.tsx → action:people.student-archive",
  "src/components/partials/People/PeopleContent.tsx → action:people.student-archive",
  "src/components/partials/People/PeopleContent.tsx → action:people.student-archive",
  "src/components/partials/People/PeopleContent.tsx → action:people.student-delete",
  "src/components/partials/People/PeopleContent.tsx → action:people.student-edit",
  "src/components/partials/People/StudentFormModal.tsx → action:people.parent-students",
  "src/components/partials/People/StudentFormModal.tsx → action:people.student-edit",
  "src/components/partials/Rental/RentalModal.tsx → action:calendar.rental-sale",
  "src/components/partials/Settings/SettingsContent.tsx → action:settings.edit",
  "src/components/partials/Teachers/ArchivedTeachers.tsx → action:teachers.archive",
  "src/components/partials/Teachers/FreelanceBudgetControls.tsx → action:teachers.budget",
  "src/components/partials/Teachers/FreelanceBudgetControls.tsx → action:teachers.budget-view",
  "src/components/partials/Teachers/TeacherFormModal.tsx → action:teachers.create",
  "src/components/partials/Teachers/TeacherFormModal.tsx → action:teachers.edit",
  "src/components/partials/Teachers/TeacherLeaveList.tsx → action:calendar.status",
  "src/components/partials/Teachers/TeacherRowActions.tsx → action:calendar.status",
  "src/components/partials/Teachers/TeacherRowActions.tsx → action:teachers.archive",
  "src/components/partials/Teachers/TeacherRowActions.tsx → action:teachers.edit",
  "src/components/partials/Teachers/TeacherWorkDaysSelect.tsx → action:teachers.work-days",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.availability",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.availability",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.availability",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.create",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.limit-override",
  "src/components/partials/Teachers/TeachersContent.tsx → action:teachers.type-order",
];

/** The registry, in the BE's order (the snapshot mirrors `ACTION_KEYS`). */
const KEY_INVENTORY = [
  "action:calendar.book",
  "action:calendar.booking-edit",
  "action:calendar.status",
  "action:calendar.leave-override",
  "action:calendar.pause",
  "action:calendar.badges",
  "action:calendar.note",
  "action:calendar.rental",
  "action:calendar.rental-sale",
  "action:calendar.other-series",
  "action:calendar.group-series",
  "action:calendar.other-cancel-all",
  "action:calendar.teacher-leave",
  "action:calendar.undo",
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
  "action:bookings.course-rental",
  "action:people.student-create",
  "action:people.student-edit",
  "action:people.student-delete",
  "action:people.parent-create",
  "action:people.parent-edit",
  "action:people.parent-students",
  "action:people.parent-suspend",
  "action:people.parent-line-unlink",
  "action:people.student-archive",
  "action:people.parent-archive",
  "action:teachers.create",
  "action:teachers.edit",
  "action:teachers.archive",
  "action:teachers.budget",
  "action:teachers.budget-view",
  "action:bookings.coach-rate",
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
  "action:camp.week-open",
  "action:camp.sell",
  "action:camp.redeem",
  "action:camp.day-mark",
  "action:settings.edit",
  "action:sales.discount",
];

/** The keys of `dictionaries.en.users` (sorted). */
const USERS_KEY_INVENTORY = [
  "actionsAll",
  "actionsBody",
  "actionsCount",
  "actionsSavedOk",
  "actionsTitle",
  "admin",
  "areaMenuNotGranted",
  "areaSales",
  "colActions",
  "colCreated",
  "colDisplayName",
  "colLine",
  "colMenus",
  "colRole",
  "colRoleName",
  "colStatus",
  "colUsername",
  "create",
  "createTitle",
  "createdOk",
  "disable",
  "disableBody",
  "disableTitle",
  "disabledOk",
  "displayName",
  "edit",
  "editTitle",
  "enable",
  "enabledOk",
  "fromRole",
  "lineLegacyMark",
  "lineLinked",
  "lineNotLinked",
  "menusAll",
  "menusBody",
  "menusCount",
  "menusSavedOk",
  "menusSelectAll",
  "menusSelectNone",
  "menusTitle",
  "moreActions",
  "newPassword",
  "noAccess",
  "password",
  "passwordConfirm",
  "passwordHint",
  "passwordMismatch",
  "resetBody",
  "resetConfirm",
  "resetOk",
  "resetPassword",
  "resetTitle",
  "roleNone",
  "roleSavedOk",
  "savedOk",
  "statusDisabled",
  "statusEnabled",
  "superAdmin",
  "superAdminToggle",
  "teacherLine",
  "teacherLink",
  "teacherLinkHint",
  "teacherNone",
  "title",
  "unlinkLine",
  "unlinkLineConfirm",
  "username",
  "usernameHint",
  "you",
];

/** The keys of `dictionaries.en.rbac` (sorted). */
const RBAC_KEY_INVENTORY = [
  "goTo",
  "noMenu",
  "shellBody",
  "shellTitle",
];

describe("§1 — ONE gate, everywhere", () => {
  it("can(): a super admin may do all; anyone else needs the grant; unknown access ⇒ nothing (value-tested)", () => {
    const two = { isSuperAdmin: false, menus: [], actions: ["action:calendar.book", "action:settings.edit"] };
    expect(can(two, "action:calendar.book")).toBe(true);
    expect(can(two, "action:settings.edit")).toBe(true);
    expect(can(two, "action:calendar.status")).toBe(false);
    expect(can({ isSuperAdmin: true, menus: [], actions: [] }, "action:calendar.status")).toBe(true);
    expect(can({ isSuperAdmin: false, menus: [], actions: [] }, "action:calendar.book")).toBe(false);
    expect(can(undefined, "action:calendar.book")).toBe(false);
    expect(can(null, "action:calendar.book")).toBe(false);
    // the hook is the one door to it: reads the same /me the nav and the route guard read
    const useMe = codeOf("src/hooks/scheduler/useMe.ts");
    expect(useMe).toContain("export const useCan = (): ((action: ActionKey) => boolean) => {");
    expect(useMe).toContain("return (action) => can(access, action);");
    expect(useMe).toContain("actions: Array.isArray(q.data.actions) ? q.data.actions : []");
    expect(codeOf("src/types/api/contract.ts")).toContain("isSuperAdmin: boolean; menus: string[]; actions: string[]; roleName: string | null; teacherId: string | null };"); // TASK-407 + teacherId
    expect(codeOf("src/auth.ts")).toContain("actions: Array.isArray(data.user.actions) ? data.user.actions : [],");
  });

  it("the snapshot: the registry equals its named list, in 9 areas; every key a site uses exists; exactly two keys have no FE site", () => {
    expect(KEYS).toEqual(KEY_INVENTORY);
    const areas = [...new Set(KEYS.map((k) => k.slice("action:".length, k.indexOf("."))))];
    expect(areas).toEqual(["calendar", "bookings", "people", "teachers", "link-requests", "badges", "camp", "settings", "sales"]); // camp after badges, as the BE
    for (const k of KEYS) expect(k).toMatch(/^action:[a-z-]+\.[a-z-]+$/);
    // every literal at a site is a registry key — a typo cannot open a control
    const unknown = sites.filter((s) => !KEYS.includes(s.key));
    expect(unknown).toEqual([]);
    // the two acts the FE never calls today: `POST /students` (the booking form creates through the parent) and
    // `POST /teachers/:id/calendar-link` (no FE caller, placed by area on the BE side too)
    const used = new Set(sites.map((s) => s.key));
    // judged against the NAMED registry, not the live one: a new key then breaks the registry list above and ONLY that assertion
    expect(KEY_INVENTORY.filter((k) => !used.has(k))).toEqual(["action:people.student-create", "action:teachers.calendar-link"]);
  });

  it("the sweep: every `action:…` literal at a site — file and key — equals the named site list (the gate asked at its own site)", () => {
    // 🔻 TASK-709: this was `sites.length === 110` + `files.size === 40` + a narrated history of which TASK added which gate. The list says it now.
    expect(sites.map(siteLine).sort()).toEqual(SITE_INVENTORY);
    // hidden, never disabled: no site turns the gate into a `disabled` prop
    for (const f of SITE_FILES) expect({ f, hit: /disabled=\{!can\(/.test(readFileSync(f, "utf8")) }).toEqual({ f, hit: false });
    // the sites the report lists, one per area, are really there
    const has = (file: string, key: string) => sites.some((s) => s.file.endsWith(file) && s.key === key);
    expect(has("Calendar/CalendarGrid.tsx", "action:calendar.book")).toBe(true);
    expect(has("Calendar/Modal/BookingModal.tsx", "action:calendar.leave-override")).toBe(true);
    expect(has("Bookings/BookingsTable.tsx", "action:bookings.bulk-confirm")).toBe(true);
    expect(has("Bookings/PlanModal.tsx", "action:bookings.course-plan")).toBe(true);
    expect(has("People/PeopleContent.tsx", "action:people.student-delete")).toBe(true);
    expect(has("Teachers/TeachersContent.tsx", "action:teachers.type-order")).toBe(true);
    expect(has("LinkRequests/LinkRequestsContent.tsx", "action:link-requests.decide")).toBe(true);
    expect(has("Badges/BadgesContent.tsx", "action:badges.value-edit")).toBe(true);
    expect(has("Settings/SettingsContent.tsx", "action:settings.edit")).toBe(true);
    expect(has("common/DiscountSection.tsx", "action:sales.discount")).toBe(true);
  });

  it("a few shapes that matter: status is ONE act on four buttons; the ⋯ menu goes when empty; the two grids' `+`; the discount by key", () => {
    const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
    // TASK-407 — under a linked account the key is `attend` alone: `canAttend` keeps it, `canStatus` needs `!scoped`.
    expect(modal).toContain('const canAttend = can("action:calendar.status");');
    expect(modal).toContain("const canStatus = canAttend && !scoped;");
    // TASK-531 D5 — the leave item now reads `{canStatus && booking.status !== "ATTENDED" && (` (an attended row is an
    // UNDO, and its dialog must not promise the family quota). The ACT is still ONE key on the four buttons, which is
    // what this pin is for, so it names both shapes rather than the bare one that no longer exists.
    expect(modal).toContain('{canStatus && booking.status !== "ATTENDED" && (');
    expect(modal).toContain("{canOfferConfirm(booking.status) && canStatus && (");
    expect(modal).toContain("{canOfferConfirm(booking.status) && canStatus && ("); // TASK-409 — PENDING + EXTENDED through one list
    expect(modal).toContain("const menuHasItems =");
    expect(modal).toContain("{menuHasItems && (");
    expect(modal).toContain('const canOverbook = booking.status === "SICK_LEAVE" && can("action:calendar.book");');
    expect(modal).toContain('const canMove = MOVABLE_STATUSES.includes(booking.status) && can("action:calendar.booking-edit");');
    expect(codeOf("src/components/partials/Calendar/CalendarGrid.tsx")).toContain("!canBook ? (");
    expect(codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx")).toContain("{canBook && mayBook && (");
    const d = codeOf("src/components/common/DiscountSection.tsx");
    expect(d).toContain('if (!can("action:sales.discount")) return null;');
    expect(d).not.toMatch(/role/);
    // the Users page's own actions stay super-admin-gated (no action key anywhere on it)
    expect(codeOf("src/components/partials/Users/UsersContent.tsx")).not.toMatch(/"action:[a-z]/); // only the `"action:"` prefix split, no key
    // the three forms that serve create AND edit ask the right key for the mode (create ≠ edit is the BE's naming rule)
    expect(codeOf("src/components/partials/Teachers/TeacherFormModal.tsx")).toContain('can(teacher ? "action:teachers.edit" : "action:teachers.create")');
    expect(codeOf("src/components/partials/People/ParentFormModal.tsx")).toContain('can(isEdit ? "action:people.parent-edit" : "action:people.parent-create")');
    expect(codeOf("src/components/partials/People/StudentFormModal.tsx")).toContain('can(isEdit ? "action:people.student-edit" : "action:people.parent-students")');
  });
});

describe("§2 — the Actions checklist, rendered from GET /permissions", () => {
  const page = codeOf("src/components/partials/Users/UsersContent.tsx");
  it("PUT /users/:id/actions { keys } — registry keys only, in the registry's order; a super admin row has no checklist", () => {
    expect(codeOf("src/services/users.service.ts")).toContain("api.put<{ user: UserDTO }>(`/users/${id}/actions`, { keys })");
    expect(codeOf("src/services/me.service.ts")).toContain('api.get<PermissionRegistry>("/permissions")');
    expect(page).toContain("const { data: registry, isLoading, error: registryError } = usePermissions(user !== null);");
    expect(page).toContain("await save.mutateAsync({ id: user.id, keys: allKeys.filter((k) => keys.includes(k)) });");
    expect(page).toContain('t("users.colActions")');
    expect(page).toContain('t("users.actionsAll")');
    expect(page).toContain('t("users.actionsCount", { n: String(user.actions?.length ?? 0) })');
  });

  it("grouped by area under the menu's own nav label, the BE's label per row in `lang`, select-all per group and overall, the not-granted hint", () => {
    // Stage 4 moved the checklist body into the SHARED `GrantChecklists.tsx`; the dialog mounts it with the OWN rows
    const shared = codeOf("src/components/partials/Users/GrantChecklists.tsx");
    expect(shared).toContain("export const NAV_BY_AREA = new Map(");
    expect(shared).toContain("const areas = [...new Set(actions.map((a) => a.area))];");
    expect(shared).toContain('{nav ? t(nav.labelKey) : t("users.areaSales")}');
    expect(shared).toContain('label={lang === "th" ? a.labelTh : a.labelEn}');
    expect(shared).toContain("onClick={() => onChange(withKeys(value, rowKeys, !allOn))}");
    expect(shared).toContain("onClick={() => onChange(withKeys(value, allKeys, true))}");
    expect(shared).toContain("const menuMissing = !!menus && !!nav?.menuKey && !menus.includes(nav.menuKey);");
    expect(shared).toContain('t("users.areaMenuNotGranted")');
    expect(page).toContain("<ActionsChecklist");
    expect(page).toContain("menus={user?.isSuperAdmin ? MENU_KEYS : (user?.menus ?? [])}");
    // no FE list of action names: no `labelEn:` / `labelTh:` literal and no snapshot import on the page or the shared file
    expect(page).not.toMatch(/labelEn:|labelTh:|ACTION_KEYS_SNAPSHOT/);
    expect(shared).not.toMatch(/labelEn:|labelTh:|ACTION_KEYS_SNAPSHOT/);
  });
});

describe("§3 — the sentences, and the copy", () => {
  it("the action refusal is its own sentence, distinct from the menu one and from the two body-level ones; the client shows the server's", () => {
    const menu = "ไม่มีสิทธิ์เข้าถึงเมนูนี้";
    expect(ACTION_FORBIDDEN_SENTENCE).toBe("ไม่มีสิทธิ์ทำรายการนี้");
    expect(DISCOUNT_FORBIDDEN_SENTENCE).toBe("ไม่มีสิทธิ์ให้ส่วนลด");
    expect(LEAVE_OVERRIDE_FORBIDDEN_SENTENCE).toBe("ไม่มีสิทธิ์ยกเว้นกฎแจ้งลาล่วงหน้า");
    expect(new Set([menu, ACTION_FORBIDDEN_SENTENCE, DISCOUNT_FORBIDDEN_SENTENCE, LEAVE_OVERRIDE_FORBIDDEN_SENTENCE]).size).toBe(4);
    // no FE copy replaces any of them: the dictionaries carry none of the three action sentences
    const all = JSON.stringify(dictionaries);
    for (const s of [ACTION_FORBIDDEN_SENTENCE, DISCOUNT_FORBIDDEN_SENTENCE, LEAVE_OVERRIDE_FORBIDDEN_SENTENCE]) expect(all).not.toContain(s);
    // any 403 re-reads /me (a revoked act hides its control on the next read); the sentence itself is thrown as-is
    const client = codeOf("src/lib/api/client.ts");
    expect(client).toContain('if (error.response?.status === 403 && typeof window !== "undefined") window.dispatchEvent(new Event(FORBIDDEN_EVENT));');
    expect(client).toContain("throw new ApiClientError(");
  });

  it("copy: users +8 (54 × 2); nothing else moved", () => {
    const en = dictionaries.en.users as Record<string, string>;
    const th = dictionaries.th.users as Record<string, string>;
    expect(Object.keys(en).sort()).toEqual(USERS_KEY_INVENTORY); // TASK-709: the keys, not 63
    for (const k of ["colActions", "actionsAll", "actionsCount", "actionsTitle", "actionsBody", "actionsSavedOk", "areaSales", "areaMenuNotGranted"]) {
      expect(en[k]?.length).toBeGreaterThan(0);
      expect(th[k]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(dictionaries.en.rbac).sort()).toEqual(RBAC_KEY_INVENTORY); // TASK-709: the keys, not 4
  });
});
