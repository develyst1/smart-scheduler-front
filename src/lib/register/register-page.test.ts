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
    // TASK-349 RE-SCOPE, on purpose: the page and the API module are STILL held to the full absence. The one
    // `split("-")` the date picker needs lives in `entry.ts` — on the widget's own `YYYY-MM-DD`, never on typed
    // text — and `entry.test.ts` holds THAT file to its own, narrower absence (no dayjs, no Date, no validation).
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
        "PROVINCE_UNKNOWN", // TASK-352/353 (§9)
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

  it("the four codes that carry a detail interpolate it", () => {
    expect(en.register.code.PROVINCE_UNKNOWN).toContain("{province}");
    expect(th.register.code.PROVINCE_UNKNOWN).toContain("{province}");
    expect(en.register.code.NAME_RESERVED).toContain("{word}");
    expect(en.register.code.FAMILY_FULL).toContain("{max}");
    expect(th.register.code.FAMILY_FULL).toContain("{max}");
    expect(page).toContain('province: failure.province ?? "",');
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
  it("§7a — a YEAR-FIRST picker that emits the customer's text, beside the typed mask it does not replace", () => {
    // TASK-349 RE-SCOPE, on purpose: TASK-348 forbade `DatePickerInput|valueFormat` here. The picker is now
    // wanted — what stays forbidden is an ISO value LEAVING the page: `type="date"` (a native ISO input) and
    // `dayjs`/`Date` on the page. The widget's `YYYY-MM-DD` is reordered by `toCustomerDate` and nothing else.
    const form = page.slice(page.indexOf('phase.kind === "form"'), page.indexOf('phase.kind === "confirm"'));
    expect(form).toContain('label={t("register.birthDateLabel")}');
    expect(form).toContain("<DatePickerInput");
    expect(form).toContain('defaultLevel="decade"'); // year-first: the decade grid opens, not "previous month" ×100
    expect(form).toContain('valueFormat="DD-MM-YYYY"'); // display only
    expect(form).toContain("maxLength={10}"); // the typed path is still there, mask and all
    expect(form).not.toMatch(/type="date"|DateInput\b|dayjs|new Date/);
    expect(page).toContain("toCustomerDate(birthDatePicked)");
  });

  it("§7a — the picker is never the only way in: a `Type it instead` toggle swaps to the plain field", () => {
    const form = page.slice(page.indexOf('phase.kind === "form"'), page.indexOf('phase.kind === "confirm"'));
    expect(form).toContain('dobMode === "pick" ? (');
    expect(form).toContain('onToggle={() => setDobMode(dobMode === "pick" ? "type" : "pick")}');
    expect(en.register.typeInstead).toBe("Type it instead");
    expect(th.register.typeInstead).toBe("พิมพ์เอง");
  });

  it("🔑 TASK-277 — the confirm screen shows the date back EXACTLY as typed before sending", () => {
    const confirm = page.slice(page.indexOf('phase.kind === "confirm"'), page.indexOf('phase.kind === "done"'));
    expect(confirm).toContain('t("register.reviewBirthDate")');
    expect(confirm).toContain("birthDate || t(\"register.reviewSkipped\")");
    expect(confirm).toContain("addressLine || t(\"register.reviewSkipped\")"); // the LINE is what is echoed (TASK-353)
    expect(confirm).toContain("onClick={submitCreate}");
  });

  it("🚫 a blank is the SKIP — the key is OMITTED, never sent as \"\" (TASK-347 §5.1)", () => {
    const c = api.slice(api.indexOf("export const create"));
    expect(c).toContain("if (input.birthDate) body.birthDate = input.birthDate;");
    expect(c).toContain("if (input.province) body.province = input.province;");
    // `birthDate` / `province` are the ONE stored value each, whichever way in (picked or typed) — see §7a/§7b.
    expect(page).toContain("birthDate: birthDate || undefined,");
    expect(page).toContain("province: pickedProvince || undefined,");
    expect(page).toContain("address: addressLine || undefined,");
    expect(page).toContain('const birthDate = dobMode === "pick" ? toCustomerDate(birthDatePicked) : birthDateTyped.trim();');
  });
});

