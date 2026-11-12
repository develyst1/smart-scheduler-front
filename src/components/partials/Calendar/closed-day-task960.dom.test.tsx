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
import type { ClosedDayRow, LeaveDayClass } from "@/types/api/contract";

/**
 * 🔴 **TASK-960 (SPEC-105 §3/§5, REQ-5013 option B) — close a whole day, clicked.** The server (TASK-959) is a fake at the api boundary, answering the SPEC's shapes; what is under test is
 * the screen: the dialog's refusals, the strip in the day and week views, the panel (its classes, "Open", the re-open confirm in its exact words), and the attention day-link.
 * 🔑 Every assertion is a request, a count or a string — never an element (a failed `waitFor` would print the whole DOM).
 */

const calls: Array<{ method: string; url: string; params?: Record<string, unknown>; body?: Record<string, unknown> }> = [];
let store: ClosedDayRow[] = [];
let postAnswer: (body: Record<string, unknown>) => { created: string[]; alreadyClosed: string[]; classesOnThem: number } = () => ({ created: [], alreadyClosed: [], classesOnThem: 0 });
let postRefusal: { code: string; message: string } | null = null;
let attentionAnswer: unknown = { checks: [], lastRun: null };
const toasts: Array<{ title: string; description?: string; color?: string }> = [];

// The booking modal (real, opened by `Open`) reads the session and the grants. `useCan` is the only thing replaced of `useMe` (declared: `mock.module` is process-global, so `useMe` itself is never stubbed).
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string; description?: string; color?: string }) => void toasts.push(o) }));

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
      if (url === "/attention") return { data: attentionAnswer };
      if (url === "/closed-days") {
        const from = cfg?.params?.from as string;
        const to = cfg?.params?.to as string;
        return { data: { items: store.filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)) } };
      }
      return { data: calendarFor((cfg?.params?.date as string) ?? iso(0)) };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "POST", url, body });
      if (postRefusal) throw new realClient.ApiClientError(postRefusal.code, postRefusal.message, 400);
      return { data: postAnswer(body) };
    },
    delete: async (url: string) => {
      calls.push({ method: "DELETE", url });
      const date = decodeURIComponent(url.split("/")[2]);
      store = store.filter((r) => r.date !== date);
      return { data: { date, reopened: true } };
    },
  },
}));
const realHooks = await import("@/hooks/scheduler");
// the booking modal (real, opened by `Open`) reads a handful of lists on its first render — each is an empty list here; what is under test is WHICH class it is opened on
const none = () => ({ data: [], isLoading: false });
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useTeachers: none, useBadges: none, useEligibleStudents: none, useSellablePackages: () => ({ data: undefined, isLoading: false }), useCatalogItems: none, useBooking: () => ({ data: undefined, isLoading: false }) }));

const { default: ClosedDayBanner } = await import("./ClosedDayBanner");
const { default: CloseDayDialog } = await import("./CloseDayDialog");
const { useClosedDays } = await import("@/hooks/scheduler/useClosedDays");
const { attentionHref, dayRequestFromParams } = await import("@/lib/scheduler/attention-link");

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
const closed = (date: string, reason: ClosedDayRow["reason"], note: string | null, bookings: LeaveDayClass[] = []): ClosedDayRow => ({
  date,
  reason,
  note,
  rangeId: null,
  createdBy: "คุณแอดมิน",
  createdAt: "2026-11-10T03:30:00.000Z",
  bookings,
});

const WEEK = [0, 1, 2, 3, 4, 5, 6].map(iso);
const Strip = ({ dates }: { dates: string[] }) => {
  const { data } = useClosedDays(dates[0], dates[dates.length - 1], true);
  return h(ClosedDayBanner, { rows: data, dates });
};
const wrap = (node: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, node)))) as never,
  );
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
const nonGets = () => calls.filter((c) => c.method !== "GET");

afterEach(cleanup);
beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  postRefusal = null;
  postAnswer = (b) => ({ created: [b.from as string], alreadyClosed: [], classesOnThem: 0 });
  store = [
    closed(iso(1), "HOLIDAY", null, [cls("c1", iso(1)), cls("c2", iso(1), { startTime: "10:00:00", endTime: "10:45:00", childNickname: "บอส", childName: "น้องบอส", program: "DUO เปียโน", status: "PENDING" })]),
    closed(iso(3), "OTHER", "ซ่อมแอร์", []),
  ];
});

