import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT, TEACHER_SCOPE_ACTIONS, can } from "@/lib/rbac/actions";
import { CANCEL_REASON_CODES, END_COURSE_REASONS } from "@/types/app/scheduler";
import { cancelReasonDisplay } from "./cancelled-tray";
import { isAdvanceLeaveDate, isAdvanceResult, TEACHER_ALLOWED_ROUTES, columnTeacherIds, isScoped, leaveBody, leaveDefaultTicks } from "./teacher-scope";

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
    expect(i).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.group-series") + 2); // TASK-429: `other-cancel-all` sits between (the BE's slot)
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(60) /* TASK-518: + the 60th, `calendar.undo` (SPEC-094) */ /* TASK-427 + TASK-429 + TASK-432: budget-view, other-cancel-all, coach-rate */; // + TASK-412's parent-archive
    expect(useMe).toContain("teacherId: q.data.teacherId ?? null }");
    // TASK-408 follow-up — the login body carries the link; the SEED reads it, so a scoped account's doors never flash before `/me`
    expect(useMe).toContain("teacherId: su.teacherId ?? null,");
    expect(codeOf("src/auth.ts")).toContain('teacherId: typeof data.user.teacherId === "string" ? data.user.teacherId : null,');
    expect(codeOf("src/auth.config.ts")).toContain("token.teacherId = user.teacherId ?? null;");
    expect(codeOf("src/auth.config.ts")).toContain("session.user.teacherId = token.teacherId ?? null;");
  });
});

