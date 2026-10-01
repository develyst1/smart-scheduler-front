import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import ts from "typescript";

/**
 * 🔴 **TASK-605 — a prop a component DECLARES and never reaches.**
 *
 * A `develop` merge kept Palm's `times` and dropped our `closedWeeks` from `CalendarGrid`'s destructure **while the prop
 * type and the usage both survived.** The build failed (`Cannot find name 'closedWeeks'`) — and 🔑 **921 tests passed on
 * that tree**, because the suite does not type-check the app and **nothing asserted the grid is GIVEN the set**, only how
 * the set is derived.
 *
 * ⚠️ **The narrower defect this check is for is the one `tsc` does NOT catch.** A declared prop that is simply never
 * destructured and never read is **legal TypeScript**: the caller passes it, the component ignores it, nothing fails, and
 * the feature is silently absent. *That is the same shape as the dropped identifier, minus the one accident that made it
 * loud.* 📌 **Same family as TASK-596: a wiring with no fixture is a wiring nothing is asking about.**
 *
 * ## What it decides
 * For each file below: every member of the component's `Props` (or its inline props type) must be **reachable in the
 * component body** — destructured by name, or read as `props.x` / `p.x`.
 * - 🔑 It reads the **parsed tree**, so a prop named in a comment or a string does not count as wired.
 * - A prop deliberately declared and not read must say so with `/* unwired-on-purpose *&#47;` on its own line above it,
 *   which is a decision in the file rather than a silence.
 *
 * ⚠️ **The honest limits:** it covers the **calendar files named here**, not the whole repo — those are the files this
 * class has bitten and the ones two branches edit at once. It cannot tell whose prop is whose, so **it binds every prop
 * in these files, Palm's included**; they are all wired today, so it constrains nobody's work as it stands. And it says
 * nothing about whether a prop's VALUE is right — only that the component can see it at all.
 */

const FILES = [
  "src/components/partials/Calendar/CalendarGrid.tsx",
  "src/components/partials/Calendar/CalendarWeekGrid.tsx",
  "src/components/partials/Calendar/CampBlockCell.tsx",
] as const;

const UNWIRED_MARKER = "unwired-on-purpose";

/** The declared prop names of the default-exported component, and the names its body can actually reach. */
export const propsNotWired = (source: string, fileName = "x.tsx"): string[] => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** The default-exported function (`export default function X(…)`). */
  let fn: ts.FunctionDeclaration | undefined;
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) fn = node;
  });
  if (!fn || fn.parameters.length === 0) return [];

  const param = fn.parameters[0];

  /** The members of the props type — whether it is a named interface or written inline. */
  const members: ts.TypeElement[] = [];
  const typeNode = param.type;
  if (typeNode && ts.isTypeLiteralNode(typeNode)) members.push(...typeNode.members);
  else if (typeNode && ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText(sf);
    sf.forEachChild((node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.getText(sf) === name) members.push(...node.members);
      if (ts.isTypeAliasDeclaration(node) && node.name.getText(sf) === name && ts.isTypeLiteralNode(node.type)) members.push(...node.type.members);
    });
  }
  if (members.length === 0) return [];

  /** What the body can reach: the destructured names, plus `props.x` reads when the parameter is a plain identifier. */
  const reachable = new Set<string>();
  if (ts.isObjectBindingPattern(param.name)) {
    for (const el of param.name.elements) reachable.add((el.propertyName ?? el.name).getText(sf));
  } else if (ts.isIdentifier(param.name)) {
    const bag = param.name.getText(sf);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && node.expression.getText(sf) === bag) reachable.add(node.name.getText(sf));
      ts.forEachChild(node, visit);
    };
    visit(fn.body ?? sf);
  }

  const missing: string[] = [];
  for (const m of members) {
    if (!m.name) continue;
    const name = m.name.getText(sf);
    if (reachable.has(name)) continue;
    // an explicit decision in the file is not a silence
    if (m.getFullText(sf).includes(UNWIRED_MARKER)) continue;
    const line = sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1;
    missing.push(`${fileName}:${line}  ${name} is declared and never reached`);
  }
  return missing;
};

describe("🔴 TASK-605 — every prop the calendar grids declare is reachable in the component", () => {
  it("🔑 the files two branches edit at once: not one declared prop is unreachable", () => {
    // 🚫 a sweep over an empty list passes forever
    expect(FILES.length).toBe(3);
    const missing = FILES.flatMap((f) => propsNotWired(readFileSync(f, "utf8"), f));
    expect(missing).toEqual([]);
  });

  /** 🔑 **The check's own behaviour on fixtures** — the sweep is green today, so only these say what it WOULD catch. */
  it("🔑 it catches the merge's exact shape, and 🚫 stays silent on the three correct ones", () => {
    const caught = (src: string) => propsNotWired(src).length;

    // 1 — THE DEFECT, as the merge left it: the type and the usage survive, the destructure does not
    expect(
      caught(`interface Props { a: string; closedWeeks?: Set<string> }
export default function G({ a }: Props) { return <div>{a}{closedWeeks}</div>; }`),
    ).toBe(1);
    // …and wired again, it is silent
    expect(
      caught(`interface Props { a: string; closedWeeks?: Set<string> }
export default function G({ a, closedWeeks }: Props) { return <div>{a}{closedWeeks}</div>; }`),
    ).toBe(0);

    // 2 — the `props.x` style is wiring too
    expect(
      caught(`interface Props { a: string; b: string }
export default function G(props: Props) { return <div>{props.a}{props.b}</div>; }`),
    ).toBe(0);
    // …but only for the ones actually read
    expect(
      caught(`interface Props { a: string; b: string }
export default function G(props: Props) { return <div>{props.a}</div>; }`),
    ).toBe(1);

    // 3 — an inline props type is covered as well as a named interface
    expect(caught(`export default function G({ a }: { a: string; b?: string }) { return <div>{a}</div>; }`)).toBe(1);

    // 4 — 🔑 a prop named only in a COMMENT or a string is NOT wiring: the check reads the parsed tree
    expect(
      caught(`interface Props { a: string; b?: string }
export default function G({ a }: Props) { /* b is handled elsewhere */ return <div>{a}{"b"}</div>; }`),
    ).toBe(1);

    // 5 — and a deliberate decision, written in the file, is respected
    expect(
      caught(`interface Props {
  a: string;
  /* ${UNWIRED_MARKER} — kept for the caller's type, read by nobody yet */
  b?: string;
}
export default function G({ a }: Props) { return <div>{a}</div>; }`),
    ).toBe(0);
  });
});
