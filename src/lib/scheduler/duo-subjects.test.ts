import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { subjectsFor } from "./duo";

/**
 * REQ-095 §13.4a / SPEC-089 A / TASK-437/438 — the DUO create's Program dropdown lists `kind === "DUO"` subjects only;
 * every other COURSE picker hides them; single-session / trial pickers untouched. The kind is the server's — 🚫 no name
 * rule anywhere (scan-pinned). Toggling DUO clears a selection that left the list.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

describe("§1 — subjectsFor, by value", () => {
  it("DUO on ⇒ DUO subjects only; off ⇒ everything else; a subject without `kind` counts as PRIVATE; order kept", () => {
    const subjects = [
      { id: "a", name: "Skate", kind: "PRIVATE" as const },
      { id: "b", name: "Duo Skate", kind: "DUO" as const },
      { id: "c", name: "Ballet" },
      { id: "d", name: "Duo Ballet", kind: "DUO" as const },
    ];
    expect(subjectsFor(subjects, true).map((s) => s.id)).toEqual(["b", "d"]);
    expect(subjectsFor(subjects, false).map((s) => s.id)).toEqual(["a", "c"]);
    expect(subjectsFor([], true)).toEqual([]);
    expect(subjectsFor([{ id: "x", name: "Duo-named but private", kind: "PRIVATE" as const }], true)).toEqual([]); // the kind, never the name
  });
});

describe("§2 — the pickers and the scan", () => {
  it("the New-course Program list follows the toggle (inside a group: the Private list); toggling clears a selection that left the list; the DUO card pricing unchanged", () => {
    expect(flow).toContain("const subjectOptions = subjectsFor(selectedTeacher?.subjectOptions ?? [], !group && duo.on);");
    expect(flow).toContain("if (subjectId && !subjectOptions.some((s) => s.id === subjectId)) setSubjectId(\"\");");
    expect(flow).toContain("}, [duo.on, subjectId, subjectOptions]);");
    expect(flow).toContain("packageForGroup(card, priceGroupFor(true, null), size)");
    // the other COURSE pickers hide DUO
    expect(codeOf("src/components/partials/Bookings/ImportBalanceModal.tsx")).toContain("subjectsFor(selectedTeacher?.subjectOptions ?? [], false)");
    expect(codeOf("src/components/partials/Bookings/CreateCourseModal.tsx")).toContain("subjectsFor(selectedTeacher?.subjectOptions ?? [], false)");
    // the single-session / trial picker on the calendar's create form is UNTOUCHED (not a course picker)
    const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
    expect(modal).not.toContain("subjectsFor(");
    // the Bookings-page filters keep every subject
    for (const f of walk("src/components/partials/Bookings").filter((p) => /BookingsTable|BookingsContent|Filters/.test(p))) expect(codeOf(f)).not.toContain("subjectsFor(");
  });
  it("🚫 no name rule anywhere in src: no `Duo`-prefix / `/duo/i` test on a subject name", () => {
    for (const f of walk("src")) {
      const src = codeOf(f);
      expect({ f, hit: /name\s*\.\s*(startsWith|includes|match|toLowerCase\(\)\s*\.(startsWith|includes))\s*\(\s*["'`\/]duo/i.test(src) || /\/duo\/i\.test\(/.test(src) }).toEqual({ f, hit: false });
    }
  });
});
