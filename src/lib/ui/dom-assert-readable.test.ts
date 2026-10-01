import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import ts from "typescript";

/**
 * 🔴 **TASK-596 — an assertion that cannot report.**
 *
 * `expect(node).toBeNull()` reads correctly and fails uselessly: when it fails, the runner prints the **received**
 * value, and a happy-dom element serializes its **entire document graph** — parents, listeners, prototype chain.
 * In TASK-595 two mutations printed **~307 MB each and were KILLED at the time limit** ⇒ the verdict was
 * **NO RESULT, not a red.** 🔑 ***An assertion whose failure message cannot be read is an assertion that cannot report.***
 *
 * ⚠️ **And it hides until it matters: a PASSING run prints nothing.** The trap appears on the one day the test is
 * needed. 📌 **I had already met this** — `line-admins.dom.test.tsx` carries a note saying a failed `toBeNull()` on a
 * node "turned one red assertion in this file into an eight-minute run before I noticed." **The knowledge existed, as
 * prose, in one file, and held nowhere else.** That is why this is a check.
 *
 * ## What this check decides, and what it cannot
 * It fails when a **node-producing expression** reaches a matcher that **prints the received value**. Both halves are
 * read from the SOURCE, so the rule is syntactic and decidable:
 * - 🔑 **The matchers are those that print `received`** on failure. `toBeTruthy()` is deliberately NOT one of them:
 *   when it fails the received value is `null`, which prints as `null`.
 * - 🔑 **A node-producing expression** is one of the shapes this repo actually uses (`querySelector`, `queryBy*`,
 *   `getBy*`, `.closest(`, `.parentElement`, …) — **unless** the expression also reads something small off it
 *   (`.length`, `.textContent`, `.getAttribute(`, …), or is negated with `!`, which makes it a boolean.
 * - One indirection is followed: a `const` in the same file whose initializer produces a node, including a helper
 *   arrow (`const saveBtn = () => document.querySelector(…)`), because that is how these tests are written.
 *
 * ⚠️ **The honest limit:** a node reached through a **function parameter**, an **imported** helper, or a value whose
 * type only the type-checker knows is NOT tracked. 🚫 I did not try to infer types here — that would need the program,
 * not the file, and a check that is *sometimes* right about types would fire on correct code. **What it enforces is
 * the shape, over the files where this class has actually bitten.**
 */

const MATCHERS_PRINTING_RECEIVED = [
  "toBeNull",
  "toBeFalsy",
  "toBeUndefined",
  "toBeDefined",
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toHaveLength",
  "toContain",
  "toContainEqual",
  "toMatchObject",
  "toBeInTheDocument",
] as const;

/** The shapes that hand back a DOM node (or a list of them) in this repo. */
const NODE_PRODUCING = [
  "querySelector(",
  "querySelectorAll(",
  "queryBy",
  "queryAllBy",
  "getBy",
  "getAllBy",
  "findBy",
  "findAllBy",
  ".closest(",
  ".parentElement",
  ".firstElementChild",
  ".lastElementChild",
  "activeElement",
] as const;

/** Reads off a node that are SMALL — the value printed is a number, a string or a boolean. */
const SMALL_READS = [
  ".length",
  ".textContent",
  ".getAttribute(",
  ".hasAttribute(",
  ".value",
  ".checked",
  ".disabled",
  ".id",
  ".className",
  ".tagName",
  ".innerHTML",
  ".outerHTML",
  ".map(",
  ".filter(",
  ".some(",
  ".every(",
  ".includes(",
] as const;

const producesNode = (text: string): boolean => {
  const t = text.trim();
  if (t.startsWith("!")) return false; // `!x` / `!!x` is a boolean, whatever x was
  if (SMALL_READS.some((s) => t.includes(s))) return false;
  return NODE_PRODUCING.some((n) => t.includes(n));
};

