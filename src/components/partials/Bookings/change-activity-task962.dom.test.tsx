import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { currentActivityOf } from "./ChangeActivityDialog";

/**
 * 🔴 **TASK-962 (REQ-5014, SPEC-106 § 7) — «เปลี่ยนกิจกรรม»: the rest of a course (or ONE 1 HR / Trial) moves to another activity.**
 *
 * 🔑 Every assertion is a request or a string. What can go wrong without anyone seeing it: a typed-price field on a card that HAS a price (or on a 1 HR / Trial, which never has one),
 * a number counted on the client instead of read from the server's preview, a refusal swallowed or shown as a raw code, a confirm pressed before the server answered for THESE inputs.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let answer: Record<string, unknown> = {};
/** When set, the preview answers from the REQUEST like the real server does (a typed price comes back as `newPriceMinor` + `priceSource: MANUAL`). */
let answerFn: ((body: Record<string, unknown>) => Record<string, unknown>) | null = null;
let actFails: { code: string; message: string; status: number } | null = null;
let previewFails: { code: string; message: string; status: number } | null = null;
let closes = 0;
let dones = 0;

class TestApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const CARD = {
  vatInclusive: true,
  packages: [
    { priceGroup: "g1", size: 10, externalRef: "course-10-g1", priceMinor: 100000, subjects: [{ id: "s-bal", name: "Balance" }, { id: "s-skate", name: "Skate" }] },
    { priceGroup: "g2", size: 1, externalRef: "1-g2", priceMinor: 10000, subjects: [{ id: "s-surf", name: "Surf" }, { id: "s-skate", name: "Skate" }] },
  ],
  unpricedSubjects: [{ id: "s-none", name: "NoGroup" }],
  voucherAllowedGroups: [],
  rentalItems: [],
  voucherItems: [],
  firstTrialPriceMinor: 0,
};

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  ApiClientError: TestApiError,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: [], roleName: null, teacherId: null } } };
      if (url === "/sellable-packages") return { data: CARD };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url.endsWith("/preview")) {
        if (previewFails) throw new TestApiError(previewFails.code, previewFails.message, previewFails.status);
        return { data: answerFn ? answerFn(body) : answer };
      }
      if (actFails) throw new TestApiError(actFails.code, actFails.message, actFails.status);
      return { data: { ...answer, changeId: "ch1" } };
    },
  },
}));

const ChangeActivityDialog = (await import("./ChangeActivityDialog")).default;
const { parseManualPrice } = await import("./ChangeActivityDialog");

const base = (over: Record<string, unknown> = {}) => ({
  remaining: 4,
  firstDate: "2026-11-17",
  lastDate: "2026-12-08",
  from: { subjectId: "s-bal", subjectName: "Balance" },
  to: { subjectId: "s-skate", subjectName: "Skate" },
  teacherChanged: false,
  oldPriceMinor: 10000,
  newPriceMinor: 12000,
  priceSource: "CARD",
  differenceMinor: 800,
  ...over,
});

const mount = (target: "course" | "booking" = "course", lang: "en" | "th" = "en", currentOver?: { id?: string; name?: string }) => {
  window.localStorage.setItem("t962-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: [], role: "admin", teacherId: null };
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t962-lang" }, h(SessionProvider, { session: { user, expires: "2999-01-01" } as never },
      h(ChangeActivityDialog, {
        opened: true,
        target,
        id: target === "course" ? "c1" : "b1",
        current: currentOver ?? (target === "course" ? { id: "s-bal", name: "Balance" } : { name: "Balance" }),
        currentTeacherId: "t-kid",
        program: currentOver?.name ?? "Balance",
        student: "Beam",
        onClose: () => { closes++; },
        onDone: () => { dones++; },
      }),
    )))) as never,
  );
};
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const btn = (text: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;
const previews = () => posts.filter((p) => p.url.endsWith("/preview"));
const acts = () => posts.filter((p) => !p.url.endsWith("/preview"));
const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? "").trim());

const pick = async (name: string) => {
  const user = userEvent.setup();
  await user.click(q("[data-change-activity-subject]")!);
  await waitFor(() => expect(options().length).toBeGreaterThan(0));
  await user.click([...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent ?? "").trim() === name) as HTMLElement);
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  posts.length = 0;
  answer = base();
  answerFn = null;
  actFails = null;
  previewFails = null;
  closes = 0;
  dones = 0;
});

