import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import type { TeacherView } from "@/types/app/scheduler";
import { resumeTeacherIdToSend, resumeTeacherOptions, teachesSubject } from "./resume-teacher";

/**
 * TASK-360 (`REQ-089 item 8`) — pick the teacher on resume, both doors.
 *
 * The contract (TASK-359): `teacherId?` optional on both resume bodies; ABSENT ⇒ today byte for byte. So the two
 * things that matter are asserted with VALUES: (1) an unchanged picker sends NO key; (2) the options are the create
 * picker's own parts — bookable on the date + teaches the subject — from ONE function both dialogs call.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const teacher = (over: Partial<TeacherView> & { id: string }): TeacherView =>
  ({
    name: over.id,
    nickname: over.id,
    type: "FULLTIME",
    subjects: ["Surfskate"],
    subjectOptions: [{ id: "s-surf", name: "Surfskate" }],
    active: true,
    bookable: true,
    hoursThisMonth: 0,
    ...over,
  }) as unknown as TeacherView;

const SAT = "2026-09-19"; // a Saturday
const TEACHERS = [
  teacher({ id: "current" }),
  teacher({ id: "same-subject" }),
  teacher({ id: "other-subject", subjects: ["Inline"], subjectOptions: [{ id: "s-inline", name: "Inline" }] }),
  teacher({ id: "off-saturday", workDays: [1, 2, 3] }),
  teacher({ id: "not-bookable", bookable: false }),
];

describe("resumeTeacherIdToSend — the key is ABSENT unless the teacher CHANGED", () => {
  it("unchanged ⇒ undefined (the server's byte-for-byte path); changed ⇒ the picked id; nothing picked ⇒ undefined", () => {
    expect(resumeTeacherIdToSend("current", "current")).toBeUndefined();
    expect(resumeTeacherIdToSend("same-subject", "current")).toBe("same-subject");
    expect(resumeTeacherIdToSend(null, "current")).toBeUndefined();
    expect(resumeTeacherIdToSend("", "current")).toBeUndefined();
  });

  it("🔑 the services OMIT the key, not send it as undefined/null — asserted on both request bodies", () => {
    const svc = codeOf("src/services/scheduler.service.ts");
    const course = svc.slice(svc.indexOf("export const resumeCourse"), svc.indexOf("export const resumeCourse") + 1400);
    const booking = svc.slice(svc.indexOf("export const resumeBooking"), svc.indexOf("export const markAttended"));
    for (const body of [course, booking]) {
      expect(body).toContain("...(input.teacherId ? { teacherId: input.teacherId } : {})");
      expect(body).not.toMatch(/^\s*teacherId:\s*input\.teacherId,?\s*$/m); // never a bare property (would send `undefined`)
    }
    expect(course).toContain("startDate: input.startDate,");
    expect(booking).toContain("date: input.date,");
  });
});

describe("resumeTeacherOptions — the create picker's own parts, ONE function, the current teacher always in", () => {
  it("filters by bookable-on-date AND teaches-the-subject (by id for a course row)", () => {
    const ids = resumeTeacherOptions(TEACHERS, "current", SAT, { id: "s-surf", name: "Surfskate" }).map((t) => t.id);
    expect(ids).toEqual(["current", "same-subject"]);
  });

  it("by NAME for a booking (a booking carries the subject name, not its id)", () => {
    const ids = resumeTeacherOptions(TEACHERS, "current", SAT, { name: "Inline" }).map((t) => t.id);
    expect(ids).toEqual(["current", "other-subject"]); // current kept even though they do not teach Inline
  });

  it("🔑 the CURRENT teacher is always an option — off that weekday, not bookable, or not teaching the subject", () => {
    const off = resumeTeacherOptions(TEACHERS, "off-saturday", SAT, { id: "s-surf" }).map((t) => t.id);
    expect(off[0]).toBe("off-saturday");
    const nb = resumeTeacherOptions(TEACHERS, "not-bookable", SAT, { id: "s-surf" }).map((t) => t.id);
    expect(nb[0]).toBe("not-bookable");
    expect(nb.filter((x) => x === "not-bookable").length).toBe(1); // once, not twice
  });

  it("no date yet (the booking dialog opens empty) ⇒ bookable teachers who teach the subject; no subject ⇒ everyone bookable", () => {
    expect(resumeTeacherOptions(TEACHERS, "current", null, { id: "s-surf" }).map((t) => t.id)).toEqual([
      "current",
      "same-subject",
      "off-saturday",
    ]);
    expect(resumeTeacherOptions(TEACHERS, null, SAT, null).map((t) => t.id)).toEqual(["current", "same-subject", "other-subject"]);
    expect(teachesSubject(TEACHERS[0], null)).toBe(true);
  });

  it("🔑 it is the create picker's predicate, reused — not a second one", () => {
    const src = codeOf("src/lib/scheduler/resume-teacher.ts");
    expect(src).toContain('import { bookableOnDate } from "./work-days";');
    expect(src).toContain("bookableOnDate(tc, date)");
    expect(src).not.toMatch(/workDays|dayjs\(|\.day\(\)/); // no re-derived weekday logic
    expect(codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx")).toContain("teachers.filter((tc) => bookableOnDate(tc, date))");
  });
});

describe("both doors — pre-selected default, the shared options, `teacherId` only when changed", () => {
  const course = codeOf("src/components/partials/Bookings/DropResumeDialog.tsx");
  const booking = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
  const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");

  it("course resume (DropResumeDialog): default = the course's teacher, re-seeded on open; options via the ONE function", () => {
    expect(course).toContain("useState<string | null>(courseTeacherId)");
    expect(course).toContain("setTeacherId(courseTeacherId);");
    expect(course).toContain("resumeTeacherOptions(teachers, courseTeacherId, startDate, courseSubject)");
    expect(course).toContain("teacherId: resumeTeacherIdToSend(teacherId, courseTeacherId),");
    expect(course).toContain('label={t("booking.teacher")}');
    // the plan hands over the SAME row's teacher and subject as the slot (courseSlot — first non-extra session)
    expect(plan).toContain("courseTeacherId={courseSlot?.teacher?.id ?? null}");
    expect(plan).toContain("courseSubject={courseSlot?.subject ?? null}");
  });

  it("booking resume (BookingModal): default = the booking's teacher, re-seeded on open; options via the ONE function", () => {
    expect(booking).toContain("useState<string | null>(booking.teacherId)");
    expect(booking).toContain("setResumeTeacher(booking.teacherId);");
    expect(booking).toContain("resumeTeacherOptions(teachers, booking.teacherId, resumeDate, { name: booking.subject })");
    expect(booking).toContain("teacherId: resumeTeacherIdToSend(resumeTeacher, booking.teacherId),");
  });

  it("🚫 no second filter, no client-side teacher↔subject rule, no client-side refusal text", () => {
    // exactly one definition of the options, in the helper; neither dialog filters teachers on its own
    const resumeCourseRegion = course.slice(course.indexOf("const [teacherId, setTeacherId]"), course.indexOf("const submit"));
    expect(resumeCourseRegion).not.toMatch(/teachers\.filter|subjectOptions|bookableOnDate/);
    const resumeBookingRegion = booking.slice(booking.indexOf("const [resumeTeacher"), booking.indexOf("const handleSickLeave"));
    expect(resumeBookingRegion).not.toMatch(/teachers\.filter|subjectOptions|bookableOnDate/);
    // refusals are the server's sentence, unchanged (AC-14's shape), on both doors
    expect(booking).toContain("setResumeError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(course).toContain('setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));');
  });

  it("the hooks carry the optional field through and nothing else moved", () => {
    const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");
    expect(hooks).toContain("resumeCourse(courseId, { startDate, startTime, teacherId })");
    expect(hooks).toContain("resumeBooking(id, { date, startTime, teacherId })");
  });
});
