import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { coverRateRequired, knownSeriesRate, SERIES_SCOPES, scopeBody, scopeChosen, scopeDateLabelKey, scopeOutcomeKey } from "./series-scope";
import { dictionaries } from "@/lib/i18n/dictionaries";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const dialogs = codeOf("src/components/partials/OtherSeries/OtherSeriesDialogs.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");

describe("TASK-564 — this session, or the rest", () => {
  it("🔑 exactly ONE scope key rides, and it is the one chosen", () => {
    expect(scopeBody("this", "2026-10-05")).toEqual({ onDate: "2026-10-05" });
    expect(scopeBody("rest", "2026-10-05")).toEqual({ fromDate: "2026-10-05" });
    // never both
    for (const scope of SERIES_SCOPES) expect(Object.keys(scopeBody(scope, "2026-10-05") ?? {}).length).toBe(1);
  });

  it("🚫 NOTHING is sent until a scope is chosen — the same refusal the server makes, made earlier", () => {
    expect(scopeBody(null, "2026-10-05")).toBeNull();
    expect(scopeChosen(null)).toBe(false);
    expect(scopeChosen("this")).toBe(true);
    expect(scopeChosen("rest")).toBe(true);
    // and a body with no date is not a scope either
    expect(scopeBody("this", "")).toBeNull();
  });

  it("🔑 the two scopes are only these two, frozen — a third would be a decision", () => {
    expect([...SERIES_SCOPES]).toEqual(["this", "rest"]);
    expect(Object.isFrozen(SERIES_SCOPES)).toBe(true);
  });

  it("the date box says what the date MEANS in the chosen scope", () => {
    expect(scopeDateLabelKey("this")).toBe("otherSeries.scopeThisDate");
    expect(scopeDateLabelKey("rest")).toBe("otherSeries.fromDate");
    expect(scopeDateLabelKey(null)).toBe("otherSeries.fromDate");
  });

  it("🔑 a COVER and a JOIN are named differently, and only on the one-session scope", () => {
    expect(scopeOutcomeKey("swap", "this")).toBe("otherSeries.coverNote");
    expect(scopeOutcomeKey("add", "this")).toBe("otherSeries.joinNote");
    // over the rest of the series the existing wording already says replacement / extra coach
    expect(scopeOutcomeKey("swap", "rest")).toBeNull();
    expect(scopeOutcomeKey("add", "rest")).toBeNull();
    expect(scopeOutcomeKey("swap", null)).toBeNull();
  });
});

