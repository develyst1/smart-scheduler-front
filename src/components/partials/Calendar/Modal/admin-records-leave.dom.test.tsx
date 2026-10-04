import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **REQ-111 item C (TASK-608 BE → TASK-611 FE) — an ADMIN records a teacher's leave on their behalf, clicked.**
 *
 * 🔑 **The widening is one optional prop, so the two things worth proving are both about WHAT LEAVES and WHAT IS SHOWN:**
 * the request must name **the teacher** (never the admin, and never with `sessionIds`), and the screen must never offer
 * the CANCELLING act, whose session list would be **the admin's own day** labelled as the teacher's.
 *
 * 📌 The calendar read is faked at the api boundary like its sibling file, so the page's own logic runs.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let answer: unknown = null;

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const TODAY = day(0);
const YESTERDAY = day(-1);
const FUTURE = day(7);

/** 🔑 Two classes on EVERY day asked for — so if the admin door ever rendered the chooser, there would be rows to see. */
const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "admin-self",
          slots: [
            {
              startTime: "10:00:00",
              booking: {
                id: "mine-1",
                date,
                startTime: "10:00:00",
                endTime: "11:00:00",
                status: "CONFIRMED",
                displayName: "น้องของแอดมิน",
                bookingType: "COURSE_PACKAGE",
                teacher: { id: "admin-self", name: "แอดมิน", nickname: "แอด" },
                student: { id: "s1", name: "น้องของแอดมิน", nickname: null },
                additionalTeachers: [],
              },
            },
          ],
        },
      ],
    },
  ],
});

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: { date?: string } }) => ({ data: calendarFor(cfg?.params?.date ?? TODAY) }),
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: answer };
    },
  },
}));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;

const SUBJECT = { id: "t-77", name: "ครูเอ" };
const mount = (initialDate: string, subject?: { id: string; name: string }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(ReportLeaveDialog, { opened: true, initialDate, onClose: () => {}, subject }))),
    ) as never,
  );
};
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const leaves = () => posts.filter((r) => r.url === "/teacher-leave-days");
const ownLeaves = () => posts.filter((r) => r.url === "/teachers/me/leave");
const typeReason = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปอบรม");
};

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
  answer = {
    mode: "advance",
    cancelled: 0,
    bookingIds: [],
    familiesNotified: 0,
    // 🔴 TASK-611 §2 — the count the told/not-told line is read FROM. The default is a LINKED coach (1 told).
    teacherNotified: 1,
    leave: { date: FUTURE, reason: "ไปอบรม" },
    alreadyRecorded: false,
    bookings: [{ id: "bk-9", date: FUTURE, startTime: "09:00:00", endTime: "09:45:00", status: "CONFIRMED", bookingType: "COURSE_PACKAGE" }],
  };
});

