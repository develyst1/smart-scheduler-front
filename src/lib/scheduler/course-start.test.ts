import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { canOfferStartChange, expirySetByHand, forecastMoves, startChangeBody, startChangeWarnings } from "./course-start";
import { dictionaries } from "@/lib/i18n/dictionaries";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const dialog = codeOf("src/components/partials/Bookings/ChangeStartDateDialog.tsx");
const card = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const course = (over: Record<string, unknown> = {}) => ({ usedSessions: 0, status: "ACTIVE", ...over }) as never;

describe("TASK-571 — the door, and what it deliberately does NOT decide", () => {
  it("offered on a course with nothing taught; hidden where it certainly cannot work", () => {
    expect(canOfferStartChange(course())).toBe(true);
    expect(canOfferStartChange(course({ usedSessions: 1 }))).toBe(false);
    expect(canOfferStartChange(course({ status: "CANCELLED" }))).toBe(false);
    expect(canOfferStartChange(course({ status: "COMPLETED" }))).toBe(false);
    // a DROPPED (paused) course still shows the door: the server's writable gate refuses it in its own words
    expect(canOfferStartChange(course({ status: "DROPPED" }))).toBe(true);
  });

  it("🚫 the server's “not started” rule is NOT re-implemented here — a second copy is how the two come to disagree", () => {
    const rule = codeOf("src/lib/scheduler/course-start.ts");
    // 📌 TASK-574 NARROWED this: it forbade every `.filter(`, and `forecastMoves` filters **the server's own answer** —
    // which is reading a result, not deciding a rule. What it MEANS is *no date arithmetic and no notion of “today”*, and
    // that is what it now says. 🔑 The dangerous thing was always a second definition of “not started”, not a filter.
    expect(rule).not.toMatch(/today|new Date|dayjs|addWeek|\+ 7/);
    expect(rule).not.toContain("plannedAtCreation");
    // and the one filter that exists reads the answer's own `from`/`to`, nothing else
    expect(rule).toContain("(f?.moves ?? []).filter((m) => m.from !== m.to)");
  });

  it("the body is one field — the admin's answer, never a default", () => {
    expect(startChangeBody("2026-11-03")).toEqual({ startDate: "2026-11-03" });
    expect(Object.keys(startChangeBody("2026-11-03"))).toEqual(["startDate"]);
  });
});

describe("TASK-571 — a hand-set expiry is a FACT we already had", () => {
  /**
   * 🔑 No BE change was needed: the system's own recomputes are recorded with a **null actor**, so a row WITH an actor is a
   * person's deliberate date — and the move is about to replace it.
   */
  it("an actor in the history means a person set it; the system's own rows do not", () => {
    expect(expirySetByHand([{ actor: "admin" }])).toBe(true);
    expect(expirySetByHand([{ actor: null }])).toBe(false);
    expect(expirySetByHand([{ actor: "   " }])).toBe(false);
    expect(expirySetByHand([{ actor: null }, { actor: "porter" }])).toBe(true);
    expect(expirySetByHand([])).toBe(false);
    expect(expirySetByHand(undefined)).toBe(false);
  });

  it("🔴 the warning list always leads with the STALE-SCHEDULE window, and adds the expiry one only when earned", () => {
    expect(startChangeWarnings({ handSetExpiry: false })).toEqual(["courseStart.warnStale", "courseStart.warnExpiry"]);
    expect(startChangeWarnings({ handSetExpiry: true })).toEqual([
      "courseStart.warnStale",
      "courseStart.warnExpiry",
      "courseStart.warnHandSetExpiry",
    ]);
    // 🔑 first, always: it is the one an admin cannot see and the one that reaches a family
    expect(startChangeWarnings({ handSetExpiry: true })[0]).toBe("courseStart.warnStale");
  });
});

