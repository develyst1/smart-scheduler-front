import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider, Select } from "@mantine/core";
import { TH_PROVINCES, provinceOptions } from "./th-provinces";

/**
 * TASK-353 (`REQ-088 §9.1`) — **the admin form is the REPAIR PATH for a dirty `parents.province`.**
 *
 * The owner moved the old address lines to `note` himself and is LEAVING `province` dirty on purpose:
 * *"ปล่อยจังหวัดพัง ให้เขาเจอ dashboard พัง แล้วให้เขาไปไล่แก้เอง"* — a visibly broken dashboard gets fixed by the
 * admins who know the family; a silently empty field never does. So the `Select` in `ParentFormModal`, fed a value
 * that is not one of the 77, must (a) open without throwing, (b) show something an admin can act on, and (c) let a
 * real province be picked and saved. This file renders the control the way the modal composes it and pins (a)/(b);
 * (c) is pinned on the modal's source.
 */
const DIRTY = "พระโขนงเหนือ วัฒนา กทม"; // the chat's own line, as it sat in the column before §9

const render = (value: string | null) =>
  // `createElement`, not JSX: the repo's tsconfig excludes `*.test.ts` from the app typecheck, not `.tsx`.
  renderToString(
    createElement(
      MantineProvider,
      null,
      createElement(Select, {
        label: "จังหวัด",
        placeholder: "เลือกจังหวัด",
        data: provinceOptions(value),
        value,
        onChange: () => {},
        searchable: true,
        clearable: true,
      }),
    ),
  );
const visibleInput = (html: string) => html.match(/<input(?![^>]*type="hidden")[^>]*>/)?.[0] ?? "";

describe("§9.1 — a dirty province renders AS ITSELF in the admin form, unselectable, and a real one can replace it", () => {
  it("(a) the control renders a dirty value without throwing", () => {
    expect(() => render(DIRTY)).not.toThrow();
  });

  it("(b) what it shows: the dirty string IN the visible input — not a blank box with a placeholder", () => {
    // Before TASK-353, Mantine's Select showed a value it could not find in `data` as an EMPTY input (the value
    // sat only in the hidden field) — an admin would read "nothing set". With `provinceOptions` the value is an
    // option, so it is displayed; `disabled` means it cannot be re-picked, only replaced.
    const html = render(DIRTY);
    expect(visibleInput(html)).toContain(`value="${DIRTY}"`);
    const opts = provinceOptions(DIRTY);
    expect(opts[0]).toEqual({ value: DIRTY, label: DIRTY, disabled: true });
    expect(opts.slice(1)).toEqual(TH_PROVINCES);
  });

  it("(b′) a clean value or no value leaves the 77 exactly as they were — the list itself is untouched", () => {
    expect(provinceOptions("กรุงเทพมหานคร")).toBe(TH_PROVINCES);
    expect(provinceOptions(null)).toBe(TH_PROVINCES);
    expect(provinceOptions("")).toBe(TH_PROVINCES);
    expect(visibleInput(render("เชียงใหม่"))).toContain('value="เชียงใหม่"');
    expect(visibleInput(render(null))).toContain('value=""');
    expect(TH_PROVINCES.length).toBe(77);
  });

  it("(c) picking a real province and saving sends THAT province — the modal's onChange and submit are unchanged", () => {
    const modal = readFileSync("src/components/partials/People/ParentFormModal.tsx", "utf8");
    expect(modal).toContain("data={provinceOptions(province)}");
    expect(modal).toContain("onChange={setProvince}");
    expect(modal).toContain("province: province ?? null,");
    // 🚫 no repair button, no cleanup, no banner — the visible value is the warning, by the owner's decision
    // (`color: "warning"` on the phone-required toast predates this task and is not a banner — hence the narrow shape)
    expect(modal).not.toMatch(/<Alert|<Notification|repair|cleanup|dirty|isThaiProvince|TH_PROVINCES.includes/);
  });
});
