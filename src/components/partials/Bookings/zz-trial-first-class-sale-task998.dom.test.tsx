import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-998 (TASK-997 § Contract) — the course SALE offers «Count today's Trial as class 1», clicked on the real form.** The server is a fake at the api boundary; what is under test is what the form READS and SENDS.
 *
 * 🔑 What can go wrong without anyone seeing it: a tick offered to a new student, a DUO or a group sale (the server refuses it there), a tick that goes to the sale but not to the preview (the admin saves a plan
 * other than the one shown), a tick that still lets a discount ride (the server refuses both), an unticked sale whose body is no longer today's, a tick that outlives the student or the kind it was made for.
 * Every assertion is a request body, a count or a string — never an element's look.
 * 🔑 This file stubs the student picker and the sale hooks (`mock.module` is process-global), like `weekly-pattern-sale-task970`; the hooks are built from the REAL service functions, so what is asserted is what the service puts on the wire.
 * 🔑 That global reach is why it is named `zz-…`: it must run AFTER `voucher-note-task733` / `parent-phone-task662`, whose forms its stubs would otherwise break (seen: 4 failures in `voucher-note-task733` when it was named `trial-…`).
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const gets: string[] = [];
const START = dayjs().add(7, "day").format("YYYY-MM-DD");
const EXPANDED = ["2026-12-07 10:00", "2026-12-14 10:00", "2026-12-21 10:00", "2026-12-28 10:00", "2027-01-04 10:00", "2027-01-11 10:00"];
const TRIAL = { bookingId: "b-trial", date: dayjs().format("YYYY-MM-DD"), subjectName: "เปียโน", teacherName: "ครูหนึ่ง", amountMinor: 50000 };
/** what the fake `GET /students/:id/convertible-trial` answers; `salePost` decides what `POST /courses` does */
let trialAnswer: typeof TRIAL | null = TRIAL;
let salePost: (body: Record<string, unknown>) => unknown = () => ({ course: { id: "c9" }, bookings: EXPANDED.map((_, i) => ({ id: `b${i}` })) });

const realClient = await import("@/lib/api/client");
// 🔑 the REAL `ApiClientError` (not a stand-in): `mock.module` is process-global, so replacing it breaks other files' `instanceof` checks
const TestApiError = realClient.ApiClientError;
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      gets.push(url);
      if (/^\/students\/[^/]+\/convertible-trial$/.test(url)) return { data: { trial: trialAnswer } };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      const wire = JSON.parse(JSON.stringify(body)); // what reaches the WIRE: a key holding `undefined` is not sent
      posts.push({ url, body: wire });
      if (url === "/courses/preview") {
        // the server's size − 1 rows when ticked
        const rows = wire.trialAsFirstClass === true ? EXPANDED.slice(0, 5) : EXPANDED;
        const absent = (wire.absentWeeks as number[] | undefined) ?? [];
        const who = { teacher: { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง" }, subject: { id: "sub1", name: "เปียโน" } };
        // the chain (size − 1 when ticked), a declared absence flagged on its row, and — like the server — ONE make-up row appended per absence
        const sessions: Array<Record<string, unknown>> = rows.map((d, i) => ({ date: d.slice(0, 10), startTime: `${d.slice(11)}:00`, ...who, ...(absent.includes(i + 1) ? { absent: true } : {}) }));
        for (let k = 0; k < absent.length; k++) sessions.push({ date: "2027-02-01", startTime: "10:00:00", ...who, makeup: true });
        return { data: { size: 6, startDate: START, startTime: "10:00", expiryDate: "2027-06-01", absentWeeks: absent, liveCount: rows.length, endDate: rows.at(-1)?.slice(0, 10), sessions } };
      }
      if (url === "/courses") return { data: salePost(wire) };
      return { data: {} };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
const TEACHERS = [
  { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง", type: "FULL_TIME", subjects: ["เปียโน"], subjectOptions: [{ id: "sub1", name: "เปียโน", kind: "PRIVATE" }], active: true, bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] },
];
const CARD = {
  packages: [
    { size: 6, priceGroup: "PRIVATE", priceMinor: 979000, subjects: [{ id: "sub1", name: "เปียโน" }] },
    { size: 6, priceGroup: "DUO", priceMinor: 900000, subjects: [] },
  ],
  unpricedSubjects: [],
  voucherAllowedGroups: [],
};
const svc = await import("@/services/scheduler.service");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS }),
  useSellablePackages: () => ({ data: CARD }),
  usePreviewCourse: () => useMutation({ mutationFn: svc.previewCoursePackage }),
  useCreateCoursePackage: () => useMutation({ mutationFn: svc.createCoursePackage }),
}));
mock.module("@/components/common/StudentSelect", () => ({
  default: ({ onChange }: { onChange: (v: unknown) => void }) =>
    h(
      "div",
      null,
      h("button", { type: "button", "data-student-pick": true, onClick: () => onChange({ id: "s1", name: "น้องมิว", phone: "0812345678" }) }, "pick student"),
      // a NEW student: typed in, not yet in the list — no id
      h("button", { type: "button", "data-student-new": true, onClick: () => onChange({ name: "น้องใหม่", phone: "0899999999" }) }, "new student"),
    ),
}));