describe("🔴 the list of activities", () => {
  it("🔑 every priced subject of the card, WITHOUT the current one and WITHOUT the unpriced ones", async () => {
    mount();
    const user = userEvent.setup();
    await user.click(q("[data-change-activity-subject]")!);
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(options().sort()).toEqual(["Skate", "Surf"]); // Balance = current · NoGroup = unpriced
  });
  it("a booking (name only) leaves its current activity out by NAME", async () => {
    mount("booking");
    const user = userEvent.setup();
    await user.click(q("[data-change-activity-subject]")!);
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(options()).not.toContain("Balance");
  });
});

describe("🔴 the preview", () => {
  it("🔑 asks the SERVER (the course route) with the subject only; remaining / first date / the difference are the server's — nothing counted here", async () => {
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(previews()[0].url).toBe("/courses/c1/change-activity/preview");
    expect(previews()[0].body).toEqual({ subjectId: "s-skate" }); // the coach is unchanged ⇒ the key is NOT sent
    expect(q("[data-change-line]")!.textContent).toBe("Change 4 classes from 17/Nov/26");
    expect(q("[data-change-price]")!.textContent).toBe("100 ฿ → 120 ฿");
    expect(q("[data-change-difference]")!.textContent).toBe("Add 8 ฿");
    expect(document.body.textContent).toContain("Classes already taught don't change");
    expect(acts().length).toBe(0); // the preview wrote nothing
  });

  it("🔑 cheaper ⇒ «0 ฿ · no refund», never a negative number", async () => {
    answer = base({ newPriceMinor: 8000, differenceMinor: 0 });
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-difference]")).toBeTruthy());
    expect(q("[data-change-difference]")!.textContent).toBe("0 ฿ · no refund");
  });

  it("TH: the SPEC's words", async () => {
    mount("course", "th");
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-change-line]")!.textContent).toBe("เปลี่ยน 4 คาบ ตั้งแต่ 17/Nov/26");
    expect(q("[data-change-difference]")!.textContent).toBe("จ่ายเพิ่ม 8 ฿");
    expect(document.body.textContent).toContain("คาบที่เรียนไปแล้วไม่เปลี่ยน");
    expect(dictionaries.th.changeActivity.noRefund).toBe("0 ฿ · ไม่มีการคืนเงิน");
    expect(dictionaries.th.changeActivity.typedTag).toBe("ราคาพิมพ์เอง");
  });

  it("🔑 the confirm WAITS for the server's answer to THESE inputs", async () => {
    mount();
    expect(btn("Confirm")!.disabled).toBe(true); // nothing chosen
    await pick("Skate");
    expect(btn("Confirm")!.disabled).toBe(true); // the debounce / dry run has not answered yet
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
  });
});

