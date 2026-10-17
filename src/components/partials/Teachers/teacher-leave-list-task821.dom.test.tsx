import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { LeaveDayRow } from "@/types/api/contract";

/**
 * 🔴 **TASK-821 (REQ-123 P5; BE TASK-819) — "Teacher leave" on the Teachers page: every teacher's leave, upcoming first, then past; press one for the panel; Cancel.**
 *
 * 🔑 **What can go wrong without anyone seeing it:** a window the server would refuse (more than 92 days), a range drawn as several rows (or two teachers' leave merged), the
 * PAST list offering Cancel, "cancel all" for a one-day leave or without the key, the calendar panel's link going to a page its
 * viewer cannot open. Every assertion is a request, a count or a string — never an element.
 */

let allowed = true;
let menus: string[] = ["menu:teachers"];
const calls: Array<{ method: string; url: string; params?: Record<string, unknown> }> = [];
let store: LeaveDayRow[] = [];
const toasts: string[] = [];

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string }) => void toasts.push(o.title) }));
const realMe = await import("@/hooks/scheduler/useMe");
// 🚫 `useMe` itself is never replaced (`mock.module` is process-global; a stub leaks into other files): the tree gets a real SessionProvider instead.
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus, actions: [], roleName: null, teacherId: null });

const iso = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      calls.push({ method: "GET", url, params: cfg?.params });
      if (url === "/me") return { data: { user: meUser() } };
      const from = cfg?.params?.from as string | undefined;
      const to = cfg?.params?.to as string | undefined;
      const tid = cfg?.params?.teacherId as string | undefined;
      if (url === "/teacher-leave-days") return { data: { items: store.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!tid || r.teacherId === tid)).sort((x, y) => x.date.localeCompare(y.date)) } }; // the server answers in DATE order
      return { data: { days: [] } };
    },
    delete: async (url: string) => {
      calls.push({ method: "DELETE", url });
      return { data: { rangeId: "r-1", lifted: [], kept: [], teacherNotified: 1 } };
    },
  },
}));
// 🚫 no `mock.module` of the hooks barrel here: it is process-global and leaked into TASK-806's teacher-form tests (which read the real hooks)
const { default: TeacherLeaveList, leaveRecordsOf, groupByTeacher } = await import("./TeacherLeaveList");

const row = (teacherId: string, teacherName: string, date: string, rangeId: string | null, n = 0): LeaveDayRow => ({
  teacherId,
  teacherName,
  date,
  reason: `เหตุผล-${teacherName}`,
  createdBy: null,
  rangeId,
  bookings: Array.from({ length: n }, (_, i) => ({ id: `${teacherId}-${date}-${i}`, date, startTime: "09:00:00", endTime: "09:45:00", status: "CONFIRMED" as const, bookingType: "COURSE_PACKAGE" })),
});

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(TeacherLeaveList))))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
const reads = () => calls.filter((c) => c.method === "GET" && c.url === "/teacher-leave-days");
const nonGets = () => calls.filter((c) => c.method !== "GET");

afterEach(cleanup);
beforeEach(() => {
  allowed = true;
  menus = ["menu:teachers"];
  calls.length = 0;
  toasts.length = 0;
  store = [
    row("t1", "เอ", iso(3), "r-1", 3),
    row("t1", "เอ", iso(4), "r-1", 1),
    row("t1", "เอ", iso(5), "r-1", 0),
    row("t2", "บี", iso(20), null, 0),
    row("t1", "เอ", iso(20), null, 3),
    row("t1", "เอ", iso(-5), null, 1), // past
    row("t3", "ซี", iso(-10), "r-old", 0),
    row("t3", "ซี", iso(-9), "r-old", 0),
  ];
});

describe("🔴 TASK-821 — the pure grouping", () => {
  it("🔑 a RANGE is ONE record (its days share a rangeId): span, day count, summed classes, the first day's row", () => {
    const rec = leaveRecordsOf(store.filter((r) => r.rangeId === "r-1"));
    expect(rec.length).toBe(1);
    expect([rec[0].from, rec[0].to, rec[0].days, rec[0].classes, rec[0].rangeId]).toEqual([iso(3), iso(5), 3, 4, "r-1"]);
    expect(rec[0].first.date).toBe(iso(3));
  });

  it("🔑 single days stay separate records, and two teachers' leave is never merged", () => {
    const rec = leaveRecordsOf(store);
    expect(rec.map((r) => r.key).sort()).toEqual([`day:t1:${iso(-5)}`, `day:t1:${iso(20)}`, `day:t2:${iso(20)}`, "range:r-1", "range:r-old"].sort());
  });

  it("🔑 the days of a record are put in date order even when the rows arrive shuffled", () => {
    const rec = leaveRecordsOf([...store.filter((r) => r.rangeId === "r-1")].reverse());
    expect([rec[0].from, rec[0].to]).toEqual([iso(3), iso(5)]);
  });

  it("🔑 records are grouped under their teacher, the teacher met first coming first", () => {
    // the server answers in DATE order; that order is what 'the teacher met first' means
    const groups = groupByTeacher(leaveRecordsOf(store.filter((r) => r.date >= iso(0)).sort((x, y) => x.date.localeCompare(y.date))));
    expect(groups.map((g) => g.teacherId)).toEqual(["t1", "t2"]);
    expect(groups[0].records.length).toBe(2);
  });
});

