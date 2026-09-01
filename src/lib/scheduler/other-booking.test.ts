import { describe, expect, it } from "bun:test";
import { emptyOtherBooking, evaluateOtherBooking, type OtherBookingDraft } from "./other-booking";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * SPEC-070 / REQ-078 / TASK-226 — the อื่นๆ form's rules.
 *
 * 📌 **In REQ-078 the negatives ARE the requirement** (AC-10 / AC-11 / AC-12 / AC-19), so they are what is
 * pinned here. The server re-validates all of it; this layer exists so staff are told what is wrong *before*
 * they commit, and a rule that only lives in JSX cannot be tested — the same lesson TASK-147 landed on.
 *
 * 🔴 The last block is the one that is easy to skip: these problem keys are rendered through a **template**
 * (`t(k)`), and `lib/i18n/keys.test.ts` only scans literal `t("…")` calls — it names templated keys as a known
 * gap. So nothing else in this repo would notice a key here that resolves to nothing, in either language.
 */

const draft = (over: Partial<OtherBookingDraft> = {}): OtherBookingDraft => ({
  ...emptyOtherBooking("t1"),
  ...over,
});

describe("AC-19 — at least one teacher, and several are allowed", () => {
  it("refuses zero teachers", () => {
    const r = evaluateOtherBooking(draft({ teacherIds: [], title: "ประชุมทีม" }));
    expect(r.problemKeys).toContain("booking.errOtherNoTeacher");
  });

  it("accepts several", () => {
    const r = evaluateOtherBooking(draft({ teacherIds: ["t1", "t2", "t4"], title: "ประชุมทีม" }));
    expect(r.problemKeys).toEqual([]);
  });

  it("pre-fills the clicked column, which is a fact rather than a guess", () => {
    expect(emptyOtherBooking("t9").teacherIds).toEqual(["t9"]);
  });
});

describe("AC-10 — a booking with no student MUST carry a title", () => {
  it("refuses no student + no title, with the REQ's own message key", () => {
    const r = evaluateOtherBooking(draft({ hasStudent: false, title: "   " }));
    expect(r.problemKeys).toContain("booking.errOtherNoTitle");
    expect(r.otherTitle).toBeUndefined();
  });

  it("accepts no student + a title", () => {
    const r = evaluateOtherBooking(draft({ hasStudent: false, title: " ปิดปรับปรุงลาน " }));
    expect(r.problemKeys).toEqual([]);
    // Trimmed — a title of spaces would satisfy a naive check and then render as a blank cell.
    expect(r.otherTitle).toBe("ปิดปรับปรุงลาน");
  });

  it("accepts a student with no title — the title is optional once there IS a name", () => {
    const r = evaluateOtherBooking(draft({ hasStudent: true, title: "" }));
    expect(r.problemKeys).toEqual([]);
    expect(r.otherTitle).toBeUndefined();
  });
});

describe("AC-11 — a typed amount is refused, never clamped", () => {
  const charged = (amountBaht: number | "") =>
    evaluateOtherBooking(draft({ title: "x", charge: true, priceSource: "AMOUNT", amountBaht }));

  it("refuses untouched, zero, negative and non-integer", () => {
    for (const bad of ["", 0, -1, 12.5] as const) {
      expect(charged(bad).problemKeys).toContain("booking.errOtherAmount");
      expect(charged(bad).otherPriceMinor).toBeUndefined();
    }
  });

  it("converts baht → satang exactly once (AC-5): ฿500 reaches the server as 50000", () => {
    // 🔴 The magnitude, asserted as a number. This repo shipped a 100× error on this exact boundary
    // (TASK-169), and the failure mode is a plausible-looking figure, not a crash.
    expect(charged(500).otherPriceMinor).toBe(50000);
    expect(charged(500).otherPriceMinor).not.toBe(500);
    expect(charged(500).otherPriceMinor).not.toBe(5000000);
  });
});

