import { describe, expect, it } from "bun:test";
import { formatPriceMinor } from "@/types/app/pricing";

/**
 * 🔴 TASK-222 (SPEC-069) — the satang → baht conversion the posted-revenue warning depends on, pinned.
 *
 * This repo has already shipped a **100× unit defect** on exactly this boundary: `discount.ts` read a whole-baht
 * value as satang, so `391` took ฿3.91 off instead of ฿391 (TASK-169, found by Tanya, not by the compiler). The
 * number looked entirely plausible on screen — which is the property that makes this class of bug expensive.
 *
 * The cancel dialog's band is a warning **whose entire job is the number**. A wrong magnitude there is worse
 * than no band at all, because staff would act on it. So the conversion is asserted rather than trusted, and
 * `formatPriceMinor` is used as the repo's ONE converter rather than a second one written beside the dialog.
 */
describe("formatPriceMinor — satang to the displayed baht string", () => {
  it("renders the SPEC's own example: 139000 satang → 1,390", () => {
    expect(formatPriceMinor(139000)).toBe("1,390");
  });

  it("does not multiply or divide by 100 twice", () => {
    // The two failure shapes of the TASK-169 bug, stated as numbers rather than as a warning in a comment.
    expect(formatPriceMinor(139000)).not.toBe("13.9");
    expect(formatPriceMinor(139000)).not.toBe("139,000");
  });

  it("keeps satang when there are any, and drops them when there are not", () => {
    expect(formatPriceMinor(119050)).toBe("1,190.5");
    expect(formatPriceMinor(119000)).toBe("1,190");
  });

  it("renders a discounted trial as the NET number it is given", () => {
    // The band renders `amountMinor` (= listMinor + a NEGATIVE discountMinor). A discounted ฿1,390 trial that
    // netted ฿1,190 must read 1,190 — re-deriving it as `list - discount` would read 1,590 instead.
    const listMinor = 139000;
    const discountMinor = -20000;
    expect(formatPriceMinor(listMinor + discountMinor)).toBe("1,190");
  });

  it("handles zero without inventing a currency artefact", () => {
    expect(formatPriceMinor(0)).toBe("0");
  });
});
