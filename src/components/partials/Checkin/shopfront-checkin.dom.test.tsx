import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-554 (Tanya's D7) — the shop-QR page died when a parent ticked their SECOND child.**
 * `Cannot read properties of null (reading 'checked')`: the value was read **inside** the `setTicked` updater, a
 * callback React may run during the render it schedules — after the event has been released.
 *
 * 🔑 **Why this file has to exist, and why a render-only test would have passed on the broken code:** it renders
 * perfectly, and **the first tick usually works** (`dispatchSetState` runs the updater inline while nothing is pending,
 * and the event is still alive there). It is the SECOND tick — with an update already queued on the same hook — that is
 * deferred into the render phase and finds `null`. ⇒ **the bug exists only in the clicking**, which is TASK-518's and
 * TASK-531's lesson in its most literal form yet.
 *
 * 📌 **This page is PUBLIC and unauthenticated** — a parent meets it at a counter with no staff nearby — so the proof is
 * the whole act: tick A, tick B, **submit**, and the request that leaves.
 * 🚫 **And it must fail on a THROW, not merely on a wrong list:** a render error that happens to leave the list correct
 * is still a dead page, so uncaught errors are captured and asserted on directly.
 */

const posts: Array<{ url: string; body: unknown }> = [];
const LOOKUP = {
  children: [
    { name: "บีม", items: [{ kind: "session", bookingId: "bk-a", date: "2026-09-29", startTime: "10:00", endTime: "11:00", program: "Onewheel", teacher: "ครูเอ" }] },
    { name: "บูม", items: [{ kind: "session", bookingId: "bk-b", date: "2026-09-29", startTime: "10:00", endTime: "11:00", program: "Onewheel", teacher: "ครูเอ" }] },
  ],
};
const BATCH = { results: [{ bookingId: "bk-a", status: 200, body: {} }, { bookingId: "bk-b", status: 200, body: {} }] };

/** 🔑 Anything React throws while rendering surfaces here — the page dying is what this file is about. */
const thrown: unknown[] = [];
const onError = (e: ErrorEvent) => thrown.push(e.error ?? e.message);

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  const u = String(url);
  posts.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
  if (u.endsWith("/checkin/shopfront/lookup")) return { ok: true, json: async () => LOOKUP } as unknown as Response;
  if (u.endsWith("/checkin/shopfront/batch")) return { ok: true, json: async () => BATCH } as unknown as Response;
  return { ok: true, json: async () => ({}) } as unknown as Response;
}) as unknown as typeof fetch;

const ShopfrontCheckinContent = (await import("./ShopfrontCheckinContent")).default;

const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(ShopfrontCheckinContent, null))) as never);
const ticks = () => [...document.querySelectorAll("[data-shop-tick]")] as HTMLInputElement[];
const submitBtn = () => document.querySelector("[data-shop-submit]") as HTMLButtonElement;
const batchTo = () => posts.find((p) => p.url.endsWith("/checkin/shopfront/batch"));

afterEach(() => {
  cleanup();
  window.removeEventListener("error", onError);
});
beforeEach(() => {
  posts.length = 0;
  thrown.length = 0;
  window.addEventListener("error", onError);
});

/** Phone → the list of children, the state every test below starts from. */
const toList = async (user: ReturnType<typeof userEvent.setup>) => {
  mount();
  await user.type(screen.getByRole("textbox"), "0812345678");
  await user.click(document.querySelector("button") as HTMLElement);
  await waitFor(() => expect(ticks().length).toBe(2));
};

describe("🔴 TASK-554 — two children at the shop front, actually clicked", () => {
  it("tick A, tick B, SUBMIT — the page survives and BOTH children are in the request", async () => {
    const user = userEvent.setup();
    await toList(user);

    await user.click(ticks()[0]);
    // 🔑 the second tick is the one that used to kill the page
    await user.click(ticks()[1]);
    expect(thrown).toEqual([]);
    await waitFor(() => expect(ticks()[0].checked && ticks()[1].checked).toBe(true));

    await user.click(submitBtn());
    await waitFor(() => expect(batchTo()).toBeTruthy());
    // 🔑 both children, in the order asked — the list the deferred read used to lose
    expect((batchTo()!.body as { items: Array<{ bookingId: string }> }).items.map((i) => i.bookingId)).toEqual(["bk-a", "bk-b"]);
    expect(thrown).toEqual([]);
  });

  it("un-ticking is read eagerly too — the second child comes off again, with no throw", async () => {
    const user = userEvent.setup();
    await toList(user);

    await user.click(ticks()[0]);
    await user.click(ticks()[1]);
    await user.click(ticks()[1]); // off again
    await waitFor(() => expect(ticks()[1].checked).toBe(false));
    expect(ticks()[0].checked).toBe(true);
    expect(thrown).toEqual([]);

    // and a single child still goes down the SINGLE route, untouched by this fix
    await user.click(submitBtn());
    await waitFor(() => expect(posts.some((p) => p.url.endsWith("/checkin/shopfront"))).toBe(true));
    expect(batchTo()).toBeUndefined();
    expect(thrown).toEqual([]);
  });

  it("🚫 the rule, pinned at the source: nothing inside a state updater touches the event", () => {
    const src = readFileSync("src/components/partials/Checkin/ShopfrontCheckinContent.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("const on = e.currentTarget.checked;");
    // by ABSENCE — and `?.` is not an acceptable rescue: it would stop the crash and record the wrong thing
    expect(/set\w+\(\([^)]*\)\s*=>[^\n]*\be\.(currentTarget|target)/.test(src)).toBe(false);
    expect(src).not.toContain("currentTarget?.");
  });
});
