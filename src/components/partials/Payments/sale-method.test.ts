import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Payment } from "@/types/payments";

/**
 * TASK-876 — after a sale the chosen method is written to row 1 ONLY when it is not the default.
 * Pure orchestration over the service (mocked); the API's own behaviour is Brew's half (TASK-875).
 */
const row = (over: Partial<Payment>): Payment => ({
  id: "p1", refType: "COURSE", refId: "c1", n: 1, paidOn: "2026-11-08", amountMinor: 950000, method: "TRANSFER", updatedAt: "x", ...over,
});
let rows: Payment[] = [];
let listFails = false;
let patchFails = false;
const calls = { list: 0, patch: [] as Array<{ id: string; patch: unknown }> };
mock.module("@/services/payments.service", () => ({
  listPayments: async () => {
    calls.list++;
    if (listFails) throw new Error("down");
    return { payments: rows, feeMinor: 950000, paidMinor: 950000, remainingMinor: 0 };
  },
  updatePayment: async (id: string, patch: unknown) => {
    if (patchFails) throw new Error("down");
    calls.patch.push({ id, patch });
    return row({});
  },
  createPayment: async () => row({}),
}));
const { recordSaleMethod } = await import("./sale-method");

beforeEach(() => {
  rows = [row({ id: "p1" }), row({ id: "p2", n: 2 })];
  listFails = false;
  patchFails = false;
  calls.list = 0;
  calls.patch = [];
});

describe("recordSaleMethod", () => {
  it("Transfer is the default: no call at all", async () => {
    expect(await recordSaleMethod("COURSE", "c1", "TRANSFER")).toBe("ok");
    expect(calls.list).toBe(0);
    expect(calls.patch).toEqual([]);
  });
  it("Cash: reads the rows and PATCHes row 1's method only (not row 2, nothing else)", async () => {
    expect(await recordSaleMethod("COURSE", "c1", "CASH")).toBe("ok");
    expect(calls.patch).toEqual([{ id: "p1", patch: { method: "CASH" } }]);
  });
  it("no row 1 to edit ⇒ failed, nothing patched", async () => {
    rows = [row({ id: "p2", n: 2 })];
    expect(await recordSaleMethod("COURSE", "c1", "CARD")).toBe("failed");
    expect(calls.patch).toEqual([]);
  });
  it("a failing read or a failing PATCH never throws (the sale is already saved) ⇒ failed", async () => {
    listFails = true;
    expect(await recordSaleMethod("COURSE", "c1", "CASH")).toBe("failed");
    listFails = false;
    patchFails = true;
    expect(await recordSaleMethod("VOUCHER", "v1", "CASH")).toBe("failed");
  });
});