describe("🔴 TASK-960 — the strip «วันปิดทำการ · <reason or note>»", () => {
  it("🔑 DAY view: one strip for the viewed closed day, reading the reason by name", async () => {
    wrap(h(Strip, { dates: [iso(1)] }));
    await waitFor(() => expect(q("[data-closed-marker]")).toBe(1));
    expect(document.querySelector("[data-closed-marker]")?.getAttribute("data-closed-marker")).toBe(iso(1));
    expect(text()).toContain("Closed day · Holiday");
    expect(document.querySelector("[data-closed-banner]")?.getAttribute("data-closed-banner")).toBe("1");
  });

  it("🔑 WEEK view: a strip on EACH closed date of the seven, each carrying its date; «อื่นๆ» reads the NOTE the admin typed", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await waitFor(() => expect(q("[data-closed-marker]")).toBe(2));
    expect([...document.querySelectorAll("[data-closed-marker]")].map((e) => e.getAttribute("data-closed-marker"))).toEqual([iso(1), iso(3)]);
    expect(text()).toContain("Closed day · ซ่อมแอร์");
    expect(text()).toContain("Closed day · Holiday");
  });

  it("🔑 a day that is not closed draws nothing; a day outside the dates on screen draws nothing", async () => {
    wrap(h(Strip, { dates: [iso(2)] }));
    await waitFor(() => expect(calls.some((c) => c.url === "/closed-days")).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q("[data-closed-banner]")).toBe(0);
  });

  it("🚫 the read is gated by `enabled`: a hook given `false` (a teacher-scoped session) never asks the server", async () => {
    const Off = () => {
      useClosedDays(iso(0), iso(6), false);
      return null;
    };
    wrap(h(Off));
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toEqual([]);
  });
});

const openPanel = async (date: string) => {
  await waitFor(() => expect(q(`[data-closed-open="${date}"]`)).toBe(1));
  await click(document.querySelector(`[data-closed-open="${date}"]`));
  await waitFor(() => expect(q("[data-closed-panel]")).toBe(1));
};

