import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-624 (REQ-111 E) — the Swap door beside EVERY teacher on the row.**
 *
 * Today the door was drawn only beside the primary; each extra got Remove and nothing else. 🔑 **The doors are derived from
 * the ROW's teachers, not from an enumerated list of two** — a third teacher gets a third door without anyone editing this.
 * 🚫 And a GROUP series gets the primary's door only: its route (`PATCH /group-series/:key/teacher`) carries no `from`, so a
 * door beside a group's extra would swap the PRIMARY and say it swapped the extra.
 * Clicked, not rendered: what must be ruled out is a door that LOOKS right and names the wrong person.
 */

let allowed: (key: string) => boolean = () => true;
const gets: string[] = [];

const row = (id: string, teacherId: string, extras: string[]) => ({ bookingId: id, date: "2026-10-12", status: "CONFIRMED", teacherId, additionalTeacherIds: extras });
const series = (key: string, extras: string[]) => ({
  key,
  title: "ECA",
  kind: null,
  headCount: 6,
  startTime: "10:00:00",
  teacherId: "t1",
  additionalTeacherIds: extras,
  teacherRates: { t1: 50000 },
  rows: [row("b1", "t1", extras)],
});
const TEACHERS = [
  { id: "t1", name: "ครูเอ", nickname: "เอ" },
  { id: "t2", name: "ครูบี", nickname: "บี" },
  { id: "t3", name: "ครูซี", nickname: "ซี" },
  { id: "t4", name: "ครูดี", nickname: "ดี" },
].map((x) => ({ ...x, type: "FULL_TIME", subjects: [], subjectOptions: [], active: true, lineLinked: false, workDays: [], bookable: true }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      gets.push(url);
      if (url === "/other-series/k-1") return { data: series("k-1", ["t2", "t3"]) };
      if (url === "/group-series/g-1") return { data: { ...series("g-1", ["t2"]), kind: "DUO" } };
      return { data: {} };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => allowed(key) }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS }),
  useAllBookings: () => ({ data: { items: [], total: 0 }, isLoading: false, isPlaceholderData: false }),
}));

const OtherSeriesModal = (await import("./OtherSeriesModal")).default;

const mount = (ref: { kind: "other" | "group"; key: string }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(OtherSeriesModal, { series: ref, opened: true, onClose: () => {}, onOpenBooking: () => {} })))) as never,
  );
};
const doorIds = () => [...document.querySelectorAll("[data-swap-teacher]")].map((d) => d.getAttribute("data-swap-teacher"));
const teachersOnRow = () => (document.querySelector("[data-teachers]") as HTMLElement).getAttribute("data-teachers")!.split(",");
/** The swap dialog's own text (its root carries `data-teacher-dialog`; the title is inside it). Empty until it is open. */
const dialogTitle = () => (document.querySelector("[data-teacher-dialog='swap']") as HTMLElement | null)?.textContent ?? "";

beforeEach(() => {
  allowed = () => true;
  gets.length = 0;
});
afterEach(cleanup);

describe("🔴 TASK-624 — a Swap door beside EVERY teacher on the row", () => {
  it("🔑 one door per teacher on the row — the primary AND each extra — derived from the row, each carrying ITS teacher", async () => {
    mount({ kind: "other", key: "k-1" });
    await waitFor(() => expect(document.querySelector("[data-teachers]")).toBeTruthy());

    expect(teachersOnRow()).toEqual(["t1", "t2", "t3"]);
    expect(doorIds()).toEqual(teachersOnRow()); // same teachers, same order — not an enumerated pair
  });

  it("🔑 pressing an EXTRA's door opens the dialog naming THAT extra; pressing the primary's names the primary", async () => {
    const user = userEvent.setup();
    mount({ kind: "other", key: "k-1" });
    await waitFor(() => expect(doorIds().length).toBe(3));

    await user.click(document.querySelector('[data-swap-teacher="t3"]') as HTMLElement);
    await waitFor(() => expect(dialogTitle()).toContain("Swap teacher — ซี"));
    expect(dialogTitle()).not.toContain("เอ");
  });

  it("the primary's own door still opens the dialog for the primary", async () => {
    const user = userEvent.setup();
    mount({ kind: "other", key: "k-1" });
    await waitFor(() => expect(doorIds().length).toBe(3));
    await user.click(document.querySelector('[data-swap-teacher="t1"]') as HTMLElement);
    await waitFor(() => expect(dialogTitle()).toContain("Swap teacher — เอ"));
  });

  it("🚫 a GROUP series has the primary's door only — its route has no `from`, so a door on an extra would swap the wrong person", async () => {
    mount({ kind: "group", key: "g-1" });
    await waitFor(() => expect(document.querySelector("[data-teachers]")).toBeTruthy());
    expect(teachersOnRow()).toEqual(["t1", "t2"]); // the group HAS an extra …
    expect(doorIds()).toEqual(["t1"]); // … and it gets no Swap
    expect(gets).toContain("/group-series/g-1");
  });

  it("hidden, not greyed, without the edit key: no doors at all", async () => {
    allowed = (key) => key !== "action:calendar.booking-edit";
    mount({ kind: "other", key: "k-1" });
    await waitFor(() => expect(document.querySelector("[data-teachers]")).toBeTruthy());
    expect(doorIds()).toEqual([]);
  });
});
