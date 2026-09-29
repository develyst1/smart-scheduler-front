import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 7 (TASK-559) — the camp week editor's per-coach RATE BOX was cut off** on Khwan's desktop: a
 * six-column table inside a `size="lg"` modal, with the rate as the **last** column.
 *
 * 🔑 **What this file proves and what it cannot.** It proves the **control**: the rate input exists for the coach on the
 * day, is reachable, **takes a value**, and the dialog asks for the width rule with both facts. ⚠️ **It cannot prove
 * PIXELS** — happy-dom has no layout engine, so *"is 1472px wide enough for six columns at 1920"* is not answerable here
 * and is stated as Tanya's in the report. **Saying which half is proven is the point of the file.**
 */

const patches: Array<{ url: string; body: unknown }> = [];
const WEEK = { id: "w-1", name: "Camp 1", startDate: "2026-10-05", endDate: "2026-10-07", capacity: 12, teacherIds: ["t1"], windowStart: "10:00", windowEnd: "15:00" };
const DAYS = {
  days: [
    {
      date: "2026-10-05",
      campWeekDayId: "cwd-1",
      teacherIds: ["t1"],
      startTime: "10:00",
      endTime: "15:00",
      editedAt: null,
      teacherRates: { t1: 50000 }, // 500 ฿ — the server sent rates, so the column shows
      teachers: [{ teacherId: "t1", startTime: "10:00", endTime: "15:00" }],
    },
  ],
};

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: DAYS }),
    patch: async (url: string, body: unknown) => {
      patches.push({ url, body });
      return { data: { ok: true } };
    },
  },
}));
/** The rate box needs key 59; the gating itself is pinned in the fast tests. */
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME", subjects: [], subjectOptions: [], active: true, lineLinked: false, workDays: [] }] }),
}));
const realCamp = await import("@/hooks/scheduler/useCamp");
mock.module("@/hooks/scheduler/useCamp", () => ({
  ...realCamp,
  useCampWeekDays: () => ({ data: DAYS, isLoading: false }),
  useCreateCampWeek: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  useUpdateCampWeek: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  useUpdateCampWeekDay: () => ({ isPending: false, mutateAsync: async (v: unknown) => patches.push({ url: "/camp/day", body: v }) }),
}));

const OpenWeekDialog = (await import("./OpenWeekDialog")).default;

const mount = (week: unknown) =>
  render(h(MantineProvider, null, h(I18nProvider, null, h(OpenWeekDialog, { opened: true, week: week as never, onClose: () => {} }))) as never);
const rateBox = () => document.querySelector("[data-rate-box='t1']") as HTMLInputElement;

afterEach(cleanup);
beforeEach(() => {
  patches.length = 0;
});

describe("🔴 TASK-559 — the camp rate box, actually used", () => {
  it("🔑 the rate box is there for the coach on the day, and it TAKES a value", async () => {
    const user = userEvent.setup();
    mount(WEEK);

    await waitFor(() => expect(rateBox()).toBeTruthy());
    // prefilled from the server in baht (50000 satang ⇒ 500), never blank
    expect(rateBox().value).toContain("500");

    // 📌 `fireEvent.change`, not `user.type`: Mantine's `NumberInput` is a masked input and **user-event's per-keystroke
    // typing does not drive its `onChange` under happy-dom** — I found that by watching a mutation that emptied the
    // handler (`onChange={() => {}}`) still pass a typing test. A harness limit worth knowing before the next one.
    fireEvent.change(rateBox(), { target: { value: "650" } });
    await waitFor(() => expect(rateBox().value).toContain("650"));

    /**
     * 🔑 **And the value has to LAND, not merely appear.** The input's own text is not proof: Mantine's `NumberInput`
     * keeps its display value, so a handler wired to nothing still looks right on screen — I found that by mutating
     * `onChange` to `() => {}` and watching this test pass. So the assertion is the SAVE: the per-day PATCH must carry
     * the new rate in satang. *A box that shows what you typed and forgets it is the same class of lie as a clipped one.*
     */
    const save = [...document.querySelectorAll("button")].find((b) => /^Save$|บันทึก/.test(b.textContent ?? "")) as HTMLElement;
    await user.click(save);
    await waitFor(() => expect(patches.length).toBeGreaterThan(0));
    expect(JSON.stringify(patches[0].body)).toContain("65000");
  });

  it("🔑 the dialog is WIDE when the rate column is shown — the rule reaches the DOM, not just the source", async () => {
    mount(WEEK);
    await waitFor(() => expect(rateBox()).toBeTruthy());
    // 📌 Mantine carries `size` as the `--modal-size` custom property; which element holds it is its business, so the
    // assertion is that **the viewport-capped rule reached the rendered document at all** — not where it landed.
    expect(document.body.innerHTML).toContain("min(92rem, 94vw)");
  });

  it("🚫 …and NARROW when there are no rates — a dialog that was not broken is not widened", async () => {
    // the same week with the rates MASKED (the server sends `null` without the key)
    const masked = { days: [{ ...DAYS.days[0], teacherRates: null }] };
    const realCamp2 = await import("@/hooks/scheduler/useCamp");
    mock.module("@/hooks/scheduler/useCamp", () => ({ ...realCamp2, useCampWeekDays: () => ({ data: masked, isLoading: false }) }));
    const Fresh = (await import("./OpenWeekDialog")).default;
    render(h(MantineProvider, null, h(I18nProvider, null, h(Fresh, { opened: true, week: WEEK as never, onClose: () => {} }))) as never);

    await waitFor(() => expect(document.querySelector("[data-day-table]")).toBeTruthy());
    expect(document.querySelector("[data-rate-box='t1']")).toBeNull();
    expect(document.body.innerHTML).not.toContain("92rem");
  });
});
