import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 3 (TASK-572) — extending a voucher's expiry, clicked.**
 *
 * 🔑 What only a click can show: **the preview is asked and the SAVE is not**, **exactly one PATCH when the admin saves**,
 * and 🔴 **a 409 refusal shown in the SERVER's words with what-to-do under it, while nothing is written.**
 *
 * 📌 The dialog is mounted CLOSED and opened by its prop, like the course's expiry dialog — which is also why this file
 * prints nothing: a modal that mounts already-open makes Mantine's focus trap dump a whole happy-dom node
 * (`REPORT-fe-mutation-capture-audit-2026-09-30.md`).
 */

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let refusePreviewWith: Error | null = null;
let refuseSaveWith: Error | null = null;
let warn = true;

class FakeApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const warningFor = (expiryDate: string) => ({
  expiryDate,
  warn,
  outside: warn ? [{ id: "bk-9", date: "2026-12-20", startTime: "14:00:00" }] : [],
  outsideCount: warn ? 1 : 0,
});

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    post: async (url: string, body: { expiryDate: string }) => {
      sent.push({ method: "POST", url, body });
      if (refusePreviewWith) throw refusePreviewWith;
      return { data: { expiryWarning: warningFor(body.expiryDate) } };
    },
    patch: async (url: string, body: { expiryDate: string }) => {
      sent.push({ method: "PATCH", url, body });
      if (refuseSaveWith) throw refuseSaveWith;
      return { data: { voucher: { id: "v-1" }, expiryWarning: warningFor(body.expiryDate), previousExpiryDate: "2026-12-06" } };
    },
  },
  ApiClientError: FakeApiError,
}));

const realNotify = await import("@/lib/ui/notify");
const notices: unknown[] = [];
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (n: unknown) => void notices.push(n) }));

const ExtendVoucherExpiryDialog = (await import("./ExtendVoucherExpiryDialog")).default;

const VOUCHER = {
  id: "v-1",
  totalHours: 10,
  usedHours: 2,
  remaining: 8,
  expiryDate: "2026-12-06",
  student: { id: "s-1", name: "น้องบีม" },
  status: "EXPIRED",
};

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(ExtendVoucherExpiryDialog, { voucher: VOUCHER as never, onClose: () => {} }))),
    ) as never,
  );
};

const saveBtn = () => document.querySelector("[data-voucher-save]") as HTMLButtonElement;
const previews = () => sent.filter((r) => r.method === "POST" && r.url === "/vouchers/v-1/expiry/preview");
/** 🔑 Split by method AND url: the only thing that proves nothing was written is the count of the WRITE. */
const saves = () => sent.filter((r) => r.method === "PATCH" && r.url === "/vouchers/v-1/expiry");

/** Pick a day from the calendar popover — the widget emits the value; nothing is typed (TASK-559's lesson). */
const pickDay = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  await user.click(screen.getByLabelText(/new expiry date/i));
  const day = await waitFor(() => {
    const d = [...document.querySelectorAll("table button")].find((b) => b.textContent === label);
    expect(d).toBeTruthy();
    return d as HTMLElement;
  });
  await user.click(day);
};

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  notices.length = 0;
  refusePreviewWith = null;
  refuseSaveWith = null;
  warn = true;
});

