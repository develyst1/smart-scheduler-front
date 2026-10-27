import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { attentionHref, planRequestFromParams } from "@/lib/scheduler/attention-link";

/**
 * 🔴 **TASK-841 (REQ-132) — each "ใกล้ใช้ครบ" / "ใกล้หมดอายุ" Attention item links to THAT course (or voucher).**
 *
 * 🔑 By value: the anchors the page draws (href + label), the URL the Bookings page reads, and the plan window it opens. What can go wrong without anyone seeing it: a link to the
 * wrong id, an item without `link` turned into a link, `?course=` ignored on load, a window that opens for an id the server does not know (or for the other kind), and one that
 * REopens after the admin closed it. Assertions are strings and counts — never a node (TASK-596).
 */

let attention: unknown = { checks: [], lastRun: null };
const plans: Record<string, unknown> = {};
const planGets: string[] = [];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      if (url === "/attention") return { data: attention };
      const m = /^\/entitlements\/([^/]+)\/plan$/.exec(url);
      if (m) {
        planGets.push(m[1]);
        if (!plans[m[1]]) throw new Error("404 not found");
        return { data: plans[m[1]] };
      }
      return { data: {} };
    },
  },
}));

const AttentionContent = (await import("./AttentionContent")).default;
const { useOpenPlanFromLink } = await import("@/hooks/scheduler/useOpenPlanFromLink");

const CHECKS = {
  checks: [
    {
      key: "course_low_sessions",
      titleKey: "att_course_low_sessions",
      title: "คอร์สใกล้ใช้ครบ",
      count: 2,
      items: [
        { id: "i1", label: "น้องเอ · course 10 · เหลือ 2", link: { kind: "course", id: "c-10" } },
        { id: "i2", label: "น้องบี · voucher 5 · เหลือ 1", link: { kind: "voucher", id: "v-5" } },
      ],
    },
    {
      key: "pending_teacher_links",
      titleKey: "att_pending_teacher_links",
      title: "คำขอเชื่อมครู",
      count: 1,
      items: [{ id: "t1", label: "ครูเอิร์ธ (Freelance)", hint: "รอยืนยัน" }],
    },
  ],
  lastRun: null,
};

const mountAttention = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t841-lang" }, h(AttentionContent)))) as never);
};
const hrefs = () => [...document.querySelectorAll("a[data-attention-link]")].map((a) => `${a.getAttribute("href")} | ${a.textContent}`);

afterEach(() => cleanup());
beforeEach(() => {
  attention = CHECKS;
  for (const k of Object.keys(plans)) delete plans[k];
  planGets.length = 0;
  window.localStorage.setItem("t841-lang", "en");
});

describe("🔴 the Attention page", () => {
  it("🔑 an item with `link` is a link to THAT course (or voucher) — href by id, the label is the server's text", async () => {
    mountAttention();
    await waitFor(() => expect(hrefs().length).toBe(2));
    expect(hrefs()).toEqual(["/scheduler/bookings?course=c-10 | น้องเอ · course 10 · เหลือ 2", "/scheduler/bookings?voucher=v-5 | น้องบี · voucher 5 · เหลือ 1"]);
  });

  it("🔑 an item WITHOUT `link` stays plain text (no anchor), and the page-level link of its check is unchanged", async () => {
    mountAttention();
    await waitFor(() => expect(document.body.textContent).toContain("ครูเอิร์ธ (Freelance)"));
    expect(hrefs().join("\n")).not.toContain("ครูเอิร์ธ");
    expect(document.body.textContent).toContain("· รอยืนยัน"); // the hint still rides the plain item
    const openLinks = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((x) => x === "/scheduler/link-requests");
    expect(openLinks.length).toBe(1); // CHECK_LINKS: attention.open → the queue screen, once
  });

  it("an id with characters that need encoding is encoded (nothing else rides the URL)", () => {
    expect(attentionHref({ kind: "course", id: "a b&c=d" })).toBe("/scheduler/bookings?course=a%20b%26c%3Dd");
    expect(attentionHref({ kind: "voucher", id: "v1" })).toBe("/scheduler/bookings?voucher=v1");
  });
});

