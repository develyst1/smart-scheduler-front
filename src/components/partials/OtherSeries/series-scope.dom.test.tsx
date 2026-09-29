import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
const SERIES = {
  key: "k-1",
  teacherId: "t1",
  additionalTeacherIds: [] as string[],
  rows: [{ date: "2026-10-05", status: "CONFIRMED" }],
};
const TEACHERS = [
  { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME", bookable: true },
  { id: "t2", name: "ครูบี", nickname: "บี", type: "FULL_TIME", bookable: true },
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
      return { data: { moved: 1 } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const { TeacherDialog } = await import("./OtherSeriesDialogs");

const mount = (mode: "add" | "swap") => {
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
            seriesRef: { kind: "other", key: "k-1" },
            series: SERIES as never,
            teachers: TEACHERS as never,
            mode,
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

  it("🔑 SWAP + “this session only” ⇒ the body carries `onDate` and no `fromDate`", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);

    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].method).toBe("PATCH");
    expect(sent[0].url).toBe("/other-series/k-1/teacher");
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "onDate", "to"]);
    expect(body.from).toBe("t1");
    expect(body.to).toBe("t2");
    // 🚫 no rate on a swap: the server allows a cover's rate only with `onDate`, and this door offers no rate box
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
    expect(screen.queryByText(/covers for/i)).toBeNull();

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
    expect(screen.queryByText(/joins that session as a second coach/i)).toBeNull();

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
