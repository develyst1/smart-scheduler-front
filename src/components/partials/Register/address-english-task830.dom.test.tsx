import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-830 (REQ-118 follow-up, Khwan 2026-10-21) — the address picker shows ENGLISH area names on the EN page.**
 *
 * 🔑 By value: the OPTIONS a parent/admin sees, the confirm row, and — the half that must not move — the REQUEST (Thai names + geocodes).
 * The address book is faked at its own boundary (`loadAddressBook`), as in `register-required.dom.test.tsx`; the pages' own logic runs.
 */

const sent: Array<{ path: string; body: Record<string, unknown> }> = [];

const realLiff = await import("@/lib/register/liff");
mock.module("@/lib/register/liff", () => ({ ...realLiff, obtainIdToken: async () => ({ kind: "ready", idToken: "tok" }) }));
const realEntry = await import("@/lib/register/entry");
/** The third sub-district has NO English — it must fall back to its Thai, never to a blank. */
const BOOK = {
  provinces: [{ code: "10", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" }],
  districtsOf: async () => [{ code: "1001", nameTh: "วัฒนา", nameEn: "Watthana" }],
  subDistrictsOf: async () => [
    { code: "100101", nameTh: "พระโขนงเหนือ", nameEn: "Phra Khanong Nuea" },
    { code: "100102", nameTh: "คลองตันเหนือ", nameEn: "" },
  ],
};
mock.module("@/lib/register/entry", () => ({ ...realEntry, loadAddressBook: async () => BOOK }));
const realLocale = await import("@/lib/register/locale");
mock.module("@/lib/register/locale", () => ({ ...realLocale, phoneLanguage: async () => "en" }));

globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  const path = String(url).split("/register/")[1] ?? "";
  const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  const { idToken, ...rest } = body;
  void idToken;
  sent.push({ path, body: rest });
  const answer =
    path === "status"
      ? { ok: true, linked: false }
      : path === "lookup"
        ? { ok: true, outcome: "new", phone: rest.phone }
        : path === "link"
          ? { ok: true, outcome: "linked", isNew: true, children: [], canAddMore: true, addressOnFile: false, province: null }
          : {
              ok: true,
              outcome: "created",
              student: { id: "s1", name: String(rest.name) },
              birthDate: String(rest.birthDate ?? ""),
              count: 1,
              atMax: false,
              canAddMore: true,
              addressOnFile: true,
              province: "กรุงเทพมหานคร",
            };
  return { ok: true, json: async () => answer } as unknown as Response;
}) as unknown as typeof fetch;

const RegisterContent = (await import("@/components/partials/Register/RegisterContent")).default;
const AreaPicker = (await import("@/components/partials/People/AreaPicker")).default;
const { NO_AREA } = await import("@/components/partials/People/AreaPicker");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  sent.length = 0;
  window.localStorage.clear();
});

const combos = () => [...document.querySelectorAll("input[role='combobox']")] as HTMLElement[];
let openedIndex = 0;
const optionTexts = () => {
  const id = combos()[openedIndex]?.getAttribute("aria-controls");
  const list = id ? document.getElementById(id) : null;
  return [...(list ?? document).querySelectorAll("[data-combobox-option]")].map((o) => o.textContent);
};
const open = async (user: ReturnType<typeof userEvent.setup>, index: number) => {
  openedIndex = index;
  await user.click(combos()[index]);
  await waitFor(() => expect(optionTexts().length).toBeGreaterThan(0));
};
const pick = async (user: ReturnType<typeof userEvent.setup>, index: number, option: string) => {
  await user.click(combos()[index]);
  await user.click(await screen.findByText(option));
};

