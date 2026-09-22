import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import FreelanceBudgetStrip from "@/components/partials/Calendar/FreelanceBudgetStrip";
import type { TeacherView } from "@/types/app/scheduler";
import { minorOrDash, moneyOrDash } from "./money-or-dash";

/**
 * REQ-102 (narrowed) / TASK-426/427 — the SERVER nulls every teacher DTO's four money figures for a user without
 * `action:teachers.budget-view` (the booleans stay); the FE draws `—` (never ฿0, never blank) through ONE helper,
 * keeps the not-bookable rule, and asks BOTH keys before the two budget doors. 🚫 No client masking.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const teachersPage = codeOf("src/components/partials/Teachers/TeachersContent.tsx");
const strip = codeOf("src/components/partials/Calendar/FreelanceBudgetStrip.tsx");
const controls = codeOf("src/components/partials/Teachers/FreelanceBudgetControls.tsx");
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/mock/.test(name)) out.push(p);
  }
  return out;
};
const teacher = (over: Partial<TeacherView>): TeacherView =>
  ({ id: "t1", name: "T", nickname: "T", type: "FREELANCE", active: true, bookable: true, workDays: [1, 2, 3], subjectOptions: [], monthlyIncome: 0, monthlyHours: 0, ...over }) as unknown as TeacherView;

describe("§1 — moneyOrDash, by value", () => {
  it("a figure ⇒ ฿n (th-TH grouping, whole baht); null / undefined / NaN ⇒ — ; ZERO is a figure (฿0), not a dash", () => {
    expect(moneyOrDash(1234)).toBe("฿1,234");
    expect(moneyOrDash(0)).toBe("฿0");
    expect(moneyOrDash(12.6)).toBe("฿13");
    expect(moneyOrDash(null)).toBe("—");
    expect(moneyOrDash(undefined)).toBe("—");
    expect(moneyOrDash(Number.NaN)).toBe("—");
    expect(minorOrDash(123456)).toBe("฿1,235");
    expect(minorOrDash(0)).toBe("฿0");
    expect(minorOrDash(null)).toBe("—");
  });
});

describe("§2 — every reader draws `—`; the doors ask both keys; the 57th key", () => {
  it("the walk: every `*Minor` / `hourlyRate` money PRINT in components goes through the helper — no `?? 0` before a ฿", () => {
    const files = walk("src/components");
    for (const f of files) {
      const src = codeOf(f);
      // a money print of a possibly-null figure with a ฿ and a `?? 0` is the bug this task closes (฿0 where — belongs)
      expect({ f, hit: /฿\{[^}]*(remainingMinor|budgetMinor|reorderMinor|hourlyRate)[^}]*\?\?\s*0/.test(src) }).toEqual({ f, hit: false });
    }
    expect(teachersPage).toContain("{moneyOrDash(teacher.hourlyRate)}");
    expect(teachersPage).toContain("{minorOrDash(remainingMinor)}");
    expect(teachersPage).toContain("/ {minorOrDash(budgetMinor)}");
    expect(strip).toContain("{minorOrDash(teacher.remainingMinor)}");
    expect(strip).toContain("/ {minorOrDash(teacher.budgetMinor)}");
  });
  it("the Teachers page: the block shows for every FREELANCER (masked ⇒ —, never hidden, never ฿0); the badge/override from the booleans; no masking of its own", () => {
    expect(teachersPage).toContain('const hasBudget = teacher.type === "FREELANCE" || remainingMinor != null || budgetMinor != null;');
    expect(teachersPage).toContain("const reached = rawOver || !!teacher.overLimit;");
    expect(teachersPage).not.toMatch(/budget-view[^\n]*\?[^\n]*null/); // the server nulls; the FE never does
    expect(teachersPage).not.toContain("bahtOfSatang(remainingMinor ?? 0)");
  });
  it("the strip (rendered): masked figures ⇒ a grey `— / —` strip; real figures ⇒ the tone and the numbers; a non-freelancer ⇒ nothing", () => {
    const masked = render(h(FreelanceBudgetStrip, { teacher: teacher({ remainingMinor: undefined, budgetMinor: undefined }) }));
    expect(masked).toContain('data-budget-tone="masked"');
    expect(masked.replace(/<[^>]+>/g, "")).toContain("— / —");
    expect(masked).not.toContain("฿0");
    const live = render(h(FreelanceBudgetStrip, { teacher: teacher({ remainingMinor: 80000, budgetMinor: 100000 }) }));
    expect(live).toContain('data-budget-tone="green"');
    expect(live.replace(/<[^>]+>/g, "")).toContain("฿800 / ฿1,000");
    const fullTime = render(h(FreelanceBudgetStrip, { teacher: teacher({ type: "FULL_TIME" }) }));
    expect(fullTime).not.toContain("data-budget-tone");
  });
  it("the doors need BOTH keys (hidden, never disabled); the 57th key sits after `teachers.budget`; no `override ?? default`-style masking anywhere", () => {
    expect(controls).toContain('if (!can("action:teachers.budget") || !can("action:teachers.budget-view")) return null;');
    expect(controls).not.toMatch(/disabled=\{[^}]*budget/);
    expect(ACTION_KEYS_SNAPSHOT.indexOf("action:teachers.budget-view")).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:teachers.budget") + 1);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59) /* TASK-427 + TASK-429 + TASK-432: budget-view, other-cancel-all, coach-rate */;
    // the not-bookable rule is untouched: booleans only
    expect(codeOf("src/lib/scheduler/teacher.ts")).toContain("bookable: teacher.active && !overLimit && !teacher.setupIncomplete,");
  });
});
