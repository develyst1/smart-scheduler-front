import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-670 (5a) — a completed or expired course no longer says "was cancelled".**
 *
 * `course.endedNoWrites` ("This course was cancelled, so…") showed whenever a course was closed to writes — which is
 * COMPLETED and EXPIRED as well as CANCELLED, since 3f19d60. 🔑 Each status is opened on the REAL modal and the sentence
 * on screen is read: what must be ruled out is a sentence that is right for one status and shown for all three.
 */

let status: string | undefined = "COMPLETED";
const plan = () => ({
  kind: "course",
  id: "c1",
  student: { id: "s1", name: "น้องมิว", nickname: null },
  sessions: [],
  liveEndDate: null,
  summary: { kind: "course", size: 6, leaveUsed: 0, leaveQuota: 2, maxWeek: 6, owedCount: 0, expiryDate: "2026-12-31", status },
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

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PlanModal, { opened: true, onClose: () => {}, entitlementId: "c1" })))) as never);
};
const course = dictionaries.en.course;
const shown = async () => {
  await waitFor(() => expect(document.body.textContent).toContain("can no longer be added or changed"));
  return document.body.textContent ?? "";
};

afterEach(cleanup);

describe("🔴 TASK-670 (5a) — the sentence is chosen by the course's own status", () => {
  it("🔑 COMPLETED says it is complete — and NOT that it was cancelled", async () => {
    status = "COMPLETED";
    mount();
    const text = await shown();
    expect(text).toContain(course.endedCompleted);
    expect(text).not.toContain("was cancelled");
    expect(text).not.toContain(course.endedExpired);
  });

  it("🔑 EXPIRED says it has expired — and NOT that it was cancelled", async () => {
    status = "EXPIRED";
    mount();
    const text = await shown();
    expect(text).toContain(course.endedExpired);
    expect(text).not.toContain("was cancelled");
    expect(text).not.toContain(course.endedCompleted);
  });

  it("✅ a CANCELLED (ended-early) course keeps TODAY's sentence, byte for byte — it is true there (pinned)", async () => {
    status = "CANCELLED";
    mount();
    const text = await shown();
    expect(text).toContain("This course was cancelled, so sessions can no longer be added or changed.");
    expect(text).toContain(course.endedNoWrites);
    expect(text).not.toContain(course.endedCompleted);
    expect(text).not.toContain(course.endedExpired);
  });

  it("an older payload with NO status keeps today's sentence (nothing new is invented for it)", async () => {
    status = undefined;
    mount();
    const text = await shown();
    expect(text).toContain(course.endedNoWrites);
    expect(text).not.toContain(course.endedCompleted);
    expect(text).not.toContain(course.endedExpired);
  });
});

describe("🔴 TASK-670 (5a) — both languages, the owner's words verbatim", () => {
  it("EN and TH are exactly the approved sentences (counted in BOTH languages)", () => {
    const th = dictionaries.th.course;
    expect(course.endedCompleted).toBe("This course is complete, so sessions can no longer be added or changed.");
    expect(course.endedExpired).toBe("This course has expired, so sessions can no longer be added or changed.");
    expect(th.endedCompleted).toBe("คอร์สนี้เรียนครบแล้ว จึงเพิ่มหรือแก้คาบไม่ได้");
    expect(th.endedExpired).toBe("คอร์สนี้หมดอายุแล้ว จึงเพิ่มหรือแก้คาบไม่ได้");
    // the cancelled sentence is untouched in both
    expect(th.endedNoWrites).toBe("คอร์สนี้ถูกยกเลิกแล้ว จึงเพิ่มหรือแก้คาบไม่ได้");
  });
});
