import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { isDeadEntitlement, sortEntitlements } from "./entitlement-order";

/**
 * REQ-105 §2 / SPEC-091 §2 / TASK-455 — a cancelled/expired entitlement sorts to the BOTTOM, faded, under a divider,
 * on BOTH panels through ONE pure sorter. 🚫 No client status derivation; a paused (DROPPED) or COMPLETED course is
 * NOT dead; a row with no status (an older payload) stays live.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const voucher = codeOf("src/components/partials/Bookings/VoucherPanel.tsx");
const course = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
const lib = codeOf("src/lib/scheduler/entitlement-order.ts");

const row = (id: string, status?: string | null) => ({ id, status });

describe("§1 — sortEntitlements, by value", () => {
  it("live first in the server's order, then the dead group in its own order; the four dead statuses and no others", () => {
    const rows = [row("a", "ACTIVE"), row("b", "CANCELLED"), row("c", "DROPPED"), row("d", "EXPIRED"), row("e"), row("f", "EXHAUSTED"), row("g", "COMPLETED"), row("h", "ENDED")];
    const s = sortEntitlements(rows);
    expect(s.live.map((r) => r.id)).toEqual(["a", "c", "e", "g"]); // DROPPED (paused) · no status · COMPLETED stay live
    expect(s.dead.map((r) => r.id)).toEqual(["b", "d", "f", "h"]);
    expect(s.rows.map((r) => r.id)).toEqual(["a", "c", "e", "g", "b", "d", "f", "h"]);
    expect(s.divider).toBe(true);
    // each group keeps the order it arrived in — nothing is re-sorted inside a group
    const two = sortEntitlements([row("z", "CANCELLED"), row("y", "CANCELLED"), row("x", "ACTIVE")]);
    expect(two.rows.map((r) => r.id)).toEqual(["x", "z", "y"]);
  });
  it("the divider belongs BETWEEN two groups: never on an all-live list, an all-dead list (the Inactive tab) or an empty one", () => {
    expect(sortEntitlements([row("a", "ACTIVE")]).divider).toBe(false);
    expect(sortEntitlements([row("a", "CANCELLED"), row("b", "EXPIRED")]).divider).toBe(false);
    expect(sortEntitlements([])).toEqual({ rows: [], live: [], dead: [], divider: false });
  });
  it("isDeadEntitlement: the server's word only — no derivation from dates, hours or an `endedAt`", () => {
    for (const s of ["ENDED", "EXPIRED", "EXHAUSTED", "CANCELLED"]) expect(isDeadEntitlement(s)).toBe(true);
    for (const s of ["ACTIVE", "DROPPED", "COMPLETED", "", null, undefined, "cancelled"]) expect({ s, dead: isDeadEntitlement(s) }).toEqual({ s, dead: false });
    expect(lib).not.toContain("endedAt");
    expect(lib).not.toMatch(/expiryDate|remaining\s*===\s*0/);
  });
});

describe("§2 — both panels use the ONE sorter", () => {
  it("each panel sorts through it, fades the dead rows and renders the divider at the boundary", () => {
    for (const src of [voucher, course]) {
      expect(src).toContain("const sorted = sortEntitlements(data?.items ?? []);");
      // 📌 and the list RENDERED is the sorter's own rows — asserting the call alone let a mutation drop its result
      expect(src).toMatch(/const (vouchers|courses) = sorted.rows;/);
      expect(src).toContain("{sorted.divider && i === sorted.live.length && (");
      expect(src).toContain('{t("bookings.inactiveDivider")}');
      expect(src).toContain("data-inactive-divider");
      expect(src).toContain('data-dead={dead ? "yes" : "no"}');
      expect(src).toMatch(/opacity-60/);
      // 🚫 neither panel decides the GROUP itself: no local filter/sort on a status literal, and `dead` comes
      // only from the shared predicate (a chip may still read one status for its icon — rendering, not membership)
      expect(src).not.toMatch(/\.(filter|sort)\([^)]*status\s*===/);
      expect(src).not.toMatch(/const dead = [^;]*status\s*===/);
    }
    expect(voucher).toContain("const dead = isDeadEntitlement(v.status);");
    expect(course).toContain("const dead = isDeadEntitlement(c.status);");
  });
  it("copy: the divider in both languages", () => {
    expect(dictionaries.en.bookings.inactiveDivider).toBe("Cancelled / expired");
    expect(dictionaries.th.bookings.inactiveDivider).toBe("ยกเลิก / หมดอายุแล้ว");
    expect(Object.keys(dictionaries.en.bookings).length).toBe(Object.keys(dictionaries.th.bookings).length);
  });
});
