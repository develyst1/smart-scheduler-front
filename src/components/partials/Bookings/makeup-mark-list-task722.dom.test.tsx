import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-722 (REQ-115, Team B's half) — the bookings LIST shows the make-up mark from the MARKER, beside the real status.**
 *
 * A make-up is born CONFIRMED (TASK-702), so the row must say «ยืนยันแล้ว» AND «ขยายคาบ»; an ordinary confirmed row says only the first;
 * a legacy `EXTENDED` row says «ขยายคาบ» ONCE (its status chip already is the word). 🔑 And the OTHER question this table asks —
 * "is it UNCONFIRMED?" — still reads the STATUS on purpose: a confirmed make-up must NOT become tickable for bulk confirm.
 */

const T = dictionaries;
const CONFIRMED = [T.en.bookingStatus.CONFIRMED, T.th.bookingStatus.CONFIRMED];
const EXTENDED = [T.en.bookingStatus.EXTENDED, T.th.bookingStatus.EXTENDED];

const row = (id: string, name: string, status: string, isMakeup: boolean | undefined) => ({
  id,
  status,
  isMakeup,
  displayName: name,
  subject: "Onewheel",
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  date: "2026-09-29",
  startTime: "10:00",
  endTime: "11:00",
  bookingType: "COURSE_PACKAGE",
  badges: [],
});
const ROWS = [
  row("r1", "ก-ยืนยันเสริม", "CONFIRMED", true),
  row("r2", "ข-ปกติ", "CONFIRMED", false),
  row("r3", "ค-เก่า", "EXTENDED", true),
  row("r4", "ง-รอยืนยัน", "PENDING", false),
];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({ ...realClient, useMockData: false, api: { ...realClient.api, get: async () => ({ data: { items: [], total: 0 } }) } }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }] }),
  useAllBookings: () => ({ data: { items: ROWS, total: ROWS.length }, isLoading: false, isPlaceholderData: false }),
}));

const BookingsTable = (await import("./BookingsTable")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(BookingsTable, null)))) as never);
};
const rowOf = async (name: string) =>
  (await waitFor(() => {
    const tr = [...document.querySelectorAll("tr")].find((r) => r.textContent?.includes(name));
    expect(!tr).toBe(false);
    return tr;
  })) as HTMLElement;
const count = (el: Element, labels: string[]) => labels.reduce((n, l) => n + ((el.textContent ?? "").split(l).length - 1), 0);
const badges = (el: Element) => el.querySelectorAll("[data-makeup-badge]").length;

afterEach(cleanup);

describe("🔴 TASK-722 — the bookings list", () => {
  it("🔑 a CONFIRMED make-up row says its REAL status AND carries the make-up badge", async () => {
    mount();
    const tr = await rowOf("ก-ยืนยันเสริม");
    expect(count(tr, CONFIRMED)).toBe(1);
    expect(badges(tr)).toBe(1);
    expect(count(tr, EXTENDED)).toBe(1);
  });

  it("an ordinary CONFIRMED row shows no badge", async () => {
    mount();
    const tr = await rowOf("ข-ปกติ");
    expect(count(tr, CONFIRMED)).toBe(1);
    expect(badges(tr)).toBe(0);
    expect(count(tr, EXTENDED)).toBe(0);
  });

  it("🔑 a LEGACY EXTENDED make-up says «ขยายคาบ» exactly ONCE", async () => {
    mount();
    const tr = await rowOf("ค-เก่า");
    expect(count(tr, EXTENDED)).toBe(1);
    expect(badges(tr)).toBe(0); // the status chip IS the word; no second badge
  });

  it("🔑 bulk confirm still asks the STATUS: only the PENDING and EXTENDED rows have a tick, the CONFIRMED make-up has none", async () => {
    mount();
    await rowOf("ก-ยืนยันเสริม");
    // the header box plus one tick per UNCONFIRMED row (PENDING, EXTENDED), not per make-up
    await waitFor(() => expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(3));
    const makeupRow = await rowOf("ก-ยืนยันเสริม");
    expect(makeupRow.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect((await rowOf("ค-เก่า")).querySelectorAll('input[type="checkbox"]').length).toBe(1);
    expect((await rowOf("ง-รอยืนยัน")).querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });
});
