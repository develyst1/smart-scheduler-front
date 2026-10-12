import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-733 (FE) ← TASK-732 (BE) — the voucher SALE form gains ONE optional note box, and what is typed there reaches the request.**
 *
 * 🔑 Clicked, and read at the WIRE: the whole risk of a new form field is a box that looks saved while its value never leaves the screen
 * (TASK-320 sat for weeks that way). So the sale is pressed and the `POST /vouchers` BODY is what is asserted, after JSON serialisation (what the
 * server actually receives): a typed note travels · an empty or blank one puts NO `note` key on the wire · the label is the approved
 * "Note (optional)" / "หมายเหตุ (ไม่บังคับ)" (no new word) · the server's limit of 200 is on the box.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

const REAL = "../../../lib/api/client.ts?task733-real";
const real = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...real,
  ApiClientError: real.ApiClientError,
  useMockData: false,
  api: {
    ...real.api,
    get: async () => ({ data: {} }),
    post: async (url: string, body: unknown) => {
      // what the server receives: JSON drops `undefined`
      posts.push({ url, body: JSON.parse(JSON.stringify(body)) });
      return {
        data: {
          voucher: { id: "v1", student: { name: "น้องเก่า" }, totalHours: 10, remaining: 10, expiryDate: "2027-04-12" },
        },
      };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useStudentSearch: () => ({
    data: [{ id: "s-old", name: "น้องเก่า", label: "น้องเก่า · 0811111111", phone: null }],
    isFetching: false,
  }),
  useSellablePackages: () => ({ data: { voucherItems: [{ hours: 10, priceMinor: 500000 }] } }),
}));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));

const CreateVoucherModal = (await import("./CreateVoucherModal")).default;

const en = dictionaries.en;
const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(CreateVoucherModal, { opened: true, onClose: () => {} })))) as never);
};
const noteBox = () => document.querySelector("textarea[data-voucher-note]") as HTMLTextAreaElement;
const pickStudent = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByPlaceholderText(en.student.searchPlaceholder), "น้อง");
  await user.click(await screen.findByText("น้องเก่า · 0811111111"));
};
const sell = async (user: ReturnType<typeof userEvent.setup>) => {
  const btn = await waitFor(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent === en.voucher.issueBtn) as HTMLButtonElement | undefined;
    expect(!b).toBe(false);
    expect(b!.disabled).toBe(false);
    return b as HTMLButtonElement;
  });
  await user.click(btn);
  await waitFor(() => expect(posts.length).toBe(1));
  return posts[0];
};

beforeEach(() => {
  posts.length = 0;
  window.localStorage.removeItem("ss.lang");
});
// 📌 the TH test leaves `ss.lang` set; the NEXT file would then render Thai (it cost 4 reds in other files the first time)
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("ss.lang");
});

describe("🔴 TASK-733 — the voucher sale note", () => {
  it("🔑 a typed note travels on `POST /vouchers` (trimmed), next to the rest of the sale", async () => {
    const user = userEvent.setup();
    mount();
    await pickStudent(user);
    await user.type(noteBox(), "  paid by transfer, slip on LINE  ");
    const sent = await sell(user);
    expect(sent.url).toBe("/vouchers");
    expect(sent.body.note).toBe("paid by transfer, slip on LINE");
    // the sale itself is still the sale
    expect(sent.body.totalHours).toBe(10);
    expect((sent.body.student as { id: string }).id).toBe("s-old");
  });

  it("🔑 NO note typed ⇒ NO `note` key on the wire", async () => {
    const user = userEvent.setup();
    mount();
    await pickStudent(user);
    const sent = await sell(user);
    expect("note" in sent.body).toBe(false);
  });

  it("a note of only spaces is not a note: no `note` key", async () => {
    const user = userEvent.setup();
    mount();
    await pickStudent(user);
    await user.type(noteBox(), "     ");
    const sent = await sell(user);
    expect("note" in sent.body).toBe(false);
  });

  it("the label is the APPROVED words (EN, then TH) and the server's limit of 200 is on the box", async () => {
    mount();
    await screen.findByPlaceholderText(en.student.searchPlaceholder);
    expect(noteBox().closest("div")?.parentElement?.textContent).toContain("Note (optional)");
    expect(noteBox().getAttribute("maxlength")).toBe("200");
    cleanup();

    window.localStorage.setItem("ss.lang", "th");
    mount();
    await waitFor(() => expect(noteBox().closest("div")?.parentElement?.textContent).toContain("หมายเหตุ (ไม่บังคับ)"));
  });
});
