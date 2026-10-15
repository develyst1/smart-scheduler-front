import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-806 (REQ-121, LIVE) — the teacher form's Subjects picker offers EVERY active program (`GET /subjects`), not just the ones some teacher has.**
 *
 * The mechanism was in the picker's source: its options were the UNION of \`subjectOptions\` across the roster, so a program on NO teacher (both
 * DUO programs on uat) could never be ticked, so it could never be assigned, so New course → DUO → Program stayed disabled. 🔑 Clicked on the real
 * page, read at the WIRE: the DUO program is offered, an existing teacher's ticks survive the list still loading, and Save sends exactly the ticked ids.
 */

const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
let subjectsState: { data?: { subjects: Array<{ id: string; name: string; kind: "PRIVATE" | "DUO" }> }; isLoading: boolean } = { isLoading: true };

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));

const realSubjects = await import("@/hooks/scheduler/useSubjects");
mock.module("@/hooks/scheduler/useSubjects", () => ({ ...realSubjects, useSubjects: () => subjectsState }));

const BIKE = { id: "s1", name: "Bike" };
const SKATE = { id: "s2", name: "Skate" };
const TEACHERS: TeacherView[] = [
  { id: "t1", name: "ครูแอน", nickname: "แอน", type: "FULL_TIME", subjects: [], subjectOptions: [BIKE, SKATE], active: true, workDays: [1], monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true } as unknown as TeacherView,
];
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS, isLoading: false }),
  useTeacherTypeOrder: () => ({ data: ["FULL_TIME"], isLoading: false }),
}));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: {} }),
    post: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "POST", url, body });
      return { data: { id: "new", name: "x", nickname: "x", type: "FREELANCE", active: true, subjectOptions: [] } };
    },
    patch: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "PATCH", url, body });
      return { data: { id: "t1", name: "ครูแอน", nickname: "แอน", type: "FULL_TIME", active: true, subjectOptions: [] } };
    },
  },
}));

const TeachersContent = (await import("./TeachersContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(TeachersContent, null)))) as never);
};
const LOADED = {
  isLoading: false,
  data: {
    subjects: [
      { id: "s1", name: "Bike", kind: "PRIVATE" as const },
      { id: "s2", name: "Skate", kind: "PRIVATE" as const },
      { id: "s9", name: "Duo SURFSKATE", kind: "DUO" as const }, // assigned to NO teacher
    ],
  },
};
const subjectBox = () => (screen.queryAllByLabelText(/^subjects/i).find((e) => e.getAttribute("aria-haspopup") === "listbox") ?? null) as HTMLInputElement | null;
const pills = () => [...document.querySelectorAll("[class*='Pill-root']")].map((e) => (e.textContent ?? "").trim());
// scoped to the SUBJECTS listbox (the form has a second dropdown — the teacher type — whose options must not be counted)
const options = () => {
  const list = document.getElementById(subjectBox()?.getAttribute("aria-controls") ?? "__none__");
  return [...(list?.querySelectorAll("[role='option']") ?? [])].map((e) => (e.textContent ?? "").trim());
};
const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByText(/add teacher/i));
  await waitFor(() => expect(subjectBox()).toBeTruthy());
};
const openEdit = async (user: ReturnType<typeof userEvent.setup>) => {
  // (`waitFor` only retries when its callback THROWS — a null return resolves at once)
  const rowMenu = await waitFor(() => {
    const b = document.querySelector("button[aria-label='Edit']") as HTMLElement | null;
    if (!b) throw new Error("the row's menu button is not on screen yet");
    return b;
  });
  await user.click(rowMenu);
  await user.click(await screen.findByText("Edit"));
  await waitFor(() => expect(subjectBox()).toBeTruthy());
};
const saveBtn = () => [...document.querySelectorAll("button")].find((b) => /^save$/i.test((b.textContent ?? "").trim())) as HTMLButtonElement;

beforeEach(() => {
  calls.length = 0;
  subjectsState = { isLoading: true };
});
afterEach(cleanup);

describe("🔴 TASK-806 — the picker offers a program that NO teacher has", () => {
  it("🔑 ADD: the DUO program assigned to nobody is offered (with the others, by name)", async () => {
    subjectsState = LOADED;
    const user = userEvent.setup();
    mount();
    await openAdd(user);
    await user.click(subjectBox() as HTMLElement);
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(options().sort()).toEqual(["Bike", "Duo SURFSKATE", "Skate"]);
  });

  it("🔑 EDIT offers the same list — one catalog for both modes", async () => {
    subjectsState = LOADED;
    const user = userEvent.setup();
    mount();
    await openEdit(user);
    await user.click(subjectBox() as HTMLElement);
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(options()).toContain("Duo SURFSKATE");
  });
});

describe("🔴 TASK-806 — the list is still LOADING (or failed): an existing teacher's ticks are not lost", () => {
  it("🔑 EDIT while loading: both own programs are still shown ticked, and Save sends exactly them", async () => {
    subjectsState = { isLoading: true }; // the catalog has NOT arrived
    const user = userEvent.setup();
    mount();
    await openEdit(user);
    await waitFor(() => expect(pills().sort()).toEqual(["Bike", "Skate"]));
    await user.click(saveBtn());
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].method).toBe("PATCH");
    expect([...(calls[0].body.subjectIds as string[])].sort()).toEqual(["s1", "s2"]);
  });

  it("🔑 EDIT after the list loads: ticking the DUO program too saves exactly the ticked ids", async () => {
    subjectsState = LOADED;
    const user = userEvent.setup();
    mount();
    await openEdit(user);
    await user.click(subjectBox() as HTMLElement);
    await user.click(await screen.findByText("Duo SURFSKATE"));
    await user.click(saveBtn());
    await waitFor(() => expect(calls.length).toBe(1));
    expect([...(calls[0].body.subjectIds as string[])].sort()).toEqual(["s1", "s2", "s9"]);
  });
});
