import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createElement as h, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Branch } from "@/types/api/contract";

/**
 * TASK-898 (F1) — the Branch field, by CLICKING it (it decides where a class is counted): the select reads Bravo by default and offers
 * Bravo / Other (อื่นๆ in Thai); the whole-course control fires NOTHING on choosing and sends `{ courseId, branch }` only on Save; the
 * read-only line shows only for OTHER; and EVERYTHING is inert with the ship gate off (the tree's state).
 * 🔑 It cannot prove the server stores it (TASK-889 half 2); the service payload is pinned in `services/branch-body-task898.test.ts`.
 */
const changes: Array<{ courseId: string; branch: Branch }> = [];
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useUpdateCourseBranch: () => ({
    isPending: false,
    mutateAsync: async (v: { courseId: string; branch: Branch }) => {
      changes.push(v);
      return {};
    },
  }),
}));
const BranchSelect = (await import("./BranchSelect")).default;
const BranchLine = (await import("./BranchLine")).default;
const CourseBranchControl = (await import("./CourseBranchControl")).default;
const cfg = await import("./config");

beforeEach(() => {
  changes.length = 0;
  window.localStorage.removeItem("ss.lang");
});
afterEach(cleanup);

const wrap = (node: unknown) => render(h(MantineProvider, null, h(I18nProvider, null, node as never)) as never);
const text = () => document.body.textContent ?? "";
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name) as HTMLButtonElement;
const pickOption = async (name: string) => {
  await userEvent.click(document.querySelector("input[aria-haspopup='listbox'], input[readonly]") as Element);
  const opt = await waitFor(() => {
    const o = [...document.querySelectorAll("[role='option']")].find((x) => x.textContent === name);
    expect(o !== undefined).toBe(true);
    return o as Element;
  });
  await userEvent.click(opt);
};

describe("the ship gate", () => {
  it("the tree ships LIVE (one SB+SF deploy with TASK-889 half 2); a rollback is flipping this one constant", () => {
    expect(cfg.BRANCH_LIVE).toBe(true);
  });
  it("gate off (`live: false`, a rollback): the select, the line and the control render nothing", async () => {
    wrap(h("div", null, h(BranchSelect, { value: "BRAVO", onChange: () => {}, live: false }), h(BranchLine, { branch: "OTHER", live: false }), h(CourseBranchControl, { courseId: "c1", current: "BRAVO", live: false })));
    await new Promise((r) => setTimeout(r, 200));
    expect(text()).not.toContain("Branch");
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("button").length).toBe(0);
  });
});

describe("BranchSelect (gate on)", () => {
  const Harness = ({ onChange }: { onChange: (b: Branch) => void }) => {
    const [v, setV] = useState<Branch>("BRAVO");
    return h(BranchSelect, { value: v, live: true, onChange: (b: Branch) => { setV(b); onChange(b); } });
  };
  it("reads 'Branch' with Bravo selected by default, and offers Bravo / Other", async () => {
    wrap(h(Harness, { onChange: () => {} }));
    expect(text()).toContain("Branch");
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("Bravo");
    await userEvent.click(document.querySelector("input") as Element);
    await waitFor(() => expect(text()).toContain("Other"));
  });
  it("choosing Other reports OTHER", async () => {
    const got: Branch[] = [];
    wrap(h(Harness, { onChange: (b) => got.push(b) }));
    await pickOption("Other");
    expect(got).toEqual(["OTHER"]);
  });
  it("in Thai it reads สาขา and อื่นๆ (the PM's words), Bravo unchanged", async () => {
    window.localStorage.setItem("ss.lang", "th");
    wrap(h(Harness, { onChange: () => {} }));
    await waitFor(() => expect(text()).toContain("สาขา"));
    await userEvent.click(document.querySelector("input") as Element);
    await waitFor(() => expect(text()).toContain("อื่นๆ"));
    expect(dictionaries.th.branch).toEqual({ label: "สาขา", BRAVO: "Bravo", OTHER: "อื่นๆ" });
  });
});

describe("BranchLine (gate on): read-only, only when it is not BRAVO", () => {
  it("OTHER shows; BRAVO and unknown show nothing", () => {
    wrap(h("div", null, h(BranchLine, { branch: "OTHER", live: true })));
    expect(document.querySelectorAll("[data-branch-line]").length).toBe(1);
    cleanup();
    wrap(h("div", null, h(BranchLine, { branch: "BRAVO", live: true }), h(BranchLine, { branch: undefined, live: true })));
    expect(document.querySelectorAll("[data-branch-line]").length).toBe(0);
  });
});

describe("CourseBranchControl (gate on): the whole-course change", () => {
  it("Save is shut until another branch is chosen, nothing fires on choosing, and Save sends { courseId, branch }", async () => {
    wrap(h(CourseBranchControl, { courseId: "c1", current: "BRAVO", live: true }));
    expect(button("Save").disabled).toBe(true);
    await pickOption("Other");
    expect(changes).toEqual([]); // choosing is not saving
    expect(button("Save").disabled).toBe(false);
    await userEvent.click(button("Save"));
    await waitFor(() => expect(changes.length).toBe(1));
    expect(changes[0]).toEqual({ courseId: "c1", branch: "OTHER" });
  });
  it("choosing the branch the course already has keeps Save shut", async () => {
    wrap(h(CourseBranchControl, { courseId: "c1", current: "OTHER", live: true }));
    await pickOption("Other");
    expect(button("Save").disabled).toBe(true);
    expect(changes).toEqual([]);
  });
});