describe("🔴 TASK-830 — the register page (EN)", () => {
  const toForm = async (user: ReturnType<typeof userEvent.setup>) => {
    render(h(MantineProvider, null, h(I18nProvider, null, h(RegisterContent, null))) as never);
    await user.type(await waitFor(() => screen.getByLabelText(/phone/i) as HTMLInputElement), "0812345678");
    await user.click([...document.querySelectorAll("button")].find((b) => /continue|next/i.test(b.textContent ?? "")) as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-form-next]")).toBeTruthy());
  };

  it("🔑 the options are ENGLISH (our dataset's names); a row with no English shows its Thai, not a blank", async () => {
    const user = userEvent.setup();
    await toForm(user);
    await open(user, 0);
    expect(optionTexts()).toEqual(["Bangkok"]);
    await user.click(await screen.findByText("Bangkok"));
    await open(user, 1);
    expect(optionTexts()).toEqual(["Watthana"]);
    await user.click(await screen.findByText("Watthana"));
    await open(user, 2);
    expect(optionTexts()).toEqual(["Phra Khanong Nuea", "คลองตันเหนือ"]);
  });

  it("🔑 the confirm row reads in English, and the REQUEST is still Thai names + geocodes", async () => {
    const user = userEvent.setup();
    await toForm(user);
    await user.type(screen.getByLabelText(/name/i), "Beam");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "02-12-2020" } });
    await pick(user, 0, "Bangkok");
    await pick(user, 1, "Watthana");
    await pick(user, 2, "Phra Khanong Nuea");
    await waitFor(() => expect((document.querySelector("[data-form-next]") as HTMLButtonElement).disabled).toBe(false));
    await user.click(document.querySelector("[data-form-next]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-confirm-save]")).toBeTruthy());
    expect(document.body.textContent).toContain("Phra Khanong Nuea Watthana Bangkok");
    expect(document.body.textContent).not.toContain("พระโขนงเหนือ");

    await user.click(document.querySelector("[data-confirm-save]") as HTMLElement);
    await waitFor(() => expect(sent.some((r) => r.path === "create")).toBe(true));
    const body = sent.find((r) => r.path === "create")!.body;
    expect(body.province).toBe("กรุงเทพมหานคร");
    expect(body.district).toBe("วัฒนา");
    expect(body.subDistrict).toBe("พระโขนงเหนือ");
    expect([body.provinceCode, body.districtCode, body.subdistrictCode]).toEqual(["10", "1001", "100101"]);
    expect(JSON.stringify(body)).not.toMatch(/Bangkok|Watthana|Phra Khanong/);
  });

  it("🔑 TH is byte-identical: switch the toggle to ไทย and the options AND the confirm row are Thai again (same picks, nothing re-fetched)", async () => {
    const user = userEvent.setup();
    await toForm(user);
    await user.type(screen.getByLabelText(/name/i), "Beam");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "02-12-2020" } });
    await pick(user, 0, "Bangkok");
    await pick(user, 1, "Watthana");
    await pick(user, 2, "Phra Khanong Nuea");
    await user.click(document.querySelector("input[type='radio'][value='th']") as HTMLElement);
    await open(user, 0);
    await waitFor(() => expect(optionTexts()).toEqual(["กรุงเทพมหานคร"]));
    await waitFor(() => expect((document.querySelector("[data-form-next]") as HTMLButtonElement).disabled).toBe(false));
    await user.click(document.querySelector("[data-form-next]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-confirm-save]")).toBeTruthy());
    expect(document.body.textContent).toContain("พระโขนงเหนือ วัฒนา กทม");
    expect(document.body.textContent).not.toContain("Phra Khanong");
  });
});

describe("🔴 TASK-830 — the admin parent form's picker", () => {
  const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(AreaPicker, { value: NO_AREA, onChange: () => {} }))) as never);

  it("EN: English names, with the same Thai fallback", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect((combos()[0] as HTMLInputElement).disabled).toBe(false));
    await open(user, 0);
    expect(optionTexts()).toEqual(["Bangkok"]);
  });

  it("TH: the Thai names, exactly as before", async () => {
    window.localStorage.setItem("ss.lang", "th");
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect((combos()[0] as HTMLInputElement).disabled).toBe(false));
    await open(user, 0);
    expect(optionTexts()).toEqual(["กรุงเทพมหานคร"]);
  });
});
