import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import {
  MAX_BATCH,
  batchBody,
  batchHeadlineKey,
  batchSummary,
  canSubmitBatch,
  overMax,
  pairRows,
  rowOutcome,
  rowReason,
  type BatchRow,
  type ShopfrontItem,
} from "./shopfront";

/**
 * 🔴 TASK-490/491 — several children, one press, **a result per child**.
 *
 * The rule the whole feature turns on: **three ticked, one fails ⇒ the screen must not say "checked in"**. A parent told
 * that walks away believing all three children are in, and the refused child is then not expected in the class with
 * nobody looking for them. Equally, never all-or-nothing: the two that succeeded did succeed.
 * ⇒ **the MIXED case is what this file tests first**; the all-succeeded case is the easy one.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/Checkin/ShopfrontCheckinContent.tsx");

const session = (id: string): ShopfrontItem => ({ kind: "session", bookingId: id, date: "2026-09-27", startTime: "10:00", endTime: "11:00", program: "Skate", teacher: "Teacher Beam" });
const camp = (id: string): ShopfrontItem => ({ kind: "camp", campDayId: id, date: "2026-09-27", half: "AM" });
const ok = (id: string): BatchRow => ({ bookingId: id, status: 200, body: { already: false, booking: {} } });
const already = (id: string): BatchRow => ({ bookingId: id, status: 200, body: { already: true, booking: {} } });
const refused = (id: string, message = "สายเกินกำหนดเช็คอิน"): BatchRow => ({ bookingId: id, status: 409, body: { error: { code: "NOT_CHECKINABLE", message } } });
const absentCamp = (id: string): BatchRow => ({ campDayId: id, status: 200, body: { already: true, day: { status: "ABSENT" } } });

describe("§1 — 🔴 the MIXED result, first", () => {
  it("three asked, one refused: per-row outcomes, and the headline carries NO success wording", () => {
    const rows = [ok("a"), refused("b"), already("c")];
    expect(rows.map(rowOutcome)).toEqual(["done", "refused", "already"]);
    const s = batchSummary(rows);
    expect(s).toEqual({ total: 3, in: 2, refused: 1, anyRefused: true, allIn: false });
    expect(batchHeadlineKey(rows)).toBe("shopCheckin.batchMixed");
    // the mixed headline promises nothing: it counts, names the ones needing the desk, and says no "checked in" of its own
    for (const lang of ["en", "th"] as const) {
      const line = (dictionaries[lang].shopCheckin as Record<string, string>).batchMixed;
      for (const k of ["{in}", "{total}", "{refused}"]) expect(line).toContain(k);
      expect(line).not.toBe((dictionaries[lang].shopCheckin as Record<string, string>).batchAllIn);
    }
  });
  it("a refused row shows ITS OWN reason, as the server wrote it", () => {
    expect(rowReason(refused("b", "สายเกินกำหนดเช็คอิน"))).toBe("สายเกินกำหนดเช็คอิน");
    expect(rowReason(refused("b", "   "))).toBeNull(); // blank ⇒ the page's own neutral line, never an empty bubble
    expect(rowReason(ok("a"))).toBeNull();
    // 📌 and the SCREEN prefers that row's own sentence: pinning only the helper let a mutation drop it at the call site
    // and print one generic line for every refusal — which is how a parent loses the one fact that says what to do.
    expect(page).toContain("const reason = row ? rowReason(row) : null;");
    expect(page).toContain('{outcome === "refused" ? (reason ?? t("shopCheckin.rowRefused")) :');
  });
  it("🔴 a 2xx is not a check-in: an ABSENT camp day in a batch row is REFUSED (TASK-483's rule, per row)", () => {
    expect(rowOutcome(absentCamp("d1"))).toBe("refused");
    expect(batchSummary([ok("a"), absentCamp("d1")]).anyRefused).toBe(true);
    expect(batchHeadlineKey([ok("a"), absentCamp("d1")])).toBe("shopCheckin.batchMixed");
  });
  it("every row the server did not answer for is refused, never assumed done", () => {
    const asked = [{ child: "A", item: session("a") }, { child: "B", item: camp("d1") }];
    const paired = pairRows(asked, [ok("a")]);
    expect(paired.map((p) => p.row === null)).toEqual([false, true]);
    // paired BY ID, not by position — a reordered answer cannot mislabel a child
    const swapped = pairRows(asked, [{ campDayId: "d1", status: 200, body: { already: false } }, ok("a")]);
    expect(swapped[0].row?.bookingId).toBe("a");
    expect(swapped[1].row?.campDayId).toBe("d1");
  });
  it("only an all-in batch gets success wording; an empty answer gets the neutral line", () => {
    expect(batchHeadlineKey([ok("a"), already("b")])).toBe("shopCheckin.batchAllIn");
    expect(batchSummary([ok("a"), already("b")])).toEqual({ total: 2, in: 2, refused: 0, anyRefused: true === false ? true : false, allIn: true });
    expect(batchHeadlineKey([])).toBe("shopCheckin.tryAgain");
    expect(batchHeadlineKey([refused("a")])).toBe("shopCheckin.batchMixed");
  });
});

describe("§2 — the request, the ceiling, and a single tick", () => {
  it("the body carries the phone again and one id per item, in the order asked", () => {
    expect(batchBody(" 081 ", [session("a"), camp("d1")])).toEqual({ phone: "081", items: [{ bookingId: "a" }, { campDayId: "d1" }] });
    for (const item of batchBody("081", [session("a"), camp("d1")]).items) expect(Object.keys(item).length).toBe(1);
  });
  it("1 to 10 may be sent; the ceiling is surfaced BEFORE the request", () => {
    expect(MAX_BATCH).toBe(10);
    expect(canSubmitBatch(0)).toBe(false);
    expect(canSubmitBatch(1)).toBe(true);
    expect(canSubmitBatch(10)).toBe(true);
    expect(canSubmitBatch(11)).toBe(false);
    expect(overMax(10)).toBe(false);
    expect(overMax(11)).toBe(true);
    expect(page).toContain("{overMax(tickedRows.length) && (");
    expect(page).toContain("disabled={!canSubmitBatch(tickedRows.length)}");
  });
  it("ONE ticked child goes down today's single route — one child, one behaviour", () => {
    expect(page).toContain("if (asked.length === 1) return checkIn(asked[0].item);");
    expect(page).toContain("<SuccessView result={phase.result} />"); // the familiar full reply is still the single path's
    expect(page).toContain("<CampSuccessView result={phase.result} />");
  });
});

describe("§3 — the screen: per child, in order, and no overall tick when any row failed", () => {
  it("the result block decides per row and never from the HTTP status", () => {
    expect(page).toContain("const outcome = row ? rowOutcome(row) : \"refused\";");
    expect(page).toContain("data-outcome={outcome}");
    expect(page).toContain("{pairRows(phase.asked, phase.rows).map(({ child, item, row }) => {");
    // 🚫 no optimistic anything, and the batch's own `res.ok` decides only whether the LIST was read
    expect(page).not.toMatch(/res\.ok\s*\?\s*"done"|setPhase\(\{ kind: "done".*batch/);
    expect(page).not.toMatch(/optimistic/i);
    // the headline comes from the pure rule, so no success word can be assembled locally
    expect(page).toContain("{t(batchHeadlineKey(phase.rows), {");
    expect(page).not.toMatch(/batchAllIn|batchMixed/); // the page names neither key itself
  });
  it("🚫 no retry-all, and the summary is IN ADDITION to the rows (never instead)", () => {
    expect(page).not.toMatch(/retry|resubmit|submitAgain/i);
    expect(page).toContain('data-shop-ask-desk');
    // every asked child has a row on screen: the result map is over what was ASKED (`pairRows(phase.asked, …)`, pinned
    // above) and nothing filters it by how a child turned out — hiding a refused row is the defect this task exists for
    expect(page).not.toMatch(/\.filter\([^)]*(rowOutcome|outcome|refused)/);
    expect(page).not.toMatch(/phase\.rows\.filter\(/);
  });
  it("the four 'nothing' cases stay indistinguishable — a multi-select adds no new leak", () => {
    expect(page).not.toMatch(/\.children/); // the TASK-478 pin, still the shape
    expect(page).not.toMatch(/setNotice\("/);
    expect((page.match(/rows\.map\(/g) ?? []).length).toBe(1); // the ticking list renders in ONE place
    // ticks are per row and identical; nothing about a row differs before a check-in is attempted
    expect(page).toContain("checked={ticked.includes(itemKey(item))}");
    expect(page).not.toMatch(/disabled=\{[^}]*item\./);
  });
  it("nothing stored: the ticks are cleared on a new lookup, on start-over and after the batch", () => {
    expect(page).not.toMatch(/localStorage|sessionStorage/);
    expect((page.match(/setTicked\(\[\]\);/g) ?? []).length).toBe(3);
  });
  it("copy: the eight new keys in both languages, and the row words plain", () => {
    for (const lang of ["en", "th"] as const) {
      const c = dictionaries[lang].shopCheckin as Record<string, string>;
      for (const k of ["checkInBtn", "tooMany", "batchAllIn", "batchMixed", "rowDone", "rowAlready", "rowRefused", "askDesk"]) expect(typeof c[k]).toBe("string");
      expect(c.checkInBtn).toContain("{n}");
      expect(c.tooMany).toContain("{max}");
      expect(c.rowRefused).not.toMatch(/409|error|code/i);
    }
    expect(dictionaries.en.shopCheckin.batchMixed).toBe("{in} of {total} checked in · {refused} need the front desk");
  });
});
