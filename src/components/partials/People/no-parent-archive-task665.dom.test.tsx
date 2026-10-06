import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-665 — per-row ARCHIVE on the no-parent list, and its RESTORE under `Show archived`.**
 *
 * The owner hands the clean-up of the list (titles and nicknames the data cannot tell from children) to the people who
 * know — ONE row at a time. 🔑 Clicked and read at the WIRE: which id was archived, which id restored. And restore must
 * exist HERE, because a parentless record has no parent card to restore it from.
 */

type Row = { id: string; name: string; nickname: string | null; phone: null; parentId: null; parentName: null; label: string; birthDate: null };
const row = (id: string, name: string): Row => ({ id, name, nickname: null, phone: null, parentId: null, parentName: null, label: name, birthDate: null });

let live: Row[] = [];
let archived: Row[] = [];
let refuse = new Set<string>();
const posts: string[] = [];
const LIVE_SESSIONS = "มีคาบเรียนข้างหน้า 2 คาบ — ยกเลิก/ย้ายก่อน";

const realClient = await import("@/lib/api/client");
/**
 * 📌 The REAL error class, by a specifier of its own (SYSTEM-FACTS 2026-10-05): Bun keeps another file's
 * `mock.module("@/lib/api/client")` for the whole run, and one of those builds its error with a different argument order —
 * seen: this test passed alone and, in the full suite, the dialog showed the CODE instead of the sentence.
 */
const REAL = "../../../lib/api/client.ts?task665-real";
const { ApiClientError: RealApiClientError }: typeof import("@/lib/api/client") = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/students") return { data: config?.params?.archived === "true" ? archived : live };
      if (url === "/parents") return { data: { parents: [], total: 0 } };
      return { data: {} };
    },
    post: async (url: string) => {
      posts.push(url);
      const m = /^\/students\/([^/]+)\/(archive|unarchive)$/.exec(url);
      if (!m) return { data: {} };
      const [, id, act] = m;
      if (act === "archive") {
        if (refuse.has(id)) throw new RealApiClientError("STUDENT_HAS_LIVE_SESSIONS", LIVE_SESSIONS, 409);
        archived = [...archived, ...live.filter((r) => r.id === id)];
        live = live.filter((r) => r.id !== id);
      } else {
        live = [...live, ...archived.filter((r) => r.id === id)];
        archived = archived.filter((r) => r.id !== id);
      }
      return { data: { student: { id } } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const PeopleContent = (await import("./PeopleContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PeopleContent)))));
};
const en = dictionaries.en;
const noParentSwitch = () => document.querySelector("input[data-no-parent-filter]") as HTMLInputElement;
const archivedSwitch = () => screen.getByLabelText(en.people.showArchived) as HTMLInputElement;
const list = () => document.querySelector("[data-no-parent-list]") as HTMLElement;
const archiveDoor = (id: string) => document.querySelector(`[data-no-parent-archive="${id}"]`) as HTMLElement;
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
const pressConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
  const btn = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes(en.people.archiveStudentConfirm)) as HTMLElement;
  await user.click(btn);
};
const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  mount();
  await user.click(noParentSwitch());
  await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe(String(live.length)));
};

beforeEach(() => {
  live = [row("s-title", "ห้อง ป.3/2"), row("s-child", "น้องมิว")];
  archived = [];
  refuse = new Set();
  posts.length = 0;
});
afterEach(cleanup);

describe("🔴 TASK-665 — archive, ONE row at a time", () => {
  it("🔑 the door opens a confirm NAMING THAT ROW; confirming archives THAT id only; the row leaves and the count drops by 1", async () => {
    const user = userEvent.setup();
    await openList(user);
    expect(document.body.textContent).toContain(`${en.student.noParentFilter} (2)`);

    await user.click(archiveDoor("s-title"));
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog().textContent).toContain("ห้อง ป.3/2");
    expect(dialog().textContent).not.toContain("น้องมิว");
    expect(posts.length).toBe(0); // the first tap archives nothing

    await pressConfirm(user);
    await waitFor(() => expect(posts).toEqual(["/students/s-title/archive"]));
    await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe("1"));
    expect(!archiveDoor("s-title")).toBe(true);
    expect(!!archiveDoor("s-child")).toBe(true);
    expect(document.body.textContent).toContain(`${en.student.noParentFilter} (1)`);
  });

  it("a `409 STUDENT_HAS_LIVE_SESSIONS` shows the server's sentence and the row STAYS", async () => {
    refuse = new Set(["s-child"]);
    const user = userEvent.setup();
    await openList(user);
    await user.click(archiveDoor("s-child"));
    await waitFor(() => expect(dialog()).toBeTruthy());
    await pressConfirm(user);

    await waitFor(() => expect(dialog().textContent).toContain(LIVE_SESSIONS));
    expect(posts).toEqual(["/students/s-child/archive"]);
    expect(live.map((r) => r.id)).toEqual(["s-title", "s-child"]);
    expect(list().getAttribute("data-no-parent-list")).toBe("2");
  });

  it("🚫 no bulk, no select-all, no delete: the only controls are one archive door and one link door per row (pinned by count)", async () => {
    const user = userEvent.setup();
    await openList(user);
    expect(list().querySelectorAll("[data-no-parent-archive]").length).toBe(live.length);
    // 🔻 TASK-669 added the per-row LINK door (one per row, same rule: no bulk). Nothing else is a control.
    expect(list().querySelectorAll("[data-no-parent-link]").length).toBe(live.length);
    expect(list().querySelectorAll("button, a").length).toBe(live.length * 2);
    expect(list().querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(list().textContent).not.toContain(en.people.deleteStudent);
  });
});

describe("🔴 TASK-665 — RESTORE lives here, so archive is really reversible", () => {
  it("🔑 Show archived ⇒ the archived parentless row is listed with Restore; Restore unarchives THAT id; the count stays LIVE-only", async () => {
    archived = [row("s-old", "ห้อง ป.1/1")];
    const user = userEvent.setup();
    await openList(user);
    await user.click(archivedSwitch());
    try {
      const restoreRow = await waitFor(() => {
        const r = document.querySelector('[data-no-parent-archived-row="s-old"]');
        expect(r).toBeTruthy();
        return r as HTMLElement;
      });
      expect(restoreRow.textContent).toContain(en.people.archivedBadge);
      // the count beside the switch is still the LIVE rows only (it equals `GET /students?noParent=true`)
      expect(document.body.textContent).toContain(`${en.student.noParentFilter} (2)`);
      expect(list().getAttribute("data-no-parent-list")).toBe("2");

      await user.click([...restoreRow.querySelectorAll("button")].find((b) => b.textContent?.includes(en.people.restore)) as HTMLElement);
      await waitFor(() => expect(posts).toEqual(["/students/s-old/unarchive"]));
      await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe("3"));
    } finally {
      await user.click(archivedSwitch()); // the toggle is a remembered store: leave it as found
    }
  });

  it("Show archived OFF ⇒ no archived rows are asked for or shown", async () => {
    archived = [row("s-old", "ห้อง ป.1/1")];
    const user = userEvent.setup();
    await openList(user);
    expect(archivedSwitch().checked).toBe(false);
    expect(!document.querySelector("[data-no-parent-archived-row]")).toBe(true);
  });
});
