import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-726 (FE) — the Users page's LINE column and «Unlink LINE», actually clicked.** The words are ✅ APPROVED by the owner 2026-10-11 — COPY-REVIEW-2026-09-29.md:599
 * (source: `COPY-DRAFT-admin-line-link-teamB-2026-10-11.md`), written out BY HAND from that file.
 *
 * 🔑 Proved on the wire and on the row: the column says Linked / Not linked from the server's `lineLinked`; Unlink is OFFERED only on a linked row;
 * it goes through the confirm FIRST (nothing is sent until the person confirms) and then sends `DELETE /users/:id/line-link` ONCE; the row
 * says "Not linked" only when the server's re-read says so (no optimistic flip: a refusal leaves it Linked and says the server's sentence);
 * and 🚫 **no LINE id is rendered** — the payload below carries one on purpose, and it must not reach the page.
 */

const RAW_LINE_ID = "Ufe3a91c0d5b2487e9a6c1d0f2b7e8a43";
const calls: Array<{ method: string; url: string }> = [];
let linked = new Set<string>(["u-bee"]);
let refuseWith: Error | null = null;
const notes: Array<{ title: string; color?: string }> = [];

const user = (id: string, username: string, displayName: string) => ({
  id,
  username,
  displayName,
  isSuperAdmin: false,
  disabledAt: null,
  createdAt: "2026-09-17T00:00:00.000Z",
  menus: [],
  actions: [],
  roleId: null,
  roleName: null,
  grants: { fromRole: [], own: [] },
  teacherId: null,
  teacherName: null,
});
const rows = () => [user("u-bee", "bee", "Bee"), user("u-cat", "cat", "Cat")].map((u) => ({ ...u, lineLinked: linked.has(u.id), lineUserId: RAW_LINE_ID }));

const REAL = "../../../lib/api/client.ts?task726u-real";
const real = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...real,
  ApiClientError: real.ApiClientError,
  useMockData: false,
  api: {
    ...real.api,
    get: async (url: string) => {
      calls.push({ method: "GET", url });
      return { data: { users: rows(), roles: [], items: [], total: 0, menus: [], actions: [] } };
    },
    delete: async (url: string) => {
      calls.push({ method: "DELETE", url });
      if (refuseWith) throw refuseWith;
      const id = url.split("/")[2];
      linked.delete(id);
      return { data: { user: { id, lineLinked: false }, afterRemoval: "visitor-menu", menuSettled: true } };
    },
  },
}));
const realAuth = await import("next-auth/react");
mock.module("next-auth/react", () => ({
  ...realAuth,
  useSession: () => ({ data: { user: { id: "u-admin", isSuperAdmin: true } }, status: "authenticated" }),
}));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string; color?: string }) => notes.push(o) }));

