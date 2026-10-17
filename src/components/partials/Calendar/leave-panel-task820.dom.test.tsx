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
import type { LeaveDayClass, LeaveDayRow } from "@/types/api/contract";

/**
 * 🔴 **TASK-820 (REQ-123 P3 + P4; BE TASK-819) — the calendar chip opens the LEAVE: its days, the classes on each (who · what · when · status), "Open", and Cancel.**
 *
 * 🔑 **What can go wrong without anyone seeing it:** a range shown as only the day on screen · a class row that names nobody · "Open" that does not reach the booking read · a
 * Cancel offered on a day that has begun · "Cancel all future days" on a single-day leave or without the key · a cancel that sends the wrong id (or one per day) · a panel that
 * quietly changes classes. Every assertion is a request, a count or a string — never an element (a failed `waitFor` would print the whole DOM).
 */

let allowed = true;
const calls: Array<{ method: string; url: string; params?: Record<string, unknown> }> = [];
let store: LeaveDayRow[] = [];
let deleteAnswer: () => Promise<{ data: unknown }> = async () => ({ data: { rangeId: "r-1", lifted: [], kept: [], teacherNotified: 1 } });
const toasts: string[] = [];

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string }) => void toasts.push(o.title) }));
const realMe = await import("@/hooks/scheduler/useMe");
// 🔻 TASK-821, declared: the panel now reads the menu set (for its "See all teacher leave →" link) through the REAL `useMe`, so the tree gets a real SessionProvider holding an admin
// who has the Teachers menu. 🚫 `useMe` itself is never replaced: `mock.module` is process-global, and a stub of it leaks into other files (it broke TASK-726's header test).
let menus: string[] = ["menu:teachers"];
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus, actions: [], roleName: null, teacherId: null });

const iso = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");
const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "t1",
          slots: [
            {
              startTime: "09:00:00",
              booking: {
                id: "c1",
                date,
                startTime: "09:00:00",
                endTime: "09:45:00",
                status: "CONFIRMED",
                displayName: "น้องมิว",
                bookingType: "COURSE_PACKAGE",
                teacher: { id: "t1", name: "ครูเอ", nickname: "เอ" },
                student: { id: "s1", name: "น้องมิว", nickname: null },
                additionalTeachers: [],
              },
            },
          ],
        },
      ],
    },
  ],
});

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      calls.push({ method: "GET", url, params: cfg?.params });
      if (url === "/me") return { data: { user: meUser() } };
      if (url === "/teacher-leave-days") {
        const tid = cfg?.params?.teacherId as string | undefined;
        const from = cfg?.params?.from as string | undefined;
        const to = cfg?.params?.to as string | undefined;
        return { data: { items: store.filter((r) => (!tid || r.teacherId === tid) && (!from || r.date >= from) && (!to || r.date <= to)) } };
      }
      return { data: calendarFor((cfg?.params?.date as string) ?? iso(0)) };
    },
    delete: async (url: string) => {
      calls.push({ method: "DELETE", url });
      const res = await deleteAnswer();
      if (url.startsWith("/teacher-leave-ranges/")) {
        const id = url.split("/")[2];
        store = store.filter((r) => !(r.rangeId === id && r.date > iso(0)));
      } else {
        const [, , tid, date] = url.split("/");
        store = store.filter((r) => !(r.teacherId === tid && r.date === date));
      }
      return res;
    },
  },
}));
const realHooks = await import("@/hooks/scheduler");
// the booking modal (real, opened by `Open`) reads a handful of lists on its first render — each is an empty list here; what is under test is WHICH class it is opened on
const none = () => ({ data: [], isLoading: false });
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useTeachers: none, useBadges: none, useEligibleStudents: none, useSellablePackages: () => ({ data: undefined, isLoading: false }), useCatalogItems: none, useBooking: () => ({ data: undefined, isLoading: false }) }));

const { default: LeaveDayBanner } = await import("./LeaveDayBanner");
const { leaveClassWho, leaveClassWhat, daysOfLeave } = await import("./LeaveDayPanel");

const cls = (id: string, date: string, extra: Partial<LeaveDayClass> = {}): LeaveDayClass => ({
  id,
  date,
  startTime: "09:00:00",
  endTime: "09:45:00",
  status: "CONFIRMED",
  bookingType: "COURSE_PACKAGE",
  childName: "น้องมิว",
  childNickname: "มิว",
  coChildName: null,
  coChildNickname: null,
  program: "เปียโน",
  title: null,
  inCourse: true,
  ...extra,
});
const row = (teacherId: string, teacherName: string, date: string, rangeId: string | null, bookings: LeaveDayClass[] = []): LeaveDayRow => ({
  teacherId,
  teacherName,
  date,
  reason: "ไปอบรม",
  createdBy: null,
  rangeId,
  bookings,
});