const CreatePlanFlow = (await import("./CreatePlanFlow")).default;

type Group = { groupKey: string; name: string; teacherId: string; startDate: string; startTime: string; priceGroup: string | null };
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });
let qcOfMount: QueryClient;
const mount = (group?: Group) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qcOfMount = qc;
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(CreatePlanFlow, { opened: true, onClose: () => {}, group }))))) as never,
  );
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
const generateBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.plan.generate) as HTMLButtonElement;
const coachPick = async (user: ReturnType<typeof userEvent.setup>) => {
  const coach = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-haspopup") === "listbox" && i.closest("[class*='Select']")?.textContent?.includes(dictionaries.en.course.teacher)) as HTMLElement;
  await user.click(coach);
  await waitFor(() => expect(q('[role="option"]')).toBeGreaterThan(0));
  await user.click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("หนึ่ง")) as HTMLElement);
};
/** an EXISTING student (id s1) + the coach; the program comes by itself (one program) */
const fillBasics = async (user: ReturnType<typeof userEvent.setup>) => {
  await click(document.querySelector("[data-student-pick]"));
  await coachPick(user);
  await waitFor(() => expect(generateBtn().disabled).toBe(false));
};
const tick = () => document.querySelector("[data-trial-first-class]") as HTMLInputElement | null;
const discountInput = () => document.querySelector(`input[aria-label="${dictionaries.en.discount.section}"]`) as HTMLInputElement;
const previews = () => posts.filter((p) => p.url === "/courses/preview");
const sales = () => posts.filter((p) => p.url === "/courses");
const trialReads = () => gets.filter((g) => g.endsWith("/convertible-trial"));
const confirmSale = async (user: ReturnType<typeof userEvent.setup>) => {
  const confirm = [...document.querySelectorAll("button")].find((b) => /create|confirm|save/i.test(b.textContent ?? "") && !b.disabled) as HTMLElement | undefined;
  expect(confirm === undefined).toBe(false);
  await user.click(confirm as HTMLElement);
};

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
  gets.length = 0;
  trialAnswer = TRIAL;
  salePost = () => ({ course: { id: "c9" }, bookings: EXPANDED.map((_, i) => ({ id: `b${i}` })) });
});

