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
 *  file) → the child list → Add a child.
 *  🔻 **TASK-580 — this comment used to end "the `already-linked` screen is a dead end BY DESIGN (unlink or close)".**
 *  It was not by design: D11 and Tanya's F-B are that dead end, and a family with zero children could not get past it at
 *  all. 📌 *A note that describes a dead end approvingly is how one survives a green suite* — see the TASK-580 block below. */
let lookupAnswer: ((phone: string) => unknown) | null = null;
let linkAnswer: unknown = null;

const realLiff = await import("@/lib/register/liff");
mock.module("@/lib/register/liff", () => ({ ...realLiff, obtainIdToken: async () => ({ kind: "ready", idToken: "tok" }) }));
/**
 * 🔻 **TASK-591 — the typed address is GONE**, so these tests pick three parts. The dataset is faked at its own module
 * boundary: 🔑 *the point is the REQUEST, and loading 70k rows to prove a body shape would be a slower test that proves
 * exactly the same thing.*
 */
const realEntry = await import("@/lib/register/entry");
mock.module("@/lib/register/entry", () => ({
  ...realEntry,
  loadAddressBook: async () => ({
    provinces: [{ code: "10", nameTh: "กรุงเทพมหานคร" }],
    districtsOf: async () => [{ code: "1001", nameTh: "วัฒนา" }],
    subDistrictsOf: async () => [{ code: "100101", nameTh: "พระโขนงเหนือ" }],
  }),
}));
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

/**
 * Pick one option out of the address `Select`s **by position** — province, district, sub-district, in that order.
 * 🔑 **Not by label:** Mantine puts the required asterisk inside the label, and two of the page's strings start with the
 * word *Province* (the picker's label and the typing instruction's sentence), so a label query matched prose as well as a
 * control. *The label WORDS are pinned in the fast tests; here the structure is the stable thing.*
 */
const combos = () => [...document.querySelectorAll("input[role='combobox']")] as HTMLElement[];
const pick = async (user: ReturnType<typeof userEvent.setup>, index: number, option: string) => {
  await user.click(combos()[index]);
  await user.click(await screen.findByText(option));
};
/** 🔴 TASK-591 — the address is THREE picks now, and two of them do not submit. */
const pickAddress = async (user: ReturnType<typeof userEvent.setup>) => {
  await pick(user, 0, "กรุงเทพมหานคร");
  await pick(user, 1, "วัฒนา");
  await pick(user, 2, "พระโขนงเหนือ");
};

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
    // 🔴 TASK-591 — three picks. **Two of them do not submit**, which the test below this one proves.
    await pickAddress(user);
    // 🚫 and a BRAND-NEW family is not told we are asking "again" — they were never asked before (W9)
    expect(document.querySelector("[data-address-ask-again]")).toBeNull();

    await waitFor(() => expect(nextBtn().disabled).toBe(false));
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    await waitFor(() => expect(sent.some((r) => r.path === "create")).toBe(true));
    const body = sent.find((r) => r.path === "create")!.body;
    expect(body.name).toBe("น้องบีม");
    expect(body.birthDate).toBe("02-12-2020");
    // 🔻 TASK-591, declared: the pre-joined line is GONE from the wire — the server builds it from THREE parts, so the
    // body carries the parts and 🚫 no `address` key at all.
    expect(body.province).toBe("กรุงเทพมหานคร");
    expect(body.district).toBe("วัฒนา");
    expect(body.subDistrict).toBe("พระโขนงเหนือ");
    expect(body.address).toBeUndefined();
    // 🔑 and the phone rides too, because this account was NOT linked: the family and this child are ONE transaction
    expect(body.phone).toBe("0812345678");
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

/**
 * 🔴 **TASK-578 (BE) → TASK-580 — `canAddMore`, clicked: D11 and Tanya's F-B are ONE defect.**
 *
 * A LINKED family that comes back to add a child met a screen offering only *unlink* or *close* — and a linked family with
 * **zero** children (D11) met it too, with nothing at all it could do. 🔑 **The cap is the server's fact**
 * (`MAX_STUDENTS_PER_PARENT`), and the page does not know it, so every case below is driven by the `/status` answer and
 * never by the child count on screen.
 */
