import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { courseSizesFor, courseSizesForGroup, packageFor, packageForGroup } from "./sellable";
import type { SellablePackagesResponse } from "@/types/api/contract";

/**
 * REQ-095 Stage 2b / TASK-400 — the course form inside a group prices by the GROUP's card (`group.priceGroup` from the
 * server; never kind → group, never a price here), the `Walk-in seat` door on a group row (the EXISTING single-session
 * form locked to the row + `groupId`), the `1h` chip on a walk-in seat. Snapshot unchanged.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const content = codeOf("src/components/partials/Calendar/CalendarContent.tsx");

const card = {
  vatInclusive: true,
  packages: [
    { code: "bike-6", priceGroup: "bike-skate", size: 6, priceMinor: 1, subjects: [{ id: "s1", name: "Bike" }] },
    { code: "duo-1", priceGroup: "balance-duo", size: 1, priceMinor: 190000, subjects: [] },
    { code: "duo-10", priceGroup: "balance-duo", size: 10, priceMinor: 1420000, subjects: [] },
    { code: "duo-4", priceGroup: "balance-duo", size: 4, priceMinor: 680000, subjects: [] },
    { code: "duo-6", priceGroup: "balance-duo", size: 6, priceMinor: 936000, subjects: [] },
    { code: "grp-6", priceGroup: "balance-group", size: 6, priceMinor: 529000, subjects: [] },
    { code: "grp-10", priceGroup: "balance-group", size: 10, priceMinor: 779000, subjects: [] },
  ],
  unpricedSubjects: [],
  voucherAllowedGroups: [],
} as unknown as SellablePackagesResponse;

describe("§1 — the card by price group (pure)", () => {
  it("DUO shows 4/6/10 and Group 6/10 — whatever the card lists under that name; the 1h tier is never a course size; an unknown group ⇒ nothing", () => {
    expect(courseSizesForGroup(card, "balance-duo")).toEqual([4, 6, 10]);
    expect(courseSizesForGroup(card, "balance-group")).toEqual([6, 10]);
    expect(courseSizesForGroup(card, null)).toEqual([]);
    expect(courseSizesForGroup(undefined, "balance-duo")).toEqual([]);
    expect(packageForGroup(card, "balance-duo", 6)?.priceMinor).toBe(936000);
    expect(packageForGroup(card, "balance-group", 4)).toBeUndefined();
    // the DUO packages carry no subject, so the solo readers cannot find them — which is why the group readers exist
    expect(courseSizesFor(card, "s1")).toEqual([6]);
    expect(packageFor(card, "s1", 6)?.priceGroup).toBe("bike-skate");
    // 🔴 the FE never maps kind → price group and never holds a price
    const sellable = codeOf("src/lib/scheduler/sellable.ts");
    expect(sellable).not.toMatch(/DUO|balance-duo|balance-group|\d{4,}/);
    expect(flow).not.toMatch(/balance-duo|balance-group|GROUP_KIND_PRICE/);
  });

  it("the course form inside a group reads the GROUP's card: sizes and the full price by `group.priceGroup`; solo untouched", () => {
    expect(flow).toContain("const sellableSizes = group ? courseSizesForGroup(card, group.priceGroup) : courseSizesFor(card, subjectId);");
    expect(flow).toContain("const chosen = group ? packageForGroup(card, group.priceGroup, size) : packageFor(card, subjectId, size);");
    expect(modal).toContain("priceGroup: booking.group.priceGroup }}");
    expect(codeOf("src/types/api/contract.ts")).toContain("priceGroup: string | null;");
  });
});

describe("§2 — the walk-in seat", () => {
  it("a door on the GROUP row beside `Sell a course`, by the existing `calendar.book` key ⇒ the calendar opens the SAME create form locked to the row", () => {
    const roster = modal.slice(modal.indexOf('{booking.bookingType === "GROUP" && booking.group && ('), modal.indexOf('{booking.bookingType === "OTHER" && booking.other && ('));
    expect(roster).toContain('{can("action:calendar.book") && (');
    expect(roster).toContain("onClick={() => onWalkIn(booking)}");
    expect(content).toContain("setCreateSlot({ teacherId: b.teacherId, time: b.startTime, date: b.date, groupSeat: { groupId: b.id, name: b.group?.name ?? b.displayName } });");
    expect(content).toContain("onWalkIn={openWalkIn}");
    // the form: single-session only (no tabs), teacher + time locked, the date is the slot's, `groupId` in the body
    expect(modal).toContain("const walkIn = createSlot.groupSeat ?? null;");
    expect(modal).toContain("{walkIn ? (");
    expect((modal.match(/disabled=\{!!walkIn\}/g) ?? []).length).toBe(2); // the teacher and the time (the date is the slot's, never a control)
    expect(modal).toContain("groupId: walkIn?.groupId,");
    expect(svc).toContain('groupId: input.bookingType === "SINGLE_SESSION" ? input.groupId : undefined,');
    // the client's own slot check is skipped on a walk-in (the slot IS the group row; the server seats or refuses)
    expect(modal).toMatch(/const existing = walkIn\s+\? undefined\s+: await detect\.mutateAsync\(\{/);
    // 🚫 no second single-session form
    expect(modal).not.toMatch(/WalkInForm|GroupSeatForm/);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(54); // no new key from THIS task (TASK-402's four came after)
  });

  it("the roster shows a `1h` chip on a walk-in seat — from `courseId: null`, one word both languages", () => {
    expect(modal).toContain("{s.courseId === null && (");
    expect(modal).toContain('t("booking.walkInChip")');
    expect(dictionaries.en.booking.walkInChip).toBe("1h");
    expect(dictionaries.th.booking.walkInChip).toBe("1h");
    for (const k of ["walkInSeat", "walkInInto", "walkInChip"]) {
      expect((dictionaries.en.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
