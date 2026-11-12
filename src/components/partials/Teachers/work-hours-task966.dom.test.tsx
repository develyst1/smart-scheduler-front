import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-966 (SPEC-108 §3.4 / §4, REQ-5015 AC3) — «วันทำงาน»: each ticked day gets an optional From / To, saved as `workHours`, with the orphan warning for classes outside the new hours.**
 * 🔑 What can go wrong without anyone seeing it: an hours row for a day that is not ticked, a day with one end only saved as the whole day, hours that go out when only days changed (or `null`
 * not sent when they were cleared), the impact preview asked without the hours (so no warning), or a warning that blames "removed days" when the days did not change.
 */

const gets: Array<{ url: string; params?: Record<string, unknown> }> = [];
const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let impact = { removedDays: [] as number[], removedDaysLabel: "", orphanCount: 0, sessions: [] as unknown[] };
let allowed = true;
const toasts: Array<{ title: string }> = [];

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string }) => void toasts.push(o) }));
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      gets.push({ url, params: cfg?.params });
      return { data: impact };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: { id: "t9", name: body.name, nickname: body.nickname, type: body.type, active: true, subjects: [], lineLinked: false, workDays: body.workDays ?? [], workHours: body.workHours ?? null } };
    },
    patch: async (url: string, body: Record<string, unknown>) => {
      patches.push({ url, body });
      return { data: { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FREELANCE", active: true, subjects: [], lineLinked: false, workDays: body.workDays, workHours: body.workHours ?? null } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const TeacherWorkDaysSelect = (await import("./TeacherWorkDaysSelect")).default;

const mount = (workDays: number[], workHours?: Record<string, [string, string]> | null) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(TeacherWorkDaysSelect, { teacherId: "t1", nickname: "เอ", workDays, workHours })))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const pick = async (user: ReturnType<typeof userEvent.setup>, sel: string, label: string) => {
  const input = document.querySelector(sel) as HTMLElement;
  await user.click(input);
  const options = () => [...(document.getElementById(input.getAttribute("aria-controls") ?? "")?.querySelectorAll('[role="option"]') ?? [])];
  await waitFor(() => expect(options().length).toBeGreaterThan(0));
  await user.click(options().find((o) => o.textContent === label) as HTMLElement);
};
const saveBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.common.save) as HTMLButtonElement;
const clearBtn = (sel: string) => document.querySelector(`${sel} ~ div button, ${sel}`) as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  gets.length = 0;
  patches.length = 0;
  toasts.length = 0;
  allowed = true;
  impact = { removedDays: [], removedDaysLabel: "", orphanCount: 0, sessions: [] };
});

describe("🔴 TASK-966 — an hours row for each TICKED day", () => {
  it("🔑 one From/To row per ticked working day (Saturday + Sunday here), none for the others; ticking another day adds its row", async () => {
    const user = userEvent.setup();
    mount([6, 0]);
    await waitFor(() => expect(q("[data-work-hours-day]")).toBe(2));
    expect([...document.querySelectorAll("[data-work-hours-day]")].map((e) => e.getAttribute("data-work-hours-day"))).toEqual(["6", "0"]);
    await user.click(document.querySelector('button[aria-label="Mon"]') as HTMLElement);
    await waitFor(() => expect(q("[data-work-hours-day]")).toBe(3));
    expect(q('[data-work-hours-day="1"]')).toBe(1);
  });

  it("🔑 saved hours are shown in their day's pickers", async () => {
    mount([6, 0], { "6": ["13:00:00", "18:00"] });
    await waitFor(() => expect(q('[data-work-hours-from="6"]')).toBe(1));
    expect((document.querySelector('[data-work-hours-from="6"]') as HTMLInputElement).value).toBe("13:00");
    expect((document.querySelector('[data-work-hours-to="6"]') as HTMLInputElement).value).toBe("18:00");
    expect((document.querySelector('[data-work-hours-from="0"]') as HTMLInputElement).value).toBe("");
    expect(q("button[data-unsaved]")).toBe(0);
    expect(text()).not.toContain(dictionaries.en.teachers.unsavedChanges); // nothing changed yet
  });
});

