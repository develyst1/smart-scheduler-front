import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { SERIES_SCOPES, scopeBody, scopeChosen, scopeDateLabelKey, scopeOutcomeKey } from "./series-scope";
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

  it("🔑 Save waits for a scope, and `submit` refuses without one — two guards, because one is a UI state", () => {
    expect(dialogs).toContain('disabled={mode !== "remove" && (!to || !scoped)}');
    expect(dialogs).toContain('if (mode !== "remove" && !scoped) return;');
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
