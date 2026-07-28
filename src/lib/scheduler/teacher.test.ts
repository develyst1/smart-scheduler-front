import { test, expect } from "bun:test";
import { budgetTone } from "./teacher";

// SPEC-008 revised (TASK-032): budgetTone is display-only, banded by %-of-ceiling-used
// = (budget − remaining) / budget × 100. Values in satang. 🟢 ≤30 · 🟡 30–70 · 🔴 >70.

test("green when ≤ 30% used", () => {
  expect(budgetTone(100000, 100000)).toBe("green"); // 0% used
  expect(budgetTone(70000, 100000)).toBe("green"); // 30% used (boundary)
});

test("yellow when 30% < used ≤ 70%", () => {
  expect(budgetTone(69999, 100000)).toBe("yellow"); // just over 30%
  expect(budgetTone(50000, 100000)).toBe("yellow"); // 50% used
  expect(budgetTone(30000, 100000)).toBe("yellow"); // 70% used (boundary)
});

test("red when > 70% used (visible teachers are < 100%; full ones are hidden)", () => {
  expect(budgetTone(29999, 100000)).toBe("red"); // just over 70%
  expect(budgetTone(1, 100000)).toBe("red"); // ~99.999% used
  expect(budgetTone(0, 100000)).toBe("red"); // 100% used (defensive — normally hidden)
});

test("null (no strip) when there is no budget data", () => {
  expect(budgetTone(50000, null)).toBeNull(); // no budget
  expect(budgetTone(50000, 0)).toBeNull(); // zero budget → can't compute %
  expect(budgetTone(null, 100000)).toBeNull(); // no remaining
  expect(budgetTone(undefined, undefined)).toBeNull();
});
