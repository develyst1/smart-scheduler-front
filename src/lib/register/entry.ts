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
 * 🔻 **TASK-801 (REQ-118, ruling B) — the address book is SERVED by the back end, no longer bundled.** It was `thai-address-universal@2.2.0`;
 * the cross-check gate found its geocodes wrong for ~21 % of its rows (บึงกาฬ `97` vs the official `38`, 485 blank codes, Bangkok's เขต
 * mis-numbered), so a parent could pick a place whose code the server must refuse. Now the pickers read the back end's three read-only
 * area routes — the ONE dataset the server validates against — so every code a picker can send exists by construction. The package is no
 * longer imported anywhere, and the lists load LAZILY per level (provinces once, districts on a pick, sub-districts on a pick).
 */

import { API_BASE } from "./api";

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
 * 🔴 **TASK-580 §2 (Tanya's F-D) — `nameEn` is GONE from this type, deliberately.**
 *
 * The dataset ships **garbled** English (*"Khnong Tntnai"* for คลองตันเหนือ), and TASK-355 used it for the option label in
 * EN mode — the ONE place any of it reached a screen. **The Thai is correct, and the Thai is what we store and send**, so the
 * value was never wrong; only the label was. ⇒ **Thai names in both languages** (the FIELD labels are still translated).
 * 🚫 We do not own the package's strings and did not patch them. 🔑 **Removing the field rather than the call site means a
 * future reader arrives as a compile error instead of as garbled text on a parent's phone** — TASK-545's rule, reused.
 */

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
 * The back end's three read-only area routes (TASK-800): `GET /areas/provinces` · `GET /areas/districts?province=<code>` ·
 * `GET /areas/subdistricts?district=<code>`, each answering `[{ code, ... }]` in the dataset's order. 🔑 **The paths live HERE and nowhere
 * else** — if the back end names them differently, this is the one place that changes.
 */
export const AREA_ROUTES = {
  provinces: "/areas/provinces",
  districts: (provinceCode: string) => `/areas/districts?province=${encodeURIComponent(provinceCode)}`,
  subdistricts: (districtCode: string) => `/areas/subdistricts?district=${encodeURIComponent(districtCode)}`,
} as const;

/**
 * Loads the address book from the back end. Lookups are by GEOCODE, never by name (district NAMES repeat across provinces). Public, no
 * auth, direct `fetch` — as the rest of `/register` — so the admin form uses the very same call. Each list is fetched ONCE and kept
 * (the routes are cacheable and the data never changes at runtime); a failed fetch is NOT kept, so the next pick retries.
 * 🚫 A list that will not load REJECTS — the callers leave their pickers disabled (an address we cannot list is one we cannot collect).
 */
export const loadAddressBook = async (): Promise<AddressBook> => {
  const kept = new Map<string, Promise<AreaPick[]>>();
  const get = (path: string): Promise<AreaPick[]> => {
    const hit = kept.get(path);
    if (hit) return hit;
    const p = fetch(`${API_BASE}${path}`)
      .then((res) => {
        // (a rejection, not a `throw`: §7a pins that this file holds no `throw` — the date reorder above is the Rule-1 subject)
        if (!res.ok) return Promise.reject(new Error(`area list ${path}: ${res.status}`));
        return res.json() as Promise<{ code: string; nameTh: string }[]>;
      })
      .then((rows) => uniqueByCode(rows));
    kept.set(path, p);
    p.catch(() => kept.delete(path));
    return p;
  };
  return {
    provinces: await get(AREA_ROUTES.provinces),
    districtsOf: (provinceCode) => get(AREA_ROUTES.districts(provinceCode)),
    subDistrictsOf: (districtCode) => get(AREA_ROUTES.subdistricts(districtCode)),
  };
};