describe("🔴 TASK-821 — what the list asks the server", () => {
  it("🔑 UPCOMING is today … +91 days (92 days — the server's ceiling); PAST is the 91 days before today up to YESTERDAY", async () => {
    wrap();
    await waitFor(() => expect(reads().length).toBeGreaterThan(0));
    expect([reads()[0].params?.from, reads()[0].params?.to]).toEqual([iso(0), iso(91)]);
    expect(dayjs(iso(91)).diff(dayjs(iso(0)), "day") + 1).toBeLessThanOrEqual(92);
    await click([...document.querySelectorAll("label")].find((l) => l.textContent === "Past") ?? null);
    await waitFor(() => expect(reads().some((c) => c.params?.from === iso(-91))).toBe(true));
    const past = reads().find((c) => c.params?.from === iso(-91));
    expect(past?.params?.to).toBe(iso(-1));
    expect(dayjs(past?.params?.to as string).diff(dayjs(past?.params?.from as string), "day") + 1).toBeLessThanOrEqual(92);
  });

  it("🚫 the list only reads: opening and switching windows sends nothing else", async () => {
    wrap();
    await waitFor(() => expect(q("[data-teacher-leave-record]")).toBeGreaterThan(0));
    await click([...document.querySelectorAll("label")].find((l) => l.textContent === "Past") ?? null);
    await waitFor(() => expect(q('[data-teacher-leave-record="range:r-old"]')).toBe(1));
    expect(nonGets()).toEqual([]);
  });
});

describe("🔴 TASK-821 — what the admin sees", () => {
  it("🔑 upcoming: per teacher, a range as ONE row with its span, day count and classes, the reason under it — and no PAST leave in this window", async () => {
    wrap();
    await waitFor(() => expect(q("[data-teacher-leave-record]")).toBe(3));
    expect(q('[data-teacher-leave-group="t1"]')).toBe(1);
    expect(q('[data-teacher-leave-group="t2"]')).toBe(1);
    expect(q('[data-teacher-leave-record="range:r-1"]')).toBe(1);
    expect(text()).toContain("3 days"); // the range
    expect(text()).toContain("4 class(es) booked"); // 3 + 1 + 0 over 3 days
    expect(text()).toContain("เหตุผล-เอ");
    expect(q('[data-teacher-leave-record="day:t1:' + iso(-5) + '"]')).toBe(0);
  });

  it("🔑 past: the most recent first, and NO Cancel anywhere on it", async () => {
    wrap();
    await click([...document.querySelectorAll("label")].find((l) => l.textContent === "Past") ?? null);
    await waitFor(() => expect(q("[data-teacher-leave-record]")).toBe(2));
    // the most recent leave first: t1's day 5 days ago comes before t3's range of 10 days ago
    expect([...document.querySelectorAll("[data-teacher-leave-group]")].map((g) => g.getAttribute("data-teacher-leave-group"))).toEqual(["t1", "t3"]);
    expect(q("[data-leave-cancel]")).toBe(0);
    expect(q("[data-teacher-leave-cancel-range]")).toBe(0);
  });

  it("🔑 an empty window says so, in the window's own words", async () => {
    store = [];
    wrap();
    await waitFor(() => expect(q('[data-teacher-leave-empty="upcoming"]')).toBe(1));
    expect(text()).toContain("No upcoming teacher leave.");
    await click([...document.querySelectorAll("label")].find((l) => l.textContent === "Past") ?? null);
    await waitFor(() => expect(q('[data-teacher-leave-empty="past"]')).toBe(1));
  });

  it("🔑 pressing a leave opens TASK-820's panel for it (the whole range inside)", async () => {
    wrap();
    await waitFor(() => expect(q('[data-teacher-leave-record="range:r-1"]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-record="range:r-1"] [data-leave-open]'));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(3));
  });

  it("🔑 the panel opened FROM the list does not offer 'See all teacher leave →' — it is already here", async () => {
    wrap();
    await waitFor(() => expect(q('[data-teacher-leave-record="range:r-1"]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-record="range:r-1"] [data-leave-open]'));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
    expect(q("[data-leave-see-all]")).toBe(0);
  });
});

describe("🔴 TASK-821 — Cancel from the list", () => {
  it("🔑 a ONE-day future leave carries the approved 814 button; a range carries 'Cancel all future days' instead — never both on one row", async () => {
    wrap();
    await waitFor(() => expect(q("[data-teacher-leave-record]")).toBe(3));
    expect(q('[data-teacher-leave-record="day:t2:' + iso(20) + '"] [data-leave-cancel]')).toBe(1);
    expect(document.querySelector('[data-teacher-leave-record="day:t2:' + iso(20) + '"] [data-leave-cancel]')?.textContent).toBe(dictionaries.en.leaveDays.cancelLeave);
    expect(q('[data-teacher-leave-record="range:r-1"] [data-leave-cancel]')).toBe(0);
    expect(q('[data-teacher-leave-record="range:r-1"] [data-teacher-leave-cancel-range]')).toBe(1);
    expect(q('[data-teacher-leave-record="day:t2:' + iso(20) + '"] [data-teacher-leave-cancel-range]')).toBe(0);
  });

  it("🔑 without `action:calendar.status` NO row carries any cancel", async () => {
    allowed = false;
    wrap();
    await waitFor(() => expect(q("[data-teacher-leave-record]")).toBe(3));
    expect(q("[data-leave-cancel]")).toBe(0);
    expect(q("[data-teacher-leave-cancel-range]")).toBe(0);
  });

  it("🔑 'Cancel all future days' → confirm → ONE `DELETE /teacher-leave-ranges/<rangeId>`, the approved told-toast", async () => {
    wrap();
    await waitFor(() => expect(q('[data-teacher-leave-cancel-range="r-1"]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-cancel-range="r-1"]'));
    await waitFor(() => expect(q("[data-lift-range-confirm]")).toBe(1));
    expect(nonGets()).toEqual([]);
    await click(document.querySelector("[data-lift-range-confirm]"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(nonGets().map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /teacher-leave-ranges/r-1"]);
    expect(toasts).toEqual([dictionaries.en.leaveDays.cancelToastTold]);
  });

  it("🔑 the one-day Cancel sends exactly its own `DELETE /teacher-leave-days/<teacher>/<date>`", async () => {
    wrap();
    await waitFor(() => expect(q('[data-teacher-leave-record="day:t2:' + iso(20) + '"] [data-leave-cancel]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-record="day:t2:' + iso(20) + '"] [data-leave-cancel]'));
    await waitFor(() => expect(q("[data-lift-leave-confirm]")).toBe(1));
    await click(document.querySelector("[data-lift-leave-confirm]"));
    await waitFor(() => expect(nonGets().length).toBe(1));
    expect(nonGets()[0].url).toBe(`/teacher-leave-days/t2/${iso(20)}`);
  });
});

describe("🔴 TASK-821 — the calendar panel's 'See all teacher leave →'", () => {
  it("🔑 the calendar's chip panel links to the list ONLY for an admin who holds the Teachers menu", async () => {
    const { default: LeaveDayBanner } = await import("@/components/partials/Calendar/LeaveDayBanner");
    const strip = (rows: LeaveDayRow[]) => h(LeaveDayBanner, { rows, dates: [iso(3)] });
    const mount = () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, strip([store[0]]))))) as never);
    };
    mount();
    await click(document.querySelector("[data-leave-open]"));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
    expect(q("[data-leave-see-all]")).toBe(1);
    expect(document.querySelector("[data-leave-see-all]")?.getAttribute("href")).toBe("/scheduler/teachers#teacher-leave");
    expect(document.querySelector("[data-leave-see-all]")?.textContent).toBe(dictionaries.en.leaveDays.seeAll);
    cleanup();
    menus = ["menu:calendar"];
    mount();
    await click(document.querySelector("[data-leave-open]"));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
    expect(q("[data-leave-see-all]")).toBe(0);
  });
});

