import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { LEAVE_MSG_COURSE, LEAVE_MSG_COURSE_DECLARED, LEAVE_MSG_NO_COURSE, leaveClaimKey } from "./leave-claim";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { BookingType } from "@/types/api/contract";
import type { Booking } from "@/types/app/scheduler";

/**
 * 🔻 **TASK-658 (REQ-112), declared — this file was REWRITTEN, not patched, and the count is stated: 17 tests before, 17 after.**
 * It could not even load: it imported `LEAVE_MSG_COURSE_LOCKED`, which no longer exists, and **a module-level import error does not
 * fail a test — it silently DROPS every test in the file** (the suite printed one "unhandled error between tests" and a count that
 * was merely lower). 🔑 *That is why the count is asserted at the end of the report and not trusted from a green line.*
 *  · **The over-quota / LOCKED body is GONE** (nothing is ever locked): its constant, its mapper fact, its dictionary key and its
 *    toast. Its tests became the pins that it STAYS gone.
 *  · **The COURSE body is the owner's approved D1** (2026-10-06): *"…a make-up session is added in the next free week. The course's
 *    end date does not change."* — it was byte-identical to a REQ-073 sentence that is now false.
 *  · ✅ What this file protects is unchanged: **which claim a leave dialog may MAKE about this row** — the course, not the type —
 *    and *a missing fact must not read as a truth*.
 */

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const en = dictionaries.en.confirmAction as unknown as Record<string, string>;
const th = dictionaries.th.confirmAction as unknown as Record<string, string>;
const row = (over: Partial<Booking>) => over as Pick<Booking, "courseId" | "plannedAtCreation">;
const mapper = codeOf("src/lib/api/mappers.ts");