describe("TASK-571 — the dialog says it before AND after, and predicts nothing", () => {
  it("🔴 the warnings are rendered BEFORE the commit, not in a toast", () => {
    expect(dialog).toContain("startChangeWarnings({ handSetExpiry: handSet })");
    expect(dialog).toContain("data-start-warnings");
    // 🚫 not a toast: this dialog does not notify at all
    expect(dialog).not.toContain("notify(");
  });

  it("🔴 the reconfirm window is stated again AFTER the move, with the act that closes it", () => {
    expect(dialog).toContain('t("courseStart.reconfirmTitle", { n: result.needsReconfirm })');
    expect(dialog).toContain('t("courseStart.reconfirmBody")');
    // 🔴 And the BLOCK's own condition, because the `t(...)` calls above survive inside a dead branch: a mutation that
    // replaced the condition with `false` left them in place. 📌 It also could not be caught by the clicked test — that run
    // drowned in a Mantine `use-focus-trap` log dump and produced no summary at all (see TASK-571's report), so this pin is
    // the one that cannot be silenced by noise.
    expect(dialog).toContain("{result.needsReconfirm > 0 && (");
    expect(dialog).toContain("{result.skippedForLeave.length > 0 && (");
  });

  it("🔑 the skipped weeks come from the SERVER's answer — nothing is computed", () => {
    expect(dialog).toContain("result.skippedForLeave.map((d) =>");
    expect(dialog).toContain("data-start-skipped={result.skippedForLeave.length}");
    // by ABSENCE: no week arithmetic anywhere in the dialog
    expect(dialog).not.toMatch(/addWeek|\+ 7|week\(\)|dayjs/);
  });

  it("🚫 two guards before anything is sent, and the refusal is the server's own sentence", () => {
    expect(dialog).toContain("if (!startDate) return;");
    expect(dialog).toContain("disabled={!startDate}");
    expect(dialog).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
  });

  it("the card offers it beside the expiry control, behind the same key, and mounts ONE dialog", () => {
    expect(card).toContain("canExpiry && canOfferStartChange(c) && (");
    expect(card).toContain("onClick={() => setStartTarget(c)}");
    expect((card.match(/<ChangeStartDateDialog/g) ?? []).length).toBe(1);
  });

  it("the wire is the BE's own route, and the history read is the one fact it needs", () => {
    expect(svc).toContain("api.post<StartChangeResult>(`/courses/${courseId}/start-date`, startChangeBody(startDate))");
    expect(svc).toContain("api.get<Array<{ fromDate: string; toDate: string; actor: string | null; changedAt: string }>>(`/courses/${courseId}/expiry-history`)");
  });
});

describe("TASK-571 — the words (DRAFT, pinned by shape)", () => {
  const cs = (lang: "en" | "th") => dictionaries[lang].courseStart as unknown as Record<string, string>;

  it("every key exists in both languages, with the placeholders the code passes", () => {
    // 🔻 TASK-574 — + the forecast's five (`newStartHintCurrent`, `preview`, `forecastTitle`, `forecastRow`, `forecastCaveat`).
    // 📌 `startUnknown` stays for now: it is the em dash the card no longer uses — removed in this task, see below.
    const KEYS = ["startLabel", "edit", "title", "newStart", "newStartHint", "newStartHintCurrent", "preview", "forecastTitle", "forecastRow", "forecastCaveat", "warnStale", "warnExpiry", "warnHandSetExpiry", "confirm", "doneTitle", "expiryMoved", "skippedTitle", "reconfirmTitle", "reconfirmBody"];
    for (const lang of ["en", "th"] as const) {
      expect(Object.keys(cs(lang)).sort()).toEqual([...KEYS].sort());
      expect(cs(lang).title).toContain("{student}");
      expect(cs(lang).doneTitle).toContain("{n}");
      expect(cs(lang).doneTitle).toContain("{date}");
      expect(cs(lang).expiryMoved).toContain("{from}");
      expect(cs(lang).expiryMoved).toContain("{to}");
      expect(cs(lang).reconfirmTitle).toContain("{n}");
    }
  });

  it("🔴 the stale-schedule sentence says NOBODY is told, names who still holds the old dates, and says what to do", () => {
    const en = cs("en").warnStale.toLowerCase();
    expect(en).toContain("nobody is told");
    expect(en).toContain("family");
    expect(en).toContain("coach");
    expect(en).toContain("old dates");
    expect(en).toContain("confirm course"); // the act that closes the window
    const th = cs("th").warnStale;
    expect(th).toContain("ไม่มีการแจ้งใคร");
    expect(th).toContain("ตารางเดิม");
    expect(th).toContain("ยืนยันคอร์ส");
  });

  it("🔑 the hand-set-expiry warning says it will be REPLACED — not that it “may change”", () => {
    expect(cs("en").warnHandSetExpiry.toLowerCase()).toContain("replaces");
    expect(cs("en").warnHandSetExpiry.toLowerCase()).toContain("by hand");
    expect(cs("th").warnHandSetExpiry).toContain("แทนที่");
    expect(cs("th").warnHandSetExpiry).toContain("ตั้งวันหมดอายุไว้เอง");
  });

  it("🔑 the reconfirm body explains WHY the confirmation was cleared, and that one message goes per person", () => {
    expect(cs("en").reconfirmBody.toLowerCase()).toContain("old dates");
    expect(cs("en").reconfirmBody.toLowerCase()).toContain("one message per person");
    expect(cs("th").reconfirmBody).toContain("ตารางเดิม");
    expect(cs("th").reconfirmBody).toContain("คนละหนึ่งข้อความ");
    // 🚫 and nothing anywhere claims the move itself told anyone
    for (const lang of ["en", "th"] as const) {
      expect(cs(lang).doneTitle).not.toMatch(/notified|แจ้งแล้ว/);
    }
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8")).toContain("📝 **DRAFT (Fern, TASK-571)**");
  });
});