describe("TASK-564 — the doors ask, and no option is pre-selected", () => {
  it("🚫 the scope starts as `null` — a default of “the rest” would reproduce the complaint with one extra click", () => {
    expect(dialogs).toContain("const [scope, setScope] = useState<SeriesScope>(null);");
    // 🚫 by ABSENCE: no `useState<SeriesScope>(\"rest\")` and no `?? \"rest\"` anywhere
    expect(dialogs).not.toMatch(/useState<SeriesScope>\("(this|rest)"\)/);
    expect(dialogs).not.toMatch(/scope \?\? "(this|rest)"/);
  });

  it("both radio options exist and neither is marked as checked by the component", () => {
    expect(dialogs).toContain('<Radio value="this" label={t("otherSeries.scopeThis")} data-scope-this />');
    expect(dialogs).toContain('<Radio value="rest" label={t("otherSeries.scopeRest")} data-scope-rest />');
    expect(dialogs).toContain('value={scope ?? ""}');
  });

  /**
 * 🔴 **TASK-577 (D10) — the cover's rate, as rules.** These live here rather than only in the clicked test because the
 * clicked proof cannot reach them: the mutant that makes the rate ride on a WHOLE-SERIES swap **crashes Bun outright**
 * (exit `0xC0000409`) instead of failing, so the DOM run yields no counts at all. 🔑 *A rule whose only proof is a run
 * that can crash is a rule with no proof on the days it crashes.*
 */
  it("🔴 the rate belongs to a COVER and nothing else — one session, a swap, and neither of the other doors", () => {
    expect(coverRateRequired("swap", "this")).toBe(true);
    // 🚫 over the REST of the series the server writes no rate at all ⇒ a box there would offer a number that goes nowhere
    expect(coverRateRequired("swap", "rest")).toBe(false);
    // 🚫 an ADD on one session is a JOIN (both paid, each at their own rate) — its rate box is the optional one
    expect(coverRateRequired("add", "this")).toBe(false);
    expect(coverRateRequired("remove", "this")).toBe(false);
    // 🚫 and never before a scope is chosen
    expect(coverRateRequired("swap", null)).toBe(false);
  });

  it("⚖️ ENTERED, not carried — and this is the check that makes that a fact rather than a preference", () => {
    // The only rates this screen can see are `series.teacherRates`, which the server builds from the header row's
    // primary and extras. Swap offers `bookable && !onRow` ⇒ 🔑 **the two sets cannot overlap**, so there is never a rate
    // to carry for a coach who is eligible to cover.
    expect(knownSeriesRate({ t1: 50000 }, "t1")).toBe(50000);
    expect(knownSeriesRate({ t1: 50000 }, "t2")).toBeNull();
    expect(knownSeriesRate(undefined, "t2")).toBeNull();
    expect(knownSeriesRate({ t1: 50000 }, null)).toBeNull();
    // the door's own filter, pinned at the source: the excluded set IS the rate-bearing set
    expect(dialogs).toContain("const onRow = [series.teacherId, ...series.additionalTeacherIds];");
    expect(dialogs).toContain("const choices = teachers.filter((x) => x.bookable && !onRow.includes(x.id));");
  });

  it("🔑 Save waits for a scope, and `submit` refuses without one — two guards, because one is a UI state", () => {
    // 🔻 TASK-577 (D10), declared: the condition GREW — a cover with no rate cannot be pressed either. What this pin
    // protects (Save waits for a scope · `submit` refuses without one · two guards) is unchanged and still asserted.
    // 🔻 TASK-592, declared: the condition grew again — a cover without the rate PERMISSION cannot be pressed either. The
    // property this pin protects (Save waits for a scope · `submit` refuses without one · two guards) is unchanged.
    expect(dialogs).toContain('disabled={mode !== "remove" && (!to || !scoped || coverBlocked || (needRate && canRate && coverRateMinor == null))}');
    expect(dialogs).toContain('if (mode !== "remove" && !scoped) return;');
    // 🔴 TASK-577 (D10) — the same pair for the cover's rate. **A clicked test cannot prove this half:** with the button
    // still disabled, removing the pre-request return changes nothing a click can see. *Two guards need two proofs.*
    expect(dialogs).toContain("if (needRate && canRate && coverRateMinor == null) return;");
  });

  it("the server's refusal reaches the admin as its own sentence", () => {
    // `errOf` is this file's one error reader; the dialog renders it unwrapped
    expect(dialogs).toContain("setError(errOf(e));");
    expect(dialogs).toContain("{error}");
  });
});

describe("TASK-564 — Move session was ALREADY one row (the finding)", () => {
  /**
   * 🔑 **The cause of “moving one session changed the whole course” is NOT the move door.** `PATCH /bookings/:id` carries
   * only the fields that changed **for that one booking**, and no series route is reachable from it — pinned below.
   * 🔴 **It was the teacher doors:** their only scope control was a date box labelled *“From date — today by default”*, so a
   * Swap or an Add rewrote **every remaining row from today**, and nothing asked. That is what TASK-564 fixes.
   */
  it("the move sends ONE booking's id and only the changed fields — no series call", () => {
    expect(modal).toContain("await move.mutateAsync({ id: booking.id, patch });");
    expect(modal).toContain("if (teacherId !== booking.teacherId) patch.teacherId = teacherId;");
    expect(modal).toContain("if (date !== booking.date) patch.date = date;");
    expect(modal).toContain("if (startTime !== booking.startTime) patch.startTime = startTime;");
    // 🚫 nothing series-wide anywhere near the move: no scope, no series path, no "apply to the rest"
    const moveBlock = modal.slice(modal.indexOf("const handleSubmit = async () => {"), modal.indexOf("await move.mutateAsync"));
    expect(moveBlock).not.toMatch(/fromDate|onDate|other-series|group-series/);
  });
});