describe("TASK-541 — which claim a leave dialog may make", () => {
  /**
   * 🔑 The SET, derived from the server's leave branch rather than from Tanya's one report. Every kind in the closed
   * `BookingType` union is named here, and `Record<BookingType, …>` means **the union growing forces a decision** instead
   * of silently inheriting a promise. What each one may claim:
   *  · `COURSE_PACKAGE` — the only type born with a course ⇒ a make-up (today's words).
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
      expect(leaveClaimKey(row({ courseId }))).toBe(claim === "course" ? LEAVE_MSG_COURSE : LEAVE_MSG_NO_COURSE);
    }
  });

  it("🔑 the fact read is the COURSE, not the type — so a GROUP seat with a course gets the course words", () => {
    // a seat row: `bookingType` is irrelevant, the course is not
    expect(leaveClaimKey(row({ courseId: "c-7" }))).toBe(LEAVE_MSG_COURSE);
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
  it("🔻 §2 (TASK-658, declared): the COURSE body is the owner's approved D1, BY VALUE, both languages", () => {
    // it was byte-identical to the REQ-073 sentence ("uses one of the course's leaves") — FALSE now: there is no allowance
    expect(en.leaveMsg).toBe("This session is recorded as leave and a make-up session is added in the next free week. The course's end date does not change.");
    expect(th.leaveMsg).toBe("คาบนี้จะถูกบันทึกเป็นการลา และเพิ่มคาบชดเชยในสัปดาห์ถัดไปที่ว่างให้ วันสิ้นสุดคอร์สไม่เปลี่ยน");
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
  it("🔴 the no-course body makes NO make-up claim, and (TASK-658) says nothing about a quota at all — asserted as absences", () => {
    const enBody = en.leaveMsgNoCourse;
    const thBody = th.leaveMsgNoCourse;
    // EN: the make-up may appear only inside a denial, so the claim is pinned as "never without a negation"
    expect(/\bmake-up\b/.test(enBody)).toBe(true); // it IS mentioned — and only to deny it
    expect(/no make-up session is added/.test(enBody)).toBe(true);
    expect(/adds a make-up/.test(enBody)).toBe(false);
    expect(/uses one of the course/.test(enBody)).toBe(false);
    // TH: the same shape — `คาบชดเชย` may appear only negated
    expect(/ไม่มีคาบชดเชย/.test(thBody)).toBe(true);
    expect(/เพิ่มคาบชดเชย/.test(thBody)).toBe(false);
    // 🔻 TASK-658, declared: these two asserted the quota was NEGATED ("no leave quota is used" / ไม่ใช้โควตา). The owner's D2 DELETED that
    // clause — a sentence that denies a quota still tells the reader one exists — so the pin is now the absence of the WORD.
    expect(/quota/i.test(enBody)).toBe(false);
    expect(thBody.includes("โควตา")).toBe(false);
  });
});

/**
 * 🔻 **TASK-658 (REQ-112) — this block was "the over-quota course leave" (TASK-541 addendum, 7 tests). Nothing is ever LOCKED now, so
 * the block became the pins that the lock STAYS gone.** The server's `leaveLocked` is always `false`; 🚫 no screen reads it.
 */
describe("TASK-658 — there is NO locked leave body, and nothing reads a lock", () => {
  it("the rule has exactly THREE bodies — no locked one", () => {
    const rule = readFileSync("src/lib/scheduler/leave-claim.ts", "utf8");
    expect((rule.match(/export const LEAVE_MSG_[A-Z_]+ =/g) ?? []).length).toBe(3);
    expect(rule.includes("LEAVE_MSG_COURSE_LOCKED")).toBe(false);
  });

  it("🚫 a lock flag, even if a payload still carries one, changes NOTHING — the rule does not read it", () => {
    // 🔑 passed through a cast on purpose: the type no longer has the field, but an OLD server (or a mock) may still send it
    const withLock = (locked: boolean) => ({ courseId: "c-1", courseLeaveLocked: locked }) as unknown as Pick<Booking, "courseId" | "plannedAtCreation">;
    expect(leaveClaimKey(withLock(true))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(withLock(false))).toBe(LEAVE_MSG_COURSE);
    // and on a row with NO course it never reaches the course words at all
    expect(leaveClaimKey({ courseLeaveLocked: true } as unknown as Pick<Booking, "courseId" | "plannedAtCreation">)).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("🚫 an older payload with no leave facts keeps today's course words — no claim is swapped on a guess", () => {
    expect(leaveClaimKey(row({ courseId: "c-1" }))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: undefined }))).toBe(LEAVE_MSG_COURSE);
  });

  it("the mapper carries NO lock fact on a booking row, and the rule holds no copy of the old condition", () => {
    const rule = codeOf("src/lib/scheduler/leave-claim.ts");
    const bookingBody = mapper.slice(mapper.indexOf("export function dtoToBooking"), mapper.indexOf("export function dtoToTeacher"));
    for (const src of [rule, bookingBody]) {
      expect(src.match(/leaveLocked|courseLeaveLocked|adminUnlocked|leaveRemaining/)?.[0] ?? null).toBeNull();
    }
  });

  it("🔴 the locked STRINGS are gone, in both languages — the dialog body and the toast that followed it", () => {
    expect(en.leaveMsgCourseLocked).toBeUndefined();
    expect(th.leaveMsgCourseLocked).toBeUndefined();
    expect((dictionaries.en.booking as unknown as Record<string, string>).leaveLockedTitle).toBeUndefined();
    expect((dictionaries.th.booking as unknown as Record<string, string>).leaveLockedTitle).toBeUndefined();
    expect((dictionaries.en.booking as unknown as Record<string, string>).leaveLockedDesc).toBeUndefined();
    expect((dictionaries.th.booking as unknown as Record<string, string>).leaveLockedDesc).toBeUndefined();
  });

  it("🔑 the toast an admin DOES get says where the make-up went — and the dialog and the toast share one vocabulary", () => {
    expect((dictionaries.en.booking as unknown as Record<string, string>).leaveExtendedDesc).toBe("A make-up session was added on {date}");
    expect(en.leaveMsg).toContain("make-up session");
    expect((dictionaries.en.booking as unknown as Record<string, string>).leaveExtendedDesc).toContain("make-up session");
  });
});

/**
 * 🔨 **TASK-547 §1 — the leave declared at course creation.** 🔻 TASK-658, declared: under REQ-112 it is **one of the THREE cases that
 * moves the end date** (one week later), so its sentence now says so. It used to be "the mirror of the locked case" — that case is gone.
 */
describe("TASK-547 §1 — the leave declared at course creation", () => {
  it("declared ⇒ its own sentence", () => {
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: true }))).toBe(LEAVE_MSG_COURSE_DECLARED);
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: false }))).toBe(LEAVE_MSG_COURSE);
  });

  it("🚫 said only when POSITIVELY known — an absent fact claims nothing (TASK-541's rule, applied again)", () => {
    expect(leaveClaimKey(row({ courseId: "c-1" }))).toBe(LEAVE_MSG_COURSE);
    expect(leaveClaimKey(row({ courseId: "c-1", plannedAtCreation: undefined }))).toBe(LEAVE_MSG_COURSE);
    // and on a row with no course it is irrelevant: there is nothing to extend either way
    expect(leaveClaimKey(row({ plannedAtCreation: true }))).toBe(LEAVE_MSG_NO_COURSE);
  });

  it("the fact is carried as sent, and the DTO declares it", () => {
    expect(mapper).toContain("plannedAtCreation: dto.plannedAtCreation,");
    expect(codeOf("src/types/api/contract.ts")).toContain("plannedAtCreation?: boolean;");
  });

  it("🔴 the declared body says a make-up IS added AND the end date moves one week — and NO quota — both languages", () => {
    const enB = en.leaveMsgCourseDeclared;
    const thB = th.leaveMsgCourseDeclared;
    expect(/make-up session is added/.test(enB)).toBe(true);
    expect(/end date moves one week later/.test(enB)).toBe(true);
    expect(/quota/i.test(enB)).toBe(false);
    expect(/uses one of the course/.test(enB)).toBe(false);
    expect(/เพิ่มคาบชดเชย/.test(thB)).toBe(true);
    expect(/เลื่อนออกไป 1 สัปดาห์/.test(thB)).toBe(true);
    expect(thB.includes("โควตา")).toBe(false);
  });
});
