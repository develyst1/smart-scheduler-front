import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { isUuid } from "./units";

/**
 * TASK-450b (from Jason's TASK-450 read) — `/camp/weeks/undefined/days` reached the server on sid. The guard was
 * `enabled: !!id`, which blocks a real `undefined` but NOT the four-letter string `"undefined"`. One pure `isUuid`
 * now gates the read AND the write door (a mutation has no `enabled` at all).
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const hook = codeOf("src/hooks/scheduler/useCamp.ts");
const panel = codeOf("src/components/partials/Calendar/Modal/CampBlockPanel.tsx");

describe("§1 — isUuid, by value", () => {
  it("a uuid (either case) passes; everything a broken id can be does not — the string `undefined` above all", () => {
    expect(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
    for (const bad of ["undefined", "null", "", " ", "3f2504e0", "3f2504e0-4f89-11d3-9a0c-0305e82c33011", "not-a-uuid-at-all-really-nope-x", undefined, null, 7, {}]) {
      expect({ bad, hit: isUuid(bad) }).toEqual({ bad, hit: false });
    }
    // the old guard's blind spot, stated: `!!"undefined"` is true
    expect(!!"undefined").toBe(true);
    expect(isUuid("undefined")).toBe(false);
  });
});

describe("§2 — both doors carry it", () => {
  it("the read: `enabled: isUuid(id)` — `!!id` is gone from the days query", () => {
    expect(hook).toContain("queryFn: () => getCampWeekDays(id as string), enabled: isUuid(id)");
    expect(hook).not.toContain("getCampWeekDays(id as string), enabled: !!id");
  });
  it("the write: the block's swap door is absent without a uuid week id (hidden, never disabled) and the handler refuses too", () => {
    expect(panel).toContain("const hasWeek = isUuid(block.campWeekId);");
    expect(panel).toContain("if (!to || !hasWeek) return;");
    expect(panel).toContain('{can("action:camp.week-open") && hasWeek && !swapOpen && (');
    expect(panel).not.toMatch(/disabled=\{!hasWeek/);
  });
});
