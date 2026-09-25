import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { SHOPFRONT_PATH, canLookup, checkinBody, isNothingToOffer, itemKey, offerRows, shopfrontUrl, type ShopfrontItem } from "./shopfront";

/**
 * REQ-108 / TASK-475/478 — the shop-front check-in at the **PRINTED** url `/checkin/shop`.
 *
 * 🔴 The route's existence is pinned here because **the URL is on a poster**: a paper QR cannot be rotated, re-issued
 * or redirected, so renaming, nesting or "tidying" this route breaks every scan of that poster for as long as it hangs
 * on the wall. If this test is what stopped you: the path is not yours to move — add one instead.
 * 🔴 And the guard: an unknown number, a family with nothing right now and a suspended household must be
 * INDISTINGUISHABLE. The server makes them so; these pins keep the client from undoing it.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/Checkin/ShopfrontCheckinContent.tsx");
const route = "src/app/checkin/shop/page.tsx";
const lib = readFileSync("src/lib/checkin/shopfront.ts", "utf8");
const qrPanel = codeOf("src/components/partials/Settings/ShopfrontQrPanel.tsx");
const settings = codeOf("src/components/partials/Settings/SettingsContent.tsx");
const session: ShopfrontItem = { kind: "session", bookingId: "b1", date: "2026-09-25", startTime: "10:00", endTime: "11:00", program: "Skate", teacher: "Teacher Beam" };
const camp: ShopfrontItem = { kind: "camp", campDayId: "d1", date: "2026-09-25", half: "AM" };

describe("§1 — 🔴 the printed route, and no token", () => {
  it("`/checkin/shop` exists, beside the other two, and the reason it is frozen is written down where someone would touch it", () => {
    expect(existsSync(route)).toBe(true); // 🔴 the poster's URL — see the file header before "tidying" anything
    expect(SHOPFRONT_PATH).toBe("/checkin/shop");
    expect(existsSync("src/app/checkin/page.tsx")).toBe(true);
    expect(existsSync("src/app/checkin/camp/page.tsx")).toBe(true);
    // the WHY lives beside the literal and in the route file, not in a commit message nobody will read
    // the comment wraps across lines, so the WORDS are what is pinned, not their line breaks
    const flat = (src: string) => src.replace(/^\s*\*+/gm, " ").replace(/\s+/g, " ");
    for (const src of [lib, readFileSync(route, "utf8")]) {
      expect(src.toLowerCase()).toContain("poster");
      expect(flat(src)).toMatch(/cannot be (rotated|re-issued|renamed)|do not rename/i);
    }
    // 🚫 no token anywhere on this page — the phone is the credential (a token would expire; a poster cannot)
    expect(page).not.toMatch(/token/i);
    expect(readFileSync(route, "utf8")).not.toMatch(/searchParams|useSearchParams/);
  });
  it("the poster's URL comes from the ONE env value the backend uses — never a second literal", () => {
    expect(shopfrontUrl("https://frontoffice.develyst.online/api")).toBe("https://frontoffice.develyst.online/checkin/shop");
    expect(shopfrontUrl("https://frontoffice.develyst.online/api/")).toBe("https://frontoffice.develyst.online/checkin/shop");
    expect(shopfrontUrl("http://localhost:3001/api")).toBe("http://localhost:3001/checkin/shop");
    expect(shopfrontUrl(undefined)).toBe("/checkin/shop"); // relative, never a hardcoded host
    expect(qrPanel).toContain("shopfrontUrl(process.env.NEXT_PUBLIC_API_URL)");
    expect(qrPanel).not.toContain("develyst"); // the host is never typed twice
    expect(settings).toContain("<ShopfrontQrPanel />");
    expect(qrPanel).toContain("<QrPanel url={url}"); // the shared QR, drawn from that one url
  });
});

describe("§2 — 🔴 the four 'nothing' cases are ONE case", () => {
  it("unknown number · nothing right now · suspended family · a child with an empty list ⇒ all `true`, all the same screen", () => {
    expect(isNothingToOffer({ children: [] })).toBe(true); // the server's answer for an unknown number AND for a suspended family
    expect(isNothingToOffer({})).toBe(true); // absent
    expect(isNothingToOffer(null)).toBe(true);
    expect(isNothingToOffer({ children: null })).toBe(true);
    expect(isNothingToOffer({ children: [{ name: "A", items: [] }] })).toBe(true); // known family, nothing now
    expect(isNothingToOffer({ children: [{ name: "A", items: [] }, { name: "B", items: [] }] })).toBe(true);
    expect(isNothingToOffer({ children: [{ name: "A", items: [session] }] })).toBe(false);
    // nothing is ever HALF shown: no rows in any of those cases
    for (const d of [{ children: [] }, {}, { children: [{ name: "A", items: [] }] }]) expect(offerRows(d)).toEqual([]);
  });
  it("the page has ONE neutral phase and ONE neutral sentence: no 'not found', no count, no name, and the same controls", () => {
    expect(page).toContain('if (isNothingToOffer(data as ShopfrontLookup)) setPhase({ kind: "nothing" });');
    // one sentence for every empty case, one for every failure — and neither is branched on a cause
    expect((page.match(/t\("shopCheckin\.nothing"\)/g) ?? []).length).toBe(1);
    expect(page).not.toMatch(/notFound|not_found|unknownNumber|suspended/i);
    expect(page).not.toMatch(/children\.length|\.length\s*>\s*0\s*\?/); // no count on screen, no branch on how many
    // 📌 the page never reads `children` at all: "is there anything to offer" is ONE pure decision, so an absent list
    // cannot grow a branch of its own — a mutation adding `if (!data.children) { setNotice("Phone not found") }`
    // walked past the pins above, which is exactly the leak this page exists to prevent.
    expect(page).not.toMatch(/\.children/);
    // every sentence comes from the dictionary — a literal here is how an untranslated hint reaches a poster's audience
    expect(page).not.toMatch(/setNotice\("/);
    // the rows render in exactly ONE place (the list phase), never under the neutral sentence
    expect((page.match(/rows\.map\(/g) ?? []).length).toBe(1);
    // every refusal is the same neutral line: a 429, a 400, a 409 and a dead network
    expect((page.match(/t\("shopCheckin\.tryAgain"\)/g) ?? []).length).toBe(4);
    expect(page).not.toMatch(/429|RATE_LIMITED|NOT_CHECKINABLE|status ===/);
    // and the 409 path goes back to a REFRESHED list rather than guessing
    expect(page).toMatch(/setNotice\(t\("shopCheckin\.tryAgain"\)\);\s*await lookup\(true\);/);
  });
});

describe("§3 — the act, the reuse, and what is never kept", () => {
  it("the body carries the phone AGAIN and exactly one id, by kind", () => {
    expect(checkinBody(" 0812345678 ", session)).toEqual({ phone: "0812345678", bookingId: "b1" });
    expect(checkinBody("0812345678", camp)).toEqual({ phone: "0812345678", campDayId: "d1" });
    // 📌 exactly ONE id, pinned by KEY SET: `toEqual` treats an `undefined` value as an absent key, so a body carrying
    // both ids with one of them `undefined` slipped past the two lines above — and the server reads keys, not values.
    expect(Object.keys(checkinBody("081", session)).sort()).toEqual(["bookingId", "phone"]);
    expect(Object.keys(checkinBody("081", camp)).sort()).toEqual(["campDayId", "phone"]);
    expect(itemKey(session)).toBe("b1");
    expect(itemKey(camp)).toBe("d1");
    expect(canLookup("  ")).toBe(false);
    expect(canLookup("081")).toBe(true); // whether it is phone-SHAPED is the server's 400, never a second opinion here
    expect(lib).not.toMatch(/\\d\{9,10\}|\^0\[0-9\]/); // no client phone format rule
    expect(page).toContain("body: JSON.stringify(checkinBody(phone, item)),");
    expect(page).toContain('body: JSON.stringify({ phone: phone.trim() }),');
  });
  it("the reply is the EXISTING rendering, not a second one", () => {
    expect(page).toContain('import { API_BASE, CampSuccessView, SuccessView, type CheckinResult } from "./CheckinContent";');
    expect(page).toContain("<SuccessView result={phase.result} />");
    expect(page).toContain("<CampSuccessView result={phase.result} />");
    // nothing here re-renders the answer's own facts
    expect(page).not.toMatch(/crmAwarded|remainingLine|already \?/);
  });
  it("🚫 nothing is stored and the field is cleared after a success (a shared counter device)", () => {
    expect(page).not.toMatch(/localStorage|sessionStorage|autoComplete="tel"|defaultValue/);
    expect(page).toContain('autoComplete="off"');
    expect(page).toContain("setPhone(\"\");"); // cleared on success and on start-over
    expect((page.match(/setPhone\(""\);/g) ?? []).length).toBe(2);
    expect(page).toMatch(/const backToStart = \(\) => \{\s*setPhone\(""\);/);
  });
  it("copy: the twelve keys in both languages, plain words, no jargon", () => {
    const en = dictionaries.en.shopCheckin as Record<string, string>;
    const th = dictionaries.th.shopCheckin as Record<string, string>;
    expect(Object.keys(en).length).toBe(12);
    expect(Object.keys(en).length).toBe(Object.keys(th).length);
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    // the neutral pair says nothing technical and nothing about the number
    for (const d of [en, th]) {
      expect(d.nothing).not.toMatch(/404|error|not found|ไม่พบ|ไม่มีข้อมูล/i);
      expect(d.tryAgain).not.toMatch(/429|rate|limit|error|server/i);
    }
    expect(en.nothing).toBe("Nothing to check in right now. Please ask the front desk.");
    expect(en.tryAgain).toBe("Please try again shortly, or ask the front desk.");
  });
});
