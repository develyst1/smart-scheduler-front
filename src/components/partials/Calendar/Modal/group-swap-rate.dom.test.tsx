import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-632 (BE) → TASK-634 — the group swap can ANSWER its own refusal: one optional rate.**
 *
 * 🔑 **Every assertion is about the REQUEST**, because the two ways this can be wrong are both invisible on screen:
 * **a swap that carries no rate when one was typed** (the refusal the field exists to answer comes straight back), and
 * **a swap that carries `rateMinor` when nothing was typed** — the server's key-59 gate reads the BODY, so a key that is
 * merely present would cost an ordinary swap a permission it does not need.
 *
 * 📌 **This file is the GRANTED identity.** The one without key 59 has its own file, because `mock.module` is global to
 * the process ⇒ 🔑 *a test whose identity depends on execution order is not a test of an identity* (TASK-592).
 */

const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: { days: [] } }),
    patch: async (url: string, body: Record<string, unknown>) => {
      patches.push({ url, body });
      return { data: { moved: 1 } };
    },
  },
}));

const GroupSwapDialog = (await import("./GroupSwapDialog")).default;

const TEACHERS: TeacherView[] = [
  { id: "t-out", name: "ครูเก่า", nickname: "เก่า", bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] } as unknown as TeacherView,
  { id: "t-in", name: "ครูใหม่", nickname: "ใหม่", bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] } as unknown as TeacherView,
];
const BOOKING = {
  id: "bk-1",
  date: "2026-10-20",
  teacherId: "t-out",
  displayName: "กลุ่มเช้า",
  group: { name: "กลุ่มเช้า" },
} as unknown as Booking;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(GroupSwapDialog, { booking: BOOKING, teachers: TEACHERS, opened: true, onClose: () => {} }))),
    ) as never,
  );
};
const rateBox = () => document.querySelector("[data-group-swap-rate]") as HTMLInputElement | null;
const swaps = () => patches.filter((p) => p.url === "/bookings/bk-1/group-teacher");
const pickIncoming = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
  await user.click(await screen.findByText("ใหม่"));
};
const save = async (user: ReturnType<typeof userEvent.setup>) => {
  const btn = [...document.querySelectorAll("button")].find((b) => /swap/i.test(b.textContent ?? "")) as HTMLButtonElement;
  await user.click(btn);
};

afterEach(cleanup);
beforeEach(() => {
  patches.length = 0;
});

describe("🔴 TASK-634 — the optional rate, with key 59", () => {
  it("🔴 EMPTY still submits — and the body carries NO `rateMinor` at all", async () => {
    const user = userEvent.setup();
    mount();
    await pickIncoming(user);
    // the field is there and it is empty — 🚫 nothing seeded it
    expect(rateBox()).toBeTruthy();
    expect(rateBox()!.value).toBe("");
    expect(rateBox()!.getAttribute("data-group-swap-rate")).toBe("none");
    // 🚫 and it is NOT required: an optional field that blocks Save is not optional
    expect(rateBox()!.hasAttribute("required")).toBe(false);

    await save(user);

    await waitFor(() => expect(swaps().length).toBe(1));
    const body = swaps()[0].body;
    expect(Object.keys(body).sort()).toEqual(["fromHereOn", "teacherId"]);
    // 🔑 absent, not `undefined`: the server's key-59 gate reads the BODY
    expect("rateMinor" in body).toBe(false);
    expect(body.teacherId).toBe("t-in");
  });

  it("✅ a typed rate rides as SATANG, beside the teacher and the scope", async () => {
    const user = userEvent.setup();
    mount();
    await pickIncoming(user);
    // 🔑 a masked `NumberInput` needs `fireEvent.change` (TASK-567's sweep)
    fireEvent.change(rateBox() as HTMLInputElement, { target: { value: "330" } });
    await waitFor(() => expect(rateBox()!.getAttribute("data-group-swap-rate")).toBe("33000"));

    await save(user);

    await waitFor(() => expect(swaps().length).toBe(1));
    const body = swaps()[0].body;
    expect(body.rateMinor).toBe(33000);
    expect(body.teacherId).toBe("t-in");
    expect(body.fromHereOn).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["fromHereOn", "rateMinor", "teacherId"]);
  });

  it("🚫 the field is never pre-filled from anybody — not from the OUTGOING coach", async () => {
    const user = userEvent.setup();
    mount();
    // before a coach is even chosen, and after: the box is empty both times
    expect(rateBox()!.value).toBe("");
    await pickIncoming(user);
    expect(rateBox()!.value).toBe("");
    // 🔑 *a pre-filled wrong rate is how this whole defect started* — and the only number this screen could reach is the
    // outgoing coach's, which is the exact number that was being paid to the wrong person.
    expect(document.body.textContent).not.toContain("500");
  });

  it("🔑 the label names WHOSE rate it is, and it follows the coach chosen", async () => {
    const user = userEvent.setup();
    mount();
    await pickIncoming(user);
    const label = document.querySelector(`label[for='${rateBox()!.id}']`) as HTMLElement;
    expect(label.textContent).toContain("ใหม่");
    expect(label.textContent).not.toContain("เก่า");
  });
});

/**
 * 📋 **The copy, COUNTED in both languages** — 🔑 *a bilingual assertion is satisfied by one language unless both are
 * counted.* 📝 DRAFT (@Sober owns the copy this batch); what is pinned is that both exist, differ, and say the two
 * things the field needs to say.
 */
describe("📋 TASK-634 — the rate's two strings, both languages, counted", () => {
  const KEYS = ["groupSwapRate", "groupSwapRateHint"] as const;

  it("🔑 both strings in BOTH languages, and not the same text", () => {
    const en = dictionaries.en.booking as unknown as Record<string, string>;
    const th = dictionaries.th.booking as unknown as Record<string, string>;
    const pairs = KEYS.map((k) => [k, en[k], th[k]] as const);
    expect(pairs.length).toBe(2);
    expect(pairs.filter(([, e]) => typeof e === "string" && e.length > 0).length).toBe(2);
    expect(pairs.filter(([, , t]) => typeof t === "string" && t.length > 0).length).toBe(2);
    expect(pairs.filter(([, e, t]) => e !== t).length).toBe(2);
  });

  it("🔴 the label carries the coach's name and the hint says it is OPTIONAL — in both", () => {
    const en = dictionaries.en.booking as unknown as Record<string, string>;
    const th = dictionaries.th.booking as unknown as Record<string, string>;
    expect(en.groupSwapRate).toContain("{name}");
    expect(th.groupSwapRate).toContain("{name}");
    // the hint's whole job: *do I have to fill this in?* — and WHEN they do
    expect(en.groupSwapRateHint).toMatch(/leave this empty/i);
    expect(th.groupSwapRateHint).toContain("ไม่ต้องกรอก");
    expect(en.groupSwapRateHint).toMatch(/never paid this coach/i);
    expect(th.groupSwapRateHint).toContain("ยังไม่เคยจ่าย");
    // 🚫 and neither names anything the admin cannot see
    expect(`${en.groupSwapRateHint} ${th.groupSwapRateHint}`).not.toMatch(/seriesRateOf|rateMinor|RATE_REQUIRED/);
  });
});
