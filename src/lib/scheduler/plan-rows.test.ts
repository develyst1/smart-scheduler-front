import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { visiblePlanRows } from "./plan-rows";
import type { PlanSession } from "@/types/app/scheduler";

/**
 * TASK-289 — the plan view showed a re-planned course's OLD cancelled sessions beside its new ones: **eight
 * rows for a four-session course.** Nothing underneath was wrong — the counts, the money and the new plan were
 * all correct — but no admin could read it.
 *
 * 🔑 The rule is one line, so what is worth asserting is **which rows it must NOT remove**.
 */

const row = (over: Partial<PlanSession> & { id: string }): PlanSession => ({
  date: "2026-11-03",
  startTime: "17:00",
  status: "CANCELLED",
  teacher: null,
  subject: null,
  ...over,
});

/** @Tanya's screenshot, exactly: 4 new PENDING at 10:00, beside the 4 the pause cancelled at 17:00. */
const tanyasCourse: PlanSession[] = [
  row({ id: "old-1", date: "2026-11-03", cancelledByPause: true }),
  row({ id: "old-2", date: "2026-11-10", cancelledByPause: true }),
  row({ id: "old-3", date: "2026-11-17", cancelledByPause: true }),
  row({ id: "old-4", date: "2026-11-24", cancelledByPause: true }),
  row({ id: "new-1", date: "2026-09-15", startTime: "10:00", status: "PENDING", cancelledByPause: false }),
  row({ id: "new-2", date: "2026-09-22", startTime: "10:00", status: "PENDING", cancelledByPause: false }),
  row({ id: "new-3", date: "2026-09-29", startTime: "10:00", status: "PENDING", cancelledByPause: false }),
  row({ id: "new-4", date: "2026-10-06", startTime: "10:00", status: "PENDING", cancelledByPause: false }),
];

describe("🔑 a re-planned 4-session course shows FOUR rows, not eight", () => {
  it("keeps the new plan and drops what the pause cancelled", () => {
    expect(visiblePlanRows(tanyasCourse).map((s) => s.id)).toEqual(["new-1", "new-2", "new-3", "new-4"]);
  });

  it("removes nothing at all from a course that was never paused", () => {
    const untouched = tanyasCourse.slice(4);
    expect(visiblePlanRows(untouched)).toEqual(untouched);
  });
});

describe("🔴 a HAND-cancelled session still shows — the ruling deliberately did not cover it", () => {
  it("keeps a cancelled row that a pause did not cause", () => {
    // Hiding every cancelled row was the shortcut @Sober explicitly refused: a session an admin cancelled by
    // hand is a different fact from one a pause swept, and that one has not been ruled on.
    const rows = [
      row({ id: "by-hand", status: "CANCELLED", cancelledByPause: false }),
      row({ id: "by-pause", status: "CANCELLED", cancelledByPause: true }),
    ];
    expect(visiblePlanRows(rows).map((s) => s.id)).toEqual(["by-hand"]);
  });

  it("keeps a cancelled row from a payload that predates the field", () => {
    // `cancelledByPause` is optional on the type. Absent must mean "not a pause" — showing a row we cannot
    // classify is the safe direction; hiding one would lose data on an older server.
    expect(visiblePlanRows([row({ id: "legacy" })]).map((s) => s.id)).toEqual(["legacy"]);
  });

  it("keeps every non-cancelled status untouched", () => {
    const rows = (["PENDING", "CONFIRMED", "ATTENDED", "NO_SHOW", "SICK_LEAVE", "EXTENDED"] as const).map(
      (status) => row({ id: status, status }),
    );
    expect(visiblePlanRows(rows)).toEqual(rows);
  });
});

describe("🚫 the rule reads the server's fact, and nothing else", () => {
  const file = readFileSync("src/lib/scheduler/plan-rows.ts", "utf8");
  // ⚠️ **THE CODE ONLY — never the whole file.** The doc comment above the rule has to name `CANCELLED` to say
  // which paths it deliberately does NOT match; asserted against the file, this test fails on the very sentence
  // that documents the absence it is checking for. Third time I have hit this: **a test that forbids a STRING
  // will always catch the explanation of why the string is absent.** Slice to the payload, always.
  const src = file.slice(file.indexOf("export const visiblePlanRows"));

  it("uses no date, count or status heuristic", () => {
    expect(src).toContain("cancelledByPause");
    // 🚫 The pause-cancelled rows in @Tanya's screenshot are distinguishable by eye — older dates, a different
    // time, contiguous — which is exactly what makes a heuristic here tempting and every one of those signals
    // a coincidence of that one course.
    expect(src).not.toContain("dayjs");
    expect(src).not.toContain("CANCELLED");
    expect(src).not.toMatch(/\.length\s*[<>]/);
  });

  it("🔴 the PLAN's own `sessions` are NOT filtered — only what the table is given", () => {
    // Load-bearing: after a pause EVERY row is pause-cancelled, and those rows are the only ones still carrying
    // the course's own date/time — which TASK-288's `courseSlot` default reads. Filtering `sessions` itself
    // would have re-broken last night's fix in the same file.
    const modal = readFileSync("src/components/partials/Bookings/PlanModal.tsx", "utf8");
    expect(modal).toContain("sessions={planRows}");
    expect(modal).toContain("const planRows = visiblePlanRows(sessions);");
    expect(modal).toContain("const courseSlot =");
    // The counts keep reading the whole plan.
    expect(modal).toContain('const liveSessions = sessions.filter((x) => x.status !== "SICK_LEAVE");');
    expect(modal).toContain('const pendingCount = sessions.filter((s) => s.status === "PENDING").length;');
  });
});
