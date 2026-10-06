import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 5 (TASK-564) — “this session, or the rest?”, clicked.**
 *
 * Khwan's complaint was that changing a teacher *changed the whole course*. It did: the only scope control was a date box
 * defaulting to today, so the body carried `fromDate` = today ⇒ **every remaining row**. The backend now **refuses a body
 * naming neither scope (400)**, and this file proves the screen asks — **by reading the REQUEST, never the screen.**
 *
 * 🔑 **TASK-559's rule, applied:** *a control that shows what you chose and sends something else is the same class of lie.*
 * So every assertion below is about the body that left, and the "nothing chosen" case asserts that **nothing left at all.**
 */

const sent: Array<{ method: string; url: string; body: unknown }> = [];
/** TASK-624 — which keys this admin holds (default: all), and a one-shot refusal the next PATCH throws. */
let allowed: (key: string) => boolean = () => true;
let patchError: Error | null = null;
const SERIES = {
  key: "k-1",
  teacherId: "t1",
  additionalTeacherIds: [] as string[],
  rows: [{ date: "2026-10-05", status: "CONFIRMED" }],
};
const TEACHERS = [
  { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME", bookable: true },
  { id: "t2", name: "ครูบี", nickname: "บี", type: "FULL_TIME", bookable: true },
  { id: "t3", name: "ครูซี", nickname: "ซี", type: "FULL_TIME", bookable: true },
].map((x) => ({ ...x, subjects: [], subjectOptions: [], active: true, lineLinked: false, workDays: [] }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    post: async (url: string, body: unknown) => {
      sent.push({ method: "POST", url, body });
      return { data: { added: 1 } };
    },
    patch: async (url: string, body: unknown) => {
      sent.push({ method: "PATCH", url, body });
      if (patchError) {
        const e = patchError;
        patchError = null;
        throw e;
      }
      return { data: { moved: 1 } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => allowed(key) }));

const { TeacherDialog } = await import("./OtherSeriesDialogs");
/**
 * 📌 The REAL error class, by a specifier of its own (SYSTEM-FACTS 2026-10-05): other files `mock.module("@/lib/api/client")`
 * and Bun keeps a mock for the whole run, so the class imported above can be another file's stand-in.
 */
const REAL = "../../../lib/api/client.ts?task624-real";
const { ApiClientError: RealApiClientError }: typeof import("@/lib/api/client") = await import(REAL);

/** 🔴 TASK-624 — the same series with an EXTRA coach on it (t2), so a Swap on a non-primary can be pressed. */
const WITH_EXTRA = { ...SERIES, additionalTeacherIds: ["t2"] };

const mount = (mode: "add" | "swap", opts: { series?: typeof SERIES; teacherId?: string; kind?: "other" | "group" } = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(
        MantineProvider,
        null,
        h(
          I18nProvider,
          null,
          h(TeacherDialog, {
            seriesRef: { kind: opts.kind ?? "other", key: "k-1" },
            series: (opts.series ?? SERIES) as never,
            teachers: TEACHERS as never,
            mode,
            teacherId: opts.teacherId,
            onClose: () => {},
          }),
        ),
      ),
    ) as never,
  );
};
const saveBtn = () => [...document.querySelectorAll("button")].find((b) => /^Save$/.test(b.textContent ?? "")) as HTMLButtonElement;
const pickTeacher = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
  await user.click(await screen.findByText(/บี/));
};

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  allowed = () => true;
  patchError = null;
});

