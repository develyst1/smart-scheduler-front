import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { formatDateDisplay } from "@/lib/ui/format";

/**
 * 🔴 **TASK-669 (server: TASK-668) — link a parent to a child that has none, from the no-parent list.**
 *
 * The point is the CONFIRM: before the admin presses Link it must show the family's existing children BY NAME (the "two Aris"
 * case — the admin sees the duplicate, no heuristic warns them), the child's upcoming sessions, and that the link can't be undone
 * from the screen. 🔑 Clicked and read at the WIRE: the dry run must write nothing, the link must carry `parentId` and nothing else,
 * and only after the confirm. The refusals are the server's sentences, shown as sent.
 */

type Row = { id: string; name: string; nickname: string | null; phone: null; parentId: null; parentName: null; label: string; birthDate: null };
const row = (id: string, name: string): Row => ({ id, name, nickname: null, phone: null, parentId: null, parentName: null, label: name, birthDate: null });
const kid = (id: string, name: string) => ({ id, parentId: "x", name, nickname: null, gender: null, birthDate: null, nationality: null, note: null });

let live: Row[] = [];
let dryRunError: Error | null = null;
let linkError: Error | null = null;
let upcoming = { count: 3, next: "2026-10-09" };
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

const FAMILIES = [
  { id: "p-ari", phone: "0811111111", name: "แม่อาริ", lineUserId: null, province: null, note: null, suspendedAt: null, students: [kid("k1", "อาริ"), kid("k2", "อาริ")] },
  { id: "p-new", phone: "0822222222", name: "แม่ใหม่", lineUserId: null, province: null, note: null, suspendedAt: null, students: [] as ReturnType<typeof kid>[] },
];
const SERVER_409 = "นักเรียนคนนี้ผูกกับผู้ปกครองแล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด";
const SERVER_CAP = "เพิ่มนักเรียนได้สูงสุด 5 คนต่อเบอร์";

const realClient = await import("@/lib/api/client");
/** 📌 The REAL error class by its own specifier: other files mock the client for the whole run (SYSTEM-FACTS 2026-10-05). */
const REAL = "../../../lib/api/client.ts?task669-real";
const { ApiClientError: RealApiClientError }: typeof import("@/lib/api/client") = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/students") return { data: config?.params?.archived === "true" ? [] : live };
      if (url === "/parents") {
        const q = String(config?.params?.q ?? "");
        return { data: { parents: FAMILIES.filter((f) => !q || f.name.includes(q) || f.phone.includes(q)), total: FAMILIES.length } };
      }
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      const m = /^\/students\/([^/]+)\/parent$/.exec(url);
      if (!m) return { data: {} };
      const f = FAMILIES.find((x) => x.id === body.parentId);
      if (body.dryRun === true) {
        if (dryRunError) throw dryRunError;
        return { data: { dryRun: true, parent: { id: f?.id, name: f?.name, phone: f?.phone }, children: (f?.students ?? []).map((s) => ({ id: s.id, name: s.name, nickname: s.nickname })), upcoming } };
      }
      if (linkError) throw linkError;
      live = live.filter((r) => r.id !== m[1]);
      return { data: { dryRun: false, linked: true, studentId: m[1], parentId: body.parentId, familyCount: (f?.students.length ?? 0) + 1 } };
    },
  },
}));
let allowed: (key: string) => boolean = () => true;
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => allowed(key) }));

const PeopleContent = (await import("./PeopleContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PeopleContent)))));
};
const en = dictionaries.en;
const noParentSwitch = () => document.querySelector("input[data-no-parent-filter]") as HTMLInputElement;
const list = () => document.querySelector("[data-no-parent-list]") as HTMLElement;
const linkDoor = (id: string) => document.querySelector(`[data-no-parent-link="${id}"]`) as HTMLElement;
const dlg = () => document.querySelector("[data-link-parent-dialog]") as HTMLElement | null;
const dlgText = () => dlg()?.textContent ?? "";
const familyRow = (id: string) => document.querySelector(`[data-link-family="${id}"]`) as HTMLElement;
const confirmBtn = () => document.querySelector("[data-link-confirm]") as HTMLButtonElement;
const linkPosts = () => posts.filter((p) => !(p.body as { dryRun?: boolean }).dryRun);
const dryRuns = () => posts.filter((p) => (p.body as { dryRun?: boolean }).dryRun === true);

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  mount();
  await user.click(noParentSwitch());
  await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe(String(live.length)));
};
const toConfirm = async (user: ReturnType<typeof userEvent.setup>, childId = "s-child", familyId = "p-ari") => {
  await openList(user);
  await user.click(linkDoor(childId));
  await waitFor(() => expect(familyRow(familyId)).toBeTruthy());
  await user.click(familyRow(familyId));
  await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
};

beforeEach(() => {
  live = [row("s-title", "ห้อง ป.3/2"), row("s-child", "น้องมิว")];
  dryRunError = null;
  linkError = null;
  upcoming = { count: 3, next: "2026-10-09" };
  posts.length = 0;
  allowed = () => true;
});
afterEach(cleanup);

describe("🔴 TASK-669 — the door and the picker", () => {
  it("a link door on every no-parent row; it opens the picker with the existing family search, and nothing is written", async () => {
    const user = userEvent.setup();
    await openList(user);
    expect(list().querySelectorAll("[data-no-parent-link]").length).toBe(2);

    await user.click(linkDoor("s-child"));
    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("pick"));
    expect(dlgText()).toContain(en.people.linkParent);
    await waitFor(() => expect(document.querySelectorAll("[data-link-family]").length).toBe(2));
    expect(posts).toEqual([]); // opening the picker writes nothing and asks the server nothing
  });

  it("typing narrows the families with the SAME parent search the page uses (name or phone)", async () => {
    const user = userEvent.setup();
    await openList(user);
    await user.click(linkDoor("s-child"));
    await waitFor(() => expect(document.querySelectorAll("[data-link-family]").length).toBe(2));
    await user.type(document.querySelector("[data-link-search]") as HTMLElement, "0822");
    await waitFor(() => expect(document.querySelectorAll("[data-link-family]").length).toBe(1));
    expect(!!familyRow("p-new")).toBe(true);
  });
});

