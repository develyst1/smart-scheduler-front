import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-696 — "create a family and link" from the link-a-parent dialog (completes TASK-669).**
 *
 * Khwan's real case is a phone for a family that is NOT in the system yet. The dialog's pick step offers the People page's own
 * "Add parent"; once the family is created the dialog goes STRAIGHT to the confirm for it. 🔑 Clicked and read at the WIRE.
 * Two calls, not one atomic act, so the cases that matter are the HALF-DONE ones: the family stays, nothing is auto-deleted, and a
 * retry links the SAME family and can never create a second one. Refusals are the server's sentences; no new wording anywhere.
 */

type Row = { id: string; name: string; nickname: string | null; phone: null; parentId: null; parentName: null; label: string; birthDate: null };
const row = (id: string, name: string): Row => ({ id, name, nickname: null, phone: null, parentId: null, parentName: null, label: name, birthDate: null });
const kid = (id: string, name: string) => ({ id, parentId: "x", name, nickname: null, gender: null, birthDate: null, nationality: null, note: null });

let live: Row[] = [];
let createError: Error | null = null;
let linkError: Error | null = null;
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
/**
 * 📌 The notices are COLLECTED, not read off the screen: three other dom tests `mock.module("@/lib/ui/notify")` with a collector and
 * Bun keeps a mock for the whole run, so a toast "on screen" is true alone and false in the full suite. Asserting on what `notify` was
 * CALLED with is the same proof (the create's own success notice; the server's sentence as the failure's description) and cannot leak.
 */
type Notice = { title: string; description?: string; color?: string };
const notices: Notice[] = [];
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (n: Notice) => void notices.push(n) }));
const deletes: string[] = [];

const FAMILIES = [{ id: "p-ari", phone: "0811111111", name: "แม่อาริ", lineUserId: null, province: null, note: null, suspendedAt: null, students: [kid("k1", "อาริ")] }];
const NEW_FAMILY = { id: "p-created", phone: "0899999999", name: "แม่ตินติน", lineUserId: null, province: null, note: null, suspendedAt: null, students: [] };
const SERVER_DUP = "เบอร์นี้มีผู้ปกครองในระบบแล้ว";
const SERVER_409 = "นักเรียนคนนี้ผูกกับผู้ปกครองแล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด";

const realClient = await import("@/lib/api/client");
/** 📌 The REAL error class by its own specifier: other files mock the client for the whole run (SYSTEM-FACTS 2026-10-05). */
const REAL = "../../../lib/api/client.ts?task696-real";
const { ApiClientError: RealApiClientError }: typeof import("@/lib/api/client") = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...realClient,
  // the components test `e instanceof ApiClientError` to show a server sentence, so they must see the SAME class the errors are built from
  ApiClientError: RealApiClientError,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/students") return { data: config?.params?.archived === "true" ? [] : live };
      if (url === "/parents") return { data: { parents: FAMILIES, total: FAMILIES.length } };
      return { data: {} };
    },
    delete: async (url: string) => {
      deletes.push(url);
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url === "/parents") {
        if (createError) throw createError;
        return { data: { ...NEW_FAMILY, phone: String(body.phone), name: (body.name as string | null) ?? null } };
      }
      const m = /^\/students\/([^/]+)\/parent$/.exec(url);
      if (!m) return { data: {} };
      if (body.dryRun === true) {
        return { data: { dryRun: true, parent: { id: body.parentId, name: NEW_FAMILY.name, phone: NEW_FAMILY.phone }, children: [], upcoming: { count: 2, next: "2026-10-09" } } };
      }
      if (linkError) {
        const e = linkError;
        linkError = null; // refuse ONCE: the retry in the half-done test must be able to succeed
        throw e;
      }
      live = live.filter((r) => r.id !== m[1]);
      return { data: { dryRun: false, linked: true, studentId: m[1], parentId: body.parentId, familyCount: 1 } };
    },
  },
}));
let allowed: (key: string) => boolean = () => true;
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => allowed(key) }));