describe("🔴 TASK-564 — the scope question, clicked", () => {
  it("🚫 nothing is pre-selected, and with no scope chosen NOTHING is sent", async () => {
    const user = userEvent.setup();
    mount("swap");

    // neither radio is checked when the dialog opens
    const radios = [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios.some((r) => r.checked)).toBe(false);

    await pickTeacher(user);
    // a teacher is chosen but no scope ⇒ the door stays shut
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    expect(sent).toEqual([]);
  });

  /**
 * 🔴 **TASK-577 (D10, Tanya TEST-076) — this test used to assert the dead end.** It read *"no rate on a swap … this door
 * offers no rate box"* and passed — while every save it describes came back `400 RATE_REQUIRED` on sid, because a cover
 * REQUIRES the covering coach's rate and the screen had no way to give one. 🔑 **The pin was faithful to the code and the
 * code was wrong** — which is why the proof is now the whole act: the door is shut, the rate is entered, the PATCH carries it.
 */
  it("🔴 TASK-577 (D10) — SWAP + “this session only” is a COVER: the door waits for the rate, then the PATCH CARRIES it", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    // 🔴 the dead end, now closed at the door instead of at the server: no rate ⇒ shut, and pressing it sends NOTHING
    const box = await waitFor(() => document.querySelector("[data-cover-rate]") as HTMLInputElement);
    expect(box.getAttribute("data-cover-rate")).toBe("none");
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    expect(sent).toEqual([]);

    // 📌 `fireEvent.change`, not `user.type`: Mantine's `NumberInput` is masked and per-keystroke typing does not drive
    // it under happy-dom (TASK-559). 🔑 And the proof is the BODY, not the box — TASK-567's rule.
    fireEvent.change(box, { target: { value: "650" } });
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].method).toBe("PATCH");
    expect(sent[0].url).toBe("/other-series/k-1/teacher");
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "onDate", "rateMinor", "to"]);
    expect(body.from).toBe("t1");
    expect(body.to).toBe("t2");
    // 🔑 satang, and the COVERING coach's — the owner's ruling, at the boundary the server reads
    expect(body.rateMinor).toBe(65000);
  });

  it("🔻 TASK-624 (1b) — …and over the REST of the series the COVER's rate box is not shown, and with the optional series rate left EMPTY no rate is in the body", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    expect(document.querySelectorAll("[data-cover-rate]").length).toBe(0);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "fromDate", "to"]);
    expect(body.rateMinor).toBeUndefined();
  });

  it("🔑 SWAP + “this session and the rest” ⇒ the body carries `fromDate` and no `onDate`", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    expect(Object.keys(sent[0].body as object).sort()).toEqual(["from", "fromDate", "to"]);
  });

  it("🔑 ADD + “this session only” ⇒ `onDate`, and the screen says it is a JOIN (both paid)", async () => {
    const user = userEvent.setup();
    mount("add");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    // the outcome line appears and names the join, not a cover
    expect(await screen.findByText(/joins that session as a second coach/i)).toBeTruthy();
    expect(screen.queryAllByText(/covers for/i).length).toBe(0);

    await user.click(saveBtn());
    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url).toBe("/other-series/k-1/teachers");
    expect(Object.keys(sent[0].body as object).sort()).toEqual(["onDate", "teacherId"]);
  });

  it("🔑 ADD + “the rest” ⇒ `fromDate`, and the one-session outcome line is NOT shown", async () => {
    const user = userEvent.setup();
    mount("add");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    expect(screen.queryAllByText(/joins that session as a second coach/i).length).toBe(0);

    await user.click(saveBtn());
    await waitFor(() => expect(sent.length).toBe(1));
    expect(Object.keys(sent[0].body as object).sort()).toEqual(["fromDate", "teacherId"]);
  });

  it("🔑 SWAP on one session says it is a COVER — B is not teaching it, A is paid", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);

    const note = await screen.findByText(/covers for/i);
    expect(note.textContent).toContain("บี"); // the covering coach
    expect(note.textContent).toContain("เอ"); // the one being covered
    expect(note.textContent?.toLowerCase()).toContain("not teaching");
  });
});

/**
 * 🔴 **TASK-624 (REQ-111 E) + 1b — Swap ANY teacher on the row, and the optional rate on "from here on".**
 *
 * Khwan: *"swap ได้แค่ครูที่เป็น primary … ต้องการให้เลือกคนอื่นได้"* — through the owner. The dialog hard-coded who leaves. 🔑 Every
 * assertion below is about the BODY that left (TASK-559's rule): *who* is named `from`, and *whether* a rate rode.
 */
