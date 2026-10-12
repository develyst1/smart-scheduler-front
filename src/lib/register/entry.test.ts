import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  AREA_ROUTES,
  BANGKOK_GEOCODE,
  everydayProvinceName,
  joinAddress,
  loadAddressBook,
  tierWordsFor,
  toCustomerDate,
} from "./entry";

/**
 * TASK-349 (`REQ-088 §7a`, `§7b`) — the entry widgets' helpers, and the dataset behind the address picker.
 *
 * 🔴 This is the ONE file on the `/register` side allowed a `split("-")`, and it is held to its own absence:
 * no `dayjs`, no `Date`, no validation of any kind. The reorder is on the WIDGET's output, never on typed text.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const entry = codeOf("src/lib/register/entry.ts");

describe("§7a — `toCustomerDate` is a REORDER of the widget's `YYYY-MM-DD`, not a parse", () => {
  it("emits the customer's DD-MM-YYYY, and blank for nothing picked", () => {
    expect(toCustomerDate("2020-09-08")).toBe("08-09-2020");
    expect(toCustomerDate("2013-01-31")).toBe("31-01-2013");
    expect(toCustomerDate(null)).toBe("");
    expect(toCustomerDate("")).toBe("");
  });

  it("🚫 the RE-SCOPED Rule-1 absence: one `split(\"-\")`, no dayjs, no Date, no validation, no ISO out", () => {
    expect(entry).toContain("export const toCustomerDate");
    expect((entry.match(/split\("-"\)/g) ?? []).length).toBe(1);
    expect(entry).not.toMatch(/dayjs|new Date\(|Date\.parse|toISOString|isValid|isNaN|throw |RangeError/);
    expect(entry).not.toMatch(/\bmaxDate\b|\bminDate\b|\bmax\b\s*[<>]/);
  });
});

describe("§7b — tier words, the everyday province name, and the join", () => {
  it("Bangkok is เขต/แขวง; every other province — and no province — is อำเภอ/ตำบล", () => {
    expect(BANGKOK_GEOCODE).toBe("10");
    expect(tierWordsFor("10")).toEqual({ district: "เขต", subDistrict: "แขวง" });
    expect(tierWordsFor("50")).toEqual({ district: "อำเภอ", subDistrict: "ตำบล" });
    expect(tierWordsFor(null)).toEqual({ district: "อำเภอ", subDistrict: "ตำบล" });
  });

  it("the customer's own example, byte for byte: `พระโขนงเหนือ วัฒนา กทม` — that order, that abbreviation", () => {
    expect(joinAddress({ subDistrict: "พระโขนงเหนือ", district: "วัฒนา", province: "กรุงเทพมหานคร" })).toBe(
      "พระโขนงเหนือ วัฒนา กทม",
    );
  });

  it("the everyday-name rule: only กรุงเทพมหานคร has an everyday name that is not its formal one", () => {
    expect(everydayProvinceName("กรุงเทพมหานคร")).toBe("กทม");
    expect(everydayProvinceName("เชียงใหม่")).toBe("เชียงใหม่");
    expect(joinAddress({ subDistrict: "ศรีภูมิ", district: "เมืองเชียงใหม่", province: "เชียงใหม่" })).toBe(
      "ศรีภูมิ เมืองเชียงใหม่ เชียงใหม่",
    );
    // 🚫 the postal/plate abbreviations are NOT used — a parent does not type `ชม.` in an address
    expect(entry).not.toMatch(/ชม\.|ขก\.|นม\./);
  });

  it("a partial pick stores what was picked, in order; nothing picked ⇒ \"\" ⇒ the key is omitted", () => {
    expect(joinAddress({ district: "วัฒนา", province: "กรุงเทพมหานคร" })).toBe("วัฒนา กทม");
    expect(joinAddress({ province: "กรุงเทพมหานคร" })).toBe("กทม");
    expect(joinAddress({})).toBe("");
    expect(joinAddress({ subDistrict: "", district: "", province: "" })).toBe("");
  });
});

/**
 * 🔴 **TASK-801 (REQ-118, ruling B) — the address book is SERVED by the back end.** `thai-address-universal` is gone: its geocodes were wrong for ~21 %
 * of its rows (บึงกาฬ `97` vs the official `38`, 485 blank codes, Bangkok's เขต mis-numbered — `GATE-REQ-118-cross-check-2026-10-12.txt`). The pickers now read
 * `GET /areas/provinces` · `/areas/districts?province=` · `/areas/subdistricts?district=`. ✅ Kept from the old block: lookups by CODE, the English name never on a row.
 * 🔑 The fetch is faked at its own boundary: the point is WHAT the book asks for and what it hands back, not the dataset.
 */
