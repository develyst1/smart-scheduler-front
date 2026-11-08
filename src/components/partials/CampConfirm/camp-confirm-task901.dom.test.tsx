import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { amountText, confirmBody, isConfirmed, refusalWords, todayBkk } from "@/lib/camp/camp-confirm";
import type { CampPackage } from "@/types/api/contract";

/**
 * 🔴 **TASK-901 / SPEC-099 §11 — D3 «Confirm camp».** A camp package shows «Not confirmed yet» / «Confirmed · <date>»; the button (behind `action:camp.sell`) opens the dialog; the press is ONE
 * `POST /camp/packages/:id/confirm { receivedOn, method }`; a 409 shows Porter's words. 🔑 It cannot prove the SERVER's side (the revenue line, the date) — TASK-900 and Tanya's round after it deploys.
 */
let allowed = true;
const posts: Array<{ url: string; body: unknown }> = [];
let answer: () => Promise<{ data: unknown }> = async () => ({ data: { packageId: "cp-1", confirmedOn: "2026-11-09", amountMinor: 1_150_000, method: "TRANSFER" } });
const toasts: Array<{ title: string; description?: string; color?: string }> = [];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    post: async (url: string, body: unknown) => {
      posts.push({ url, body });
      return answer();
    },
  },
}));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string; description?: string; color?: string }) => void toasts.push(o) }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));

const CampConfirmBlock = (await import("./CampConfirmBlock")).default;

const PKG: CampPackage = {
  id: "cp-1", studentId: "s1", kind: "FULL", plan: "FULL_WEEK", totalUnits: 10, usedUnits: 0, plannedUnits: 0, credit: 10, saleId: "sale-1", note: null, discount: null, days: [], createdBy: "a", createdAt: "2026-11-01T03:00:00.000Z",
  confirmedOn: null, amountMinor: 1_150_000,
};

const mount = (p: CampPackage) =>
  render(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MantineProvider, null, h(DatesProvider, { settings: {} }, h(I18nProvider, null, h(CampConfirmBlock, { pkg: p }))))) as never);
const en = dictionaries.en.campConfirm as Record<string, string>;
const th = dictionaries.th.campConfirm as Record<string, string>;
/** a boolean, never a node: a node handed to a matcher prints the whole DOM when it fails (TASK-596) */
const has = (sel: string): boolean => document.querySelector(sel) !== null;
const amountField = (): { readOnly: boolean; value: string } => document.querySelector("[data-camp-amount]") as unknown as { readOnly: boolean; value: string };
const button = () => document.querySelector("[data-confirm-camp]") as HTMLButtonElement | null;
const dialogConfirm = () => [...document.querySelectorAll("button")].filter((b) => b.textContent === en.confirm && !b.hasAttribute("data-confirm-camp")).pop() as HTMLButtonElement;

beforeEach(() => {
  allowed = true;
  posts.length = 0;
  toasts.length = 0;
  answer = async () => ({ data: { packageId: "cp-1", confirmedOn: "2026-11-09", amountMinor: 1_150_000, method: "TRANSFER" } });
});
afterEach(cleanup);

describe("the pure rules", () => {
  it("confirmed only when the server sent a date; an older payload (no field) is not confirmed", () => {
    expect(isConfirmed({ confirmedOn: "2026-11-09" })).toBe(true);
    expect(isConfirmed({ confirmedOn: null })).toBe(false);
    expect(isConfirmed({})).toBe(false);
  });
  it("the amount is the server's figure as sent, «—» when absent (never 0)", () => {
    expect(amountText(undefined)).toBe("—");
    expect(amountText(null)).toBe("—");
    expect(amountText(1_150_000)).toContain("11,500");
  });
  it("the body is exactly { receivedOn, method }; a refusal shows the server's sentence, Porter's words only when the server sent none", () => {
    expect(confirmBody("2026-11-09", "TRANSFER")).toEqual({ receivedOn: "2026-11-09", method: "TRANSFER" });
    const t = (k: string) => `«${k}»`;
    expect(refusalWords("ALREADY_CONFIRMED", t, "the server's sentence")).toBe("the server's sentence");
    expect(refusalWords("NO_FEE", t, "the server's sentence")).toBe("the server's sentence");
    expect(refusalWords("ALREADY_CONFIRMED", t, "")).toBe("«campConfirm.alreadyConfirmed»");
    expect(refusalWords("NO_FEE", t, " ")).toBe("«campConfirm.noFee»");
    expect(todayBkk(new Date("2026-11-09T18:30:00Z"))).toBe("2026-11-10"); // 01:30 Bangkok on the 10th
  });
  it("Porter's Thai is in, and the English pair is present", () => {
    expect([th.confirm, th.notConfirmed, th.alreadyConfirmed, th.noFee]).toEqual(["ยืนยันแคมป์", "ยังไม่ยืนยัน", "แคมป์นี้ยืนยันแล้ว", "แคมป์นี้ยังไม่มีรายการขาย"]);
    expect(th.confirmedOn).toBe("ยืนยันแล้ว · {date}");
    for (const k of ["confirm", "notConfirmed", "confirmedOn", "alreadyConfirmed", "noFee"]) expect(typeof en[k]).toBe("string");
  });
});

describe("the card's block", () => {
  it("not confirmed: the badge «Not confirmed yet» and an ENABLED «Confirm camp» button", () => {
    mount(PKG);
    expect(document.querySelector("[data-confirm-state='pending']")?.textContent).toBe(en.notConfirmed);
    expect(button()?.disabled).toBe(false);
    expect(button()?.textContent).toBe(en.confirm);
  });
  it("confirmed: the badge «Confirmed · <date>» and the button DISABLED", () => {
    mount({ ...PKG, confirmedOn: "2026-11-09" });
    expect(document.querySelector("[data-confirm-state='confirmed']")?.textContent).toContain("Confirmed ·");
    expect(button()?.disabled).toBe(true);
  });
  it("without `action:camp.sell` the button is not drawn at all (hidden, never disabled); the badge still shows", () => {
    allowed = false;
    mount(PKG);
    expect(button() === null).toBe(true);
    expect(has("[data-confirm-state]")).toBe(true);
  });
});

describe("the dialog", () => {
  const open = async () => {
    mount(PKG);
    await userEvent.click(button() as Element);
    await waitFor(() => expect(has("[data-camp-amount]")).toBe(true));
  };
  it("shows the server's amount read-only, and the press POSTs once to /camp/packages/:id/confirm with { receivedOn: today, method: TRANSFER }", async () => {
    await open();
    expect(amountField().readOnly).toBe(true);
    expect(amountField().value).toContain("11,500");
    await userEvent.click(dialogConfirm());
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]).toEqual({ url: "/camp/packages/cp-1/confirm", body: { receivedOn: todayBkk(), method: "TRANSFER" } });
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].color).toBe("success");
    expect(toasts[0].title).toContain("Confirmed ·");
  });
  it("a 409 ALREADY_CONFIRMED shows the server's sentence, danger, and the dialog stays", async () => {
    answer = async () => {
      throw new realClient.ApiClientError("ALREADY_CONFIRMED", "(server words)", 409);
    };
    await open();
    await userEvent.click(dialogConfirm());
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]).toMatchObject({ color: "danger", description: "(server words)" });
    expect(has("[data-camp-amount]")).toBe(true);
  });
  it("a 409 NO_FEE shows the server's sentence", async () => {
    answer = async () => {
      throw new realClient.ApiClientError("NO_FEE", "(server words)", 409);
    };
    await open();
    await userEvent.click(dialogConfirm());
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].description).toBe("(server words)");
  });
});