const STRIP = [-2, -1, 0, 1, 2, 3].map(iso); // what the calendar week on screen holds
const Strip = () => {
  const { data } = realHooks.useLeaveDays(STRIP[0], STRIP[STRIP.length - 1], true);
  return h(LeaveDayBanner, { rows: data, dates: STRIP });
};
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(Strip))))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
const openPanel = async (tid: string, date: string) => {
  await waitFor(() => expect(q(`[data-leave-open="${tid}|${date}"]`)).toBe(1));
  await click(document.querySelector(`[data-leave-open="${tid}|${date}"]`));
  await waitFor(() => expect(q("[data-leave-panel]")).toBe(1));
};
const nonGets = () => calls.filter((c) => c.method !== "GET");

afterEach(cleanup);
beforeEach(() => {
  allowed = true;
  calls.length = 0;
  toasts.length = 0;
  deleteAnswer = async () => ({ data: { rangeId: "r-1", lifted: [iso(1), iso(2), iso(3), iso(10)], kept: [], teacherNotified: 1 } });
  store = [
    row("t1", "เอ", iso(-1), null, [cls("past-1", iso(-1))]), // a single-day record, in the past
    row("t1", "เอ", iso(1), "r-1", [cls("c1", iso(1)), cls("c2", iso(1), { startTime: "10:00:00", endTime: "10:45:00", childNickname: "บอส", childName: "น้องบอส", coChildNickname: "แพร", coChildName: "น้องแพร", program: "DUO เปียโน", status: "PENDING" })]),
    row("t1", "เอ", iso(2), "r-1", []),
    row("t1", "เอ", iso(3), "r-1", [cls("c3", iso(3), { program: null, title: "ค่ายฤดูร้อน" })]),
    row("t1", "เอ", iso(10), "r-1", []), // OUTSIDE the week on screen, same range
    row("t2", "บี", iso(2), null, []), // another coach, a single day
  ];
});

describe("🔴 TASK-820 — the pure helpers", () => {
  it("🔑 WHO: nickname first, DUO shows BOTH, an older server's missing names read as nothing", () => {
    expect(leaveClassWho(cls("x", iso(1)))).toBe("มิว");
    expect(leaveClassWho(cls("x", iso(1), { childNickname: null }))).toBe("น้องมิว");
    expect(leaveClassWho(cls("x", iso(1), { coChildNickname: "แพร" }))).toBe("มิว + แพร");
    expect(leaveClassWho({ id: "x", date: iso(1), startTime: "", endTime: "", status: "CONFIRMED", bookingType: null })).toBe("");
  });

  it("🔑 WHAT: the program, or an 'other' row's title, or nothing", () => {
    expect(leaveClassWhat(cls("x", iso(1)))).toBe("เปียโน");
    expect(leaveClassWhat(cls("x", iso(1), { program: null, title: "ค่าย" }))).toBe("ค่าย");
    expect(leaveClassWhat(cls("x", iso(1), { program: null, title: null }))).toBe("");
  });

  it("🔑 the days of ONE leave: the whole range by `rangeId` (date order, this teacher only) — or just the one day", () => {
    const rangeDays = daysOfLeave([...store].reverse(), "t1", iso(1), "r-1").map((r) => r.date);
    expect(rangeDays).toEqual([iso(1), iso(2), iso(3), iso(10)]);
    expect(daysOfLeave(store, "t1", iso(-1), null).map((r) => r.date)).toEqual([iso(-1)]);
    expect(daysOfLeave(store, "t2", iso(2), null).map((r) => r.teacherId)).toEqual(["t2"]);
  });
});

