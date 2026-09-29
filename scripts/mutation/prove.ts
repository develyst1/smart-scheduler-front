// The rule, proven on REAL runs — not on strings handed to `classify`.
//
//   bun run mutation:prove
//
// Fixtures are written to a fresh temp directory and run with that directory as the cwd, so this suite's own preload and
// config are not involved and nothing is ever written into `src`. Exits non-zero if any case answers wrongly.
//
// The five cases are the five ways the FE runner has lied or could lie:
//   >1 MiB of output with a failing test  -> BITES      (the overflow that faked ten greens in TASK-574)
//   >1 MiB of output, everything passing  -> SURVIVED   (the same size must NOT read as a bite either)
//   a capture smaller than the output     -> NO RESULT [OUTPUT OVERFLOW]
//   a run killed by the time limit        -> NO RESULT [KILLED]    (a timeout is not a bite)
//   a run that prints no summary          -> NO RESULT [NO SUMMARY](an absent summary is not a pass)

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAndClassify, type Verdict } from "./verdict";

const dir = mkdtempSync(join(tmpdir(), "fe-mutation-proof-"));

/** ~1.1 MiB of output, so the run is genuinely bigger than the old 1 MiB default this rule exists to survive. */
const NOISE = `for (let i = 0; i < 1100; i += 1) console.log("x".repeat(1024));`;

const write = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};

const bigPass = write(
  "big-pass.test.ts",
  `import { test, expect } from "bun:test";\n${NOISE}\ntest("a", () => { expect(1).toBe(1); });\n`,
);
const bigFail = write(
  "big-fail.test.ts",
  `import { test, expect } from "bun:test";\n${NOISE}\ntest("a", () => { expect(1).toBe(1); });\ntest("b", () => { expect(1).toBe(2); });\n`,
);
const slow = write(
  "slow.test.ts",
  `import { test } from "bun:test";\ntest("hangs", async () => { await new Promise((r) => setTimeout(r, 60000)); }, 120000);\n`,
);
const silent = write("silent.test.ts", `process.exit(0);\n`);

interface Case {
  name: string;
  expect: Verdict["kind"];
  reason?: RegExp;
  run: () => ReturnType<typeof runAndClassify>;
}

const cases: Case[] = [
  {
    name: "> 1 MiB of output, one test failing",
    expect: "BITES",
    run: () => runAndClassify({ tests: [bigFail], cwd: dir }, 1),
  },
  {
    name: "> 1 MiB of output, every test passing",
    expect: "SURVIVED",
    run: () => runAndClassify({ tests: [bigPass], cwd: dir }, 1),
  },
  {
    name: "the capture is smaller than the output",
    expect: "NO RESULT",
    reason: /OUTPUT OVERFLOW/,
    run: () => runAndClassify({ tests: [bigPass], cwd: dir, captureBytes: 64 * 1024 }, 1),
  },
  {
    name: "the run is killed by the time limit",
    expect: "NO RESULT",
    reason: /KILLED/,
    run: () => runAndClassify({ tests: [slow], cwd: dir, timeoutMs: 3000 }, 1),
  },
  {
    name: "the run prints no summary",
    expect: "NO RESULT",
    reason: /NO SUMMARY|KILLED|ERROR/,
    run: () => runAndClassify({ tests: [silent], cwd: dir }, 1),
  },
];

let wrong = 0;
for (const c of cases) {
  const o = c.run();
  const kindOk = o.verdict.kind === c.expect;
  const reasonOk =
    !c.reason || (o.verdict.kind === "NO RESULT" && c.reason.test(o.verdict.reason));
  const got =
    o.verdict.kind === "NO RESULT" ? `NO RESULT [${o.verdict.reason}]` : `${o.verdict.kind} ${o.verdict.pass}/${o.verdict.fail}`;
  if (kindOk && reasonOk) {
    console.log(`ok    ${c.name}  ->  ${got}  (${o.bytes} B)`);
  } else {
    wrong += 1;
    console.log(`WRONG ${c.name}  ->  ${got}  (expected ${c.expect}${c.reason ? ` ${c.reason}` : ""})`);
  }
}

console.log(`\nfixtures: ${dir}`);
if (wrong > 0) {
  console.error(`${wrong} case(s) wrong — THE RULE IS NOT HOLDING. Do not trust a table produced by this runner.`);
  process.exit(1);
}
console.log("all five cases hold.");