describe("🔴 TASK-998 (a) — a Trial today: the tick shows, and ticking it rides on the preview AND the sale", () => {
  it("🔑 an existing student with a Trial today ⇒ ONE unticked checkbox with the words and the line «subject · coach · classes left · deduct ฿»", async () => {
    mount();
    await fillBasics(userEvent.setup());
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    expect(tick()?.checked).toBe(false);
    expect(text()).toContain("Count today's Trial as class 1");
    expect(text()).toContain("เปียโน · ครูหนึ่ง · 5 classes left on the course · deduct ฿500");
    expect(trialReads()).toEqual(["/students/s1/convertible-trial"]);
  });

  it("🔑 the words: EN + TH, the TH label exactly as the SA wrote it", () => {
    expect(dictionaries.th.course.trialAsFirstClass).toBe("นับ Trial วันนี้เป็นคาบที่ 1");
    expect(dictionaries.th.course.trialAsFirstClassHint).toBe("{subject} · {teacher} · คอร์สเหลือ {left} คาบ · หัก ฿{amount}");
    expect(dictionaries.en.course.trialAsFirstClass.length).toBeGreaterThan(0);
    expect(dictionaries.en.course.trialAsFirstClassHint.length).toBeGreaterThan(0);
  });

  it("🔑 ticked ⇒ the preview carries `trialAsFirstClass: true`, the plan is the server's size − 1 rows, and the sale carries it too", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(true));
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(previews()[0].body.trialAsFirstClass).toBe(true);
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(sales()[0].body.trialAsFirstClass).toBe(true);
    expect(Object.keys(sales()[0].body)).not.toContain("discount");
  });

  it("🔑 ticked ⇒ the DISCOUNT block is GONE and its typed value is cleared (the server refuses both together); unticking brings it back empty (Amendment 1: was a locked fieldset)", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    // (no discount is typed here: a NumberInput's typed text does not reach the form's state under happy-dom — the TASK-567 trap — so "the typed value is cleared on tick" is the code's `setDiscount(emptyDiscount())`, not something this test can drive)
    expect(q("[data-trial-money]")).toBe(0);
    expect(discountInput() === null).toBe(false);
    // the tick: the block is not rendered at all, our own money line is
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(q("[data-trial-money]")).toBe(1));
    expect(discountInput() === null).toBe(true);
    expect(q("[data-discount-fieldset]")).toBe(0);
    // unticking brings the block back, and the money line goes
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(discountInput() === null).toBe(false));
    expect(q("[data-trial-money]")).toBe(0);
    // tick again and sell: the sale body carries the tick and NO discount
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(true));
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("discount");
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(sales()[0].body.trialAsFirstClass).toBe(true);
    expect(Object.keys(sales()[0].body)).not.toContain("discount");
  });
});

describe("🔴 TASK-998 (b) — no Trial, DUO, group or a new student ⇒ no tick, no key", () => {
  it("🔑 `trial: null` ⇒ no tick; the preview and the sale bodies have NO `trialAsFirstClass` key", async () => {
    trialAnswer = null;
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(trialReads().length).toBe(1)); // it WAS read, and the answer was none
    expect(q("[data-trial-first-class]")).toBe(0);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("trialAsFirstClass");
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(Object.keys(sales()[0].body)).not.toContain("trialAsFirstClass");
  });

  it("🚫 DUO ⇒ no tick and no read; a tick made on Private is DROPPED by the switch and does not come back with Private", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(true));
    const readsBefore = trialReads().length;
    await user.click([...document.querySelectorAll("label")].find((l) => l.textContent === dictionaries.en.course.kindDuo) as HTMLElement);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(0));
    expect(trialReads().length).toBe(readsBefore); // DUO reads nothing
    await user.click([...document.querySelectorAll("label")].find((l) => l.textContent === dictionaries.en.course.kindPrivate) as HTMLElement);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    expect(tick()?.checked).toBe(false); // dropped, not resurrected
  });

  it("🚫 a GROUP sale ⇒ no tick and no read", async () => {
    const user = userEvent.setup();
    mount({ groupKey: "g1", name: "กลุ่มเอ", teacherId: "t1", startDate: START, startTime: "10:00", priceGroup: "PRIVATE" });
    await click(document.querySelector("[data-student-pick]"));
    await waitFor(() => expect(generateBtn().disabled).toBe(false));
    expect(q("[data-trial-first-class]")).toBe(0);
    expect(trialReads().length).toBe(0);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("trialAsFirstClass");
  });

  it("🚫 a NEW student (typed in, no id) ⇒ no tick and no read", async () => {
    const user = userEvent.setup();
    mount();
    await click(document.querySelector("[data-student-new]"));
    await coachPick(user);
    await waitFor(() => expect(generateBtn().disabled).toBe(false));
    expect(q("[data-trial-first-class]")).toBe(0);
    expect(trialReads().length).toBe(0);
  });
});