describe("TASK-564 — the words (DRAFT, pinned by shape)", () => {
  const KEYS = ["scopeLabel", "scopeThis", "scopeRest", "scopeHint", "scopeThisDate", "coverNote", "joinNote"];

  it("all seven exist in both languages, and the placeholders match the call sites", () => {
    for (const lang of ["en", "th"] as const) {
      const d = dictionaries[lang].otherSeries as unknown as Record<string, string>;
      for (const k of KEYS) expect(d[k].trim().length).toBeGreaterThan(0);
      expect(d.coverNote).toContain("{from}");
      expect(d.coverNote).toContain("{to}");
      expect(d.joinNote).toContain("{name}");
      expect(d.scopeThis).not.toContain("{");
    }
  });

  it("🔑 the two options cannot be mistaken for each other, and neither reads as a default", () => {
    for (const lang of ["en", "th"] as const) {
      const d = dictionaries[lang].otherSeries as unknown as Record<string, string>;
      expect(d.scopeThis).not.toBe(d.scopeRest);
      // the ONE-session option must not mention the rest; the REST option must
      if (lang === "en") {
        expect(d.scopeThis.toLowerCase()).toContain("this session only");
        expect(d.scopeRest.toLowerCase()).toContain("the rest");
        expect(d.scopeHint.toLowerCase()).toContain("nothing is assumed");
      } else {
        expect(d.scopeThis).toContain("เฉพาะ");
        expect(d.scopeRest).toContain("ถัดไป");
        expect(d.scopeHint).toContain("ไม่เดา");
      }
    }
  });

  it("🔑 a cover says B is NOT teaching and A is paid; a join says BOTH are paid — the pay difference is in the words", () => {
    const en = dictionaries.en.otherSeries as unknown as Record<string, string>;
    const th = dictionaries.th.otherSeries as unknown as Record<string, string>;
    expect(en.coverNote.toLowerCase()).toContain("not teaching");
    expect(en.coverNote.toLowerCase()).toContain("paid");
    expect(en.joinNote.toLowerCase()).toContain("both");
    expect(th.coverNote).toContain("สอนแทน");
    expect(th.coverNote).toContain("ไม่ได้สอน");
    expect(th.joinNote).toContain("ทั้งสองคน");
    // 📝 and they are marked as mine, not his
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8")).toContain("📝 **DRAFT (Fern, TASK-564)**");
  });
});

/**
 * 🔑 **The move door's answer to “this session or the rest?” is a STATEMENT, not a question** — and that is a judgement I
 * want visible: `PATCH /bookings/:id` is one row and there is **no server act that moves the rest**, so a choice here
 * would have exactly one answer. What was missing is that nobody SAID so, and Khwan met her doubt on this screen.
 */
describe("TASK-564 — the move box says its scope", () => {
  it("the line is there, and it does not pretend to offer a choice", () => {
    expect(modal).toContain('{t("booking.moveThisOnly")}');
    expect(modal).toContain("data-move-scope");
    // 🚫 no radios, no scope state, no `onDate` on this door — the server has no such act
    const box = modal.slice(modal.indexOf('error={!teacherId ? t("booking.moveTeacherOff")'), modal.indexOf("await move.mutateAsync"));
    expect(box).not.toMatch(/Radio|scopeBody|onDate/);
  });

  it("🔑 the words name this session AND deny the rest, in both languages (DRAFT)", () => {
    const en = (dictionaries.en.booking as unknown as Record<string, string>).moveThisOnly;
    const th = (dictionaries.th.booking as unknown as Record<string, string>).moveThisOnly;
    expect(en.toLowerCase()).toContain("this session only");
    expect(en.toLowerCase()).toContain("rest of the course");
    expect(th).toContain("เฉพาะคาบนี้");
    expect(th).toContain("คาบอื่น");
    // 🚫 it must not read as an option
    expect(en.toLowerCase()).not.toContain("choose");
    expect(th).not.toContain("เลือก");
  });
});

