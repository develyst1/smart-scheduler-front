import { describe, expect, it } from "bun:test";
import { discountPayload, emptyDiscount, evaluateDiscount, percentOf } from "./discount";

/** These pin the FE mirror against the BE's own rules (`discount-plan.ts`) — the numbers staff see before
 *  committing must be the numbers the ledger records, and "refuse, never clamp" must survive refactors. */

describe("percentOf — the BE's half-up rounding, copied not approximated", () => {
  it("rounds 10% of 79,050 minor to 7,905", () => expect(percentOf(79050, 10)).toBe(7905));
  it("rounds half UP (10% of 7,905 = 791, not 790)", () => expect(percentOf(7905, 10)).toBe(791));
});

describe("untouched = no discount, not an error (AC-7)", () => {
  it("reports no problems and full price payable", () => {
    const r = evaluateDiscount(emptyDiscount(), 50000);
    expect(r).toMatchObject({ touched: false, problemKeys: [], discountMinor: 0, netMinor: 50000 });
  });
  it("sends no `discount` field at all", () => {
    expect(discountPayload(emptyDiscount(), 50000)).toBeUndefined();
  });
});

describe("a reason is mandatory once a value is typed (AC-3)", () => {
  it("flags the missing reason", () => {
    const r = evaluateDiscount({ kind: "BAHT", value: 5000, reason: "  " }, 50000);
    expect(r.problemKeys).toContain("discount.errNoReason");
    expect(discountPayload({ kind: "BAHT", value: 5000, reason: "  " }, 50000)).toBeUndefined();
  });
  it("a reason alone still counts as touched, so the empty value is caught", () => {
    const r = evaluateDiscount({ kind: "BAHT", value: "", reason: "โปรวันแม่" }, 50000);
    expect(r.touched).toBe(true);
    expect(r.problemKeys).toContain("discount.errValue");
  });
});

describe("refuse, never clamp", () => {
  it("refuses a baht discount larger than the price and takes NOTHING off", () => {
    const r = evaluateDiscount({ kind: "BAHT", value: 60000, reason: "x" }, 50000);
    expect(r.problemKeys).toContain("discount.errTooLarge");
    expect(r.discountMinor).toBe(0);
    expect(r.netMinor).toBe(50000); // not 0 — the price is never silently capped
  });
  it("refuses percent out of range", () => {
    expect(evaluateDiscount({ kind: "PERCENT", value: 101, reason: "x" }, 50000).problemKeys)
      .toContain("discount.errPercentRange");
    expect(evaluateDiscount({ kind: "PERCENT", value: 0, reason: "x" }, 50000).problemKeys)
      .toContain("discount.errPercentRange");
  });
  it("refuses a non-integer or non-positive baht value", () => {
    expect(evaluateDiscount({ kind: "BAHT", value: 12.5, reason: "x" }, 50000).problemKeys)
      .toContain("discount.errBahtPositive");
  });
});

describe("reports EVERY problem at once, not one at a time", () => {
  it("names both the missing reason and the too-large amount", () => {
    const r = evaluateDiscount({ kind: "BAHT", value: 99999, reason: "" }, 50000);
    expect(r.problemKeys).toEqual(
      expect.arrayContaining(["discount.errNoReason", "discount.errTooLarge"]),
    );
  });
});

describe("a valid discount", () => {
  it("computes net and produces the payload the BE expects", () => {
    const draft = { kind: "PERCENT" as const, value: 10, reason: "โปรวันแม่" };
    expect(evaluateDiscount(draft, 50000)).toMatchObject({ discountMinor: 5000, netMinor: 45000, problemKeys: [] });
    expect(discountPayload(draft, 50000)).toEqual({ kind: "PERCENT", value: 10, reason: "โปรวันแม่" });
  });
  it("trims the reason before sending", () => {
    expect(discountPayload({ kind: "BAHT", value: 100, reason: "  ลูกค้าเก่า  " }, 50000))
      .toEqual({ kind: "BAHT", value: 100, reason: "ลูกค้าเก่า" });
  });
});