describe("🔴 the typed price", () => {
  it("🔑 NOT shown when the card has a price", async () => {
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-manual-price]")).toBeNull();
  });

  it("🔑 shown ONLY on `newPriceMinor: null`; the confirm waits for a valid typed price, the re-preview carries it, and the act sends it", async () => {
    answer = base({ newPriceMinor: null, priceSource: null, differenceMinor: null });
    const user = userEvent.setup();
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-manual-price]")).toBeTruthy());
    expect(btn("Confirm")!.disabled).toBe(true); // no price yet
    expect(q("[data-change-difference]")).toBeNull(); // a null difference is not drawn

    answer = base({ newPriceMinor: null, priceSource: "MANUAL", differenceMinor: 1500 });
    await user.type(q("[data-manual-price]") as HTMLInputElement, "4500");
    await waitFor(() => expect(previews().some((p) => p.body.manualPriceBaht === 4500)).toBe(true));
    await waitFor(() => expect(q("[data-change-difference]")).toBeTruthy());
    expect(q("[data-change-price]")!.textContent).toContain("100 ฿ → 4,500 ฿");
    expect(q("[data-change-price]")!.textContent).toContain("typed price");
    expect(q("[data-change-difference]")!.textContent).toBe("Add 15 ฿");
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));

    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(acts().length).toBe(1));
    expect(acts()[0].url).toBe("/courses/c1/change-activity");
    expect(acts()[0].body).toEqual({ subjectId: "s-skate", manualPriceBaht: 4500 });
  });

  it("🔴 D-157-1 — a typed price does NOT loop the preview: exactly ONE extra request, which carries the price, and it STAYS; the real server's answer turns Confirm on", async () => {
    // the REAL server's behaviour: no typed price ⇒ not on the card (null); a typed price ⇒ it is echoed back as the new price, MANUAL
    answerFn = (b) =>
      b.manualPriceBaht === undefined
        ? base({ oldPriceMinor: 479000, newPriceMinor: null, priceSource: null, differenceMinor: null })
        : base({ oldPriceMinor: 479000, newPriceMinor: (b.manualPriceBaht as number) * 100, priceSource: "MANUAL", differenceMinor: 53300 });
    const user = userEvent.setup();
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-manual-price]")).toBeTruthy());
    expect(previews().length).toBe(1);
    await user.type(q("[data-manual-price]") as HTMLInputElement, "5500");
    await waitFor(() => expect(previews().length).toBe(2), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 1200)); // well past the debounce: a loop would have fired again by now
    expect(previews().length).toBe(2);
    expect(previews()[1].body).toEqual({ subjectId: "s-skate", manualPriceBaht: 5500 });
    expect(q("[data-manual-price]")).toBeTruthy(); // the field stays
    expect(q("[data-change-price]")!.textContent).toBe("4,790 ฿ → 5,500 ฿ · typed price");
    expect(q("[data-change-difference]")!.textContent).toBe("Add 533 ฿");
    expect(btn("Confirm")!.disabled).toBe(false);
  });

  it("an out-of-range typed price (0, 100001) says why and keeps the confirm off; nothing is sent for it", async () => {
    answer = base({ newPriceMinor: null, priceSource: null, differenceMinor: null });
    const user = userEvent.setup();
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-manual-price]")).toBeTruthy());
    const before = previews().length;
    await user.type(q("[data-manual-price]") as HTMLInputElement, "100001");
    await waitFor(() => expect(document.body.textContent).toContain(dictionaries.en.changeActivity.err.MANUAL_PRICE_RANGE));
    expect(btn("Confirm")!.disabled).toBe(true);
    expect(previews().length).toBe(before); // an invalid price is never asked
    expect(previews().some((p) => "manualPriceBaht" in p.body)).toBe(false);
  });

  it("🔑 a 1 HR / Trial has NO price input even if the answer were null, and its routes are the booking's", async () => {
    answer = base({ remaining: 1, newPriceMinor: null, priceSource: null, differenceMinor: null });
    mount("booking");
    await pick("Skate");
    await waitFor(() => expect(previews().length).toBeGreaterThan(0));
    expect(previews()[0].url).toBe("/bookings/b1/change-activity/preview");
    expect(q("[data-manual-price]")).toBeNull();
    answer = base({ remaining: 1, newPriceMinor: 12000, differenceMinor: 2000 });
    await pick("Surf");
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    const user = userEvent.setup();
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(acts().length).toBe(1));
    expect(acts()[0].url).toBe("/bookings/b1/change-activity");
    expect(Object.keys(acts()[0].body)).toEqual(["subjectId"]);
  });

  it("parseManualPrice: whole baht 1..100000 only", () => {
    expect(parseManualPrice(1)).toBe(1);
    expect(parseManualPrice("100000")).toBe(100000);
    for (const bad of [0, -5, 100001, 12.5, "", "abc"]) expect(parseManualPrice(bad)).toBeNull();
  });
});

