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

describe("🔴 TASK-691 — where it is OFFERED, and where it must NOT be", () => {
  it("🔑 ONLY the session Cancel dialog renders the session-only reasons", () => {
    const offered = code("src/components/partials/Calendar/Modal/CancelBookingDialog.tsx");
    expect(offered.includes("{SESSION_ONLY_CANCEL_REASONS.map((r) => (")).toBe(true);
    // …after the three, which it still renders from the shared list exactly as before
    expect(offered.includes("{END_COURSE_REASONS.map((r) => (")).toBe(true);
    expect(offered.indexOf("END_COURSE_REASONS.map")).toBeLessThan(offered.indexOf("SESSION_ONLY_CANCEL_REASONS.map"));
  });

  it("🚫 the OTHER three dialogs that share the list never mention it — not the code, not the sibling list", () => {
    for (const f of [
      "src/components/partials/Bookings/EndCourseDialog.tsx",
      "src/components/partials/OtherSeries/OtherSeriesDialogs.tsx",
    ]) {
      const src = code(f);
      expect(src.match(/SCHOOL_ISSUE|SESSION_ONLY_CANCEL_REASONS|SESSION_CANCEL_REASONS/)?.[0] ?? null).toBeNull();
      expect(src.includes("{END_COURSE_REASONS.map((r) => (")).toBe(true);
    }
    // the voucher end reads the same list through its own dialog
    const files = ["src/components/partials/Bookings/EndVoucherDialog.tsx"].filter((f) => {
      try {
        readFileSync(f, "utf8");
        return true;
      } catch {
        return false;
      }
    });
    for (const f of files) expect(code(f).match(/SCHOOL_ISSUE|SESSION_ONLY_CANCEL_REASONS/)?.[0] ?? null).toBeNull();
  });

  it("🔑 the session cancel's WIRE accepts the wider type; the course / voucher end do NOT", () => {
    const svc = code("src/services/scheduler.service.ts");
    expect(svc.includes("reasonCode?: SessionCancelReason,")).toBe(true);
    // endCourse / endVoucher still take the three
    expect(svc.includes("export const endCourse = async (courseId: string, input: { reason: EndCourseReason; note?: string })")).toBe(true);
    expect(svc.includes("export const endVoucher = async (voucherId: string, input: { reason: EndCourseReason; note?: string })")).toBe(true);
  });
});
