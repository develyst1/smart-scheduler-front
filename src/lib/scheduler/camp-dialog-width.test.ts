import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { CAMP_DIALOG_CREATE, CAMP_DIALOG_EDIT, CAMP_DIALOG_EDIT_RATES, campDialogWidth } from "./camp-dialog-width";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const dialog = codeOf("src/components/partials/Camp/OpenWeekDialog.tsx");

/** The `min(92rem, 94vw)` rule, evaluated for a viewport — the arithmetic the browser will do. */
const widthAt = (viewportPx: number) => Math.min(92 * 16, viewportPx * 0.94);

describe("TASK-559 — how wide the camp week dialog is", () => {
  it("all four shapes, by value — and only ONE of them is the wide case", () => {
    expect(campDialogWidth({ isEdit: false, showRates: false })).toBe(CAMP_DIALOG_CREATE);
    expect(campDialogWidth({ isEdit: false, showRates: true })).toBe(CAMP_DIALOG_CREATE); // no table on the create form
    expect(campDialogWidth({ isEdit: true, showRates: false })).toBe(CAMP_DIALOG_EDIT);
    expect(campDialogWidth({ isEdit: true, showRates: true })).toBe(CAMP_DIALOG_EDIT_RATES);
  });

  it("🚫 the five-column dialog is UNCHANGED — widening what was not broken is its own defect", () => {
    expect(CAMP_DIALOG_EDIT).toBe("lg");
    expect(CAMP_DIALOG_CREATE).toBe("md");
  });

  /**
   * 🔑 **More than one width, named, and checked as arithmetic rather than as pixels.** What this can honestly assert is
   * that the rule is viewport-capped — **the dialog is never wider than the screen**, so the fix cannot move the problem
   * to a narrower one. ⚠️ Whether 1472px is enough for six columns is a PIXEL question: see the report's stated limit.
   */
  it("🔑 the wide case is capped by the viewport at every width I checked", () => {
    expect(CAMP_DIALOG_EDIT_RATES).toBe("min(92rem, 94vw)");
    for (const vw of [1920, 1600, 1440, 1366, 1280, 1024]) {
      expect(widthAt(vw)).toBeLessThanOrEqual(vw); // never wider than the screen ⇒ never a page-level sideways scroll
      expect(widthAt(vw)).toBeGreaterThan(960); // and always wider than the `lg` (620px) that clipped the rate
    }
    // Khwan's own screen: the cap does not bind, so she gets the full 1472px
    expect(widthAt(1920)).toBe(1472);
    // a 13" laptop: the viewport binds instead, and the dialog shrinks with it rather than overflowing
    expect(widthAt(1280)).toBeCloseTo(1203.2, 5);
  });
});

describe("TASK-559 — the dialog asks for it, and the rate column keeps its width", () => {
  it("the modal's size comes from the rule, with both facts", () => {
    expect(dialog).toContain("size={campDialogWidth({ isEdit: Boolean(week), showRates })}");
    // 🚫 and the old unconditional pair is gone
    expect(dialog).not.toContain('size={week ? "lg" : "md"}');
  });

  it("🔑 the rate column cannot be squeezed — the other half of the same defect", () => {
    // a squeezed last column would put the box on screen and make it unusable, which is not a fix
    expect(dialog).toContain('{showRates && <Table.Th className="whitespace-nowrap">{t("camp.rateCol")}</Table.Th>}');
    expect(dialog).toContain('<Table.Td data-rates={d.date} className="whitespace-nowrap">');
  });

  it("🚫 nothing else about the dialog moved: the table, its columns and the rate input are as they were", () => {
    expect(dialog).toContain("<Table verticalSpacing={4} withTableBorder>");
    // 📌 `[ >]` on purpose: a bare `<Table.Th` also matches `<Table.Thead>`, and a count that counts the wrong thing is
    // a pin that would have passed on a missing column.
    expect((dialog.match(/<Table\.Th[ >]/g) ?? []).length).toBe(6); // five always-on plus the conditional rate
    expect(dialog).toContain("data-rate-box={id}");
    expect(dialog).toContain("setRate(d.date, id, typeof v === \"number\" ? v : \"\")");
  });
});
