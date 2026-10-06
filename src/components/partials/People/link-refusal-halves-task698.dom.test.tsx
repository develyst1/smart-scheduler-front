import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-698 — after a create, EVERY refusal in the link dialog names BOTH halves.**
 *
 * QA's case C: the family was created, the link refused, and the "saved" toast had FADED — so the only evidence the family existed was
 * the confirm's title, and an admin who missed it retried and created a SECOND family. Now the red box says so itself, first, with
 * the phone just typed and the child's real name, then the server's own reason.
 * 🔑 **By value, not by presence** (Porter): the point is that the PHONE and the CHILD are IN the sentence, so every assertion reads the
 * exact line, and a name, "น้อง" or an empty value in their place must fail. A family picked from the search gets the server's sentence ALONE.
 */

type Row = { id: string; name: string; nickname: string | null; phone: null; parentId: null; parentName: null; label: string; birthDate: null };
const row = (id: string, name: string): Row => ({ id, name, nickname: null, phone: null, parentId: null, parentName: null, label: name, birthDate: null });
const kid = (id: string, name: string) => ({ id, parentId: "x", name, nickname: null, gender: null, birthDate: null, nationality: null, note: null });

const CHILD = "สมหมาย ใจดี"; // a real name that is neither "น้อง" nor a nickname
const NEW_NAME = "แม่ตินติน"; // the family's NAME — must never stand in for the phone
const NEW_PHONE = "0812345678";
let live: Row[] = [];
let dryRunError: Error | null = null;
let linkError: Error | null = null;
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

const FAMILIES = [{ id: "p-ari", phone: "0811111111", name: "แม่อาริ", lineUserId: null, province: null, note: null, suspendedAt: null, students: [kid("k1", "อาริ")] }];
const SERVER_409 = "นักเรียนคนนี้ผูกกับผู้ปกครองแล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด";
const SERVER_CAP = "เพิ่มนักเรียนได้สูงสุด 5 คนต่อเบอร์";

const realClient = await import("@/lib/api/client");
/** 📌 The REAL error class by its own specifier (SYSTEM-FACTS 2026-10-05): other files mock the client for the whole run. */
const REAL = "../../../lib/api/client.ts?task698-real";
const { ApiClientError: RealApiClientError }: typeof import("@/lib/api/client") = await import(REAL);
mock.module("@/lib/api/client", () => ({
  ...realClient,
  ApiClientError: RealApiClientError,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/students") return { data: config?.params?.archived === "true" ? [] : live };
      if (url === "/parents") return { data: { parents: FAMILIES, total: FAMILIES.length } };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url === "/parents") return { data: { id: "p-created", phone: String(body.phone), name: (body.name as string | null) ?? null, lineUserId: null, province: null, note: null, suspendedAt: null, students: [] } };
      const m = /^\/students\/([^/]+)\/parent$/.exec(url);
      if (!m) return { data: {} };
      if (body.dryRun === true) {
        if (dryRunError) throw dryRunError;
        return { data: { dryRun: true, parent: { id: body.parentId, name: NEW_NAME, phone: NEW_PHONE }, children: [], upcoming: { count: 1, next: "2026-10-09" } } };
      }
      if (linkError) throw linkError; // persistent: the cases below press Link / go back / pick again
      live = live.filter((r) => r.id !== m[1]);
      return { data: { dryRun: false, linked: true, studentId: m[1], parentId: body.parentId, familyCount: 1 } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
/** 📌 `notify` is COLLECTED, never read off the screen (SYSTEM-FACTS 2026-10-07): three other dom tests mock it for the whole run. */
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => undefined }));

const PeopleContent = (await import("./PeopleContent")).default;

type Lang = "th" | "en";
const mount = (lang: Lang) => {
  window.localStorage.setItem("ss.lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(PeopleContent)))));
};
const noParentSwitch = () => document.querySelector("input[data-no-parent-filter]") as HTMLInputElement;
const list = () => document.querySelector("[data-no-parent-list]") as HTMLElement;
const linkDoor = (id: string) => document.querySelector(`[data-no-parent-link="${id}"]`) as HTMLElement;
const dlg = () => document.querySelector("[data-link-parent-dialog]") as HTMLElement | null;
const alertEl = () => document.querySelector("[data-link-error]") as HTMLElement | null;
const alertText = () => alertEl()?.textContent ?? "";
const createBtn = () => document.querySelector("[data-link-create]") as HTMLElement;
const confirmBtn = () => document.querySelector("[data-link-confirm]") as HTMLButtonElement;
const familyRow = (id: string) => document.querySelector(`[data-link-family="${id}"]`) as HTMLElement;
const phoneInput = () => document.querySelector('input[inputmode="tel"]') as HTMLInputElement;

/** The two sentences, written out by hand (NOT built from the dictionary), so a changed key or a swapped value cannot pass. */
const LINE_TH = `สร้างครอบครัวเบอร์ ${NEW_PHONE} แล้ว แต่ยังผูก ${CHILD} ไม่สำเร็จ`;
const LINE_EN = `The family with phone ${NEW_PHONE} was created, but ${CHILD} is not linked yet.`;

const openPick = async (user: ReturnType<typeof userEvent.setup>, lang: Lang) => {
  mount(lang);
  await user.click(noParentSwitch());
  await waitFor(() => expect(list().getAttribute("data-no-parent-list")).toBe(String(live.length)));
  await user.click(linkDoor("s-child"));
  await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("pick"));
};
const createFamily = async (user: ReturnType<typeof userEvent.setup>, lang: Lang) => {
  await user.click(createBtn());
  const box = await waitFor(() => {
    const b = phoneInput();
    expect(b).toBeTruthy();
    return b;
  });
  await user.type(box, NEW_PHONE);
  const nameBox = [...document.querySelectorAll("input")].find((i) => i.placeholder === dictionaries[lang].people.parentNamePlaceholder) as HTMLInputElement;
  await user.type(nameBox, NEW_NAME);
  await user.click([...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries[lang].common.save) as HTMLElement);
  await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
};
const pressLink = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(confirmBtn().disabled).toBe(false));
  await user.click(confirmBtn());
};

