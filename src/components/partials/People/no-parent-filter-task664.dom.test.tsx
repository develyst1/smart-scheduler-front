import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-664 (piece B) — People can SHOW the children with no parent linked.**
 * 🔑 Clicked, and read at the WIRE: the filter is proven by the request it sends (`noParent=true`), not by a screen that
 * merely looks filtered. Off by default, the page asks nothing new and is exactly as before.
 */

const gets: Array<{ url: string; params: Record<string, unknown> }> = [];
let studentRows: unknown[] = [];
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      gets.push({ url, params: config?.params ?? {} });
      if (url === "/students") return { data: studentRows };
      if (url === "/parents") return { data: { parents: [], total: 0 } };
      return { data: {} };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const PeopleContent = (await import("./PeopleContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PeopleContent)))));
};
const st = dictionaries.en.student;
const filter = () => document.querySelector('[data-no-parent-filter] input[type="checkbox"], input[data-no-parent-filter]') as HTMLInputElement;
const noParentGets = () => gets.filter((g) => g.url === "/students" && g.params.noParent !== undefined);

beforeEach(() => {
  gets.length = 0;
  studentRows = [];
});
afterEach(cleanup);

describe("🔴 TASK-664 — the People filter for children with no parent", () => {
  it("OFF by default: the page is unchanged — no list, no new request", async () => {
    mount();
    await waitFor(() => expect(gets.some((g) => g.url === "/parents")).toBe(true));
    expect(filter().checked).toBe(false);
    expect(!document.querySelector("[data-no-parent-list]")).toBe(true);
    expect(noParentGets().length).toBe(0);
    expect(document.body.textContent).toContain(dictionaries.en.people.empty); // the families view, as before
  });

  it("🔑 ON ⇒ asks `GET /students?noParent=true`, lists the rows with the COUNT beside the label, the explainer once, and NO action control", async () => {
    studentRows = [
      { id: "s1", name: "น้องหนึ่ง", nickname: "หนึ่ง", phone: null, parentId: null, parentName: null, label: "น้องหนึ่ง", birthDate: "2018-11-05" },
      { id: "s2", name: "น้องสอง", nickname: null, phone: null, parentId: null, parentName: null, label: "น้องสอง", birthDate: null },
    ];
    const user = userEvent.setup();
    mount();
    await user.click(filter());

    await waitFor(() => expect(noParentGets().length).toBeGreaterThan(0));
    expect(noParentGets()[0].params).toEqual({ noParent: "true", limit: 200 });

    const list = await waitFor(() => {
      const l = document.querySelector("[data-no-parent-list]");
      expect(l?.getAttribute("data-no-parent-list")).toBe("2");
      return l as HTMLElement;
    });
    expect(list.querySelectorAll("[data-no-parent-row]").length).toBe(2);
    expect(list.textContent).toContain("น้องหนึ่ง");
    expect(list.textContent).toContain("05-11-2018");
    expect(list.querySelectorAll("[data-no-parent-explainer]").length).toBe(1);
    expect(list.textContent).toContain(st.noParentExplainer);
    expect(list.querySelectorAll("button, a").length).toBe(0); // 🚫 no action, no bulk action
    expect(document.body.textContent).toContain(`${st.noParentFilter} (2)`);
  });

  it("ON with none ⇒ the quiet empty state", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(filter());
    await waitFor(() => expect(document.querySelector("[data-no-parent-empty]")?.textContent).toBe(st.noParentEmpty));
    expect(document.body.textContent).toContain(`${st.noParentFilter} (0)`);
  });

  it("the search COMPOSES with it — the same `q` rides on the same read", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText(dictionaries.en.people.searchPlaceholder), "หนึ่ง");
    await user.click(filter());
    await waitFor(() => expect(noParentGets().some((g) => g.params.q === "หนึ่ง" && g.params.noParent === "true")).toBe(true));
  });
});
