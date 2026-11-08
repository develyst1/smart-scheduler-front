import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Payment, PaymentsResult } from "@/types/payments";

/**
 * TASK-876 — the Payment card, by CLICKING its controls (they record who paid how): Edit sends ONLY what changed, every
 * row's amount is editable and the API's "adds up to more than the fee" sentence is shown, "Add an installment" refuses a
 * missing amount, a course with no row 1 (or a sale with no fee) offers nothing to add to, and a failed load shows Retry.
 * 🔑 It cannot prove the server — the service is mocked; the real-API run is the other half.
 */
const row = (over: Partial<Payment>): Payment => ({
  id: "p1", refType: "COURSE", refId: "c1", n: 1, paidOn: "2026-10-16", amountMinor: 500000, method: "TRANSFER", updatedAt: "x", ...over,
});
let result: PaymentsResult;
let listFails = false;
let patchError: Error | null = null;
let listCalls = 0;
const patches: Array<{ id: string; patch: unknown }> = [];
const creates: unknown[] = [];
mock.module("@/services/payments.service", () => ({
  listPayments: async () => {
    listCalls++;
    if (listFails) throw new Error("boom");
    return result;
  },
  updatePayment: async (id: string, patch: unknown) => {
    if (patchError) throw patchError;
    patches.push({ id, patch });
    return row({});
  },
  createPayment: async (input: unknown) => {
    creates.push(input);
    return row({});
  },
}));
const PaymentCard = (await import("./PaymentCard")).default;

beforeEach(() => {
  result = {
    payments: [row({ id: "p1" }), row({ id: "p2", n: 2, paidOn: "2026-10-30", amountMinor: 300000, method: "CASH" })],
    feeMinor: 950000,
    paidMinor: 800000,
    remainingMinor: 150000,
  };
  listFails = false;
  patchError = null;
  listCalls = 0;
  patches.length = 0;
  creates.length = 0;
  window.localStorage.removeItem("ss.lang");
});
afterEach(cleanup);

// `live: true` stands in for the ship gate being on (`PAYMENTS_LIVE` is a constant in the tree and is `false` there).
const mount = (props: { live?: boolean } = { live: true }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PaymentCard, { refType: "COURSE", refId: "c1", ...props })))) as never,
  );
};
const text = () => document.body.textContent ?? "";
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name || b.getAttribute("aria-label") === name) as HTMLButtonElement;
const dialogInputs = () => [...document.querySelectorAll("[role='dialog'] input")] as HTMLInputElement[];
const openMethodSelect = async () =>
  userEvent.click(document.querySelector("[role='dialog'] input[aria-haspopup='listbox']") as Element);

describe("PaymentCard — the ship gate", () => {
  it("with the gate OFF it renders nothing and makes NO call", async () => {
    mount({ live: false }); // the gate switched off explicitly (the tree's constant is now on)
    await new Promise((r) => setTimeout(r, 300));
    // (Mantine's provider injects its own <style>, so the body is not empty text; the card's words and DOM must be absent.)
    expect(text()).not.toContain("Payment");
    expect(text()).not.toContain("Installment");
    // Booleans, never a node in a matcher that prints what it received (TASK-596: a failed `toBeNull()` on an element prints the whole document).
    expect(document.querySelectorAll("section").length).toBe(0);
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(listCalls).toBe(0);
  });
  it("the tree ships LIVE (TASK-875 is on sid with the same deploy) and with the fake OFF", async () => {
    const cfg = await import("./config");
    expect(cfg.PAYMENTS_LIVE).toBe(true);
    expect(cfg.USE_FAKE_PAYMENTS).toBe(false);
  });
});

