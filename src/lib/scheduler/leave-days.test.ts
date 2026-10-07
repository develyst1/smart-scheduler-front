import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { leaveMarkerKey, leaveMarkersFor } from "./teacher-scope";
import { dictionaries } from "@/lib/i18n/dictionaries";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const banner = codeOf("src/components/partials/Calendar/LeaveDayBanner.tsx");
const content = codeOf("src/components/partials/Calendar/CalendarContent.tsx");

const row = (over: Record<string, unknown> = {}) => ({
  teacherId: "t1",
  teacherName: "เอ",
  date: "2026-10-06",
  reason: "ไปหาหมอ",
  createdBy: "admin",
  bookings: [{ id: "bk-1" }, { id: "bk-2" }],
  ...over,
});

/**
 * 🔴 **TASK-587 (BE) → TASK-589 — a blocked day is VISIBLE to an admin.**
 *
 * The owner ruled those classes are *"listed for the admin to handle by hand"*, which **presupposes the admin knows** — and
 * nothing told them. These are the rules of the marker that does.
 */
describe("🔴 TASK-589 — the marker carries WHOSE day and WHETHER THERE IS WORK", () => {
  it("one marker per recorded day on screen, from the ANSWER — with the class count the server sent", () => {
    const rows = [row(), row({ teacherId: "t2", teacherName: "บี", bookings: [] })];
    // 🔑 the SERVER order, unchanged — the FE filters and shapes, it does not re-sort (see the rule's own note)
    expect(leaveMarkersFor(rows, ["2026-10-06"])).toEqual([
      { teacherId: "t1", teacherName: "เอ", date: "2026-10-06", classes: 2 },
      { teacherId: "t2", teacherName: "บี", date: "2026-10-06", classes: 0 },
    ]);
    // 🚫 nothing outside the dates on screen, and no answer at all is not an error
    expect(leaveMarkersFor(rows, ["2026-10-07"])).toEqual([]);
    expect(leaveMarkersFor(undefined, ["2026-10-06"])).toEqual([]);
  });

  it("🔑 the count is the SERVER's list length — never derived from the calendar the page happens to hold", () => {
    expect(leaveMarkersFor([row({ bookings: [{ id: "a" }, { id: "b" }, { id: "c" }] })], ["2026-10-06"])[0].classes).toBe(3);
    // an older payload with no `bookings` key reads as nothing booked, not as a crash
    expect(leaveMarkersFor([row({ bookings: undefined })], ["2026-10-06"])[0].classes).toBe(0);
    expect(banner).toContain("leaveMarkersFor(rows, dates)");
    expect(banner).not.toContain("calendar");
    expect(banner).not.toContain("useCalendar");
  });

  it("⚖️ the EMPTY blocked day SHOWS — decided out loud, and it diverges from my camp decision on purpose", () => {
    // 📌 TASK-586 hides an empty CLOSED camp week as noise; this shows an empty blocked day. The two markers answer
    // different questions: the camp one reports WORK HAPPENING, this one reports A COACH BEING UNAVAILABLE — and the
    // empty case is exactly the one an admin needs BEFORE booking.
    expect(leaveMarkersFor([row({ bookings: [] })], ["2026-10-06"]).length).toBe(1);
    expect(leaveMarkerKey({ classes: 0 })).toBe("leaveDays.markerAway");
    expect(leaveMarkerKey({ classes: 2 })).toBe("leaveDays.markerClasses");
    // and the reasoning is in the code, not only in the report
    expect(readFileSync("src/lib/scheduler/teacher-scope.ts", "utf8")).toContain("the empty case is exactly the one an admin needs BEFORE booking");
  });

  it("🚫 it is NOT a control — no link, no button, nothing to press", () => {
    for (const forbidden of ["<Link", "onClick", "<Button", "href="]) expect(banner).not.toContain(forbidden);
  });

  it("⚠️ a teacher-scoped session never even ASKS — the gate is `enabled`, not a caught 403", () => {
    expect(content).toContain("useLeaveDays(leaveRange.from, leaveRange.to, !scoped)");
    expect(codeOf("src/hooks/scheduler/useScheduler.ts")).toContain("enabled: Boolean(enabled && from && to),");
    // 🚫 and no try/catch pretending to gate it
    expect(content).not.toMatch(/catch[\s\S]{0,80}leave-days/);
  });

  it("🔑 mounted in BOTH views — a marker you only see after navigating into the day is one you find by luck", () => {
    expect(content).toContain("<LeaveDayBanner rows={leaveDays} dates={[date]} />");
    expect(content).toContain("<LeaveDayBanner rows={leaveDays} dates={weekDays} />");
    // the range follows the view, so the read asks for exactly the dates on screen
    expect(content).toContain('view === "day" ? { from: date, to: date } : { from: weekDays[0], to: weekDays[6] }');
  });

  it("📋 the copy names the coach and the count, in both languages — and never says “cancelled”", () => {
    for (const lang of ["en", "th"] as const) {
      const d = dictionaries[lang].leaveDays as Record<string, string>;
      expect(d.markerClasses).toContain("{name}");
      expect(d.markerClasses).toContain("{n}");
      expect(d.markerAway).toContain("{name}");
      // 🔴 nothing on that day is cancelled — the word must not appear
      expect({ lang, v: d.markerClasses }).toEqual({ lang, v: expect.not.stringMatching(/cancel|ยกเลิก/) });
      expect({ lang, v: d.markerAway }).toEqual({ lang, v: expect.not.stringMatching(/cancel|ยกเลิก/) });
    }
    // 🔻 TASK-701, declared: this pin asserted the marker said DRAFT; the owner's 2026-10-01 "all other sections approved as drafted" (COPY-REVIEW-2026-09-29.md:373) covers it, so the marker now says APPROVED and the pin follows it. ✅ The rule it protects — a string's approval state is DECLARED, never silent — is unchanged.
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8")).toContain("APPROVED by the owner 2026-10-01 (Fern's wording, TASK-589) — COPY-REVIEW-2026-09-29.md:223-224");
  });
});
