import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import PausedTray from "@/components/partials/Calendar/PausedTray";
import { dtoToCourseView } from "@/lib/api/mappers";
import { OFF_CALENDAR_STATUSES, type Booking } from "@/types/app/scheduler";
import type { CourseListItem } from "@/types/api/contract";

/**
 * REQ-091 Deploy B / TASK-374 — the whole-course rental on course creation, and the two Deploy-A QA nits.
 *
 * Pinned: the request shape (OFF ⇒ no key; ON ⇒ `{ code, remark? }`), ONE picker/one options source, the summary
 * line × size, the course card's line, (a) `Add rental` hidden on an off-calendar session by the ONE literal the
 * grids use, (b) the `R` chip in the tray row — rendered.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const section = codeOf("src/components/partials/Calendar/Modal/RentalSection.tsx");
const picker = codeOf("src/components/partials/Rental/RentalTierPicker.tsx");
const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");

describe("§1 — the picker on course creation", () => {
  it("OFF by default ⇒ no `rental` key; ON ⇒ { code, remark? } — form and service agree", () => {
    expect(flow).toContain("const [rentalOn, setRentalOn] = useState(false);");
    expect(flow).toContain('rental: rentalOn && rentalCode ? { code: rentalCode, remark: rentalRemark.trim() || undefined } : undefined,');
    const body = svc.slice(svc.indexOf('api.post<CreateCoursePackageResponse>("/courses"'), svc.indexOf("export const previewCoursePackage"));
    expect(body).toContain("rental: input.rental");
    expect(body).toContain('? { code: input.rental.code, ...(input.rental.remark ? { remark: input.rental.remark } : {}) }');
    expect(body).toContain(": undefined,");
    // JSON drops an `undefined` property — the same mechanism `discount`/`absentWeeks` already rely on
    expect(JSON.parse(JSON.stringify({ size: 8, rental: undefined }))).toEqual({ size: 8 });
    expect(JSON.parse(JSON.stringify({ size: 8, rental: { code: "rental-set" } }))).toEqual({ size: 8, rental: { code: "rental-set" } });
  });

  it("ONE picker, ONE options source — RentalSection and CreatePlanFlow both render `RentalTierPicker`; the labels and the price join live there only", () => {
    expect(section).toContain("<RentalTierPicker code={code} remark={remark} onCode={setCode} onRemark={setRemark} />");
    expect(flow).toContain("<RentalTierPicker code={rentalCode} remark={rentalRemark} onCode={setRentalCode} onRemark={setRentalRemark} />");
    expect(picker).toContain("RENTAL_CODES.map((c) =>");
    expect(picker).toContain('label: t("rental.tierLabel", { tier: t(`rental.tier.${c}`), price: p == null ? "—" : Math.round(p / 100) })');
    expect(picker).toContain("card?.rentalItems.find((r) => r.code === code)?.priceMinor");
    for (const src of [section, flow]) {
      expect(src).not.toMatch(/RENTAL_CODES\.map|rentalItems\.find|rental\.tierLabel/);
    }
    // 🚫 no client-side remark rule anywhere on the create path either
    expect(flow).not.toMatch(/rental-set|rental-ride|REMARK_REQUIRED|remarkRequired/);
    expect(picker).not.toMatch(/required|REMARK_REQUIRED|rental-set" &&/);
  });

  it("the picker sits after the plan, before confirm (PlanModal's create slot), and the summary line is the print shape × size", () => {
    expect(plan).toContain("{createExtras}");
    expect(plan).toContain("{createSummaryLine && (");
    const slot = plan.slice(plan.indexOf("{createExtras}"), plan.indexOf("{createSummaryLine && ("));
    expect(slot).toContain("{createPreviewLine}"); // extras above the preview line, the summary under it
    expect(flow).toContain('createSummaryLine={rentalLine ? t("rental.courseSummary", { line: rentalLine, size }) : null}');
    expect(flow).toContain('label={t("rental.courseToggle")}');
    for (const d of [dictionaries.en, dictionaries.th]) {
      expect(d.rental.courseSummary).toContain("{line} × {size}");
      expect(d.rental.courseToggle.length).toBeGreaterThan(5);
    }
  });

  it("the course card shows the rental line when non-null; the mapper carries it (absent ⇒ null)", () => {
    const panel = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
    expect(panel).toContain("{c.rental && (");
    expect(panel).toContain("rentalPrintLine(t, c.rental.code, c.rental.remark, rentalPriceOf(c.rental.code))");
    const row = {
      id: "c1", size: 8, usedSessions: 0, leaveUsed: 0, leaveQuota: 2, leaveRemaining: 2, maxWeek: 12, leaveLocked: false,
      adminUnlocked: false, endedAt: null, endReason: null, status: "ACTIVE", expiryDate: "2026-12-01", subject: null,
      student: { id: "s1", name: "x" },
    } as unknown as CourseListItem;
    expect(dtoToCourseView(row).rental).toBeNull();
    expect(dtoToCourseView({ ...row, rental: { code: "rental-set", remark: "18-19" } }).rental).toEqual({ code: "rental-set", remark: "18-19" });
  });
});

describe("§2 — the two Deploy-A QA nits", () => {
  it("(a) `Add rental` is hidden on CANCELLED/PAUSED — by the ONE literal the grids use — and shown on ATTENDED/live", () => {
    expect([...OFF_CALENDAR_STATUSES].sort()).toEqual(["CANCELLED", "PAUSED"]); // = the server's rentalBookingLive complement
    expect(section).toContain("const canAdd = !OFF_CALENDAR_STATUSES.includes(booking.status);");
    // REQ-092 Stage 3 (TASK-386) — AND the user's own grant (`calendar.rental`); the status literal is unchanged
    expect(section).toContain('const canRental = can("action:calendar.rental");');
    expect(section).toContain(") : canAdd && canRental ? (");
    expect(section).not.toMatch(/status === "CANCELLED"|status === "PAUSED"|status === "ATTENDED"/); // no second literal
    // the existing-row branch is NOT gated: a row on a cancelled session still renders (and can be paid)
    const before = section.slice(section.indexOf("{rental ? ("), section.indexOf(") : adding ? ("));
    expect(before).not.toContain("canAdd");
  });

  it("(b) rendered: the tray row carries the R chip — green for a paid rental on a cancelled row, nothing without a row", () => {
    const b = (over: Partial<Booking>): Booking =>
      ({
        id: "c1", displayName: "น้องส้ม", studentName: null, nickname: null, title: null, teacherId: "t1",
        teachers: [{ id: "t1", name: "T", nickname: "Coach A", type: "FULLTIME" }], subject: "Surfskate", date: "2026-09-20",
        startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CANCELLED", badges: [], cancelReason: "ADMIN_ERROR", ...over,
      }) as unknown as Booking;
    const render = (rows: Booking[]) =>
      renderToString(h(MantineProvider, null, h(I18nProvider, null, h(PausedTray, { variant: "cancelled", bookings: rows, loading: false, onSelect: () => {}, layout: "rail" }))));
    const paid = render([b({ rental: { code: "rental-set", remark: null, paid: true } })]);
    expect(paid).toContain(">R<");
    expect(paid).toContain("bg-green-700");
    const none = render([b({ rental: null })]);
    expect(none).not.toContain(">R<");
    const tray = codeOf("src/components/partials/Calendar/PausedTray.tsx");
    expect(tray).toContain('<RentalStamp booking={b} size="sm" />');
  });
});