describe("🔴 TASK-966 — saving hours", () => {
  it("🔑 Saturday 13:00–18:00 → the preview is asked WITH the hours, then ONE PATCH carries `workDays` and `workHours` `{ 6: [from, to] }`", async () => {
    const user = userEvent.setup();
    mount([6, 0]);
    await pick(user, '[data-work-hours-from="6"]', "13:00");
    await pick(user, '[data-work-hours-to="6"]', "18:00");
    await waitFor(() => expect(text()).toContain(dictionaries.en.teachers.unsavedChanges));
    await user.click(saveBtn());
    await waitFor(() => expect(patches.length).toBe(1));
    expect(gets.length).toBe(1);
    expect(gets[0].url).toBe("/teachers/t1/work-days/impact");
    expect(gets[0].params?.workHours).toBe(JSON.stringify({ "6": ["13:00", "18:00"] }));
    expect(patches[0].url).toBe("/teachers/t1/work-days");
    expect(patches[0].body).toEqual({ workDays: [6, 0], workHours: { "6": ["13:00", "18:00"] } });
  });

  it("🔑 classes OUTSIDE the new hours → the orphan warning (the hours wording, not «dropping days»); nothing is saved until «Proceed anyway»", async () => {
    impact = { removedDays: [], removedDaysLabel: "", orphanCount: 3, sessions: [] };
    const user = userEvent.setup();
    mount([6, 0]);
    await pick(user, '[data-work-hours-from="6"]', "13:00");
    await pick(user, '[data-work-hours-to="6"]', "18:00");
    await user.click(saveBtn());
    await waitFor(() => expect(q("[data-work-orphan]")).toBe(1));
    expect(document.querySelector("[data-work-orphan]")?.getAttribute("data-work-orphan")).toBe("3");
    expect(document.querySelector("[data-work-orphan]")?.textContent).toBe(dictionaries.en.teachers.workHoursOrphanWarn.replace("{n}", "3"));
    expect(patches.length).toBe(0);
    await user.click([...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.teachers.workDaysOrphanProceed) as HTMLElement);
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body.workHours).toEqual({ "6": ["13:00", "18:00"] });
  });

  it("🔑 when a working DAY is removed too, the warning keeps the existing «dropping {days}» wording", async () => {
    impact = { removedDays: [0], removedDaysLabel: "Sun", orphanCount: 2, sessions: [] };
    const user = userEvent.setup();
    mount([6, 0]);
    await user.click(document.querySelector('button[aria-label="Sun"]') as HTMLElement);
    await user.click(saveBtn());
    await waitFor(() => expect(q("[data-work-orphan]")).toBe(1));
    expect(document.querySelector("[data-work-orphan]")?.textContent).toBe(dictionaries.en.teachers.workDaysOrphanWarn.replace("{days}", "Sun").replace("{n}", "2"));
  });

  it("🔑 a day with ONE end only is refused in words and NOTHING is sent (never saved as the whole day by accident)", async () => {
    const user = userEvent.setup();
    mount([6, 0]);
    await pick(user, '[data-work-hours-from="6"]', "13:00");
    await user.click(saveBtn());
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].title).toContain(dictionaries.en.teachers.workHoursPartial.replace("{day}", "").trim().replace(/^:\s*/, ""));
    expect(gets.length).toBe(0);
    expect(patches.length).toBe(0);
  });

  it("🔑 From not before To is refused in words and nothing is sent", async () => {
    const user = userEvent.setup();
    mount([6, 0]);
    await pick(user, '[data-work-hours-from="6"]', "18:00");
    await pick(user, '[data-work-hours-to="6"]', "13:00");
    await user.click(saveBtn());
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].title).toContain("the start time must be before the end time");
    expect(patches.length).toBe(0);
  });

  it("🔑 a DAYS-only change sends NO `workHours` key (byte for byte what it was)", async () => {
    const user = userEvent.setup();
    mount([6, 0]);
    await user.click(document.querySelector('button[aria-label="Mon"]') as HTMLElement);
    await user.click(saveBtn());
    await waitFor(() => expect(patches.length).toBe(1));
    expect(Object.keys(patches[0].body)).toEqual(["workDays"]);
    expect(gets[0].params?.workHours).toBeUndefined();
  });

  it("🔑 clearing the saved hours sends `workHours: null`", async () => {
    const user = userEvent.setup();
    mount([6, 0], { "6": ["13:00", "18:00"] });
    // clear both pickers of Saturday (the clear «×» of each select)
    const from = document.querySelector('[data-work-hours-from="6"]') as HTMLElement;
    const to = document.querySelector('[data-work-hours-to="6"]') as HTMLElement;
    await user.click(from.parentElement?.querySelector("button") as HTMLElement);
    await user.click(to.parentElement?.querySelector("button") as HTMLElement);
    await waitFor(() => expect(text()).toContain(dictionaries.en.teachers.unsavedChanges));
    await user.click(saveBtn());
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({ workDays: [6, 0], workHours: null });
  });

  it("🔑 hours of a day that is then UNTICKED are not sent (the server refuses a key outside `workDays`)", async () => {
    const user = userEvent.setup();
    mount([6, 0], { "6": ["13:00", "18:00"], "0": ["09:00", "12:00"] });
    await user.click(document.querySelector('button[aria-label="Sun"]') as HTMLElement);
    await user.click(saveBtn());
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({ workDays: [6], workHours: { "6": ["13:00", "18:00"] } });
  });

  it("🔑 without the «work-days» key the hours are READ, not edited: one line, no pickers, no buttons", async () => {
    allowed = false;
    mount([6, 0], { "6": ["13:00", "18:00"] });
    await waitFor(() => expect(q("[data-work-hours-read]")).toBe(1));
    expect(document.querySelector("[data-work-hours-read]")?.textContent).toContain("13:00–18:00");
    expect(q("[data-work-hours]")).toBe(0);
    expect(saveBtn()).toBeUndefined();
  });
});

