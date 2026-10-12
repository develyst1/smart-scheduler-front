import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Parent } from "@/types/app/people";

/**
 * 🔴 **TASK-801 (REQ-118) — the admin parent form picks the address as CODES, and the card prints the server's rendered address.**
 *
 * Everything is read at the WIRE (the request the form sends) and on the CARD (the text a person reads). 🔑 The dangerous failures are
 * invisible on screen: a form that sends a HALF triple, one that sends names instead of codes, an untouched Save that sends `null` ×3 and
 * silently CLEARS a parent's address, and a card that shows Thai under an English screen.
 */

const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
let parentsOnServer: Array<Partial<Parent> & { id: string }> = [];

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));

// The dataset is faked at its own module boundary (the page's tests do the same): the point is the REQUEST.
const realEntry = await import("@/lib/register/entry");
mock.module("@/lib/register/entry", () => ({
  ...realEntry,
  loadAddressBook: async () => ({
    provinces: [
      { code: "10", nameTh: "กรุงเทพมหานคร" },
      { code: "50", nameTh: "เชียงใหม่" },
    ],
    districtsOf: async (p: string) => (p === "10" ? [{ code: "1001", nameTh: "วัฒนา" }, { code: "1002", nameTh: "บางนา" }] : [{ code: "5001", nameTh: "เมืองเชียงใหม่" }]),
    subDistrictsOf: async (d: string) => (d === "1001" ? [{ code: "100101", nameTh: "พระโขนงเหนือ" }] : d === "1002" ? [{ code: "100201", nameTh: "บางนาเหนือ" }] : [{ code: "500101", nameTh: "ศรีภูมิ" }]),
  }),
}));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      if (url === "/parents") return { data: { parents: parentsOnServer, total: parentsOnServer.length } };
      if (url === "/students") return { data: [] };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "POST", url, body });
      return { data: { id: "new", phone: String(body.phone), name: null, lineUserId: null, province: null, note: null, suspendedAt: null, students: [] } };
    },
    patch: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "PATCH", url, body });
      return { data: { ...(parentsOnServer[0] ?? {}), ...body } };
    },
  },
}));

const ParentFormModal = (await import("./ParentFormModal")).default;
const PeopleContent = (await import("./PeopleContent")).default;

const base = (over: Partial<Parent>): Parent => ({ id: "p1", phone: "0811111111", name: "แม่บี", lineUserId: null, province: null, note: null, suspendedAt: null, students: [], ...over });
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (el: unknown) => render(h(QueryClientProvider, { client: qc() }, h(MantineProvider, null, h(I18nProvider, null, el as never))) as never);
const combos = () => [...document.querySelectorAll("input[role='combobox']")] as HTMLInputElement[];
const pick = async (user: ReturnType<typeof userEvent.setup>, index: number, option: string) => {
  await user.click(combos()[index]);
  await user.click(await screen.findByText(option));
};
const saveBtn = () => [...document.querySelectorAll("button")].find((b) => /^save$/i.test((b.textContent ?? "").trim())) as HTMLButtonElement;
const writes = () => calls.filter((c) => c.method !== "GET");
const mountForm = (parent: Parent | null) => wrap(h(ParentFormModal, { opened: true, parent, onClose: () => {} }));

beforeEach(() => {
  calls.length = 0;
  parentsOnServer = [];
  try {
    localStorage.removeItem("ss.lang");
  } catch {}
});
afterEach(cleanup);