describe("🔴 the act", () => {
  it("a difference above 0 ⇒ the success state names the amount and WHERE to record it; the dialog stays until Close", async () => {
    const user = userEvent.setup();
    mount();
    await pick("Skate");
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(q("[data-change-activity-record]")).toBeTruthy());
    expect(q("[data-change-activity-record]")!.textContent).toBe('Record the difference of 8 ฿ at Add Manually (back office), reason "ส่วนต่างเปลี่ยนกิจกรรม"');
    expect(closes).toBe(0);
    await user.click(btn("Close") as HTMLElement);
    expect(closes).toBe(1);
    expect(dones).toBe(1);
    expect(dictionaries.th.changeActivity.recordDifference).toBe('บันทึกส่วนต่าง {x} ฿ ที่ Add Manually (หลังบ้าน) เหตุผล "ส่วนต่างเปลี่ยนกิจกรรม"');
  });

  describe("🔴 the Add Manually link (SPEC-107 § 3)", () => {
    const prev = process.env.NEXT_PUBLIC_BACKOFFICE_URL;
    afterEach(() => {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_BACKOFFICE_URL;
      else process.env.NEXT_PUBLIC_BACKOFFICE_URL = prev;
    });
    const confirmAct = async (target: "course" | "booking") => {
      const user = userEvent.setup();
      mount(target);
      await pick("Skate");
      await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
      await user.click(btn("Confirm") as HTMLElement);
      await waitFor(() => expect(q("[data-change-activity-record]")).toBeTruthy());
    };
    it("🔑 SET + course + difference > 0 ⇒ the link with EXACTLY courseId, amountMinor (satang), reason; the text stays", async () => {
      process.env.NEXT_PUBLIC_BACKOFFICE_URL = "https://bo.example/";
      await confirmAct("course");
      expect(q("[data-change-activity-link]")!.getAttribute("href")).toBe("https://bo.example/revenue/manual?courseId=c1&amountMinor=800&reason=activity-change");
      expect(q("[data-change-activity-link]")!.textContent).toBe("Open Add Manually");
      expect(q("[data-change-activity-record]")!.textContent).toContain("8 ฿");
      expect(dictionaries.th.changeActivity.openAddManually).toBe("เปิด Add Manually");
    });
    it("🔑 UNSET ⇒ no link, the text alone", async () => {
      delete process.env.NEXT_PUBLIC_BACKOFFICE_URL;
      await confirmAct("course");
      expect(document.querySelectorAll("[data-change-activity-link]").length).toBe(0);
    });
    it("🔑 a 1 HR / Trial ⇒ text only, even when the address is set", async () => {
      process.env.NEXT_PUBLIC_BACKOFFICE_URL = "https://bo.example";
      await confirmAct("booking");
      expect(document.querySelectorAll("[data-change-activity-link]").length).toBe(0);
    });
  });

  it("a difference of 0 ⇒ no recording to do: it closes at once", async () => {
    answer = base({ newPriceMinor: 8000, differenceMinor: 0 });
    const user = userEvent.setup();
    mount();
    await pick("Skate");
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(closes).toBe(1));
    expect(dones).toBe(1);
    expect(q("[data-change-activity-record]")).toBeNull();
  });

  it("a new coach is sent ONLY when it differs from the current one", async () => {
    mount();
    await pick("Skate");
    await waitFor(() => expect(previews().length).toBeGreaterThan(0));
    expect(previews().every((p) => !("teacherId" in p.body))).toBe(true);
  });
});

