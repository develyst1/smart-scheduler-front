import { readFileSync, readdirSync, statSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { LastStamp } from "@/components/common/BookingCellBody";
import { dtoToBooking } from "@/lib/api/mappers";
import type { Booking } from "@/types/app/scheduler";
import type { BookingDTO } from "@/types/api/contract";

/**
 * TASK-367 (`REQ-089 item 5`) — the `Last` stamp on the admin schedule.
 *
 * 🔑 The flag is the SERVER's (`courseLast`, TASK-366) and the stamp renders from it and nothing else — the visible
 * range never holds the whole course, so "last" cannot be derived here. Asserted by rendering, by the mapper, and
 * by absence across the calendar path.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "b1",
    displayName: "น้องส้ม",
    studentName: null,
    nickname: null,
    title: null,
    teacherId: "t1",
    teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULLTIME" }],
    subject: "Surfskate",
    date: "2026-09-20",
    startTime: "10:00",
    endTime: "11:00",
    bookingType: "COURSE_PACKAGE",
    status: "PENDING",
    badges: [],
    ...over,
  }) as unknown as Booking;

const render = (b: Booking, size?: "sm" | "md") =>
  renderToString(h(MantineProvider, null, h(I18nProvider, null, h(LastStamp, { booking: b, size }))));

describe("the stamp renders from `courseLast` only", () => {
  it("true ⇒ the owner's word `Last`, high-contrast; false/undefined ⇒ nothing at all", () => {
    const html = render(booking({ courseLast: true }));
    expect(html).toContain(">Last<");
    expect(html).toContain("bg-neutral-900");
    expect(html).toContain("text-white");
    // MantineProvider emits its own <style> tags, so "nothing" = the same bytes as rendering an empty stamp-less tree
    const empty = renderToString(h(MantineProvider, null, h(I18nProvider, null, null)));
    expect(render(booking({ courseLast: false }))).toBe(empty);
    expect(render(booking({}))).toBe(empty);
    expect(empty).not.toContain("Last");
  });

  it("the same word in both languages — a stamp, not a sentence; the legend text differs", () => {
    expect(dictionaries.en.calendar.lastStamp).toBe("Last");
    expect(dictionaries.th.calendar.lastStamp).toBe("Last");
    expect(dictionaries.en.calendar.lastLegend.length).toBeGreaterThan(5);
    expect(dictionaries.th.calendar.lastLegend).toContain("สุดท้าย");
  });

  it("the mapper carries the flag as a strict boolean — absent on a list/create payload ⇒ false, never undefined", () => {
    const dto = {
      id: "b1", date: "2026-09-20", startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "PENDING",
      note: null, student: null, teacher: { id: "t1", name: "T", nickname: "T", type: "FULLTIME" }, subject: null, title: null,
      displayName: "x", teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULLTIME" }], course: null, discount: null,
      attendeeNote: null, pendingSlot: false, incomingBookingId: null, rescheduleTo: null,
    } as unknown as BookingDTO;
    expect(dtoToBooking(dto).courseLast).toBe(false);
    expect(dtoToBooking({ ...dto, courseLast: true }).courseLast).toBe(true);
    expect(dtoToBooking({ ...dto, courseLast: "yes" as unknown as boolean }).courseLast).toBe(false);
  });
});

describe("ONE component, both views, the legend — and no client-side 'last'", () => {
  const day = codeOf("src/components/partials/Calendar/CalendarGrid.tsx");
  const week = codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx");
  const legend = codeOf("src/components/partials/Calendar/CalendarLegendBar.tsx");
  const body = codeOf("src/components/common/BookingCellBody.tsx");

  it("both grids place `<LastStamp>` on the name row, right after `displayName`", () => {
    for (const [src, name] of [[day, "booking"], [week, "b"]] as const) {
      const nameRow = src.indexOf(`{${name}.displayName}</span>`);
      expect(nameRow).toBeGreaterThan(0);
      const after = src.slice(nameRow, nameRow + 400);
      expect(after).toContain(`<LastStamp booking={${name}}`);
    }
    // not gated by the CellDisplay toggles: the stamp line carries no `display.`
    for (const src of [day, week]) {
      const line = src.split(/\r?\n/).find((l) => l.includes("<LastStamp")) ?? "";
      expect(line).not.toContain("display.");
    }
  });

  it("the legend carries the same chip and the explanation", () => {
    expect(legend).toContain('t("calendar.lastStamp")');
    expect(legend).toContain('t("calendar.lastLegend")');
    expect(legend).toContain("bg-neutral-900");
  });

  it("🚫 `courseLast` is READ, never computed — nowhere on the FE outside the mapper's pass-through", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const q = `${d}/${n}`;
        return statSync(q).isDirectory() ? walk(q) : [q];
      });
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    const writers = files.filter((f) => /courseLast\s*[:=]/.test(codeOf(f)));
    expect(writers).toEqual(["src/lib/api/mappers.ts"]); // the only place that ASSIGNS it, and it copies the DTO
    expect(codeOf("src/lib/api/mappers.ts")).toContain("courseLast: dto.courseLast === true,");
    // and the stamp / grids never compare dates or sizes to find a "last" of their own
    for (const src of [body, day, week]) {
      expect(src).not.toMatch(/isLast|lastSession|endDate|sessions\.at\(-1\)|course\.size|usedSessions/);
    }
    expect(body).toContain("if (booking.courseLast !== true) return null;");
  });
});