describe("AC-12 — the two price sources can never both be live", () => {
  it("sends the amount and NOT an item id when the source is AMOUNT", () => {
    const r = evaluateOtherBooking(
      draft({ title: "x", charge: true, priceSource: "AMOUNT", amountBaht: 500, itemId: "it-1" }),
    );
    // `itemId` may linger in the draft after switching back; only the ACTIVE source reaches the payload.
    expect(r.otherPriceMinor).toBe(50000);
    expect(r.otherPriceItemId).toBeUndefined();
  });

  it("sends the item id and NOT an amount when the source is ITEM", () => {
    const r = evaluateOtherBooking(
      draft({ title: "x", charge: true, priceSource: "ITEM", amountBaht: 500, itemId: "it-1" }),
    );
    expect(r.otherPriceItemId).toBe("it-1");
    expect(r.otherPriceMinor).toBeUndefined();
  });

  it("refuses ITEM with nothing picked, rather than silently falling back to the amount", () => {
    const r = evaluateOtherBooking(
      draft({ title: "x", charge: true, priceSource: "ITEM", itemId: null, amountBaht: 500 }),
    );
    expect(r.problemKeys).toContain("booking.errOtherNoItem");
    expect(r.otherPriceMinor).toBeUndefined();
    expect(r.otherPriceItemId).toBeUndefined();
  });

  it("AC-4 — charge off writes NOTHING, which is different from charging zero", () => {
    const r = evaluateOtherBooking(draft({ title: "x", charge: false, amountBaht: 500 }));
    expect(r.otherPriceMinor).toBeUndefined();
    expect(r.otherPriceItemId).toBeUndefined();
  });
});

describe("the deduction toggle needs a student and a choice", () => {
  it("refuses consume with no student", () => {
    const r = evaluateOtherBooking(draft({ title: "x", consume: true, hasStudent: false }));
    expect(r.problemKeys).toContain("booking.errOtherConsumeNoStudent");
  });

  it("refuses consume with a student but nothing chosen", () => {
    const r = evaluateOtherBooking(
      draft({ consume: true, hasStudent: true, entitlementId: null }),
    );
    expect(r.problemKeys).toContain("booking.errOtherNoEntitlement");
  });

  it("accepts a chosen entitlement", () => {
    const r = evaluateOtherBooking(
      draft({ consume: true, hasStudent: true, entitlementId: "course:c-1" }),
    );
    expect(r.problemKeys).toEqual([]);
  });
});

describe("every problem is reported in ONE pass, not one refusal at a time", () => {
  it("collects all of them together", () => {
    const r = evaluateOtherBooking(
      draft({
        teacherIds: [],
        hasStudent: false,
        title: "",
        charge: true,
        priceSource: "AMOUNT",
        amountBaht: 0,
        consume: true,
      }),
    );
    expect(r.problemKeys).toEqual([
      "booking.errOtherNoTeacher",
      "booking.errOtherNoTitle",
      "booking.errOtherAmount",
      "booking.errOtherConsumeNoStudent",
    ]);
  });
});

describe("🔴 every problem key resolves in BOTH languages", () => {
  // These are rendered as `t(k)` — a TEMPLATE — so `keys.test.ts` cannot see them. Without this block a key
  // typo would print `booking.errOtherNoTitle` to staff and no test in the repo would fail.
  const ALL_KEYS = [
    "booking.errOtherNoTeacher",
    "booking.errOtherNoTitle",
    "booking.errOtherAmount",
    "booking.errOtherNoItem",
    "booking.errOtherConsumeNoStudent",
    "booking.errOtherNoEntitlement",
  ] as const;

  const resolve = (d: unknown, key: string): unknown =>
    key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
      return undefined;
    }, d);

  it("has an en and a th string for each", () => {
    for (const key of ALL_KEYS) {
      expect(typeof resolve(dictionaries.en, key)).toBe("string");
      expect(typeof resolve(dictionaries.th, key)).toBe("string");
    }
  });

  it("emits no key that is missing from the list above", () => {
    // Every branch of the evaluator, so a key added later without a dictionary entry fails here.
    const emitted = new Set<string>([
      ...evaluateOtherBooking(
        draft({ teacherIds: [], hasStudent: false, title: "", charge: true, amountBaht: 0, consume: true }),
      ).problemKeys,
      ...evaluateOtherBooking(
        draft({ title: "x", charge: true, priceSource: "ITEM", itemId: null }),
      ).problemKeys,
      ...evaluateOtherBooking(draft({ consume: true, hasStudent: true })).problemKeys,
    ]);
    for (const k of emitted) expect(ALL_KEYS).toContain(k as (typeof ALL_KEYS)[number]);
  });
});