describe("PaymentCard", () => {
  it("shows the method badge, Paid, the rows, the API's Course Fee and Remaining (nothing summed here)", async () => {
    mount();
    await waitFor(() => expect(text()).toContain("Course Fee"));
    expect(text()).toContain("Paid");
    expect(text()).toContain("Remaining");
    expect(text()).toContain("Transfer");
    expect(text()).toContain("Cash");
    expect(text()).not.toContain("Course price");
    // the Remaining figure is the API's 150,000 satang = 1,500, not a sum of the rows
    expect(text()).toContain("1,500");
  });

  it("Edit → change to Cash → Save PATCHes ONLY the method of row 1", async () => {
    mount();
    await waitFor(() => expect(button("Edit")).toBeTruthy());
    await userEvent.click(button("Edit"));
    await waitFor(() => expect(document.querySelector("[role='dialog']")).toBeTruthy());
    await openMethodSelect();
    const cash = await waitFor(() => {
      const o = [...document.querySelectorAll("[role='option']")].find((x) => x.textContent === "Cash");
      expect(o).toBeTruthy();
      return o as Element;
    });
    await userEvent.click(cash);
    await userEvent.click(button("Save"));
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0]).toEqual({ id: "p1", patch: { method: "CASH" } });
  });

  it("every row's amount is editable, row 1 included (installments split the fee)", async () => {
    mount();
    await waitFor(() => expect(button("Edit")).toBeTruthy());
    await userEvent.click(button("Edit"));
    await waitFor(() => expect(document.querySelector("[role='dialog']")).toBeTruthy());
    const amount = dialogInputs().find((i) => i.value.includes("฿")) as HTMLInputElement;
    expect(amount.readOnly).toBe(false);
  });

  it("the API's 400 (sum above the fee) is shown in the dialog as the API wrote it, and the dialog stays open", async () => {
    // An ApiClientError is an Error with a numeric `status`; built by hand so the test does not depend on which test file's
    // mock of `@/lib/api/client` is live (bun's `mock.module` is process-wide).
    patchError = Object.assign(new Error("the installments add up to more than the course fee"), { status: 400, code: "VALIDATION" });
    mount();
    await waitFor(() => expect(button("Edit")).toBeTruthy());
    await userEvent.click(button("Edit"));
    await waitFor(() => expect(document.querySelector("[role='dialog']")).toBeTruthy());
    await openMethodSelect();
    await userEvent.click(await waitFor(() => [...document.querySelectorAll("[role='option']")].find((x) => x.textContent === "Cash") as Element));
    await userEvent.click(button("Save"));
    await waitFor(() => expect(text()).toContain("the installments add up to more than the course fee"));
    expect(document.querySelector("[role='dialog']")).toBeTruthy();
  });

  it("Add an installment with no amount is refused on the form, nothing is sent", async () => {
    mount();
    await waitFor(() => expect(button("Add an installment")).toBeTruthy());
    await userEvent.click(button("Add an installment"));
    await waitFor(() => expect(document.querySelector("[role='dialog']")).toBeTruthy());
    await userEvent.click(button("Save"));
    await waitFor(() => expect(text()).toContain("Enter an amount above 0"));
    expect(creates).toEqual([]);
  });

  it("a course with NO payment row shows Transfer (default), no Edit, no Paid, and nothing to add to", async () => {
    result = { payments: [], feeMinor: 950000, paidMinor: 0, remainingMinor: 950000 };
    mount();
    await waitFor(() => expect(text()).toContain("Transfer (default)"));
    expect(button("Edit") === undefined).toBe(true);
    expect(button("Add an installment") === undefined).toBe(true);
    expect(text()).not.toContain("Paid");
  });

  it("a sale with NO FEE (feeMinor null) lists its rows but offers no Add and shows no Course Fee / Remaining", async () => {
    result = { payments: [row({ id: "p1", method: "CARD" })], feeMinor: null, paidMinor: null, remainingMinor: null };
    mount();
    await waitFor(() => expect(text()).toContain("Credit card"));
    expect(button("Add an installment") === undefined).toBe(true);
    expect(text()).not.toContain("Course Fee");
    expect(text()).not.toContain("Remaining");
  });

  it("a failed load shows the error and Retry; Retry loads it", async () => {
    listFails = true;
    mount();
    await waitFor(() => expect(text()).toContain("Could not load the payments"));
    listFails = false;
    await userEvent.click(button("Retry"));
    await waitFor(() => expect(text()).toContain("Course Fee"));
  });

  it("in Thai the card reads the PM's words: ชำระแล้ว · ค่าคอร์ส · ค้างชำระ · โอนเงิน", async () => {
    window.localStorage.setItem("ss.lang", "th");
    mount();
    await waitFor(() => expect(text()).toContain("ค่าคอร์ส"));
    expect(text()).toContain("ชำระแล้ว");
    expect(text()).toContain("ค้างชำระ");
    expect(text()).toContain("โอนเงิน");
    expect(text()).toContain("เงินสด");
  });
});

describe("paymentRecord dictionary", () => {
  it("has every method and the PM's sale warning in BOTH languages (the template key `methods.${m}` is not checked by keys.test)", () => {
    for (const lang of ["en", "th"] as const) {
      const d = dictionaries[lang].paymentRecord;
      for (const m of ["TRANSFER", "CASH", "CARD"] as const) expect(d.methods[m].length).toBeGreaterThan(0);
      expect(d.saleWarning.length).toBeGreaterThan(0);
    }
    expect(dictionaries.th.paymentRecord.saleWarning).toBe("บันทึกการขายแล้ว แต่ยังไม่ได้บันทึกวิธีชำระเงิน ตั้งได้ที่การ์ดการชำระเงินของคอร์สนี้");
  });
});