describe("🔴 TASK-820 — the panel", () => {
  it("🔑 the chip opens it; it shows the WHOLE range (a day outside the week on screen too), each day's classes with who · what · time · status", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(4)); // iso(1), (2), (3) AND iso(10) — the strip itself only holds the first three
    expect(q(`[data-leave-panel-day="${iso(10)}"]`)).toBe(1);
    expect(q("[data-leave-panel-class]")).toBe(3);
    expect(text()).toContain("มิว · เปียโน"); // who · what
    expect(text()).toContain("แพร".length > 0 ? "บอส + แพร · DUO เปียโน" : ""); // a DUO class names BOTH children
    expect(text()).toContain("ค่ายฤดูร้อน"); // an 'other' row shows its title
    expect(text()).toContain("09:00 – 09:45");
    expect(text()).toContain("Confirmed");
    expect(text()).toContain("ไปอบรม"); // the reason
  });

  it("🔑 it asks the server for THIS teacher's days only (`teacherId`), and a panel for a single-day leave shows just that day", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(4));
    expect(calls.some((c) => c.method === "GET" && c.url === "/teacher-leave-days" && c.params?.teacherId === "t1")).toBe(true);
    cleanup();
    calls.length = 0;
    wrap();
    await openPanel("t2", iso(2));
    await waitFor(() => expect(calls.some((c) => c.params?.teacherId === "t2")).toBe(true));
    expect(q("[data-leave-panel-day]")).toBe(1);
  });

  it("🚫 opening the panel CHANGES NOTHING — every request it made is a read", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(4));
    expect(nonGets()).toEqual([]);
  });

  it("🔑 `Open` closes the panel and reads THAT class's day (the booking modal's own source) — and still sends nothing", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q('[data-leave-class-open="c1"]')).toBe(1));
    calls.length = 0;
    await click(document.querySelector('[data-leave-class-open="c1"]'));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(0));
    await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.url !== "/teacher-leave-days" && c.params?.date === iso(1))).toBe(true));
    // 🔑 and it is the REAL booking modal, on THAT class (the one found by its id in the day's read): its own student name is on screen
    await waitFor(() => expect(text()).toContain("น้องมิว"));
    expect(nonGets()).toEqual([]);
  });
});

describe("🔴 TASK-820 — `Open` on a class that has gone from the day's read", () => {
  it("🔑 opens NOTHING (never a half-filled modal, never another class): c3 is not in the calendar read, which holds only c1", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q('[data-leave-class-open="c3"]')).toBe(1));
    await click(document.querySelector('[data-leave-class-open="c3"]'));
    await waitFor(() => expect(q("[data-leave-panel]")).toBe(0));
    await waitFor(() => expect(calls.some((c) => c.params?.date === iso(3) && c.url === "/calendar")).toBe(true));
    await new Promise((r) => setTimeout(r, 200));
    expect(text()).not.toContain("น้องมิว"); // c1's modal did not open in its place
  });
});

describe("🔴 TASK-820 — Cancel, per day and for the range", () => {
  it("🔑 the per-day Cancel is the approved 814 control: offered on FUTURE days only (the past day's panel carries none)", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(4));
    expect(q("[data-leave-cancel]")).toBe(4);
    expect(document.querySelector("[data-leave-cancel]")?.textContent).toBe(dictionaries.en.leaveDays.cancelLeave);
    cleanup();
    wrap();
    await openPanel("t1", iso(-1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(1));
    expect(q("[data-leave-cancel]")).toBe(0);
  });

  it("🔑 `Cancel all future days` is for a RANGE with a future day AND the key: never a single day, never without the key", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    cleanup();
    wrap();
    await openPanel("t2", iso(2)); // a single-day record
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(1));
    expect(q("[data-leave-cancel-range]")).toBe(0);
    // 🔑 by its WORDS too: a button with no range id would carry no attribute at all, and would still be a dead button on screen
    expect(text()).not.toContain(dictionaries.en.leaveDays.cancelRange);
    cleanup();
    allowed = false;
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(4));
    expect(q("[data-leave-cancel-range]")).toBe(0);
    // 🔑 by its WORDS too: a button with no range id would carry no attribute at all, and would still be a dead button on screen
    expect(text()).not.toContain(dictionaries.en.leaveDays.cancelRange);
  });

  it("🔴 a range that has NO day left ahead offers no 'cancel all' (its days are all behind us)", async () => {
    store = [row("t1", "เอ", iso(-2), "r-old", []), row("t1", "เอ", iso(-1), "r-old", [])];
    wrap();
    await openPanel("t1", iso(-1));
    await waitFor(() => expect(q("[data-leave-panel-day]")).toBe(2));
    expect(q("[data-leave-cancel-range]")).toBe(0);
    // 🔑 by its WORDS too: a button with no range id would carry no attribute at all, and would still be a dead button on screen
    expect(text()).not.toContain(dictionaries.en.leaveDays.cancelRange);
  });

  it("🔑 pressing it only OPENS the confirm (the range's span in the title, the approved buttons); nothing is sent yet", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(q("[data-lift-range-confirm]")).toBe(1));
    expect(text()).toContain("Cancel เอ's leave from");
    expect(text()).toContain(dictionaries.en.leaveDays.cancelNo);
    expect(nonGets()).toEqual([]);
  });

  it("🔑 confirm → ONE `DELETE /teacher-leave-ranges/<rangeId>` (never one per day), the told-toast, and the lifted days are gone from the strip", async () => {
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(q("[data-lift-range-confirm]")).toBe(1));
    await click(document.querySelector("[data-lift-range-confirm]"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(nonGets().map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /teacher-leave-ranges/r-1"]);
    expect(toasts).toEqual([dictionaries.en.leaveDays.cancelToastTold]);
    await waitFor(() => expect(q(`[data-leave-marker="t1|${iso(1)}"]`)).toBe(0));
    expect(q(`[data-leave-marker="t1|${iso(-1)}"]`)).toBe(1); // the past day stands
  });

  it("🔑 `teacherNotified: 0` ⇒ the NOT-told toast; a REFUSAL keeps everything, shows the server's sentence and no toast", async () => {
    deleteAnswer = async () => ({ data: { rangeId: "r-1", lifted: [iso(1)], kept: [], teacherNotified: 0 } });
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(q("[data-lift-range-confirm]")).toBe(1));
    await click(document.querySelector("[data-lift-range-confirm]"));
    await waitFor(() => expect(toasts).toEqual([dictionaries.en.leaveDays.cancelToastNotTold]));
    cleanup();
    toasts.length = 0;
    calls.length = 0;
    store = [row("t1", "เอ", iso(1), "r-1", []), row("t1", "เอ", iso(2), "r-1", [])];
    deleteAnswer = async () => {
      throw new Error("Only a future leave day can be cancelled.");
    };
    wrap();
    await openPanel("t1", iso(1));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(q("[data-lift-range-confirm]")).toBe(1));
    await click(document.querySelector("[data-lift-range-confirm]"));
    await waitFor(() => expect(document.querySelector("[data-lift-range-error]")?.textContent ?? "").toContain("Only a future leave day"));
    expect(toasts).toEqual([]);
    expect(q(`[data-leave-marker="t1|${iso(1)}"]`)).toBe(1);
  });
});

