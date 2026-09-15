import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";

/**
 * TASK-362 (`REQ-089 item 1`) — advance leave on `Extended` rows, and the tick menu that toggled the wrong row.
 *
 * Contract (TASK-361): `absentWeeks` may name ANY row of the previewed plan by its 1-based position, make-ups
 * included; existence (`live rows before it < size`) and the cap are the server's. So the FE asserts three things:
 * the index is the row's POSITION with no `< size` lock, a ticked make-up renders SICK_LEAVE, and the request
 * carries the positions as-is with no client rule in front of them.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");

describe("§1 — every previewed row is tickable; the index is its position in the returned plan", () => {
  it("weekIndexOf = position + 1 for ANY row found; the `i < courseSize` lock is gone", () => {
    const fn = plan.slice(plan.indexOf("const weekIndexOf"), plan.indexOf("const planRows"));
    expect(fn).toContain("const i = sessions.findIndex((x) => x.id === s.id);");
    expect(fn).toContain("return i >= 0 ? i + 1 : 0;");
    expect(fn).not.toMatch(/courseSize|< size|summary\.size/);
    expect(plan).not.toContain("const courseSize");
  });

  it("the action is offered on every row in the plan (0 = not found only), with the same undo wording", () => {
    const region = plan.slice(plan.indexOf("absenceLabelFor={"), plan.indexOf("onCancelSession={"));
    expect(region).toContain("weekIndexOf(s) === 0");
    expect(region).toContain("absentWeeks.includes(weekIndexOf(s))");
    expect(region).not.toMatch(/makeup|EXTENDED|isMakeup/); // no client rule about what a row IS
  });

  it("a ticked make-up renders SICK_LEAVE (absent wins over makeup) and the toggle re-previews with the positions as-is", () => {
    expect(flow).toContain('status: s.absent ? "SICK_LEAVE" : s.makeup ? "EXTENDED" : "PENDING",');
    const toggle = flow.slice(flow.indexOf("const toggleAbsent"), flow.indexOf("const confirmCreate"));
    expect(toggle).toContain("[...absentWeeks, weekIndex].sort((a, b) => a - b)");
    expect(toggle).toContain("await runPreview(next);");
    expect(toggle).not.toMatch(/size|length\s*[<>]|makeup/); // 🚫 no existence rule, no cap — the server's
    // the request shape: positions on the wire, undefined when none (unchanged from SPEC-049)
    expect(flow).toContain("absentWeeks: weeks.length ? weeks : undefined,");
    expect(flow).toContain("setAbsentWeeks(p.absentWeeks ?? weeks);"); // the echo wins
    // a refusal is the server's sentence
    const preview = flow.slice(flow.indexOf("const runPreview"), flow.indexOf("const generate"));
    expect(preview).toContain('setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));');
  });
});

describe("§2 — the tick menu no longer toggles the wrong row", () => {
  it("the row menu has a click shield: `withOverlay`, above the modal (200) and below the dropdown (300)", () => {
    const menu = plan.slice(plan.indexOf("function SessionActions"), plan.indexOf("</Menu>"));
    expect(menu).toContain("withOverlay");
    expect(menu).toContain("overlayProps={{ backgroundOpacity: 0.05, zIndex: 299 }}");
    expect(menu).toContain('position="bottom-end"');
    // the ONE place — no other Menu in the plan modal
    expect((plan.match(/<Menu[\s>]/g) ?? []).length).toBe(1); // `<Menu.Item` etc. are its children
  });

  it("rendered: an OPEN menu with these props mounts a `mantine-Menu-overlay` at z 299 under its dropdown", () => {
    // How the fix was checked without a browser: render the Menu open (portal off so SSR can see it) with the
    // exact props the row menu uses, and read the overlay element and its z-index off the HTML. The overlay is
    // a full-screen `Overlay` (Mantine's fixed inset-0 element), so any tap outside the dropdown lands on it.
    const { createElement: h } = require("react") as typeof import("react");
    const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
    const { MantineProvider, Menu, ActionIcon } = require("@mantine/core") as typeof import("@mantine/core");
    const html = renderToString(
      h(
        MantineProvider,
        null,
        h(
          Menu,
          { opened: true, withinPortal: false, withOverlay: true, overlayProps: { backgroundOpacity: 0.05, zIndex: 299 }, position: "bottom-end", width: 180 },
          h(Menu.Target, null, h(ActionIcon, null, "x")),
          h(Menu.Dropdown, null, h(Menu.Item, null, "tick")),
        ),
      ),
    );
    expect(html).toContain("mantine-Menu-overlay");
    expect(html).toContain("--overlay-z-index:299;");
    expect(html).toContain("--overlay-bg:rgba(0, 0, 0, 0.05);");
    expect(html).toContain("mantine-Menu-dropdown");
  });
});
