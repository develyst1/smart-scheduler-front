import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 10 (TASK-565 BE → TASK-566 FE) — every field required, and the address asked ONCE per household.**
 *
 * 🔑 **Why clicked:** the two things this task must guarantee are both about a REQUEST — *with everything empty, nothing
 * goes out* and *for a second child, no address goes out* — and TASK-564's lesson is that a disabled-looking button is not
 * the same statement as an absent request. 🚫 So every assertion below reads the wire, and the empty-form case asserts
 * that the wire stayed silent.
 *
 * 📌 The LIFF SDK and the three `/register` calls are faked at their own module boundaries; the page's own logic runs.
 */

const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
/** What `/status` answers — the two shapes this task turns on. */
let statusAnswer: unknown = { ok: true, linked: false };
let createAnswer: unknown = null;
/** 🔑 The second-child path is the real one a returning parent walks: phone → lookup (found) → link (with the address on
 *  file) → the child list → Add a child. The `already-linked` screen is a dead end by design (unlink or close). */
let lookupAnswer: ((phone: string) => unknown) | null = null;
let linkAnswer: unknown = null;

const realLiff = await import("@/lib/register/liff");
mock.module("@/lib/register/liff", () => ({ ...realLiff, obtainIdToken: async () => ({ kind: "ready", idToken: "tok" }) }));
const realLocale = await import("@/lib/register/locale");
mock.module("@/lib/register/locale", () => ({ ...realLocale, phoneLanguage: async () => "en" }));

/**
 * 🔑 **The boundary is `fetch`, not the api module** — and that is a correction I made mid-task: mocking `create` recorded
 * what the PAGE hands a function, whose object literal always carries `address` / `province` / `detailProvided` as
 * `undefined`. **What leaves the app is what `api.ts` builds**, and it drops empty keys there. ⇒ asserting the page's
 * argument would have passed while the wire carried an address key — *the same class of lie this whole round is about.*
 */
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  const path = String(url).split("/register/")[1] ?? "";
  const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  const { idToken, ...rest } = body; // the token is the identity on every call; it is not what these tests are about
  void idToken;
  sent.push({ path, body: rest });
  const answer =
    path === "status"
      ? statusAnswer
      : path === "lookup"
        ? (lookupAnswer?.(String(rest.phone)) ?? { ok: true, outcome: "new", phone: rest.phone })
        : path === "link"
          ? (linkAnswer ?? { ok: true, outcome: "linked", isNew: true, children: [], canAddMore: true, addressOnFile: false, province: null })
          : (createAnswer ?? {
              ok: true,
              outcome: "created",
              student: { id: "s1", name: String(rest.name) },
              birthDate: String(rest.birthDate ?? ""),
              count: 1,
              atMax: false,
              canAddMore: true,
              addressOnFile: true,
              province: "กรุงเทพมหานคร",
            });
  return { ok: true, json: async () => answer } as unknown as Response;
}) as unknown as typeof fetch;

const RegisterContent = (await import("./RegisterContent")).default;

const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(RegisterContent, null))) as never);
const nextBtn = () => document.querySelector("[data-form-next]") as HTMLButtonElement;
const saveBtn = () => document.querySelector("[data-confirm-save]") as HTMLButtonElement;
const byLabel = (re: RegExp) => screen.getByLabelText(re) as HTMLInputElement;

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  statusAnswer = { ok: true, linked: false };
  lookupAnswer = null;
  linkAnswer = null;
  createAnswer = null;
});

/** Phone → link → the child form, the state both cases start from. */
const toForm = async (user: ReturnType<typeof userEvent.setup>) => {
  mount();
  const phone = await waitFor(() => byLabel(/phone/i));
  await user.type(phone, "0812345678");
  const find = [...document.querySelectorAll("button")].find((b) => /continue|next|ค้นหา|ต่อไป/i.test(b.textContent ?? "")) as HTMLElement;
  await user.click(find);
  await waitFor(() => expect(nextBtn()).toBeTruthy());
};

