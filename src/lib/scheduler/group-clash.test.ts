import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { clashDoors, clashPartner, groupTone, inClashPair, isClash, moveBody, moveReady, seatCountLabel, swapCoachBody } from "./group-clash";
import { seatsLabel } from "./group-session";

/**
 * REQ-105 / SPEC-091 / TASK-453/457 — the group clash on the grid: the SERVER's `group.clash` (never re-derived), the
 * two colour states, the PAIR, the two resolution doors and their bodies, and the refusal that leaves the clash alone.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const box = codeOf("src/components/partials/Calendar/Modal/ClashResolveBox.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const cell = codeOf("src/components/common/BookingCellBody.tsx");
const dayGrid = codeOf("src/components/partials/Calendar/CalendarGrid.tsx");
const weekGrid = codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx");
const lib = codeOf("src/lib/scheduler/group-clash.ts");
const service = codeOf("src/services/scheduler.service.ts");

type Row = { id: string; teacherId: string; date: string; startTime: string; bookingType: string; group: unknown };
const seat = (status = "CONFIRMED") => ({ bookingId: "s", studentId: "st", studentName: "A", status, courseId: null });
const group = (over: Record<string, unknown> = {}): Row =>
  ({ id: "g1", teacherId: "t1", date: "2026-10-05", startTime: "10:00", bookingType: "GROUP", group: { key: "k", kind: "GROUP", priceGroup: null, name: "Group A", seatCap: 4, seats: [seat()], teacherRates: {}, ratePostedAt: null, ...over } }) as Row;
const priv = (over: Partial<Row> = {}): Row => ({ id: "p1", teacherId: "t1", date: "2026-10-05", startTime: "10:00", bookingType: "COURSE_PACKAGE", group: null, ...over }) as Row;

describe("§1 — the server's verdict, the tones, the pair", () => {
  it("`isClash` reads `group.clash` and never re-derives it from `yieldedAt` + seats", () => {
    expect(isClash(group({ clash: true }) as never)).toBe(true);
    expect(isClash(group({ clash: false, yieldedAt: "2026-10-01T00:00:00Z" }) as never)).toBe(false); // yielded but the server says no clash
    expect(isClash(group({ yieldedAt: "2026-10-01T00:00:00Z" }) as never)).toBe(false); // older payload: no flag ⇒ no claim
    expect(isClash(priv() as never)).toBe(false);
    expect(lib).not.toMatch(/yieldedAt\s*&&|seats\.length\s*>\s*0\s*&&\s*\w*[Yy]ield/);
  });
  it("two colour states, and CLASH outranks both; the seat count has no invented denominator when uncapped", () => {
    expect(groupTone(group({ seats: [seat()] }) as never)).toBe("filled");
    expect(groupTone(group({ seats: [] }) as never)).toBe("empty");
    expect(groupTone(group({ seats: [seat("CANCELLED")] }) as never)).toBe("empty"); // a cancelled seat is not a child in the room
    expect(groupTone(group({ seats: [], clash: true }) as never)).toBe("clash");
    expect(groupTone(group({ seats: [seat()], clash: true }) as never)).toBe("clash");
    expect(seatCountLabel(group({ seats: [seat(), seat()], seatCap: 4 }) as never)).toBe("2/4");
    expect(seatCountLabel(group({ seats: [seat()], seatCap: null }) as never)).toBe("1"); // uncapped ⇒ a bare count
    expect(seatsLabel({ seats: [seat()], seatCap: null })).toBe("1");
    expect(seatsLabel({ seats: [seat(), seat()], seatCap: 6 })).toBe("2/6");
  });
  it("the PAIR is the coach-hour: both halves wear the mark, and a row on another hour or coach does not", () => {
    const rows = [group({ clash: true }), priv(), priv({ id: "p2", startTime: "11:00" }), priv({ id: "p3", teacherId: "t2" })];
    expect(clashPartner(rows[0], rows).map((r) => r.id)).toEqual(["g1", "p1"]);
    expect(inClashPair(rows[0], rows)).toBe(true); // the group itself
    expect(inClashPair(rows[1], rows)).toBe(true); // the Private standing in its hour
    expect(inClashPair(rows[2], rows)).toBe(false); // another hour
    expect(inClashPair(rows[3], rows)).toBe(false); // another coach
    // no clash anywhere ⇒ nobody wears it
    const calm = [group({ clash: false }), priv()];
    expect(calm.map((r) => inClashPair(r, calm))).toEqual([false, false]);
  });
  it("the doors: both behind `booking-edit` and only while the server says clash; the two bodies", () => {
    expect(clashDoors({ edit: true }, group({ clash: true }) as never)).toEqual({ movePrivate: true, swapCoach: true });
    expect(clashDoors({ edit: false }, group({ clash: true }) as never)).toEqual({ movePrivate: false, swapCoach: false });
    expect(clashDoors({ edit: true }, group({ clash: false }) as never)).toEqual({ movePrivate: false, swapCoach: false });
    expect(moveBody({ teacherId: "t2", date: null, startTime: null })).toEqual({ teacherId: "t2" });
    expect(moveBody({ teacherId: null, date: "2026-10-06", startTime: "11:00" })).toEqual({ date: "2026-10-06", startTime: "11:00" });
    expect(moveBody({ teacherId: null, date: null, startTime: null })).toEqual({});
    expect(moveReady({ teacherId: null, date: null, startTime: null })).toBe(false);
    expect(moveReady({ teacherId: null, date: null, startTime: "11:00" })).toBe(true);
    expect(swapCoachBody("t9")).toEqual({ teacherId: "t9" });
  });
});

describe("§2 — the box, the grids, the wire", () => {
  it("the box acts on the PAIR: move sends the PRIVATE's id, swap the GROUP row's; a refusal leaves the clash alone", () => {
    expect(box).toContain("const pair = clashPartner(booking, rows);");
    expect(box).toContain("await move.mutateAsync({ bookingId: privateRow.id, body: moveBody(draft) });");
    expect(box).toContain("await swap.mutateAsync({ bookingId: groupRow.id, teacherId: to });");
    // the refusal path: the server's sentence into local state, and NOTHING else — no refetch, no optimistic clear
    expect(box).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(box).not.toMatch(/catch[\s\S]{0,200}(invalidate|refetch|setMode\(null\))/);
    // ① first, ② second — the owner's default is the one offered first
    expect(box.indexOf('t("clash.movePrivate")')).toBeLessThan(box.indexOf('t("clash.swapCoach")'));
    expect(box).toContain("{doors.movePrivate && (");
    expect(box).toContain("{doors.swapCoach && (");
    expect(box).not.toMatch(/disabled=\{!can\(/); // hidden, never disabled
  });
  it("the modal renders the box on EITHER half; the grids mark both halves and paint the group's tone", () => {
    expect(modal).toContain("{inClashPair(booking, bookings) && <ClashResolveBox booking={booking} rows={bookings} teachers={teachers} />}");
    expect(cell).toContain("export function ClashMark(");
    expect(cell).toContain("if (!isClash(booking) && !inPair) return null;");
    expect(dayGrid).toContain("<ClashMark booking={booking} inPair={inClashPair(booking, bookings)} />");
    expect(weekGrid).toContain('<ClashMark booking={b} inPair={inClashPair(b, bookings)} size="sm" />');
    expect(dayGrid).toContain('data-group-tone={booking.bookingType === "GROUP" ? groupTone(booking) : undefined}');
    expect(cell).toContain("export function groupToneClass(");
  });
  it("the two routes, and the copy in both languages", () => {
    expect(service).toContain("api.post(`/bookings/${bookingId}/resolve-clash/move`, body)");
    expect(service).toContain("api.post(`/bookings/${bookingId}/resolve-clash/swap-coach`, body)");
    for (const lang of ["en", "th"] as const) {
      const c = dictionaries[lang].clash as Record<string, string>;
      for (const k of ["title", "pairLine", "movePrivate", "moveHint", "moveConfirm", "movedOk", "swapCoach", "swapTo", "swapConfirm", "swappedOk", "mark", "markTitle"]) expect(typeof c[k]).toBe("string");
      expect(c.pairLine).toContain("{group}");
      expect(c.pairLine).toContain("{student}");
    }
    expect(Object.keys(dictionaries.en.clash).length).toBe(Object.keys(dictionaries.th.clash).length);
  });
});
