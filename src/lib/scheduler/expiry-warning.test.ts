import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { canPauseBooking, canResumeBooking } from "./pause-booking";

/**
 * SPEC-076 — REQ-082's expiry EDIT (TASK-265) and REQ-084's resume RE-PLAN (TASK-287).
 *
 * 🔴 **Most rules here are ABSENCES**: the edit's save is not blocked by its warning, the resume computes none
 * of the numbers it states, and no `weekday` is sent. Absences cannot be asserted by calling a function, so
 * these read the source — the shape TASK-261 used for AC-8 and TASK-262 for the wiring.
 */

const EXPIRY_DIALOG = "src/components/partials/Bookings/EditExpiryDialog.tsx";
const RESUME_DIALOG = "src/components/partials/Bookings/DropResumeDialog.tsx";
const WARNING_COMPONENT = "src/components/common/ExpiryWarningAlert.tsx";
const PLAN_MODAL = "src/components/partials/Bookings/PlanModal.tsx";
const SERVICE = "src/services/scheduler.service.ts";

const read = (p: string) => readFileSync(p, "utf8");

// ───────────────────────── REQ-084 / TASK-287 — the resume is a RE-PLAN ─────────────────────────

describe("🔴 TASK-287 — the request body is EXACTLY { startDate, startTime }", () => {
  const service = read(SERVICE);
  const fn = service.slice(
    service.indexOf("export const resumeCourse"),
    service.indexOf("SPEC-076 / TASK-264 (REQ-082 AC-1/AC-4)"),
  );

  it("sends both fields, always — there is no empty-body path", () => {
    expect(fn).toContain("startDate: input.startDate");
    expect(fn).toContain("startTime: input.startTime");
    // `POST …/resume` with `{}` is refused server-side now: that untested second path is what produced DEF-2.
    expect(fn).not.toMatch(/resume`,\s*\{\s*\}/);
  });

  it("🔴 sends NO `weekday` — zod would strip it silently and the form would look right", () => {
    // The TASK-215 failure mode: three fields go, one vanishes, nothing errors. The server derives the weekday
    // from the date with the same line course creation uses, so two fields cannot contradict each other.
    //
    // ⚠️ Asserted on the PAYLOAD, not on whole files: both the service and the dialog carry comments that say
    // *why there is no weekday*, and that prose is exactly what should survive — a test that forbade the word
    // would delete its own explanation.
    const payload = fn.slice(fn.indexOf("await api.post"), fn.indexOf("return data"));
    expect(payload).toContain("startDate");
    expect(payload).not.toContain("weekday");

    const dialog = read(RESUME_DIALOG);
    const call = dialog.slice(dialog.indexOf("resume.mutateAsync"), dialog.indexOf("notify({ title: t(\"endCourse.resumeDone\")"));
    // 🔑 TASK-341 — a POSITIVE over `call` ITSELF, not over `dialog`. Without it, either anchor moving empties
    // the slice and `not.toContain("weekday")` passes on `""` — the assertion reporting success for having
    // looked nowhere. ⚠️ Deliberately the two fields the call must SEND rather than `length > 0`: that also
    // proves this is the RIGHT region, so a slice landing on other code fails too.
    expect(call).toContain("startDate");
    expect(call).toContain("startTime");
    expect(call).not.toContain("weekday");
    // And no day picker was built: the DATE carries the weekday.
    expect(dialog).not.toContain("course.weekday");
  });

  it("sends no `expiryDate` — the expiry is derived now", () => {
    expect(fn).not.toContain("expiryDate");
  });
});

describe("🔑 TASK-287 §2 — the confirmation STATES what the re-plan did, and computes none of it", () => {
  const src = read(RESUME_DIALOG);

  it("renders the server's `lastSession` and `expiryDate`", () => {
    expect(src).toContain("result.lastSession");
    expect(src).toContain("result.expiryDate");
    expect(src).toContain("result.expiryExtended");
  });

  it("🚫 derives neither date — no arithmetic on the response", () => {
    /**
     * 🔴 TASK-341 §3 — **this region used to END at `src.indexOf("TASK-287 §1")`: a task reference in PROSE.**
     *
     * ⇒ a tidy-up removing a stale comment would have **silently emptied the slice**, and with only negatives
     * inside it the test would have stayed green. ⚠️ **That is the exact failure this positive guards against,
     * arriving through the door three tasks have proved is open** — a comment not surviving.
     *
     * ✅ **Re-anchored to CODE, which is strictly better than arguing to keep the comment:** the panel is the
     * JSX branch from `result ? (` to the `) : (` that closes it, so the boundary is the *structure* the rule
     * is about. 📌 The end is searched FROM the start — `) : (` also appears earlier at the drop/reason
     * branch, so a bare `indexOf` would have silently taken the wrong one.
     */
    const panelStart = src.indexOf("result ? (");
    const panel = src.slice(panelStart, src.indexOf(") : (", panelStart));
    // 🔑 The positive is over `panel` itself and names what the panel IS — the re-plan summary — so an empty
    // or misplaced slice fails here rather than passing quietly below.
    expect(panel).toContain("endCourse.resumeCreated");
    // The screen may FORMAT a date; it must not compute one. `dayjs(...).add(...)` here would be a second
    // opinion about where the course ends, and the server already has the answer.
    expect(panel).not.toContain(".add(");
    expect(panel).not.toContain("dayjs(");
  });

  it("says the expiry MOVED as its own sentence, separate from 'unchanged'", () => {
    // Two strings rather than one hedged one: an expiry that shifts silently is exactly what REQ-082's audit
    // trail exists to make answerable, so the moved case has to read as a statement, not a maybe.
    for (const lang of ["en", "th"] as const) {
      expect(typeof dictionaries[lang].endCourse.resumeExpiryMoved).toBe("string");
      expect(typeof dictionaries[lang].endCourse.resumeExpirySame).toBe("string");
      expect(dictionaries[lang].endCourse.resumeExpiryMoved).not.toBe(
        dictionaries[lang].endCourse.resumeExpirySame,
      );
    }
  });

  it("nothing blocks the admin afterwards — the only control left is Close", () => {
    expect(src).toContain('t(result ? "common.close" : "common.cancel")');
    expect(src).toContain("{!result && (");
  });
});

describe("🧹 TASK-287 §6 — the EXPIRY_REQUIRED handler is DELETED", () => {
  it("is gone from the dialog and from the mock", () => {
    // ⛔ Removed from the backend entirely, so a handler for it is a path nobody can test. The comment that
    // replaced it says why, so the next reader does not restore it from the git history.
    expect(read(RESUME_DIALOG)).not.toContain('e.code === "EXPIRY_REQUIRED"');
    expect(read(RESUME_DIALOG)).not.toContain("setNeedsExpiry");
    expect(read("src/services/scheduler.mock.service.ts")).not.toContain("EXPIRY_REQUIRED");
  });
});

describe("✅ TASK-287 §6 — the control is back ON, both faces", () => {
  const src = read(PLAN_MODAL);

  it("the flag is true", () => {
    expect(src).toContain("const COURSE_PAUSE_RESUME_ENABLED = true;");
  });

  it("both faces still read the SAME flag, so they cannot return by halves", () => {
    expect((src.match(/COURSE_PAUSE_RESUME_ENABLED &&/g) ?? []).length).toBe(2);
  });
});

// ───────────────────────── REQ-082 / TASK-265 — the expiry EDIT, unchanged ─────────────────────────

describe("REQ-082's expiry edit still warns, and still does not act", () => {
  const src = read(EXPIRY_DIALOG);

  it("AC-4 — the save is disabled only for a missing date, never by the warning", () => {
    expect(src).toContain("disabled={!course || !expiry}");
    expect(src).not.toMatch(/disabled=\{[^}]*warn/);
  });

  it("the warning is rendered from the response, computing nothing", () => {
    const warn = read(WARNING_COMPONENT);
    expect(warn).toContain("warning.outsideCount");
    expect(warn).not.toMatch(/\.filter\([^)]*date\s*[<>]/);
    expect(warn).not.toContain("dayjs(");
  });

  it("🔑 `ExpiryWarningAlert` is KEPT — with exactly one caller, deliberately", () => {
    // TASK-287 took the resume away from it: the resume's expiry is derived from its own sessions, so the
    // condition it reported cannot occur. The EDIT still has the question — it takes a date the admin chose
    // and has nothing to infer from. ⇒ one caller by reason, not by neglect.
    expect(src).toContain("<ExpiryWarningAlert");
    expect(read(RESUME_DIALOG)).not.toContain("ExpiryWarningAlert");
  });
});

// ───────────────────────── the things that must not have moved ─────────────────────────

describe("🔑 REQ-076's BOOKING pause tray is untouched — a different feature that shares a word", () => {
  it("its predicate still answers for itself", () => {
    expect(canPauseBooking({ bookingType: "SINGLE_SESSION", status: "CONFIRMED" })).toBe(true);
    expect(canResumeBooking({ status: "PAUSED" })).toBe(true);
  });

  it("no booking-side file knows about the course flag", () => {
    for (const file of [
      "src/components/partials/Calendar/PausedTray.tsx",
      "src/components/partials/Calendar/CalendarContent.tsx",
      "src/components/partials/Calendar/Modal/BookingModal.tsx",
      "src/lib/scheduler/pause-booking.ts",
    ]) {
      expect(read(file)).not.toContain("COURSE_PAUSE_RESUME_ENABLED");
    }
    expect(read("src/components/partials/Calendar/CalendarContent.tsx")).toContain("<PausedTray");
  });
});