describe("🔴 TASK-611 — the ADMIN door, clicked", () => {
  it("🔑 the request names the TEACHER and carries no session list", async () => {
    const user = userEvent.setup();
    mount(FUTURE, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));

    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(leaves().length).toBe(1));
    const body = leaves()[0].body;
    // 🔴 whose day it is rides in the body; 🚫 the actor never does — it is the signed-in admin
    expect(body.teacherId).toBe("t-77");
    expect(body.date).toBe(FUTURE);
    expect(Object.keys(body).sort()).toEqual(["date", "reason", "teacherId"]);
    expect(body.sessionIds).toBeUndefined();
    // 🚫 and the TEACHER's own route is never touched by this door
    expect(ownLeaves().length).toBe(0);
  });

  it("🔴 no session chooser on ANY date — the rows would be the ADMIN's own day", async () => {
    // a FUTURE date: the chooser is absent for the same reason it is on the teacher's door…
    mount(FUTURE, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(document.querySelectorAll("[data-leave-rows]").length).toBe(0);
    cleanup();

    // …and on TODAY, where the teacher's own door DOES show it, the admin door still shows nothing to tick.
    // 🔑 This is the assertion the task exists for: the fixture has a class on every day, so a chooser here would
    // have rows — and they would be the admin's.
    mount(TODAY, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-admin-refused]").length).toBe(1));
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(document.querySelectorAll("[data-leave-rows]").length).toBe(0);
    /**
     * 🔴 **The chooser's SHELL is absent too, and this assertion is here because a mutation taught me to write it.**
     * Removing `onBehalf ? null :` SURVIVED: the shell rendered, but the read that fills it is disabled on this door, so
     * there were no rows to count and every assertion above still passed. ⇒ 🔑 **the empty chooser was harmless only
     * because the OTHER guard held** — and *a defect that is invisible while a second guard holds is a defect waiting
     * for that guard to move.* Both are asserted now: the shell is not rendered, and the read is not made.
     */
    expect(document.querySelectorAll("[data-leave-chooser]").length).toBe(0);
    expect(screen.queryAllByText(/my sessions that day/i).length).toBe(0);
    expect(screen.queryAllByText(/no sessions of yours/i).length).toBe(0);
    // 🚫 and the admin's own student never appears on a screen about someone else's leave
    expect(screen.queryAllByText("น้องของแอดมิน").length).toBe(0);
  });

  it("🔴 today and the past are REFUSED, the alternative is NAMED, and the two guards hold", async () => {
    const user = userEvent.setup();
    for (const date of [TODAY, YESTERDAY]) {
      mount(date, SUBJECT);
      const box = await waitFor(() => {
        const el = document.querySelector("[data-leave-admin-refused]") as HTMLElement | null;
        expect(el).toBeTruthy();
        return el as HTMLElement;
      });
      // it says WHY (cancelling tells each family) and WHAT TO DO (pick a later date) — 🚫 not "not allowed"
      expect(box.textContent).toMatch(/one at a time on the calendar/i);
      expect(box.textContent).toMatch(/pick a date after today/i);
      expect(box.textContent).not.toMatch(/not allowed|forbidden|permission/i);

      // 🔑 TASK-564's two guards: the button is shut AND pressing it sends nothing
      await typeReason(user);
      expect(submitBtn().disabled).toBe(true);
      await user.click(submitBtn());
      expect(posts.length).toBe(0);
      cleanup();
    }
  });

  it("🔴 the answer stays ON SCREEN and says NOTHING HAS BEEN CANCELLED — in the admin's words", async () => {
    const user = userEvent.setup();
    mount(FUTURE, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    await typeReason(user);
    await user.click(submitBtn());

    const box = await waitFor(() => {
      const el = document.querySelector("[data-leave-nothing-cancelled]") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(box.textContent).toMatch(/nothing has been cancelled/i);
    // 🔑 written for THIS reader: the admin is told the classes are THEIRS to handle, which the teacher's wording does not say
    expect(box.textContent).toMatch(/yours to handle/i);
    expect(box.textContent).not.toMatch(/please treat them as going ahead until an admin tells you/i);
    // the teacher IS told here (the fixture's count is 1), and the screen says so by name
    const told = document.querySelector("[data-leave-teacher-told]") as HTMLElement;
    expect(told.getAttribute("data-leave-teacher-told")).toBe("yes");
    expect(told.textContent).toContain("ครูเอ");
    expect(told.textContent).toMatch(/has been told/i);
    // 🚫 and it never claims a cancellation count
    expect((document.querySelector("[data-leave-advance]") as HTMLElement).textContent).not.toMatch(/cancelled \d|\d cancelled/i);
  });
});

/**
 * 🔴 **TASK-611 §2 — the notice line is read from the ANSWER'S COUNT, by value, in all three states.**
 *
 * **The defect this pins was mine:** the line rendered on `subject &&` — on **every** admin use — so for an
 * **unlinked** coach the screen said *"{name} has been told about this day"* and it was **false**. 🔑 *It was the same
 * error as the line directly above it, which I had got right for the same reason: an admin who believes the message
 * went does not make the call.*
 * 📌 **Three states, because there are three facts** — told · not told · **not known**. The third is not cosmetic:
 * 🔑 *"we were not told whether it went" and "it did not go" are different facts, and only one is safe to print.*
 */
describe("🔴 TASK-611 §2 — told, NOT told, and not known", () => {
  const runAdmin = async () => {
    const user = userEvent.setup();
    mount(FUTURE, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(document.querySelectorAll("[data-leave-nothing-cancelled]").length).toBe(1));
  };

  it("🔴 a count of 0 ⇒ the told line is GONE and the screen says WHO must act", async () => {
    answer = { ...(answer as Record<string, unknown>), teacherNotified: 0 };
    await runAdmin();

    const line = document.querySelector("[data-leave-teacher-told]") as HTMLElement;
    expect(line).toBeTruthy();
    // 🔴 the false sentence must not be on screen in ANY form
    expect(line.getAttribute("data-leave-teacher-told")).toBe("no");
    expect(document.body.textContent).not.toMatch(/has been told about this day/i);
    // ✅ and the true one names why, and who does the telling
    expect(line.textContent).toMatch(/has not been told/i);
    expect(line.textContent).toMatch(/line account is not linked/i);
    expect(line.textContent).toMatch(/tell them yourself/i);
    expect(line.textContent).toContain("ครูเอ");
  });

  it("✅ a count of 2 ⇒ the told line, and the not-told sentence is absent", async () => {
    answer = { ...(answer as Record<string, unknown>), teacherNotified: 2 };
    await runAdmin();

    const line = document.querySelector("[data-leave-teacher-told]") as HTMLElement;
    expect(line.getAttribute("data-leave-teacher-told")).toBe("yes");
    expect(line.textContent).toMatch(/has been told/i);
    expect(document.body.textContent).not.toMatch(/has not been told/i);
  });

  it("🔑 the count ABSENT ⇒ NEITHER sentence — a missing count is not a zero", async () => {
    const { teacherNotified, ...withoutCount } = answer as Record<string, unknown>;
    void teacherNotified;
    answer = withoutCount;
    await runAdmin();

    // 🚫 nothing at all is claimed about the notice
    expect(document.querySelectorAll("[data-leave-teacher-told]").length).toBe(0);
    // 🔑 Matched on the SENTENCES, not on the words they share with the paragraph above: the admin notice itself says
    // *"no family HAS BEEN TOLD"*, so a loose /has been told/ matched the right screen for the wrong reason.
    expect(document.body.textContent).not.toMatch(/told about this day/i);
    expect(document.body.textContent).not.toMatch(/has not been told/i);
    // ✅ and the rest of the answer is still on screen — the day IS recorded
    expect(document.body.textContent).toMatch(/nothing has been cancelled/i);
  });

  it("🚫 the TEACHER's own door never shows either sentence, whatever the count says", async () => {
    answer = { ...(answer as Record<string, unknown>), teacherNotified: 0 };
    const user = userEvent.setup();
    mount(FUTURE); // 🚫 no subject
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(document.querySelectorAll("[data-leave-nothing-cancelled]").length).toBe(1));

    expect(document.querySelectorAll("[data-leave-teacher-told]").length).toBe(0);
    expect(document.body.textContent).not.toMatch(/told about this day|has not been told/i);
  });
});

/**
 * 🔴 **TASK-651 (F4 + F5) — the admin's result speaks to the ADMIN, and the cancel warning stays on the teacher's door.**
 *
 * **F4 was four strings, not one.** The result block printed *you are recorded as away*, *booked with YOU*, and
 * *an admin will handle them* — **on the screen of the admin who had just acted.** 🔑 *The widening gave the dialog a
 * second reader, and four sentences were still addressing the first one.*
 * **F5 is the same shape one more time:** the cancel warning renders on `!advance`, and on the ADMIN door today makes
 * `advance` false ⇒ it appeared on a door with **no ticks at all**. 📌 **My own TASK-595 comment already said that line
 * belongs to the cancel act only — and this is the second door that comment did not cover.**
 */
describe("🔴 TASK-651 — four admin sentences, and the warning that is not the admin's", () => {
  const EN_TEACHER = dictionaries.en.teacherLeave as unknown as Record<string, string>;

  const runAdmin = async (date: string) => {
    const user = userEvent.setup();
    mount(date, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(document.querySelectorAll("[data-leave-nothing-cancelled]").length).toBe(1));
  };

  it("🔴 the result shows ALL FOUR admin sentences and NONE of the teacher's", async () => {
    await runAdmin(FUTURE);
    const screenText = document.body.textContent ?? "";

    // ✅ the four admin ones, each naming the COACH rather than the reader
    expect(screenText).toMatch(/leave recorded for ครูเอ/i);
    expect(screenText).toMatch(/no new class can be booked with ครูเอ that day/i);
    expect(screenText).toMatch(/1 class\(es\) already booked with ครูเอ that day/i);

    // 🚫 and not one of the teacher's four, which all address the reader as the person who is away
    expect(screenText).not.toContain("you are recorded as away");
    expect(screenText).not.toContain(EN_TEACHER.advanceBlocked);
    expect(screenText).not.toMatch(/an admin will handle them by hand/i);
    expect(screenText).not.toContain(EN_TEACHER.advanceNoClasses);
    // 🔑 the one that is NEUTRAL stays shared — it is not a fifth variant and must not become one
    expect(EN_TEACHER.advanceAlready).toMatch(/already on record/i);
  });

  it("🔑 with NOTHING booked, the empty line also names the coach", async () => {
    answer = { ...(answer as Record<string, unknown>), bookings: [] };
    await runAdmin(FUTURE);
    expect(document.body.textContent).toMatch(/nothing is booked with ครูเอ that day/i);
    expect(document.body.textContent).not.toContain(EN_TEACHER.advanceNoClasses);
  });

  it("🔴 F5 — the cancel warning is ABSENT on the admin door with TODAY selected", async () => {
    mount(TODAY, SUBJECT);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-admin-refused]").length).toBe(1));
    // 🔑 today makes `advance` false, which is exactly the condition the line used to render on
    expect(document.querySelectorAll("[data-leave-cancel-warning]").length).toBe(0);
    expect(document.body.textContent).not.toMatch(/families of the ticked sessions/i);
    // 🚫 and there are no ticks on this door for it to have been talking about
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it("✅ F5's other half — the warning is still PRESENT on the teacher's own door with today", async () => {
    mount(TODAY); // 🚫 no subject
    await waitFor(() => expect(document.querySelectorAll("[data-leave-rows]").length).toBe(1));
    const warn = document.querySelector("[data-leave-cancel-warning]") as HTMLElement;
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/families of the ticked sessions/i);
    // 🔑 *half a rule is not a rule* — the fix must not silence the one place the sentence is true
  });
});

describe("✅ TASK-611 — the TEACHER's own door is UNCHANGED", () => {
  it("🔑 with no subject: the old route, the old body, no teacher id anywhere", async () => {
    answer = { cancelled: 2, bookingIds: ["mine-1"], familiesNotified: 2 };
    const user = userEvent.setup();
    mount(TODAY); // 🚫 no subject ⇒ the pre-existing door

    // the chooser is back, with the day's rows — this path did not change
    await waitFor(() => expect(document.querySelectorAll("[data-leave-rows]").length).toBe(1));
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(1);
    // 🚫 and nothing of the admin door is on screen
    expect(document.querySelectorAll("[data-leave-admin-refused]").length).toBe(0);

    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(ownLeaves().length).toBe(1));
    expect(Object.keys(ownLeaves()[0].body).sort()).toEqual(["date", "reason"]);
    expect(ownLeaves()[0].body.teacherId).toBeUndefined();
    // 🔴 the admin route is never called by the teacher's door
    expect(leaves().length).toBe(0);
  });

  it("🔑 a FUTURE date on the teacher's own door is still the advance act, not a refusal", async () => {
    mount(FUTURE);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    // 🚫 the admin's refusal belongs to the admin door only
    expect(document.querySelectorAll("[data-leave-admin-refused]").length).toBe(0);
    expect(submitBtn().disabled).toBe(true); // a reason is still required, exactly as before
  });
});

