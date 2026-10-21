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
 * 🔴 **REQ-125 O1 ("O1 A") — the Cancel-leave confirm says the teacher GOES BACK ON the co-taught classes the leave took them off (n > 0), and is word-for-word today's text at n = 0.**
 *
 * 🔑 The wrong sentence is a promise that is false either way: «Existing classes don't change» when classes are about to be put back, or «goes back on 0 co-taught classes» when nothing is.
 * So every assertion is the WHOLE body text, at n = 0 (today's, unchanged) and n > 0 (the approved one, with the right n, EN and TH) — and n is the list's `continues` for THAT day, or for the
 * FUTURE days of a range only (a past day's classes are not put back). Helpers answer strings or numbers, never elements.
 */

let allowed = true;
let store: LeaveDayRow[] = [];
const iso = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:teachers"], actions: [], roleName: null, teacherId: null } } };
      if (url === "/teacher-leave-days") {
        const tid = cfg?.params?.teacherId as string | undefined;
        const from = cfg?.params?.from as string | undefined;
        const to = cfg?.params?.to as string | undefined;
        return { data: { items: store.filter((r) => (!tid || r.teacherId === tid) && (!from || r.date >= from) && (!to || r.date <= to)).sort((a, b) => a.date.localeCompare(b.date)) } };
      }
      return { data: { days: [] } };
    },
    delete: async () => ({ data: { lifted: true, teacherNotified: 1 } }),
  },
}));

const { default: LiftLeaveConfirm } = await import("./LiftLeaveConfirm");
const { default: LiftRangeConfirm } = await import("./LiftRangeConfirm");
const { default: LeaveDayPanel } = await import("./LeaveDayPanel");
const { default: TeacherLeaveList } = await import("@/components/partials/Teachers/TeacherLeaveList");

const en = dictionaries.en.leaveDays;
const th = dictionaries.th.leaveDays;
const EN_ONE_TODAY = "That day opens for bookings with this teacher again. Existing classes don't change. The teacher is told on LINE.";
const EN_RANGE_TODAY = "The days still ahead open for bookings with this teacher again. Days that have already begun stay as they are. Existing classes don't change. The teacher is told on LINE.";
const EN_ONE = (name: string, n: number) => `That day opens for bookings with this teacher again. ${name} goes back on the ${n} co-taught class(es) they were taken off when the leave was recorded. Other classes don't change. The teacher is told on LINE.`;
const EN_RANGE = (name: string, n: number) => `The days still ahead open for bookings with this teacher again. Days that have already begun stay as they are. ${name} goes back on the ${n} co-taught class(es) they were taken off when the leave was recorded. Other classes don't change. The teacher is told on LINE.`;

const wrap = (el: ReturnType<typeof h>, lang: "en" | "th" = "en") => {
  window.localStorage.setItem("o1-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:teachers"], actions: [], roleName: null, teacherId: null };
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "o1-lang" }, h(SessionProvider, { session: { user, expires: "2999-01-01" } as never }, el)))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
/** the body paragraph of whichever confirm is OPEN (closed ones can stay mounted with an empty body) */
const body = () =>
  [...document.querySelectorAll("[data-lift-leave-dialog], [data-lift-range-dialog]")]
    .map((d) => d.querySelector("p")?.textContent ?? "")
    .find((x) => x !== "") ?? "";

const row = (date: string, rangeId: string | null, continues?: number): LeaveDayRow => ({
  teacherId: "t1",
  teacherName: "เอ",
  date,
  reason: "x",
  createdBy: null,
  rangeId,
  bookings: [],
  ...(continues ? { continues: Array.from({ length: continues }, (_, i) => ({ bookingId: `c-${date}-${i}`, startTime: "14:00", with: ["บี"] })) } : {}),
});

afterEach(cleanup);
beforeEach(() => {
  allowed = true;
  store = [];
});

