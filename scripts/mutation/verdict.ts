// THE decision, and THE way to run the tests. See README.md -> THE VERDICT RULE; that section is the rule this file obeys.
//
// Two things live here on purpose:
//   1. `classify` — the ONLY place a verdict is decided, and it reads nothing but the parsed final summary counts.
//   2. `runAndClassify` — the ONLY place the tests are launched. `bun` is spawned DIRECTLY, never through a shell: through a
//      shell a time limit kills the shell and leaves the tests running as an orphan (the third way a runner can lie —
//      @Jason found it in the backend the moment his runner left its scratchpad).

import { spawnSync } from "node:child_process";

/** 512 MiB. The capture must never be the limit — see rule 5. */
export const CAPTURE_BYTES = 512 * 1024 * 1024;

export type Verdict =
  | { kind: "BITES"; pass: number; fail: number }
  | { kind: "SURVIVED"; pass: number; fail: number }
  | { kind: "NO RESULT"; reason: string };

export interface RunOutcome {
  verdict: Verdict;
  /** How much the run printed. Reported beside the verdict so a run approaching the capture is visible (rule 5). */
  bytes: number;
}

/**
 * The final summary Bun prints, and nothing else:
 *
 *      804 pass
 *      0 fail
 *      5942 expect() calls
 *     Ran 804 tests across 86 files. [32.85s]
 *
 * The `Ran ... tests across ... files` line is required as PROOF the run reached the end: a truncated capture can easily
 * contain an earlier `N fail` line from a per-file section, and reading that instead of the summary is one of the defects
 * this rule exists to end. Counts are taken from the summary block that precedes the LAST such line.
 */
export const parseSummary = (output: string): { pass: number; fail: number } | null => {
  const lines = output.split(/\r?\n/);
  const ran = lines.reduce((found, line, i) => (/^Ran \d+ tests? across \d+ files?\./.test(line) ? i : found), -1);
  if (ran < 0) return null;

  let pass: number | null = null;
  let fail: number | null = null;
  for (let i = ran - 1; i >= 0 && i >= ran - 12; i -= 1) {
    const p = /^\s*(\d+) pass\s*$/.exec(lines[i]);
    const f = /^\s*(\d+) fail\s*$/.exec(lines[i]);
    if (p && pass === null) pass = Number(p[1]);
    if (f && fail === null) fail = Number(f[1]);
  }
  if (pass === null) return null;
  return { pass, fail: fail ?? 0 };
};

/**
 * Rule 1 and 2: a verdict comes only from the counts.
 * `baseline` is the passing count of the SAME test set with no mutation applied (rule 4).
 */
export const classify = (
  output: string,
  baseline: number,
  killed?: { reason: string },
): Verdict => {
  const counts = parseSummary(output);
  if (!counts) return { kind: "NO RESULT", reason: killed?.reason ?? "NO SUMMARY" };
  // A summary exists, so the run finished summarising even if the process was then killed: the counts are the truth.
  if (counts.fail > 0 || counts.pass < baseline) return { kind: "BITES", ...counts };
  return { kind: "SURVIVED", ...counts };
};

export interface RunOptions {
  /** Test files to run, exactly as `bun test` takes them. */
  tests: readonly string[];
  cwd: string;
  /** Milliseconds. A run that hits this is NO RESULT [KILLED] — never a bite (rule 3). */
  timeoutMs?: number;
  captureBytes?: number;
}

/** Runs `bun test <tests>` and classifies it. `baseline` of 0 means "any clean summary is enough" (used to MEASURE one). */
export const runAndClassify = (opts: RunOptions, baseline: number): RunOutcome => {
  const capture = opts.captureBytes ?? CAPTURE_BYTES;
  const r = spawnSync("bun", ["test", ...opts.tests], {
    cwd: opts.cwd,
    encoding: "utf8",
    shell: false, // never through a shell — see the note at the top of this file
    timeout: opts.timeoutMs ?? 600_000,
    maxBuffer: capture,
    windowsHide: true,
  });

  const output = (r.stdout ?? "") + (r.stderr ?? "");
  const bytes = Buffer.byteLength(output, "utf8");

  // Why the run produced no summary matters, because the reader is obliged to fix that reason and run it again.
  let killed: { reason: string } | undefined;
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOBUFS") killed = { reason: `OUTPUT OVERFLOW (> ${capture} B captured)` };
  else if (r.error && /timed? ?out|ETIMEDOUT/i.test(String(r.error.message))) killed = { reason: "KILLED (time limit)" };
  else if (r.signal) killed = { reason: `KILLED (signal ${r.signal})` };
  else if (r.error) killed = { reason: `ERROR (${r.error.message})` };

  return { verdict: classify(output, baseline, killed), bytes };
};

export const describe = (o: RunOutcome): string =>
  o.verdict.kind === "NO RESULT"
    ? `NO RESULT [${o.verdict.reason}]  (${o.bytes} B)`
    : `${o.verdict.kind}  ${o.verdict.pass} pass / ${o.verdict.fail} fail  (${o.bytes} B)`;
