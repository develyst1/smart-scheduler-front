import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import { defaultResumeDate, resumeDefaultTime } from "./resume-defaults";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * TASK-288 — @Tanya's UI round, clicked rather than called.
 *
 * 🔴 The two defects here are **a form that asks with the wrong answer pre-filled** and **a summary that never
 * rendered**, and neither is visible from the API. That is why they were only found through the buttons.
 */

const DIALOG = "src/components/partials/Bookings/DropResumeDialog.tsx";
const PLAN_MODAL = "src/components/partials/Bookings/PlanModal.tsx";
const read = (p: string) => readFileSync(p, "utf8");

describe("🔑 §1 — the resume form opens on THIS COURSE'S slot, not the creation form's", () => {
  it("a 17:00 course defaults to 17:00 — the exact case that failed on sid", () => {
    // It came back at 10:00 because the creation form's default was reused. Right for creation (there is no
    // course yet); wrong for a re-plan (the course already has a slot, and the family already has that hour).
    expect(resumeDefaultTime("17:00")).toBe("17:00");
  });

  it("falls back to the creation default only when the slot is genuinely unknown", () => {
    expect(resumeDefaultTime(null)).toBe("10:00");
    expect(resumeDefaultTime(undefined)).toBe("10:00");
    expect(resumeDefaultTime("")).toBe("10:00");
  });

  it("the date lands on the course's own weekday, on or after today + 7", () => {
    for (let weekday = 0; weekday < 7; weekday++) {
      const d = dayjs(defaultResumeDate(weekday));
      expect(d.day()).toBe(weekday);
      // "on or after", never before: the old dates are behind us or nobody would be re-planning.
      expect(d.diff(dayjs().startOf("day"), "day")).toBeGreaterThanOrEqual(7);
      expect(d.diff(dayjs().startOf("day"), "day")).toBeLessThanOrEqual(13);
    }
  });

  it("keeps today+7 when the weekday is unknown", () => {
    expect(defaultResumeDate(null)).toBe(dayjs().add(7, "day").format("YYYY-MM-DD"));
  });

  it("the slot comes from the course's own rows, and an 'extra' cannot set it", () => {
    // A soft-linked SINGLE_SESSION (SPEC-033) can sit at any hour; letting one seed the default would move the
    // whole course to it.
    expect(read(PLAN_MODAL)).toContain('sessions.find((s) => s.bookingType !== "SINGLE_SESSION")');
    expect(read(PLAN_MODAL)).toContain("courseStartTime={courseSlot?.startTime ?? null}");
  });
});

describe("🔴 §2 — the summary dialog can actually render", () => {
  const dialog = read(DIALOG);
  const planModal = read(PLAN_MODAL);

  it("`onDone` fires only on finish — never beside `setResult`", () => {
    // 🔴 THE DEFECT: `onDone` is the plan modal's `onClose`. Calling it when the mutation returned unmounted
    // this dialog in the same tick, so the summary was set on a component that was already going away. What
    // @Tanya saw was the unmount — not a dialog that lived for under 8 seconds.
    const submit = dialog.slice(dialog.indexOf("const submit"), dialog.indexOf("const busy"));
    expect(submit).toContain("setResult(res)");
    expect(submit).not.toMatch(/setResult\(res\);\s*\n\s*onDone/);
    // The single place it is allowed:
    expect(dialog).toContain("const finish = () => {");
  });

  it("every dismissal after the act goes through finish, so the plan behind is refreshed", () => {
    expect(dialog).toContain("onClose={result ? finish : onClose}");
    expect(dialog).toContain("onClick={result ? finish : onClose}");
  });

  it("the dialog is MOUNTED only while a mode is chosen — no wrong-face fallback", () => {
    // The empty *"Pause — for — — the remaining 0 sessions"* was `mode={dropMode ?? "drop"}` rendering the
    // pause face against a plan that had already gone. No fallback, no flash — and it explains why the same
    // flash followed a pause.
    //
    // ⚠️ Asserted on the JSX only. @Sober named this exact trap in my inbox today — *"a test that forbids a
    // STRING will always catch the explanation of why the string is absent"* — and my first attempt here did
    // it again, matching the comment that documents the removal. Scope the slice; keep the prose.
    const jsx = planModal.slice(planModal.indexOf("{dropMode && ("));
    expect(jsx).toContain("mode={dropMode}");
    expect(jsx).not.toContain('dropMode ?? "drop"');
  });
});

describe("✅ §3 — @Porter's pause copy, verbatim", () => {
  it("no longer claims the course keeps its slot", () => {
    // False since the owner ruled resume to be a re-plan — and it is read at the moment an admin decides.
    expect(dictionaries.en.endCourse.dropLine).toContain(
      "Resuming re-plans the course from a date you choose — the time and the expiry date can move.",
    );
    expect(dictionaries.en.endCourse.dropLine).not.toContain("keeps its slot");
    expect(dictionaries.th.endCourse.dropLine).toContain("การกลับมาเรียนจะเป็นการวางแผนใหม่จากวันที่เลือก");
    expect(dictionaries.th.endCourse.dropLine).not.toContain("คอร์สยังเก็บช่วงเวลาเดิมไว้");
  });
});
