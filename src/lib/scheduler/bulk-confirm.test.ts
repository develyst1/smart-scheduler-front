import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { BULK_CONFIRMABLE, allConfirmableSelected, bulkConfirmable, confirmableIds, someConfirmableSelected } from "./bulk-confirm";
import { BOOKING_STATUS_COLOR } from "@/types/app/scheduler";
import { dictionaries } from "@/lib/i18n/dictionaries";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const table = codeOf("src/components/partials/Bookings/BookingsTable.tsx");
const row = (id: string, status: string) => ({ id, status }) as { id: string; status: never };

describe("TASK-557 — which rows a bulk confirm may tick", () => {
  it("🔑 the set mirrors the server's `preCheckBulkConfirm`: PENDING and EXTENDED, and nothing else", () => {
    expect([...BULK_CONFIRMABLE]).toEqual(["PENDING", "EXTENDED"]);
    expect(Object.isFrozen(BULK_CONFIRMABLE)).toBe(true);
    expect(bulkConfirmable(row("a", "PENDING"))).toBe(true);
    expect(bulkConfirmable(row("b", "EXTENDED"))).toBe(true);
  });

  it("✅ the frame holds: every OTHER status is untickable — asserted over the closed status set, not a list I chose", () => {
    // 🔑 Exhaustive by CONSTRUCTION, not by a list I typed: `BOOKING_STATUS_COLOR` is a `Record<BookingStatus, …>`, so the
    // compiler refuses to let a status exist without a key here ⇒ a new status is untickable until someone decides.
    const tickable = Object.keys(BOOKING_STATUS_COLOR).filter((s) => bulkConfirmable(row("x", s)));
    expect(tickable).toEqual(["PENDING", "EXTENDED"]);
    for (const s of ["CONFIRMED", "ATTENDED", "CANCELLED", "SICK_LEAVE", "NO_SHOW"] as const) {
      expect(bulkConfirmable(row("x", s))).toBe(false);
    }
  });

  it("the id list is the confirmable rows, in the order shown", () => {
    const rows = [row("p1", "PENDING"), row("c1", "CONFIRMED"), row("e1", "EXTENDED"), row("x1", "CANCELLED")];
    expect(confirmableIds(rows)).toEqual(["p1", "e1"]);
    expect(confirmableIds([])).toEqual([]);
    expect(confirmableIds([row("c1", "CONFIRMED")])).toEqual([]);
  });

  it("🔑 “select all” = every confirmable row: checked when all are in, indeterminate when some are", () => {
    const ids = ["p1", "e1"];
    expect(allConfirmableSelected(ids, ["p1", "e1"])).toBe(true);
    expect(allConfirmableSelected(ids, ["p1"])).toBe(false);
    expect(someConfirmableSelected(ids, ["p1"])).toBe(true);
    expect(someConfirmableSelected(ids, ["p1", "e1"])).toBe(false);
    // nothing selected is neither state — the box is plain unchecked
    expect(allConfirmableSelected(ids, [])).toBe(false);
    expect(someConfirmableSelected(ids, [])).toBe(false);
    // 🚫 and with nothing confirmable on the page there is nothing to be "all" of
    expect(allConfirmableSelected([], [])).toBe(false);
    expect(allConfirmableSelected([], ["p1"])).toBe(false);
  });
});

describe("TASK-557 — the table asks the ONE predicate, in all three places", () => {
  /**
   * 🔴 The three places are the point of this task: the row's tick, the select-all's id list, and the header's
   * checked / indeterminate / disabled state. **They were three separate `b.status === "PENDING"` tests**, which is how
   * the screen drifted from a server fix we shipped in TASK-389 and nobody noticed until Khwan asked.
   */
  it("🚫 not one `status === \"PENDING\"` test is left in the table", () => {
    expect(table).not.toContain('status === "PENDING"');
    expect(table).not.toContain("pendingIds");
  });

  it("the row, the list and the header all read the shared rule", () => {
    expect(table).toContain("{bulkConfirmable(b) && canBulk && (");
    expect(table).toContain("const tickableIds = confirmableIds(rows);");
    expect(table).toContain("const allTickableSelected = allConfirmableSelected(tickableIds, selected);");
    expect(table).toContain("const someTickableSelected = someConfirmableSelected(tickableIds, selected);");
    expect(table).toContain("checked={allTickableSelected}");
    expect(table).toContain("indeterminate={someTickableSelected}");
    expect(table).toContain("disabled={tickableIds.length === 0}");
    expect(table).toContain("const toggleAllTickable = () => setSelected(allTickableSelected ? [] : tickableIds);");
  });

  it("🚫 and the act itself is unchanged: ONE call with the selected ids, nothing per row", () => {
    expect(table).toContain("const res = await bulk.mutateAsync(selected);");
    expect(codeOf("src/services/scheduler.service.ts")).toContain('api.post<BulkConfirmResponse>("/bookings/bulk-confirm", { ids })');
  });
});

/**
 * 📝 **The one piece of new wording this task needed.** The header's label SAID *"Select all pending"* — and after the
 * widening that is a claim the control does not keep. 🔑 **A label that names a status the box no longer honours is the
 * same defect class as the leave dialogs**, one control over: *the screen says something the system does not do.*
 * ⚠️ Pinned BY SHAPE, not by letters, because it is a DRAFT: the owner may reword it in one line.
 */
describe("TASK-557 — the select-all label after the widening (DRAFT)", () => {
  it("🚫 it no longer claims “pending”, and it still says which rows it reaches", () => {
    const en = (dictionaries.en.bookings as unknown as Record<string, string>).bulkSelectAll;
    const th = (dictionaries.th.bookings as unknown as Record<string, string>).bulkSelectAll;
    expect(en.toLowerCase()).not.toContain("pending");
    expect(th).not.toContain("รอยืนยัน");
    // 🔑 the scope stays — it selects this PAGE, not the whole filtered set, and that was never in doubt
    expect(en.toLowerCase()).toContain("this page");
    expect(th).toContain("หน้านี้");
    // and it is marked as a draft, so nobody mistakes my words for his
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8")).toContain("📝 **DRAFT (Fern, TASK-557)**");
  });
});
