import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import type { LeaveDayRow } from "@/types/api/contract";

/**
 * 🔴 **TASK-966 (SPEC-108 §4, REQ-5015 AC2) — a PART-DAY leave says its window on the strip and in the panel: «HH:MM–HH:MM».** A whole-day leave (no times — every row before this change) reads exactly as it did.
 * 🔑 What can go wrong without anyone seeing it: a window the server sent that the strip drops (so a morning-only leave reads as a whole day), seconds shown («09:00:00–12:00:00»), a whole-day row that grows a time,
 * or a panel that shows the window on the wrong day. Every assertion is a string or a count.
 */

let store: LeaveDayRow[] = [];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      if (url === "/teacher-leave-days") {
        const tid = cfg?.params?.teacherId as string | undefined;
        return { data: { items: store.filter((r) => !tid || r.teacherId === tid) } };
      }
      return { data: { days: [] } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const { default: LeaveDayBanner } = await import("./LeaveDayBanner");
const { useLeaveDays } = await import("@/hooks/scheduler");

const iso = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");
const STRIP = [0, 1, 2, 3].map(iso);
const row = (teacherId: string, teacherName: string, date: string, window?: [string, string]): LeaveDayRow => ({
  teacherId,
  teacherName,
  date,
  reason: "ไปอบรม",
  createdBy: null,
  rangeId: null,
  startTime: window ? window[0] : null,
  endTime: window ? window[1] : null,
  bookings: [],
});

const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });
const Strip = () => {
  const { data } = useLeaveDays(STRIP[0], STRIP[STRIP.length - 1], true);
  return h(LeaveDayBanner, { rows: data, dates: STRIP });
};
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(Strip))))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const markerText = (tid: string, date: string) => document.querySelector(`[data-leave-marker="${tid}|${date}"]`)?.textContent ?? "";

afterEach(cleanup);
beforeEach(() => {
  store = [
    row("t1", "เอ", iso(1), ["09:00:00", "12:00:00"]), // a part-day leave (the server's time carries seconds)
    row("t2", "บี", iso(2)), // a whole-day leave (no times)
    row("t1", "เอ", iso(3), ["13:30", "17:00"]), // the same coach, another day, another window (the server may send `HH:MM`)
  ];
});

describe("🔴 TASK-966 — the strip", () => {
  it("🔑 a part-day leave reads «… · HH:MM–HH:MM» (seconds dropped); a whole-day leave reads exactly as before, with no time", async () => {
    wrap();
    await waitFor(() => expect(q("[data-leave-marker]")).toBe(3));
    expect(markerText("t1", iso(1))).toContain("09:00–12:00");
    expect(markerText("t1", iso(1))).not.toContain("09:00:00");
    expect(markerText("t1", iso(3))).toContain("13:30–17:00");
    expect(markerText("t2", iso(2))).not.toMatch(/\d{2}:\d{2}/);
  });
});

describe("🔴 TASK-966 — the panel", () => {
  it("🔑 the panel shows each day's window next to its date: a window on the part-day days, none on a whole-day one", async () => {
    wrap();
    await waitFor(() => expect(q(`[data-leave-open="t1|${iso(1)}"]`)).toBe(1));
    await userEvent.setup().click(document.querySelector(`[data-leave-open="t1|${iso(1)}"]`) as HTMLElement);
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(1)); // `rangeId` is null: the panel shows this one day
    expect(document.querySelector(`[data-leave-panel-window="${iso(1)}"]`)?.textContent).toBe("09:00–12:00");
    cleanup();
    wrap();
    await waitFor(() => expect(q(`[data-leave-open="t2|${iso(2)}"]`)).toBe(1));
    await userEvent.setup().click(document.querySelector(`[data-leave-open="t2|${iso(2)}"]`) as HTMLElement);
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(1));
    expect(q("[data-leave-panel-window]")).toBe(0);
  });
});