beforeEach(() => {
  live = [row("s-title", "ห้อง ป.3/2"), row("s-child", CHILD)];
  dryRunError = null;
  linkError = null;
  posts.length = 0;
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("ss.lang");
});

describe("🔴 TASK-698 — a family CREATED in this dialog: every refusal names both halves, by value", () => {
  it("🔑 TH · create (phone 0812345678) → the LINK refused ⇒ the box carries the EXACT approved line with THAT phone and THAT child, then the server's reason", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await openPick(user, "th");
    await createFamily(user, "th");
    await pressLink(user);

    await waitFor(() => expect(alertText()).toContain(SERVER_409));
    const text = alertText();
    expect(text).toContain(LINE_TH); // the phone AND the child are IN the sentence, verbatim
    expect(text).toContain(NEW_PHONE);
    expect(text).toContain(CHILD);
    expect(text).not.toContain(NEW_NAME); // 🔑 the PHONE, never the family's name
    expect(text.indexOf(LINE_TH)).toBeLessThan(text.indexOf(SERVER_409)); // the created half FIRST, the reason after
    expect(text).toBe(LINE_TH + SERVER_409); // …and nothing else in the box
    // the point of the line: the admin can see the family exists, so a retry LINKS it — it never needs to create another
    expect(posts.filter((p) => p.url === "/parents").length).toBe(1);
  });

  it("🔑 TH · create → the DRY RUN refused (the cap) ⇒ the same line, the same values, then the cap sentence", async () => {
    dryRunError = new RealApiClientError("VALIDATION", SERVER_CAP, 400);
    const user = userEvent.setup();
    await openPick(user, "th");
    await createFamily(user, "th");

    await waitFor(() => expect(alertText()).toContain(SERVER_CAP));
    expect(alertText()).toBe(LINE_TH + SERVER_CAP);
    expect(confirmBtn().disabled).toBe(true); // nothing to confirm: Link stays shut
  });

  it("🔑 EN · create → the link refused ⇒ the English line with BOTH values, then the reason", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await openPick(user, "en");
    await createFamily(user, "en");
    await pressLink(user);

    await waitFor(() => expect(alertText()).toContain(SERVER_409));
    expect(alertText()).toBe(LINE_EN + SERVER_409);
    expect(alertText()).toContain(NEW_PHONE);
    expect(alertText()).toContain(CHILD);
  });

  it("the two sentences in the dictionary are EXACTLY the approved words (counted in both languages, no DRAFT drift)", () => {
    expect(dictionaries.th.people.linkCreatedButNotLinked).toBe("สร้างครอบครัวเบอร์ {phone} แล้ว แต่ยังผูก {child} ไม่สำเร็จ");
    expect(dictionaries.en.people.linkCreatedButNotLinked).toBe("The family with phone {phone} was created, but {child} is not linked yet.");
  });
});

describe("🔴 TASK-698 — a family picked from the SEARCH: the server's sentence ALONE, exactly as today (pinned)", () => {
  it("the link refused ⇒ the box is exactly the server's sentence — NO “สร้างครอบครัว”", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await openPick(user, "th");
    await waitFor(() => expect(!!familyRow("p-ari")).toBe(true));
    await user.click(familyRow("p-ari"));
    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
    await pressLink(user);

    await waitFor(() => expect(alertText()).toContain(SERVER_409));
    expect(alertText()).toBe(SERVER_409);
    expect(alertText()).not.toContain("สร้างครอบครัว");
    expect(document.querySelectorAll("[data-link-created-line]").length).toBe(0);
  });

  it("the dry run refused ⇒ exactly the server's sentence too", async () => {
    dryRunError = new RealApiClientError("VALIDATION", SERVER_CAP, 400);
    const user = userEvent.setup();
    await openPick(user, "th");
    await waitFor(() => expect(!!familyRow("p-ari")).toBe(true));
    await user.click(familyRow("p-ari"));

    await waitFor(() => expect(alertText()).toContain(SERVER_CAP));
    expect(alertText()).toBe(SERVER_CAP);
  });

  it("🔑 going BACK from a created family and picking one from the list is a searched family again — the line does not follow it", async () => {
    linkError = new RealApiClientError("STUDENT_ALREADY_HAS_PARENT", SERVER_409, 409);
    const user = userEvent.setup();
    await openPick(user, "th");
    await createFamily(user, "th");
    await pressLink(user);
    await waitFor(() => expect(alertText()).toBe(LINE_TH + SERVER_409)); // created here: the line shows

    // Cancel (back to the pick step), then choose a family from the SEARCH and be refused again
    const cancel = [...(dlg() as HTMLElement).querySelectorAll("button")].find((b) => b.textContent === dictionaries.th.common.cancel) as HTMLElement;
    await user.click(cancel);
    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("pick"));
    await waitFor(() => expect(!!familyRow("p-ari")).toBe(true));
    await user.click(familyRow("p-ari"));
    await waitFor(() => expect(dlg()?.getAttribute("data-link-parent-dialog")).toBe("confirm"));
    await pressLink(user);

    await waitFor(() => expect(alertText()).toContain(SERVER_409));
    expect(alertText()).toBe(SERVER_409); // the server's sentence alone
  });
});
