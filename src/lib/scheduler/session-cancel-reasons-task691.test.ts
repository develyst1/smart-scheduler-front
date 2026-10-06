import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { CANCEL_REASON_CODES, END_COURSE_REASONS, SESSION_CANCEL_REASONS, SESSION_ONLY_CANCEL_REASONS } from "@/types/app/scheduler";
import { cancelReasonDisplay } from "./cancelled-tray";

/**
 * 🔴 **TASK-691 (REQ-112) — `SCHOOL_ISSUE` is a SESSION-cancel reason and NOTHING ELSE.**
 *
 * 🔑 `END_COURSE_REASONS` is shared by FOUR dialogs (the session cancel, ending a course, ending a voucher, cancelling a series). Adding the
 * code to it would have offered *"a problem on our side — extends the course a week"* when **ending** a course, where it means nothing and
 * the hint would be a lie. So it is a SIBLING list, and this file pins the boundary from every side.
 */

const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("🔴 TASK-691 — the lists", () => {
  it("🔑 the END-COURSE contract is UNCHANGED: three reasons, there is no fourth", () => {
    expect([...END_COURSE_REASONS]).toEqual(["PROGRAM_CHANGED", "CUSTOMER_CANCELLED", "ADMIN_ERROR"]);
    expect((END_COURSE_REASONS as readonly string[]).includes("SCHOOL_ISSUE")).toBe(false);
  });

  it("✅ the session list is the three PLUS the session-only one — derived by SPREAD, never re-typed", () => {
    expect([...SESSION_ONLY_CANCEL_REASONS]).toEqual(["SCHOOL_ISSUE"]);
    expect([...SESSION_CANCEL_REASONS]).toEqual([...END_COURSE_REASONS, "SCHOOL_ISSUE"]);
    const types = code("src/types/app/scheduler/index.ts");
    expect(types.includes("SESSION_CANCEL_REASONS = [...END_COURSE_REASONS, ...SESSION_ONLY_CANCEL_REASONS] as const")).toBe(true);
  });

  it("🚫 the READ set the dialogs and the teacher-scope pin hold at FOUR is not widened — the new code is read through its own branch", () => {
    expect([...CANCEL_REASON_CODES]).toEqual(["PROGRAM_CHANGED", "CUSTOMER_CANCELLED", "ADMIN_ERROR", "TEACHER_LEAVE"]);
    expect(cancelReasonDisplay("SCHOOL_ISSUE", "ignored")).toEqual({ key: "endCourse.SCHOOL_ISSUE" });
    // …and the tray's existing behaviour is untouched
    expect(cancelReasonDisplay("TEACHER_LEAVE", "ignored")).toEqual({ key: "endCourse.TEACHER_LEAVE" });
    expect(cancelReasonDisplay("SOMETHING_NEW", "fallback")).toEqual({ text: "fallback" });
  });
});

/**
 * 🔻 **TASK-694 (QA F1) — this block was TASK-691's *"ONLY the session Cancel dialog renders the session-only reasons"*, and it was RE-AIMED, not deleted.**
 * 691 offered the reason as a 4th radio on `CancelBookingDialog` — the dialog for single / voucher / trial / OTHER rows, **which have no course**, so the
 * reason added no week and its hint would have been FALSE there. The reason is offered where a week is actually earned: **the plan modal's cancel of a
 * COURSE class, and the GROUP series cancel-all (its seats are course classes)** — each as ONE checkbox, never a list.
 * ✅ The claim is unchanged: the code is offered ONLY where it has a consequence, and pinned from every side.
 */
describe("🔴 TASK-694 — where it is OFFERED, and where it must NOT be", () => {
  it("🔑 the plan modal's COURSE-class cancel offers it — as a checkbox, never a list, and off by default", () => {
    const plan = code("src/components/partials/Bookings/PlanModal.tsx");
    expect(plan.includes("const [ourSide, setOurSide] = useState(false);")).toBe(true);
    expect(plan.includes("...(ourSide ? { reasonCode: SESSION_ONLY_CANCEL_REASONS[0] } : {}),")).toBe(true);
    expect(plan.includes('label={t("endCourse.SCHOOL_ISSUE")}')).toBe(true);
    expect(plan.includes('description={t("cancelBooking.schoolIssueHint")}')).toBe(true);
    // 🚫 not the full reason list: on a course class the server ignores every other reason
    expect(plan.match(/END_COURSE_REASONS|SESSION_CANCEL_REASONS/)?.[0] ?? null).toBeNull();
  });

  it("🔑 the GROUP series cancel-all offers it — and ONLY for a group (an OTHER series has no course behind it)", () => {
    const dialogs = code("src/components/partials/OtherSeries/OtherSeriesDialogs.tsx");
    expect(dialogs.includes('{ref.kind === "group" && (')).toBe(true);
    expect(dialogs.includes("const chosen: SessionCancelReason | null = ourSide ? SESSION_ONLY_CANCEL_REASONS[0] : reason;")).toBe(true);
    // the three radios stay on that dialog, exactly as before
    expect(dialogs.includes("{END_COURSE_REASONS.map((r) => (")).toBe(true);
  });

  it("🚫 the NON-course Cancel dialog does NOT offer it — its approved hint would be FALSE on a booking with no course", () => {
    const dlg = code("src/components/partials/Calendar/Modal/CancelBookingDialog.tsx");
    expect(dlg.match(/SCHOOL_ISSUE|SESSION_ONLY_CANCEL_REASONS|SESSION_CANCEL_REASONS|schoolIssueHint/)?.[0] ?? null).toBeNull();
    expect(dlg.includes("{END_COURSE_REASONS.map((r) => (")).toBe(true);
  });

  it("🚫 ENDING a course never offers it", () => {
    const src = code("src/components/partials/Bookings/EndCourseDialog.tsx");
    expect(src.match(/SCHOOL_ISSUE|SESSION_ONLY_CANCEL_REASONS|SESSION_CANCEL_REASONS|schoolIssueHint/)?.[0] ?? null).toBeNull();
    expect(src.includes("{END_COURSE_REASONS.map((r) => (")).toBe(true);
  });

  it("🔑 the session cancel's WIRE accepts the wider type; the course / voucher end do NOT", () => {
    const svc = code("src/services/scheduler.service.ts");
    expect(svc.includes("reasonCode?: SessionCancelReason,")).toBe(true);
    // endCourse / endVoucher still take the three
    expect(svc.includes("export const endCourse = async (courseId: string, input: { reason: EndCourseReason; note?: string })")).toBe(true);
    expect(svc.includes("export const endVoucher = async (voucherId: string, input: { reason: EndCourseReason; note?: string })")).toBe(true);
  });
});