describe("🔴 every refusal has its Thai sentence; an unknown code shows the server's own message", () => {
  const CODES = [
    "SAME_ACTIVITY",
    "MANUAL_PRICE_NOT_ALLOWED",
    "MANUAL_PRICE_REQUIRED",
    "MANUAL_PRICE_RANGE",
    "NO_REMAINING_CLASSES",
    "COURSE_ENDED",
    "COURSE_PAUSED",
    "COURSE_DROPPED",
    "OLD_PRICE_NOT_ON_CARD",
    "NOT_LIVE_BOOKING",
    "GROUP_COURSE",
    "SLOT_TAKEN",
    "NOT_SINGLE_OR_TRIAL",
    "ALREADY_DELIVERED",
    "NO_PRICE_GROUP",
  ] as const;

  for (const code of CODES) {
    it(`${code}: the act's refusal shows its sentence (th) and keeps the dialog open`, async () => {
      actFails = { code, message: "raw server text 17 Nov", status: 409 };
      const user = userEvent.setup();
      mount("course", "th");
      await pick("Skate");
      await waitFor(() => expect(btn("ยืนยัน")!.disabled).toBe(false));
      await user.click(btn("ยืนยัน") as HTMLElement);
      await waitFor(() => expect(q("[data-change-activity-error]")).toBeTruthy());
      const shown = q("[data-change-activity-error]")!.textContent ?? "";
      const expected = dictionaries.th.changeActivity.err[code].replace("{detail}", "raw server text 17 Nov");
      expect(shown).toBe(expected);
      if (code !== "SLOT_TAKEN") expect(shown).not.toContain("raw server text");
      expect(closes).toBe(0);
    });
  }

  it("a refusal on the PREVIEW is shown the same way (and no confirm)", async () => {
    previewFails = { code: "COURSE_ENDED", message: "x", status: 409 };
    mount("course", "th");
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-activity-error]")).toBeTruthy());
    expect(q("[data-change-activity-error]")!.textContent).toBe(dictionaries.th.changeActivity.err.COURSE_ENDED);
    expect(btn("ยืนยัน")!.disabled).toBe(true);
  });

  it("an UNKNOWN code shows the server's message, never a bare code", async () => {
    actFails = { code: "SOMETHING_NEW", message: "ข้อความจากเซิร์ฟเวอร์", status: 409 };
    const user = userEvent.setup();
    mount("course", "th");
    await pick("Skate");
    await waitFor(() => expect(btn("ยืนยัน")!.disabled).toBe(false));
    await user.click(btn("ยืนยัน") as HTMLElement);
    await waitFor(() => expect(q("[data-change-activity-error]")).toBeTruthy());
    expect(q("[data-change-activity-error]")!.textContent).toBe("ข้อความจากเซิร์ฟเวอร์");
  });

  it("EN and TH carry the same fifteen codes", () => {
    expect(Object.keys(dictionaries.en.changeActivity.err).sort()).toEqual([...CODES].sort());
    expect(Object.keys(dictionaries.th.changeActivity.err).sort()).toEqual([...CODES].sort());
  });
});

describe("🔴 D-157-2 — the CURRENT activity is the remaining rows', not the first row's", () => {
  const row = (date: string, status: string, id: string, name: string, bookingType = "COURSE_PACKAGE") => ({ date, status, bookingType, subject: { id, name } });
  const TODAY = "2026-11-13";
  const CHANGED = [
    row("2026-10-20", "ATTENDED", "s-bal", "Balance"), // the OLD activity, already taught
    row("2026-10-27", "ATTENDED", "s-bal", "Balance"),
    row("2026-11-17", "CONFIRMED", "s-skate", "Skate"), // the remaining rows carry the NEW one
    row("2026-11-24", "PENDING", "s-skate", "Skate"),
  ];
  it("🔑 an attended old-activity row first, later rows on the new one ⇒ the new one", () => {
    expect(currentActivityOf(CHANGED, TODAY)).toEqual({ id: "s-skate", name: "Skate" });
  });
  it("no change ⇒ today's result (the first row's activity)", () => {
    expect(currentActivityOf([row("2026-11-17", "CONFIRMED", "s-bal", "Balance"), row("2026-11-24", "PENDING", "s-bal", "Balance")], TODAY)).toEqual({ id: "s-bal", name: "Balance" });
  });
  it("nothing remaining ⇒ the LAST course row; extras (SINGLE_SESSION) never decide", () => {
    expect(currentActivityOf([row("2026-10-20", "ATTENDED", "s-bal", "Balance"), row("2026-10-27", "ATTENDED", "s-skate", "Skate"), row("2026-11-20", "CONFIRMED", "s-surf", "Surf", "SINGLE_SESSION")], TODAY)).toEqual({ id: "s-skate", name: "Skate" });
    expect(currentActivityOf([], TODAY)).toBeNull();
  });
  it("🔑 the dialog fed that value: header = the NEW activity, the OLD one is offered, the new one is left out", async () => {
    mount("course", "en", currentActivityOf(CHANGED, TODAY)!);
    expect(document.body.textContent).toContain("Skate · Beam");
    const user = userEvent.setup();
    await user.click(q("[data-change-activity-subject]")!);
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(options().sort()).toEqual(["Balance", "Surf"]);
  });
});

describe("🔴 the plural of the preview line (EN)", () => {
  it("1 class ⇒ «class», 4 ⇒ «classes»; TH the same sentence for both", async () => {
    answer = base({ remaining: 1 });
    mount();
    await pick("Skate");
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-change-line]")!.textContent).toBe("Change 1 class from 17/Nov/26");
    expect(dictionaries.th.changeActivity.previewLineOne).toBe(dictionaries.th.changeActivity.previewLine);
  });
});
