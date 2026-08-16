import { describe, expect, it } from "bun:test";
import { eligibleLabel, entKey } from "./eligible";
import type { EligibleStudent } from "@/types/app/scheduler";

/**
 * These two helpers were lifted out of `BookingModal`'s `CreateForm` (SPEC-039/TASK-131) so the new
 * `EligibleStudentSelect` and the form's own "which row is selected" lookup share ONE definition.
 * The label rules are what keep REQ-029/AC-3 true — a student with two courses must stay pickable —
 * so they are pinned here rather than left to drift between the two call sites.
 */

const course = (id: string, opts: Partial<{ nickname: string | null; subject: string | null; used: number; size: number; expiry: string; courseId: string }> = {}): EligibleStudent => ({
  id,
  name: "Somchai Jaidee",
  nickname: opts.nickname === undefined ? "Pole" : opts.nickname,
  context: {
    courseId: opts.courseId ?? "c-1",
    subject: opts.subject === null ? null : { id: "s-1", name: opts.subject ?? "Surfskate" },
    size: opts.size ?? 4,
    usedSessions: opts.used ?? 1,
    remainingSessions: (opts.size ?? 4) - (opts.used ?? 1),
    leaveUsed: 0,
    leaveQuota: 1,
    expiryDate: opts.expiry ?? "2026-10-18",
  },
});

const voucher = (id: string): EligibleStudent => ({
  id,
  name: "Somchai Jaidee",
  nickname: "Pole",
  context: {
    voucherId: "v-1",
    totalHours: 10,
    usedHours: 2,
    remainingHours: 8,
    expiryDate: "2026-12-01",
  },
});

describe("entKey — the option identity is the entitlement, not the student", () => {
  it("uses courseId for a course row", () => {
    expect(entKey(course("stu-1", { courseId: "c-9" }), "COURSE_PACKAGE")).toBe("c-9");
  });

  it("uses voucherId for a voucher row", () => {
    expect(entKey(voucher("stu-1"), "VOUCHER")).toBe("v-1");
  });
});

describe("eligibleLabel", () => {
  it("prefers the nickname, falling back to the full name", () => {
    expect(eligibleLabel(voucher("stu-1"), "VOUCHER", [])).toBe("Pole");
    const noNick = { ...voucher("stu-1"), nickname: null };
    expect(eligibleLabel(noNick, "VOUCHER", [])).toBe("Somchai Jaidee");
  });

  it("keeps a single-course label clean — subject + progress, no expiry (TASK-121)", () => {
    const row = course("stu-1");
    expect(eligibleLabel(row, "COURSE_PACKAGE", [row])).toBe("Pole · Surfskate (1/4)");
  });

  it("appends the expiry only when the SAME student holds 2+ courses (TASK-125 / AC-3)", () => {
    const a = course("stu-1", { courseId: "c-1", expiry: "2026-10-18" });
    const b = course("stu-1", { courseId: "c-2", expiry: "2026-11-30" });
    const all = [a, b];
    expect(eligibleLabel(a, "COURSE_PACKAGE", all)).toBe("Pole · Surfskate (1/4) · exp 2026-10-18");
    expect(eligibleLabel(b, "COURSE_PACKAGE", all)).toBe("Pole · Surfskate (1/4) · exp 2026-11-30");
    // ...and the two rows are genuinely distinguishable, which is the point of AC-3.
    expect(eligibleLabel(a, "COURSE_PACKAGE", all)).not.toBe(eligibleLabel(b, "COURSE_PACKAGE", all));
  });

  it("does not append an expiry when two DIFFERENT students each hold one course", () => {
    const a = course("stu-1", { courseId: "c-1" });
    const b = course("stu-2", { courseId: "c-2" });
    expect(eligibleLabel(a, "COURSE_PACKAGE", [a, b])).toBe("Pole · Surfskate (1/4)");
  });

  it("omits the subject rather than inventing one when the course carries none", () => {
    const row = course("stu-1", { subject: null });
    expect(eligibleLabel(row, "COURSE_PACKAGE", [row])).toBe("Pole (1/4)");
  });

  it("leaves voucher rows name-only", () => {
    const row = voucher("stu-1");
    expect(eligibleLabel(row, "VOUCHER", [row, voucher("stu-1")])).toBe("Pole");
  });
});
