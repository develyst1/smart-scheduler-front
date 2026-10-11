import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-728 — the register page's copy of the LINE sentence R62 (`verify_parent_other_family`) follows Khwan's approved words.**
 *
 * The page keeps a DELIBERATE verbatim copy of the LINE chat's sentence, so the two never disagree on screen. Khwan changed R62 (both languages) and the
 * owner approved her words as they are (`COPY-SET-khwan-workbook-2026-10-11.md` row R62; `COPY-REVIEW-2026-09-29.md:592-608`, item 4 (a)). The strings
 * below are written out BY HAND from that row (her leading/trailing spaces dropped, the same rule the back's TASK-727 applies), so a drifted copy fails here.
 */
const R62_TH = "บัญชี LINE นี้ได้มีการผูกในระบบไว้แล้วค่ะ กรุณาติดต่อแอดมินค่ะ";
const R62_EN = "Someone has linked this LINE account in the system already. Please contact our Admin.";

const page = (lang: "en" | "th") => (dictionaries[lang] as unknown as { register: { code: Record<string, string> } }).register.code;

describe("🔴 TASK-728 — R62's register-page twin", () => {
  it("the page's LINE_BOUND_TO_OTHER_FAMILY is her approved sentence, in BOTH languages, exactly", () => {
    expect(page("en").LINE_BOUND_TO_OTHER_FAMILY).toBe(R62_EN);
    expect(page("th").LINE_BOUND_TO_OTHER_FAMILY).toBe(R62_TH);
  });

  it("no stray whitespace (hers had trailing spaces) and the old sentence is gone", () => {
    for (const lang of ["en", "th"] as const) {
      const v = page(lang).LINE_BOUND_TO_OTHER_FAMILY;
      expect(v).toBe(v.trim());
      expect(v.includes("if that is wrong")).toBe(false);
      expect(v.includes("หากไม่ถูกต้อง")).toBe(false);
    }
  });

  it("the neighbours are untouched: the other LINE refusal on the page keeps its words", () => {
    expect(page("en").PHONE_BOUND_TO_OTHER_LINE).toBe("This number is already linked to another LINE — contact admin");
    expect(page("th").PHONE_BOUND_TO_OTHER_LINE).toBe("เบอร์นี้ผูกกับ LINE อื่นแล้ว ติดต่อแอดมิน");
  });
});
