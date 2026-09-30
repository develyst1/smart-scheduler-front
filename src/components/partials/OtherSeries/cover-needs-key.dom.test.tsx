import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 5 (TASK-584 BE → TASK-592 FE) — a COVER needs the rate permission, clicked on the identity that lacks it.**
 *
 * The owner ruled **(a)**: a cover is paid at the covering coach's rate, so it requires key 59. **The server already refuses
 * it** ⇒ 🔑 **this file proves the SCREEN says so instead of sending a body it knows will 403.**
 *
 * 📌 **Why a whole file of its own:** `mock.module` is global to the process, so an identity **without** the key cannot live
 * in `series-scope.dom.test.tsx`, which mocks `useCan` to grant everything. *Two identities, two processes — the alternative
 * would be a mutable mock, and a test whose identity depends on execution order is not a test of an identity.*
 */

const sent: Array<{ method: string; url: string; body?: unknown }> = [];

const SERIES = {
  key: "k-1",
  teacherId: "t1",
  additionalTeacherIds: [] as string[],
  teacherRates: {} as Record<string, number>,
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
/** 🔑 The identity under test: every key EXCEPT the coach rate. */
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({
  ...realMe,
  useCan: () => (action: string) => action !== "action:bookings.coach-rate",
}));

const { TeacherDialog } = await import("./OtherSeriesDialogs");

const mount = (mode: "add" | "swap") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(TeacherDialog, { seriesRef: { kind: "other", key: "k-1" }, series: SERIES as never, teachers: TEACHERS as never, mode, onClose: () => {} }))),
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

describe("🔴 TASK-592 — without the rate permission, a cover is EXPLAINED, not attempted", () => {
  it("🔑 the sentence names the PERMISSION, there is no rate box, and NOTHING is sent", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);

    const box = await waitFor(() => {
      const el = document.querySelector("[data-cover-needs-key]") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // 🔑 the permission is what is missing — 🚫 not the coach, 🚫 not the rate
    expect(box.textContent).toMatch(/permission/i);
    expect(box.textContent).not.toMatch(/บี|invalid rate|wrong/i);
    // 🚫 no rate box at all for this identity (they could not use one)
    expect(document.querySelector("[data-cover-rate]")).toBeNull();

    // 🔴 two guards: the Save is shut, and pressing it anyway sends NOTHING
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    expect(sent).toEqual([]);
  });

  it("✅ the WHOLE-SERIES swap is untouched for the same admin — this gates the COVER only", async () => {
    const user = userEvent.setup();
    mount("swap");
    await pickTeacher(user);
    await user.click(document.querySelector("[data-scope-rest]") as HTMLElement);

    // no permission sentence, because no rate is involved over the rest of the series
    expect(document.querySelector("[data-cover-needs-key]")).toBeNull();
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "fromDate", "to"]);
    // 🚫 and no rate rides for an admin without the key — `withoutRates` still strips, as it always did
    expect(body.rateMinor).toBeUndefined();
  });

  it("✅ ADD on one session is untouched too — a JOIN is paid at each coach's own rate, and its rate box was always optional", async () => {
    const user = userEvent.setup();
    mount("add");
    await pickTeacher(user);
    await user.click(document.querySelector("[data-scope-this]") as HTMLElement);

    expect(document.querySelector("[data-cover-needs-key]")).toBeNull();
    // the optional rate box is hidden without the key, exactly as before TASK-592 (REQ-102 §8)
    expect([...document.querySelectorAll("input")].some((i) => /฿/.test(i.getAttribute("value") ?? ""))).toBe(false);
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());

    await waitFor(() => expect(sent.length).toBe(1));
    const body = sent[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["onDate", "teacherId"]);
  });
});
