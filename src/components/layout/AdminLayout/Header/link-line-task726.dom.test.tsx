import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-726 (FE) — "Link LINE" from the header, actually clicked.** 📋 The words are DRAFT (`COPY-DRAFT-admin-line-link-teamB-2026-10-11.md`)
 * and are written out BY HAND below from that file, not built from the dictionary, so a drifted string fails here.
 *
 * 🔑 What this file proves, all by what is on the wire and on the screen:
 *  · **the code is asked for when the dialog OPENS and never on render** — the dialog is mounted (closed) in every page's header, so a
 *    request on mount would mint (and replace) a live code for everyone who merely loaded a page;
 *  · the dialog **shows the code (grouped) and the expiry**, and «Get a new code» posts AGAIN;
 *  · **a COACH account has NO «Link LINE» item at all**, so the server's coach refusal can never be reached from the screen;
 *  · an account that is already linked sees the linked state and no code is minted by itself;
 *  · once the code is typed in LINE and `/me` says linked, the dialog turns to the linked state by itself and drops the code;
 *  · **the code is never logged and never stored** beyond the dialog's state.
 */

const calls: Array<{ method: string; url: string }> = [];
const CODES = ["K7M2QX9P", "R4T8WZ3N", "H6C5VB2D"];
let issued = 0;
/** When set, the NEXT code request waits for this to be called (so a test can look at the screen while it is pending). */
let release: (() => void) | null = null;
let hold = false;
let me = { id: "u1", username: "som", displayName: "Som", isSuperAdmin: true, menus: [] as string[], actions: [] as string[], roleName: null as string | null, teacherId: null as string | null };
/** 🔻 TASK-725 contract change #1: "is my account linked?" is its OWN route (`GET /me/line-link`), not a field of `/me`. */
let serverLinked = false;

// 📌 the REAL client by a query-suffixed specifier: `mock.module` is global to the test process, and a plain import can hand back another file's mock
const realClient = await import("../../../../lib/api/client.ts?task726h-real");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  ApiClientError: realClient.ApiClientError,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      calls.push({ method: "GET", url });
      if (url === "/me/line-link") return { data: { lineLinked: serverLinked } };
      return { data: { user: { ...me } } };
    },
    post: async (url: string) => {
      calls.push({ method: "POST", url });
      if (hold) {
        hold = false;
        await new Promise<void>((r) => (release = r));
      }
      return { data: { code: CODES[issued++ % CODES.length], expiresAt: "2026-10-11T10:10:00.000Z", expiresInSeconds: 600 } };
    },
  },
}));
const realAuth = await import("next-auth/react");
mock.module("next-auth/react", () => ({
  ...realAuth,
  useSession: () => ({ data: { user: { id: me.id, username: me.username, displayName: me.displayName, isSuperAdmin: me.isSuperAdmin, menus: [], actions: [], teacherId: me.teacherId } }, status: "authenticated" }),
}));
const realNav = await import("next/navigation");
mock.module("next/navigation", () => ({ ...realNav, usePathname: () => "/scheduler" }));

const Header = (await import("./Header")).default;

const posts = () => calls.filter((c) => c.method === "POST" && c.url === "/me/line-link-code");
const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(Header, { collapsed: false, onToggleCollapse: () => {}, onOpenMobile: () => {} })))) as never);
};
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByLabelText("Account"));
};
const linkItem = () => document.querySelector("[data-link-line-item]") as HTMLElement | null;
const codeText = () => (document.querySelector("[data-link-line-code]")?.textContent ?? "").trim();
const dialogText = () => (document.querySelector("[data-link-line-dialog]")?.textContent ?? "") + (document.querySelector("[role=dialog]")?.textContent ?? "");

const logged: string[] = [];
const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
beforeEach(() => {
  calls.length = 0;
  issued = 0;
  hold = false;
  release = null;
  logged.length = 0;
  me = { id: "u1", username: "som", displayName: "Som", isSuperAdmin: true, menus: [], actions: [], roleName: null, teacherId: null };
  serverLinked = false;
  window.localStorage.removeItem("ss.lang");
  for (const k of Object.keys(realConsole) as Array<keyof typeof realConsole>) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
});
afterEach(() => {
  cleanup();
  Object.assign(console, realConsole);
});

