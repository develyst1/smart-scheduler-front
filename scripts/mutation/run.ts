// The driver: measure a baseline, then for each mutation — apply, run, restore, check. It decides nothing itself; every
// verdict comes from `verdict.ts`. See README.md -> THE VERDICT RULE.
//
//   bun run mutation:run -- --tests "src/lib/a.test.ts src/b.dom.test.tsx" --mutations scripts/mutation/example.json
//
// Each mutation's files are restored from memory and checked byte-for-byte, and the whole tree's checksum is compared before
// and after the entire pass. A restore that fails exits non-zero and says which file.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, runAndClassify, type Verdict } from "./verdict";

interface Edit {
  from: string;
  /** Empty string deletes the matched text. */
  to: string;
}
interface FileMutation {
  file: string;
  edits: Edit[];
}
interface Mutation {
  id: string;
  what: string;
  files: FileMutation[];
}

const ROOT = resolve(import.meta.dirname, "..", "..");

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const md5 = (p: string): string => createHash("md5").update(readFileSync(p)).digest("hex");

/** Every file under the directories a mutation could possibly touch, hashed in a stable order. */
const treeChecksum = (): string => {
  const h = createHash("md5");
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(name).update(md5(p));
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "scripts"));
  return h.digest("hex");
};

/** The line endings of a file are its own: an anchor written with \n must match a CRLF file, and the file must stay CRLF. */
const toFileEol = (text: string, source: string): string =>
  source.includes("\r\n") ? text.split("\r\n").join("\n").split("\n").join("\r\n") : text;

const main = (): void => {
  const tests = (arg("tests") ?? "").trim().split(/\s+/).filter(Boolean);
  const mutationsPath = arg("mutations");
  const timeoutMs = Number(arg("timeout") ?? 600_000);
  if (tests.length === 0 || !mutationsPath) {
    console.error('usage: --tests "<test files>" --mutations <file.json> [--baseline N] [--timeout ms]');
    process.exit(2);
  }

  const mutations = JSON.parse(readFileSync(resolve(ROOT, mutationsPath), "utf8")) as Mutation[];
  const treeBefore = treeChecksum();
  console.log(`TREE ${treeBefore}`);
  console.log(`TESTS ${tests.join(" ")}`);

  // Rule 4: the baseline is measured on the same test set, unmutated, and must itself be a clean result.
  let baseline = Number(arg("baseline") ?? NaN);
  if (!Number.isFinite(baseline)) {
    const first = runAndClassify({ tests, cwd: ROOT, timeoutMs }, 0);
    if (first.verdict.kind !== "SURVIVED") {
      console.error(`BASELINE is not clean: ${describe(first)}  -> no mutation is run.`);
      process.exit(1);
    }
    baseline = first.verdict.pass;
    console.log(`BASELINE ${baseline} pass / 0 fail  (${first.bytes} B printed by a GREEN run)`);
  } else {
    console.log(`BASELINE ${baseline} pass (given)`);
  }

  const rows: Array<{ id: string; what: string; line: string; kind: Verdict["kind"] | "NOT RUN" }> = [];

  for (const m of mutations) {
    const originals = new Map<string, string>();
    let skip = "";

    for (const f of m.files) {
      const p = resolve(ROOT, f.file);
      const source = readFileSync(p, "utf8");
      originals.set(p, source);
      let next = source;
      for (const e of f.edits) {
        const from = toFileEol(e.from, source);
        const hits = next.split(from).length - 1;
        if (hits !== 1) {
          skip = `${hits === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${hits} hits)`} in ${f.file}`;
          break;
        }
        next = next.replace(from, toFileEol(e.to, source));
      }
      if (skip) break;
      writeFileSync(p, next);
    }

    if (skip) {
      for (const [p, source] of originals) writeFileSync(p, source);
      rows.push({ id: m.id, what: m.what, line: skip, kind: "NOT RUN" });
      console.log(`\n${m.id} ${m.what}\n  ${skip} -> nothing was run`);
      continue;
    }

    try {
      const outcome = runAndClassify({ tests, cwd: ROOT, timeoutMs }, baseline);
      rows.push({ id: m.id, what: m.what, line: describe(outcome), kind: outcome.verdict.kind });
      console.log(`\n${m.id} ${m.what}\n  ${describe(outcome)}`);
    } finally {
      for (const [p, source] of originals) {
        writeFileSync(p, source);
        if (md5(p) !== createHash("md5").update(Buffer.from(source, "utf8")).digest("hex")) {
          console.error(`RESTORE FAILED ${p}`);
          process.exit(1);
        }
      }
    }
  }

  const treeAfter = treeChecksum();
  console.log("\n| # | mutation | verdict |");
  console.log("|---|---|---|");
  for (const r of rows) console.log(`| ${r.id} | ${r.what} | ${r.line} |`);
  console.log(`\nCHECKSUM ${treeAfter === treeBefore ? "identical" : `CHANGED  ${treeBefore} -> ${treeAfter}`}`);

  const unproven = rows.filter((r) => r.kind === "NO RESULT" || r.kind === "NOT RUN");
  if (unproven.length > 0) {
    console.log(`\n${unproven.length} row(s) prove NOTHING: ${unproven.map((r) => r.id).join(", ")}`);
    console.log("Fix the reason and run them again, or report them as NO RESULT. 'Probably fine' is not a verdict.");
  }
  if (treeAfter !== treeBefore) process.exit(1);
};

main();
