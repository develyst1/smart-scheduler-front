import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import type { LeaveDayRow } from "@/types/api/contract";

/**
 * 🔴 **TASK-814 — the admin's "Cancel leave" on a FUTURE chip of the leave strip.**
 *
 * 🔑 **The dangerous failures are invisible on screen, so every assertion is on the REQUEST and the OFFER:** a button on a
 * today/past chip (the server would refuse it, and the admin would read a 400), a button without the key, a confirm that sends
 * nothing, a "Keep leave" that sends something, and a success that leaves the chip standing. The strip is read through the REAL
 * `useLeaveDays` against a faked wire, so "the chip is gone" proves the refresh as well as the call.
 * 📌 Every helper answers a BOOLEAN or a string, never an element: a failed `waitFor` would print the whole DOM.
 */

let allowed = true;
const calls: Array<{ method: string; url: string }> = [];
let store: LeaveDayRow[] = [];
let deleteAnswer: () => Promise<{ data: unknown }> = async () => ({ data: { lifted: true, teacherNotified: 1 } });

const toasts: string[] = [];
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string }) => void toasts.push(o.title) }));

const realMe = await import("@/hooks/scheduler/useMe");
// 🔻 TASK-821, declared: the panel now reads the menu set (for its "See all teacher leave →" link) through the REAL `useMe`, so the tree gets a real SessionProvider holding an admin
// who has the Teachers menu. 🚫 `useMe` itself is never replaced: `mock.module` is process-global, and a stub of it leaks into other files (it broke TASK-726's header test).
let menus: string[] = ["menu:teachers"];
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus, actions: [], roleName: null, teacherId: null });

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      calls.push({ method: "GET", url });
      if (url === "/me") return { data: { user: meUser() } };
      return { data: { items: store } };
    },
    delete: async (url: string) => {
      calls.push({ method: "DELETE", url });
      const res = await deleteAnswer();
      const [, , teacherId, date] = url.split("/"); // "", "teacher-leave-days", <teacher>, <date>
      store = store.filter((r) => !(r.teacherId === teacherId && r.date === date));
      return res;
    },
  },
}));

const { default: LeaveDayBanner } = await import("./LeaveDayBanner");
const { useLeaveDays } = await import("@/hooks/scheduler");

const day = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");
const row = (teacherId: string, teacherName: string, date: string): LeaveDayRow => ({ teacherId, teacherName, date, reason: null, createdBy: null, bookings: [] });
const DATES = [-2, -1, 0, 1, 2, 3].map(day);

/** The banner fed by the real read, like `CalendarContent` does. */
const Strip = () => {
  const { data } = useLeaveDays(DATES[0], DATES[DATES.length - 1], true);
  return h(LeaveDayBanner, { rows: data, dates: DATES });
};
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(Strip))))) as never);
};
const cancelSel = (teacherId: string, date: string) => `[data-leave-cancel="${teacherId}|${date}"]`;
const hasBtn = (teacherId: string, date: string) => document.querySelectorAll(cancelSel(teacherId, date)).length > 0;
const hasChip = (teacherId: string, date: string) => document.querySelectorAll(`[data-leave-marker="${teacherId}|${date}"]`).length > 0;
const hasConfirm = () => document.querySelectorAll("[data-lift-leave-confirm]").length > 0;
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
// 🔻 TASK-820, declared: the Cancel button moved from the chip INTO the leave panel the chip opens. ✅ Everything this file proves about the button and its confirm is unchanged;
// only the way to reach it gained one step — press the chip, wait for its panel.
const openPanel = async (teacherId: string, date: string) => {
  await waitFor(() => expect(document.querySelectorAll(`[data-leave-open="${teacherId}|${date}"]`).length).toBe(1));
  await click(document.querySelector(`[data-leave-open="${teacherId}|${date}"]`));
  await waitFor(() => expect(document.querySelectorAll(`[data-leave-panel="${teacherId}|${date}"]`).length).toBe(1));
};
const open = async (teacherId: string, date: string) => {
  await openPanel(teacherId, date);
  await waitFor(() => expect(hasBtn(teacherId, date)).toBe(true));
  await click(document.querySelector(cancelSel(teacherId, date)));
  await waitFor(() => expect(hasConfirm()).toBe(true));
};
const text = () => document.body.textContent ?? "";
const deletes = () => calls.filter((c) => c.method === "DELETE");

afterEach(cleanup);
beforeEach(() => {
  toasts.length = 0;
  allowed = true;
  calls.length = 0;
  store = [row("t1", "เอ", day(-1)), row("t2", "บี", day(0)), row("t1", "เอ", day(1)), row("t3", "ซี", day(3))];
  deleteAnswer = async () => ({ data: { lifted: true, teacherNotified: 1 } });
});

