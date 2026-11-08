import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-870 amendment — a parent's LINE check-in on a voucher with NO hours left.** Only the code `VOUCHER_EXHAUSTED` gets the new title, the full
 * sentence from OUR dictionary (not the server's message) and the close hint **with no Retry** (retrying can never pass); every other refusal keeps
 * `failTitle` + Retry. 🔑 The page's English default is what renders here; the Thai pair is pinned as strings below.
 */
let answer: { status: number; body: unknown } = { status: 409, body: { error: { code: "VOUCHER_EXHAUSTED", message: "ชั่วโมงในวอยเชอร์หมดแล้ว" } } };
mock.module("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("token=abc") }));
globalThis.fetch = (async () => ({ ok: answer.status < 400, status: answer.status, json: async () => answer.body })) as unknown as typeof fetch;
const CheckinContent = (await import("./CheckinContent")).default;

afterEach(cleanup);
const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(CheckinContent, null))) as never);
const en = dictionaries.en.checkin as Record<string, string>;
const th = dictionaries.th.checkin as Record<string, string>;

describe("the parent's check-in refusal", () => {
  it("VOUCHER_EXHAUSTED: the new title + OUR sentence + the close hint, and NO button", async () => {
    answer = { status: 409, body: { error: { code: "VOUCHER_EXHAUSTED", message: "(the server's words, never shown)" } } };
    mount();
    await waitFor(() => expect(document.body.textContent).toContain("Voucher used up"));
    expect(document.body.textContent).toContain("This voucher has no hours left. Please contact the admin to buy more.");
    expect(document.body.textContent).toContain(en.closeHint);
    expect(document.body.textContent).not.toContain("(the server's words, never shown)");
    expect(document.querySelectorAll("button").length).toBe(0);
  });
  it("any OTHER 409 keeps the generic title, the server's sentence and the Retry button", async () => {
    answer = { status: 409, body: { error: { code: "SOMETHING_ELSE", message: "ยังเช็คอินไม่ได้" } } };
    mount();
    await waitFor(() => expect(document.body.textContent).toContain(en.failTitle));
    expect(document.body.textContent).toContain("ยังเช็คอินไม่ได้");
    expect(document.body.textContent).not.toContain("Voucher used up");
    expect(document.querySelectorAll("button").length).toBe(1);
  });
  it("the two pairs", () => {
    expect(en.voucherEmptyTitle).toBe("Voucher used up");
    expect(en.voucherEmptyBody).toBe("This voucher has no hours left. Please contact the admin to buy more.");
    expect(th.voucherEmptyTitle).toBe("วอยเชอร์หมดแล้ว");
    expect(th.voucherEmptyBody).toBe("ชั่วโมงในวอยเชอร์หมดแล้ว กรุณาติดต่อแอดมินเพื่อซื้อเพิ่ม");
  });
});
