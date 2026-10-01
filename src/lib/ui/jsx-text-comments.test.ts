import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * 🔴 **D12 (TASK-593) — a `/* … *\/` in JSX CHILDREN is TEXT, and it reached a parent's screen.**
 *
 * Two comment blocks sat in the register form between *Date of birth* and *Province*. They had been valid where they were
 * written — the expression position of a ternary — and TASK-591 removed the ternary, leaving them among a fragment's
 * children, **where JSX renders them.** Tanya found them on the form.
 *
 * 🔑 **Why no test caught it, which is the part worth enforcing against.** Our source pins read files through `codeOf`,
 * which **strips `/* … *\/` before asserting** — so a comment that had *become page text* was invisible to precisely the
 * tests that read that file. ⇒ **This check must not read the text of a file. It reads the PARSED TREE.**
 *
 * ✅ **And that is what makes it honest rather than a wolf-crier:** in the real parser a comment in JSX children is not a
 * comment at all — it is a `JsxText` node. **So the rule is exact: no `JsxText` may contain `/*` or `*\/`.** There is no
 * heuristic, no "looks like", and nothing to tune: if the parser calls it text, the browser will paint it.
 *
 * 📌 **The alternative I rejected, and why:** a line-based scan (a line starting with `/*` inside a `return (`) cannot tell
 * the expression position from the children position without parsing, so it would fail on comments that are perfectly safe
 * — *and a check that cries wolf is a check somebody switches off*, which @Sober named as the thing not to build.
 */

const SRC = "src";
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".tsx")) files.push(full);
  }
};
walk(SRC);

/** Every `JsxText` in a file whose content carries a comment marker — i.e. prose the browser would PAINT. */
export const renderedComments = (source: string, fileName = "x.tsx"): string[] => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.getText(sf);
      if (text.includes("/*") || text.includes("*/")) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        hits.push(`${fileName}:${line} ${text.trim().slice(0, 60).replace(/\s+/g, " ")}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
};

describe("🔴 TASK-593 — no developer comment may be rendered as page text", () => {
  it("the sweep is looking at every `.tsx` under `src` (and would notice if it stopped)", () => {
    expect(files.length).toBeGreaterThan(80);
    expect(files.some((f) => f.includes("RegisterContent"))).toBe(true);
  });

  it("🚫 not one JSX child in `src` contains a comment marker — a failure NAMES the file and line", () => {
    const offenders = files.flatMap((f) => renderedComments(readFileSync(f, "utf8"), f.replace(/\\/g, "/")));
    expect(offenders).toEqual([]);
  });

  it("🔴 it catches D12 itself — the exact shape that reached the parent's form", () => {
    const bad = `const A = () => (
  <div>
    {ok && <span>x</span>}
    /* §7b — a comment that is actually text */
    <Stack />
  </div>
);`;
    expect(renderedComments(bad)).toHaveLength(1);
    expect(renderedComments(bad)[0]).toContain("§7b");
  });

  it("✅ and it does NOT fire on the three places a comment is legal — proven, not assumed", () => {
    const fine = `/* a file-level comment */
const A = ({ on }: { on: boolean }) => (
  <div>
    {/* a proper JSX comment */}
    {on ? (
      /* the expression position — legal, and where D12's blocks used to live */
      <span>x</span>
    ) : null}
    <B
      /* inside an attribute list — legal */
      prop={1}
    />
  </div>
);`;
    expect(renderedComments(fine)).toEqual([]);
  });

  it("🔑 it reads the PARSED tree, not the text — which is why a comment that BECAME text cannot hide from it", () => {
    // a string that merely mentions the marker is not a comment and must not be reported
    const quoted = `const A = () => <div>{"/* not a comment */"}</div>;`;
    expect(renderedComments(quoted)).toEqual([]);
    // 🚫 and the check must not be implemented with the comment-stripping helper that hid D12 from every other pin
    const self = readFileSync("src/lib/ui/jsx-text-comments.test.ts", "utf8");
    expect(self).toContain("ts.createSourceFile");
    expect(self).toContain("ts.isJsxText");
    expect(self).not.toContain('.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "")');
  });
});