describe("✅ TASK-821 — the new words are APPROVED (owner 2026-10-17), in both languages", () => {
  const keys = ["listTitle", "listUpcoming", "listPast", "listEmptyUpcoming", "listEmptyPast", "listDays", "seeAll"] as const;
  it("🔑 seven keys in EN and TH, marked APPROVED once per language", () => {
    for (const k of keys) {
      expect(dictionaries.en.leaveDays[k].length).toBeGreaterThan(3);
      expect(dictionaries.th.leaveDays[k].length).toBeGreaterThan(3);
    }
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-17 (REQ-123 Phase 1, TASK-821").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-17 (REQ-123 Phase 1, TASK-821").length - 1).toBe(1);
  });
});

describe("🔴 TASK-821 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("🔑 the list is mounted on the Teachers page — no new route, no new menu entry", () => {
    expect(code("src/components/partials/Teachers/TeachersContent.tsx")).toContain("<TeacherLeaveList />");
    expect(code("src/components/partials/Teachers/TeacherLeaveList.tsx")).toContain('id="teacher-leave"');
  });

  it("🔑 it is the EXISTING read (`useLeaveDays`) with a past window — no try/catch, and no session read of its own (the page is behind `menu:teachers`)", () => {
    const l = code("src/components/partials/Teachers/TeacherLeaveList.tsx");
    expect(l).toContain("useLeaveDays(from, to, true)");
    expect(l).not.toMatch(/catch/);
    expect(l).not.toMatch(/\buseMe\(/);
  });

  it("🚫 the list holds no booking write — its only mutations are the two leave lifts, reached through their own components", () => {
    const l = code("src/components/partials/Teachers/TeacherLeaveList.tsx");
    expect(l).not.toMatch(/\buse(Cancel|Move|MarkSick|MarkAttended|Pause|Resume|Confirm|Create|Undo|Report|Update)\w*\(/);
    expect(l).toContain("<CancelLeaveButton");
    expect(l).toContain("<LiftRangeConfirm");
  });
});