describe("🔴 TASK-814 — who is OFFERED the button", () => {
  it("a FUTURE chip carries it; a TODAY chip and a PAST chip do not (and all the chips are still drawn)", async () => {
    wrap();
    await waitFor(() => expect(hasChip("t1", day(1))).toBe(true));
    expect([hasChip("t1", day(-1)), hasChip("t2", day(0))]).toEqual([true, true]);
    // each chip's panel is opened in turn (Escape closes it): the button is offered inside it, for a future day only
    const offered = async (t: string, d: string) => {
      await openPanel(t, d);
      const there = hasBtn(t, d);
      await userEvent.setup().keyboard("{Escape}");
      await waitFor(() => expect(document.querySelectorAll("[data-leave-panel]").length).toBe(0));
      return there;
    };
    expect([await offered("t1", day(1)), await offered("t3", day(3))]).toEqual([true, true]);
    expect([await offered("t2", day(0)), await offered("t1", day(-1))]).toEqual([false, false]);
  });

  it("without `action:calendar.status` NO chip carries it — the chips are still there", async () => {
    allowed = false;
    wrap();
    await waitFor(() => expect(hasChip("t1", day(1))).toBe(true));
    await openPanel("t1", day(1)); // the panel still opens (it is the LEAVE's own view) — it just carries no Cancel
    expect(document.querySelectorAll("[data-leave-cancel]").length).toBe(0);
  });
});

describe("🔴 TASK-814 — the confirm and the request", () => {
  it("🔑 pressing the button only OPENS the confirm (approved words, this teacher and date); nothing is sent yet", async () => {
    wrap();
    await open("t1", day(1));
    expect(text()).toContain(`Cancel เอ's leave on ${day(1)}?`);
    expect(text()).toContain("That day opens for bookings with this teacher again. Existing classes don't change. The teacher is told on LINE.");
    expect(deletes().length).toBe(0);
  });

  it("🔑 confirm → ONE `DELETE /teacher-leave-days/<teacher>/<date>`, the chip is GONE after the refresh, the told-toast shows", async () => {
    wrap();
    await open("t1", day(1));
    await click(document.querySelector("[data-lift-leave-confirm]"));
    await waitFor(() => expect(hasChip("t1", day(1))).toBe(false));
    expect(deletes().map((c) => c.url)).toEqual([`/teacher-leave-days/t1/${day(1)}`]);
    // the strip was RE-READ, not just hidden; the other future chip and the past/today chips stand
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1);
    expect([hasChip("t3", day(3)), hasChip("t2", day(0))]).toEqual([true, true]);
    await waitFor(() => expect(toasts).toEqual(["Leave cancelled — the teacher was told on LINE"]));
  });

  it("🔑 `teacherNotified: 0` ⇒ the NOT-told toast (the admin must tell them), never the told one", async () => {
    deleteAnswer = async () => ({ data: { lifted: true, teacherNotified: 0 } });
    wrap();
    await open("t3", day(3));
    await click(document.querySelector("[data-lift-leave-confirm]"));
    await waitFor(() => expect(toasts).toEqual(["Leave cancelled — the teacher has no LINE link, please tell them yourself"]));
  });

  it("🔑 a server that sends NO `teacherNotified` is read the safe way: the NOT-told toast", async () => {
    deleteAnswer = async () => ({ data: { lifted: true } });
    wrap();
    await open("t3", day(3));
    await click(document.querySelector("[data-lift-leave-confirm]"));
    await waitFor(() => expect(toasts).toEqual(["Leave cancelled — the teacher has no LINE link, please tell them yourself"]));
  });

  it("🔑 `Keep leave` sends NOTHING and the chip stays", async () => {
    wrap();
    await open("t1", day(1));
    const keep = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Keep leave");
    await click(keep ?? null);
    await waitFor(() => expect(hasConfirm()).toBe(false));
    expect(deletes().length).toBe(0);
    expect(hasChip("t1", day(1))).toBe(true);
  });

  it("🔑 a REFUSAL keeps the chip, shows the server's own sentence in the dialog, and is never a success toast", async () => {
    deleteAnswer = async () => {
      throw new Error("Only a future leave day can be cancelled. Today's or a past leave can't be cancelled");
    };
    wrap();
    await open("t1", day(1));
    await click(document.querySelector("[data-lift-leave-confirm]"));
    await waitFor(() => expect(document.querySelector("[data-lift-leave-error]")?.textContent ?? "").toContain("Only a future leave day can be cancelled"));
    expect(toasts).toEqual([]);
    expect(hasChip("t1", day(1))).toBe(true);
  });
});
