import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-726 (FE) — the old "LINE accounts with admin rights" panel after TASK-725: a linked account is named by its WEB user, a legacy one
 * is marked, and Remove still works for both.** 📋 The mark's words are DRAFT (`COPY-DRAFT-admin-line-link-teamB-2026-10-11.md`), written out by hand.
 *
 * 🔑 Each case is read off the rows on screen. 🚫 The payload carries a raw LINE id on purpose; no page may show it.
 */

const RAW_LINE_ID = "Ufe3a91c0d5b2487e9a6c1d0f2b7e8a43";
const deletes: string[] = [];

const ADMINS = {
  admins: [
    { ref: "aaaaaaaaaaaaaaaa", idTail: "…8f21", kind: "linked", userId: "u-bee", displayName: "Bee Somsri", username: "bee", disabled: false, alsoTeacher: null, alsoParent: null, afterRemoval: "visitor-menu", lineUserId: RAW_LINE_ID },
    { ref: "bbbbbbbbbbbbbbbb", idTail: "…4c7d", kind: "legacy", userId: null, displayName: null, username: null, disabled: false, alsoTeacher: "บีม", alsoParent: null, afterRemoval: "teacher-menu", lineUserId: RAW_LINE_ID },
    { ref: "cccccccccccccccc", idTail: "…9a0e", kind: "legacy", userId: null, displayName: null, username: null, disabled: false, alsoTeacher: null, alsoParent: null, afterRemoval: "visitor-menu", lineUserId: RAW_LINE_ID },
  ],
  notKnown: [],
};

const REAL = "../../../lib/api/client.ts?task726p-real";
const real = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...real,
  ApiClientError: real.ApiClientError,
  useMockData: false,
  api: {
    ...real.api,
    get: async () => ({ data: ADMINS }),
    delete: async (url: string) => {
      deletes.push(url);
      return { data: { removed: { ref: "x", idTail: "…8f21" }, afterRemoval: "visitor-menu", menuSettled: true } };
    },
  },
}));
const realAuth = await import("next-auth/react");
mock.module("next-auth/react", () => ({ ...realAuth, useSession: () => ({ data: { user: { isSuperAdmin: true } }, status: "authenticated" }) }));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));

const LineAdminsPanel = (await import("./LineAdminsPanel")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(LineAdminsPanel, null)))) as never);
};
const rowWith = (needle: string) => {
  const btn = [...document.querySelectorAll("[data-line-admin-remove]")].find((b) => b.parentElement?.textContent?.includes(needle));
  return btn?.parentElement as HTMLElement;
};
const MARK = "Linked with the old code (name unknown)";

beforeEach(() => {
  deletes.length = 0;
  window.localStorage.removeItem("ss.lang");
});
afterEach(cleanup);

describe("🔴 TASK-726 — the old panel after the link moved to the web user", () => {
  it("🔑 a LINKED account is named by its web user (name + username), never 'Unknown account', and carries no legacy mark", async () => {
    mount();
    await screen.findByText("Bee Somsri");
    const row = rowWith("Bee Somsri");
    expect(row.textContent).toContain("bee");
    expect(row.textContent).not.toContain("Unknown account");
    expect(row.textContent).not.toContain(MARK);
    expect(!row.querySelector("[data-line-admin-legacy]")).toBe(true);
  });

  it("🔑 a LEGACY account is MARKED «Linked with the old code (name unknown)» — the named-by-coach one and the unnameable one alike", async () => {
    mount();
    await screen.findByText("Also the coach บีม");
    for (const needle of ["Also the coach บีม", "Unknown account"]) {
      const row = rowWith(needle);
      expect(row.querySelector("[data-line-admin-legacy]")?.textContent).toBe(MARK);
    }
    expect(document.querySelectorAll("[data-line-admin-legacy]").length).toBe(2);
    // the old labels are unchanged for them
    expect(rowWith("Unknown account").textContent).toContain("Unknown account");
  });

  it("TH · the drafted mark", async () => {
    window.localStorage.setItem("ss.lang", "th");
    mount();
    await waitFor(() => expect(document.querySelectorAll("[data-line-admin-legacy]").length).toBe(2));
    await waitFor(() => expect(document.querySelector("[data-line-admin-legacy]")?.textContent).toBe("ผูกด้วยรหัสเดิม (ไม่ทราบชื่อ)"));
  });

  it("🔴 Remove still works for a LINKED row: confirm → `DELETE /users/line-admins/<ref>` once", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Bee Somsri");
    await user.click(rowWith("Bee Somsri").querySelector("[data-line-admin-remove]") as HTMLElement);
    expect(deletes).toEqual([]);
    await user.click(await waitFor(() => {
      const b = document.querySelector("[data-line-admin-confirm]");
      expect(!b).toBe(false);
      return b as HTMLElement;
    }));
    await waitFor(() => expect(deletes.length).toBe(1));
    expect(deletes).toEqual(["/users/line-admins/aaaaaaaaaaaaaaaa"]);
  });

  it("🚫 no raw LINE id is rendered, although every entry in the payload carries one", async () => {
    mount();
    await screen.findByText("Bee Somsri");
    expect(document.body.innerHTML.includes(RAW_LINE_ID)).toBe(false);
    expect(document.body.innerHTML.includes("Ufe3a9")).toBe(false);
    // what the page may show of an account is the old opaque tail
    expect(document.body.textContent).toContain("id ends …8f21");
  });
});
