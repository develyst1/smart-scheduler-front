import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * TASK-898 (F1) — the guard TASK-172 taught: a field added to an input TYPE but not to the service's explicit body literal type-checks
 * perfectly and never leaves the browser. So this asserts the body each of the five writes actually builds: `branch` rides on create
 * (booking, course, voucher), on a one-off move, and on the whole-course change; and is ABSENT when the caller sends none (the gate off).
 * Payload contract only — the server's storing of it is TASK-889 half 2.
 */
const posted: { method: string; url: string; body: any }[] = [];
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient, // 📌 spread: `mock.module` is process-wide, so a mock that returns only some members deletes the rest for other files
  useMockData: false,
  api: {
    ...realClient.api,
    post: async (url: string, body: any) => {
      posted.push({ method: "POST", url, body });
      return {
        data: {
          booking: {
            id: "b1", date: "2026-08-23", startTime: "10:00", endTime: "11:00", bookingType: "FIRST_TRIAL", status: "PENDING", note: null,
            student: { id: "s1", name: "A", nickname: "A" }, teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" },
            subject: { id: "sub1", name: "Bike" }, course: null, badges: [], pendingSlot: false, incomingBookingId: null, rescheduleTo: null, discount: null,
            branch: "OTHER",
          },
          course: {}, bookings: [], voucher: {}, status: "recorded",
        },
      };
    },
    patch: async (url: string, body: any) => {
      posted.push({ method: "PATCH", url, body });
      return { data: { course: { id: "c1", branch: body.branch }, booking: { id: "b1", branch: body.branch ?? "BRAVO", date: "2026-08-23", startTime: "10:00", endTime: "11:00", bookingType: "FIRST_TRIAL", status: "PENDING", student: { id: "s1", name: "A", nickname: "A" }, teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }, subject: { id: "sub1", name: "Bike" }, course: null, badges: [], pendingSlot: false, incomingBookingId: null, rescheduleTo: null, discount: null } } };
    },
  },
}));

const svc = await import("./scheduler.service");
const { dtoToBooking } = await import("@/lib/api/mappers");
const bodyFor = (method: string, url: string) => posted.find((p) => p.method === method && p.url.startsWith(url))?.body;

beforeEach(() => {
  posted.length = 0;
});

const BOOKING = { studentName: "A", teacherId: "t1", subject: "Bike", subjectId: "sub1", date: "2026-08-23", startTime: "10:00", bookingType: "FIRST_TRIAL" as const };
const COURSE = { studentName: "A", teacherId: "t1", subjectId: "sub1", size: 4 as const, startDate: "2026-08-23", startTime: "10:00" };

describe("`branch` is ON THE WIRE for the five writes", () => {
  it("POST /bookings — the explicit body literal carries it", async () => {
    await svc.createBooking({ ...BOOKING, branch: "OTHER" });
    expect(bodyFor("POST", "/bookings").branch).toBe("OTHER");
  });
  it("POST /courses", async () => {
    await svc.createCoursePackage({ ...COURSE, branch: "OTHER" });
    expect(bodyFor("POST", "/courses").branch).toBe("OTHER");
  });
  it("POST /vouchers", async () => {
    await svc.createVoucher({ studentName: "A", totalHours: 10, branch: "OTHER" });
    expect(bodyFor("POST", "/vouchers").branch).toBe("OTHER");
  });
  it("PATCH /bookings/:id (a one-off move) — the patch goes as built", async () => {
    await svc.moveBooking("b1", { branch: "OTHER" });
    expect(bodyFor("PATCH", "/bookings/b1")).toEqual({ branch: "OTHER" });
  });
  it("PATCH /courses/:id { branch } — the whole-course change", async () => {
    await svc.updateCourseBranch("c1", "OTHER");
    expect(bodyFor("PATCH", "/courses/c1")).toEqual({ branch: "OTHER" });
  });
});

describe("no branch given ⇒ nothing on the wire (the gate off: the request is as it was before F1)", () => {
  it("bookings, courses, vouchers carry no `branch` value", async () => {
    await svc.createBooking(BOOKING);
    await svc.createCoursePackage(COURSE);
    await svc.createVoucher({ studentName: "A", totalHours: 10 });
    expect(bodyFor("POST", "/bookings").branch).toBeUndefined();
    expect(bodyFor("POST", "/courses").branch).toBeUndefined();
    expect(bodyFor("POST", "/vouchers").branch).toBeUndefined();
  });
});

describe("the DTO's branch reaches the UI only if it is mapped", () => {
  it("OTHER is kept; absent or anything else reads as BRAVO", () => {
    const base = { id: "b1", date: "2026-08-23", startTime: "10:00", endTime: "11:00", bookingType: "FIRST_TRIAL", status: "PENDING", note: null, student: { id: "s1", name: "A", nickname: "A" }, teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }, subject: { id: "sub1", name: "Bike" }, course: null, badges: [], pendingSlot: false, incomingBookingId: null, rescheduleTo: null, discount: null, isMakeup: false } as any;
    expect(dtoToBooking({ ...base, branch: "OTHER" }).branch).toBe("OTHER");
    expect(dtoToBooking({ ...base, branch: "BRAVO" }).branch).toBe("BRAVO");
    expect(dtoToBooking({ ...base }).branch).toBe("BRAVO");
    expect(dtoToBooking({ ...base, branch: "elsewhere" as never }).branch).toBe("BRAVO");
  });
});
