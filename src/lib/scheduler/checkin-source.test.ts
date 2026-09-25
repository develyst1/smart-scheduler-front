import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { CheckinSourceChip } from "@/components/common/BookingBadges";
import { CHECKIN_SOURCE_LABELS, SHOPFRONT_SOURCE, checkinSourceLabelKey } from "./checkin-source";
import { dtoToBooking } from "@/lib/api/mappers";
import type { BookingDTO } from "@/types/api/contract";

/**
 * REQ-108 / TASK-481/482 — the wall-QR chip. **Only `shopfront-qr` gets one.** The values are OPEN-ENDED (a staff
 * check-in carries an admin's USERNAME), so the pins that matter are the ABSENCES: every other source, and any value
 * nobody has seen, must render nothing and throw nothing.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const badges = codeOf("src/components/common/BookingBadges.tsx");
const table = codeOf("src/components/partials/Bookings/BookingsTable.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const lib = codeOf("src/lib/scheduler/checkin-source.ts");

const render = (source: string | null | undefined) =>
  renderToString(h(MantineProvider, null, h(I18nProvider, null, h(CheckinSourceChip, { source }))))
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Everything that must stay silent: the other known sources, a coach's `null`, and the open-ended shapes. */
const SILENT = ["checkin-qr", "end-of-day", "staff", "admin.somchai", "dong", "", "SHOPFRONT-QR", "shopfront_qr", null, undefined] as const;

describe("§1 — one source has words; everything else is silence", () => {
  it("`shopfront-qr` ⇒ the one key; every other value (known, null, or never seen) ⇒ null, and nothing throws", () => {
    expect(SHOPFRONT_SOURCE).toBe("shopfront-qr");
    expect(checkinSourceLabelKey(SHOPFRONT_SOURCE)).toBe("checkinSource.shopfrontQr");
    for (const s of SILENT) expect({ s, key: checkinSourceLabelKey(s) }).toEqual({ s, key: null });
    // the mapping is ONE table with ONE entry — the next source has an obvious place to be named
    expect(Object.keys(CHECKIN_SOURCE_LABELS)).toEqual(["shopfront-qr"]);
    // 🚫 no switch, no per-source branch in a view, no client rule about the coach's null
    expect(lib).not.toMatch(/switch\s*\(/);
    expect(lib).not.toMatch(/scoped|isScoped|teacher/i);
    // a prototype key must not answer as a source (an open-ended value — an admin USERNAME — is used as a map key)
    for (const s of ["toString", "constructor", "hasOwnProperty"]) expect(checkinSourceLabelKey(s)).toBeNull();
    // 📌 and the MAP is pinned too, not only the result: the hazard is the PAIR (a plain-object map + a truthy lookup),
    // and a mutation that restored the plain lookup passed while the map still had no prototype. Pinning both means a
    // username matching an inherited member can never reach one, whichever half a later change touches.
    expect(Object.getPrototypeOf(CHECKIN_SOURCE_LABELS)).toBeNull();
    expect(Object.isFrozen(CHECKIN_SOURCE_LABELS)).toBe(true);
    // ⚠️ Honest limit: with a null-prototype map the lookup's own shape is unobservable (`hasOwn` and a truthy read
    // behave identically), so the second half is pinned by SOURCE. Either half alone is safe; the pair is what is
    // guarded, and a later change that touches only one of them still meets a failing test.
    expect(lib).toContain("Object.hasOwn(CHECKIN_SOURCE_LABELS, source)");
  });
  it("RENDERED: the chip's words for `shopfront-qr` in both languages; NOTHING at all for the rest", () => {
    expect(render(SHOPFRONT_SOURCE)).toBe("Shop QR");
    for (const s of SILENT) expect({ s, html: render(s) }).toEqual({ s, html: "" }); // no chip, no stray label, no `undefined`
    // and never the raw value on screen
    expect(render("admin.somchai")).not.toContain("somchai");
    expect(render("checkin-qr")).not.toContain("checkin");
  });
});

describe("§2 — both surfaces, one chip, nothing derived", () => {
  it("the roster row and the booking detail render the SAME component from the server's field", () => {
    expect(table).toContain("<CheckinSourceChip source={b.checkinSource} />");
    expect(modal).toContain("<CheckinSourceChip source={booking.checkinSource} />");
    // the chip decides nothing itself: one call to the shared map, and an empty render when it says nothing
    expect(badges).toContain("const key = checkinSourceLabelKey(source);");
    expect(badges).toContain("if (!key) return null;");
    expect(badges).not.toMatch(/=== "shopfront-qr"|checkin-qr|end-of-day/); // the values live in ONE file
    // 🚫 nothing added to a teacher's view: the coach's `null` is the server's decision, not a client branch
    for (const src of [badges, table, modal, lib]) expect(src).not.toMatch(/checkinSource[^)\n]*scoped|scoped[^)\n]*checkinSource/);
  });
  it("the mapper carries the field as sent — nothing invented when it is absent", () => {
    const dto = (over: Partial<BookingDTO>) =>
      ({ id: "b1", date: "2026-09-26", startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "ATTENDED", note: null, student: null, teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }, teachers: [], subject: null, displayName: "A", course: null, badges: [], ...over }) as unknown as BookingDTO;
    expect(dtoToBooking(dto({ checkinSource: "shopfront-qr" })).checkinSource).toBe("shopfront-qr");
    expect(dtoToBooking(dto({ checkinSource: null })).checkinSource).toBeNull();
    expect(dtoToBooking(dto({})).checkinSource).toBeNull(); // an older payload ⇒ null, never a guess
    expect(codeOf("src/lib/api/mappers.ts")).toContain("checkinSource: dto.checkinSource ?? null,");
  });
  it("copy: two keys, both languages, and the Thai words the customer asked for", () => {
    const en = dictionaries.en.checkinSource as Record<string, string>;
    const th = dictionaries.th.checkinSource as Record<string, string>;
    expect(Object.keys(en).length).toBe(2);
    expect(Object.keys(en).length).toBe(Object.keys(th).length);
    expect(en.shopfrontQr).toBe("Shop QR");
    expect(th.shopfrontQr).toBe("เช็คอินจาก QR หน้าร้าน");
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
  });
});
