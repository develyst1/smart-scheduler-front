import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-837 (REQ-126 "ตัดจบคอร์ส") — Khwan's words on the EXISTING end-course act + a 5th end reason.** THE BEHAVIOUR IS UNCHANGED.
 *
 * 🔑 Every assertion is a request or a string: the approved button/dialog words (owner 2026-10-25, verbatim), the reason radios a COURSE shows and a VOUCHER does not, and the
 * body each end sends. The voucher's DB check refuses `ENDED_EARLY` — so the voucher dialog must never offer it, and the wire it uses must never carry it.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: ["action:bookings.course-cancel"], roleName: null, teacherId: null } } };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/cancel/preview")) {
        return { data: { alreadyEnded: false, removedSessions: 5, sessions: [], student: { id: "s1", name: "น้องบีม", nickname: "Beam" }, program: "Surfskate", remaining: 3 } };
      }
      posts.push({ url, body });
      return { data: { ok: true } };
    },
  },
}));

const EndCourseDialog = (await import("./EndCourseDialog")).default;

const USER = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: ["action:bookings.course-cancel"], role: "admin", teacherId: null };
const mount = (kind: "course" | "voucher", lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t837-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t837-lang" }, h(SessionProvider, { session: { user: USER, expires: "2999-01-01" } as never },
      h(EndCourseDialog, { opened: true, target: { kind, id: kind === "course" ? "c1" : "v1" }, onClose: () => {} }),
    )))) as never,
  );
};

const radios = () => [...document.querySelectorAll("input[type='radio']")].map((r) => (r.closest("label")?.textContent ?? document.querySelector(`label[for='${(r as HTMLInputElement).id}']`)?.textContent ?? "").trim());
const submitBtn = (text: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;
const ready = () => waitFor(() => expect(document.querySelectorAll("input[type='radio']").length).toBeGreaterThan(0));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  posts.length = 0;
  window.localStorage.clear();
});

describe("🔑 the approved words, pinned exactly (owner 2026-10-25)", () => {
  it("EN: button · title · sentence · confirm · done · the new reason", () => {
    const en = dictionaries.en.endCourse;
    expect(en.action).toBe("End course early");
    expect(en.title).toBe("End this course early?");
    expect(en.confirmLine).toBe("End the {program} course for {student} early — the {n} remaining sessions are removed. It cannot be undone.");
    expect(en.confirm).toBe("End course early");
    expect(en.done).toBe("Course ended early");
    expect(en.ENDED_EARLY).toBe("Course ended early");
  });
  it("TH: the same six, in her words", () => {
    const th = dictionaries.th.endCourse;
    expect(th.action).toBe("ตัดจบคอร์ส");
    expect(th.title).toBe("ตัดจบคอร์สนี้?");
    expect(th.confirmLine).toBe("ตัดจบคอร์ส {program} ของ {student} — คาบที่เหลือ {n} คาบจะถูกนำออกจากตาราง ทำแล้วย้อนกลับไม่ได้");
    expect(th.confirm).toBe("ตัดจบคอร์ส");
    expect(th.done).toBe("ตัดจบคอร์สแล้ว");
    expect(th.ENDED_EARLY).toBe("ตัดจบคอร์ส");
  });
  it("🚫 nothing ships with a «copy pending» marker, and the voucher's own strings are untouched", () => {
    expect(JSON.stringify(dictionaries.en.endCourse)).not.toMatch(/copy pending/i);
    expect(JSON.stringify(dictionaries.th.endCourse)).not.toMatch(/copy pending/i);
    expect(dictionaries.en.voucher.endTitle).toBe("Cancel this voucher?");
    expect(dictionaries.en.voucher.endConfirm).toBe("Cancel the voucher");
  });
});

describe("🔴 the COURSE end dialog", () => {
  it("🔑 EN: title, the server's sentence, FOUR reasons (the three + Course ended early), and the confirm button — all the approved words", async () => {
    mount("course");
    await ready();
    expect(document.body.textContent).toContain("End this course early?");
    expect(document.body.textContent).toContain("End the Surfskate course for Beam early — the 5 remaining sessions are removed. It cannot be undone.");
    expect(radios()).toEqual(["Customer changed activity", "Customer no longer wants it", "Admin entered it by mistake", "Course ended early"]);
    expect(submitBtn("End course early")).toBeTruthy();
  });

  it("TH: the same dialog in her words", async () => {
    mount("course", "th");
    await ready();
    expect(document.body.textContent).toContain("ตัดจบคอร์สนี้?");
    expect(document.body.textContent).toContain("ตัดจบคอร์ส Surfskate ของ Beam — คาบที่เหลือ 5 คาบจะถูกนำออกจากตาราง ทำแล้วย้อนกลับไม่ได้");
    expect(radios()).toEqual(["ลูกค้าเปลี่ยนกิจกรรม", "ลูกค้าไม่เอาแล้ว", "แอดมินคีย์ผิด", "ตัดจบคอร์ส"]);
    expect(submitBtn("ตัดจบคอร์ส")).toBeTruthy();
  });

  it("🔑 choosing 'Course ended early' sends reason ENDED_EARLY on the course cancel (and nothing before that)", async () => {
    const user = userEvent.setup();
    mount("course");
    await ready();
    expect(posts.length).toBe(0);
    await user.click(document.querySelectorAll("input[type='radio']")[3] as HTMLElement);
    await user.click(submitBtn("End course early") as HTMLElement);
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toBe("/courses/c1/cancel");
    expect(posts[0].body.reason).toBe("ENDED_EARLY");
  });

  it("the three old reasons still send their own codes", async () => {
    const user = userEvent.setup();
    mount("course");
    await ready();
    await user.click(document.querySelectorAll("input[type='radio']")[1] as HTMLElement);
    await user.click(submitBtn("End course early") as HTMLElement);
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.reason).toBe("CUSTOMER_CANCELLED");
  });
});

describe("🚫 the VOUCHER end dialog never offers it", () => {
  it("three reasons only — no 'Course ended early', no ตัดจบคอร์ส — and the voucher's own words", async () => {
    mount("voucher");
    await ready();
    expect(radios()).toEqual(["Customer changed activity", "Customer no longer wants it", "Admin entered it by mistake"]);
    expect(document.body.textContent).not.toContain("Course ended early");
    expect(document.body.textContent).toContain("Cancel this voucher?");
    expect(submitBtn("Cancel the voucher")).toBeTruthy();
  });

  it("a voucher end sends one of the three codes, on the voucher route", async () => {
    const user = userEvent.setup();
    mount("voucher");
    await ready();
    await user.click(document.querySelectorAll("input[type='radio']")[0] as HTMLElement);
    await user.click(submitBtn("Cancel the voucher") as HTMLElement);
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toBe("/vouchers/v1/cancel");
    expect(posts[0].body.reason).toBe("PROGRAM_CHANGED");
  });
});
