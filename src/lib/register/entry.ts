/**
 * TASK-349 (`REQ-088 §7a`, `§7b`) — **the ENTRY widgets' helpers. Entry, not storage.**
 *
 * > *"A parent who will not type `สมัคร` will not type `08-09-2020` or an address."*
 *
 * Two pickers replace two typed fields on `/register`, and **the stored values do not change**: `birthDate`
 * is still the customer's `DD-MM-YYYY` text and `province` is still ONE free-text string — the picker only
 * produces what the parent would have typed. Everything here is a pure reorder / join of what a widget
 * emitted; **nothing validates**. The server's parser and guards stay the only rules (Rule 1).
 *
 * The address book is `thai-address-universal@2.2.0` (ISC; a TypeScript rewrite of `thai-address-database`,
 * whose rows trace to the Thai postal-code tables) — 77 provinces / 928 districts / 7,211 sub-districts (7,893 rows — one per postal code),
 * with the official geocodes. It is `import()`ed here and nowhere else, so **only `/register` ever loads it**,
 * the same way `@line/liff` is kept off the admin bundle.
 */

/**
 * `§7a` — Mantine's `DatePickerInput` (v9) emits `YYYY-MM-DD` as a STRING. The customer's format is the same
 * three parts the other way round, so this is a reorder, not a parse: **no `dayjs`, no `Date`, no validation.**
 * The one `split("-")` on this side of the page lives here, on the WIDGET's own output — never on typed text,
 * which goes to the server exactly as typed.
 */
export const toCustomerDate = (widgetValue: string | null): string =>
  widgetValue ? widgetValue.split("-").reverse().join("-") : "";

/** One pick at any of the three levels — the geocode is the key, because district NAMES repeat across provinces. */
export interface AreaPick {
  code: string;
  nameTh: string;
}

/**
 * `§7b` — Bangkok's tiers are **เขต / แขวง**; every other province's are **อำเภอ / ตำบล** (the two words are
 * the law's, not ours — Bangkok is the one province administered as a special area). The dataset does not carry
 * the tier word, so it is keyed off the province geocode: `10` is Bangkok in the official scheme.
 */
export const BANGKOK_GEOCODE = "10";
export const tierWordsFor = (provinceCode: string | null) =>
  provinceCode === BANGKOK_GEOCODE
    ? { district: "เขต", subDistrict: "แขวง" }
    : { district: "อำเภอ", subDistrict: "ตำบล" };

/**
 * The customer's own example is `พระโขนงเหนือ วัฒนา กทม` — sub-district, district, province, space-joined,
 * with the province written **the way a parent writes it in a chat**. That is the rule: the EVERYDAY name.
 * `กรุงเทพมหานคร` is the one province whose everyday name is not its formal one (`กทม`, universally); every
 * other province's everyday name IS its formal name — their official abbreviations (`ชม.`, `ขก.`, …) are
 * licence-plate and postal forms nobody types in an address. So the table has one row, and that is the finding,
 * not a shortcut: the chat's parents would type the same.
 */
const EVERYDAY_PROVINCE_NAME: Record<string, string> = { กรุงเทพมหานคร: "กทม" };
export const everydayProvinceName = (nameTh: string) => EVERYDAY_PROVINCE_NAME[nameTh] ?? nameTh;

/**
 * The three picks ⇒ the SAME free-text string the chat stores, in the chat's order. A part that was not picked
 * is simply absent — a parent who picked province and district gave real information and the confirm screen
 * shows exactly what will be stored. All blank ⇒ `""` ⇒ the field is OMITTED (TASK-347 §5.1), as before.
 */
export const joinAddress = (parts: { subDistrict?: string; district?: string; province?: string }) =>
  [parts.subDistrict, parts.district, parts.province && everydayProvinceName(parts.province)]
    .filter((p): p is string => !!p)
    .join(" ");

export interface AddressBook {
  provinces: AreaPick[];
  districtsOf: (provinceCode: string) => Promise<AreaPick[]>;
  subDistrictsOf: (districtCode: string) => Promise<AreaPick[]>;
}

/** Rows come per postal code, so a sub-district with two codes appears twice — collapse on the geocode. */
const uniqueByCode = (rows: { code: string; nameTh: string }[]): AreaPick[] => {
  const seen = new Map<string, AreaPick>();
  for (const r of rows) if (!seen.has(r.code)) seen.set(r.code, { code: r.code, nameTh: r.nameTh });
  return [...seen.values()];
};

/**
 * Loads the dataset — DYNAMICALLY, on first use, on `/register` only. Lookups are by GEOCODE, never by name
 * (`getDistricts("เมือง…")` by name would merge same-named districts from different provinces).
 */
export const loadAddressBook = async (): Promise<AddressBook> => {
  const book = await import("thai-address-universal");
  const provinces = uniqueByCode(await book.getProvinces());
  return {
    provinces,
    districtsOf: async (provinceCode) => uniqueByCode(await book.getDistricts(provinceCode)),
    subDistrictsOf: async (districtCode) => uniqueByCode(await book.getSubDistricts(districtCode)),
  };
};