describe("🔴 TASK-566 — every field required, clicked", () => {
  it("🔑 with every field EMPTY the form does not proceed and NO create request goes out", async () => {
    const user = userEvent.setup();
    await toForm(user);

    // the door is shut…
    expect(nextBtn().disabled).toBe(true);
    // …and pressing it anyway sends nothing and does not reach the confirm screen
    await user.click(nextBtn());
    expect(sent.some((r) => r.path === "create")).toBe(false);
    expect(saveBtn()).toBeNull();
  });

  it("🔑 a name alone is not enough, and neither is a name + birthday — the address is required too", async () => {
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "น้องบีม");
    expect(nextBtn().disabled).toBe(true);

    // the typed-date path (the picker is a masked widget; TASK-563's note)
    const toggle = [...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement;
    await user.click(toggle);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    await waitFor(() => expect(nextBtn().disabled).toBe(true)); // still shut: no address yet

    expect(sent.some((r) => r.path === "create")).toBe(false);
  });

  it("🔑 all three filled ⇒ the create carries name, birthDate AND the address", async () => {
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "น้องบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    // the typed address path — one field, no dataset needed
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/address/i), { target: { value: "พระโขนงเหนือ วัฒนา กทม" } });

    await waitFor(() => expect(nextBtn().disabled).toBe(false));
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    await waitFor(() => expect(sent.some((r) => r.path === "create")).toBe(true));
    const body = sent.find((r) => r.path === "create")!.body;
    expect(body.name).toBe("น้องบีม");
    expect(body.birthDate).toBe("02-12-2020");
    expect(body.address).toBe("พระโขนงเหนือ วัฒนา กทม");
  });

  it("🔑 a household that ALREADY has an address is not asked: the field is ABSENT and no address is sent", async () => {
    // 🔑 The REAL second-child path: a known family, then `/link` answers with the address already on file — so the form
    // knows without a second request, which is the whole point of TASK-565 returning the state.
    lookupAnswer = (phone) => ({ ok: true, outcome: "found", phone, children: [{ id: "c1", name: "น้องบีม", nickname: null }] });
    linkAnswer = {
      ok: true,
      outcome: "linked",
      isNew: false,
      children: [{ id: "c1", name: "น้องบีม", nickname: null }],
      canAddMore: true,
      addressOnFile: true,
      province: "กรุงเทพมหานคร",
    };
    const user = userEvent.setup();
    mount();

    const phone = await waitFor(() => byLabel(/phone/i));
    await user.type(phone, "0812345678");
    await user.click([...document.querySelectorAll("button")].find((b) => /continue|next/i.test(b.textContent ?? "")) as HTMLElement);
    // the found screen ⇒ link, then the child list ⇒ Add a child
    await user.click(await waitFor(() => [...document.querySelectorAll("button")].find((b) => /link this line account/i.test(b.textContent ?? "")) as HTMLElement));
    await user.click(await waitFor(() => [...document.querySelectorAll("button")].find((b) => /add a child/i.test(b.textContent ?? "")) as HTMLElement));
    await waitFor(() => expect(nextBtn()).toBeTruthy());

    // 🚫 ABSENT, not disabled and not prefilled-and-locked
    expect(screen.queryByLabelText(/address/i)).toBeNull();
    expect(screen.queryByLabelText(/province/i)).toBeNull();
    // and the page says why, with the province it already holds
    expect(document.querySelector("[data-address-on-file]")).toBeTruthy();
    expect(screen.getByText(/already have your address on file/i).textContent).toContain("กรุงเทพมหานคร");

    // name + birthday alone are now enough
    await user.type(byLabel(/name/i), "น้องบูม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "05-05-2021" } });
    await waitFor(() => expect(nextBtn().disabled).toBe(false));

    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));
    await waitFor(() => expect(sent.some((r) => r.path === "create")).toBe(true));

    const body = sent.find((r) => r.path === "create")!.body;
    expect(body.name).toBe("น้องบูม");
    expect(body.birthDate).toBe("05-05-2021");
    // 🔑 the whole point: no address in the body at all
    expect(Object.keys(body).sort()).toEqual(["birthDate", "name"]);
  });

  it("🚫 not one “(optional)” or skip is offered anywhere on the form — TEXT *and* every attribute", async () => {
    const user = userEvent.setup();
    await toForm(user);
    /**
     * 🔴 This assertion used to read `textContent` only — and a mutation putting “(optional)” back into the birthday
     * placeholder SLIPPED, because **a placeholder is an attribute and `textContent` does not include it.**
     * 🔑 TASK-563's rule, one layer over: *a screen assertion is only as good as what the screen exposes.*
     */
    const surface = [
      document.body.textContent ?? "",
      ...[...document.querySelectorAll("[placeholder], [aria-label], [title]")].flatMap((el) => [
        el.getAttribute("placeholder") ?? "",
        el.getAttribute("aria-label") ?? "",
        el.getAttribute("title") ?? "",
      ]),
    ].join(" | ");
    expect(surface.toLowerCase()).not.toContain("optional");
    expect(surface).not.toContain("ไม่บังคับ");
    expect(surface).not.toContain("ข้าม");
    expect(surface).not.toContain("(skipped)");
    // and the placeholders ARE on screen, so the check has something to read (a pin that sees nothing proves nothing)
    expect(document.querySelectorAll("[placeholder]").length).toBeGreaterThan(0);
  });
});
