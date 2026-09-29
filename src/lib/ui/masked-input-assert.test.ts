import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * 🔴 **TASK-559 → TASK-563 → TASK-567 — typing into a MASKED input and believing the screen.**
 *
 * The camp rate box test typed into Mantine's `NumberInput`, read the input's own `.value`, and passed. **It passed with
 * the save handler emptied**, because under happy-dom the typed characters sit in the DOM node whether or not the
 * component's state — and therefore the request — ever received them. ⇒ **the test proved the keystrokes happened, not
 * that the number landed.**
 *
 * 🔑 **Why a sweep and not a note.** We have now written this rule down twice — TASK-559's report and TASK-563's survey —
 * and enforced it once. **A rule half-kept is exactly the shape that let TASK-237's defect come back nineteen tasks later
 * in TASK-554.** *A defect written down in prose is not prevented.*
 *
 * **What the rule is:** a `.dom.test.tsx` that **types into a masked control** must assert something the OTHER SIDE reads
 * — the request, the mutation body, a callback — and not only what the screen shows. 🚫 It may not rest on `.value`,
 * `toHaveValue`, `textContent` or `innerHTML` alone.
 */

/**
 * 🔑 **The masked set. Adding one is ONE LINE — and every line carries its reason, because a list without reasons is a
 * list the next person deletes.**
 *
 * ⚠️ **What "masked" means here (TASK-563's rule): the control keeps DISPLAY state of its own**, so the text in the DOM
 * node and the value the component committed are two different things that can disagree.
 */
const MASKED = [
  {
    control: "NumberInput",
    why: "formats and re-parses as you type (thousands separators, clamping, decimals); the node can read 650 while the committed value is still 500 — TASK-559, measured",
  },
  {
    control: "PinInput",
    why: "renders several inputs and assembles one value; a per-keystroke read of any single box is not the value the form holds",
  },
  {
    control: "Autocomplete",
    why: "free text plus a suggestion list: what is typed and what is SELECTED are different facts, and only the selection reaches the caller",
  },
  {
    control: "TagsInput",
    why: "the text being typed is not a tag until it is committed (Enter/comma); the input's own text is the part that is NOT yet data",
  },
] as const;

/**
 * ⚠️ **The UNDECIDED set — deliberately NOT enforced.** These may well behave the same way, but nobody here has broken
 * one and watched: `Select`, `MultiSelect`, `DatePickerInput`. 🚫 **They stay out of the failing list until someone
 * mutates a test using one and reports what happened.** 🔑 *The survey refused to guess; this check must not guess
 * either — a check that cries wolf is a check somebody turns off.*
 */
const UNPROVEN = ["Select", "MultiSelect", "DatePickerInput"] as const;

/**
 * 🔴 **What counts as PROOF: an assertion that reaches INTO what the other side received.** Adding a name is one line,
 * and each carries its reason.
 *
 * ⚠️ **Asserting that a request HAPPENED is not proof of the value** — the first version of this check accepted
 * `expect(patches.length).toBeGreaterThan(0)` and therefore **stayed silent when the camp test's `…patches[0].body…`
 * assertion was deleted** (mutation M1, TASK-567: it SURVIVED). *A check that accepts "something was sent" cannot tell a
 * landed value from a lost one — which is the whole defect.*
 */
const BOUNDARY = [
  { token: "body", why: "the request body — where a committed value actually shows up" },
  { token: "payload", why: "the same thing under the name some collectors use" },
  { token: "args", why: "a spy's arguments: the value as the caller passed it, not as the DOM drew it" },
] as const;

/**
 * 🔑 **`document.body` is the SCREEN, not the wire** — the one lookalike that would let a screen-only test pass this
 * check by accident (`expect(document.body.innerHTML).toContain(…)`). It is renamed away before matching.
 */
const readsTheBoundary = (subject: string): boolean =>
  BOUNDARY.some((b) => new RegExp(`\\b${b.token}\\b`).test(subject.replace(/document\.body/g, "document.screen")));

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Every `expect(<subject>)` in the file, as source text — one per assertion.
 * 🔑 The subject runs to the `).toXxx` that closes it, **not to the first `)`**: a lazy match stops inside
 * `expect(rateBox().value)` and reads the subject as `rateBox(`, which would make this sweep silently miss the exact
 * shape it exists to catch. *The extractor IS the check; a sloppy one is a check that always passes.*
 */
