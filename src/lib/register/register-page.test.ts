import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { REGISTER_CODES } from "./api";

/**
 * TASK-348 (`REQ-088`) — `/register`, the sibling of `/checkin`.
 *
 * 🔴 **Most of what matters here is an ABSENCE** — the page holds no rule — and absences are asserted by
 * reading source with comments stripped (the shape settled in TASK-291/295). ⚠️ Every slice-derived region
 * below carries a POSITIVE over that same region first (TASK-341's rule), so an empty slice fails instead of
 * passing on `""`.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "src/components/partials/Register/RegisterContent.tsx";
const API = "src/lib/register/api.ts";
const LIFF = "src/lib/register/liff.ts";
const page = codeOf(PAGE);
const api = codeOf(API);
const liff = codeOf(LIFF);
const { en, th } = dictionaries;

describe("🔴 RULE 1 — the page holds NO rules; the server owns every decision", () => {
  it("the files are the ones under test", () => {
    // Positives first: an empty read would make every absence below pass.
    expect(page).toContain("export default function RegisterContent");
    expect(api).toContain('post<LookupResult>("lookup"');
    expect(liff).toContain("export const obtainIdToken");
  });

  it("🚫 no reserved-word list, no duplicate logic, no cap, no date parsing — on either file", () => {
    for (const src of [page, api]) {
      expect(src).not.toMatch(/isReservedWord|RESERVED_WORDS|reservedWords/);
      expect(src).not.toMatch(/duplicate[A-Z]\w*\(|decideDuplicate|isDuplicate/);
      expect(src).not.toMatch(/MAX_STUDENTS|\b[<>]=?\s*5\b|children\.length\s*[<>]=?\s*\d/);
      expect(src).not.toMatch(/parseBirthDate|dayjs\(|new Date\(|split\("-"\)|toISOString/);
      expect(src).not.toMatch(/normalizePhone|replace\(\/\\D/);
    }
  });

  it("🔑 the §6.1 decision is READ off the response, not derived", () => {
    // `children.length === 0` here is a branch on the server's answer (the form vs the list) — the same fact
    // `afterParentLink` decides for the chat, rendered, not re-derived from anything but the response itself.
    expect(page).toContain("if (children.length === 0) setPhase({ kind: \"form\" });");
    expect(page).toContain("phase.canAddMore ?");
    expect(page).toContain('"twoFactor" in r');
  });
});

describe("🔑 the ID TOKEN is the identity; `userId` is never read or sent", () => {
  it("every request body carries `idToken` and nothing that names the parent", () => {
    const bodies = api.slice(api.indexOf("export const lookup"));
    expect(bodies).toContain("{ idToken, phone }");
    expect(bodies).toContain("const body: Body = { idToken, name: input.name };");
    for (const src of [page, api, liff]) {
      expect(src).not.toMatch(/getProfile|userId|lineUserId|parentId|familyId/);
    }
  });

  it("🚫 no GET — nothing is read without a token, and a token is a body", () => {
    expect(api).toContain('method: "POST"');
    expect(api).not.toMatch(/method:\s*"GET"|fetch\(`\$\{API_BASE\}\/register\/[^`]*`\)\s*$/m);
  });

  it("TOKEN_EXPIRED re-inits LIFF and retries ONCE; nothing else is retried", () => {
    const w = page.slice(page.indexOf("const withToken"), page.indexOf("const fail ="));
    expect(w).toContain('first.code === "TOKEN_EXPIRED"');
    expect(w).toContain("await obtainIdToken()");
    expect(w).not.toContain("TOKEN_WRONG_CHANNEL");
    expect(w).not.toMatch(/while|for \(/);
  });
});

describe("⚠️ the absent-LIFF-ID case is a MESSAGE, not a blank screen", () => {
  it("the env var is NEXT_PUBLIC_, because a bare `LIFF_ID` is invisible to the bundle", () => {
    expect(liff).toContain("process.env.NEXT_PUBLIC_LIFF_ID");
    expect(liff).not.toMatch(/process\.env\.LIFF_ID\b/);
    expect(readFileSync(".env.example", "utf8")).toContain("NEXT_PUBLIC_LIFF_ID=");
  });

  it("absent ⇒ `missing-id` ⇒ `register.liffMissing` rendered", () => {
    expect(liff).toContain('if (!LIFF_ID) return { kind: "missing-id" };');
    expect(page).toContain('s.kind === "missing-id") setPhase({ kind: "liff-missing" })');
    expect(page).toContain('t("register.liffMissing")');
    expect(en.register.liffMissing.length).toBeGreaterThan(10);
    expect(th.register.liffMissing.length).toBeGreaterThan(10);
  });
});

describe("🔑 every named CODE has a rendering, both languages", () => {
  it("the code list matches the live route's REFUSAL table plus the four token failures", () => {
    // Read from the contract as shipped (TASK-347 §C0–§C3); the route's table is the source.
    expect([...REGISTER_CODES].sort()).toEqual(
      [
        "TOKEN_MISSING", "TOKEN_WRONG_CHANNEL", "TOKEN_INVALID", "TOKEN_EXPIRED",
        "PHONE_INVALID", "PHONE_BOUND_TO_OTHER_LINE", "LINE_BOUND_TO_OTHER_FAMILY",
        "TWOFA_NOT_CONFIGURED", "TWOFA_CODE_REQUIRED", "TWOFA_CODE_BAD",
        "NOT_LINKED", "NAME_REQUIRED", "NAME_RESERVED", "FAMILY_FULL", "NAME_DUPLICATE_NEEDS_DETAIL",
        "BIRTHDATE_INVALID",
      ].sort(),
    );
  });

  for (const code of REGISTER_CODES) {
    it(code, () => {
      // `keys.test.ts` cannot see a templated `t(\`register.code.${code}\`)`, so this is the check for it.
      const e = (en.register.code as Record<string, string>)[code];
      const h = (th.register.code as Record<string, string>)[code];
      expect(typeof e).toBe("string");
      expect(typeof h).toBe("string");
      expect(e.length).toBeGreaterThan(5);
      expect(h.length).toBeGreaterThan(5);
    });
  }

  it("the three codes that carry a detail interpolate it", () => {
    expect(en.register.code.NAME_RESERVED).toContain("{word}");
    expect(en.register.code.FAMILY_FULL).toContain("{max}");
    expect(th.register.code.FAMILY_FULL).toContain("{max}");
    expect(page).toContain("word: failure.word ?? \"\", max: failure.max ?? \"\", name: failure.name ?? \"\"");
  });

  it("🚫 no server `message` is ever rendered — the page owns the words", () => {
    expect(page).not.toMatch(/\.message\b/);
    expect(api).not.toMatch(/message/);
  });
});

describe("§17c — the approved sentences are reused VERBATIM where a field matches", () => {
  // The bilingual chat strings, split into the halves the page renders. Pinned byte-for-byte: the customer
  // approved these words, and a form label is the same sentence in a smaller box.
  it("screen 3 — phone", () => {
    expect(th.register.phoneLabel).toBe("กรุณาระบุเบอร์โทรศัพท์ค่ะ");
    expect(en.register.phoneLabel).toBe("Please enter your phone number.");
  });
  it("screen 4b — name", () => {
    expect(th.register.nameLabel).toBe('กรุณาระบุชื่อนักเรียน เช่น "ส้ม"');
    expect(en.register.nameLabel).toBe('Please enter the student\'s name, e.g. "Emily".');
  });
  it("screen 5 — date of birth", () => {
    expect(th.register.birthDateLabel).toBe("กรุณาระบุวันเกิดของนักเรียนค่ะ (วัน-เดือน-ปีค.ศ. )");
    expect(en.register.birthDateLabel).toBe("Please enter the date of birth in (DD-MM-YYYY)");
  });
  it("screen 6 — address", () => {
    expect(th.register.provinceLabel).toBe("กรุณาระบุ เขต แขวง จังหวัด เช่น พระโขนงเหนือ วัฒนา กทม");
  });
  it("screens 7a / 7b / 8a", () => {
    expect(th.register.confirmTitle).toBe("กรุณาตรวจสอบข้อมูลก่อนบันทึกค่ะ");
    expect(th.register.confirmQuestion).toBe("ข้อมูลถูกต้องหรือไม่คะ?");
    expect(th.register.createdTitle).toBe('เพิ่ม "{name}" สำเร็จแล้วค่ะ ✅');
    expect(en.register.createdTitle).toBe('"{name}" has been added successfully. ✅');
  });
});

describe("🔴 the date — DD-MM-YYYY text, echoed back before submit, omitted when blank", () => {
  it("the widget is a text input with a mask, not a date picker emitting ISO", () => {
    const form = page.slice(page.indexOf('phase.kind === "form"'), page.indexOf('phase.kind === "confirm"'));
    expect(form).toContain('label={t("register.birthDateLabel")}');
    expect(form).toContain("maxLength={10}");
    expect(form).not.toMatch(/DatePickerInput|DateInput|type="date"|valueFormat/);
  });

  it("🔑 TASK-277 — the confirm screen shows the date back EXACTLY as typed before sending", () => {
    const confirm = page.slice(page.indexOf('phase.kind === "confirm"'), page.indexOf('phase.kind === "done"'));
    expect(confirm).toContain('t("register.reviewBirthDate")');
    expect(confirm).toContain("birthDate.trim() || t(\"register.reviewSkipped\")");
    expect(confirm).toContain("onClick={submitCreate}");
  });

  it("🚫 a blank is the SKIP — the key is OMITTED, never sent as \"\" (TASK-347 §5.1)", () => {
    const c = api.slice(api.indexOf("export const create"));
    expect(c).toContain("if (input.birthDate) body.birthDate = input.birthDate;");
    expect(c).toContain("if (input.province) body.province = input.province;");
    expect(page).toContain("birthDate: birthDate.trim() || undefined,");
  });
});

describe("§5 / §6.1 — what the page does its own way", () => {
  it("`found` renders the child list and an ADD action — never a forced form", () => {
    const linked = page.slice(page.indexOf('phase.kind === "linked"'), page.indexOf('phase.kind === "form"'));
    expect(linked).toContain("<ChildList children={phase.children} />");
    expect(linked).toContain('t("register.addChild")');
    expect(linked).not.toContain("TextInput");
  });

  it("AC-9 — a duplicate re-asks for MORE DETAIL and resubmits with `detailProvided: true`, never a rename", () => {
    expect(page).toContain('if (r.code === "NAME_DUPLICATE_NEEDS_DETAIL") {');
    expect(page).toContain("setDetailProvided(true);");
    expect(page).toContain('t("register.dupDetailHint")');
    expect(api).toContain("if (input.detailProvided) body.detailProvided = true;");
  });

  it("2FA is rendered from the response, not decided — and the code goes on `/link` only", () => {
    expect(page).toContain('phase.kind === "found-2fa"');
    expect(api).toContain('post<LinkResult>("link", code ? { idToken, phone, code } : { idToken, phone })');
    expect(api).not.toMatch(/lookup[^;]*code/);
  });

  it("🚫 no session, no cancel code — a close hint, and nothing written until `/create` returns", () => {
    expect(page).not.toMatch(/clearSession|ยกเลิก|cancelRegistration/);
    expect(page).toContain('t("register.closeHint")');
  });
});

describe("🚫 the sibling and the shared code are untouched", () => {
  it("/checkin is exactly as it was, and /register is outside the auth proxy like it", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('matcher: ["/scheduler/:path*"]');
    expect(proxy).not.toContain("register");
    expect(proxy).not.toContain("checkin");
    expect(codeOf("src/components/partials/Checkin/CheckinContent.tsx")).not.toContain("register");
  });
});