const optionTexts = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? "");
const pickCoach = async (user: ReturnType<typeof userEvent.setup>, nick: string) => {
  await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
  await user.click(await screen.findByText(new RegExp(nick)));
};
const restRateBox = () => document.querySelector("[data-swap-rate]") as HTMLInputElement | null;
const coverRateBox = () => document.querySelector("[data-cover-rate]") as HTMLInputElement | null;

describe("🔴 TASK-624 — swapping an EXTRA: the dialog says who goes out, and the body names them", () => {
  it("🔑 the title names the teacher whose door was pressed, and the “to” list excludes EVERYONE on the row — the one going out included", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });

    expect(document.body.textContent).toContain("Swap teacher — บี"); // the extra, not the primary
    expect(document.body.textContent).not.toContain("Swap teacher — เอ");

    await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
    await waitFor(() => expect(optionTexts().length).toBeGreaterThan(0));
    const opts = optionTexts().join(" | ");
    expect(opts).toContain("ซี"); // not on the row ⇒ offered
    expect(opts).not.toContain("บี"); // 🔑 the person going OUT is not a candidate to come IN
    expect(opts).not.toContain("เอ"); // nor is the primary
  });

  it("🔑 swapping an EXTRA over the rest posts `from` = THAT extra (never the primary), to = the new coach, one scope key", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].method).toBe("PATCH");
    expect(sent[0].url).toBe("/other-series/k-1/teacher");
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "fromDate", "to"]);
    expect(body.from).toBe("t2");
    expect(body.to).toBe("t3");
  });

  it("🚫 no scope chosen ⇒ NOTHING is sent, for an extra as for the primary", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    await pickCoach(user, "ซี");
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    expect(sent).toEqual([]);
  });

  it("the outcome line on one session names the extra as the one covered", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    const note = await screen.findByText(/covers for/i);
    expect(note.textContent).toContain("ซี"); // the covering coach
    expect(note.textContent).toContain("บี"); // the extra being covered — not the primary
    expect(note.textContent).not.toContain("เอ");
  });

  it("✅ a COVER of an extra is still a cover: the door waits for the rate, the body is { from, onDate, rateMinor, to }", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    const box = await waitFor(() => coverRateBox() as HTMLInputElement);
    expect(restRateBox() === null).toBe(true); // the cover has ITS box, not the series one
    expect(saveBtn().disabled).toBe(true);
    fireEvent.change(box, { target: { value: "650" } });
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "onDate", "rateMinor", "to"]);
    expect(body.from).toBe("t2");
    expect(body.rateMinor).toBe(65000);
  });
});

describe("🔴 TASK-624 — the PRIMARY's swap is unchanged (the widening must be invisible to the use that already worked)", () => {
  it("🔴 the primary's door on a series WITH extras: same body, same scope rules — `from` = the primary", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t1" });
    expect(document.body.textContent).toContain("Swap teacher — เอ");
    await pickCoach(user, "ซี");
    expect(saveBtn().disabled).toBe(true); // no scope ⇒ shut
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "fromDate", "to"]);
    expect(body.from).toBe("t1");
    expect(body.to).toBe("t3");
  });

  it("a caller that names nobody still means the primary (what every earlier test relies on)", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());
    await waitFor(() => expect(sent.length).toBe(1));
    expect((sent[0].body as Record<string, unknown>).from).toBe("t1");
  });
});

