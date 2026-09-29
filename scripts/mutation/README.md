# Mutation runner — break the code on purpose, see whether the tests notice

A **mutation** is a deliberate, small break in the source (a guard removed, a condition inverted, a sentence swapped). A test
suite that stays green when the code is broken proves nothing. This directory breaks the code, runs the tests, **restores every
file byte-for-byte**, and reports a **verdict** for each mutation.

It lives in the repo on purpose: **a tool that proves our tests are honest, kept in a session scratchpad, is a tool we silently
stop having — and its absence looks exactly like nobody having run it.**

🔴 **This repo is where the defect was found.** In TASK-574 ten mutation rows came back looking like greens because the capture
buffer was smaller than the output. The rule below is the fix, and it is shared word for word with the backend's runner
(`smart-scheduler-back/scripts/mutation/README.md`). **The rule is what must be identical across the two repos — not the code.**

---

## THE VERDICT RULE

> **This section is the rule, not documentation of the code. It is written to be copied VERBATIM into any other repo's
> mutation runner. What must be identical across repos is this rule — not a shared file.**

1. **A verdict comes ONLY from the test run's parsed FINAL summary counts** — the number of tests that passed and the number that
   failed, as the test runner prints them at the very end. Never from failure names, never from the exit code, never from
   the absence of an error, never from a signal.
2. **There are exactly three verdicts:**
   - **BITES** — the summary says at least one test failed, or fewer tests passed than the unmutated baseline. The tests
     noticed the break.
   - **SURVIVED** — the summary says no test failed and at least the baseline passed. The tests did NOT notice the break.
   - **NO RESULT** — there is no summary to read: the output overflowed its capture, the run was killed, it timed out, or it
     crashed before summarising. It always carries its **reason**.
3. **NO RESULT is never a colour.** It is not a pass and it is not a bite. **A timeout is not a bite. An absent summary is not
   a pass.**
4. **The baseline is measured, on the same test set, with no mutation applied — and it must itself be a clean result**
   (a summary, zero failures). A dirty or absent baseline means no mutation is run at all.
5. **The capture must not be the limit.** Output is captured with a buffer far larger than any real run (here 512 MiB); a
   run's size is reported beside its verdict, so one approaching the limit is visible before it becomes a NO RESULT.

### What NO RESULT obliges the reader to do

**Nothing about that mutation is known.** You must NOT report it as caught, and you must NOT report it as survived. You must:

- **fix the reason and run it again** — a bigger capture for OUTPUT OVERFLOW, a longer limit or a fix for a hang for KILLED,
  the crash for ERROR — **until it yields counts**; or
- **report it as NO RESULT, with the reason**, and treat that break as **unproven**.

**"It is probably fine" is not an option.** Both ways of getting this wrong have happened here (TASK-575): one runner read a
lost summary as GREEN (a failing run called a pass); another read the kill signal of an overflow as "hung" and so as a BITE —
**proven to call a run where every test passed "caught"**. Both were false reassurance.

---

## Why rule 5 matters MORE on the front end than on the back — measured, 2026-09-30

Bun prints almost nothing for a passing test, so a backend suite of 3,600 tests prints **19 KB** when it is green. That is not
true here, because a component test runs a real DOM and **the libraries under test print**:

| run | bytes printed, GREEN |
|---|---|
| the whole suite, 804 tests across 86 files | **6,934,518** |
| the same suite minus ONE file (`change-start-date.dom.test.tsx`) — 795 tests across 85 files | **542** |
| that one file alone, 9 tests, all passing | **6,164,017** |

**One file is 99.99% of the output**, and none of it is ours: Mantine's `use-focus-trap` cannot find a focusable element in a
modal under happy-dom and **prints the entire DOM node** — ~513 KB, 12 times in 9 tests. 🔑 **So on this side a GREEN run can
exceed the old 1 MiB default by sevenfold, and one noisy dependency warning can put any future table over the edge.**

📌 **The keeper: on the front end the size of the output has nothing to do with how many tests failed.** Rule 5 is not a
precaution here; it is the difference between a table and a fiction.

---

## Use

```bash
bun run mutation:run -- --tests "src/lib/x.test.ts src/components/y.dom.test.tsx" --mutations scripts/mutation/example.json
```

`--baseline N` skips measuring one; `--timeout ms` changes the time limit (default 600000).

`mutations.json` — a list; each mutation may edit several files, and each edit's `from` must match **exactly once** (otherwise
the row says `ANCHOR MISSING` / `ANCHOR AMBIGUOUS` and **nothing is run**, which is a NOT RUN row, not a verdict):

```json
[
  { "id": "S1", "what": "the commit no longer needs a forecast", "files": [
    { "file": "src/components/partials/Bookings/ChangeStartDateDialog.tsx",
      "edits": [ { "from": "if (!startDate || !forecast) return;", "to": "if (!startDate) return;" } ] } ] }
]
```

Anchors are written with `\n`; a file that is CRLF on disk is matched and rewritten as CRLF, so a table does not silently
become a line-ending change. Every mutation's files are restored from memory and **re-read from disk to check**, and the
checksum of the whole `src` + `scripts` tree is compared before and after the pass (`CHECKSUM identical`, otherwise the run
exits non-zero).

```bash
bun run mutation:prove
```

Proves the rule on **real** runs — fixtures written to a temp directory, run with that directory as the cwd, never into `src`:
`> 1 MiB with a failing test ⇒ BITES` · `> 1 MiB all passing ⇒ SURVIVED` · `a capture smaller than the output ⇒ NO RESULT
[OUTPUT OVERFLOW]` · `killed by the time limit ⇒ NO RESULT [KILLED]` · `no summary ⇒ NO RESULT [NO SUMMARY]`. Exits non-zero if
any case answers wrongly.

## Files

| file | job |
|---|---|
| `verdict.ts` | **THE decision** (`classify`, from the parsed final summary only) and **THE way to run the tests** (`runAndClassify` — `bun` spawned directly, `shell: false`, because through a shell a time limit kills the shell and leaves the tests running as an orphan) |
| `run.ts` | the driver: measure the baseline · apply · run · restore · check · report, with the tree checksum |
| `prove.ts` | the rule, proven on real runs |
| `example.json` | the shape of a mutation list (TASK-574's first two, as an example) |

**The summary is found by its `Ran N tests across M files.` line, and the counts are read from the block above it.** A
truncated capture can easily contain an earlier `N fail` from a per-file section; reading that instead of the final summary is
one of the ways a runner lies, so the proof-of-completion line is required before any count is believed.

## What was deliberately NOT moved here

- **The per-task runners** (`mut532` … `mut574`, one per task, in session scratchpads). Each was one task's scaffolding: a
  hard-coded test list and an inline mutation list. **The mutations themselves are recorded in each TASK's report**, which is
  where they belong.
- **Their decision rules — on purpose.** They read failure NAMES out of the output and treated "no name found" as a pass.
  That is precisely the defect this rule ends; preserving it would preserve the defect.
- **Historical tables are not re-run.** The size of the output is what decides which tables could have been affected, and on
  this side it is not gradual: the noise arrived with **one file in TASK-571**. Before that file existed the whole suite printed
  well under a kilobyte, so no earlier FE table can have overflowed. The reasoning and the affected list are in TASK-572's
  report; re-running a table needs a reason, not a principle.