/**
 * 🔻 **TASK-574 — the forecast, the real date, and the two warnings that must not disagree.**
 */
describe("TASK-574 — the forecast", () => {
  it("🔑 the moves shown are the server's own, and only the ones that MOVE", () => {
    const f = {
      moves: [
        { id: "a", from: "2026-10-06", to: "2026-11-03", status: "CONFIRMED", toStatus: "PENDING" },
        { id: "b", from: "2026-10-13", to: "2026-10-13", status: "PENDING", toStatus: "PENDING" },
      ],
      expiryDate: "x",
      previousExpiryDate: "y",
      needsReconfirm: 1,
      skippedForLeave: [],
      forecast: true as const,
    };
    // a row whose date does not change is not a move — and that is the server's own `from`/`to`, not a computation
    expect(forecastMoves(f)).toEqual([{ from: "2026-10-06", to: "2026-11-03" }]);
    expect(forecastMoves(undefined)).toEqual([]);
  });

  it("🚫 the commit is unreachable until a forecast exists — two guards, as ever", () => {
    expect(dialog).toContain("if (!startDate || !forecast) return;");
    expect(dialog).toContain("disabled={!startDate || !forecast}");
    // and a new date throws the old forecast away: it described a different plan. 📌 Pinned as the DATE HANDLER's own
    // reset, not just the presence of `setForecast(null)` somewhere — the call also lives in `ask()` and `close()`, so a
    // mutation that deleted only this one left the looser pin green (and its clicked test could not finish; see the report).
    expect(dialog).toContain("onChange={(v) => {");
    const handler = dialog.slice(dialog.indexOf("onChange={(v) => {"), dialog.indexOf("valueFormat="));
    expect(handler).toContain("setStartDate(v);");
    expect(handler).toContain("setForecast(null);");
  });

  it("🔑 `forecast: true` reaches the admin in TASK-547's OWN words — one product, not two", () => {
    const en = (dictionaries.en.courseStart as unknown as Record<string, string>).forecastCaveat;
    const undo = (dictionaries.en.undo as unknown as Record<string, string>).previewForecast;
    // 📌 byte-identical on purpose: the Undo forecast and this one describe the same kind of promise
    expect(en).toBe(undo);
    const th = (dictionaries.th.courseStart as unknown as Record<string, string>).forecastCaveat;
    expect(th).toBe((dictionaries.th.undo as unknown as Record<string, string>).previewForecast);
    expect(dialog).toContain('t("courseStart.forecastCaveat")');
    // 🔻 and the dialog's hint uses the REAL current date — the pin that a mutation reverting it to the date-less hint
    // slipped past, because only the CARD was pinned for it.
    expect(dialog).toContain('t("courseStart.newStartHintCurrent", { current: formatDateDisplay(course.startDate) })');
  });

  it("✅ the em dash is gone: the card shows the REAL date, and nothing invents one", () => {
    expect(card).toContain("{c.startDate}");
    expect(card).not.toContain("courseStart.startUnknown");
    const cs = (dictionaries.en.courseStart as unknown as Record<string, string>);
    expect(cs.startUnknown).toBeUndefined();
    // the mapper carries it as sent (the literal-free pin in mapper-drops holds the rest)
    expect(codeOf("src/lib/api/mappers.ts")).toContain("startDate: row.startDate,");
  });

  it("🔑 the dialog's warning and the attention card AGREE — same state, same vocabulary", () => {
    for (const lang of ["en", "th"] as const) {
      const warn = (dictionaries[lang].courseStart as unknown as Record<string, string>).warnStale;
      const cardLabel = (dictionaries[lang].attention as unknown as { checks: Record<string, string> }).checks.courses_awaiting_reconfirm;
      expect(cardLabel.trim().length).toBeGreaterThan(0);
      // both name the OLD dates the family still holds…
      const old = lang === "en" ? /old dates/i : /ตารางเดิม/;
      expect(warn).toMatch(old);
      expect(cardLabel).toMatch(old);
      // …and the dialog names the act that ends it (the card is a list row and points at the course)
      expect(warn).toMatch(lang === "en" ? /confirm course/i : /ยืนยันคอร์ส/);
      expect(cardLabel).toMatch(lang === "en" ? /re-confirmed/i : /ยืนยันใหม่/);
    }
  });
});
