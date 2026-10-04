import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-664 (piece B) — the picker MARKS a child with no household, quietly, and they stay pickable.**
 * 🔑 Clicked: the tag must not cost the row its use, and only picking it shows that.
 */

const ROWS = [
  { id: "s-alone", name: "น้องเดี่ยว", nickname: null, phone: null, parentId: null, parentName: null, label: "น้องเดี่ยว" },
  { id: "s-family", name: "น้องบ้าน", nickname: null, phone: "0811111111", parentId: "p1", parentName: "แม่", label: "น้องบ้าน (0811111111)" },
];
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useStudentSearch: () => ({ data: ROWS, isFetching: false }) }));

const { default: StudentSelect, NO_PARENT_TAG_CLASS } = await import("./StudentSelect");
type Value = { id?: string; name: string; phone?: string } | null;
let last: Value = null;
function Harness() {
  const [v, setV] = useState<Value>(null);
  last = v;
  return h(StudentSelect, { value: v, onChange: setV, required: true });
}
const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(Harness))));
const en = dictionaries.en.student;
const option = (id: string) =>
  [...document.querySelectorAll('[role="option"]')].find((o) => o.getAttribute("value") === id || o.textContent?.includes(id === "s-alone" ? "น้องเดี่ยว" : "น้องบ้าน")) as HTMLElement;

afterEach(() => {
  cleanup();
  last = null;
});

describe("🔴 TASK-664 — the no-parent tag in the picker", () => {
  it("🔑 a parentless row carries the tag AND is still pickable", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText(en.searchPlaceholder), "น้อง");
    const alone = await waitFor(() => {
      const o = option("s-alone");
      expect(o).toBeTruthy();
      return o;
    });
    expect(alone.querySelector("[data-no-parent-tag]")?.textContent).toBe(en.noParentTag);

    await user.click(alone);
    await waitFor(() => expect(last?.id).toBe("s-alone"));
  });

  it("a row WITH a parent is unchanged: its label and nothing else, no tag", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText(en.searchPlaceholder), "น้อง");
    const family = await waitFor(() => {
      const o = option("s-family");
      expect(o).toBeTruthy();
      return o;
    });
    expect(!family.querySelector("[data-no-parent-tag]")).toBe(true);
    expect(family.textContent).toBe("น้องบ้าน (0811111111)");
  });

  it("🔴 NOT SCARY, pinned: the tag is muted grey — no warning colour, no icon. Changing that is a decision, not a drift", async () => {
    expect(NO_PARENT_TAG_CLASS).toBe("shrink-0 rounded bg-muted-100 px-1.5 py-px text-[10px] font-medium text-muted-600");
    expect(NO_PARENT_TAG_CLASS).not.toMatch(/red|orange|amber|yellow|danger|warning/);

    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText(en.searchPlaceholder), "น้อง");
    const tag = await waitFor(() => {
      const t = document.querySelector("[data-no-parent-tag]");
      expect(t).toBeTruthy();
      return t as HTMLElement;
    });
    expect(tag.className).toBe(NO_PARENT_TAG_CLASS);
    expect(tag.querySelectorAll("svg").length).toBe(0);
  });
});