describe("🔴 TASK-572 — the voucher expiry control, clicked", () => {
  it("opens on the voucher's own date, asks NOTHING, and the Save is shut", async () => {
    mount();
    expect(await screen.findByText(/current expiry/i)).toBeTruthy();
    expect(sent).toEqual([]);
    // shut because the date on screen IS the current one — there is nothing to send
    expect(saveBtn().disabled).toBe(true);
  });

  it("🔕 says who is told — nobody — before anything is asked", async () => {
    mount();
    const audience = await waitFor(() => document.querySelector("[data-voucher-audience]") as HTMLElement);
    expect(audience.textContent).toMatch(/nobody is told/i);
    expect(sent).toEqual([]);
  });

  it("🔑 a new date asks the PREVIEW and nothing else — the server's cut list is rendered, not computed", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");

    await waitFor(() => expect(previews().length).toBe(1));
    expect(previews()[0].body).toEqual({ expiryDate: "2026-12-15" });
    // 🔴 the whole point: the preview does not write
    expect(saves()).toEqual([]);
    // the row the server named is on screen, and the block says nothing is saved yet
    expect(await screen.findByText(/would fall after/i)).toBeTruthy();
    const block = document.querySelector("[data-voucher-preview]") as HTMLElement;
    expect(block.getAttribute("data-voucher-preview")).toBe("cuts");
    // the date AND the time, inside the preview block — split across text nodes, so read the node itself
    expect(block.textContent).toContain("20/Dec/26");
    expect(block.textContent).toContain("14:00");
    expect(screen.getByText(/nothing is saved yet/i)).toBeTruthy();
  });

  it("🔑 Save sends ONE PATCH, with the SAME body the preview was asked", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");
    await waitFor(() => expect(previews().length).toBe(1));
    expect(saveBtn().disabled).toBe(false);

    await user.click(saveBtn());
    await waitFor(() => expect(saves().length).toBe(1));
    expect(saves()[0].body).toEqual(previews()[0].body);
    // saved, and the post-save warning stays on screen rather than disappearing into a toast
    expect(await screen.findByText(/some sessions now fall past the expiry/i)).toBeTruthy();
    expect(notices.length).toBe(1);
  });

  it("🚫 a warning does NOT gate the save — warn-and-still-save, as the course's own edit does", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");
    await waitFor(() => expect(previews().length).toBe(1));
    // the preview came back with `warn: true` and the button is open anyway
    expect(await screen.findByText(/would fall after/i)).toBeTruthy();
    expect(saveBtn().disabled).toBe(false);
  });

  it("🔴 a REFUSED preview: the server's sentence VERBATIM, the answer under it, and NOTHING written", async () => {
    refusePreviewWith = new FakeApiError(
      "VOUCHER_NOT_STARTED",
      "วอยเชอร์นี้ยังไม่เริ่มนับอายุ — อายุนับจากการจองครั้งแรก จึงยังต่ออายุไม่ได้",
      409,
    );
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");

    const box = await waitFor(() => {
      const el = document.querySelector("[data-voucher-refusal]") as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    // the server's own words, not a paraphrase and not a generic banner
    expect(box.textContent).toContain("อายุนับจากการจองครั้งแรก จึงยังต่ออายุไม่ได้");
    expect(box.getAttribute("data-voucher-refusal")).toBe("VOUCHER_NOT_STARTED");
    // ⇒ and what to do instead, added under it
    expect(document.querySelector("[data-voucher-answer]")?.textContent).toMatch(/book the first session/i);
    // 🔴 two guards: the button is shut AND no write exists
    expect(saveBtn().disabled).toBe(true);
    expect(saves()).toEqual([]);
    // 🚫 the forecast block is not shown beside a refusal — there is no plan to show
    expect(document.querySelectorAll("[data-voucher-preview]").length).toBe(0);
  });

  it("🔴 a refused date cannot be saved even if the button is pressed — the pre-request guard", async () => {
    refusePreviewWith = new FakeApiError("VOUCHER_ENDED", "วอยเชอร์นี้ถูกยกเลิกแล้ว — ต่ออายุไม่ได้", 409);
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");
    await waitFor(() => expect(document.querySelector("[data-voucher-refusal]")).toBeTruthy());

    await user.click(saveBtn()); // pressing a disabled button proves nothing on its own — the count does
    expect(saves()).toEqual([]);
    expect(document.querySelector("[data-voucher-answer]")?.textContent).toMatch(/new voucher/i);
  });

  it("a NEW date drops the last refusal and asks again — the refusal was about the other date", async () => {
    refusePreviewWith = new FakeApiError("VOUCHER_ENDED", "วอยเชอร์นี้ถูกยกเลิกแล้ว — ต่ออายุไม่ได้", 409);
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");
    await waitFor(() => expect(document.querySelector("[data-voucher-refusal]")).toBeTruthy());

    refusePreviewWith = null;
    await pickDay(user, "16");
    await waitFor(() => expect(previews().length).toBe(2));
    expect(document.querySelectorAll("[data-voucher-refusal]").length).toBe(0);
    expect(saveBtn().disabled).toBe(false);
  });

  it("⚠️ an EARLIER date is named as shortening — and is still savable", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "1"); // 1 Dec, before the current 6 Dec

    const note = await waitFor(() => document.querySelector("[data-voucher-earlier]") as HTMLElement);
    expect(note.textContent).toMatch(/shortens the voucher/i);
    await waitFor(() => expect(previews().length).toBe(1));
    expect(saveBtn().disabled).toBe(false);
  });

  it("🔴 a 409 on the SAVE itself is shown the same way — the preview's yes is not a promise", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "15");
    await waitFor(() => expect(previews().length).toBe(1));

    refuseSaveWith = new FakeApiError("VOUCHER_ENDED", "วอยเชอร์นี้ถูกยกเลิกแล้ว — ต่ออายุไม่ได้", 409);
    await user.click(saveBtn());
    await waitFor(() => expect(saves().length).toBe(1));

    const box = await waitFor(() => document.querySelector("[data-voucher-refusal]") as HTMLElement);
    expect(box.textContent).toContain("วอยเชอร์นี้ถูกยกเลิกแล้ว");
    expect(document.querySelector("[data-voucher-answer]")?.textContent).toMatch(/new voucher/i);
    // one attempt, and the dialog did not claim success
    expect(saves().length).toBe(1);
    expect(notices.length).toBe(0);
  });
});
