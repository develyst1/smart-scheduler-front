import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * TASK-293 — **two labels that outlived their values.**
 *
 * A title still asking *"Resume this course?"* over a body in the past tense with only a `Close` button, and a
 * field name still promising `Ends {date}` on a paused course that correctly has none.
 * 🔑 **Same family as TASK-291's three stale comments — a string written for a state the code no longer
 * produces — except a user reads these.** So the assertions are about words, and the two that must NOT move are
 * asserted harder than the two that did.
 */

/** 🔑 Strip comments before asserting — these files now DISCUSS the strings they are checked for. */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const dialog = codeOf("src/components/partials/Bookings/DropResumeDialog.tsx");
const modal = codeOf("src/components/partials/Bookings/PlanModal.tsx");
const { en, th } = dictionaries;

describe("🔴 §1 the summary states what it DID — @Porter's copy, verbatim", () => {
  it('the title is "Course resumed"', () => {
    expect(en.endCourse.resumeDone).toBe("Course resumed");
    expect(dialog).toContain('result ? "endCourse.resumeDone"');
  });

  it("🚫 reuses the toast's string instead of adding a second copy of it", () => {
    // The toast fired on a successful re-plan already said exactly this. Two strings for one fact is the drift
    // class this week has been spent on; the title and the toast are the same sentence about the same act.
    expect(dialog).not.toContain("resumedTitle");
    expect(th.endCourse.resumeDone).toBe("กลับมาเรียนแล้ว");
  });
});

describe("🔑 §1 the PAUSE face still ASKS — it is asked before its act", () => {
  it("keeps its question, in both languages", () => {
    expect(en.endCourse.dropTitle).toBe("Pause this course?");
    expect(th.endCourse.dropTitle).toBe("พักคอร์สนี้?");
  });

  it("🔴 and cannot be reached by the done-title at all", () => {
    // `isDrop` is tested FIRST: `result` is only ever set on the resume face today, but writing the branch this
    // way makes the pause face's question structural rather than incidental.
    expect(dialog).toContain('isDrop ? "endCourse.dropTitle" : result ?');
  });

  it("the resume face still asks BEFORE the act", () => {
    expect(en.endCourse.resumeTitle).toBe("Resume this course?");
    expect(dialog).toContain('"endCourse.resumeTitle"');
  });
});

describe("🟡 §2 a paused course is not asked for an end date", () => {
  it("says what is true instead of answering `Ends` with a sentence", () => {
    expect(en.plan.pausedNoEnd).toBe("Paused — no dates until it resumes");
    expect(modal).toContain('t("plan.pausedNoEnd")');
    // The server's own lifecycle field, the same one the badge reads — not a re-derivation from the rows.
    expect(modal).toContain('plan.summary.status === "DROPPED"');
  });

  it("🚫 invents no date and does not fall back to the expiry", () => {
    // `deriveLiveEndDate` returning null is CORRECT and must stay that way: the expiry is a ceiling, not an end
    // (TASK-282 §7). The header's only date source is still `plan.liveEndDate`.
    expect(modal).toContain("plan.liveEndDate ? dayjs(plan.liveEndDate)");
    expect(modal).not.toMatch(/liveEndDate\s*\?\?\s*[a-zA-Z]*[eE]xpiry/);
  });

  it("⚠️ `noLiveEnd` is untouched — it still answers the OTHER causes of an absent end", () => {
    // Only the paused case was ruled on. A completed or never-started plan still reads "Ends no live sessions",
    // which is the same category error for a different reason — named in the task, deliberately not changed.
    expect(en.plan.noLiveEnd).toBe("no live sessions");
  });
});

describe("🚫 §4 the body sentences the owner READ are byte-identical", () => {
  // 🔑 These are the strings in his four `sid` screenshots — including `resumeExpirySame`, whose branch nobody
  // had ever seen run. **They are evidence now, not copy.**
  it("English", () => {
    expect(en.endCourse.resumeCreated).toBe("{n} session(s) put back on the schedule.");
    expect(en.endCourse.resumeLastSession).toBe("The course now ends on {date}.");
    expect(en.endCourse.resumeExpirySame).toBe("The expiry is unchanged: {date}.");
    expect(en.endCourse.resumeExpiryMoved).toBe("The expiry moved to {date} to cover the new last session.");
  });

  it("Thai", () => {
    expect(th.endCourse.resumeCreated).toBe("นำคาบกลับเข้าตาราง {n} คาบ");
    expect(th.endCourse.resumeLastSession).toBe("คอร์สนี้จะจบวันที่ {date}");
    expect(th.endCourse.resumeExpirySame).toBe("วันหมดอายุเท่าเดิม: {date}");
  });

  it("🔴 @Porter's pause line, still his — TASK-288 §3", () => {
    expect(en.endCourse.dropLine).toContain("the time and the expiry date can move.");
    expect(th.endCourse.dropLine).toContain("เวลาเรียนและวันหมดอายุอาจเปลี่ยนได้");
  });
});