describe("§3 — the calendar page under the flag", () => {
  /**
   * 🔴 **TASK-589, declared: a FIFTH hook, and it is the first one whose route a scoped teacher may NOT call.**
   * `GET /teacher-leave-days` refuses a linked teacher (403) — it is the ADMIN's read. ⇒ **the property this pin protects
   * ("a scoped session only hits allowed routes") is kept by asserting the GATE, not by pretending the hook is allowed:**
   * it is mounted with `!scoped`, so a teacher session never sends it. 🚫 A caught 403 would have sent it.
   */
  it("🔴 the load path: five data hooks — four on the allowed set, and the fifth GATED to admins", () => {
    expect(dataHooks(region(content, "export default function CalendarContent", "return ("))).toEqual(["useBadges", "useCalendar", "useLeaveDays", "usePausedBookings", "useTeachers"]);
    // 🔑 the gate, at the source: the read is asked only when the session is NOT teacher-scoped
    expect(content).toContain("useLeaveDays(leaveRange.from, leaveRange.to, !scoped)");
    expect(schedSvc).toContain('api.get<{ items: LeaveDayRow[] }>("/teacher-leave-days"');
    expect(schedSvc).toContain('api.get<CalendarResponse>("/calendar"');
    expect(schedSvc).toContain('api.get<TeachersResponse>("/teachers")');
    expect(schedSvc).toContain('api.get<BookingsResponse>("/bookings"');
    expect(codeOf("src/services/badge.service.ts")).toContain('"/badges"');
    expect(codeOf("src/hooks/scheduler/useScheduler.ts")).toContain('getAllBookings({ status: "PAUSED"');
    // the modal's VIEW, mounted on a click, fetches only badges by itself; the rental section (sellable-packages) is off under the flag
    expect(dataHooks(region(modal, "function ViewBooking(", "function MoveBookingForm("))).toEqual(["useBadges", "useConfirmBooking", "useMarkAttended", "useMarkSickLeave", "usePauseBooking", "useResumeBooking", "useSetBookingBadges", "useUndoControl"]);
    // 📌 REQ-106 §1 (TASK-464) — the owner ruled a coach DOES see the gear (item + remark, read-only), so the scoped
    // branch is no longer "nothing": it is `RentalGearLine`, which mounts no data hook (the pin above still holds) and
    // carries no price, no paid state and no door. The unscoped `RentalSection` is untouched.
    expect(modal).toContain("{scoped ? <RentalGearLine booking={booking} /> : <RentalSection booking={booking} />}");
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
    expect(modal).toContain("{canOfferConfirm(booking.status) && canStatus && ("); // TASK-409 — PENDING + EXTENDED through one list
    // TASK-531 D5 — the leave item now carries the ATTENDED guard beside `canStatus` (an attended row is an UNDO, and
    // its dialog must not promise the family's quota); the KEY gate is unchanged, which is what this pin is about.
    expect(modal).toMatch(/\{canStatus && booking\.status !== "ATTENDED" && \(\s*<Menu\.Item\s+leftSection=\{<CalendarX2/);
    expect(modal).toContain("canOverbook || canMove || canStatus ||");
    expect(modal).not.toMatch(/disabled=\{[^}]*scoped/); // hidden, never disabled
  });
});

describe("§4 — `Report leave`: one call, the ticks from the scoped day, the bounds the server's", () => {
  it("the dialog and the wire", () => {
    expect(leaveDialog).toContain('const { data: calendar, isLoading } = useCalendar(date, "day");');
    // 🔻 TASK-588, declared: the body now carries the ADVANCE flag, and the ticks gate the submit only on the CANCEL path
    // (an advance date has no ticks to count, and the label must not promise a number of cancellations).
    // 🔑 What this pin protects — ONE call, built by `leaveBody`, and the bounds left to the server — is unchanged.
    expect(leaveDialog).toContain("await leave.mutateAsync(leaveBody(date, allIds, ticked, reason, advance));");
    expect(leaveDialog).toContain("disabled={(!advance && ticked.length === 0) || reason.trim().length === 0}");
    // 🔴 and the old path's own words are still the ones used when the server says it cancelled
    expect(leaveDialog).toContain("if (isAdvanceResult(res)) {");
    expect(leaveDialog).not.toMatch(/length\s*[<>]=?\s*(3|200)\b/);
    expect(leaveDialog).toContain('t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified })');
    // 🔻 TASK-595, declared: the same-day warning is now GUARDED. It promises the ticked sessions' families are told and
    // the make-ups added — true on the cancel path, FALSE on an advance date, where it sat directly under a hint saying
    // nothing is cancelled. ✅ What this pin protected (the sentence is still the one shown when a cancel happens) stands:
    // the string is unchanged and it is still here — it is the CONDITION that is new, and the guard is the pin now.
    expect(leaveDialog).toContain('{t("teacherLeave.warning")}');
    expect(leaveDialog).toContain("{!advance && (");
    expect(leaveDialog).toContain("data-leave-cancel-warning");
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
    expect(Object.keys(en).length).toBe(18); /* TASK-588: +8 — the advance act's hint, its button, and the result's seven lines */
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    for (const k of ["teacherLink", "teacherLinkHint", "teacherNone", "teacherLine"]) {
      expect((dictionaries.en.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});

/**
 * 🔴 **TASK-588 — the advance act's own rules, as units.**
 *
 * 🔑 **Why these are here and not only in the clicked file:** on an advance date the chooser is absent, so every tick is the
 * default set — **which makes `sessionIds` omitted anyway, and a clicked test cannot tell "cannot ride" from "happened not
 * to ride".** *That distinction is the whole of `sessionIds`-on-a-future-date, and only a unit can state it.*
 */
describe("🔴 TASK-588 — the advance fork, as rules", () => {
  it("🔴 on an ADVANCE date `sessionIds` CANNOT ride — not even when the ticks are a strict subset", () => {
    const all = ["a", "b", "c"];
    // the cancel path: a subset rides, the whole day does not (unchanged)
    expect(leaveBody("2026-10-01", all, ["a"], " sick ")).toEqual({ date: "2026-10-01", sessionIds: ["a"], reason: "sick" });
    expect(leaveBody("2026-10-01", all, all, "sick")).toEqual({ date: "2026-10-01", reason: "sick" });
    // 🔑 the advance path: a subset, an empty set, the whole day — never a `sessionIds` key
    for (const ticks of [["a"], [], all]) {
      expect(leaveBody("2026-10-01", all, ticks, "sick", true)).toEqual({ date: "2026-10-01", reason: "sick" });
    }
  });

  it("the fork is STRICTLY after today — today is the old act", () => {
    expect(isAdvanceLeaveDate("2026-10-02", "2026-10-01")).toBe(true);
    expect(isAdvanceLeaveDate("2026-10-01", "2026-10-01")).toBe(false); // 🔑 today is a CANCEL, not a block
    expect(isAdvanceLeaveDate("2026-09-30", "2026-10-01")).toBe(false);
    expect(isAdvanceLeaveDate("", "2026-10-01")).toBe(false);
  });

  it("🔑 which act RAN is read from the answer, never re-derived from the date we sent", () => {
    expect(isAdvanceResult({ mode: "advance" })).toBe(true);
    expect(isAdvanceResult({})).toBe(false);
    expect(isAdvanceResult(null)).toBe(false);
    // and the dialog reads it that way — pinned at the source, because a runaway mutation cannot prove this in the DOM
    expect(leaveDialog).toContain("if (isAdvanceResult(res)) {");
    expect(leaveDialog).not.toMatch(/if \(advance\) \{\s*setDone/);
  });
});