describe("🔴 TASK-801 — the admin form sends the three CODES, all or none", () => {
  it("🔑 ADD: three picks ⇒ POST /parents carries provinceCode · districtCode · subdistrictCode — and NO Thai-name `province`", async () => {
    const user = userEvent.setup();
    mountForm(null);
    await waitFor(() => expect(combos()[0].disabled).toBe(false));
    await user.type(document.querySelector("input[inputmode='tel']") as HTMLElement, "0899999999");
    await pick(user, 0, "กรุงเทพมหานคร");
    await pick(user, 1, "วัฒนา");
    await pick(user, 2, "พระโขนงเหนือ");
    await user.click(saveBtn());
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].url).toBe("/parents");
    expect(writes()[0].body.provinceCode).toBe("10");
    expect(writes()[0].body.districtCode).toBe("1001");
    expect(writes()[0].body.subdistrictCode).toBe("100101");
    expect("province" in writes()[0].body).toBe(false);
  });

  it("🔑 a HALF triple cannot be saved: Save is shut and NOTHING is sent (one pick, then two)", async () => {
    const user = userEvent.setup();
    mountForm(null);
    await waitFor(() => expect(combos()[0].disabled).toBe(false));
    await user.type(document.querySelector("input[inputmode='tel']") as HTMLElement, "0899999999");
    await pick(user, 0, "กรุงเทพมหานคร");
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    await pick(user, 1, "วัฒนา");
    expect(saveBtn().disabled).toBe(true);
    await user.click(saveBtn());
    expect(writes().length).toBe(0);
    await pick(user, 2, "พระโขนงเหนือ");
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
  });

  it("🔑 EDIT a parent with codes: the picker is PREFILLED from them, and an UNTOUCHED save sends NO address key (never null ×3)", async () => {
    const user = userEvent.setup();
    mountForm(base({ province: "กรุงเทพมหานคร", provinceCode: "10", districtCode: "1001", subdistrictCode: "100101" }));
    await waitFor(() => expect(combos()[2].value).toBe("พระโขนงเหนือ"));
    expect(combos()[0].value).toBe("กรุงเทพมหานคร");
    expect(combos()[1].value).toBe("วัฒนา");
    await user.click(saveBtn());
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].method).toBe("PATCH");
    const keys = Object.keys(writes()[0].body);
    expect(keys.filter((k) => /Code$|^province$/.test(k))).toEqual([]);
  });

  it("🔑 EDIT: changing the district sends all three codes (the sub-district is cleared by the change, so it must be picked again)", async () => {
    const user = userEvent.setup();
    mountForm(base({ provinceCode: "10", districtCode: "1001", subdistrictCode: "100101" }));
    await waitFor(() => expect(combos()[2].value).toBe("พระโขนงเหนือ"));
    await pick(user, 1, "บางนา");
    expect(saveBtn().disabled).toBe(true); // a half triple now
    await pick(user, 2, "บางนาเหนือ");
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    await user.click(saveBtn());
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].body.provinceCode).toBe("10");
    expect(writes()[0].body.districtCode).toBe("1002");
    expect(writes()[0].body.subdistrictCode).toBe("100201");
  });

  it("🔑 EDIT: clearing the address sends `null` ×3 — the one way to clear", async () => {
    const user = userEvent.setup();
    mountForm(base({ provinceCode: "10", districtCode: "1001", subdistrictCode: "100101" }));
    await waitFor(() => expect(combos()[0].value).toBe("กรุงเทพมหานคร"));
    await user.click(combos()[0]);
    await user.click((await screen.findAllByText("กรุงเทพมหานคร")).find((e) => e.getAttribute("role") === "option" || e.closest("[role='option']")) as HTMLElement); // deselect
    await waitFor(() => expect(combos()[0].value).toBe(""));
    await user.click(saveBtn());
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0].body.provinceCode).toBeNull();
    expect(writes()[0].body.districtCode).toBeNull();
    expect(writes()[0].body.subdistrictCode).toBeNull();
  });

  it("⚠️ a parent with only the OLD province text (no codes): the text is IN the box (the owner's 'visible value is the warning'), and an untouched save sends NO address", async () => {
    const user = userEvent.setup();
    mountForm(base({ province: "กรุงเทพมหานคร" }));
    await waitFor(() => expect(combos()[0].disabled).toBe(false));
    expect(combos()[0].value).toBe("กรุงเทพมหานคร");
    expect(combos()[1].disabled).toBe(true); // it is not a pick: the next level waits for a real one
    await user.click(saveBtn());
    await waitFor(() => expect(writes().length).toBe(1));
    expect(Object.keys(writes()[0].body).filter((k) => /Code$|^province$/.test(k))).toEqual([]);
  });
});

describe("🔴 TASK-801 — the card prints the server's rendered address in THIS screen's language", () => {
  const RENDERED = { province: "กรุงเทพมหานคร", provinceCode: "10", districtCode: "1001", subdistrictCode: "100101", addressTh: "พระโขนงเหนือ วัฒนา กรุงเทพมหานคร", addressEn: "Phra Khanong Nuea Watthana Bangkok" };
  const cardText = () => (document.querySelector("[data-parent-address]")?.textContent ?? "").trim();

  it("🔑 English screen ⇒ `addressEn`, and NOT the Thai line", async () => {
    parentsOnServer = [base(RENDERED)];
    wrap(h(PeopleContent, null));
    await waitFor(() => expect(cardText()).not.toBe(""));
    expect(cardText()).toBe(RENDERED.addressEn);
    expect(document.body.textContent).not.toContain(RENDERED.addressTh);
  });

  it("🔑 Thai screen ⇒ `addressTh`", async () => {
    localStorage.setItem("ss.lang", "th");
    parentsOnServer = [base(RENDERED)];
    wrap(h(PeopleContent, null));
    await waitFor(() => expect(cardText()).not.toBe(""));
    expect(cardText()).toBe(RENDERED.addressTh);
    expect(document.body.textContent).not.toContain(RENDERED.addressEn);
  });

  it("✅ no rendered address (a parent with no codes yet) ⇒ the raw `province` text, exactly as today", async () => {
    parentsOnServer = [base({ province: "ภูเก็ต", addressTh: null, addressEn: null })];
    wrap(h(PeopleContent, null));
    await waitFor(() => expect(cardText()).not.toBe(""));
    expect(cardText()).toBe("ภูเก็ต");
  });
});