describe("🔴 TASK-580 — the linked family's way forward, clicked", () => {
  it("🔴 D11 — a linked family with ZERO children lands on the FORM, not on the dead end", async () => {
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 0, canAddMore: true, addressOnFile: false, province: null };
    mount();

    // the form, straight away — and the already-linked screen is not what they get
    await waitFor(() => expect(nextBtn()).toBeTruthy());
    expect(document.querySelector("[data-add-child]")).toBeNull();
    expect(screen.queryByText(/already/i)).toBeNull();
    // 🚫 nothing has been asked of the server beyond the status read that got us here
    expect(sent.map((r) => r.path)).toEqual(["status"]);
  });

  it("🔑 F-B — a linked family WITH children gets the way forward, and it reaches the form", async () => {
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 2, canAddMore: true, addressOnFile: true, province: "กรุงเทพมหานคร" };
    const user = userEvent.setup();
    mount();

    // 🔑 `waitFor` only retries when its callback THROWS: returning `null` resolves straight away with `null`, which is
    // how this test first "found" nothing and failed. The assertion has to live INSIDE the callback.
    const add = await waitFor(() => {
      const el = document.querySelector("[data-add-child]") as HTMLButtonElement | null;
      expect(el).toBeTruthy();
      return el as HTMLButtonElement;
    });
    expect(document.querySelector("[data-family-full]")).toBeNull();
    await user.click(add);
    await waitFor(() => expect(nextBtn()).toBeTruthy());
    expect(sent.map((r) => r.path)).toEqual(["status"]);
  });

  it("⚠️ at the cap the family gets a REASON, no button, and NO request — not a dead control", async () => {
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 5, canAddMore: false, addressOnFile: true, province: "กรุงเทพมหานคร" };
    mount();

    const full = await waitFor(() => {
      const el = document.querySelector("[data-family-full]") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(full.textContent).toMatch(/reached the limit/i);
    // 🚫 not a disabled button: there is no button at all, and nothing left the app
    expect(document.querySelector("[data-add-child]")).toBeNull();
    expect(sent.map((r) => r.path)).toEqual(["status"]);
  });

  /**
   * 🔑 **The two cases that make "READ, never derived" a fact rather than a claim.** Both contradict what a local
   * count-vs-cap sum would conclude, so a page that computed the answer would fail exactly here.
   */
  it("🔴 the server's NO wins over a small child count", async () => {
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 1, canAddMore: false, addressOnFile: true, province: null };
    mount();
    await waitFor(() => expect(document.querySelector("[data-family-full]")).toBeTruthy());
    expect(document.querySelector("[data-add-child]")).toBeNull();
  });

  it("🔴 …and the server's YES wins over a large one", async () => {
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 9, canAddMore: true, addressOnFile: true, province: null };
    mount();
    await waitFor(() => expect(document.querySelector("[data-add-child]")).toBeTruthy());
    expect(document.querySelector("[data-family-full]")).toBeNull();
  });
});

/**
 * 🔴 **F-C + D11(a) (TASK-590 BE → TASK-591 FE) — three address parts, and the family created WITH its first child.**
 *
 * 🔑 **Why these are clicked and not only pinned:** the two dangerous states are both invisible to a render test — **a body
 * that leaves with two address parts** (the server refuses it, and the parent sees a failure they cannot act on) and **a
 * parent left HALF-LINKED after a rejected child** (they would be bound to a family that has nobody in it — D11 itself).
 */
