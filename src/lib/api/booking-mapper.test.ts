import { describe, expect, it } from "bun:test";
import { dtoToBooking } from "./mappers";
import type { BookingDTO } from "@/types/api/contract";

/**
 * 🔴 TASK-227 (SPEC-070 / REQ-078) — the guard for a defect class this ONE function has now produced three
 * times: `dtoToBooking` is an **allow-list object literal**, so a field added to `BookingDTO` reaches the UI
 * only if someone also writes it here — and the compiler stays silent when they don't (its own comment records
 * TASK-170's `discount` and TASK-183's `endedAt`/`endReason`).
 *
 * `displayName` and `teachers` are the same shape of risk with worse consequences: dropping `displayName`
 * blanks the name on every อื่นๆ cell (AC-10), and dropping `teachers` puts a booking in one column instead of
 * three (AC-18). Both would compile, and both would look like "the BE didn't send it".
 */

const teacher = (id: string, nickname: string) =>
  ({ id, name: `ครู${nickname}`, nickname, type: "FULL_TIME" }) as const;

const dto = (over: Partial<BookingDTO> = {}): BookingDTO =>
  ({
    id: "b1",
    date: "2026-09-01",
    startTime: "10:00",
    endTime: "11:00",
    bookingType: "SINGLE_SESSION",
    status: "CONFIRMED",
    note: null,
    student: { id: "s1", name: "เด็กชายเอ", nickname: "น้องเอ" },
    teacher: teacher("t1", "แอน"),
    subject: { id: "sub1", name: "Surfskate" },
    title: null,
    displayName: "น้องเอ",
    teachers: [teacher("t1", "แอน")],
    course: null,
    badges: [],
    discount: null,
    attendeeNote: null,
    pendingSlot: false,
    incomingBookingId: null,
    rescheduleTo: null,
    ...over,
  }) as BookingDTO;

describe("dtoToBooking — the fields an อื่นๆ booking depends on survive the flatten", () => {
  it("carries displayName straight through, never re-derived (AC-10)", () => {
    // The BE resolved this; if the mapper ever recomputes it, the two definitions can disagree.
    expect(dtoToBooking(dto({ displayName: "น้องเอ" })).displayName).toBe("น้องเอ");
  });

  it("keeps the typed title as the name of a student-less อื่นๆ booking (AC-10)", () => {
    const b = dtoToBooking(
      dto({
        bookingType: "OTHER",
        student: null,
        subject: null,
        title: "ปิดปรับปรุงลานสเก็ตช่วงบ่าย",
        displayName: "ปิดปรับปรุงลานสเก็ตช่วงบ่าย",
      }),
    );
    expect(b.displayName).toBe("ปิดปรับปรุงลานสเก็ตช่วงบ่าย");
    // 🔴 Never blank and never the word อื่นๆ — the whole point of AC-10.
    expect(b.displayName).not.toBe("");
    expect(b.displayName).not.toBe("อื่นๆ");
    // No student and no program is a legal booking now — and says so, rather than inventing either.
    expect(b.studentName).toBeNull();
    expect(b.subject).toBeNull();
  });

  it("carries EVERY assigned teacher, first one first (AC-18)", () => {
    const b = dtoToBooking(
      dto({
        bookingType: "OTHER",
        teacher: teacher("t1", "แอน"),
        teachers: [teacher("t1", "แอน"), teacher("t2", "บีม"), teacher("t4", "ดิว")],
      }),
    );
    expect(b.teachers.map((t) => t.id)).toEqual(["t1", "t2", "t4"]);
    // `teachers[0]` is the row's own teacher_id — the invariant the calendar's placement relies on.
    expect(b.teachers[0].id).toBe(b.teacherId);
  });

  it("gives the four lesson types exactly one teacher, so their placement is unchanged (AC-20)", () => {
    expect(dtoToBooking(dto()).teachers.map((t) => t.id)).toEqual(["t1"]);
  });

  it("falls back to the single teacher when a payload predates TASK-224", () => {
    // A post-mutation/embedded payload without `teachers` must still land in ONE column, never in none.
    const legacy = dto();
    delete (legacy as Partial<BookingDTO>).teachers;
    expect(dtoToBooking(legacy).teachers.map((t) => t.id)).toEqual(["t1"]);
  });
});
