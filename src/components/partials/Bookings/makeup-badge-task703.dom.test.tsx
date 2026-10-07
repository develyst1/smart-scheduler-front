import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { StatusChip } from "@/components/common/BookingBadges";

/**
 * 🔴 **TASK-703 (REQ-115) — the «ขยายคาบ» badge reads the MARKER (`isMakeup`), not the status.**
 *
 * A make-up is born CONFIRMED now (TASK-702): without this a make-up silently loses the badge Khwan kept as a requirement and reads as
 * an ordinary class. 🔑 Three things must hold together, and each is asserted by COUNTING what is on screen: a make-up shows its REAL
 * status AND the badge (added, not swapped) · an ordinary class shows NO badge · a legacy `EXTENDED` row shows it EXACTLY ONCE.
 */

const en = dictionaries.en.bookingStatus;
const th = dictionaries.th.bookingStatus;
const count = (needle: string) => (document.body.textContent ?? "").split(needle).length - 1;
const badges = () => document.querySelectorAll("[data-makeup-badge]").length;

let sessions: Array<Record<string, unknown>> = [];
const summary = { kind: "course", size: 6, leaveUsed: 0, leaveQuota: 2, maxWeek: 6, owedCount: 0, expiryDate: "2026-12-31", status: "ACTIVE" };
const plan = () => ({
  kind: "course",
  id: "c1",
  student: { id: "s1", name: "น้องมิว", nickname: null },
  sessions,
  liveEndDate: null,
  summary,
});

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({ ...realClient, useMockData: false, api: { ...realClient.api, get: async () => ({ data: {} }) } }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useEntitlementPlan: () => ({ data: plan(), isLoading: false }),
  useTeachers: () => ({ data: [] }),
}));

const PlanModal = (await import("./PlanModal")).default;

const wrap = (el: unknown) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, el as never))) as never);
};
const row = (id: string, status: string, isMakeup: boolean | undefined, date: string) => ({
  id,
  date,
  startTime: "10:00:00",
  status,
  isMakeup,
  bookingType: "COURSE_PACKAGE",
  teacher: { id: "t", name: "ครู", nickname: "เอ" },
  subject: { id: "sub", name: "เปียโน" },
});

afterEach(cleanup);

describe("🔴 TASK-703 — the chip itself", () => {
  it("🔑 a CONFIRMED make-up shows its REAL status AND the badge — added, not swapped", () => {
    wrap(h(StatusChip, { status: "CONFIRMED", isMakeup: true }));
    expect(count(en.CONFIRMED)).toBe(1);
    expect(count(en.EXTENDED)).toBe(1);
    expect(badges()).toBe(1);
  });

  it("🔑 an ATTENDED make-up keeps its status too — the badge does not depend on the status at all", () => {
    wrap(h(StatusChip, { status: "ATTENDED", isMakeup: true }));
    expect(count(en.ATTENDED)).toBe(1);
    expect(count(en.EXTENDED)).toBe(1);
  });

  it("🚫 an ORDINARY confirmed class shows NO badge — absent and false both claim nothing", () => {
    wrap(h(StatusChip, { status: "CONFIRMED", isMakeup: false }));
    expect(count(en.EXTENDED)).toBe(0);
    cleanup();
    wrap(h(StatusChip, { status: "CONFIRMED" }));
    expect(count(en.EXTENDED)).toBe(0);
    expect(badges()).toBe(0);
  });

  it("⚠️ a LEGACY `EXTENDED` make-up shows «Extended» EXACTLY ONCE — never twice", () => {
    wrap(h(StatusChip, { status: "EXTENDED", isMakeup: true }));
    expect(count(en.EXTENDED)).toBe(1);
    expect(badges()).toBe(0); // its own status chip already says it
  });

  it("🚫 the badge is the ORIGINAL approved word in both languages — no new words", () => {
    expect(en.EXTENDED).toBe("Extended");
    expect(th.EXTENDED).toBe("ขยายคาบ");
    wrap(h(I18nProvider, null, h(StatusChip, { status: "CONFIRMED", isMakeup: true })));
    expect(badges()).toBe(1);
  });
});

describe("🔴 TASK-703 — on the plan modal, from the server's rows", () => {
  it("🔑 a plan with a CONFIRMED make-up, an ordinary CONFIRMED class and a legacy EXTENDED one: 2 «Extended» in all, 1 badge, 2 «Confirmed»", async () => {
    sessions = [row("a", "CONFIRMED", true, "2026-10-20"), row("b", "CONFIRMED", false, "2026-10-27"), row("c", "EXTENDED", true, "2026-11-03")];
    wrap(h(PlanModal, { opened: true, onClose: () => {}, entitlementId: "c1" }));
    await waitFor(() => expect(count(en.CONFIRMED)).toBeGreaterThan(0));
    expect(count(en.CONFIRMED)).toBe(2); // the make-up keeps its REAL status
    expect(count(en.EXTENDED)).toBe(2); // the marked CONFIRMED one + the legacy one — each exactly once
    expect(badges()).toBe(1); // only the marked CONFIRMED row gets the added badge
  });
});

describe("🔴 TASK-703 — the create-mode PREVIEW draws a make-up the way the server will create it", () => {
  it("🔑 a preview make-up row is CONFIRMED + marked: the badge is there, on a CONFIRMED row", async () => {
    sessions = [row("new-0", "PENDING", false, "2026-10-20"), row("new-1", "CONFIRMED", true, "2026-10-27")];
    wrap(h(PlanModal, { opened: true, onClose: () => {}, mode: "create", initialPlan: plan() as never, entitlementId: "" }));
    await waitFor(() => expect(badges()).toBeGreaterThan(0));
    expect(badges()).toBe(1);
    expect(count(en.EXTENDED)).toBe(1);
  });
});

import { readFileSync } from "node:fs";
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("🔴 TASK-703 — every Team A place that draws a course booking's status PASSES the marker (source pins; the clicked tests above prove what the chip does with it)", () => {
  it("🔑 plan modal (both tables) · booking modal header · the leave dialog's rows · and the mapper carries the field as a strict boolean", () => {
    expect(code("src/components/partials/Bookings/PlanModal.tsx").split("<StatusChip status={s.status as BookingStatus} isMakeup={s.isMakeup} />").length - 1).toBe(2);
    expect(code("src/components/partials/Calendar/Modal/BookingModal.tsx")).toContain("<StatusChip status={booking.status} isMakeup={booking.isMakeup} />");
    expect(code("src/components/partials/Calendar/Modal/ReportLeaveDialog.tsx")).toContain("<StatusChip status={r.status} isMakeup={r.isMakeup} />");
    expect(code("src/lib/api/mappers.ts")).toContain("isMakeup: dto.isMakeup === true,");
  });

  it("🔑 the chip reads the MARKER, never the status, to decide whether to add the badge", () => {
    const chips = code("src/components/common/BookingBadges.tsx");
    expect(chips).toContain('if (isMakeup !== true || status === "EXTENDED") return chip;');
  });
});