describe("🔴 TASK-998 (c) — the server's refusal is shown as any create error", () => {
  it("🔑 tick + `409 NO_TRIAL_TODAY` ⇒ the server's own sentence is on the plan, and nothing else is invented", async () => {
    const SENTENCE = "ไม่พบ Trial วันนี้ที่มาเรียนแล้ว — บันทึกว่ามาเรียนก่อน แล้วค่อยขายคอร์ส";
    salePost = () => {
      throw new TestApiError("NO_TRIAL_TODAY", SENTENCE, 409);
    };
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    await waitFor(() => expect(text()).toContain(SENTENCE));
    expect(sales()[0].body.trialAsFirstClass).toBe(true);
  });
});

describe("🔴 TASK-998 (d) — unticked, the sale is today's, byte for byte", () => {
  it("🔑 a Trial is offered but left unticked ⇒ the preview and the sale bodies equal those of a student with NO Trial", async () => {
    const run = async (answer: typeof TRIAL | null) => {
      trialAnswer = answer;
      posts.length = 0;
      const user = userEvent.setup();
      const view = mount();
      await fillBasics(user);
      await waitFor(() => expect(trialReads().length).toBeGreaterThan(0));
      if (answer) await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
      await user.click(generateBtn());
      await waitFor(() => expect(previews().length).toBe(1));
      await confirmSale(user);
      await waitFor(() => expect(sales().length).toBe(1));
      const out = { preview: JSON.stringify(previews()[0].body), sale: JSON.stringify(sales()[0].body) };
      view.unmount();
      cleanup();
      gets.length = 0;
      return out;
    };
    const withTrialUnticked = await run(TRIAL);
    const noTrial = await run(null);
    expect(withTrialUnticked.preview).toBe(noTrial.preview);
    expect(withTrialUnticked.sale).toBe(noTrial.sale);
    expect(withTrialUnticked.sale).not.toContain("trialAsFirstClass");
  });

  it("🔑 ticked then UNticked ⇒ the key is gone again, and the discount is open", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(true));
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(false));
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("trialAsFirstClass");
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(Object.keys(sales()[0].body)).not.toContain("trialAsFirstClass");
  });
});

