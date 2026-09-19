import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT, TEACHER_SCOPE_ACTIONS, can } from "@/lib/rbac/actions";
import { CANCEL_REASON_CODES, END_COURSE_REASONS } from "@/types/app/scheduler";
import { cancelReasonDisplay } from "./cancelled-tray";
import { TEACHER_ALLOWED_ROUTES, columnTeacherIds, isScoped, leaveBody, leaveDefaultTicks } from "./teacher-scope";

/**
 * REQ-097 / SPEC-083 / TASK-406/407 — a teacher's own account. The server scopes (its predicate on every read, its
 * `TEACHER_ALLOWED` set on every route); the FE reads ONE flag (`/me.teacherId`) and shapes the screen: the gate
 * lets only `attend` + the own-leave through, the calendar renders the columns that came, the pickers go, the modal
 * keeps `Check in` alone, `Report leave` is one call. 🔴 The calendar page's load path while scoped must be the
 * server's allowed set EXACTLY, or the page errors on load — walked here, by the hooks the page mounts.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const content = codeOf("src/components/partials/Calendar/CalendarContent.tsx");
const header = codeOf("src/components/partials/Calendar/CalendarHeader.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const leaveDialog = codeOf("src/components/partials/Calendar/Modal/ReportLeaveDialog.tsx");
const users = codeOf("src/components/partials/Users/UsersContent.tsx");
const usersSvc = codeOf("src/services/users.service.ts");
const schedSvc = codeOf("src/services/scheduler.service.ts");
const useMe = codeOf("src/hooks/scheduler/useMe.ts");

/** Every `useX(` a region calls, minus React's and the UI's — what it FETCHES or mutates with. */
const UI_HOOKS = /^use(State|Memo|Effect|Callback|Ref|T|I18n|Disclosure|Can|Me|LoadPhase|Confirm|Form|Id|Router|SearchParams|CellDisplay|ShowCancelled|PausedTrayCollapsed|CancelledTrayCollapsed|TrayCollapsed)$/;
const dataHooks = (src: string) => [...new Set([...src.matchAll(/\b(use[A-Z]\w*)\(/g)].map((m) => m[1]).filter((h) => !UI_HOOKS.test(h)))].sort();
const region = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

describe("§1 — the pure side (value-tested)", () => {
  it("isScoped reads the flag alone; the columns are the payload's own, in first-seen order, deduped", () => {
    expect(isScoped({ teacherId: "t1" })).toBe(true);
    expect(isScoped({ teacherId: null })).toBe(false);
    expect(isScoped(undefined)).toBe(false);
    const cal = { days: [{ date: "2026-09-21", columns: [{ teacher: { id: "t2" } }, { teacher: { id: "t1" } }] }, { date: "2026-09-22", columns: [{ teacher: { id: "t1" } }] }] };
    expect(columnTeacherIds(cal as never)).toEqual(["t2", "t1"]);
    expect(columnTeacherIds(undefined)).toEqual([]);
  });
  it("the ticks: every row but an ATTENDED one; the body: `sessionIds` only for a strict subset, in day order, the reason trimmed", () => {
    const rows = [{ id: "a", status: "CONFIRMED" }, { id: "b", status: "ATTENDED" }, { id: "c", status: "PENDING" }];
    expect(leaveDefaultTicks(rows)).toEqual(["a", "c"]);
    expect(leaveBody("2026-09-21", ["a", "b", "c"], ["c", "a", "b"], "  fever ")).toEqual({ date: "2026-09-21", reason: "fever" });
    expect(leaveBody("2026-09-21", ["a", "b", "c"], ["c", "a"], "fever")).toEqual({ date: "2026-09-21", sessionIds: ["a", "c"], reason: "fever" });
    expect(leaveBody("2026-09-21", ["a"], ["zzz"], "fever")).toEqual({ date: "2026-09-21", sessionIds: [], reason: "fever" });
    expect("sessionIds" in leaveBody("2026-09-21", ["a", "b"], ["a", "b"], "x")).toBe(false);
  });
  it("the allowed set is the server's eight, verbatim", () => {
    expect([...TEACHER_ALLOWED_ROUTES]).toEqual(["GET /calendar", "GET /bookings", "GET /teachers", "GET /badges", "GET /bookings/:id/checkin", "GET /bookings/:id/posted-sale", "PATCH /bookings/:id/status", "POST /teachers/me/leave"]);
  });
});

describe("§2 — ONE gate: a linked account passes only `attend` and the own-leave, whatever its role", () => {
  it("can() under the flag (value-tested): a linked super admin too; unlinked behaviour unchanged", () => {
    const full = ACTION_KEYS_SNAPSHOT as readonly string[];
    const linkedAdmin = { isSuperAdmin: true, menus: [], actions: [], teacherId: "t1" };
    expect(full.filter((k) => can(linkedAdmin, k as never))).toEqual(["action:calendar.status", "action:calendar.teacher-leave"]);
    const linkedRole = { isSuperAdmin: false, menus: [], actions: ["action:calendar.book", "action:calendar.status", "action:calendar.teacher-leave", "action:people.student-edit"], teacherId: "t1" };
    expect(full.filter((k) => can(linkedRole, k as never))).toEqual(["action:calendar.status", "action:calendar.teacher-leave"]);
    expect(can({ ...linkedRole, actions: ["action:calendar.book"] }, "action:calendar.status")).toBe(false); // the grant is still needed
    const unlinked = { ...linkedRole, teacherId: null };
    expect(full.filter((k) => can(unlinked, k as never))).toEqual(["action:calendar.book", "action:calendar.status", "action:calendar.teacher-leave", "action:people.student-edit"]);
    expect([...TEACHER_SCOPE_ACTIONS]).toEqual(["action:calendar.status", "action:calendar.teacher-leave"]);
  });
  it("the 55th key sits in the calendar area after `group-series`; `/me` carries `teacherId` into the access object", () => {
    const i = ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.teacher-leave");
    expect(i).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.group-series") + 1);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(55);
    expect(useMe).toContain("teacherId: q.data.teacherId ?? null }");
  });
});

describe("§3 — the calendar page under the flag", () => {
  it("🔴 the load path is the allowed set exactly: the page mounts four data hooks, each on an allowed route", () => {
    expect(dataHooks(region(content, "export default function CalendarContent", "return ("))).toEqual(["useBadges", "useCalendar", "usePausedBookings", "useTeachers"]);
    expect(schedSvc).toContain('api.get<CalendarResponse>("/calendar"');
    expect(schedSvc).toContain('api.get<TeachersResponse>("/teachers")');
    expect(schedSvc).toContain('api.get<BookingsResponse>("/bookings"');
    expect(codeOf("src/services/badge.service.ts")).toContain('"/badges"');
    expect(codeOf("src/hooks/scheduler/useScheduler.ts")).toContain('getAllBookings({ status: "PAUSED"');
    // the modal's VIEW, mounted on a click, fetches only badges by itself; the rental section (sellable-packages) is off under the flag
    expect(dataHooks(region(modal, "function ViewBooking(", "function MoveBookingForm("))).toEqual(["useBadges", "useConfirmBooking", "useMarkAttended", "useMarkSickLeave", "usePauseBooking", "useResumeBooking", "useSetBookingBadges"]);
    expect(modal).toContain("{!scoped && <RentalSection booking={booking} />}");
  });
  it("the columns are the payload's; the pickers go; `Report leave` only for a LINKED holder of the key", () => {
    expect(content).toContain("const scoped = isScoped(me);");
    expect(content).toContain('const canReportLeave = scoped && can("action:calendar.teacher-leave");');
    expect(content).toContain("const scopedIds = scoped ? columnTeacherIds(calendar) : null;");
    expect(content).toContain("? teachers.filter((t) => scopedIds.includes(t.id))");
    expect(content).toContain("onReportLeave={canReportLeave ? () => setLeaveOpen(true) : undefined}");
    expect(content).toContain("{leaveOpen && <ReportLeaveDialog opened initialDate={date} onClose={() => setLeaveOpen(false)} />}");
    expect(content.match(/scoped=\{scoped\}/g)?.length).toBe(2); // the header and the modal
    expect(header).toMatch(/\{!scoped && \(\s*<>\s*<MultiSelect\s+label=\{t\("calendar\.teacher"\)\}/);
    expect(header).toContain("{onReportLeave && (");
    expect(header).toContain('{t("teacherLeave.door")}');
  });
  it("the modal: `Check in` keeps the key; confirm · sick leave · cancel · the ⋯ menu go with `canStatus`", () => {
    expect(modal).toContain('const canAttend = can("action:calendar.status");');
    expect(modal).toContain("const canStatus = canAttend && !scoped;");
    expect(modal).toMatch(/\{canAttend && \(\s*<Button\s+variant="default"\s+leftSection=\{<BadgeCheck/);
    expect(modal).toContain('{booking.status === "PENDING" && canStatus && (');
    expect(modal).toMatch(/\{canStatus && \(\s*<Menu\.Item\s+leftSection=\{<CalendarX2/);
    expect(modal).toContain("canOverbook || canMove || canStatus ||");
    expect(modal).not.toMatch(/disabled=\{[^}]*scoped/); // hidden, never disabled
  });
});

describe("§4 — `Report leave`: one call, the ticks from the scoped day, the bounds the server's", () => {
  it("the dialog and the wire", () => {
    expect(leaveDialog).toContain('const { data: calendar, isLoading } = useCalendar(date, "day");');
    expect(leaveDialog).toContain("await leave.mutateAsync(leaveBody(date, allIds, ticked, reason));");
    expect(leaveDialog).toContain("disabled={ticked.length === 0 || reason.trim().length === 0}");
    expect(leaveDialog).not.toMatch(/length\s*[<>]=?\s*(3|200)\b/);
    expect(leaveDialog).toContain('t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified })');
    expect(leaveDialog).toContain('{t("teacherLeave.warning")}');
    expect(dataHooks(leaveDialog)).toEqual(["useCalendar", "useReportOwnLeave"]); // nothing outside the set
    expect(schedSvc).toContain('api.post<OwnLeaveResult>("/teachers/me/leave", body)');
    expect(codeOf("src/hooks/scheduler/useScheduler.ts")).toContain("mutationFn: (body: { date: string; sessionIds?: string[]; reason: string }) => reportOwnLeave(body),");
  });
});

describe("§5 — the Users page: the link", () => {
  it("the picker on create AND edit; the body carries `teacherId` (null clears); the row shows the teacher's name", () => {
    expect(users.match(/<TeacherPicker value=\{teacherId\} onChange=\{setTeacherId\} \/>/g)?.length).toBe(2);
    expect(users).toContain("await create.mutateAsync({ username, password, displayName, isSuperAdmin, ...(teacherId ? { teacherId } : {}) });");
    expect(users).toContain("...(teacherId !== (user.teacherId ?? null) ? { teacherId } : {}),");
    expect(users).toContain('{t("users.teacherLine", { name: user.teacherName })}');
    expect(usersSvc).toContain("...(input.teacherId ? { teacherId: input.teacherId } : {}),");
    expect(usersSvc).toContain("...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),");
    expect(codeOf("src/types/api/contract.ts")).toContain("teacherId: string | null;\n  teacherName: string | null;\n}".replace(/\n/g, readFileSync("src/types/api/contract.ts", "utf8").includes("\r\n") ? "\r\n" : "\n"));
  });
});

describe("§6 — `TEACHER_LEAVE`: read everywhere, offered nowhere", () => {
  it("the wider READ set is four; the dialogs still offer the admin's three; the tray labels it in both languages", () => {
    expect([...CANCEL_REASON_CODES]).toEqual(["PROGRAM_CHANGED", "CUSTOMER_CANCELLED", "ADMIN_ERROR", "TEACHER_LEAVE"]);
    expect(END_COURSE_REASONS.length).toBe(3);
    for (const f of ["src/components/partials/Calendar/Modal/CancelBookingDialog.tsx", "src/components/partials/Bookings/EndCourseDialog.tsx"]) {
      const src = codeOf(f);
      expect(src).toContain("{END_COURSE_REASONS.map((r) => (");
      expect(src).not.toContain("TEACHER_LEAVE");
      expect(src).not.toContain("CANCEL_REASON_CODES");
    }
    expect(cancelReasonDisplay("TEACHER_LEAVE", "ignored")).toEqual({ key: "endCourse.TEACHER_LEAVE" });
    expect(dictionaries.en.endCourse.TEACHER_LEAVE).toBe("Teacher leave");
    expect(dictionaries.th.endCourse.TEACHER_LEAVE).toBe("ครูลา");
  });
  it("copy counted: teacherLeave 10 · users +4 — both languages", () => {
    const en = dictionaries.en.teacherLeave as Record<string, string>;
    const th = dictionaries.th.teacherLeave as Record<string, string>;
    expect(Object.keys(en).length).toBe(10);
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    for (const k of ["teacherLink", "teacherLinkHint", "teacherNone", "teacherLine"]) {
      expect((dictionaries.en.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