/**
 * 📋 **The copy, COUNTED in both languages** — 🔑 *a bilingual assertion is satisfied by one language unless both are
 * counted.* These strings are a DRAFT (@Sober owns the copy this batch); what is pinned here is **that both languages
 * exist, differ, and carry the promises the task names** — not the final wording.
 */
describe("📋 TASK-611 — the admin door's strings, both languages, counted", () => {
  const KEYS = [
    "adminTitle",
    "adminSubject",
    "adminHint",
    "adminPastRefused",
    "adminPastRefusedAction",
    "adminNothingCancelled",
    "adminDoneTeacherTold",
    // 🔴 TASK-611 §2 — the ninth: the other half of the notice line. @Sober's English, my Thai draft.
    "adminDoneTeacherNotTold",
    "adminSubmit",
    // 🔴 TASK-651 (F4) — the four the result block needed. ✅ APPROVED (owner 2026-10-04) as @Sober drafted them.
    "adminAdvanceTitle",
    "adminAdvanceBlocked",
    "adminAdvanceClasses",
    "adminAdvanceNoClasses",
  ] as const;

  it("🔑 every string exists in BOTH languages and they are not the same text", () => {
    const en = dictionaries.en.teacherLeave as unknown as Record<string, string>;
    const th = dictionaries.th.teacherLeave as unknown as Record<string, string>;
    const pairs = KEYS.map((k) => [k, en[k], th[k]] as const);
    // 🚫 a loop that silently covered one language would pass: the COUNT is asserted, not assumed
    expect(pairs.length).toBe(13);
    expect(pairs.filter(([, e]) => typeof e === "string" && e.length > 0).length).toBe(13);
    expect(pairs.filter(([, , th2]) => typeof th2 === "string" && th2.length > 0).length).toBe(13);
    expect(pairs.filter(([, e, th2]) => e !== th2).length).toBe(13);
    // the row action too, in both
    expect((dictionaries.en.teachers as unknown as Record<string, string>).actRecordLeave.length).toBeGreaterThan(0);
    expect((dictionaries.th.teachers as unknown as Record<string, string>).actRecordLeave.length).toBeGreaterThan(0);
  });

  it("🔴 the promises the task names are IN the strings, in both languages", () => {
    const en = dictionaries.en.teacherLeave as unknown as Record<string, string>;
    const th = dictionaries.th.teacherLeave as unknown as Record<string, string>;
    // nothing is cancelled, and nobody was told — said in both
    expect(en.adminNothingCancelled).toMatch(/nothing has been cancelled/i);
    expect(th.adminNothingCancelled).toContain("ยังไม่มีการยกเลิกคาบใด");
    expect(en.adminNothingCancelled).toMatch(/no family has been told/i);
    expect(th.adminNothingCancelled).toContain("ยังไม่ได้แจ้งผู้ปกครอง");
    // the refusal names the alternative, in both
    expect(en.adminPastRefusedAction).toMatch(/after today/i);
    expect(th.adminPastRefusedAction).toContain("หลังจากวันนี้");
    // 🚫 and neither language tells an admin they lack a permission: the control is HIDDEN when they do
    expect(`${en.adminPastRefused} ${th.adminPastRefused}`).not.toMatch(/permission|สิทธิ์/i);
    // 🔴 TASK-611 §2 — the not-told sentence names WHY and WHO ACTS, in both languages
    expect(en.adminDoneTeacherNotTold).toMatch(/not been told/i);
    expect(en.adminDoneTeacherNotTold).toMatch(/not linked/i);
    expect(en.adminDoneTeacherNotTold).toMatch(/yourself/i);
    expect(th.adminDoneTeacherNotTold).toContain("ยังไม่ได้ผูก");
    expect(th.adminDoneTeacherNotTold).toContain("แจ้งครูเอง");
    // 🚫 and the two sentences are different strings in BOTH languages — not one reused with a negation
    expect(en.adminDoneTeacherNotTold).not.toBe(en.adminDoneTeacherTold);
    expect(th.adminDoneTeacherNotTold).not.toBe(th.adminDoneTeacherTold);
    // 🔻 @Sober's reworded hint: "no family has been told anything", so it cannot read as "told they are booked"
    expect(en.adminHint).toMatch(/no family has been told anything/i);
    // 🔴 TASK-651 (F4) — each of the four names the COACH, in both languages, and 🚫 none addresses the reader as the
    // person who is away. The `{name}` placeholder is what makes that true rather than the wording.
    for (const k of ["adminAdvanceTitle", "adminAdvanceBlocked", "adminAdvanceClasses", "adminAdvanceNoClasses"] as const) {
      expect(en[k]).toContain("{name}");
      expect(th[k]).toContain("{name}");
    }
    // 🚫 and the admin's versions are not the teacher's with a name bolted on: they are different strings
    expect(en.adminAdvanceTitle).not.toBe(en.advanceTitle);
    expect(en.adminAdvanceBlocked).not.toBe(en.advanceBlocked);
    expect(th.adminAdvanceTitle).not.toBe(th.advanceTitle);
    expect(th.adminAdvanceBlocked).not.toBe(th.advanceBlocked);
    // 📌 the classes line does NOT repeat the promise below it — the owner's approval covers that omission
    expect(en.adminAdvanceClasses).not.toMatch(/yours to handle/i);
    // the subject's name is a placeholder, not a fixed word — both languages carry it
    expect(en.adminTitle).toContain("{name}");
    expect(th.adminTitle).toContain("{name}");
    expect(en.adminSubmit).toContain("{name}");
    expect(th.adminSubmit).toContain("{name}");
  });
});