describe("🔴 TASK-726 — the header's «Link LINE»", () => {
  it("🔑 nothing is requested on render: loading a page does not mint a code", async () => {
    mount();
    await screen.findByLabelText("Account");
    await waitFor(() => expect(calls.some((c) => c.url === "/me")).toBe(true));
    expect(posts().length).toBe(0);
    expect(calls.some((c) => c.url === "/me/line-link")).toBe(false); // the shell reads `/me`; the link answer is read only where the dialog needs it
  });

  it("🔑 the item opens the dialog; it posts ONCE; the code shows grouped with the expiry; «Get a new code» posts again", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    const item = await waitFor(() => {
      const el = linkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    });
    expect(item.textContent).toContain("Link LINE");
    await user.click(item);

    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    expect(posts().length).toBe(1);
    const text = dialogText();
    expect(text).toContain("Link LINE to this account");
    expect(text).toContain('Open the shop\'s LINE chat, type "สมัคร" → "แอดมิน", then type this code');
    expect(text).toContain("One use only. Expires in 10 minutes.");

    await user.click(document.querySelector("[data-link-line-new]") as HTMLElement);
    await waitFor(() => expect(codeText()).toBe("R4T8-WZ3N"));
    expect(posts().length).toBe(2);
  });

  it("TH · the same dialog says the drafted Thai words, with the minutes from the server's seconds", async () => {
    window.localStorage.setItem("ss.lang", "th");
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByLabelText("บัญชีผู้ใช้"));
    const item = await waitFor(() => {
      const el = linkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    });
    expect(item.textContent).toContain("ผูก LINE");
    await user.click(item);
    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    const text = dialogText();
    expect(text).toContain("ผูก LINE กับบัญชีนี้");
    expect(text).toContain('เปิดแชท LINE ของร้าน พิมพ์ "สมัคร" → "แอดมิน" แล้วพิมพ์รหัสนี้');
    expect(text).toContain("รหัสใช้ได้ครั้งเดียว หมดอายุใน 10 นาที");
    expect(text).toContain("ขอรหัสใหม่");
  });

  it("🔴 a COACH account (`/me` → teacherId set) has NO «Link LINE» item at all, and nothing is ever requested", async () => {
    me = { ...me, teacherId: "t-bim", isSuperAdmin: false };
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    // the menu is open (the other items are there) and the item is simply absent
    await screen.findByText("Change password");
    expect(!linkItem()).toBe(true);
    expect(screen.queryAllByText("Link LINE").length).toBe(0);
    expect(posts().length).toBe(0);
  });

  it("an account that is ALREADY linked opens on the linked state and mints no code by itself; «Get a new code» is still there", async () => {
    serverLinked = true;
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(calls.some((c) => c.url === "/me")).toBe(true));
    await openMenu(user);
    await user.click(await waitFor(() => {
      const el = linkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));
    await waitFor(() => expect(dialogText()).toContain("LINE linked ✅ This account gets the admin notices"));
    expect(posts().length).toBe(0);
    expect(codeText()).toBe("");
    await user.click(document.querySelector("[data-link-line-new]") as HTMLElement);
    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    expect(posts().length).toBe(1);
  });

  it("🔑 once the code is typed in LINE and `/me` says linked, the dialog turns to the linked state by itself and the code is gone", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    await user.click(await waitFor(() => {
      const el = linkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));
    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    serverLinked = true; // the person typed the code in the shop's LINE chat
    await waitFor(() => expect(dialogText()).toContain("LINE linked ✅ This account gets the admin notices"), { timeout: 8000 });
    expect(codeText()).toBe("");
    expect(posts().length).toBe(1);
  }, 12000);

  it("🔴 the code is never logged and never stored: not in the console, not in local/session storage, and gone from the page once the dialog closes", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);
    await user.click(await waitFor(() => {
      const el = linkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));
    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    const ls = JSON.stringify({ ...window.localStorage });
    const ss = JSON.stringify({ ...window.sessionStorage });
    expect(ls.includes("K7M2") || ls.includes("QX9P")).toBe(false);
    expect(ss.includes("K7M2") || ss.includes("QX9P")).toBe(false);
    expect(logged.some((l) => l.includes("K7M2") || l.includes("QX9P"))).toBe(false);
    // close with Escape: the dialog's state is cleared, so the code is not in the page any more
    await user.keyboard("{Escape}");
    await waitFor(() => expect((document.body.textContent ?? "").includes("K7M2")).toBe(false));
  });

it("🔴 closing the dialog forgets the code: reopening shows NO old code while the new one is on its way (the old one stopped working)", async () => {
    const user = userEvent.setup();
    mount();
    const openDialog = async () => {
      await openMenu(user);
      await user.click(await waitFor(() => {
        const el = linkItem();
        expect(!el).toBe(false);
        return el as HTMLElement;
      }));
    };
    await openDialog();
    await waitFor(() => expect(codeText()).toBe("K7M2-QX9P"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(codeText()).toBe(""));

    hold = true; // the second request is slow
    await openDialog();
    await waitFor(() => expect(posts().length).toBe(2));
    expect(codeText()).toBe(""); // not the first code, not any code, until the server answers
    release?.();
    await waitFor(() => expect(codeText()).toBe("R4T8-WZ3N"));
  });
});