describe("🔴 TASK-960 — the panel", () => {
  it("🔑 date · reason · «closed by … · when» · the classes still on it (time · who · what · status), each with «Open»", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await openPanel(iso(1));
    expect(q("[data-closed-class]")).toBe(2);
    expect(q("[data-closed-class-open]")).toBe(2);
    expect(text()).toContain("มิว · เปียโน");
    expect(text()).toContain("บอส · DUO เปียโน");
    expect(text()).toContain("09:00 – 09:45");
    expect(text()).toContain("Confirmed");
    expect(document.querySelector("[data-closed-by]")?.textContent).toContain("Closed by คุณแอดมิน · 10 Nov 2026");
    expect(text()).toContain("Reason:");
    expect(text()).toContain("Holiday");
  });

  it("🔑 a closed day with no class left says so, and lists nothing", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await openPanel(iso(3));
    expect(q("[data-closed-class]")).toBe(0);
    expect(q("[data-closed-no-classes]")).toBe(1);
  });

  it("🔑 `Open` closes the panel and reads THAT class's day (the booking modal's own source); opening the panel changed nothing", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await openPanel(iso(1));
    expect(nonGets()).toEqual([]);
    calls.length = 0;
    await click(document.querySelector('[data-closed-class-open="c1"]'));
    await waitFor(() => expect(q("[data-closed-panel]")).toBe(0));
    await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.url === "/calendar" && c.params?.date === iso(1))).toBe(true));
    await waitFor(() => expect(text()).toContain("น้องมิว")); // the real booking modal, on c1
    expect(nonGets()).toEqual([]);
  });

  it("🔑 «Open the day again» only OPENS the confirm, and the confirm reads EXACTLY the approved sentence; nothing is sent yet", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await openPanel(iso(1));
    await click(document.querySelector(`[data-closed-reopen="${iso(1)}"]`));
    await waitFor(() => expect(q("[data-closed-reopen-confirm]")).toBe(1));
    expect(document.querySelector("[data-closed-reopen-text]")?.textContent).toBe(dictionaries.en.closedDay.reopenConfirm);
    expect(nonGets()).toEqual([]);
  });

  it("🔑 the TH words are SPEC-105's own, verbatim (the confirm and the button)", () => {
    expect(dictionaries.th.closedDay.reopenConfirm).toBe("ยกเลิกการปิดเท่านั้น — คลาสที่ยกเลิก/ย้ายไปแล้วจะไม่กลับมา และไม่มีข้อความถึงผู้ปกครอง");
    expect(dictionaries.th.closedDay.reopen).toBe("เปิดวันทำการอีกครั้ง");
    expect(dictionaries.th.closedDay.door).toBe("ปิดวันทำการ");
    expect(dictionaries.th.closedDay.marker).toBe("วันปิดทำการ · {reason}");
    expect(dictionaries.th.closedDay.toastDone).toBe("ปิด {n} วันแล้ว · มี {m} คลาสค้างอยู่ — ดูได้ที่ Attention");
    expect(dictionaries.th.attention.checks.classes_on_closed_days).toBe("คลาสในวันปิดทำการ");
    expect(dictionaries.en.attention.checks.classes_on_closed_days).toBe("Classes on a closed day");
  });

  it("🔑 confirm → ONE `DELETE /closed-days/<date>`, the success toast, and the strip loses that day", async () => {
    wrap(h(Strip, { dates: WEEK }));
    await openPanel(iso(1));
    await click(document.querySelector(`[data-closed-reopen="${iso(1)}"]`));
    await waitFor(() => expect(q("[data-closed-reopen-yes]")).toBe(1));
    await click(document.querySelector("[data-closed-reopen-yes]"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(nonGets().map((c) => `${c.method} ${c.url}`)).toEqual([`DELETE /closed-days/${iso(1)}`]);
    expect(toasts[0].title).toBe(dictionaries.en.closedDay.reopenDone);
    await waitFor(() => expect(q(`[data-closed-marker="${iso(1)}"]`)).toBe(0));
    expect(q(`[data-closed-marker="${iso(3)}"]`)).toBe(1);
  });

  it("🔑 a day that has begun is not offered a re-open (the server refuses it: PAST_DATE)", async () => {
    store = [closed(iso(-1), "WEATHER", null, [])];
    wrap(h(Strip, { dates: [iso(-1)] }));
    await openPanel(iso(-1));
    expect(q("[data-closed-reopen]")).toBe(0);
  });
});