describe("🔴 TASK-591 — three parts, one transaction, clicked", () => {
  it("🔴 TWO parts do not submit — and pressing it anyway sends NOTHING", async () => {
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "น้องบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    // province + district only — the sub-district is the one the server would name in `ADDRESS_INCOMPLETE`
    await pick(user, 0, "กรุงเทพมหานคร");
    await pick(user, 1, "วัฒนา");

    await waitFor(() => expect(nextBtn().disabled).toBe(true));
    await user.click(nextBtn());
    expect(saveBtn()).toBeNull();
    expect(sent.some((r) => r.path === "create")).toBe(false);
  });

  it("🔑 a NEW phone writes NOTHING at the phone step — no `/link` call at all", async () => {
    const user = userEvent.setup();
    await toForm(user);
    // 🔴 D11's cause: `/link` used to CREATE the parent here, so a family could exist with no child.
    expect(sent.map((r) => r.path)).toEqual(["status", "lookup"]);
    expect(sent.some((r) => r.path === "link")).toBe(false);
  });

  it("🔴 a REJECTED child leaves the parent UNLINKED and unchanged — nothing half-linked", async () => {
    createAnswer = { ok: false, code: "NAME_RESERVED", word: "ครู" };
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "ครูบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    await pickAddress(user);
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    // the refusal is on screen…
    expect(await screen.findByText(/ครู/)).toBeTruthy();
    // …and 🚫 NOTHING else was called: no link, no status re-read, no second create
    expect(sent.filter((r) => r.path === "create").length).toBe(1);
    expect(sent.some((r) => r.path === "link")).toBe(false);
    // 🔑 and the page has not moved to a linked state: the form is still there, with the phone still pending
    expect(nextBtn()).toBeTruthy();
    expect(document.querySelector("[data-add-child]")).toBeNull();
  });

  it("⚠️ a LEGACY household with nothing on file is ASKED — and the ask does not read as a loss", async () => {
    // a linked family with no address on file: the status answer decides, not the page
    statusAnswer = { ok: true, linked: true, phone: "08x-xxx-5678", childCount: 0, canAddMore: true, addressOnFile: false, province: null };
    mount();

    const note = await waitFor(() => {
      const el = document.querySelector("[data-address-ask-again]") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // 🔑 it says WHY we are asking (three parts now) and that it is once only — 🚫 never that anything was lost
    expect(note.textContent).toMatch(/three parts/i);
    expect(note.textContent).toMatch(/only ask once/i);
    expect(note.textContent).not.toMatch(/lost|missing|gone|again\?/i);
    // 🚫 and a brand-new family does NOT get that sentence — they were never asked before
    expect(sent.some((r) => r.path === "lookup")).toBe(false);
  });

  it("🔴 `ADDRESS_INCOMPLETE` names the missing PART, not \"that is wrong\"", async () => {
    createAnswer = { ok: false, code: "ADDRESS_INCOMPLETE", missing: ["subDistrict"] };
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "น้องบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    await pickAddress(user);
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    // the words name the part the server said was absent — read from the failure box itself, because "Sub-district" is
    // also a field LABEL on this screen (🔑 the same lesson as the positional picker above).
    const box = await waitFor(() => {
      const el = document.querySelector("[data-failure='ADDRESS_INCOMPLETE']") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(box.textContent).toMatch(/sub-district/i);
    expect(box.textContent).not.toMatch(/wrong|invalid/i);
    // and we are back on the form, where that part can be picked
    await waitFor(() => expect(nextBtn()).toBeTruthy());
  });

  it("🔑 `PHONE_NOW_REGISTERED` sends the parent back to the phone — still unlinked, and told why", async () => {
    createAnswer = { ok: false, code: "PHONE_NOW_REGISTERED" };
    const user = userEvent.setup();
    await toForm(user);

    await user.type(byLabel(/name/i), "น้องบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    await pickAddress(user);
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    // back at the phone step, with the server's reason on screen
    await waitFor(() => expect(byLabel(/phone/i)).toBeTruthy());
    expect(await screen.findByText(/just been registered/i)).toBeTruthy();
    expect(sent.filter((r) => r.path === "create").length).toBe(1);
  });
});

describe("🔑 TASK-591 — the phone is a ONE-SHOT: it rides for the first child and never again", () => {
  it("a SECOND child's create carries no `phone` — the family exists now, and the server would ignore it anyway", async () => {
    const user = userEvent.setup();
    await toForm(user);

    // the first child: the family is created WITH it, and the phone rides
    await user.type(byLabel(/name/i), "น้องบีม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "02-12-2020" } });
    await pickAddress(user);
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));
    await waitFor(() => expect(sent.filter((r) => r.path === "create").length).toBe(1));
    expect(sent.find((r) => r.path === "create")!.body.phone).toBe("0812345678");

    // 🔑 the second child, from the done screen: the address is on file and the phone must NOT ride again
    await user.click(await waitFor(() => [...document.querySelectorAll("button")].find((b) => /add a child/i.test(b.textContent ?? "")) as HTMLElement));
    await user.type(await waitFor(() => byLabel(/name/i)), "น้องบูม");
    await user.click([...document.querySelectorAll("button")].find((b) => /type it instead/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(byLabel(/date of birth/i), { target: { value: "03-04-2021" } });
    await user.click(nextBtn());
    await user.click(await waitFor(() => saveBtn()));

    await waitFor(() => expect(sent.filter((r) => r.path === "create").length).toBe(2));
    const second = sent.filter((r) => r.path === "create")[1].body;
    expect(second.name).toBe("น้องบูม");
    // 🚫 no phone, and 🚫 no address either — it is on file after the first child (TASK-566's rule, still true)
    expect(second.phone).toBeUndefined();
    expect(second.province).toBeUndefined();
    expect(second.district).toBeUndefined();
    expect(second.subDistrict).toBeUndefined();
  });
});
