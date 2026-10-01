import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 6 (TASK-571) — moving a course's start date, clicked.**
 *
 * 🔑 Three things only a click can show: **no request before the admin confirms**, **exactly one when they do**, and
 * **the skipped weeks rendered from the server's own answer** rather than from anything the page worked out.
 * 🚫 And a refusal must leave the course untouched with the server's sentence on screen.
 */

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let refuseWith: Error | null = null;
let refusePreviewWith: Error | null = null;
/** 🔻 TASK-574 — the forecast the read-only route answers: the same plan, plus `forecast: true`. */
let forecastAnswer: unknown = {
  moves: [
    { id: "bk-1", from: "2026-10-06", to: "2026-11-03", status: "CONFIRMED", toStatus: "PENDING" },
    { id: "bk-2", from: "2026-10-13", to: "2026-11-10", status: "PENDING", toStatus: "PENDING" },
  ],
  expiryDate: "2026-12-20",
  previousExpiryDate: "2026-12-06",
  needsReconfirm: 3,
  skippedForLeave: ["2026-11-17"],
  forecast: true,
};
let answer: unknown = {
  moved: 6,
  startDate: "2026-11-03",
  expiryDate: "2026-12-20",
  previousExpiryDate: "2026-12-06",
  needsReconfirm: 3,
  skippedForLeave: ["2026-11-17"],
};
/** The expiry history — one row with an actor means a PERSON set the date (the system's rows carry `null`). */
let history: unknown = [{ fromDate: "2026-12-01", toDate: "2026-12-06", actor: "admin", changedAt: "2026-09-20T03:00:00.000Z" }];

class FakeApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      sent.push({ method: "GET", url, body: null });
      return { data: history };
    },
    post: async (url: string, body: unknown) => {
      sent.push({ method: "POST", url, body });
      if (url.endsWith("/start-date/preview")) {
        if (refusePreviewWith) throw refusePreviewWith;
        return { data: forecastAnswer };
      }
      if (refuseWith) throw refuseWith;
      return { data: answer };
    },
  },
  ApiClientError: FakeApiError,
}));

const ChangeStartDateDialog = (await import("./ChangeStartDateDialog")).default;

const COURSE = { id: "c-1", studentName: "น้องบีม", usedSessions: 0, status: "ACTIVE", expiryDate: "2026-12-06" };
const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(ChangeStartDateDialog, { course: COURSE as never, onClose: () => {} })))) as never,
  );
};
const confirmBtn = () => document.querySelector("[data-start-confirm]") as HTMLButtonElement;
const previewBtn = () => document.querySelector("[data-start-preview]") as HTMLButtonElement;
const commits = () => sent.filter((r) => r.method === "POST" && r.url === "/courses/c-1/start-date");
const previews = () => sent.filter((r) => r.method === "POST" && r.url.endsWith("/start-date/preview"));
/** 🔻 TASK-574 — the commit is unreachable until a forecast exists, so every commit test asks for one first. */
const askPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(previewBtn());
  await waitFor(() => expect(previews().length).toBe(1));
};
const posts = () => sent.filter((r) => r.method === "POST");
/** Pick a date through the calendar popover — the widget emits the value; nothing is typed. */
const pickADate = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText(/new start date/i));
  const day = await waitFor(() => {
    const d = [...document.querySelectorAll("table button")].find((b) => b.textContent === "15");
    expect(d).toBeTruthy();
    return d as HTMLElement;
  });
  await user.click(day);
};

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  refuseWith = null;
  refusePreviewWith = null;
  history = [{ fromDate: "2026-12-01", toDate: "2026-12-06", actor: "admin", changedAt: "2026-09-20T03:00:00.000Z" }];
});