const UsersContent = (await import("./UsersContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(UsersContent, null)))) as never);
};
const rowOf = async (name: string) =>
  (await waitFor(() => {
    const tr = [...document.querySelectorAll("tr")].find((r) => r.querySelector("td")?.textContent?.includes(name) || r.textContent?.includes(name));
    expect(!tr).toBe(false);
    return tr;
  })) as HTMLElement;
const lineCell = (tr: Element) => tr.querySelector("[data-line-linked]") as HTMLElement;
const deletes = () => calls.filter((c) => c.method === "DELETE");
const openMore = async (u: ReturnType<typeof userEvent.setup>, name: string) => u.click(await screen.findByLabelText(`More actions for ${name}`));
const unlinkItem = () => document.querySelector("[data-unlink-line]") as HTMLElement | null;

beforeEach(() => {
  calls.length = 0;
  notes.length = 0;
  linked = new Set(["u-bee"]);
  refuseWith = null;
  window.localStorage.removeItem("ss.lang");
});
afterEach(cleanup);

describe("🔴 TASK-726 — the Users page LINE column", () => {
  it("the LINE header is there; the cell says Linked on the linked row and Not linked on the other (from `lineLinked`)", async () => {
    mount();
    await waitFor(() => expect([...document.querySelectorAll("th")].some((th) => th.textContent === "LINE")).toBe(true));
    const bee = await rowOf("Bee");
    const cat = await rowOf("Cat");
    expect(lineCell(bee).textContent).toBe("Linked");
    expect(lineCell(bee).getAttribute("data-line-linked")).toBe("yes");
    expect(lineCell(cat).textContent).toBe("Not linked");
    expect(lineCell(cat).getAttribute("data-line-linked")).toBe("no");
  });

  it("TH · the drafted Thai words", async () => {
    window.localStorage.setItem("ss.lang", "th");
    mount();
    const bee = await rowOf("Bee");
    await waitFor(() => expect(lineCell(bee).textContent).toBe("ผูกแล้ว"));
    expect(lineCell(await rowOf("Cat")).textContent).toBe("ยังไม่ผูก");
  });

  it("🔑 Unlink is offered ONLY on a linked row", async () => {
    const u = userEvent.setup();
    mount();
    await rowOf("Cat");
    await openMore(u, "Cat");
    await screen.findByText("Reset password");
    expect(!unlinkItem()).toBe(true);
  });

  it("🔴 Unlink → the confirm FIRST (nothing sent) → confirm → `DELETE /users/u-bee/line-link` ONCE → the row says Not linked", async () => {
    const u = userEvent.setup();
    mount();
    expect(lineCell(await rowOf("Bee")).textContent).toBe("Linked");
    await openMore(u, "Bee");
    await u.click(await waitFor(() => {
      const el = unlinkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));

    // the confirm is up, with the drafted sentence naming the person, and NOTHING has been sent
    const dialog = await waitFor(() => {
      const d = document.querySelector('[role="dialog"]');
      expect(!d).toBe(false);
      return d as HTMLElement;
    });
    expect(dialog.textContent).toContain("Unlink Bee's LINE? This account will stop getting admin notices.");
    expect(deletes().length).toBe(0);

    const confirmBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Unlink LINE") as HTMLElement;
    await u.click(confirmBtn);

    await waitFor(() => expect(deletes().length).toBe(1));
    expect(deletes()[0].url).toBe("/users/u-bee/line-link");
    await waitFor(async () => expect(lineCell(await rowOf("Bee")).textContent).toBe("Not linked"));
    expect(notes.length).toBe(0); // no new word for a success toast: the row IS the answer
  });

  it("cancelling the confirm sends nothing and the row stays Linked", async () => {
    const u = userEvent.setup();
    mount();
    await rowOf("Bee");
    await openMore(u, "Bee");
    await u.click(await waitFor(() => {
      const el = unlinkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));
    const dialog = await waitFor(() => {
      const d = document.querySelector('[role="dialog"]');
      expect(!d).toBe(false);
      return d as HTMLElement;
    });
    await u.click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel") as HTMLElement);
    expect(deletes().length).toBe(0);
    expect(lineCell(await rowOf("Bee")).textContent).toBe("Linked");
  });

  it("🔑 a refusal is the server's sentence and the row is NOT flipped (no optimistic Not linked)", async () => {
    const SERVER = "ไม่พบผู้ใช้";
    refuseWith = new real.ApiClientError("NOT_FOUND", SERVER, 404);
    const u = userEvent.setup();
    mount();
    await rowOf("Bee");
    await openMore(u, "Bee");
    await u.click(await waitFor(() => {
      const el = unlinkItem();
      expect(!el).toBe(false);
      return el as HTMLElement;
    }));
    const dialog = await waitFor(() => {
      const d = document.querySelector('[role="dialog"]');
      expect(!d).toBe(false);
      return d as HTMLElement;
    });
    await u.click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Unlink LINE") as HTMLElement);
    await waitFor(() => expect(notes.length).toBe(1));
    expect(notes[0]).toMatchObject({ title: SERVER, color: "danger" });
    expect(deletes().length).toBe(1);
    expect(lineCell(await rowOf("Bee")).textContent).toBe("Linked");
  });

  it("🚫 no LINE id is rendered anywhere on the page, although the payload carries one", async () => {
    mount();
    await rowOf("Bee");
    expect(document.body.innerHTML.includes(RAW_LINE_ID)).toBe(false);
    expect(document.body.innerHTML.includes("Ufe3a9")).toBe(false);
  });
});