/**
 * 🔴 **TASK-584 (BE) → TASK-592 — the owner ruled (a): a COVER requires the rate permission (key 59).**
 *
 * 🔑 **The screen catching up with a rule that is already true** — the server refuses it either way. What these pin is the
 * SHAPE of that catching-up: **the admin without the key is told in words, the admin WITH the key is untouched**, and the
 * gate is on the COVER alone.
 */
describe("🔴 TASK-592 — the cover's permission, and what it must NOT narrow", () => {
  it("🔑 the block is the COVER plus the missing key — nothing else", () => {
    expect(dialogs).toContain("const coverBlocked = needRate && !canRate;");
    // 🚫 it can only be true where a rate is required, which is a swap on ONE session (`coverRateRequired`)
    expect(coverRateRequired("swap", "this")).toBe(true);
    expect(coverRateRequired("swap", "rest")).toBe(false);
    expect(coverRateRequired("add", "this")).toBe(false);
  });

  it("🔴 two guards again: the Save is shut AND `submit` returns before the request", () => {
    expect(dialogs).toContain("if (coverBlocked) return;");
    expect(dialogs).toContain("coverBlocked ||");
  });

  it("⚠️ an admin WITH the key is UNCHANGED — this adds a state, it does not narrow theirs", () => {
    // the rate box and its own guard still read exactly as TASK-577 built them
    expect(dialogs).toContain("{needRate && canRate && (");
    expect(dialogs).toContain("if (needRate && canRate && coverRateMinor == null) return;");
    // 🚫 and the permission sentence cannot appear for them, because the block REQUIRES the key to be absent
    expect(dialogs).toContain("needRate && !canRate");
  });

  it("📋 the sentence names the PERMISSION and says what to do — in both languages", () => {
    for (const lang of ["en", "th"] as const) {
      const s = (dictionaries[lang].otherSeries as Record<string, string>).coverNeedsKey;
      expect(s.length).toBeGreaterThan(60);
    }
    const en = (dictionaries.en.otherSeries as Record<string, string>).coverNeedsKey;
    const th = (dictionaries.th.otherSeries as Record<string, string>).coverNeedsKey;
    expect(en).toMatch(/permission/i);
    expect(th).toContain("สิทธิ์");
    // 🔑 it says what to DO — a reason with no next step is a dead end with a caption
    expect(en).toMatch(/ask/i);
    expect(th).toContain("ขอสิทธิ์");
    // 🚫 and it blames neither the coach nor the rate
    expect(en).not.toMatch(/\{name\}|invalid|wrong/i);
    expect(th).not.toMatch(/\{name\}|ผิด/);
  });

  it("🔑 ONE cover entry point exists, derived — so no other door can show a dead box", () => {
    // the only FE sender of a one-date teacher swap is this dialog; the GROUP swap has no `onDate`
    const group = codeOf("src/components/partials/Calendar/Modal/GroupSwapDialog.tsx");
    expect(group).not.toContain("onDate");
    // 🔻 TASK-634, declared: the group swap now DOES carry an optional `rateMinor` — and the claim this assertion was
    // making is still true, which is why it is reworded rather than deleted. 🔑 **What matters is that there is exactly
    // ONE door that can show a dead COVER box, and the group swap is still not one of them:** a cover is a ONE-DATE
    // swap (`onDate`), the group door has no such scope, and its rate box is **optional and never blocks the act**.
    // ⇒ 🚫 it cannot present the refusal this section is about. The rate is an ANSWER here, not a gate.
    expect(group).toContain("rateMinor");
    expect(group).not.toContain("coverRateRequired");
    expect(group).not.toContain("coverBlocked");
    // 🔑 and the group box cannot be REQUIRED — an optional field that blocks Save is the dead end, whatever it is called
    expect(group).not.toMatch(/required[\s\S]{0,120}data-group-swap-rate/);
    expect(dialogs).toContain("swapBody(seriesRef, series.teacherId, to)");
    // and the dialog is opened from exactly one place
    const modal = codeOf("src/components/partials/OtherSeries/OtherSeriesModal.tsx");
    expect((modal.match(/<TeacherDialog/g) ?? []).length).toBe(1);
  });
});
