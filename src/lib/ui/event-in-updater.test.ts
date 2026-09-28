import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **TASK-554 — the shape that killed a page twice.**
 *
 * `setX((prev) => … e.currentTarget.value …)` reads the event **inside a state updater**, and React calls that updater
 * **later**, during the render it schedules — after `executeDispatch` has nulled `currentTarget`. The page dies with
 * *"Cannot read properties of null"*.
 *
 * 🔑 **Why a test and not a comment: the rule was already written down and it still came back.** TASK-237 diagnosed this
 * in the อื่นๆ form (REQ-078 DEF-1/DEF-5), explained the mechanism in `lib/scheduler/other-booking.ts`, and stated the
 * rule in prose. **Nineteen tasks later the shop-QR page reintroduced it** — a public, unauthenticated page a parent
 * meets with no staff nearby — and Tanya found it, not us.
 * ⚠️ **It survives review because it USUALLY WORKS:** `dispatchSetState` has an eager path that runs the updater inline
 * while nothing is pending, and there the event is still alive. It is the SECOND interaction, with an update already
 * queued on the same hook, that is deferred into the render phase and finds `null`.
 *
 * ⇒ **prose could not hold this; a sweep can.** 🚫 And `e.currentTarget?.value` is not an escape: it stops the crash and
 * silently writes the wrong value, which is worse — *a tick that quietly does nothing is not reported as a bug.*
 */

const SRC = "src";
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
  }
};
walk(SRC);

/** Comments stripped: the ONE place this shape may legally appear is the prose that documents it. */
const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** `setSomething((prev…) => … e.currentTarget / e.target …)`, on one line or several. */
const LAZY_EVENT_READ = /set[A-Z]\w*\(\s*\(([^)]*)\)\s*=>[\s\S]{0,400}?\b(e|ev|event)\.(currentTarget|target)\b/g;

describe("🔴 TASK-554 — no event may be read inside a state updater", () => {
  it("the sweep is looking at the whole app (and would notice if it stopped)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.includes("ShopfrontCheckinContent"))).toBe(true);
  });

  it("🚫 not one site in `src` reads the event inside an updater", () => {
    const offenders = files.filter((f) => LAZY_EVENT_READ.test(codeOf(f))).map((f) => f.replace(/\\/g, "/"));
    // the message is the finding: a failure names the file, so the next person does not have to search for it
    expect(offenders).toEqual([]);
  });

  it("🚫 nor does any site 'rescue' it with an optional chain, which would record the wrong value silently", () => {
    const offenders = files
      .filter((f) => /\b(e|ev|event)\.(currentTarget|target)\?\./.test(codeOf(f)))
      .map((f) => f.replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("📌 the explanation stays discoverable — the prose that taught us this is still there", () => {
    // the sweep says WHAT; `other-booking.ts` says WHY, including the eager-path reason it looks correct
    const note = readFileSync("src/lib/scheduler/other-booking.ts", "utf8");
    expect(note).toContain("React nulls `event.currentTarget`");
    expect(note).toContain("read the event EAGERLY");
  });
});
