import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { REGISTER_CODES } from "./api";

/**
 * TASK-566 (REQ-110 item 10) — **every field required, the address asked once, and no skip left anywhere.**
 *
 * 🔴 **This file exists because four of my own mutations SLIPPED** on the first break-and-watch pass: the clicked test
 * could not see a removed pre-request guard (it presses a disabled button), could not see the create's answer being
 * ignored (it never adds a second child), and — the one worth remembering — **could not see “(optional)” come back,
 * because a placeholder is an ATTRIBUTE and `textContent` does not include it.**
 * 🔑 That last one is TASK-563's rule biting me one layer over: *a screen assertion is only as good as what the screen
 * actually exposes.* ⇒ the copy rules live here, by value and by absence, where they cannot hide.
 */

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/Register/RegisterContent.tsx");
const reg = (lang: "en" | "th") => dictionaries[lang].register as unknown as Record<string, string>;
const words = (lang: "en" | "th") => (dictionaries[lang].register as unknown as { code: Record<string, string> }).code;

describe("TASK-566 — the two guards, and the answer that is used", () => {
  it("🔑 the button is disabled AND `submitCreate` refuses — TASK-564's lesson, and the mutation that slipped", () => {
    // 🔴 Q3 slipped because a clicked test presses a DISABLED button and sees nothing. The guard is pinned at the source.
    expect(page).toContain("if (!formComplete) return;");
    expect(page).toContain("disabled={!formComplete} data-form-next");
    expect(page).toContain("disabled={!formComplete} data-confirm-save");
    // ONE rule behind all three doors
    // 🔻 TASK-591, declared: the address arm is `addressComplete` now — ALL THREE parts, because the server requires three
    // and a joined line is no longer sent. **The rule this pin protects — ONE `formComplete` behind all three doors, and the
    // submit refusing as well as the button disabling — is unchanged.**
    expect(page).toContain("const formComplete = Boolean(name.trim()) && Boolean(birthDate) && (addressOnFile || addressComplete);");
    expect(page).toContain("const addressComplete = Boolean(provPick?.nameTh && distPick?.nameTh && subPick?.nameTh);");
  });

  it("🔑 the household's address is learned from the ANSWERS — never re-fetched (the other mutation that slipped)", () => {
    // 🔴 Q6 slipped because the clicked test stops after ONE child. Pinned at all three sources instead.
    expect(page).toContain("setAddressOnFile(st.addressOnFile);"); // /status
    expect(page).toContain("setAddressOnFile(addressOn);"); // /link, through `afterLink`
    expect(page).toContain("setAddressOnFile(r.addressOnFile);"); // the CREATE's own answer
    expect(page).toContain("setProvinceOnFile(r.province);");
    // 🚫 and no second request to find out
    expect(page).not.toMatch(/await status\([^)]*\)[\s\S]{0,80}addressOnFile/);
  });

  it("the two new codes are claimed, so a rendering exists for each", () => {
    expect([...REGISTER_CODES]).toContain("BIRTHDATE_REQUIRED");
    expect([...REGISTER_CODES]).toContain("ADDRESS_REQUIRED");
    for (const lang of ["en", "th"] as const) {
      expect(words(lang).BIRTHDATE_REQUIRED.trim().length).toBeGreaterThan(0);
      expect(words(lang).ADDRESS_REQUIRED.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("TASK-566 — no skip survives, in the words themselves", () => {
  it("🚫 not one placeholder offers “optional” — the mutation that slipped because a placeholder is an ATTRIBUTE", () => {
    for (const k of ["birthDatePlaceholder", "dobPickPlaceholder", "provincePlaceholder"] as const) {
      expect(reg("en")[k].toLowerCase()).not.toContain("optional");
      expect(reg("th")[k]).not.toContain("ไม่บังคับ");
      expect(reg("th")[k]).not.toContain("ข้าม");
    }
  });

  it("🚫 `reviewSkipped` is gone from both languages — a word for a state that cannot happen is how it comes back", () => {
    expect(reg("en").reviewSkipped).toBeUndefined();
    expect(reg("th").reviewSkipped).toBeUndefined();
    expect(page).not.toContain("reviewSkipped");
  });

  it("🔴 `BIRTHDATE_INVALID` no longer tells a parent to leave it blank — it became FALSE when the field became required", () => {
    expect(words("en").BIRTHDATE_INVALID.toLowerCase()).not.toContain("blank");
    expect(words("th").BIRTHDATE_INVALID).not.toContain("เว้นว่าง");
    expect(words("th").BIRTHDATE_INVALID).not.toContain("ข้าม");
    // what it must still do: name the format
    expect(words("en").BIRTHDATE_INVALID).toContain("DD-MM-YYYY");
    expect(words("th").BIRTHDATE_INVALID).toContain("02-12-2024");
  });

  it("🔑 the duplicate refusal asks for the child's REAL name (the owner's ruling, COPY-REVIEW §8)", () => {
    expect(words("en").NAME_DUPLICATE_NEEDS_DETAIL.toLowerCase()).toContain("real name");
    expect(words("th").NAME_DUPLICATE_NEEDS_DETAIL).toContain("ชื่อจริง");
    // 🚫 and it no longer asks merely for "more detail" — a nickname was the thing that let the confusion in
    expect(words("en").NAME_DUPLICATE_NEEDS_DETAIL.toLowerCase()).not.toContain("nickname");
    expect(words("th").NAME_DUPLICATE_NEEDS_DETAIL).not.toContain("ชื่อเล่น");
  });

  it("🔑 the required refusals say what to do, and the address one says it is asked ONCE per family", () => {
    expect(words("en").ADDRESS_REQUIRED.toLowerCase()).toContain("once per family");
    expect(words("th").ADDRESS_REQUIRED).toContain("ครั้งเดียว");
    expect(words("en").BIRTHDATE_REQUIRED).toContain("DD-MM-YYYY");
    expect(words("th").BIRTHDATE_REQUIRED).toContain("วว-ดด-ปปปป");
  });

  it("⚠️ the “we already have it” line says we HAVE it and asks for nothing (DRAFT)", () => {
    for (const lang of ["en", "th"] as const) {
      expect(reg(lang).addressOnFile.trim().length).toBeGreaterThan(0);
      expect(reg(lang).addressOnFileProvince).toContain("{province}");
    }
    // 🔑 it must not read as “we lost your address”: no apology, no asking
    expect(reg("en").addressOnFile.toLowerCase()).toContain("already have");
    expect(reg("en").addressOnFile.toLowerCase()).not.toContain("again");
    expect(reg("th").addressOnFile).toContain("อยู่แล้ว");
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8")).toContain("📝 DRAFT (Fern, TASK-566)");
  });
});