describe("the URL the Bookings page reads — ONE read, these keys only", () => {
  const read = (qs: string) => planRequestFromParams((k) => new URLSearchParams(qs).get(k));
  it("?course=<id> ⇒ a course request; ?voucher=<id> ⇒ a voucher request; anything else ⇒ none", () => {
    expect(read("course=c-10")).toEqual({ kind: "course", id: "c-10" });
    expect(read("voucher=v-5")).toEqual({ kind: "voucher", id: "v-5" });
    expect(read("")).toBeNull();
    expect(read("id=c-10&plan=c-10&tab=vouchers")).toBeNull();
    expect(read("course=")).toBeNull();
  });
  it("the Bookings page uses exactly that reader and the hook that opens the window once", () => {
    const src = readFileSync("src/components/partials/Bookings/BookingsContent.tsx", "utf8");
    expect(src).toContain("const request = planRequestFromParams((k) => params?.get(k) ?? null);");
    expect(src).toContain("useOpenPlanFromLink(request, setPlanId);");
    expect(src).toContain('request?.kind === "voucher" ? "vouchers" : "courses"');
    const page = readFileSync("src/app/(admin)/scheduler/bookings/page.tsx", "utf8");
    expect(page).toContain("<Suspense");
  });
});

describe("🔴 opening the plan window (the Bookings page's hook)", () => {
  const opened: string[] = [];
  const Probe = ({ request }: { request: { kind: "course" | "voucher"; id: string } | null }) => {
    useOpenPlanFromLink(request, (id) => opened.push(id));
    return null;
  };
  const mountProbe = (request: { kind: "course" | "voucher"; id: string } | null) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (r: typeof request) => h(QueryClientProvider, { client: qc }, h(Probe, { request: r })) as never;
    const view = render(tree(request));
    return { rerender: () => view.rerender(tree(request)), qc };
  };
  beforeEach(() => {
    opened.length = 0;
  });

  it("🔑 ?course=<id> of a course that LOADS ⇒ its window opens, with that id, once — and a re-render (the admin closed it) does not reopen it", async () => {
    plans["c-10"] = { kind: "course", id: "c-10", sessions: [], summary: { kind: "course" } };
    const m = mountProbe({ kind: "course", id: "c-10" });
    await waitFor(() => expect(opened).toEqual(["c-10"]));
    m.rerender();
    // the plan is re-read with NEW data (any act inside the open window does this): the effect runs again, and must not reopen what the admin closed
    plans["c-10"] = { kind: "course", id: "c-10", sessions: [{ id: "s1" }], summary: { kind: "course" } };
    await m.qc.invalidateQueries();
    await new Promise((r) => setTimeout(r, 80));
    expect(opened).toEqual(["c-10"]);
  });

  it("🔑 ?voucher=<id> of a voucher ⇒ its window opens (the plan window is the same one)", async () => {
    plans["v-5"] = { kind: "voucher", id: "v-5", sessions: [], summary: { kind: "voucher" } };
    mountProbe({ kind: "voucher", id: "v-5" });
    await waitFor(() => expect(opened).toEqual(["v-5"]));
  });

  it("🔑 an UNKNOWN id: the plan is asked for, fails quietly, and NOTHING opens (no crash)", async () => {
    mountProbe({ kind: "course", id: "nope" });
    await waitFor(() => expect(planGets).toContain("nope"));
    await new Promise((r) => setTimeout(r, 80));
    expect(opened).toEqual([]);
  });

  it("an id of the OTHER kind opens nothing (a voucher id under ?course=)", async () => {
    plans["v-5"] = { kind: "voucher", id: "v-5", sessions: [], summary: { kind: "voucher" } };
    mountProbe({ kind: "course", id: "v-5" });
    await waitFor(() => expect(planGets).toContain("v-5"));
    await new Promise((r) => setTimeout(r, 80));
    expect(opened).toEqual([]);
  });

  it("no request ⇒ no plan is even asked for", async () => {
    mountProbe(null);
    await new Promise((r) => setTimeout(r, 60));
    expect(planGets).toEqual([]);
    expect(opened).toEqual([]);
  });
});