describe("🔴 TASK-624 (1b) — an OPTIONAL rate on “from here on”, the group swap's shape (TASK-634)", () => {
  it("🔑 over the REST the optional rate box appears — empty, not required — and a filled one rides as `rateMinor` in satang", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t1" });
    await pickCoach(user, "ซี");
    expect(restRateBox() === null).toBe(true); // nothing chosen ⇒ no box
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);

    const box = await waitFor(() => restRateBox() as HTMLInputElement);
    expect(box.getAttribute("data-swap-rate")).toBe("none"); // 🚫 never pre-filled
    expect(box.required).toBe(false); // 🚫 never a blocker: the server answers from the series' memory when it can
    expect(coverRateBox() === null).toBe(true);
    await waitFor(() => expect(saveBtn().disabled).toBe(false)); // an ordinary swap types nothing

    fireEvent.change(box, { target: { value: "650" } });
    await waitFor(() => expect(restRateBox()!.getAttribute("data-swap-rate")).toBe("65000"));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "fromDate", "rateMinor", "to"]);
    expect(body.rateMinor).toBe(65000);
  });

  it("🔴 a RATE_REQUIRED refusal is ANSWERABLE from the same dialog: the server's sentence shows, the box is there, and the retry carries the rate", async () => {
    const SENTENCE = "ตารางนี้ยังไม่มีค่าสอนของครูคนนี้ — ระบุค่าสอนก่อน";
    patchError = new RealApiClientError("RATE_REQUIRED", SENTENCE, 400);
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(document.body.textContent).toContain(SENTENCE));
    expect((sent[0].body as Record<string, unknown>).rateMinor).toBeUndefined();
    // the dialog stayed open with what was chosen, and the answer is right there
    const box = restRateBox() as HTMLInputElement;
    expect(box === null).toBe(false);
    fireEvent.change(box, { target: { value: "700" } });
    await waitFor(() => expect(restRateBox()!.getAttribute("data-swap-rate")).toBe("70000"));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(2));
    const retry = sent[1].body as Record<string, unknown>;
    expect(retry.from).toBe("t2");
    expect(retry.rateMinor).toBe(70000);
  });

  it("🔑 a rate typed for ONE session does not travel to “the rest” — the series box starts empty", async () => {
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t1" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    fireEvent.change(await waitFor(() => coverRateBox() as HTMLInputElement), { target: { value: "650" } });
    await waitFor(() => expect(coverRateBox()!.getAttribute("data-cover-rate")).toBe("65000"));

    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    const box = await waitFor(() => restRateBox() as HTMLInputElement);
    expect(box.getAttribute("data-swap-rate")).toBe("none");
    // 🔑 and what the box DISPLAYS — a box that shows a carried 650 while sending nothing is the lie this file exists to catch
    expect(box.value).toBe("");
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());
    await waitFor(() => expect(sent.length).toBe(1));
    expect((sent[0].body as Record<string, unknown>).rateMinor).toBeUndefined(); // 🔑 not the cover's 65000
  });

  it("🚫 without the coach-rate permission (key 59) the box is HIDDEN, never greyed, and no `rateMinor` can ride", async () => {
    allowed = (key) => key !== "action:bookings.coach-rate";
    const user = userEvent.setup();
    mount("swap", { series: WITH_EXTRA, teacherId: "t1" });
    await pickCoach(user, "ซี");
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    expect(restRateBox() === null).toBe(true);
    await user.click(saveBtn());
    await waitFor(() => expect(sent.length).toBe(1));
    expect(Object.keys(sent[0].body as object).sort()).toEqual(["from", "fromDate", "to"]);
  });
});

