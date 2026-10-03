import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 1 (TASK-557) — a make-up must be bulk-confirmable.**
 *
 * The server has accepted **PENDING or EXTENDED** since TASK-389; the table ticked **PENDING only**, in three places.
 * 🔑 **Why this is a clicked test and not a render one:** the failure mode this task must rule out is *"the tick appears
 * but select-all / the id list ignores it"* — a screen that looks fixed and confirms the wrong set. **Only pressing it
 * and reading the request can tell those apart**, which is TASK-518's, TASK-531's and TASK-554's lesson.
 */

const posts: Array<{ url: string; body: unknown }> = [];
const ROWS = [
  { id: "bk-pending", status: "PENDING" },
  { id: "bk-extended", status: "EXTENDED" },
  { id: "bk-confirmed", status: "CONFIRMED" },
  { id: "bk-attended", status: "ATTENDED" },
  { id: "bk-cancelled", status: "CANCELLED" },
].map((r, i) => ({
  ...r,
  displayName: `เด็ก ${i + 1}`,
  subject: "Onewheel",
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  date: "2026-09-29",
  startTime: "10:00",
  endTime: "11:00",
  bookingType: "COURSE_PACKAGE",
  badges: [],
}));
/** TASK-621 — what the next list read returns. A test may make the reload drop the rows it just confirmed. */
let listed = ROWS;
let reloadDropsConfirmed = false;

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: { items: [], total: 0 } }),
    post: async (url: string, body: unknown) => {
      posts.push({ url, body });
      const ids = (body as { ids: string[] }).ids;
      if (!reloadDropsConfirmed) return { data: { results: ids.map((id) => ({ id, outcome: "confirmed" })) } };
      // the make-up is skipped (it stays in the list); every other id is confirmed and leaves the filtered list
      const results = ids.map((id) => ({ id, outcome: id === "bk-extended" ? "skipped" : "confirmed" }));
      listed = listed.filter((r) => !results.some((x) => x.id === r.id && x.outcome === "confirmed"));
      return { data: { results } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
/** The rows and the teachers come from hooks; the act under test is the SELECTION and the one call it makes. */
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }] }),
  useAllBookings: () => ({ data: { items: listed, total: listed.length }, isLoading: false, isPlaceholderData: false }),
}));

const BookingsTable = (await import("./BookingsTable")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(BookingsTable, null)))) as never);
};
const rowTicks = () => [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
const bulkCall = () => posts.find((p) => p.url === "/bookings/bulk-confirm");
/**
 * `useConfirm`'s primary button. 📌 Scoped to the dialog on purpose: the toolbar button and the dialog's confirm carry
 * the SAME label (`bookings.bulkConfirmSelected`), so a text match would find two and the test would pass by luck.
 */
const pressDialogConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
  const dialog = await waitFor(() => {
    const d = document.querySelector('[role="dialog"]');
    expect(d).toBeTruthy();
    return d as HTMLElement;
  });
  const btn = [...dialog.querySelectorAll("button")].find((b) => /selected|ที่เลือก/i.test(b.textContent ?? ""));
  await user.click(btn as HTMLElement);
};

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
  listed = ROWS;
  reloadDropsConfirmed = false;
});

describe("🔴 TASK-557 — a mixed selection, actually clicked", () => {
  it("🔑 tick a PENDING row AND an EXTENDED row ⇒ BOTH ids go in ONE call", async () => {
    const user = userEvent.setup();
    mount();

    // the header box plus one tick per CONFIRMABLE row — two rows, not five
    await waitFor(() => expect(rowTicks().length).toBe(3));
    const [, pending, extended] = rowTicks();

    await user.click(pending);
    await user.click(extended);

    const submit = [...document.querySelectorAll("button")].find((b) => /selected|เลือก/i.test(b.textContent ?? "")) as HTMLElement;
    await user.click(submit);
    await pressDialogConfirm(user);

    await waitFor(() => expect(bulkCall()).toBeTruthy());
    expect((bulkCall()!.body as { ids: string[] }).ids).toEqual(["bk-pending", "bk-extended"]);
    // exactly ONE call — never one per row
    expect(posts.filter((p) => p.url === "/bookings/bulk-confirm").length).toBe(1);
  });

  it("✅ the frame still holds: CONFIRMED, ATTENDED and CANCELLED rows have NO tick at all", async () => {
    mount();
    await waitFor(() => expect(rowTicks().length).toBe(3)); // 1 header + 2 confirmable, out of 5 rows
    // the cells of the three non-confirmable rows are empty — absent, not disabled
    const cells = [...document.querySelectorAll('td[data-pin="lead"]')];
    expect(cells.length).toBe(5);
    expect(cells.filter((c) => c.querySelector('input[type="checkbox"]')).length).toBe(2);
  });

  it("🔑 “select all” means every CONFIRMABLE row — and it picks up the make-up too", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rowTicks().length).toBe(3));
    const [header, pending, extended] = rowTicks();

    await user.click(header);
    await waitFor(() => expect(pending.checked && extended.checked).toBe(true));

    // and it is a toggle: pressing it again clears the selection
    await user.click(header);
    await waitFor(() => expect(pending.checked || extended.checked).toBe(false));
  });

  it("the header box is INDETERMINATE on a partial selection, and checked when both are in", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rowTicks().length).toBe(3));
    const [header, pending, extended] = rowTicks();

    await user.click(pending);
    await waitFor(() => expect(header.getAttribute("data-indeterminate")).toBe("true"));
    await user.click(extended);
    await waitFor(() => expect(header.checked).toBe(true));
  });
});

describe("🔴 TASK-621 — the results dialog names every booking, even after the list reloads without it", () => {
  /**
   * Khwan's screenshot: with a status filter on, the rows she had just confirmed LEFT the list when it reloaded, so a
   * name looked up in the live list missed and the dialog printed the raw booking id. SKIPPED rows kept their names
   * because they never left. 🔑 The reload is what breaks it, so the reload is what this test performs.
   */
  it("🔑 confirm two rows, the reload drops the confirmed one ⇒ every result line shows a name, never an id", async () => {
    reloadDropsConfirmed = true;
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rowTicks().length).toBe(3));
    const [, pending, extended] = rowTicks();
    await user.click(pending);
    await user.click(extended);

    const submit = [...document.querySelectorAll("button")].find((b) => /selected|เลือก/i.test(b.textContent ?? "")) as HTMLElement;
    await user.click(submit);
    await pressDialogConfirm(user);

    await waitFor(() => expect(bulkCall()).toBeTruthy());
    // the confirmed row really is gone from the list — the condition the bug needs
    expect(listed.some((r) => r.id === "bk-pending")).toBe(false);
    const dialog = await waitFor(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.querySelector(".mantine-Badge-root"));
      expect(d).toBeTruthy();
      return d as HTMLElement;
    });
    expect(dialog.textContent).toContain("เด็ก 1"); // confirmed, no longer listed
    expect(dialog.textContent).toContain("เด็ก 2"); // skipped, still listed
    expect(dialog.textContent).not.toContain("bk-");
  });
});
