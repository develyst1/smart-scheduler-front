import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import RentalGearLine from "@/components/partials/Calendar/Modal/RentalGearLine";
import type { Booking } from "@/types/app/scheduler";

/**
 * REQ-106 §1 / TASK-464 — a COACH sees the session's GEAR (item + remark), read-only. The point of this file is the
 * ABSENCES: no price, no paid/unpaid state, no interactive element — `paid` IS in the object the component is handed
 * (the REQ-097 scope decides which bookings a coach sees, not which fields), so "not rendering it" is the whole task.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const gear = codeOf("src/components/partials/Calendar/Modal/RentalGearLine.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const section = codeOf("src/components/partials/Calendar/Modal/RentalSection.tsx");

const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));
const booking = (rental: Booking["rental"]): Booking => ({ id: "b1", rental } as unknown as Booking);
/** What a reader SEES: the tags stripped, entities resolved, whitespace collapsed. */
const seen = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("§1 — the gear line a coach sees", () => {
  it("renders the item and the remark", () => {
    const html = render(h(RentalGearLine, { booking: booking({ code: "rental-set", remark: "inline skate size 18-19 CM", paid: true }) }));
    expect(seen(html)).toContain("Equipment to prepare");
    expect(seen(html)).toContain("Full Set");
    expect(seen(html)).toContain("inline skate size 18-19 CM");
    expect(html).toContain('data-rental-gear="rental-set"');
  });
  it("🔴 and NOTHING else: no price, no paid/unpaid word, no button — with `paid: true` AND with `paid: false`", () => {
    for (const paid of [true, false]) {
      const html = render(h(RentalGearLine, { booking: booking({ code: "rental-set", remark: "size 18-19", paid }) }));
      const text = seen(html);
      // no money: no ฿, no baht word, no digits-as-price (the remark's own digits are the only numbers here)
      expect(text).not.toContain("฿");
      expect(text.toLowerCase()).not.toContain("baht");
      expect(text.toLowerCase()).not.toContain("rent 2"); // the print line's `Rent 200 / …` shape
      // no paid state, in either language's words
      for (const w of ["Paid", "Unpaid", "paid", "จ่ายแล้ว", "ยังไม่จ่าย", "ค้างชำระ"]) expect({ paid, w, hit: text.includes(w) }).toEqual({ paid, w, hit: false });
      // no doors at all
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("<input");
      expect(html).not.toContain("role=\"button\"");
    }
  });
  it("a session with no rental renders NOTHING — no empty box, no dash", () => {
    expect(render(h(RentalGearLine, { booking: booking(null) }))).not.toContain("data-rental-gear");
    expect(seen(render(h(RentalGearLine, { booking: booking(null) })))).toBe("");
    expect(seen(render(h(RentalGearLine, { booking: booking(undefined as never) })))).toBe("");
    // a rental with no remark: the item alone, still no empty line
    const html = render(h(RentalGearLine, { booking: booking({ code: "rental-helmet", remark: null, paid: false }) }));
    expect(seen(html)).toContain("Helmet");
    expect(seen(html)).not.toContain("—");
  });
});

describe("§2 — the source: the coach's path holds no money and no door", () => {
  it("the gear component imports no price source, reads no `paid`, and mounts no hook but `useT`", () => {
    expect(gear).not.toMatch(/rental\.paid|\.paid\b/);
    expect(gear).not.toMatch(/useRentalPrices|rentalPrintLine|priceOf|useSellablePackages/);
    expect(gear).not.toMatch(/use(Record|Pay|Remove)BookingRental|useCan/);
    expect(gear).not.toMatch(/<Button|onClick=/);
    expect((gear.match(/\buse[A-Z]\w*\(/g) ?? []).sort()).toEqual(["useT("]);
  });
  it("the modal picks the coach's line for a scoped user and the full section otherwise; `RentalSection` itself is untouched", () => {
    expect(modal).toContain("{scoped ? <RentalGearLine booking={booking} /> : <RentalSection booking={booking} />}");
    // the full section still has its three doors and its money — this task did not fork it
    expect(section).toContain('can("action:calendar.rental")');
    expect(section).toContain("usePayBookingRental");
    expect(section).not.toContain("RentalGearLine");
    expect(section).not.toMatch(/scoped/);
  });
  it("copy: the one new key in both languages; the dead `course.defaultRateLine` is gone (@Sober's ruling 09-24)", () => {
    expect(dictionaries.en.rental.gearForCoach).toBe("Equipment to prepare");
    expect(dictionaries.th.rental.gearForCoach).toBe("อุปกรณ์ที่ต้องเตรียม");
    expect(Object.keys(dictionaries.en.rental).length).toBe(Object.keys(dictionaries.th.rental).length);
    expect("defaultRateLine" in dictionaries.en.course).toBe(false);
    expect("defaultRateLine" in dictionaries.th.course).toBe(false);
  });
});
