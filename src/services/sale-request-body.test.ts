import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * TASK-172 — the guard for the class of defect that bit REQ-063 twice in two days, and that neither the compiler
 * nor any UI test caught:
 *   1. **wrong unit on the wire** — a BAHT discount sent as satang (`391` → ฿3.91 posted);
 *   2. **field silently dropped** — `discount` added to `CreateBookingInput` but never to `createBooking`'s POST
 *      body, which is an explicit object literal. Type-checked perfectly; the value never left the browser.
 *
 * Both were type-happy and screen-plausible, and both were found downstream against a real ledger. The one cheap
 * thing that catches them is asserting **the body each sale service actually builds**. These tests are the payload
 * contract only — deliberately not UI tests.
 */

const posted: { url: string; body: any }[] = [];

mock.module("@/lib/api/client", () => ({
  useMockData: false,
  api: {
    post: async (url: string, body: any) => {
      posted.push({ url, body });
      // Shapes just rich enough for each service's return mapping not to throw.
      return {
        data: {
          booking: {
            id: "b1", date: "2026-08-23", startTime: "10:00", endTime: "11:00",
            bookingType: "FIRST_TRIAL", status: "PENDING", note: null,
            student: { id: "s1", name: "A", nickname: "A" },
            teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" },
            subject: { id: "sub1", name: "Bike" },
            course: null, badges: [], pendingSlot: false,
            incomingBookingId: null, rescheduleTo: null, discount: null,
          },
          course: {}, bookings: [], voucher: {}, status: "recorded",
        },
      };
    },
  },
  ApiClientError: class ApiClientError extends Error {},
  errorProblems: () => [],
}));

const svc = await import("./scheduler.service");

const DISCOUNT = { kind: "BAHT" as const, value: 391, reason: "โปรวันแม่" };
const bodyFor = (url: string) => posted.find((p) => p.url.startsWith(url))?.body;

beforeEach(() => {
  posted.length = 0;
});

describe("every sale service puts the discount ON THE WIRE, as the human number", () => {
  it("POST /bookings carries it — the exact field TASK-170 dropped", async () => {
    await svc.createBooking({
      studentName: "A", teacherId: "t1", subject: "Bike", subjectId: "sub1",
      date: "2026-08-23", startTime: "10:00", bookingType: "FIRST_TRIAL",
      discount: DISCOUNT,
    });
    const body = bodyFor("/bookings");
    // 🔴 This assertion FAILS against the pre-TASK-170 code, where the body literal simply had no `discount` key.
    expect(body.discount).toEqual(DISCOUNT);
    // 🔴 And this one fails against pre-TASK-169 code, where 391 baht would have travelled as satang.
    expect(body.discount.value).toBe(391);
  });

  it("POST /courses carries it", async () => {
    await svc.createCoursePackage({
      studentName: "A", teacherId: "t1", subjectId: "sub1", size: 4,
      startDate: "2026-08-23", startTime: "10:00", discount: DISCOUNT,
    });
    expect(bodyFor("/courses").discount).toEqual(DISCOUNT);
  });

  it("POST /vouchers carries it", async () => {
    await svc.createVoucher({ studentName: "A", totalHours: 10, discount: DISCOUNT });
    expect(bodyFor("/vouchers").discount).toEqual(DISCOUNT);
  });

  it("POST /rentals carries it", async () => {
    await svc.recordRental({ code: "rental-set", hours: 2, discount: DISCOUNT });
    expect(bodyFor("/rentals").discount).toEqual(DISCOUNT);
  });
});

describe("no discount entered ⇒ nothing on the wire (AC-7 — the request stays as it was before REQ-063)", () => {
  it("bookings", async () => {
    await svc.createBooking({
      studentName: "A", teacherId: "t1", subject: "Bike", subjectId: "sub1",
      date: "2026-08-23", startTime: "10:00", bookingType: "FIRST_TRIAL",
    });
    expect(bodyFor("/bookings").discount).toBeUndefined();
  });

  it("courses", async () => {
    await svc.createCoursePackage({
      studentName: "A", teacherId: "t1", subjectId: "sub1", size: 4,
      startDate: "2026-08-23", startTime: "10:00",
    });
    expect(bodyFor("/courses").discount).toBeUndefined();
  });

  it("vouchers", async () => {
    await svc.createVoucher({ studentName: "A", totalHours: 10 });
    expect(bodyFor("/vouchers").discount).toBeUndefined();
  });

  it("rentals", async () => {
    await svc.recordRental({ code: "rental-set", hours: 2 });
    expect(bodyFor("/rentals").discount).toBeUndefined();
  });
});
