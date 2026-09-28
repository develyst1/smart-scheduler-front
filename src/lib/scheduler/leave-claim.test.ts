import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { LEAVE_MSG_COURSE, LEAVE_MSG_COURSE_DECLARED, LEAVE_MSG_COURSE_LOCKED, LEAVE_MSG_NO_COURSE, leaveClaimKey } from "./leave-claim";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { BookingType } from "@/types/api/contract";
import type { Booking } from "@/types/app/scheduler";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const en = dictionaries.en.confirmAction as unknown as Record<string, string>;
const th = dictionaries.th.confirmAction as unknown as Record<string, string>;
const row = (over: Partial<Booking>) => over as Pick<Booking, "courseId" | "courseLeaveLocked">;
const mapper = codeOf("src/lib/api/mappers.ts");

describe("TASK-541 — which claim a leave dialog may make", () => {
  /**
   * 🔑 The SET, derived from the server's leave branch rather than from Tanya's one report. Every kind in the closed
   * `BookingType` union is named here, and `Record<BookingType, …>` means **the union growing forces a decision** instead
   * of silently inheriting a promise. What each one may claim:
   *  · `COURSE_PACKAGE` — the only type born with a course ⇒ quota + make-up (today's words).
   *  · `SINGLE_SESSION` (the 1-HR of this report), `FIRST_TRIAL`, `VOUCHER`, `OTHER` (a CAMP day included) — no course
   *    behind the row at all ⇒ **nothing may be claimed**.
   *  · `GROUP` — the group row itself has no course; 🔑 **its SEATS are ordinary rows carrying their own `courseId`**,
   *    which is exactly why this rule reads the course and not the type: two seats in one group can deserve different
   *    sentences, and a type-keyed table would have got that wrong for every seat.
   */
  const CLAIM_BY_TYPE: Record<BookingType, "course" | "none"> = {
    COURSE_PACKAGE: "course",
    SINGLE_SESSION: "none",
    FIRST_TRIAL: "none",
    VOUCHER: "none",
    OTHER: "none",
    GROUP: "none",
  };

  it("every booking type, by the course it has (or has not)", () => {
    for (const [type, claim] of Object.entries(CLAIM_BY_TYPE)) {
      const courseId = type === "COURSE_PACKAGE" ? "c-1" : undefined;
      const courseLeaveLocked = courseId ? false : null;
      expect(leaveClaimKey(row({ courseId, courseLeaveLocked }))).toBe(claim === "course" ? LEAVE_MSG_COURSE : LEAVE_MSG_NO_COURSE);
    }
  });

  it("🔑 the fact read is the COURSE, not the type — so a GROUP seat with a course gets the course words", () => {
    // a seat row: `bookingType` is irrelevant, the course is not
    expect(leaveClaimKey(row({ courseId: "c-7", courseLeaveLocked: false }))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(row({ courseId: undefined }))).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("an absent, empty or whitespace course id is NO course — the reading that claims least", () => {
    expect(leaveClaimKey(row({}))).toBe(LEAVE_MSG_NO_COURSE);
    expect(leaveClaimKey(row({ courseId: "" }))).toBe(LEAVE_MSG_NO_COURSE);
    expect(leaveClaimKey(row({ courseId: "   " }))).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("the dialog asks the rule, in ONE place, and no longer hard-codes the course sentence", () => {
    expect(modal).toContain("message: t(leaveClaimKey(booking)),");
    expect(modal).not.toContain('t("confirmAction.leaveMsg")');
    expect(modal).toContain('import { leaveClaimKey } from "@/lib/scheduler/leave-claim"');
  });
});

describe("TASK-541 — the words", () => {
  it("🚫 §2: the COURSE body is byte-identical, both languages", () => {
    expect(en.leaveMsg).toBe("This uses one of the course's leaves and adds a make-up session at the end.");
    expect(th.leaveMsg).toBe("จะใช้โควตาลาของคอร์ส 1 ครั้ง และเพิ่มคาบชดเชยต่อท้ายให้");
    // and the title above it is untouched too — the dialog's question is not this task's
    expect(en.leaveTitle).toBe("Record leave for this session?");
  });

  it("📋 the no-course body exists in both languages (DRAFT), and says the two things that are always true", () => {
    expect(en.leaveMsgNoCourse.trim().length).toBeGreaterThan(20);
    expect(th.leaveMsgNoCourse.trim().length).toBeGreaterThan(20);
    // the status, and who is told — the two acts the server performs for EVERY kind
    expect(en.leaveMsgNoCourse).toContain("recorded as leave");
    expect(en.leaveMsgNoCourse).toContain("coach");
    expect(th.leaveMsgNoCourse).toContain("บันทึกเป็นการลา");
    expect(th.leaveMsgNoCourse).toContain("แจ้งครู");
    expect(en.leaveMsgNoCourse).not.toContain("{");
    expect(th.leaveMsgNoCourse).not.toContain("{");
  });

  /**
   * 🔑 Pinned BY SHAPE, as the task asked: the claims must be ABSENT, not merely reworded. A future edit that "helpfully"
   * mentions a make-up here recreates the exact defect — the sentence an admin reads before deciding whether recording a
   * leave costs a family something.
   */
  it("🔴 the no-course body makes NO quota and NO make-up claim — asserted as absences", () => {
    const enBody = en.leaveMsgNoCourse;
    const thBody = th.leaveMsgNoCourse;
    // EN: the words may appear only inside a denial, so the claim is pinned as "never without a negation"
    expect(/\bmake-up\b/.test(enBody)).toBe(true); // it IS mentioned — and only to deny it
    expect(/no make-up session is added/.test(enBody)).toBe(true);
    expect(/adds a make-up/.test(enBody)).toBe(false);
    expect(/uses one of the course/.test(enBody)).toBe(false);
    expect(/no leave quota is used/.test(enBody)).toBe(true);
    // TH: the same shape — `คาบชดเชย` and `โควตา` may appear only negated
    expect(/ไม่มีคาบชดเชย/.test(thBody)).toBe(true);
    expect(/เพิ่มคาบชดเชย/.test(thBody)).toBe(false);
    expect(/ไม่ใช้โควตา/.test(thBody)).toBe(true);
    expect(/จะใช้โควตา/.test(thBody)).toBe(false);
  });
});

/**
 * 🔨 **The addendum (@Sober ruled residual (1) IN, 2026-09-28).** An over-quota course leave spends nothing and appends
 * nothing (`locked: true`), and today's course sentence promised both — **this task's own defect inside the words §2 froze.**
 * 🔑 The freeze existed to stop the course copy drifting while the 1-HR case changed, **not to preserve a falsehood**, so the
 * ordinary (within-quota) course row is STILL pinned byte-identical above and only the locked case gets new words.
 */
describe("TASK-541 addendum — the over-quota course leave", () => {
  it("the SERVER says locked ⇒ the locked sentence; anything else ⇒ today's words", () => {
    expect(leaveClaimKey(row({ courseId: "c-1", courseLeaveLocked: true }))).toBe(LEAVE_MSG_COURSE_LOCKED);
    expect(leaveClaimKey(row({ courseId: "c-1", courseLeaveLocked: false }))).toBe(LEAVE_MSG_COURSE);
  });

  it("🚫 the FE does not RE-DERIVE the lock — it reads the server's `leaveLocked` (TASK-543's correction)", () => {
    // 🔑 `leaveLocked` is `leaveUsed >= quota && !adminUnlocked` = exactly `!canTakeLeave`, so the answer was always sent.
    // Pinned by ABSENCE: neither the rule nor the mapper may hold a second copy of that condition.
    const rule = codeOf("src/lib/scheduler/leave-claim.ts");
    // 📌 The mapper is read as the `dtoToBooking` BODY only: `dtoToCourseView` carries `leaveRemaining` and
    // `adminUnlocked` on purpose — the course page SHOWS those numbers. A file-wide pin would have been a false one.
    const bookingBody = mapper.slice(mapper.indexOf("export function dtoToBooking"), mapper.indexOf("export function dtoToTeacher"));
    for (const src of [rule, bookingBody]) {
      expect(src.includes("adminUnlocked")).toBe(false);
      expect(src.includes("leaveRemaining")).toBe(false);
      expect(/remaining\s*[><]/.test(src)).toBe(false);
    }
    expect(rule).toContain("if (b.courseLeaveLocked === true) return LEAVE_MSG_COURSE_LOCKED;");
  });

  it("🚫 an older payload with no leave facts keeps today's course words — no claim is swapped on a guess", () => {
    expect(leaveClaimKey(row({ courseId: "c-1" }))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(row({ courseId: "c-1", courseLeaveLocked: null }))).toBe(LEAVE_MSG_COURSE);
    // 🚫 `=== true` on purpose: a missing fact must not read as a truth, in either direction
    expect(leaveClaimKey(row({ courseId: "c-1", courseLeaveLocked: undefined }))).toBe(LEAVE_MSG_COURSE);
    // and a locked flag on a row with NO course never reaches the course words at all
    expect(leaveClaimKey(row({ courseLeaveLocked: true }))).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("the facts are carried by the mapper, as sent, and nothing is derived there", () => {
    expect(mapper).toContain("courseLeaveLocked: dto.course ? dto.course.leaveLocked : null,");
  });

  it("🔴 the locked body claims NO quota spend and NO make-up either — the same absences, both languages", () => {
    const enBody = en.leaveMsgCourseLocked;
    const thBody = th.leaveMsgCourseLocked;
    expect(/no leave quota is used/.test(enBody)).toBe(true);
    expect(/no make-up session is added/.test(enBody)).toBe(true);
    expect(/adds a make-up/.test(enBody)).toBe(false);
    expect(/uses one of the course/.test(enBody)).toBe(false);
    expect(/ไม่มีคาบชดเชย/.test(thBody)).toBe(true);
    expect(/เพิ่มคาบชดเชย/.test(thBody)).toBe(false);
    expect(/จะใช้โควตา/.test(thBody)).toBe(false);
    expect(enBody).not.toContain("{");
    expect(thBody).not.toContain("{");
  });

  it("🔑 it says the thing the admin needs next, in the SAME words as the toast that follows", () => {
    // the dialog and the outcome must not be two descriptions of one event
    expect(en.leaveMsgCourseLocked).toContain("rescheduling stays locked");
    expect((dictionaries.en.booking as unknown as Record<string, string>).leaveLockedTitle).toContain("rescheduling locked");
    expect(th.leaveMsgCourseLocked).toContain("ล็อกการเลื่อนตาราง");
    expect((dictionaries.th.booking as unknown as Record<string, string>).leaveLockedTitle).toContain("ล็อกการเลื่อนตาราง");
  });
});

/**
 * 🔨 **TASK-547 §1 — my held residual (2), now that TASK-542 sends the fact.** A leave **declared when the course was
 * created** appends its make-up and **charges no quota** (`charges = courseId && course && canTakeLeave && !plannedAtCreation`).
 * 🔑 The mirror of the locked case: there the make-up is missing, here the quota spend is — **and one old sentence promised
 * both in both.**
 */
describe("TASK-547 §1 — the leave declared at course creation", () => {
  it("declared ⇒ its own sentence; and LOCKED still wins, because the server checks the quota first", () => {
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: true }))).toBe(LEAVE_MSG_COURSE_DECLARED);
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: false }))).toBe(LEAVE_MSG_COURSE);
    // 🔑 over quota ⇒ neither quota nor make-up, declared or not: `canTakeLeave` gates the whole branch on the server
    expect(leaveClaimKey(row({ courseId: "c-1", courseLeaveLocked: true, plannedAtCreation: true }))).toBe(LEAVE_MSG_COURSE_LOCKED);
  });

  it("🚫 said only when POSITIVELY known — an absent fact claims nothing (TASK-541's rule, applied again)", () => {
    expect(leaveClaimKey(row({ courseId: "c-1" }))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: undefined }))).toBe(LEAVE_MSG_COURSE);
    // and on a row with no course it is irrelevant: there is no quota to spend either way
    expect(leaveClaimKey(row({ plannedAtCreation: true }))).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("the fact is carried as sent, and the DTO declares it", () => {
    expect(mapper).toContain("plannedAtCreation: dto.plannedAtCreation,");
    expect(codeOf("src/types/api/contract.ts")).toContain("plannedAtCreation?: boolean;");
  });

  it("🔴 the declared body says NO quota is used and a make-up IS added — both, in both languages", () => {
    const enB = en.leaveMsgCourseDeclared;
    const thB = th.leaveMsgCourseDeclared;
    expect(/no leave quota is used/.test(enB)).toBe(true);
    expect(/make-up session is still added/.test(enB)).toBe(true);
    expect(/uses one of the course/.test(enB)).toBe(false);
    expect(/ไม่ตัดโควตาลา/.test(thB)).toBe(true);
    expect(/เพิ่มคาบชดเชย/.test(thB)).toBe(true);
    expect(/จะใช้โควตาลาของคอร์ส/.test(thB)).toBe(false);
  });
});
