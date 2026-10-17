import { describe, expect, it, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { CoursePreviewSession } from "@/types/app/scheduler";
import LeaveWeekNotice, { leaveWeeksOf } from "./LeaveWeekNotice";

/**
 * 🔴 **TASK-816 (REQ-123 P1) — "Generate plan" warns on a week that falls on the teacher's leave day, and ONE click ticks it.**
 *
 * 🔑 **What can go wrong without anyone seeing it:** a flagged week that shows NO warning (the admin finds out when Create refuses),
 * a click that ticks the WRONG week (the position is the row's index + 1, make-up rows included), a ticked week that keeps shouting
 * (or one that silently loses its flag), and a server that sends no flag being read as "on leave". Each is asserted by what is on
 * screen and by the number the click hands to the toggle. 📌 Every helper answers a number or a boolean, never an element.
 */

const en = dictionaries.en.plan;
const th = dictionaries.th.plan;
const teacher = { id: "t1", name: "ครูเอ", nickname: "เอ" };
const week = (date: string, extra: Partial<CoursePreviewSession> = {}): CoursePreviewSession => ({
  date,
  startTime: "10:00:00",
  teacher,
  subject: null,
  ...extra,
});

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const count = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const mount = (weeks: ReturnType<typeof leaveWeeksOf>, onTick: (w: number) => void = () => {}, pending = false) =>
  wrap(h(LeaveWeekNotice, { weeks, pending, onTick }));

afterEach(cleanup);

describe("🔴 TASK-816 — which weeks are flagged (from the SERVER's rows)", () => {
  it("🔑 only `teacherOnLeave === true` counts, and the week is the row's POSITION (index + 1)", () => {
    const rows = [week("2026-10-05"), week("2026-10-12"), week("2026-10-19", { teacherOnLeave: true }), week("2026-10-26", { teacherOnLeave: false })];
    expect(leaveWeeksOf(rows)).toEqual([{ week: 3, date: "2026-10-19", teacher: "เอ", absent: false }]);
  });

  it("🚫 a server that sends NO flag claims nothing — absent is not 'on leave'", () => {
    expect(leaveWeeksOf([week("2026-10-05"), week("2026-10-12")])).toEqual([]);
    expect(leaveWeeksOf([week("2026-10-05", { teacherOnLeave: undefined })])).toEqual([]);
  });

  it("🔑 a week already ticked as a planned absence KEEPS its flag (the server still sends it) and reads `absent: true`", () => {
    expect(leaveWeeksOf([week("2026-10-05"), week("2026-10-12", { teacherOnLeave: true, absent: true })])).toEqual([
      { week: 2, date: "2026-10-12", teacher: "เอ", absent: true },
    ]);
  });
});

describe("🔴 TASK-816 — what the admin sees", () => {
  it("nothing flagged ⇒ nothing is drawn", () => {
    mount([]);
    expect(count("[data-leave-week-notice], [data-leave-week-warn], [data-leave-week-note]")).toBe(0);
  });

  it("🔑 an UNTICKED flagged week WARNS, names the teacher and the day, and offers ONE button — the approved 'Planned absence' label", () => {
    mount([{ week: 3, date: "2026-10-19", teacher: "เอ", absent: false }]);
    expect([count("[data-leave-week-warn]"), count("[data-leave-week-note]"), count("[data-leave-week-tick]")]).toEqual([1, 0, 1]);
    expect(text()).toContain("A class falls on เอ's leave day");
    expect(text()).toContain("Mon 19/Oct/26");
    expect(document.querySelector("[data-leave-week-tick]")?.textContent).toBe(en.plannedAbsence);
    expect(en.plannedAbsence).toBe("Planned absence"); // 🔒 the button reuses the APPROVED word, no new one
    expect(th.plannedAbsence).toBe("ไม่มาแน่นอน (ลาล่วงหน้า)");
  });

  it("🔑 one click hands the toggle THAT week's position — exactly once", async () => {
    const ticked: number[] = [];
    mount(
      [
        { week: 3, date: "2026-10-19", teacher: "เอ", absent: false },
        { week: 5, date: "2026-11-02", teacher: "เอ", absent: false },
      ],
      (w) => ticked.push(w),
    );
    await userEvent.setup().click(document.querySelector('[data-leave-week-tick="5"]') as HTMLElement);
    expect(ticked).toEqual([5]);
  });

  it("🔑 a TICKED flagged week is a calm NOTE: no warning, no button — and it still says why", () => {
    mount([{ week: 3, date: "2026-10-19", teacher: "เอ", absent: true }]);
    expect([count("[data-leave-week-warn]"), count("[data-leave-week-note]"), count("[data-leave-week-tick]")]).toEqual([0, 1, 0]);
    expect(text()).toContain("is on เอ's leave day and is marked as a planned absence");
    expect(text()).not.toContain("can't be created yet");
  });

  it("the button is disabled while a re-preview is running (a second click would race the first)", () => {
    mount([{ week: 3, date: "2026-10-19", teacher: "เอ", absent: false }], () => {}, true);
    expect((document.querySelector("[data-leave-week-tick]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("✅ the three new strings exist in BOTH languages and are marked APPROVED in the dictionary", () => {
    for (const k of ["leaveWeekTitle", "leaveWeekWarn", "leaveWeekNote"] as const) {
      expect(en[k].length).toBeGreaterThan(10);
      expect(th[k].length).toBeGreaterThan(10);
    }
    expect(readFileSync("src/lib/i18n/dictionaries.ts", "utf8").split("APPROVED by the owner 2026-10-17 (REQ-123 Phase 1, TASK-816").length - 1).toBe(1);
  });
});

const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("🔴 TASK-816 — the notice is WIRED into the create flow (source pins; the clicks above prove what the notice does with them)", () => {
  const flow = code("src/components/partials/Bookings/CreatePlanFlow.tsx");

  it("🔑 every preview answer REPLACES the flagged weeks, from the server's own rows", () => {
    expect(flow).toContain("setLeaveWeeks(leaveWeeksOf(p.sessions));");
  });

  it("🔑 the button runs the SAME `toggleAbsent` as the row's own control (so the server re-previews), inside the create extras", () => {
    expect(flow).toContain("<LeaveWeekNotice weeks={leaveWeeks} pending={preview.isPending} onTick={toggleAbsent} />");
    expect(flow.indexOf("createExtras={")).toBeLessThan(flow.indexOf("<LeaveWeekNotice"));
  });

  it("🚫 the flagged weeks are cleared when the form closes — no leave warning survives into the next course", () => {
    expect(flow).toContain("setLeaveWeeks([]);");
  });

  it("🚫 the front compares NO dates to decide this — the flag is the server's one reader", () => {
    expect(code("src/components/partials/Bookings/LeaveWeekNotice.tsx")).not.toMatch(/dayjs|isBefore|isAfter|new Date/);
  });
});
