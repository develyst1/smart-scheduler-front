import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import {
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

describe("§7b — the dataset: `thai-address-universal@2.2.0`, ISC, loaded by geocode", () => {
  it("is pinned in package.json at an exact version, with its licence on disk", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["thai-address-universal"]).toBe("2.2.0");
    const licence = readFileSync("node_modules/thai-address-universal/LICENSE.md", "utf8");
    expect(licence).toContain("Permission to use, copy, modify, and/or distribute this software for any purpose");
  });

  it("🔑 the package is named in exactly ONE source file, as a dynamic import — the admin bundle never carries it", () => {
    // `src/**` minus tests, walked on disk (not `git grep` — a new file is untracked until the human commits).
    const { readdirSync, statSync } = require("fs") as typeof import("fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = `${dir}/${n}`;
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(100);
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("thai-address-universal"));
    expect(hits).toEqual(["src/lib/register/entry.ts"]);
    expect(entry).toContain('await import("thai-address-universal")');
    expect(entry).not.toMatch(/^import .*thai-address-universal/m);
  });

  it("77 provinces; Bangkok's 50 เขต; วัฒนา's แขวง collapsed to one row each (the customer's own district)", async () => {
    const book = await loadAddressBook();
    expect(book.provinces.length).toBe(77);
    const bkk = book.provinces.find((p) => p.code === BANGKOK_GEOCODE);
    expect(bkk?.nameTh).toBe("กรุงเทพมหานคร");
    const districts = await book.districtsOf(BANGKOK_GEOCODE);
    expect(districts.length).toBe(50);
    const wattana = districts.find((d) => d.nameTh === "วัฒนา");
    expect(wattana).toBeDefined();
    const subs = await book.subDistrictsOf(wattana!.code);
    // the raw rows are per postal code — พระโขนงเหนือ has two — and the picker must list it ONCE
    expect(subs.map((s) => s.nameTh).sort()).toEqual(["คลองตันเหนือ", "คลองเตยเหนือ", "พระโขนงเหนือ"]);
  });

  it("the dataset's 77 province names are EXACTLY the repo's `TH_PROVINCES` (the admin's parent form, SPEC-016)", async () => {
    // Two lists of the same 77 names now live in this repo; this pins that they agree, so a report that groups
    // `parents.province` cannot split one province across two spellings because of THIS side.
    const { TH_PROVINCES } = await import("@/lib/people/th-provinces");
    const book = await loadAddressBook();
    expect([...book.provinces.map((p) => p.nameTh)].sort()).toEqual([...TH_PROVINCES].sort());
  });

  it("🔑 lookups are by CODE because district NAMES repeat — จอมทอง is in both Bangkok and Chiang Mai", async () => {
    const book = await loadAddressBook();
    const bkk = (await book.districtsOf("10")).find((d) => d.nameTh === "จอมทอง");
    const cnx = (await book.districtsOf("50")).find((d) => d.nameTh === "จอมทอง");
    expect(bkk?.code).toBe("1035");
    expect(cnx?.code).toBe("5002");
    const subsBkk = (await book.subDistrictsOf(bkk!.code)).map((s) => s.nameTh);
    const subsCnx = (await book.subDistrictsOf(cnx!.code)).map((s) => s.nameTh);
    expect(subsBkk.length).toBeGreaterThan(0);
    expect(subsCnx.length).toBeGreaterThan(0);
    expect(subsBkk.some((s) => subsCnx.includes(s))).toBe(false); // two different places, kept apart
  });
});