describe("🔴 TASK-624 — the “to” picker's label no longer says the new coach is the PRIMARY", () => {
  /**
   * Swapping an extra puts `otherSeries.swapTo` above the picker, and it used to read "New primary teacher" — false the moment
   * an extra can be swapped. ✅ Corrected by @Porter 2026-10-06 (no owner round; he lists it to the owner as a line he can veto):
   * the approved group string minus "of the group". 🔑 Read on the REAL dialog for an extra, not only in the dictionary.
   */
  it("🔑 swapping an EXTRA shows “New teacher” above the picker — and never “primary”", async () => {
    mount("swap", { series: WITH_EXTRA, teacherId: "t2" });
    const dlg = document.querySelector("[data-teacher-dialog='swap']") as HTMLElement;
    const label = [...dlg.querySelectorAll("label")].map((l) => l.textContent ?? "").join(" | ");
    expect(label).toContain("New teacher");
    expect(label.toLowerCase()).not.toContain("primary");
  });

  it("both languages, the approved words — and the old ones are gone", async () => {
    const { dictionaries } = await import("@/lib/i18n/dictionaries");
    expect(dictionaries.en.otherSeries.swapTo).toBe("New teacher");
    expect(dictionaries.th.otherSeries.swapTo).toBe("ครูคนใหม่");
    expect(dictionaries.en.otherSeries.swapTo).not.toMatch(/primary/i);
    expect(dictionaries.th.otherSeries.swapTo).not.toContain("หลัก");
  });
});

/**
 * 🔴 **TASK-673 (server: TASK-672; found in TASK-624 Q3) — a GROUP swap offers ONLY "from here on".**
 *
 * The group's route has no `onDate`, so "this session only" was never something it could honour: it silently swapped the whole
 * group from today and paid the one-session rate from today onward. The server now refuses it; 🔑 the screen must never OFFER it.
 * Every assertion reads the BODY that left — `onDate` and the cover `rateMinor` must be unable to ride on a group.
 */
describe("🔴 TASK-673 — GROUP swap: one scope, never `onDate`", () => {
  it("🔑 no “this session only” — no scope question at all — and Save posts { to, fromDate }, NEVER `onDate`", async () => {
    const user = userEvent.setup();
    mount("swap", { kind: "group" });
    // the scope question is not asked: no radios, no cover box, no cover-rate prompt
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(document.querySelectorAll("[data-scope-this]").length).toBe(0);
    expect(coverRateBox() === null).toBe(true);
    // …and the date says what it means for the ONE scope there is: "From date" (the existing words, nothing new)
    expect(document.body.textContent).toContain("From date");

    await pickCoach(user, "บี");
    await waitFor(() => expect(saveBtn().disabled).toBe(false)); // no scope click is needed — and none is possible
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].method).toBe("PATCH");
    expect(sent[0].url).toBe("/group-series/k-1/teacher");
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["fromDate", "to"]);
    expect(body.onDate).toBeUndefined();
    expect(body.to).toBe("t2");
    expect(body.rateMinor).toBeUndefined();
  });

  it("the optional series rate is still there on a group (the group swap's own shape) and rides as `rateMinor` — still no `onDate`", async () => {
    const user = userEvent.setup();
    mount("swap", { kind: "group" });
    await pickCoach(user, "บี");
    const box = await waitFor(() => restRateBox() as HTMLInputElement);
    expect(box.getAttribute("data-swap-rate")).toBe("none");
    fireEvent.change(box, { target: { value: "650" } });
    await waitFor(() => expect(restRateBox()!.getAttribute("data-swap-rate")).toBe("65000"));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["fromDate", "rateMinor", "to"]);
    expect(body.rateMinor).toBe(65000);
    expect(body.onDate).toBeUndefined();
  });

  it("✅ unchanged: ADD on a GROUP still asks the question (the add route takes `onDate`) — both scopes, none pre-selected", async () => {
    mount("add", { kind: "group" });
    const radios = [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios.some((r) => r.checked)).toBe(false);
  });

  it("✅ unchanged: an OTHER series' swap still offers BOTH scopes, nothing pre-selected, and its cover still needs a rate", async () => {
    const user = userEvent.setup();
    mount("swap", { kind: "other" });
    const radios = [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios.some((r) => r.checked)).toBe(false);
    await pickCoach(user, "บี");
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    await waitFor(() => expect(coverRateBox() === null).toBe(false)); // the one-session cover is still an OTHER-series act
    expect(saveBtn().disabled).toBe(true);
  });
});