describe("§7b — the address book: three lazy routes, by CODE (TASK-801)", () => {
  const ROWS: Record<string, Array<{ code: string; nameTh: string; nameEn: string }>> = {
    "/areas/provinces": [
      { code: "10", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
      { code: "50", nameTh: "เชียงใหม่", nameEn: "Chiang Mai" },
      { code: "38", nameTh: "บึงกาฬ", nameEn: "Bueng Kan" },
    ],
    "/areas/districts?province=10": [{ code: "1035", nameTh: "จอมทอง", nameEn: "Chom Thong" }],
    "/areas/districts?province=50": [{ code: "5002", nameTh: "จอมทอง", nameEn: "Chom Thong" }],
    "/areas/subdistricts?district=1035": [{ code: "103501", nameTh: "บางขุนเทียน", nameEn: "Bang Khun Thian" }],
    "/areas/subdistricts?district=5002": [{ code: "500201", nameTh: "บ้านหลวง", nameEn: "Ban Luang" }],
  };
  const asked: string[] = [];
  let failNext: string | null = null;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    asked.length = 0;
    failNext = null;
    globalThis.fetch = (async (url: string) => {
      const path = String(url).replace(/^.*\/api(?=\/areas)/, "");
      asked.push(path);
      if (failNext === path) return { ok: false, status: 503, json: async () => [] } as unknown as Response;
      return { ok: true, status: 200, json: async () => ROWS[path] ?? [] } as unknown as Response;
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("🔑 NO source file imports the old package (it is left in package.json for now — removing it also means two lockfiles; a separate, human-run step)", () => {
    const { readdirSync, statSync } = require("fs") as typeof import("fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = `${dir}/${n}`;
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(100);
    const importers = files.filter((f) => /(from\s+|import\s*\(\s*)["']thai-address-universal["']/.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });

  it("🔑 LAZY per level: loading the book asks for the provinces ONLY; districts and sub-districts are asked for when picked", async () => {
    const book = await loadAddressBook();
    expect(asked).toEqual(["/areas/provinces"]);
    await book.districtsOf("10");
    expect(asked).toEqual(["/areas/provinces", "/areas/districts?province=10"]);
    await book.subDistrictsOf("1035");
    expect(asked).toEqual(["/areas/provinces", "/areas/districts?province=10", "/areas/subdistricts?district=1035"]);
  });

  it("✅ each list is fetched ONCE and kept: asking again sends no request", async () => {
    const book = await loadAddressBook();
    await book.districtsOf("10");
    await book.districtsOf("10");
    await book.subDistrictsOf("1035");
    await book.subDistrictsOf("1035");
    expect(asked.length).toBe(3);
  });

  it("🔑 rows are { code, nameTh } in the server's order — the English name never rides the row (TASK-580)", async () => {
    const book = await loadAddressBook();
    expect(book.provinces).toEqual([
      { code: "10", nameTh: "กรุงเทพมหานคร" },
      { code: "50", nameTh: "เชียงใหม่" },
      { code: "38", nameTh: "บึงกาฬ" },
    ]);
    expect(JSON.stringify(book.provinces)).not.toContain("nameEn");
  });

  it("🔑 lookups are by CODE because district NAMES repeat — จอมทอง is in both Bangkok and Chiang Mai, kept apart", async () => {
    const book = await loadAddressBook();
    const bkk = (await book.districtsOf("10")).find((d) => d.nameTh === "จอมทอง");
    const cnx = (await book.districtsOf("50")).find((d) => d.nameTh === "จอมทอง");
    expect(bkk?.code).toBe("1035");
    expect(cnx?.code).toBe("5002");
    expect((await book.subDistrictsOf(bkk!.code)).map((s) => s.nameTh)).toEqual(["บางขุนเทียน"]);
    expect((await book.subDistrictsOf(cnx!.code)).map((s) => s.nameTh)).toEqual(["บ้านหลวง"]);
  });

  it("⚠️ a code is URL-encoded into the query (a code is data, never concatenated raw)", () => {
    expect(AREA_ROUTES.districts("1&x=1")).toBe("/areas/districts?province=1%26x%3D1");
    expect(AREA_ROUTES.subdistricts("a b")).toBe("/areas/subdistricts?district=a%20b");
  });

  it("🚫 a list that will not load REJECTS (the pickers stay disabled — no half-built address), and a failure is NOT kept: the next pick retries", async () => {
    const book = await loadAddressBook();
    failNext = "/areas/districts?province=10";
    await expect(book.districtsOf("10")).rejects.toThrow();
    failNext = null;
    expect((await book.districtsOf("10")).map((d) => d.code)).toEqual(["1035"]);
    failNext = "/areas/provinces";
    await expect(loadAddressBook()).rejects.toThrow();
  });
});
