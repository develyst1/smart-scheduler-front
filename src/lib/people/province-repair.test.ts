import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import AreaPicker, { NO_AREA } from "@/components/partials/People/AreaPicker";
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

/**
 * 🔻 **TASK-801 (REQ-118), declared — the control changed, the claim did not.** The admin form's province box is now the first level of the
 * 3-level `AreaPicker` (codes), so (a)/(b) render THAT, and (c) pins that the modal hands it the old text and sends no `province` any more.
 * ✅ What this protects is exactly TASK-353's: *the visible value is the warning* — a dirty province is shown IN the box, as a disabled option
 * that can be replaced but never re-picked, not as a blank box with a placeholder. (`provinceOptions` itself keeps its own pins below.)
 */
const renderPicker = (legacy: string | null) =>
  renderToString(
    createElement(MantineProvider, null, createElement(I18nProvider, null, createElement(AreaPicker, { value: NO_AREA, onChange: () => {}, legacyProvince: legacy }))),
  );

describe("§9.1 — a dirty province renders AS ITSELF in the admin form, unselectable, and a real one can replace it", () => {
  it("(a) the picker renders a dirty value without throwing", () => {
    expect(() => renderPicker(DIRTY)).not.toThrow();
  });

  it("(b) what it shows: the dirty string IN the visible province input — not a blank box with a placeholder", () => {
    const html = renderPicker(DIRTY);
    expect(visibleInput(html)).toContain(`value="${DIRTY}"`);
    expect(visibleInput(renderPicker(null))).toContain('value=""');
  });

  it("(b′) a clean value or no value leaves the 77 exactly as they were — the list itself is untouched", () => {
    expect(provinceOptions("กรุงเทพมหานคร")).toBe(TH_PROVINCES);
    expect(provinceOptions(null)).toBe(TH_PROVINCES);
    expect(provinceOptions("")).toBe(TH_PROVINCES);
    expect(provinceOptions(DIRTY)[0]).toEqual({ value: DIRTY, label: DIRTY, disabled: true });
    expect(TH_PROVINCES.length).toBe(77);
  });

  it("(c) the modal hands the picker the OLD text only when there are no codes, and the picker's legacy option is disabled", () => {
    const modal = readFileSync("src/components/partials/People/ParentFormModal.tsx", "utf8");
    expect(modal).toContain("legacyProvince={parent && !parent.provinceCode ? parent.province : null}");
    const picker = readFileSync("src/components/partials/People/AreaPicker.tsx", "utf8");
    expect(picker).toContain("{ value: legacyValue, label: legacyProvince as string, disabled: true }");
    // 🚫 no repair button, no cleanup, no banner — the visible value is the warning, by the owner's decision
    expect(modal).not.toMatch(/<Alert|<Notification|repair|cleanup|dirty|isThaiProvince|TH_PROVINCES.includes/);
  });
});
