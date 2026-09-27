import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { CheckinSourceChip } from "@/components/common/BookingBadges";
import { CHECKIN_CHANNEL_LABELS, SHOPFRONT_CHANNEL, checkinChannelLabelKey } from "./checkin-source";
import { CHECKIN_CHANNELS } from "@/types/api/contract";
import { dtoToBooking } from "@/lib/api/mappers";
import type { BookingDTO } from "@/types/api/contract";

/**
 * REQ-108 / TASK-481/482 → **TASK-527: the chip reads `checkinChannel`, the CLOSED set.**
 *
 * 🔴 Why it moved: `checkinSource` is deprecated and due to be dropped, and this chip was its **last reader** — a drop
 * while it read that column would have silenced the chip **without failing a test on either side** (the drop is a BE task,
 * the chip is an FE file, neither repo objects). And the chip is not decoration: it is **the only evidence an unlinked
 * family will ever have that a wall-QR check-in happened** (REQ-108 §5, the gap the owner accepted).
 *
 * 🔑 Only `shopfront-qr` gets a chip. The other four channels, an unknown one, and `null` render **nothing** and throw
 * nothing — pinned by RENDERING. 🚫 `checkinActor` is never read (asserted on comment-stripped code: the prose may name
 * the rule while the code may not do it).
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

const render = (channel: string | null | undefined) =>
  renderToString(h(MantineProvider, null, h(I18nProvider, null, h(CheckinSourceChip, { channel }))))
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Everything that must stay silent: the other four channels, a coach's `null`, and anything unrecognised. */
const SILENT = ["checkin-qr", "line", "staff", "end-of-day", "kiosk", "", "SHOPFRONT-QR", "shopfront_qr", "admin.somchai", null, undefined] as const;

describe("§1 — one channel has words; everything else is silence", () => {
  it("`shopfront-qr` ⇒ the one key; the other four channels and anything unrecognised ⇒ null, and nothing throws", () => {
    expect(SHOPFRONT_CHANNEL).toBe("shopfront-qr");
    expect(CHECKIN_CHANNELS).toContain(SHOPFRONT_CHANNEL); // it is a member of the server's closed set
    expect(checkinChannelLabelKey(SHOPFRONT_CHANNEL)).toBe("checkinSource.shopfrontQr");
    for (const c of SILENT) expect({ c, key: checkinChannelLabelKey(c) }).toEqual({ c, key: null });
    // every channel of the closed set is decided by value — four silent, one with words
    for (const c of CHECKIN_CHANNELS) expect({ c, chip: checkinChannelLabelKey(c) !== null }).toEqual({ c, chip: c === "shopfront-qr" });
    expect(Object.keys(CHECKIN_CHANNEL_LABELS)).toEqual(["shopfront-qr"]);
    // 📌 the null-prototype map and `hasOwn` are KEPT even though the field is closed now: the guard costs nothing and
    // the map is one `as unknown as` away from being fed free text again
    expect(Object.getPrototypeOf(CHECKIN_CHANNEL_LABELS)).toBeNull();
    expect(Object.isFrozen(CHECKIN_CHANNEL_LABELS)).toBe(true);
    expect(lib).toContain("Object.hasOwn(CHECKIN_CHANNEL_LABELS, channel)");
    for (const k of ["toString", "constructor", "hasOwnProperty"]) expect(checkinChannelLabelKey(k)).toBeNull();
  });
  it("RENDERED: the chip's words for `shopfront-qr` in both languages; NOTHING at all for the rest", () => {
    expect(render(SHOPFRONT_CHANNEL)).toBe("Shop QR");
    for (const c of SILENT) expect({ c, html: render(c) }).toEqual({ c, html: "" });
    expect(render("admin.somchai")).not.toContain("somchai"); // never the raw value, even if one reached here
    expect(render("staff")).not.toContain("staff");
  });
  it("🚫 `checkinActor` is never read, and the deprecated `checkinSource` is not read either", () => {
    for (const src of [lib, badges, table, modal]) expect(src).not.toContain("checkinActor");
    // 📌 the FIELD is not read anywhere; the only `checkinSource` text left is the dictionary KEY (a copy path, not a
    // payload field), so the pin names the field access rather than the string — a rename of the copy key is not a
    // regression, reading the column again is.
    for (const src of [lib, badges, table, modal]) expect(src).not.toMatch(/\.checkinSource\b/);
    expect(lib).toContain('"checkinSource.shopfrontQr"'); // the dictionary key keeps its name; the FIELD is not read
  });
});

describe("§2 — both surfaces, the mapper, the copy", () => {
  it("the roster row and the booking detail pass the CHANNEL to the same component", () => {
    expect(table).toContain("<CheckinSourceChip channel={b.checkinChannel} />");
    expect(modal).toContain("<CheckinSourceChip channel={booking.checkinChannel} />");
    expect(badges).toContain("const key = checkinChannelLabelKey(channel);");
    expect(badges).toContain("if (!key) return null;");
    expect(badges).not.toMatch(/=== "shopfront-qr"|checkin-qr|end-of-day/); // the values live in ONE file
  });
  it("the mapper carries the provenance as sent — nothing invented when a field is absent", () => {
    const dto = (over: Partial<BookingDTO>) =>
      ({ id: "b1", date: "2026-09-27", startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "ATTENDED", note: null, student: null, teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }, teachers: [], subject: null, displayName: "A", course: null, badges: [], ...over }) as unknown as BookingDTO;
    expect(dtoToBooking(dto({ checkinChannel: "shopfront-qr" })).checkinChannel).toBe("shopfront-qr");
    expect(dtoToBooking(dto({ checkinChannel: null })).checkinChannel).toBeNull();
    expect(dtoToBooking(dto({})).checkinChannel).toBeNull(); // an older payload ⇒ null, never a guess
    expect(codeOf("src/lib/api/mappers.ts")).toContain("checkinChannel: dto.checkinChannel ?? null,");
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