const expectSubjects = (src: string): string[] =>
  src
    .split("expect(")
    .slice(1)
    .map((chunk) => {
      const end = chunk.search(/\)\s*\.\s*(?:not\s*\.\s*)?to[A-Za-z]/);
      return end === -1 ? chunk.slice(0, 200) : chunk.slice(0, end);
    });

/**
 * The component sources a dom test renders. A test imports its subject from its own directory (`./OpenWeekDialog`), so
 * those siblings are read; with no relative import named, every non-test `.tsx` beside it is read instead — **a miss
 * would make this check quieter, never louder**, which is the safe direction for a sweep.
 */
const subjectsOf = (testPath: string): string[] => {
  const dir = dirname(testPath);
  const src = readFileSync(testPath, "utf8");
  const named = [...src.matchAll(/(?:from|import\()\s*"\.\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const siblings = readdirSync(dir).filter((n) => /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n));
  const wanted = named.length > 0 ? siblings.filter((n) => named.includes(basename(n, ".tsx"))) : siblings;
  return (wanted.length > 0 ? wanted : siblings).map((n) => readFileSync(join(dir, n), "utf8"));
};

/**
 * 🔑 **THE CHECK, as a pure function of sources** — so it can be proven on fixtures rather than only on today's files.
 * Returns a reason when the file breaks the rule, `null` when it does not apply or is satisfied.
 */
export const maskedOnlyScreen = (testSource: string, componentSources: string[]): string | null => {
  const test = stripComments(testSource);
  if (!/user\.type\(|fireEvent\.change\(|\.type\(/.test(test)) return null; // nothing is typed here
  const components = componentSources.map(stripComments).join("\n");
  const hit = MASKED.find((m) => components.includes(`<${m.control}`));
  if (!hit) return null; // nothing masked on screen — a TextInput or Textarea cannot lie this way
  const proven = expectSubjects(test).some(readsTheBoundary);
  return proven ? null : `types into <${hit.control}> and asserts nothing the other side received`;
};

const SRC = "src";
const domTests: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.dom\.test\.tsx$/.test(name)) domTests.push(full);
  }
};
walk(SRC);

describe("🔴 TASK-567 — no clicked test may type into a masked input and believe the screen", () => {
  it("the sweep is looking at every `.dom.test.tsx` (and would notice if it stopped)", () => {
    expect(domTests.length).toBeGreaterThanOrEqual(8);
    // the file the rule was learned from must be in scope, or the sweep has lost its own origin
    expect(domTests.some((f) => f.includes("open-week-dialog"))).toBe(true);
  });

  it("🚫 not one of them breaks the rule — a failure NAMES the file", () => {
    const offenders = domTests
      .map((f) => ({ file: f.replace(/\\/g, "/"), why: maskedOnlyScreen(readFileSync(f, "utf8"), subjectsOf(f)) }))
      .filter((r) => r.why !== null);
    expect(offenders).toEqual([]);
  });

  it("🔑 the rule APPLIES to a real file today — a sweep with nothing in scope passes trivially", () => {
    const inScope = domTests.filter((f) => {
      const test = stripComments(readFileSync(f, "utf8"));
      const components = subjectsOf(f).map(stripComments).join("\n");
      return /user\.type\(|fireEvent\.change\(/.test(test) && MASKED.some((m) => components.includes(`<${m.control}`));
    });
    // 📌 Exactly one today: the camp week dialog, the file this rule was learned from — and it SATISFIES the rule,
    // because it asserts the PATCH body as well as the box. If this ever reaches zero, the sweep has stopped meaning
    // anything and should be re-pointed rather than left green.
    expect(inScope.map((f) => f.replace(/\\/g, "/"))).toEqual([
      "src/components/partials/Camp/open-week-dialog.dom.test.tsx",
    ]);
  });

  it("✅ it does NOT fire on the controls that cannot lie this way — proven, not assumed", () => {
    const typed = `await user.type(screen.getByRole("textbox"), "0812345678");\nexpect(box().value).toBe("0812345678");`;
    expect(maskedOnlyScreen(typed, ['<TextInput label="phone" />'])).toBeNull();
    expect(maskedOnlyScreen(typed, ["<Textarea />"])).toBeNull();
    // …and not on a test that types nothing at all
    expect(maskedOnlyScreen('await user.click(btn());\nexpect(box().value).toBe("x");', ["<NumberInput />"])).toBeNull();
  });

  it("🔴 it DOES fire on a masked input asserted screen-only, and stays quiet when the value is proven to LAND", () => {
    const screenOnly = `await user.type(rateBox(), "650");\nexpect(rateBox().value).toContain("650");`;
    expect(maskedOnlyScreen(screenOnly, ["<NumberInput />"])).toContain("NumberInput");
    const landed = `${screenOnly}\nexpect(JSON.stringify(patches[0].body)).toContain("65000");`;
    expect(maskedOnlyScreen(landed, ["<NumberInput />"])).toBeNull();
    // each masked control is caught by name, so adding one to the list really extends the sweep
    for (const m of MASKED) {
      expect(maskedOnlyScreen(`await user.type(x, "1");\nexpect(x.value).toBe("1");`, [`<${m.control} />`])).toContain(m.control);
    }
  });

  it("📌 every entry on BOTH lists carries its REASON — a list without reasons gets deleted", () => {
    for (const m of MASKED) {
      expect({ control: m.control, hasReason: m.why.length > 40 }).toEqual({ control: m.control, hasReason: true });
    }
    for (const b of BOUNDARY) {
      expect({ token: b.token, hasReason: b.why.length > 30 }).toEqual({ token: b.token, hasReason: true });
    }
  });

  it("⚠️ asserting that a request HAPPENED is not proof — only reaching into what it carried is", () => {
    const typed = `await user.type(rateBox(), "650");\nexpect(rateBox().value).toContain("650");`;
    // 🔴 The shape that made mutation M1 SURVIVE the first version of this check.
    expect(maskedOnlyScreen(`${typed}\nexpect(patches.length).toBeGreaterThan(0);`, ["<NumberInput />"])).toContain("NumberInput");
    // 🔑 …and `document.body` is the screen wearing the boundary's word
    expect(maskedOnlyScreen(`${typed}\nexpect(document.body.innerHTML).toContain("650");`, ["<NumberInput />"])).toContain("NumberInput");
    expect(maskedOnlyScreen(`${typed}\nexpect(sent[0].body).toEqual({ rate: 65000 });`, ["<NumberInput />"])).toBeNull();
  });

  it("✅ a NESTED-paren subject is read whole — a sloppy extractor cries wolf, and a sweep that cries wolf gets switched off", () => {
    // 🔻 TASK-567, mutation M4: reverting the extractor to the first `)` reads `expect(rowOf(1).body)` as `rowOf(1`,
    // loses the boundary word, and reports a file that is doing exactly the right thing. 🔑 **A false ALARM is the
    // dangerous direction for this check** — the miss it used to cause is now covered by the boundary rule instead.
    const typed = `await user.type(rateBox(), "650");\nexpect(rateBox().value).toContain("650");`;
    expect(maskedOnlyScreen(`${typed}\nexpect(rowOf(1).body).toEqual({ rate: 65000 });`, ["<NumberInput />"])).toBeNull();
    expect(maskedOnlyScreen(`${typed}\nexpect(JSON.stringify(patches[0].body)).toContain("65000");`, ["<NumberInput />"])).toBeNull();
  });

  it("🔴 §2 — the shop-front lookup's VALUE assertion is pinned, not merely present today", () => {
    // A test can be weakened by its own author, so the assertion the task asked for is pinned from OUTSIDE it.
    const shop = readFileSync("src/components/partials/Checkin/shopfront-checkin.dom.test.tsx", "utf8");
    expect(shop).toContain('?.phone).toBe("0812345678")');
    expect(shop).toContain('p.url.endsWith("/checkin/shopfront/lookup")');
  });

  it("🚫 the UNDECIDED set is named and NOT enforced — the check does not guess where the survey refused to", () => {
    const enforced = MASKED.map((m) => m.control) as readonly string[];
    for (const u of UNPROVEN) expect(enforced).not.toContain(u);
    // 🔑 Pinned BY VALUE: moving a control off this list is a DECISION (break one and watch), not an edit.
    expect([...UNPROVEN]).toEqual(["Select", "MultiSelect", "DatePickerInput"]);
    // a `Select` with a screen-only assertion is deliberately allowed to pass
    expect(maskedOnlyScreen('await user.type(x, "a");\nexpect(x.value).toBe("a");', ["<Select />"])).toBeNull();
    // and the reason it is allowed stays written down beside the list
    const self = readFileSync("src/lib/ui/masked-input-assert.test.ts", "utf8");
    expect(self).toContain("UNDECIDED set");
    expect(self).toContain("until someone");
    for (const u of UNPROVEN) expect(self).toContain(u);
  });
});