describe("§7b — the address is three cascading picks that JOIN into the chat's one-line string", () => {
  const form = () => page.slice(page.indexOf('phase.kind === "form"'), page.indexOf('phase.kind === "confirm"'));

  it("จังหวัด → เขต/อำเภอ → แขวง/ตำบล — three Selects, each gated on the one above", () => {
    const f = form();
    expect(f).toContain("onChange={pickProvince}");
    expect(f).toContain("onChange={pickDistrict}");
    expect(f).toContain("onChange={pickSubDistrict}");
    expect(f).toContain("disabled={!provPick}");
    expect(f).toContain("disabled={!distPick}");
    expect((f.match(/<Select\b/g) ?? []).length).toBe(3);
  });

  it("the tier words follow the province — Bangkok เขต/แขวง, elsewhere อำเภอ/ตำบล — read off the geocode", () => {
    expect(form()).toContain("label={tier.district}");
    expect(form()).toContain("label={tier.subDistrict}");
    // TASK-351: the Thai source is `tierTh`; `tier` is the label after the language choice (see §8b below)
    expect(page).toContain("const tierTh = tierWordsFor(provPick?.code ?? null);");
  });

  it("the stored value is the JOINED string, sub-district first, province last — the chat's own shape", () => {
    expect(page).toContain(
      "joinAddress({ subDistrict: subPick?.nameTh, district: distPick?.nameTh, province: provPick?.nameTh })",
    );
    // and a pick is looked up by CODE, never by name — district names repeat across provinces
    expect(page).toContain("book?.provinces.find((x) => x.code === code)");
    expect(page).toContain("districts.find((x) => x.code === code)");
  });

  it("the escape hatch — `พิมพ์เอง / Type it instead` reveals the existing free-text field; a failed load falls back to it", () => {
    const f = form();
    expect(f).toContain('addrMode === "pick" ? (');
    expect(f).toContain("onChange={(e) => setProvinceTyped(e.currentTarget.value)}");
    expect(f).toContain('onToggle={() => setAddrMode(addrMode === "pick" ? "type" : "pick")}');
    expect(page).toContain('() => alive && setAddrMode("type")');
  });

  it("🔑 the dataset is loaded DYNAMICALLY, from `entry.ts` only, and only while the form is on screen", () => {
    expect(page).toContain('if (phase.kind !== "form" || addrMode !== "pick" || book) return;');
    expect(page).not.toContain("thai-address-universal");
    // the ONLY place in the app that names the package is the dynamic import in entry.ts
    const entry = codeOf("src/lib/register/entry.ts");
    expect(entry).toContain('await import("thai-address-universal")');
    expect(entry).not.toMatch(/^import .*thai-address-universal/m);
  });
});

describe("§4 — the family screen's two copy fixes", () => {
  it("the nickname is shown ONLY when it differs from the name — `มิลล่า`, not `มิลล่า (มิลล่า)`", () => {
    const list = page.slice(page.indexOf("function ChildList"), page.indexOf("function EntryToggle"));
    expect(list).toContain("c.nickname && c.nickname !== c.name ? `${c.name} (${c.nickname})` : c.name");
    expect(list).not.toContain("c.nickname ? `");
  });

  it("the primary button fits a phone — a LENGTH bound, not the bytes (the words are @Porter's, PLACEHOLDER)", () => {
    // The truncated sentence was 43 characters. A Mantine `Button` inside this page's `max-w-sm` `Paper` with
    // `p="xl"` has ~320px for its label; at the 14px body size that is ~28 characters before an ellipsis.
    expect(en.register.foundConfirm.length).toBeLessThanOrEqual(28);
    expect(th.register.foundConfirm.length).toBeLessThanOrEqual(28);
    expect(en.register.foundConfirm.length).toBeGreaterThan(5);
    expect(th.register.foundConfirm.length).toBeGreaterThan(5);
  });
});