describe("🔴 O1 — the two confirms, directly: n = 0 is TODAY's text word for word; n > 0 is the approved line", () => {
  const one = (restoreN?: number, lang: "en" | "th" = "en") => wrap(h(LiftLeaveConfirm, { opened: true, onClose: () => {}, teacherId: "t1", teacherName: "เอ", date: iso(3), restoreN }), lang);
  const range = (restoreN?: number, lang: "en" | "th" = "en") => wrap(h(LiftRangeConfirm, { opened: true, onClose: () => {}, rangeId: "r1", teacherName: "เอ", from: iso(3), to: iso(5), restoreN }), lang);

  it("🔑 ONE day, n = 0 (and no n at all): exactly today's English and Thai body — the restoring sentence is NOT there", async () => {
    one(0);
    await waitFor(() => expect(body()).toBe(EN_ONE_TODAY));
    expect(body()).not.toContain("goes back on");
    cleanup();
    one(undefined);
    await waitFor(() => expect(body()).toBe(EN_ONE_TODAY));
    cleanup();
    one(0, "th");
    await waitFor(() => expect(body()).toBe(th.cancelBody));
    expect(th.cancelBody).toBe("วันนั้นจะกลับมาจองคาบกับครูได้ตามปกติ คาบที่มีอยู่แล้วไม่มีอะไรเปลี่ยน และระบบจะแจ้งครูทาง LINE");
  });

  it("🔑 ONE day, n = 2: the approved line with the teacher's name and 2 — «Existing classes don't change» is gone — in English and Thai", async () => {
    one(2);
    await waitFor(() => expect(body()).toBe(EN_ONE("เอ", 2)));
    expect(body()).not.toContain("Existing classes");
    cleanup();
    one(2, "th");
    await waitFor(() => expect(body()).toBe("วันนั้นจะกลับมาจองคาบกับครูได้ตามปกติ ครู เอ จะกลับเข้าคาบที่สอนร่วม 2 คาบที่ถูกนำออกไปตอนบันทึกลา คาบอื่นไม่มีอะไรเปลี่ยน และระบบจะแจ้งครูทาง LINE"));
    expect(body()).not.toContain("คาบที่มีอยู่แล้ว");
  });

  it("🔑 a RANGE, n = 0: today's range body word for word (EN and TH)", async () => {
    range(0);
    await waitFor(() => expect(body()).toBe(EN_RANGE_TODAY));
    cleanup();
    range(0, "th");
    await waitFor(() => expect(body()).toBe(th.cancelRangeBody));
    expect(th.cancelRangeBody).toBe("วันที่ยังไม่ถึงจะกลับมาจองคาบกับครูได้ตามปกติ วันที่เริ่มหรือผ่านไปแล้วคงไว้ตามเดิม คาบที่มีอยู่แล้วไม่มีอะไรเปลี่ยน และระบบจะแจ้งครูทาง LINE");
  });

  it("🔑 a RANGE, n = 3: the approved line, 'Days that have already begun' still said, 3 and the name (EN and TH)", async () => {
    range(3);
    await waitFor(() => expect(body()).toBe(EN_RANGE("เอ", 3)));
    cleanup();
    range(3, "th");
    await waitFor(() =>
      expect(body()).toBe("วันที่ยังไม่ถึงจะกลับมาจองคาบกับครูได้ตามปกติ วันที่เริ่มหรือผ่านไปแล้วคงไว้ตามเดิม ครู เอ จะกลับเข้าคาบที่สอนร่วม 3 คาบที่ถูกนำออกไปตอนบันทึกลา คาบอื่นไม่มีอะไรเปลี่ยน และระบบจะแจ้งครูทาง LINE"),
    );
  });

  it("🔒 the four new bodies are marked APPROVED once per language and the old two are untouched", () => {
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-21 (REQ-125 O1 = A").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-21 (REQ-125 O1 = A").length - 1).toBe(1);
    expect(en.cancelBody).toBe(EN_ONE_TODAY);
    expect(en.cancelRangeBody).toBe(EN_RANGE_TODAY);
  });
});

