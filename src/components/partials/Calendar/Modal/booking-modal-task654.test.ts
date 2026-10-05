import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { otherNewStudentNeedsPhone } from "./BookingModal";
import { isParentPhoneShaped } from "@/components/common/StudentSelect";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-654 — two XS in `BookingModal.tsx`, both found on sid.**
 *
 * **§1 the refusal title told the wrong cause.** `booking.dateRejectedTitle` — *"Can't book this date"* — sat over
 * **every** refusal Save can produce: a missing parent phone, a suspended household, an ended course, a clash.
 * ⇒ 🔑 *the screen sent the admin to fix the wrong thing* — the same class as F2.
 *
 * **§2 on the อื่นๆ tab both sentences reached the admin.** The picker is deliberately not `required` (a typed name must
 * never be silently dropped), so Save stayed open while a NEW student's phone was invalid, and the field's error and the
 * server's refusal arrived together saying the same thing in two wordings. 🔑 **The field is the normal path and the
 * server is the backstop** — with Save shut, the server's sentence never reaches this screen at all.
 */

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");

describe("🔴 TASK-654 §2 — the อื่นๆ Save gate, by VALUE", () => {
  it("🔴 a NEW student with NO phone ⇒ Save is shut", () => {
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่" })).toBe(true);
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "" })).toBe(true);
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "   " })).toBe(true);
  });

  it('🔴 a NEW student with "12" ⇒ still shut — the SERVER\'s rule, not a truthiness check', () => {
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "12" })).toBe(true);
    // 🔑 the case a hand-rolled `!!phone` would let through, which is the whole reason the server's rule is imported
    expect(isParentPhoneShaped("12")).toBe(false);
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "08123" })).toBe(true);
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "ไม่ทราบ" })).toBe(true);
  });

  it("✅ a NEW student with a phone-shaped number ⇒ Save opens", () => {
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "0812345678" })).toBe(false);
    // the separators the server accepts are accepted here too, because it is the same function
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "081-234-5678" })).toBe(false);
    expect(otherNewStudentNeedsPhone({ name: "น้องใหม่", phone: "+66 81 234 5678" })).toBe(false);
  });

  it("✅ an EXISTING student is NEVER asked for a phone — even with none on file", () => {
    // 🔑 their household already holds one; asking would invent a requirement the server does not have
    expect(otherNewStudentNeedsPhone({ id: "s-1", name: "น้องบีม" })).toBe(false);
    expect(otherNewStudentNeedsPhone({ id: "s-1", name: "น้องบีม", phone: "" })).toBe(false);
    expect(otherNewStudentNeedsPhone({ id: "s-1", name: "น้องบีม", phone: "12" })).toBe(false);
  });

  it("✅ NO student at all ⇒ unchanged, allowed — an อื่นๆ block needs nobody", () => {
    expect(otherNewStudentNeedsPhone(null)).toBe(false);
    expect(otherNewStudentNeedsPhone(undefined)).toBe(false);
  });

  it("🔑 the gate is WIRED into the อื่นๆ branch, and it is the imported rule that decides", () => {
    expect(modal).toContain("const newStudentPhoneMissing = otherNewStudentNeedsPhone(student);");
    expect(modal).toContain("&& !newStudentPhoneMissing;");
    expect(modal).toContain("isParentPhoneShaped(student.phone)");
    // 🚫 no second rule for the same question anywhere in the file
    expect(modal).not.toMatch(/student\.phone\s*\?\s*true/);
    expect(modal).not.toMatch(/!!student\.phone/);
    expect(modal).not.toMatch(/phone.*\.length\s*[><]=?\s*\d/);
  });
});

describe("🔴 TASK-654 §1 — the refusal title is neutral, and the old key is GONE", () => {
  it("✅ the approved wording, verbatim, in both languages", () => {
    expect((dictionaries.en.booking as unknown as Record<string, string>).saveRefusedTitle).toBe("Couldn't save");
    expect((dictionaries.th.booking as unknown as Record<string, string>).saveRefusedTitle).toBe("บันทึกไม่สำเร็จ");
  });

  it("🔴 the OLD key no longer exists — in either language or in the component", () => {
    // 🔑 @Jason's rule: the compiler proves a rename for code, a GREP proves it for everything else. This is the
    // grep, as an assertion: the key is absent from the dictionaries and from the file that rendered it.
    expect((dictionaries.en.booking as unknown as Record<string, string>).dateRejectedTitle).toBeUndefined();
    expect((dictionaries.th.booking as unknown as Record<string, string>).dateRejectedTitle).toBeUndefined();
    expect(modal).not.toContain("dateRejectedTitle");
    expect(modal).toContain('title={t("booking.saveRefusedTitle")}');
  });

  it("🚫 the neutral title says nothing about a CAUSE — the body carries it", () => {
    const en = (dictionaries.en.booking as unknown as Record<string, string>).saveRefusedTitle;
    const th = (dictionaries.th.booking as unknown as Record<string, string>).saveRefusedTitle;
    // 🔑 whatever the refusal is, the title must not name a subject the body may contradict
    expect(`${en} ${th}`).not.toMatch(/date|วันที่|teacher|ครู|phone|เบอร์|voucher|วอยเชอร์/i);
    // …and there is exactly ONE Alert title over the submit refusal: 🚫 no per-error title
    expect((modal.match(/booking\.saveRefusedTitle/g) ?? []).length).toBe(1);
  });
});
