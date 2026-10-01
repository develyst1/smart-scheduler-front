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

  it("⚠️ UPDATED TWICE — `noLiveEnd` now has NO renderer at all, and stays only because TASK-294 is open", () => {
    // 🔻 History, because the REASON has changed under this pin twice in two days and that is the whole point:
    //   TASK-293 — *"a completed or never-started plan still reads `Ends no live sessions`; not changed."*
    //   TASK-319 — the header stopped using it; the pin then said the string stays because `diffSummary` does.
    //   TASK-321 — **`diffSummary` stopped too. `noLiveEnd` is now rendered by NOTHING.**
    // ⚠️ It stays in the dictionary anyway, deliberately: **deleting it would pre-empt TASK-294**, which is an
    // open ruling on it, `noSessions` and their shared Thai string. 🔑 A dead string kept ON PURPOSE, with the
    // purpose written down — which is the opposite of the label-outliving-its-value class, not an instance.
    expect(en.plan.noLiveEnd).toBe("no live sessions");
    expect(en.plan.noUpcomingSession).toBe("No upcoming sessions");
    expect(modal).not.toContain("plan.noLiveEnd");
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

describe("🔴 TASK-319 — `Ends` named neither of the modal's two end-ish dates", () => {
  it("the label is the SESSION word, both languages", () => {
    // A course has a last SESSION and an EXPIRY, which is a CEILING (TASK-282 §7). `Ends` named neither
    // unambiguously and sat in a modal showing both ⇒ a disambiguation, not a preference.
    expect(en.plan.endsOn).toBe("Last session {date}");
    expect(th.plan.endsOn).toBe("คาบสุดท้าย {date}");
    // 🚫 The Thai moved too: `สิ้นสุด` vs `วันหมดอายุ` is the same ambiguity, and this is a STAFF screen worked
    // in Thai. Leaving it would have fixed the language that needed it least.
    expect(th.plan.endsOn).not.toContain("สิ้นสุด");
  });

  it("🔑 §2 option 2 — a non-date can no longer enter the `{date}` slot", () => {
    // `Last session no live sessions` would repeat a word and read like a broken template — worse than the
    // clumsy string it replaced, in the name of clarity.
    expect(modal).toContain("const lastSession = plan.liveEndDate ? dayjs(plan.liveEndDate)");
    expect(modal).toContain('t("plan.endsOn", { date: lastSession })');
    expect(modal).toContain('t("plan.noUpcomingSession")');
    // The header's fallback is a SENTENCE, never the old fragment.
    const header = modal.slice(modal.indexOf("function SummaryBar"), modal.indexOf("function SessionTable"));
    // 🔑 TASK-341 — a positive over `header` ITSELF. ⚠️ The three assertions above are on `modal`, the whole
    // file: they are green whatever this slice contains, which is exactly what made this look guarded when it
    // was not. **The guard must be over the same region as the negative.**
    expect(header).toContain('t("plan.endsOn", { date: lastSession })');
    expect(header).not.toContain("noLiveEnd");
  });

  it("🚫 the PAUSED branch is byte-identical — this rename cannot re-open TASK-293", () => {
    expect(en.plan.pausedNoEnd).toBe("Paused — no dates until it resumes");
    expect(th.plan.pausedNoEnd).toBe("พักอยู่ — ยังไม่มีวันเรียนจนกว่าจะกลับมาเรียน");
    expect(modal).toContain('t("plan.pausedNoEnd")');
  });

  it("🚫 the VALUE is untouched — a rename, not a re-derivation, and not a control", () => {
    // `deriveLiveEndDate` is the server's and stays so; and it must NOT become clickable — editing it would
    // mean editing a derivation, which is what TASK-282 exists to protect.
    const header = modal.slice(modal.indexOf("function SummaryBar"), modal.indexOf("function SessionTable"));
    // ⚠️ Scoped to the HEADER, not the file: `createPreviewLine` legitimately uses
    // `plan?.liveEndDate ?? liveSessions.at(-1)?.date` in CREATE mode, where every row is live by construction.
    // A file-wide ban would have forbidden a fallback that is correct — the same over-reach as forbidding a
    // string that a comment has to mention.
    // 🔑 TASK-341 — its own positive: this is a SECOND `it`, so it re-slices and cannot borrow the guard added
    // to the one above. Each region needs the guard where it is used.
    expect(header).toContain('t("plan.endsOn", { date: lastSession })');
    expect(header).not.toMatch(/liveEndDate\s*\?\?/);
    expect(header).not.toContain("onClick");
    expect(header).not.toContain("UnstyledButton");
  });
});

describe("🔵 TASK-321 — the diff line and the header name one fact ONE way", () => {
  it("both say the session word, both languages", () => {
    // The rename existed to stop a modal naming one fact two ways; an hour later this line was the odd one out,
    // and we made it that way. `ends` / `จบ` are gone from it.
    expect(en.plan.diffSummary).toContain("last session {end}");
    expect(th.plan.diffSummary).toContain("คาบสุดท้าย {end}");
    expect(en.plan.diffSummary).not.toContain("ends {end}");
    expect(th.plan.diffSummary).not.toContain("จบ {end}");
  });

  it("🔑 a non-date cannot reach `{end}` — the header's treatment, applied here", () => {
    const diff = modal.slice(modal.indexOf("function PlanDiffConfirm"));
    expect(diff).toContain("const lastSession = preview.liveEndDate ? dayjs(preview.liveEndDate)");
    expect(diff).toContain('t("plan.diffSummaryNoEnd"');
    expect(diff).not.toContain("noLiveEnd");
  });

  it("§2 — its own sentence, NOT `noUpcomingSession` reused", () => {
    // The header reports what the course IS; this reports what the proposed change WOULD LEAVE, and it is read
    // while the admin can still cancel. Different statement ⇒ different string.
    expect(en.plan.diffSummaryNoEnd).toBe("{appended} added · {cancelled} removed · nothing left on the schedule");
    expect(th.plan.diffSummaryNoEnd).toBe("เพิ่ม {appended} · เอาออก {cancelled} · ไม่เหลือคาบในตาราง");
    expect(en.plan.diffSummaryNoEnd).not.toContain(en.plan.noUpcomingSession);
  });

  it("🚫 TASK-294's three strings are untouched — this cannot pre-empt an open ruling", () => {
    // `noLiveEnd` now has no renderer at all, and is kept ON PURPOSE until TASK-294 rules on it and `noSessions`
    // and their shared Thai string. Changing any of them here would decide that ruling by accident.
    expect(en.plan.noLiveEnd).toBe("no live sessions");
    expect(en.plan.noSessions).toBe("No sessions yet");
    expect(th.plan.noLiveEnd).toBe("ยังไม่มีคาบ");
    expect(th.plan.noSessions).toBe("ยังไม่มีคาบ");
  });

  it("🚫 the counts and TASK-319's header are unchanged", () => {
    expect(en.plan.diffSummary).toContain("{appended} added · {cancelled} removed");
    expect(en.plan.endsOn).toBe("Last session {date}");
    expect(en.plan.pausedNoEnd).toBe("Paused — no dates until it resumes");
  });
});

/**
 * 🔴 **TASK-595 — the leave dialog's words, after the derivation.** Tanya found ONE stale sentence (the same-day warning
 * on a future date, now guarded — pinned by CLICK in `report-leave-advance.dom.test.tsx`, both ways). 🔑 **Deriving what
 * ELSE on that dialog was written for the today path turned up a second one, in Thai only**, and this is where it is held.
 * 📌 *One dialog, two acts, is exactly where the wrong words get shown* — my own line from TASK-588, and it cost me a
 * string I had read past twice.
 */
describe("TASK-595 — the leave dialog says nothing that belongs to the other act", () => {
  it("🔴 `noSessions` says THE CHOSEN DAY, not \"today\" — the branch it lives on also serves PAST dates", () => {
    // 🔻 Declared: the Thai was "ไม่มีคาบของคุณในวันนี้" (**today**) while its own English says **on this day**, and the
    // chooser it belongs to is shown for today AND any past date ⇒ on a past date the Thai named the wrong day.
    // 🔑 The two languages must make the SAME statement; that is what the pin holds, not a particular wording.
    expect(en.teacherLeave.noSessions).toBe("No sessions of yours on this day.");
    expect(th.teacherLeave.noSessions).toBe("ไม่มีคาบของคุณในวันนั้น");
    expect(th.teacherLeave.noSessions).not.toContain("วันนี้");
  });

  it("✅ the CANCEL act's warning is unchanged — the fix guarded WHERE it shows, never the sentence", () => {
    // 🚫 This is the string Tanya reported, and it is deliberately NOT reworded: on today's path it is exactly right,
    // and 🔑 *half a rule is not a rule* — a fix that softened the sentence would weaken the one place it is needed.
    expect(en.teacherLeave.warning).toBe("Families of the ticked sessions will be told; their make-ups are added by the system.");
    expect(th.teacherLeave.warning).toBe("ผู้ปกครองของคาบที่ติ๊กจะได้รับแจ้ง และระบบจะเพิ่มคาบชดเชยให้");
    // and the ADVANCE hint still makes the opposite promise, in both languages — the contradiction the guard removed
    expect(en.teacherLeave.advanceHint).toContain("not cancelled");
    expect(th.teacherLeave.advanceHint).toContain("ไม่ถูกยกเลิก");
  });

  it("🔑 nothing ELSE the dialog shows on BOTH acts names an act — the derivation, as an assertion", () => {
    // The strings rendered before submit on EITHER date: the title, the date label, the reason label and its hint.
    // 🚫 None may promise a cancellation, a notice to a family, a make-up, or block-for-new-bookings — each of those
    // belongs to exactly one act, and a shared string that names one is the defect class this task is about.
    const shared = [
      en.teacherLeave.title,
      en.teacherLeave.date,
      en.teacherLeave.reason,
      en.teacherLeave.reasonHint,
      th.teacherLeave.title,
      th.teacherLeave.date,
      th.teacherLeave.reason,
      th.teacherLeave.reasonHint,
    ].join(" | ");
    expect(shared).not.toMatch(/cancel|make-up|notified|told|blocked/i);
    expect(shared).not.toMatch(/ยกเลิก|ชดเชย|แจ้งผู้ปกครอง|ปิดรับจอง/);
    // 🔑 and the check has something to read: a pin over an empty list would pass forever
    expect(shared.length).toBeGreaterThan(40);
  });
});
