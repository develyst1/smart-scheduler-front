import { describe, expect, it } from "bun:test";
import { settingHelp } from "./setting-help";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 SPEC-048 / TASK-147 — the regression @Sober required before authorising the settings screen to show help
 * on EVERY row instead of only `type:"enum"` ones.
 *
 * The gate that was removed used to be what stopped a number row from rendering help. What stops it now is the
 * dictionary-miss check alone, so **that check is the whole safety of the change** and is asserted here rather
 * than trusted. Two failure shapes are pinned, because both would ship silently:
 *   · a row with no entry gaining a line (worst case: the raw key `settings.help.foo` on screen, the exact
 *     defect `lib/i18n/keys.test.ts` exists for, arriving from the opposite direction);
 *   · a row with an entry rendering `{n}` literally, which reads as a broken product rather than missing copy.
 */

/** The real resolver, so the test exercises `t()`'s actual miss behaviour (return the key) rather than a guess. */
const resolve = (d: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, d);

const makeT =
  (lang: "en" | "th") =>
  (key: string, vars?: Record<string, string | number>): string => {
    const hit = resolve(dictionaries[lang], key);
    const template = typeof hit === "string" ? hit : key;
    return vars
      ? template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
      : template;
  };

describe("settingHelp — a row without a dictionary entry renders NO help line", () => {
  it("returns null for a key that has no settings.help entry (the load-bearing case)", () => {
    // `teacher_change_notice_days` and `checkin_early_minutes` are real registered settings with no help copy.
    expect(settingHelp(makeT("en"), "teacher_change_notice_days", 3)).toBeNull();
    expect(settingHelp(makeT("th"), "checkin_early_minutes", 30)).toBeNull();
  });

  it("returns null — never the raw key — for a setting that does not exist at all", () => {
    const out = settingHelp(makeT("en"), "some_future_rule", 1);
    expect(out).toBeNull();
    expect(out).not.toBe("settings.help.some_future_rule");
  });

  it("leaves the rows that already had help exactly as they were (notify_on_leave)", () => {
    expect(settingHelp(makeT("en"), "notify_on_leave", "admin_only")).toBe(
      dictionaries.en.settings.help.notify_on_leave,
    );
    expect(settingHelp(makeT("th"), "notify_on_leave", "admin_only")).toBe(
      dictionaries.th.settings.help.notify_on_leave,
    );
  });
});

describe("settingHelp — the leave cut-off rows show their help, with the CONFIGURED number", () => {
  const KEYS = ["leave_cutoff_hours_fulltime", "leave_cutoff_hours_freelance"] as const;

  it("renders in both languages", () => {
    for (const key of KEYS) {
      expect(settingHelp(makeT("en"), key, 3)).toBeTruthy();
      expect(settingHelp(makeT("th"), key, 3)).toBeTruthy();
    }
  });

  it("interpolates {n} — never leaves the placeholder on screen", () => {
    for (const key of KEYS) {
      for (const lang of ["en", "th"] as const) {
        const out = settingHelp(makeT(lang), key, 3)!;
        expect(out).not.toContain("{n}");
        expect(out).toContain("3");
      }
    }
  });

  it("tracks the row's effective value rather than a hardcoded 3 (REQ-047 AC-7)", () => {
    // AC-4: staff change the cut-off to 6 and the screen must say 6 — with no deploy and no SQL.
    for (const key of KEYS) {
      const out = settingHelp(makeT("en"), key, 6)!;
      expect(out).toContain("6");
      expect(out).not.toContain("3");
    }
  });

  it("names WHICH teacher type each row governs, so the two adjacent rows do not read identically", () => {
    const [ft, fl] = KEYS.map((k) => settingHelp(makeT("th"), k, 3));
    expect(ft).not.toBe(fl);
    expect(ft).toContain("ครูประจำ");
    expect(fl).toContain("ครูฟรีแลนซ์");
  });
});