describe("🔴 O1 — n comes from the LIST's `continues` (never a guess)", () => {
  it("🔑 the PANEL, one day: a day that took the teacher off 2 co-taught classes → the new body with 2; a day that took none → today's", async () => {
    const r = row(iso(3), null, 2);
    store = [r];
    wrap(h(LeaveDayPanel, { opened: true, onClose: () => {}, row: r, onOpenClass: () => {} }));
    await waitFor(() => expect(q("[data-leave-cancel]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel]"));
    await waitFor(() => expect(body()).toBe(EN_ONE("เอ", 2)));
    cleanup();
    const r0 = row(iso(3), null);
    store = [r0];
    wrap(h(LeaveDayPanel, { opened: true, onClose: () => {}, row: r0, onOpenClass: () => {} }));
    await waitFor(() => expect(q("[data-leave-cancel]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel]"));
    await waitFor(() => expect(body()).toBe(EN_ONE_TODAY));
  });

  it("🔑 the PANEL, a range with MIXED days: only the FUTURE days' classes are counted (a day that has begun is not put back) — 1 + 2 = 3, not 3 + 3", async () => {
    store = [row(iso(-1), "r1", 3), row(iso(2), "r1", 1), row(iso(3), "r1", 2), row(iso(4), "r1")];
    wrap(h(LeaveDayPanel, { opened: true, onClose: () => {}, row: store[1], onOpenClass: () => {} }));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(body()).toBe(EN_RANGE("เอ", 3)));
  });

  it("🔑 the PANEL, a range whose future days took nothing off → today's range body", async () => {
    store = [row(iso(-1), "r1", 3), row(iso(2), "r1"), row(iso(3), "r1")];
    wrap(h(LeaveDayPanel, { opened: true, onClose: () => {}, row: store[1], onOpenClass: () => {} }));
    await waitFor(() => expect(q("[data-leave-cancel-range]")).toBe(1));
    await click(document.querySelector("[data-leave-cancel-range]"));
    await waitFor(() => expect(body()).toBe(EN_RANGE_TODAY));
  });

  it("🔑 the TEACHERS-page LIST: a one-day record uses ITS day's `continues`; a range counts its FUTURE days only", async () => {
    store = [row(iso(3), null, 2), row(iso(5), "r2", 1), row(iso(6), "r2", 2)];
    wrap(h(TeacherLeaveList));
    await waitFor(() => expect(q('[data-teacher-leave-record="day:t1:' + iso(3) + '"] [data-leave-cancel]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-record="day:t1:' + iso(3) + '"] [data-leave-cancel]'));
    await waitFor(() => expect(body()).toBe(EN_ONE("เอ", 2)));
    cleanup();
    wrap(h(TeacherLeaveList));
    await waitFor(() => expect(q('[data-teacher-leave-cancel-range="r2"]')).toBe(1));
    await click(document.querySelector('[data-teacher-leave-cancel-range="r2"]'));
    await waitFor(() => expect(body()).toBe(EN_RANGE("เอ", 3)));
  });
});

describe("🔴 O1 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/";

  it("🔑 each confirm switches on `restoreN > 0` — a single comparison, never `>= 0`", () => {
    expect(code(C + "LiftLeaveConfirm.tsx")).toContain("restoreN > 0 ? t(\"leaveDays.cancelBodyRestores\"");
    expect(code(C + "LiftRangeConfirm.tsx")).toContain("restoreN > 0 ? t(\"leaveDays.cancelRangeBodyRestores\"");
  });

  it("🔑 the range's n sums the FUTURE days only (the past day's classes are not put back)", () => {
    expect(code(C + "LeaveDayPanel.tsx")).toContain("shown.filter((d) => d.date > today).reduce(");
    expect(code("src/components/partials/Teachers/TeacherLeaveList.tsx")).toContain("rangeFor.rows.filter((d) => d.date > todayIso).reduce(");
  });
});