describe("🔴 TASK-960 — the close-a-day dialog", () => {
  const mount = (initialDate = iso(2)) => wrap(h(CloseDayDialog, { opened: true, initialDate, onClose: () => {} }));
  const pickReason = async (name: string) => {
    await click(document.querySelector("[data-close-day-reason]"));
    await waitFor(() => expect(q('[role="option"]')).toBeGreaterThan(0));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(name)) as HTMLElement);
  };

  it("🔑 starts on the day being viewed; a viewed day in the PAST is clamped to today (past dates are not offered)", async () => {
    mount(iso(-5));
    await waitFor(() => expect(q("[data-close-day-dialog]")).toBe(1));
    expect((document.querySelector("[data-close-day-from]") as HTMLInputElement | HTMLButtonElement).textContent || (document.querySelector("[data-close-day-from]") as HTMLInputElement).value).toContain(dayjs().format("D MMM YYYY"));
  });

  it("🔑 past dates are DISABLED in the picker (guarded: only when yesterday is in the month the picker opens on)", async () => {
    if (dayjs().date() === 1) return; // yesterday is in the previous month on the 1st: the calendar opens on this month and shows no past day to test
    mount(iso(0));
    await click(document.querySelector("[data-close-day-from]"));
    const yesterday = dayjs().subtract(1, "day");
    const btn = await waitFor(() => {
      const b = [...document.querySelectorAll<HTMLButtonElement>("button.mantine-DatePicker-day, button[data-with-spacing], td button")].find(
        (x) => x.textContent === String(yesterday.date()) && !x.hasAttribute("data-outside"),
      );
      if (!b) throw new Error("no yesterday button");
      return b;
    });
    expect(btn.hasAttribute("disabled") || btn.getAttribute("data-disabled") === "true" || btn.getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("🔑 «อื่นๆ» (Other) needs a note: Save is disabled with the refusal in words, nothing is sent; with a note it goes", async () => {
    mount();
    await pickReason("Other");
    await waitFor(() => expect(text()).toContain(dictionaries.en.closedDay.noteRequired));
    expect((document.querySelector("[data-close-day-submit]") as HTMLButtonElement).disabled).toBe(true);
    await click(document.querySelector("[data-close-day-submit]"));
    expect(nonGets()).toEqual([]);
    await userEvent.setup().type(document.querySelector("[data-close-day-note]") as HTMLElement, "ซ่อมแอร์");
    await waitFor(() => expect((document.querySelector("[data-close-day-submit]") as HTMLButtonElement).disabled).toBe(false));
    await click(document.querySelector("[data-close-day-submit]"));
    await waitFor(() => expect(nonGets().length).toBe(1));
    expect(nonGets()[0]).toEqual({ method: "POST", url: "/closed-days", body: { from: iso(2), reason: "OTHER", note: "ซ่อมแอร์" } });
  });

  it("🔑 a fixed reason needs no note: ONE `POST /closed-days` with `{ from, reason }` (no `to`, no `note` key)", async () => {
    mount();
    await click(document.querySelector("[data-close-day-submit]"));
    await waitFor(() => expect(nonGets().length).toBe(1));
    expect(nonGets()[0].body).toEqual({ from: iso(2), reason: "HOLIDAY" });
  });

  it("🔑 the toast is built from `created` / `classesOnThem` (and says how many were already closed when some were)", async () => {
    postAnswer = () => ({ created: [iso(2), iso(3)], alreadyClosed: [iso(4)], classesOnThem: 5 });
    mount();
    await click(document.querySelector("[data-close-day-submit]"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].title).toBe("Closed 2 day(s) · 5 class(es) still on them — see Attention (1 day(s) were already closed)");
    toasts.length = 0;
    cleanup();
    postAnswer = () => ({ created: [iso(2)], alreadyClosed: [], classesOnThem: 0 });
    mount();
    await click(document.querySelector("[data-close-day-submit]"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].title).toBe("Closed 1 day(s) · 0 class(es) still on them — see Attention");
  });

  it("🔑 the server's refusal (e.g. RANGE_TOO_LONG) stays in the dialog, in its words; no toast", async () => {
    postRefusal = { code: "RANGE_TOO_LONG", message: "ปิดได้ครั้งละไม่เกิน 31 วัน" };
    mount();
    await click(document.querySelector("[data-close-day-submit]"));
    await waitFor(() => expect(q("[data-close-day-error]")).toBe(1));
    expect(document.querySelector("[data-close-day-error]")?.textContent).toContain("ปิดได้ครั้งละไม่เกิน 31 วัน");
    expect(toasts).toEqual([]);
  });
});

describe("🔴 TASK-960 — the attention day-link: ONE place builds it, ONE place reads it", () => {
  it("🔑 `{ kind: 'day', date }` → `/scheduler/calendar?date=…`; the plan links are unchanged", () => {
    expect(attentionHref({ kind: "day", date: "2026-11-20" })).toBe("/scheduler/calendar?date=2026-11-20");
    expect(attentionHref({ kind: "course", id: "a b" })).toBe("/scheduler/bookings?course=a%20b");
    expect(attentionHref({ kind: "voucher", id: "v-5" })).toBe("/scheduler/bookings?voucher=v-5");
  });

  it("🔑 the calendar reads `?date` — a real YYYY-MM-DD only; anything else (or no key) is ignored", () => {
    const read = (qs: string) => dayRequestFromParams((k) => new URLSearchParams(qs).get(k));
    expect(read("date=2026-11-20")).toBe("2026-11-20");
    expect(read("")).toBeNull();
    expect(read("date=")).toBeNull();
    expect(read("date=tomorrow")).toBeNull();
    expect(read("date=2026-13-40")).toBeNull();
    expect(read("date=2026-02-30")).toBeNull();
    expect(read("course=c-1")).toBeNull();
  });

  it("🔑 a day link built here is read back by the reader (round trip)", () => {
    const href = attentionHref({ kind: "day", date: "2026-12-05" });
    expect(dayRequestFromParams((k) => new URL(href, "http://x").searchParams.get(k))).toBe("2026-12-05");
  });
});

describe("🔴 TASK-960 — the Attention card renders itself", () => {
  it("🔑 `classes_on_closed_days`: the card's title in the viewer's language, and each item is a link to the calendar ON THAT DATE (the server's label is the text)", async () => {
    attentionAnswer = {
      checks: [
        {
          key: "classes_on_closed_days",
          titleKey: "att_classes_on_closed_days",
          title: "คลาสในวันปิดทำการ",
          count: 2,
          items: [
            { id: "b1", label: "20 พ.ย. 09:00 · น้องมิว · เอ", link: { kind: "day", date: "2026-11-20" } },
            { id: "b2", label: "21 พ.ย. 10:00 · กลุ่ม A · บี", link: { kind: "day", date: "2026-11-21" } },
          ],
        },
      ],
      lastRun: null,
    };
    window.localStorage.setItem("t960-lang", "en");
    const { default: AttentionContent } = await import("../Attention/AttentionContent");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t960-lang" }, h(AttentionContent)))) as never);
    await waitFor(() => expect(q('a[data-attention-link="day"]')).toBe(2));
    expect([...document.querySelectorAll('a[data-attention-link="day"]')].map((a) => `${a.getAttribute("href")} | ${a.textContent}`)).toEqual([
      "/scheduler/calendar?date=2026-11-20 | 20 พ.ย. 09:00 · น้องมิว · เอ",
      "/scheduler/calendar?date=2026-11-21 | 21 พ.ย. 10:00 · กลุ่ม A · บี",
    ]);
    expect(text()).toContain("Classes on a closed day");
  });
});

describe("🔴 TASK-960 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/";

  it("🔑 the header button is for the admin only: never a teacher-scoped session, and the read is gated by the same `!scoped`", () => {
    const c = code(C + "CalendarContent.tsx");
    expect(c).toContain('const canCloseDay = !scoped && can("action:calendar.status");');
    expect(c).toContain("{canCloseDay && (");
    expect(c).toContain("useClosedDays(leaveRange.from, leaveRange.to, !scoped)");
  });

  it("🔑 the strip is mounted in the DAY view and the WEEK view, next to the leave strip", () => {
    const c = code(C + "CalendarContent.tsx");
    expect(c).toContain("<ClosedDayBanner rows={closedDays} dates={[date]} />");
    expect(c).toContain("<ClosedDayBanner rows={closedDays} dates={weekDays} />");
  });

  it("🔑 `?date` is read ONCE (the initial state) through the attention-link reader, not re-read on every render", () => {
    const c = code(C + "CalendarContent.tsx");
    expect(c).toContain('const [date, setDate] = useState(() => dayRequestFromParams((k) => params?.get(k) ?? null) ?? dayjs().format("YYYY-MM-DD"));');
    expect(code("src/app/(admin)/scheduler/calendar/page.tsx")).toContain("<Suspense");
  });

  it("🔑 the dialog's pickers start at today (past dates disabled) and the banner file holds no press-handler", () => {
    const d = code(C + "CloseDayDialog.tsx");
    expect(d).toContain("minDate={today}");
    expect(code(C + "ClosedDayBanner.tsx")).toContain("<ClosedDayChip");
    expect(code(C + "ClosedDayBanner.tsx")).not.toContain("onClick");
  });

  it("🔑 a `DAY_CLOSED` 409 needs no new code: every placing door shows the server's own `message` (ApiClientError.message) — create, move; the client error carries the body's message untouched", () => {
    const modal = code(C + "Modal/BookingModal.tsx");
    expect(modal).toContain("e instanceof ApiClientError ? e.message : (e as Error).message");
    expect(modal).toContain("if (e instanceof ApiClientError) setSubmitError(e.message);");
    const client = code("src/lib/api/client.ts");
    expect(client).toContain("studentPhoneSentence(body.error) ?? body.error.message");
  });
});