describe("🔴 TASK-966 — the «add teacher» form", () => {
  const TeacherFormModal = async () => (await import("./TeacherFormModal")).default;
  const mountForm = async () => {
    const Form = await TeacherFormModal();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(Form, { opened: true, teacher: null, subjectCatalog: [], onClose: () => {} })))) as never);
  };
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    const inputs = document.querySelectorAll("input[type=text], input:not([type])");
    await user.type(inputs[0] as HTMLElement, "ครูใหม่");
    await user.type(inputs[1] as HTMLElement, "ใหม่");
  };
  const formSave = () => [...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.common.save) as HTMLElement;

  it("🔑 hours for a ticked day ride the create body as `workHours`; a form with no hours has NO `workHours` key", async () => {
    posts.length = 0;
    const user = userEvent.setup();
    await mountForm();
    await fill(user);
    await user.click(document.querySelector('button[aria-pressed][class*="flex-1"]') as HTMLElement); // the first day button (Monday)
    await waitFor(() => expect(q("[data-work-hours-day]")).toBe(1));
    await user.click(formSave());
    await waitFor(() => expect(posts.length).toBe(1));
    expect(Object.keys(posts[0].body)).not.toContain("workHours");
    cleanup();
    posts.length = 0;
    await mountForm();
    await fill(user);
    await user.click(document.querySelector('button[aria-pressed][class*="flex-1"]') as HTMLElement);
    await pick(user, '[data-work-hours-from="1"]', "09:00");
    await pick(user, '[data-work-hours-to="1"]', "12:30");
    await user.click(formSave());
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.workDays).toEqual([1]);
    expect(posts[0].body.workHours).toEqual({ "1": ["09:00", "12:30"] });
  });

  it("🔑 a half-filled day blocks the create in words, nothing is posted", async () => {
    posts.length = 0;
    toasts.length = 0;
    const user = userEvent.setup();
    await mountForm();
    await fill(user);
    await user.click(document.querySelector('button[aria-pressed][class*="flex-1"]') as HTMLElement);
    await pick(user, '[data-work-hours-from="1"]', "09:00");
    await user.click(formSave());
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(posts.length).toBe(0);
  });
});

describe("✅ TASK-966 — the new words exist in both languages", () => {
  it("🔑 six keys, TH and EN, none empty", () => {
    for (const k of ["workHoursHint", "workHoursFrom", "workHoursTo", "workHoursPartial", "workHoursOrder", "workHoursOrphanWarn"] as const) {
      expect(dictionaries.en.teachers[k].length).toBeGreaterThan(1);
      expect(dictionaries.th.teachers[k].length).toBeGreaterThan(1);
    }
  });
});