describe("🔴 TASK-998 R1/R2 (Silver's rework) — the sale's row count, and a plan that no longer matches the tick", () => {
  const actionMenus = () => [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === dictionaries.en.plan.actionsMenu);
  /** ticks planned absence on the plan's row 1 (the server re-previews with it) */
  const declareAbsenceOnRow1 = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(actionMenus().length).toBeGreaterThan(0));
    await user.click(actionMenus()[0]);
    await waitFor(() => expect(q('[role="menuitem"]')).toBeGreaterThan(0));
    await user.click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === dictionaries.en.plan.plannedAbsence) as HTMLElement);
  };

  it("🔑 R1: tick + one planned absence ⇒ the preview has the chain (size − 1 = 5) + 1 make-up = 6 rows, and the sale sends the CHAIN only: `sessions.length === size − 1`, never the make-up as a chain row", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(tick()?.checked).toBe(true));
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    await declareAbsenceOnRow1(user);
    await waitFor(() => expect(previews().length).toBe(2));
    expect(previews()[1].body.absentWeeks).toEqual([1]);
    expect(previews()[1].body.trialAsFirstClass).toBe(true); // the re-preview carries the tick too
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(sales()[0].body.trialAsFirstClass).toBe(true);
    expect((sales()[0].body.sessions as unknown[]).length).toBe(5); // size 6 − 1; was 6 (the make-up as a 6th chain row ⇒ the server's 400)
  });

  it("🔑 R1: UNticked + one planned absence ⇒ the chain is `size` (6) rows, as before", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    await declareAbsenceOnRow1(user);
    await waitFor(() => expect(previews().length).toBe(2));
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(Object.keys(sales()[0].body)).not.toContain("trialAsFirstClass");
    expect((sales()[0].body.sessions as unknown[]).length).toBe(6);
  });

  it("🔑 R2: the tick changes AFTER the plan was generated (the Trial is gone on a re-read) ⇒ the plan is dropped and «Generate» is needed again", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    await user.click(tick() as HTMLElement);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    await waitFor(() => expect(actionMenus().length).toBeGreaterThan(0)); // the plan (phase 2) is on screen
    expect(generateBtn() === undefined).toBe(true);
    // meanwhile the Trial is gone (linked elsewhere): the next read says none, so the tick no longer applies
    trialAnswer = null;
    await qcOfMount.invalidateQueries({ queryKey: ["convertible-trial"] });
    await waitFor(() => expect(generateBtn() === undefined).toBe(false)); // back on the form
    expect(actionMenus().length).toBe(0); // no stale plan
    expect(q("[data-trial-first-class]")).toBe(0);
    expect(sales().length).toBe(0); // nothing was sold
  });
});

describe("🔴 TASK-998 Amendment 1 (D1) — the REAL amount payable with the tick", () => {
  const money = () => document.querySelector("[data-trial-money]")?.textContent ?? "";

  it("🔑 (e) ticked, list 9,790 and a Trial of 1,390 ⇒ the screen says «Amount payable 8,400» and «Trial credit −1,390», with no discount inputs", async () => {
    trialAnswer = { ...TRIAL, amountMinor: 139000 };
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    expect(q("[data-trial-money]")).toBe(0); // unticked: today's discount block, not ours
    await user.click(tick() as HTMLElement);
    await waitFor(() => expect(q("[data-trial-money]")).toBe(1));
    expect(money()).toBe("Full price 9,790 · Trial credit −1,390 · Amount payable 8,400");
    // the discount block is not on the screen at all (no input, no segmented control, no «Discount» heading)
    expect(discountInput() === null).toBe(true);
    expect(text()).not.toContain(dictionaries.en.discount.section);
    expect(text()).not.toContain("Discount −");
  });

  it("🔑 (e) the words: «Trial credit −{amount}» / «หัก Trial −{amount}»", () => {
    expect(dictionaries.en.discount.summaryTrial).toBe("Trial credit −{amount}");
    expect(dictionaries.th.discount.summaryTrial).toBe("หัก Trial −{amount}");
  });

  it("🔑 (f) UNticked ⇒ the discount block is back, with its OWN line (full price, no discount, payable = full price), and the sale is today's", async () => {
    trialAnswer = { ...TRIAL, amountMinor: 139000 };
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await waitFor(() => expect(q("[data-trial-first-class]")).toBe(1));
    expect(q("[data-trial-money]")).toBe(0);
    expect(discountInput() === null).toBe(false);
    expect(text()).toContain("Full price 9,790 · Discount −0 · Amount payable 9,790");
    // (a typed discount cannot be driven here: a NumberInput's typed text does not reach the form's state under happy-dom — the TASK-567 trap — so the discount MATH stays covered by its own tests, `discount.ts` / DiscountSection)
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    await confirmSale(user);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(Object.keys(sales()[0].body)).not.toContain("trialAsFirstClass");
    expect(Object.keys(sales()[0].body)).not.toContain("discount");
  });
});