describe("🔴 TASK-669 — the CONFIRM shows what the admin must see BEFORE pressing Link", () => {
  it("🔑 picking a family asks the server for the dry run ONLY, and shows the family's children BY NAME, the upcoming sessions, and 'cannot be undone'", async () => {
    const user = userEvent.setup();
    await toConfirm(user);

    // the confirm's read: a dry run for THAT child and THAT family — and nothing was linked
    await waitFor(() => expect(dryRuns().length).toBeGreaterThan(0));
    expect(dryRuns()[0].url).toBe("/students/s-child/parent");
    expect(dryRuns()[0].body).toEqual({ parentId: "p-ari", dryRun: true });
    expect(linkPosts().length).toBe(0);

    const text = await waitFor(() => {
      const t = dlgText();
      expect(t).toContain("This family already has");
      return t;
    });
    expect(text).toContain("Link น้องมิว to แม่อาริ?"); // the title names the child and the family
    // 🔑 "two Aris": BOTH children are listed by name, so the admin sees the duplicate for themselves
    expect(text).toContain("This family already has: อาริ, อาริ");
    expect(document.querySelector("[data-link-family-children]")?.getAttribute("data-link-family-children")).toBe("2");
    // the child's upcoming sessions: the count and the next date, as the server sent them
    expect(text).toContain("น้องมิว has 3 upcoming session(s)");
    expect(text).toContain(`next ${formatDateDisplay("2026-10-09")}`);
    // and that nothing un-links
    expect(text).toContain("This link can't be undone from the screen.");
  });

  it("a family with no students yet, and a child with no upcoming sessions, say so", async () => {
    upcoming = { count: 0, next: null };
    const user = userEvent.setup();
    await toConfirm(user, "s-child", "p-new");
    const text = await waitFor(() => {
      const t = dlgText();
      expect(t).toContain("This family has no students yet.");
      return t;
    });
    expect(text).toContain("น้องมิว has no upcoming sessions.");
    expect(text).not.toContain("upcoming session(s)");
  });
});

describe("🔴 TASK-669 — the link itself", () => {
  it("🔑 confirming posts the LINK for that child with `parentId` and NOTHING ELSE; the row leaves and the count drops", async () => {
    const user = userEvent.setup();
    await toConfirm(user);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    expect(linkPosts().length).toBe(0); // 🚫 nothing has been written before the press

    await user.click(confirmBtn());
    await waitFor(() => expect(linkPosts().length).toBe(1));
    expect(linkPosts()[0].url).toBe("/students/s-child/parent");
    expect(linkPosts()[0].body).toEqual({ parentId: "p-ari" }); // 🔑 the family's id, never the child's, no `from`, no `dryRun`

    await waitFor(() => expect(!dlg()).toBe(true)); // the dialog closes
    await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe("1"));
    expect(!linkDoor("s-child")).toBe(true);
    expect(!!linkDoor("s-title")).toBe(true);
    expect(document.body.textContent).toContain(`${en.student.noParentFilter} (1)`);
  });

  it("🔑 the OTHER family's id is what rides when the other family is picked", async () => {
    const user = userEvent.setup();
    await toConfirm(user, "s-child", "p-new");
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());
    await waitFor(() => expect(linkPosts().length).toBe(1));
    expect(linkPosts()[0].body).toEqual({ parentId: "p-new" });
  });

  it("a 409 on the link shows the SERVER's sentence, the dialog stays and the row stays", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await toConfirm(user);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());

    await waitFor(() => expect(dlgText()).toContain(SERVER_409));
    expect(live.map((r) => r.id)).toEqual(["s-title", "s-child"]); // nothing moved
    expect(list().getAttribute("data-no-parent-list")).toBe("2");
  });

  it("a refusal on the DRY RUN (the cap, an archived family) shows the server's sentence and Link stays shut — nothing to confirm", async () => {
    dryRunError = new RealApiClientError("VALIDATION", SERVER_CAP, 400);
    const user = userEvent.setup();
    await toConfirm(user);
    await waitFor(() => expect(dlgText()).toContain(SERVER_CAP));
    expect(confirmBtn().disabled).toBe(true);
    expect(linkPosts().length).toBe(0);
  });
});

describe("🔴 TASK-669 — gating, and no bulk", () => {
  it("🔴 without `people.parent-students` there is NO link door (hidden, not greyed)", async () => {
    allowed = (key) => key !== "action:people.parent-students";
    const user = userEvent.setup();
    await openList(user);
    expect(list().querySelectorAll("[data-no-parent-link]").length).toBe(0);
    expect(list().querySelectorAll("[data-no-parent-archive]").length).toBe(2); // the other door is its own key
  });

  it("🚫 one link door per row — no bulk link, no select-all, no 'link all' (pinned by count)", async () => {
    const user = userEvent.setup();
    await openList(user);
    expect(list().querySelectorAll("[data-no-parent-link]").length).toBe(live.length);
    expect(list().querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(list().querySelectorAll("button, a").length).toBe(live.length * 2); // a link door and an archive door per row, nothing else
    expect(screen.queryAllByText(/link all|ผูกทั้งหมด/i).length).toBe(0);
  });
});
