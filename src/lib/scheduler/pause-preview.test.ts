import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "bun:test";

/**
 * TASK-291 — **the pause dialog said 9 and the pause cancels 4.**
 *
 * The dialog counted `sessions.filter(x => x.status !== "SICK_LEAVE")`; the server cancels `endableSessions`,
 * i.e. `PENDING · CONFIRMED · EXTENDED`. 📌 **An EXCLUSION list on the screen against an INCLUSION list on the
 * server** — they agreed while every row was live and diverged the moment anything was cancelled. So the number
 * was wrong about **the act**, not merely about the list under it, in the sentence the admin acts on.
 *
 * 🔑 There is no rule to extract here: the fix is that the front end **stops having a rule** and reads the
 * server's answer. So what is assertable is the WIRING, and — more importantly — **that no fourth copy of the
 * live-status list appeared while we were fixing a defect caused by a divergent one.**
 */

/**
 * 🔑 **Strip comments, THEN assert.** Three times now a test of mine that forbade a STRING has failed on the
 * comment explaining why the string is absent (`weekday`, `mode={dropMode ?? "drop"}`, `CANCELLED`). Slicing to
 * a payload fixed each one locally; removing the prose is the fix for the class, and it is what makes the
 * status-list sweep below possible at all — these files now DISCUSS the three statuses at length.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const DIALOG = "src/components/partials/Bookings/DropResumeDialog.tsx";
const MODAL = "src/components/partials/Bookings/PlanModal.tsx";
const dialog = codeOf(DIALOG);
const modal = codeOf(MODAL);

describe("🔑 the number in the pause sentence is the SERVER's", () => {
  it("asks the preview and renders its count", () => {
    expect(dialog).toContain("usePreviewEndCourse");
    expect(dialog).toContain("n: pausePreview.removedSessions");
  });

  it("🔴 has NO count of its own, and no fallback for one", () => {
    // The prop is gone from both sides — a count cannot be handed in again without this failing.
    expect(dialog).not.toContain("remaining");
    expect(modal).not.toContain("remaining={");
    // 🚫 And no `?? 0` beside it: a number that appears and then corrects itself is the same defect wearing a
    // delay. Until the server answers, the sentence does not render.
    expect(dialog).not.toMatch(/removedSessions\s*\?\?/);
  });

  it("cannot be confirmed before the server has said how many", () => {
    expect(dialog).toContain("isDrop ? !pausePreview");
  });

  it("🚫 does not re-derive the count from the plan", () => {
    expect(dialog).not.toContain("SICK_LEAVE");
    expect(dialog).not.toContain(".filter(");
  });
});

/**
 * 🔴 **@Sober's instruction was "do not add the first copy of the live-status list to the client". There are
 * already TWO.** Both predate this task, neither is a count, and neither is in the pause path — but the reason
 * for asking the server is stronger stated accurately: **we are refusing to add a THIRD.**
 *
 * ⚠️ This is the `Record`-completeness problem from TASK-286 in the wild: nothing makes a hand-written triple
 * follow the server's `COURSE_LIVE_STATUSES` when that changes. So the sweep pins the number and names each
 * site — **a fourth one fails here, and the failure says where.**
 */
const LIVE_TRIPLE = /"PENDING"[^;{}\n]{0,120}"CONFIRMED"[^;{}\n]{0,120}"EXTENDED"/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [path] : [];
  });

describe("🚫 no live-status list was ADDED to the client", () => {
  const offenders = sourceFiles("src").filter((f) => LIVE_TRIPLE.test(codeOf(f)));

  it("names exactly the two that already existed — a third fails here", () => {
    expect(offenders.sort()).toEqual([
      // "can this booking be dragged?" (UC-003)
      "src/components/partials/Calendar/Modal/BookingModal.tsx",
      // "can this row be plainly cancelled?" — one screen from the defect, and NOT a count
      "src/components/partials/Bookings/PlanModal.tsx",
    ].sort());
  });

  it("🔴 the pause dialog is not one of them", () => {
    expect(offenders).not.toContain(DIALOG);
  });
});

describe("🧹 the comments that outlived their mechanism", () => {
  const prose = (path: string) => readFileSync(path, "utf8");

  it("no file still claims the count cannot be asked for", () => {
    // *"There is deliberately no `/drop/preview`, so the dialog states what will happen from the plan it
    // already has"* — **true about the route and wrong about the fact**, which is worse than a plain error,
    // and it is the sentence that kept the defect looking deliberate for a week.
    for (const f of [DIALOG, MODAL, "src/services/scheduler.service.ts"]) {
      expect(prose(f)).not.toMatch(/no `\/drop\/preview`\*{0,2} on the (server|BE), so/);
    }
  });

  it("🔑 the modal declares its scroll — the primary action stays reachable", () => {
    // @Sober's reason is not the viewport: a dialog whose primary action can be unreachable cannot be VERIFIED,
    // and this one GREW when the resume summary was added.
    expect(dialog).toContain("scrollAreaComponent={ScrollArea.Autosize}");
  });
});
