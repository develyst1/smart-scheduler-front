import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-870 (REQ-5008) — the voucher picker will not take a voucher with nothing AVAILABLE** (total − used − already booked). A real picker, a real click:
 * the full row is shown but disabled, and clicking it selects nothing; a row with 1 available selects. 🔑 It cannot prove the server's count — Bob's half.
 */
const ROWS = [
  { id: "s1", name: "น้องเต็ม", nickname: null, context: { voucherId: "v-full", totalHours: 10, usedHours: 7, remainingHours: 3, hoursReserved: 3, hoursAvailable: 0, expiryDate: "2027-01-01" } },
  { id: "s2", name: "น้องเหลือ", nickname: null, context: { voucherId: "v-one", totalHours: 10, usedHours: 7, remainingHours: 3, hoursReserved: 2, hoursAvailable: 1, expiryDate: "2027-01-01" } },
];
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useEligibleStudents: () => ({ data: ROWS, isFetching: false }) }));
const EligibleStudentSelect = (await import("./EligibleStudentSelect")).default;

afterEach(cleanup);

const mount = (onChange: (v: string | null) => void) =>
  render(h(MantineProvider, null, h(I18nProvider, null, h(EligibleStudentSelect, { type: "VOUCHER", value: null, onChange }))) as never);
const open = async () => {
  await userEvent.click(document.querySelector("input") as Element);
  await waitFor(() => expect(document.body.textContent).toContain("น้องเหลือ"));
};
const option = (name: string) => [...document.querySelectorAll("[role='option']")].find((o) => o.textContent === name) as HTMLElement;

describe("EligibleStudentSelect — voucher rows", () => {
  it("a voucher with 0 available is listed but disabled, and clicking it picks nothing", async () => {
    const picked: Array<string | null> = [];
    mount((v) => picked.push(v));
    await open();
    expect(option("น้องเต็ม").getAttribute("aria-disabled") ?? option("น้องเต็ม").getAttribute("data-combobox-disabled")).toBeTruthy();
    await userEvent.click(option("น้องเต็ม"));
    expect(picked).toEqual([]);
  });
  it("a voucher with 1 available is picked", async () => {
    const picked: Array<string | null> = [];
    mount((v) => picked.push(v));
    await open();
    await userEvent.click(option("น้องเหลือ"));
    expect(picked).toEqual(["v-one"]);
  });
});
