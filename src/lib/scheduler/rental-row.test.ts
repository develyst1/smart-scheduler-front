import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { RentalStamp } from "@/components/common/BookingCellBody";
import { rentalPrintLine } from "@/components/partials/Calendar/Modal/RentalSection";
import { dtoToBooking } from "@/lib/api/mappers";
import { RENTAL_CODES, type Booking } from "@/types/app/scheduler";
import type { BookingDTO } from "@/types/api/contract";

/**
 * REQ-091 Deploy A / TASK-372 — the `R` chip (red unpaid → green paid) and the rental section on the booking modal.
 *
 * 🔑 Everything renders from the server's `booking.rental` row; every rule is a named code shown as its sentence.
 * Pinned: the chip's three states (rendered), the print shape, the three request shapes, the two taps on PAID,
 * remove offered only while unpaid, the mapper, the legend, and no client-side rule.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "b1", displayName: "น้องส้ม", studentName: null, nickname: null, title: null, teacherId: "t1",
    teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULLTIME" }], subject: "Surfskate", date: "2026-09-20",
    startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "PENDING", badges: [], ...over,
  }) as unknown as Booking;
const render = (b: Booking) => renderToString(h(MantineProvider, null, h(I18nProvider, null, h(RentalStamp, { booking: b }))));
const empty = renderToString(h(MantineProvider, null, h(I18nProvider, null, null)));
const t = (key: string, vars?: Record<string, string | number>) => {
  const v = key.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), dictionaries.en);
  return typeof v === "string" ? v.replace(/\{(\w+)\}/g, (m, n) => (vars && n in vars ? String(vars[n]) : m)) : key;
};

describe("§1 — the R chip renders from `booking.rental` only", () => {
  it("null ⇒ nothing; unpaid ⇒ red R; paid ⇒ green R — solid, not pastel", () => {
    expect(render(booking({ rental: null }))).toBe(empty);
    expect(render(booking({}))).toBe(empty);
    const unpaid = render(booking({ rental: { code: "rental-set", remark: "size 18", paid: false } }));
    expect(unpaid).toContain(">R<");
    expect(unpaid).toContain("bg-red-600");
    expect(unpaid).not.toContain("bg-green-700");
    const paid = render(booking({ rental: { code: "rental-set", remark: null, paid: true } }));
    expect(paid).toContain(">R<");
    expect(paid).toContain("bg-green-700");
    expect(paid).not.toContain("bg-red-600");
    expect(paid).toContain("text-white");
  });

  it("both grids place it on the name row beside `LastStamp`, ungated; the legend shows both states", () => {
    for (const f of ["src/components/partials/Calendar/CalendarGrid.tsx", "src/components/partials/Calendar/CalendarWeekGrid.tsx"]) {
      const src = codeOf(f);
      const last = src.indexOf("<LastStamp");
      expect(last).toBeGreaterThan(0);
      expect(src.slice(last, last + 200)).toContain("<RentalStamp booking=");
      const line = src.split(/\r?\n/).find((l) => l.includes("<RentalStamp")) ?? "";
      expect(line).not.toContain("display.");
    }
    const legend = codeOf("src/components/partials/Calendar/CalendarLegendBar.tsx");
    expect(legend).toContain('t("calendar.rentalLegendUnpaid")');
    expect(legend).toContain('t("calendar.rentalLegendPaid")');
    expect(legend).toContain("bg-red-600");
    expect(legend).toContain("bg-green-700");
  });

  it("the mapper carries the row as sent; absent ⇒ null; `hasRental` is gone from the FE", () => {
    const dto = {
      id: "b1", date: "2026-09-20", startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "PENDING",
      note: null, student: null, teacher: { id: "t1", name: "T", nickname: "T", type: "FULLTIME" }, subject: null, title: null,
      displayName: "x", teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULLTIME" }], course: null, discount: null,
      attendeeNote: null, pendingSlot: false, incomingBookingId: null, rescheduleTo: null,
    } as unknown as BookingDTO;
    expect(dtoToBooking(dto).rental).toBeNull();
    expect(dtoToBooking({ ...dto, rental: { code: "rental-ride", remark: "inline 18", paid: true } }).rental).toEqual({ code: "rental-ride", remark: "inline 18", paid: true });
    for (const f of ["src/lib/api/mappers.ts", "src/types/app/scheduler/index.ts", "src/components/common/BookingCellBody.tsx"]) {
      expect(codeOf(f)).not.toContain("hasRental");
    }
    // 🚫 no client-side "paid": the chip reads the flag and nothing else
    const body = codeOf("src/components/common/BookingCellBody.tsx");
    expect(body.slice(body.indexOf("export function RentalStamp"), body.indexOf("export function BookingTypeStripe"))).not.toMatch(/ledger|sale|priceMinor|paid_at|report/);
  });
});

describe("§2 — the modal's rental section", () => {
  const section = codeOf("src/components/partials/Calendar/Modal/RentalSection.tsx");
  const svc = codeOf("src/services/scheduler.service.ts");
  const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");

  it("the five tiers in the customer's ladder; the print shape `Rent 200 / Full Set (inline skate size 18-19 CM)`", () => {
    expect([...RENTAL_CODES]).toEqual(["rental-helmet", "rental-pads", "rental-helmet-pads", "rental-ride", "rental-set"]);
    expect(rentalPrintLine(t, "rental-set", "inline skate size 18-19 CM", 20000)).toBe("Rent 200 / Full Set (inline skate size 18-19 CM)");
    expect(rentalPrintLine(t, "rental-helmet-pads", null, 10000)).toBe("Rent 100 / Helmet + Pad");
    expect(rentalPrintLine(t, "rental-ride", "pair 3", undefined)).toBe("Rent — / Ride only (pair 3)");
    for (const c of RENTAL_CODES) expect(dictionaries.th.rental.tier[c].length).toBeGreaterThan(0);
  });

  it("request shapes: add ⇒ POST {code, remark?} (remark only when typed) · paid ⇒ POST …/paid {} · remove ⇒ DELETE", () => {
    const rec = svc.slice(svc.indexOf("export const recordBookingRental"), svc.indexOf("export const payBookingRental"));
    expect(rec).toContain("api.post<{ rental: BookingRental }>(`/bookings/${bookingId}/rental`, {");
    expect(rec).toContain("...(input.remark ? { remark: input.remark } : {})");
    expect(svc).toContain("api.post<{ rental: BookingRental }>(`/bookings/${bookingId}/rental/paid`, {})");
    expect(svc).toContain("api.delete<{ removed: true }>(`/bookings/${bookingId}/rental`)");
    // the section never decides the remark rule — no tier check before the call
    expect(section).toContain("remark: remark.trim() || undefined");
    expect(section).not.toMatch(/rental-set.*required|REMARK_REQUIRED|remarkRequired|code === "rental-(set|ride)"/);
  });

  it("mark paid is TWO taps (the confirm names the line); a refusal shows the server's sentence and leaves the button live", () => {
    const paid = section.slice(section.indexOf("const submitPaid"), section.indexOf("const submitRemove"));
    // the confirm is the GATE, not decoration: the exact `if (!(await askConfirm(` shape, no short-circuit in front of
    // it, and the money call only after it
    expect(paid).toMatch(/if \(\s*!\(await askConfirm\(\{/);
    expect(paid).not.toMatch(/(false|true)\s*(&&|\|\|)\s*!?\(await askConfirm/);
    expect(paid.indexOf("askConfirm(")).toBeLessThan(paid.indexOf("pay.mutateAsync"));
    expect(paid).toContain('t("rental.markPaidBody", { line })');
    expect(paid).toContain("await pay.mutateAsync(booking.id);");
    expect(paid).toContain("fail(e);");
    expect(paid).not.toMatch(/setAdding|disabled = true|paidLocally/);
    expect(section).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message)");
  });

  it("remove is offered ONLY while unpaid; the paid row shows no buttons", () => {
    const row = section.slice(section.indexOf("{rental ? ("), section.indexOf(") : adding ? ("));
    expect(row).toContain("{!rental.paid && (");
    const gated = row.slice(row.indexOf("{!rental.paid && ("));
    expect(gated).toContain("onClick={submitPaid}");
    expect(gated).toContain("onClick={submitRemove}");
    expect(row.slice(0, row.indexOf("{!rental.paid && ("))).not.toMatch(/onClick=\{submit(Paid|Remove)\}/);
  });

  it("mounted in the booking modal; the ⋯ 'Add rental' door is gone; the standalone RentalModal stays on the Bookings page", () => {
    expect(modal).toContain("<RentalSection booking={booking} />");
    expect(modal).not.toContain("RentalModal");
    expect(modal).not.toContain("setRentalOpen");
    expect(codeOf("src/components/partials/Bookings/BookingsContent.tsx")).toContain("<RentalModal");
    expect(readFileSync("src/components/partials/Rental/RentalModal.tsx", "utf8").length).toBeGreaterThan(100);
  });

  it("the hooks invalidate the same set pause/resume do; copy counted", () => {
    const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");
    for (const name of ["useRecordBookingRental", "usePayBookingRental", "useRemoveBookingRental"]) {
      const fn = hooks.slice(hooks.indexOf(`export const ${name}`), hooks.indexOf(`export const ${name}`) + 400);
      expect(fn).toContain("onSuccess: () => invalidateAll(qc)");
    }
    const keys = ["section", "tierLabel", "remark", "remarkHint", "save", "printLine", "paidState", "unpaidState", "markPaid", "markPaidTitle", "markPaidBody", "markPaidConfirm", "remove", "paidOk", "savedOk", "removedOk"] as const;
    for (const d of [dictionaries.en, dictionaries.th]) {
      for (const k of keys) expect((d.rental as Record<string, unknown>)[k]).toBeTruthy();
      expect(d.rental.printLine).toBe("Rent {price} / {tier}");
      expect(d.rental.markPaidBody).toContain("{line}");
      expect(d.calendar.rentalStamp).toBe("R");
    }
  });
});