const PeopleContent = (await import("./PeopleContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PeopleContent)))));
};
const en = dictionaries.en;
const noParentSwitch = () => document.querySelector("input[data-no-parent-filter]") as HTMLInputElement;
const list = () => document.querySelector("[data-no-parent-list]") as HTMLElement;
const linkDoor = (id: string) => document.querySelector(`[data-no-parent-link="${id}"]`) as HTMLElement;
const dlg = () => document.querySelector("[data-link-parent-dialog]") as HTMLElement | null;
const dlgText = () => dlg()?.textContent ?? "";
const createBtn = () => document.querySelector("[data-link-create]") as HTMLElement | null;
const confirmBtn = () => document.querySelector("[data-link-confirm]") as HTMLButtonElement;
const phoneInput = () => document.querySelector('input[inputmode="tel"]') as HTMLInputElement;
const saveFamilyBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === en.common.save) as HTMLElement;
const createPosts = () => posts.filter((p) => p.url === "/parents");
const linkPosts = () => posts.filter((p) => /^\/students\/[^/]+\/parent$/.test(p.url) && (p.body as { dryRun?: boolean }).dryRun !== true);
const dryRuns = () => posts.filter((p) => /^\/students\/[^/]+\/parent$/.test(p.url) && (p.body as { dryRun?: boolean }).dryRun === true);

const openPick = async (user: ReturnType<typeof userEvent.setup>) => {
  mount();
  await user.click(noParentSwitch());
  await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe(String(live.length)));
  await user.click(linkDoor("s-child"));
  await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("pick"));
};
const createFamily = async (user: ReturnType<typeof userEvent.setup>, phone = "0899999999", name = "แม่ตินติน") => {
  await user.click(createBtn() as HTMLElement);
  const box = await waitFor(() => {
    const b = phoneInput();
    expect(b).toBeTruthy();
    return b;
  });
  await user.type(box, phone);
  const nameBox = [...document.querySelectorAll("input")].find((i) => i.placeholder === en.people.parentNamePlaceholder) as HTMLInputElement;
  await user.type(nameBox, name);
  await user.click(saveFamilyBtn());
};

beforeEach(() => {
  notices.length = 0;
  live = [row("s-title", "ห้อง ป.3/2"), row("s-child", "น้องมิว")];
  createError = null;
  linkError = null;
  posts.length = 0;
  deletes.length = 0;
  allowed = () => true;
});
afterEach(cleanup);

describe("🔴 TASK-696 — the create button, and who sees it", () => {
  it("with `people.parent-create` the pick step shows it; without it the dialog is exactly TASK-669's — no button", async () => {
    const user = userEvent.setup();
    await openPick(user);
    expect(!!createBtn()).toBe(true);
    expect(createBtn()!.textContent).toContain(en.people.addParent);
    cleanup();

    allowed = (key) => key !== "action:people.parent-create";
    await openPick(user);
    expect(!createBtn()).toBe(true);
    expect(document.querySelectorAll("[data-link-family]").length).toBe(1); // …and the picker itself is untouched
  });
});

describe("🔴 TASK-696 — create, then straight to the confirm, then link", () => {
  it("🔑 create posts the form body ONCE → the dry run for THAT new id → the confirm (never skipped) → Link posts { parentId: <new id> } only", async () => {
    const user = userEvent.setup();
    await openPick(user);
    await createFamily(user);

    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
    expect(createPosts().length).toBe(1);
    expect(createPosts()[0].body).toEqual({ name: "แม่ตินติน", phone: "0899999999", province: null, note: null });
    // the confirm's read is for the NEW family, and nothing was linked yet
    await waitFor(() => expect(dryRuns().length).toBeGreaterThan(0));
    expect(dryRuns()[0].url).toBe("/students/s-child/parent");
    expect(dryRuns()[0].body).toEqual({ parentId: "p-created", dryRun: true });
    expect(linkPosts().length).toBe(0);
    const text = await waitFor(() => {
      const t = dlgText();
      expect(t).toContain(en.people.linkParentFamilyEmpty);
      return t;
    });
    expect(text).toContain("Link น้องมิว to แม่ตินติน?");
    expect(text).toContain(en.people.linkParentIrreversible); // "can't be undone" still applies

    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());
    await waitFor(() => expect(linkPosts().length).toBe(1));
    expect(linkPosts()[0].url).toBe("/students/s-child/parent");
    expect(linkPosts()[0].body).toEqual({ parentId: "p-created" }); // 🔑 the NEW family, never the old one, nothing else
    await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe("1")); // the row left
    expect(createPosts().length).toBe(1);
  });
});

