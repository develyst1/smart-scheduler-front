import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n/dictionaries";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Teacher } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-611 — the ENTRY POINT: a row action on the Teachers page, for an admin who HOLDS the key.**
 *
 * 🔑 **Why the row and not the calendar:** an admin recording one teacher's leave is already looking at that teacher,
 * so **the subject is the row** and the screen cannot get the identity wrong. *That is the whole argument for this
 * placement, and the last assertion here is the one that checks it: the dialog that opens names THIS teacher.*
 *
 * 📌 **The denied identity lives in its own file** (`teacher-leave-row-no-key.dom.test.tsx`), because `mock.module` is
 * global to the process ⇒ 🔑 *a test whose identity depends on execution order is not a test of an identity* (TASK-592).
 */

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: { days: [] } }),
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, alreadyRecorded: false, bookings: [] } };
    },
  },
}));

const TeacherRowActions = (await import("./TeacherRowActions")).default;

const TEACHER: Teacher = {
  id: "t-77",
  name: "สมหญิง ใจดี",
  nickname: "ครูเอ",
  type: "FULL_TIME",
  subjects: ["เปียโน"],
  active: true,
};

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(TeacherRowActions, { teacher: TEACHER, onEdit: () => {} }))),
    ) as never,
  );
};
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.querySelector("button[aria-label]") as HTMLElement);
  await waitFor(() => expect(document.querySelectorAll("[data-teacher-leave-open]").length).toBe(1));
};

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
});

describe("🔴 TASK-611 — the row action, for an admin who holds the key", () => {
  it("🔑 the item is THERE, and it is not greyed", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    const item = document.querySelector("[data-teacher-leave-open]") as HTMLElement;
    expect(item.textContent).toMatch(/record leave in advance/i);
    // 🚫 a control that is theirs is never shown disabled — and this one is theirs
    expect(item.getAttribute("data-disabled")).toBeNull();
    expect(item.getAttribute("aria-disabled")).toBeNull();
  });

  it("🔴 it opens the dialog on THIS teacher, on a date the door ACCEPTS", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    await user.click(document.querySelector("[data-teacher-leave-open]") as HTMLElement);

    // the title names the row's teacher — 🔑 the identity comes from the row, not from anything the admin types
    await waitFor(() => expect(screen.queryAllByText(/record leave for ครูเอ/i).length).toBeGreaterThan(0));
    // 🔴 and it opens on a FUTURE date: the advance notice is on screen and the refusal is NOT
    // *Opening on a date the door refuses would teach an admin the control is broken before they read the reason.*
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));
    expect(document.querySelectorAll("[data-leave-admin-refused]").length).toBe(0);
    // 🚫 no chooser, on the door's own opening state
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  /**
   * 🔴 **The identity reaches the WIRE, which is the only place it matters.**
   * 🔑 This exists because a mutation that replaced the subject's id with a constant SURVIVED: the title still read the
   * teacher's NAME, so every assertion about the screen passed while the request named somebody else. ⇒ *the screen's
   * label and the request's id are two different claims, and this placement's whole argument is about the id.*
   */
  it("🔴 the request carries THE ROW's teacher id — not a name, not the admin, not a constant", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    await user.click(document.querySelector("[data-teacher-leave-open]") as HTMLElement);
    await waitFor(() => expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(1));

    await user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปอบรม");
    await user.click(document.querySelector("[data-leave-submit]") as HTMLElement);

    await waitFor(() => expect(posts.filter((p) => p.url === "/teacher-leave-days").length).toBe(1));
    const body = posts.find((p) => p.url === "/teacher-leave-days")!.body;
    // 🔴 the id is the ROW's, read from the fixture rather than typed into the assertion twice
    expect(body.teacherId).toBe(TEACHER.id);
    // 🚫 and the name — the thing the screen shows — is NOT what identifies the subject on the wire
    expect(JSON.stringify(body)).not.toContain(TEACHER.nickname);
    expect(JSON.stringify(body)).not.toContain(TEACHER.name);
  });

  it("✅ the pre-existing items are untouched beside it", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    const menu = document.body.textContent ?? "";
    expect(menu).toMatch(/edit/i);
    expect(menu).toMatch(/change type/i);
    expect(menu).toMatch(/archive/i);
    // 🔑 and the item's words are the dictionary's, in the language the provider is in — 🚫 nothing hardcoded on the row
    expect(menu).toContain((dictionaries.en.teachers as unknown as Record<string, string>).actRecordLeave);
  });
});