/** Every `expect(<node>).<matcher>` in one file, as `file:line  expect(…).matcher(…)`. Pure; the caller supplies the source. */
export const unreadableAssertions = (source: string, fileName = "x.dom.test.tsx"): string[] => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];

  /** Names whose value is a node — one indirection, same file. A helper arrow is recorded as `name()`. */
  const nodeNames = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = node.initializer.getText(sf);
      const name = node.name.getText(sf);
      if (ts.isArrowFunction(node.initializer)) {
        if (producesNode(node.initializer.body.getText(sf))) nodeNames.add(`${name}()`);
      } else if (producesNode(init)) {
        nodeNames.add(name);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.getText(sf);
      let receiver: ts.Node = node.expression.expression;
      while (ts.isPropertyAccessExpression(receiver) && receiver.name.getText(sf) === "not") receiver = receiver.expression;
      if (
        (MATCHERS_PRINTING_RECEIVED as readonly string[]).includes(matcher) &&
        ts.isCallExpression(receiver) &&
        receiver.expression.getText(sf) === "expect" &&
        receiver.arguments.length === 1
      ) {
        const argRaw = receiver.arguments[0].getText(sf).replace(/\s+/g, " ");
        const arg = argRaw.replace(/ as [A-Za-z<>|[\]. ]+$/, "").trim();
        const named = !arg.startsWith("!") && (nodeNames.has(arg) || nodeNames.has(arg.replace(/!$/, "")));
        if (producesNode(arg) || named) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          hits.push(`${fileName}:${line}  expect(${arg}).${matcher}(…)`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
};

const domTestFiles = (dir = "src"): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...domTestFiles(full));
    else if (name.endsWith(".dom.test.tsx")) out.push(full.split("\\").join("/"));
  }
  return out;
};

describe("🔴 TASK-596 — no DOM node may reach a matcher that prints what it received", () => {
  it("🔑 the whole repo: not one `.dom.test.tsx` hands a node to such a matcher", () => {
    const files = domTestFiles();
    // 🚫 A sweep over an empty list passes forever — the count is asserted first.
    expect(files.length).toBeGreaterThan(8);
    const hits = files.flatMap((f) => unreadableAssertions(readFileSync(f, "utf8"), f));
    expect(hits).toEqual([]);
  });

  /**
   * 🔑 **The check's own behaviour, on fixtures — because a sweep that currently finds nothing proves nothing about
   * what it WOULD find.** Each pair below is one true positive and the correct-code shape next to it.
   */
  it("🔑 it catches the four shapes that bit, and 🚫 stays silent on the four that are fine", () => {
    const caught = (src: string) => unreadableAssertions(src).length;

    // 1 — the original: a query straight into `toBeNull`
    expect(caught(`expect(document.querySelector("[x]")).toBeNull();`)).toBe(1);
    expect(caught(`expect(document.querySelectorAll("[x]").length).toBe(0);`)).toBe(0);

    // 2 — testing-library's query, same trap
    expect(caught(`expect(screen.queryByText(/hi/)).toBeNull();`)).toBe(1);
    expect(caught(`expect(screen.queryAllByText(/hi/).length).toBe(0);`)).toBe(0);

    // 3 — one indirection: a helper that returns a node
    expect(caught(`const btn = () => document.querySelector("[b]");\nexpect(btn()).toBeNull();`)).toBe(1);
    expect(caught(`const btn = () => document.querySelector("[b]");\nexpect(!!btn()).toBe(false);`)).toBe(0);

    // 4 — a node in a local const, compared with `toEqual`
    expect(caught(`const el = document.querySelector("[c]");\nexpect(el).toEqual(null);`)).toBe(1);
    expect(caught(`const el = document.querySelector("[c]");\nexpect(el?.textContent).toEqual("hi");`)).toBe(0);

    // 5 — negation INLINE, not through a helper: `!query(…)` is a boolean, so it is not the node it was built from.
    // 🔑 This fixture exists because the mutation that deleted the `!` escape SURVIVED without it: the helper cases
    // were already safe for another reason, so nothing in the suite was actually asking about the escape itself.
    expect(caught(`expect(!document.querySelector("[x]")).toBe(true);`)).toBe(0);
    expect(caught(`expect(!!screen.queryByText(/hi/)).toBe(false);`)).toBe(0);
    // 🚫 and the deliberate non-catch: `toBeTruthy` on a node fails with `null`, which prints as `null`
    expect(caught(`expect(document.querySelector("[x]")).toBeTruthy();`)).toBe(0);
  });

  it("📌 the line number names the assertion, so a failure can be acted on without searching", () => {
    const hits = unreadableAssertions(`// one\n// two\nexpect(screen.queryByRole("dialog")).toBeNull();\n`, "a.dom.test.tsx");
    expect(hits).toEqual([`a.dom.test.tsx:3  expect(screen.queryByRole("dialog")).toBeNull(…)`]);
  });
});