describe("✅ TASK-820 — the new words are APPROVED (owner 2026-10-17), in both languages; the approved ones are reused untouched", () => {
  const keys = ["panelTitle", "panelNote", "panelOpen", "cancelRange", "cancelRangeTitle", "cancelRangeBody"] as const;
  it("🔑 six keys in EN and TH, marked APPROVED once per language", () => {
    for (const k of keys) {
      expect(dictionaries.en.leaveDays[k].length).toBeGreaterThan(3);
      expect(dictionaries.th.leaveDays[k].length).toBeGreaterThan(3);
    }
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-17 (REQ-123 Phase 1, TASK-820").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-17 (REQ-123 Phase 1, TASK-820").length - 1).toBe(1);
  });

  it("🔒 the approved 814 strings the range's confirm REUSES (buttons, both toasts) are untouched", () => {
    const en = dictionaries.en.leaveDays;
    expect([en.cancelYes, en.cancelNo]).toEqual(["Cancel leave", "Keep leave"]);
    expect(en.cancelToastTold).toBe("Leave cancelled — the teacher was told on LINE");
    expect(en.cancelToastNotTold).toBe("Leave cancelled — the teacher has no LINE link, please tell them yourself");
  });
});

describe("🔴 TASK-820 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/";

  it("🔑 the chip's text is the panel's door, and the banner file itself holds no press-handler (TASK-589's pin reads it)", () => {
    expect(code(C + "LeaveDayBanner.tsx")).toContain("<LeaveChip");
    expect(code(C + "LeaveChip.tsx")).toContain("onClick={() => setPanel(true)}");
  });

  it("🔑 `Open` hands the booking modal the class found by its ID in the calendar's own day read — never a rebuilt booking", () => {
    const o = code(C + "LeaveClassOpener.tsx");
    expect(o).toContain("day.find((b) => b.id === classId)");
    expect(o).toContain("<BookingModal isOpen onClose={onClose} booking={booking}");
  });

  it("🔑 the range cancel is ONE call by the range id; the panel asks for this teacher's days; the strip's family of keys is refreshed", () => {
    expect(code("src/services/scheduler.service.ts")).toContain("`/teacher-leave-ranges/${encodeURIComponent(rangeId)}`");
    expect(code("src/services/scheduler.service.ts")).toContain("...(teacherId ? { teacherId } : {})");
    const hooks = code("src/hooks/scheduler/useScheduler.ts");
    const start = hooks.indexOf("export const useLiftLeaveRange");
    expect(hooks.slice(start, hooks.indexOf("export const", start + 10))).toContain('qc.invalidateQueries({ queryKey: ["leave-days"] });');
    expect(code(C + "LeaveDayPanel.tsx")).toContain("useTeacherLeaveDays(row.teacherId,");
  });

  it("🚫 the front compares no range dates by itself to decide what to lift — the server lifts the days still ahead and reports `kept`", () => {
    expect(code(C + "LiftRangeConfirm.tsx")).not.toMatch(/dayjs|isBefore|isAfter|new Date/);
  });
});