describe("🔴 TASK-571 — the start-date move, clicked", () => {
  it("🔴 the stale-schedule warning is on screen BEFORE anything is sent, and no POST exists yet", async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByText(/nobody is told by this move/i)).toBeTruthy();
    expect(screen.getByText(/until you run confirm course/i)).toBeTruthy();
    // ⚠️ the hand-set expiry is named too, because the history says a person set it
    expect(await screen.findByText(/set this course's expiry date by hand/i)).toBeTruthy();
    // 🚫 nothing has been asked of the server except the one read the warning needed
    expect(posts()).toEqual([]);
    // 🔻 TASK-574 — shut for TWO reasons now: no date, and no forecast.
    expect(confirmBtn().disabled).toBe(true);
    expect(previewBtn().disabled).toBe(true);
  });

  it("🔻 TASK-574 — a date alone does NOT open the commit: the forecast has to be asked for first", async () => {
    const user = userEvent.setup();
    mount();
    await pickADate(user);

    // the preview is now reachable; the commit is not
    await waitFor(() => expect(previewBtn().disabled).toBe(false));
    expect(confirmBtn().disabled).toBe(true);
    await user.click(confirmBtn());
    expect(commits()).toEqual([]);

    await askPreview(user);
    // 🔑 the forecast is rendered FROM THE ANSWER: two rows moved, the skipped week, and the caveat
    expect(document.querySelector("[data-start-forecast]")?.getAttribute("data-start-forecast")).toBe("2");
    expect(screen.getByText(/2 sessions would move/i)).toBeTruthy();
    expect(document.querySelector("[data-forecast-skipped]")?.getAttribute("data-forecast-skipped")).toBe("1");
    expect(screen.getByText(/may still refuse/i)).toBeTruthy();
    // 🚫 and still nothing committed
    expect(commits()).toEqual([]);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
  });

  it("🔴 a REFUSED forecast BLOCKS the commit, in the server's own words (TASK-547's rule)", async () => {
    refusePreviewWith = new FakeApiError("คอร์สนี้เริ่มเรียนแล้ว ย้ายวันเริ่มไม่ได้", "COURSE_STARTED");
    const user = userEvent.setup();
    mount();
    await pickADate(user);
    await user.click(previewBtn());

    expect(await screen.findByText("คอร์สนี้เริ่มเรียนแล้ว ย้ายวันเริ่มไม่ได้")).toBeTruthy();
    // 🚫 no forecast ⇒ the commit stays shut, and pressing it sends nothing
    expect(document.querySelectorAll("[data-start-forecast]").length).toBe(0);
    expect(confirmBtn().disabled).toBe(true);
    await user.click(confirmBtn());
    expect(commits()).toEqual([]);
  });

  it("🔑 a new date throws the old forecast away — it described a different plan", async () => {
    const user = userEvent.setup();
    mount();
    await pickADate(user);
    await askPreview(user);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));

    await pickADate(user); // a different date
    await waitFor(() => expect(document.querySelectorAll("[data-start-forecast]").length).toBe(0));
    expect(confirmBtn().disabled).toBe(true);
  });

  it("🚫 pressing confirm with no date chosen sends NOTHING", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(confirmBtn()).toBeTruthy());
    await user.click(confirmBtn());
    expect(posts()).toEqual([]);
  });

  it("🔑 a date chosen ⇒ exactly ONE POST with that date, and the skipped week comes from the ANSWER", async () => {
    const user = userEvent.setup();
    mount();
    await pickADate(user);
    await askPreview(user);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));

    await user.click(confirmBtn());
    await waitFor(() => expect(commits().length).toBe(1));
    expect(Object.keys(commits()[0].body as object)).toEqual(["startDate"]);
    // 🔑 the forecast and the commit are two acts on two routes — exactly one of each
    expect(previews().length).toBe(1);

    // the server said ONE week was skipped; the page shows that week and no other
    expect(await screen.findByText(/weeks skipped/i)).toBeTruthy();
    expect(document.querySelector("[data-start-skipped]")?.getAttribute("data-start-skipped")).toBe("1");
    // and the expiry move is shown as the server's two dates
    expect(screen.getByText(/Expiry:/)).toBeTruthy();
  });

  it("🔴 after the move the reconfirm window is stated AGAIN, with the act that closes it", async () => {
    const user = userEvent.setup();
    mount();
    await pickADate(user);
    await askPreview(user);
    await user.click(confirmBtn());

    expect(await screen.findByText(/3 sessions need confirming again/i)).toBeTruthy();
    expect(screen.getByText(/run confirm course to send the new schedule/i)).toBeTruthy();
    // 🚫 and nothing claims anyone was told by the move itself
    expect(screen.queryAllByText(/notified/i).length).toBe(0);
  });

  it("🔴 a REFUSED move: the server's sentence, and the course is untouched (no result shown)", async () => {
    refuseWith = new FakeApiError("วันที่ 2026-11-17 ครูมีคาบอื่นในเวลานี้แล้ว — ไม่ได้ย้ายคาบใด", "SLOT_TAKEN");
    const user = userEvent.setup();
    mount();
    await pickADate(user);
    await askPreview(user);
    await user.click(confirmBtn());

    // 🔑 TASK-574 — a clean forecast and then a refusal: NOT a contradiction, and the caveat said so beforehand
    expect(await screen.findByText("วันที่ 2026-11-17 ครูมีคาบอื่นในเวลานี้แล้ว — ไม่ได้ย้ายคาบใด")).toBeTruthy();
    expect(screen.getByText(/may still refuse/i)).toBeTruthy();
    // 🚫 no success anywhere: the dialog is still asking, and it was attempted once
    expect(document.querySelector("[data-start-dialog]")?.getAttribute("data-start-dialog")).toBe("ask");
    expect(document.querySelectorAll("[data-start-result]").length).toBe(0);
    expect(commits().length).toBe(1);
  });

  it("a course whose expiry was NEVER hand-set is not warned about one", async () => {
    history = [{ fromDate: "2026-12-01", toDate: "2026-12-06", actor: null, changedAt: "2026-09-20T03:00:00.000Z" }];
    mount();
    expect(await screen.findByText(/nobody is told by this move/i)).toBeTruthy();
    expect(screen.queryAllByText(/by hand/i).length).toBe(0);
    expect(document.querySelector("[data-start-warnings]")?.getAttribute("data-start-warnings")).toBe("plain");
  });
});