describe("⚠️ .env.example carries the two setup facts the owner's phone taught (§0)", () => {
  it("the tapped link is liff.line.me/<LIFF_ID>, and scope must include openid", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain("https://liff.line.me/<LIFF_ID>");
    expect(env).toContain("scope must include `openid`");
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

describe("§8 (TASK-350) — ONE language at a time, a prominent TH/EN toggle ABOVE the first field", () => {
  const i18n = codeOf("src/lib/i18n/I18nProvider.tsx");
  const toggle = codeOf("src/lib/i18n/LanguageToggle.tsx");
  const locale = codeOf("src/lib/register/locale.ts");
  const route = codeOf("src/app/register/page.tsx");

  it("the toggle is the FIRST thing in the Paper — before the title, before any field, in every phase", () => {
    const stack = page.indexOf('<Stack gap="md">');
    const tog = page.indexOf('<LanguageToggle size="md" fullWidth />');
    expect(stack).toBeGreaterThan(0);
    expect(tog).toBeGreaterThan(stack);
    expect(tog).toBeLessThan(page.indexOf('t("register.title")'));
    expect(tog).toBeLessThan(page.indexOf('phase.kind === "liff"'));
    // and it is the app's own toggle, unconditional (no `phase.kind` guard on that line)
    expect(page.slice(page.lastIndexOf("\n", tog), tog)).not.toContain("phase");
  });

  it("toggling changes `lang` and NOTHING else — the toggle calls setLang; the page reads `lang` for the date locale only", () => {
    expect(toggle).toContain("onChange={(v) => setLang(v as Lang)}");
    expect(toggle).not.toMatch(/setPhase|localStorage|fetch|reload/);
    // every `lang` on the page: the destructure, the DatesProvider locale, and (TASK-351) the tier LABEL choice —
    // all three are RENDERING; nothing keyed on it sets state (no `[lang]` effect, no setter on a `lang` branch)
    expect((page.match(/\blang\b/g) ?? []).length).toBe(3);
    expect(page).toContain("<DatesProvider settings={{ locale: lang, firstDayOfWeek: 0 }}>");
    expect(page).not.toMatch(/\[lang\]/);
    expect(page).not.toMatch(/lang [!=]== "(th|en)"[^\n]*set[A-Z]/);
  });

  it("default = the LINE app's language on a FIRST visit only; a saved preference wins", () => {
    // the read lives in locale.ts — liff.ts stays the credential module and never calls getLanguage
    expect(locale).toContain("export const phoneLanguage");
    expect(locale).toContain('liff.getLanguage() ?? "") ? "th" : "en"');
    expect(liff).not.toContain(".getLanguage(");
    expect(liff).toContain("export const loadLiff");
    // applied through setLangIfUnset, after init (the token is in hand), and never through setLang
    expect(page).toContain("setLangIfUnset(await phoneLanguage());");
    expect(page).not.toMatch(/\bsetLang\(/);
    const unset = i18n.slice(i18n.indexOf("const setLangIfUnset"), i18n.indexOf("const t = useCallback"));
    expect(unset).toContain("window.localStorage.getItem(storageKey)");
    expect(unset).toContain('if (saved === "en" || saved === "th") return;');
    expect(unset).not.toContain("setItem"); // a device default is never SAVED — only a tap is
  });

  it("§6 — `/register` has its OWN saved preference: `ss.lang.register`, not the admin's `ss.lang`", () => {
    expect(route).toContain('export const REGISTER_LANG_KEY = "ss.lang.register";');
    expect(route).toContain("<I18nProvider storageKey={REGISTER_LANG_KEY}>");
    expect(i18n).toContain('const STORAGE_KEY = "ss.lang";');
    expect(i18n).toContain("window.localStorage.setItem(storageKey, next);");
    expect(i18n).not.toMatch(/setItem\(STORAGE_KEY/);
    // the admin header still mounts the toggle with no key of its own ⇒ still `ss.lang`
    expect(codeOf("src/components/layout/AdminLayout/Header/Header.tsx")).toContain("<LanguageToggle />");
  });

  // ── TASK-351 (§8b) — REVERSED, not deleted. TASK-350 §3 asserted "the tier words stay THAI in both languages: no
  // `t(` and no `lang` near them". That ruling came from a sentence about VALUES (a proper noun on the parent's own
  // mail) and was applied to LABELS; the owner's EN screen showed `Province · อำเภอ · ตำบล` — one English label over
  // two Thai ones. What was right is kept (VALUES Thai in both); what was wrong is inverted (LABELS follow `lang`).
  it("§3 (reversed by TASK-351) — tier LABELS follow the language: EN `District · Sub-district`, TH the four words", () => {
    const entry = codeOf("src/lib/register/entry.ts");
    const tier = entry.slice(entry.indexOf("export const tierWordsFor"), entry.indexOf("const EVERYDAY_PROVINCE_NAME"));
    // the SOURCE is still the four Thai literals with the Bangkok flip, keyed off geocode 10, and lang-free
    expect(tier).toContain('{ district: "เขต", subDistrict: "แขวง" }');
    expect(tier).toContain('{ district: "อำเภอ", subDistrict: "ตำบล" }');
    expect(tier).not.toMatch(/\bt\(|\blang\b|Lang\b/);
    // the page chooses by lang: Thai ⇒ the source; English ⇒ the dictionary (Porter's words, PLACEHOLDER by form)
    expect(page).toContain("const tierTh = tierWordsFor(provPick?.code ?? null);");
    expect(page).toContain(
      'lang === "th" ? tierTh : { district: t("register.addrDistrict"), subDistrict: t("register.addrSubDistrict") }',
    );
    expect(page).toContain("label={tier.district}");
    expect(page).toContain("label={tier.subDistrict}");
    expect(en.register.addrDistrict).toMatch(/^[A-Za-z-]+$/);
    expect(en.register.addrSubDistrict).toMatch(/^[A-Za-z-]+$/);
  });

  it("§8b — all four label combinations: EN/TH × Bangkok/elsewhere", () => {
    const { tierWordsFor } = require("./entry") as typeof import("./entry");
    const label = (code: string, lang: "en" | "th") =>
      lang === "th"
        ? tierWordsFor(code)
        : { district: en.register.addrDistrict, subDistrict: en.register.addrSubDistrict };
    expect(label("10", "th")).toEqual({ district: "เขต", subDistrict: "แขวง" });
    expect(label("50", "th")).toEqual({ district: "อำเภอ", subDistrict: "ตำบล" });
    expect(label("10", "en")).toEqual({ district: "District", subDistrict: "Sub-district" });
    expect(label("50", "en")).toEqual({ district: "District", subDistrict: "Sub-district" });
    expect(en.register.addrProvince).toBe("Province");
    expect(th.register.addrProvince).toBe("จังหวัด");
  });

  it("§8b — VALUES stay Thai in BOTH languages (the half of the old ruling that was right)", () => {
    // the option labels and the joined string are `nameTh`, never `nameEn`, and no `lang` reaches the join
    expect(page).toContain("rows.map((r) => ({ value: r.code, label: r.nameTh }))");
    expect(page).toContain(
      "joinAddress({ subDistrict: subPick?.nameTh, district: distPick?.nameTh, province: provPick?.nameTh })",
    );
    expect(page).not.toContain("nameEn");
    const entry = codeOf("src/lib/register/entry.ts");
    const join = entry.slice(entry.indexOf("export const joinAddress"), entry.indexOf("export interface AddressBook"));
    expect(join).toContain("everydayProvinceName(parts.province)");
    expect(join).not.toMatch(/\blang\b/);
  });

  it("§4 nit 1 — `Province` is `จังหวัด` in Thai mode (the same key, both halves)", () => {
    expect(en.register.addrProvince).toBe("Province");
    expect(th.register.addrProvince).toBe("จังหวัด");
  });

  it("§4 nit 2 — the typing instruction shows in TYPED mode only; in pick mode the tier labels ARE the instruction", () => {
    const form = page.slice(page.indexOf('phase.kind === "form"'), page.indexOf('phase.kind === "confirm"'));
    const pickStart = form.indexOf('addrMode === "pick" ? (');
    const typedStart = form.indexOf('label={t("register.provinceLabel")}');
    expect(pickStart).toBeGreaterThan(0);
    expect(typedStart).toBeGreaterThan(pickStart);
    const pickRegion = form.slice(pickStart, typedStart);
    expect(pickRegion).toContain("onChange={pickSubDistrict}"); // the region is the picker
    expect(pickRegion).not.toContain("provinceLabel");
    expect((form.match(/register\.provinceLabel/g) ?? []).length).toBe(1); // exactly once: the typed field's label
  });
});

describe("§9 (TASK-353) — the PROVINCE travels as its own field, full name; the LINE goes to `address`", () => {
  // Field names confirmed against TASK-352's `📜 THE FIELD NAMES` block and the live route (`routes/register.ts`
  // lines 37–38: `province?` → parents.province, `address?` → parents.note APPENDED) on 2026-09-13.
  it("PICKED ⇒ `province` = the picked FULL name and `address` = the joined line; TYPED ⇒ `address` only; blank ⇒ neither", () => {
    expect(page).toContain('const pickedProvince = addrMode === "pick" ? provPick?.nameTh ?? "" : "";');
    expect(page).toContain("province: pickedProvince || undefined,");
    expect(page).toContain("address: addressLine || undefined,");
    // the line is the join (`กทม` in the LINE); the province is `nameTh` (`กรุงเทพมหานคร` in the COLUMN) — two forms, two homes
    expect(page).toContain(
      "joinAddress({ subDistrict: subPick?.nameTh, district: distPick?.nameTh, province: provPick?.nameTh })",
    );
    expect(page).not.toMatch(/province:\s*addressLine|address:\s*pickedProvince|everydayProvinceName/);
    // api.ts forwards both as-is and drops blanks — no rule, no join, no mapping
    const c = api.slice(api.indexOf("export const create"));
    expect(c).toContain("if (input.province) body.province = input.province;");
    expect(c).toContain("if (input.address) body.address = input.address;");
    expect(api).not.toMatch(/joinAddress|TH_PROVINCES|thai-address|includes\(/);
  });

  it("the confirm screen still echoes the LINE; `PROVINCE_UNKNOWN` goes back to the form like the other fixable codes", () => {
    const confirm = page.slice(page.indexOf('phase.kind === "confirm"'), page.indexOf('phase.kind === "done"'));
    expect(confirm).toContain("addressLine || t(\"register.reviewSkipped\")");
    expect(confirm).not.toContain("pickedProvince");
    const fixable = page.slice(page.indexOf('r.code === "NAME_REQUIRED"'), page.indexOf('r.code === "NOT_LINKED"'));
    expect(fixable).toContain('r.code === "PROVINCE_UNKNOWN"');
    expect(fixable).toContain('setPhase({ kind: "form" });');
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