describe("🔴 TASK-696 — the half-done cases: the family STAYS, and a retry never creates a second one", () => {
  it("a create REFUSAL (the phone already has a family) shows the server's sentence; NO link is attempted and the dialog stays on the pick step", async () => {
    createError = new RealApiClientError("CONFLICT", SERVER_DUP, 409);
    const user = userEvent.setup();
    await openPick(user);
    await createFamily(user);

    await waitFor(() => expect(notices.some((n) => n.description === SERVER_DUP)).toBe(true)); // the server's own sentence, as sent
    expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("pick"); // not moved on to a confirm
    expect(dryRuns().length).toBe(0);
    expect(linkPosts().length).toBe(0);
  });

  it("🔴 create OK + link 409, BY VALUE: the saved notice was shown, the server's sentence is on screen, the dialog is STILL on the NEW family's confirm, and Link again posts the SAME parentId — `POST /parents` exactly ONCE", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await openPick(user);
    await createFamily(user);

    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
    expect(notices.some((n) => n.title === en.people.parentSaved && n.description === "แม่ตินติน")).toBe(true); // 1. the create said it succeeded (existing words)
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());

    await waitFor(() => expect(dlgText()).toContain(SERVER_409)); // 3. the link's refusal, the server's sentence, on the confirm
    expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"); // 2. never back to the create form
    expect(dlgText()).toContain("แม่ตินติน"); // …and it is the NEW family's confirm
    // 🔑 the create form did NOT reopen: a retry can only link, never create. (waitFor: Mantine keeps a closed modal in the DOM until its exit transition ends)
    await waitFor(() => expect(!phoneInput()).toBe(true));
    expect(createPosts().length).toBe(1);

    await user.click(confirmBtn()); // the retry
    await waitFor(() => expect(linkPosts().length).toBe(2));
    expect(linkPosts()[1].body).toEqual({ parentId: "p-created" }); // the SAME family
    expect(linkPosts()[0].body).toEqual(linkPosts()[1].body);
    expect(createPosts().length).toBe(1); // 🔑 a retry can never create a second family
  });

  it("close after create ⇒ NO link call, and the family is NOT deleted or archived", async () => {
    const user = userEvent.setup();
    await openPick(user);
    await createFamily(user);
    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));

    await user.keyboard("{Escape}"); // the admin simply stops
    await waitFor(() => expect(!dlg()).toBe(true));
    expect(linkPosts().length).toBe(0);
    expect(deletes).toEqual([]); // nothing deleted
    expect(posts.filter((p) => /archive/.test(p.url)).length).toBe(0); // nothing archived
    expect(createPosts().length).toBe(1); // the family it created is the only write there was
  });
});

describe("🔴 TASK-696 — the People page's own “Add parent” is unchanged (pinned)", () => {
  it("opening it from the page: create posts, the saved notice shows, the modal closes — and NO link dialog, NO dry run, NO link", async () => {
    const user = userEvent.setup();
    mount();
    const addBtn = await waitFor(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent === en.people.addParent) as HTMLElement | undefined;
      expect(b).toBeTruthy();
      return b as HTMLElement;
    });
    await user.click(addBtn);
    const box = await waitFor(() => {
      const b = phoneInput();
      expect(b).toBeTruthy();
      return b;
    });
    await user.type(box, "0877777777");
    await user.click(saveFamilyBtn());

    await waitFor(() => expect(createPosts().length).toBe(1));
    expect(createPosts()[0].body).toEqual({ name: null, phone: "0877777777", province: null, note: null });
    await waitFor(() => expect(notices.some((n) => n.title === en.people.parentSaved && n.description === "0877777777")).toBe(true));
    expect(!dlg()).toBe(true);
    expect(dryRuns().length).toBe(0);
    expect(linkPosts().length).toBe(0);
  });
});
