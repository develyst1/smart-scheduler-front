// The mutation runner's own rule, pinned by the suite it exists to keep honest.
//
// 🔑 Why this test is in `src` and not beside the runner: `tsconfig.json` type-checks `**/*.ts` and excludes only
// `src/**/*.test.ts*`, so a test file next to `scripts/mutation/` would break `tsc`. The runner itself IS type-checked.
//
// What this pins:
//   1. `classify` never turns a missing summary, a kill or a timeout into a colour (the TASK-574 defect, and its mirror image
//      in the backend where an overflow was read as a BITE).
//   2. THE VERDICT RULE section of the README is unchanged — it is shared WORD FOR WORD with
//      `smart-scheduler-back/scripts/mutation/README.md`. 🚫 There is no shared file across the two repos on purpose: what
//      must be identical is the RULE, not the code. So the only thing that can keep them identical is a test on each side.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { classify, parseSummary } from "../../../scripts/mutation/verdict";

const summary = (pass: number, fail: number, files = 1): string =>
  ` ${pass} pass\n ${fail} fail\n 12 expect() calls\nRan ${pass + fail} tests across ${files} files. [1.00s]\n`;

describe("the mutation runner's verdict rule", () => {
  test("a clean run at the baseline SURVIVED — the tests did not notice the break", () => {
    expect(classify(summary(29, 0), 29).kind).toBe("SURVIVED");
  });

  test("a failure, or fewer passes than the baseline, BITES", () => {
    expect(classify(summary(28, 1), 29).kind).toBe("BITES");
    expect(classify(summary(20, 0), 29).kind).toBe("BITES"); // a whole file failed to load: fewer ran, none "failed"
  });

  test("🔴 no summary is NO RESULT, never a pass — the TASK-574 defect, at the one place that decides", () => {
    const overflowed = "a".repeat(4000) + "\n 3 fail\n"; // a truncated capture can easily hold a stale count
    const v = classify(overflowed, 29, { reason: "OUTPUT OVERFLOW (> 1048576 B captured)" });
    expect(v.kind).toBe("NO RESULT");
    if (v.kind === "NO RESULT") expect(v.reason).toContain("OUTPUT OVERFLOW");
  });

  test("🔴 a timeout is NOT a bite", () => {
    expect(classify("", 29, { reason: "KILLED (time limit)" }).kind).toBe("NO RESULT");
  });

  test("🚫 an earlier `N fail` is NOT the summary — the proof-of-completion line is required first", () => {
    expect(parseSummary("src/x.test.ts:\n 1 fail\n(fail) something\n")).toBeNull();
    expect(parseSummary(summary(29, 0))).toEqual({ pass: 29, fail: 0 });
  });

  test("the counts win over the kill: a run that summarised and was then killed still has a verdict", () => {
    expect(classify(summary(28, 1), 29, { reason: "KILLED (signal SIGTERM)" }).kind).toBe("BITES");
  });
});

describe("THE VERDICT RULE is shared with the backend runner, word for word", () => {
  const readme = readFileSync(`${import.meta.dir}/../../../scripts/mutation/README.md`, "utf8");
  const section = readme.slice(readme.indexOf("## THE VERDICT RULE"));
  const rule = section.slice(0, section.indexOf("\n---") + 4).split("\r\n").join("\n");

  test("🔑 unchanged — if this fails, the backend's copy must change in the SAME breath", () => {
    // Taken from `smart-scheduler-back/scripts/mutation/README.md` (TASK-576), CR stripped so a checkout's line endings
    // cannot fake a difference. 🚫 Do NOT re-baseline this hash to make the test pass: change both repos, or change neither.
    expect(createHash("md5").update(rule).digest("hex")).toBe("e781797c904a07e44b1aaf7966c7f45f");
  });

  test("and it still SAYS the five things, so a rewrite cannot pass by keeping the hash's shape", () => {
    expect(rule).toContain("A verdict comes ONLY from the test run's parsed FINAL summary counts");
    expect(rule).toContain("There are exactly three verdicts:");
    expect(rule).toContain("NO RESULT is never a colour.");
    expect(rule).toContain("The baseline is measured, on the same test set, with no mutation applied");
    expect(rule).toContain("The capture must not be the limit.");
    expect(rule).toContain("What NO RESULT obliges the reader to do");
    expect(rule).toContain('"It is probably fine" is not an option.');
  });
});
