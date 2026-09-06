import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * SPEC-076 / REQ-082 + REQ-084 / TASK-265 — the expiry control, its warning, and the resume prompt.
 *
 * 🔴 **Every rule here is an ABSENCE**: nothing blocks the save, nothing recomputes the warning, and there is
 * no second warning component. Absences cannot be asserted by calling a function, so these read the source —
 * the same shape TASK-261 used for AC-8 and TASK-262 for the wiring.
 */

const EXPIRY_DIALOG = "src/components/partials/Bookings/EditExpiryDialog.tsx";
const RESUME_DIALOG = "src/components/partials/Bookings/DropResumeDialog.tsx";
const WARNING_COMPONENT = "src/components/common/ExpiryWarningAlert.tsx";
const SERVICE = "src/services/scheduler.service.ts";

const read = (p: string) => readFileSync(p, "utf8");

describe("🔑 ONE warning component serves BOTH requirements", () => {
  it("both dialogs render the same component", () => {
    for (const file of [EXPIRY_DIALOG, RESUME_DIALOG]) {
      expect(read(file)).toContain("<ExpiryWarningAlert");
    }
  });

  it("there is no second one", () => {
    // The owner's "one rule across both" is only true in the code if there is literally one component. A
    // sibling built beside this one is how the two come to say different things about the same fact.
    const all = ["src/components/common", "src/components/partials/Bookings"]
      .flatMap((dir) => require("fs").readdirSync(dir).map((f: string) => `${dir}/${f}`))
      .filter((p: string) => p.endsWith(".tsx"));
    const warningComponents = all.filter(
      (p: string) => /Expiry.*Warning|Warning.*Expiry/i.test(p.split("/").pop() ?? ""),
    );
    expect(warningComponents).toEqual([WARNING_COMPONENT]);
  });
});

describe("🚫 the screen computes NONE of the warning — it is the server's", () => {
  it("the warning component only reads the response's fields", () => {
    const src = read(WARNING_COMPONENT);
    expect(src).toContain("warning.outsideCount");
    expect(src).toContain("warning.outside");
    // No local arithmetic over sessions and no date comparison: a second derivation is how the warning and
    // the truth come apart (TASK-261's clash-message rule, applied again).
    expect(src).not.toMatch(/\.filter\([^)]*date\s*[<>]/);
    expect(src).not.toContain("dayjs(");
  });

  it("neither dialog derives `warn` for itself", () => {
    for (const file of [EXPIRY_DIALOG, RESUME_DIALOG]) {
      const src = read(file);
      // They may READ `expiryWarning.warn` off the response; they must not compute one.
      expect(src).not.toMatch(/warn:\s*(true|false|[a-z]+\.length)/);
    }
  });
});

describe("🔴 AC-4 — warn, and STILL SAVE. Nothing blocks on the warning.", () => {
  it("the expiry dialog's submit is disabled only for a missing date", () => {
    const src = read(EXPIRY_DIALOG);
    expect(src).toContain("disabled={!course || !expiry}");
    // The failure this guards: someone "helpfully" gating the save on the warning, turning a warning into the
    // refusal the owner rejected.
    expect(src).not.toMatch(/disabled=\{[^}]*warn/);
  });

  it("the resume dialog is never disabled by the warning either", () => {
    const src = read(RESUME_DIALOG);
    expect(src).not.toMatch(/disabled=\{[^}]*warning/);
    // It may be disabled by the server's explicit "I need a date" prompt — that is a prompt, not the warning.
    expect(src).toContain("needsExpiry && !expiry");
  });

  it("the copy says the save already happened, so the warning cannot read as a refusal", () => {
    for (const lang of ["en", "th"] as const) {
      expect(typeof dictionaries[lang].expiry.warnStillSaves).toBe("string");
      expect(dictionaries[lang].expiry.warnStillSaves.length).toBeGreaterThan(0);
    }
  });
});

describe("REQ-084 §3 — resume works WITHOUT a date, and prompts only when told to", () => {
  it("the service sends no `expiryDate` key when there is none", () => {
    const src = read(SERVICE);
    const fn = src.slice(src.indexOf("export const resumeCourse"), src.indexOf("SPEC-076 / TASK-264 (REQ-082"));
    expect(fn).toContain("input.expiryDate ? { expiryDate: input.expiryDate } : {}");
    expect(fn).toContain("expiryDate?: string");
  });

  it("EXPIRY_REQUIRED is handled as a prompt, not an error banner", () => {
    const src = read(RESUME_DIALOG);
    expect(src).toContain('e.code === "EXPIRY_REQUIRED"');
    expect(src).toContain("setNeedsExpiry(true)");
  });

  it("the date field is hidden until the server asks — the dialog is a plain confirm by default", () => {
    // Q2's shape change, pinned: before TASK-264 this field was always rendered and always required.
    expect(read(RESUME_DIALOG)).toContain("needsExpiry && (");
  });
});

describe("REQ-082 AC-1 — the expiry control is on ANY course, deliberately un-gated", () => {
  it("the card's expiry control carries no lifecycle gate", () => {
    const src = read("src/components/partials/Bookings/CoursePackagePanel.tsx");
    const control = src.slice(src.indexOf('aria-label={t("expiry.edit")}') - 600, src.indexOf('aria-label={t("expiry.edit")}'));
    // ⚠️ The one place TASK-262's "gate the control on lifecycle" instinct does NOT apply: REQ-084's resume
    // warning points at this control on a course that is DROPPED at that moment, so a gate would aim the
    // warning at a control that refuses. TASK-264 left the endpoint un-gated for the same reason.
    expect(control).not.toContain("isCourseWritable");
    expect(control).not.toContain("canPauseCourse");
  });
});
