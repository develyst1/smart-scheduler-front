import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { FALLBACK_TIME, toTimeSlot } from "./time-slot";
import { resumeDefaultTime } from "./resume-defaults";
import { TIME_SLOTS } from "@/types/app/scheduler";

/**
 * 🔴 TASK-295 / DEF-5 — **the resume form's `Time` field was empty, and the admin could still submit.**
 *
 * Not a missing default: the default was there and **the control could not show it.** The DTO ships
 * `"17:00:00"` (the column is `time`, and `contract.ts:155` documents the format and names the FE as the
 * formatter); the `Select` offers `"09:00" … "17:00"`; **a Mantine `Select` given a value that is not one of its
 * options renders EMPTY** — and because the value was truthy, the submit guard never fired.
 *
 * 🔑 **The two sightings that looked contradictory are one cause:** @Tanya read the VALUE (`10:00:00`) and the
 * owner saw the EFFECT (an empty field). ⚠️ **It worked for whoever overrode the default and failed for whoever
 * accepted it** — which is why it took the owner's own night on `uat` to find.
 */

describe("🔑 the format the DTO actually ships", () => {
  it('"17:00:00" → "17:00" — the exact value from the owner\'s course', () => {
    expect(toTimeSlot("17:00:00")).toBe("17:00");
    expect(resumeDefaultTime("17:00:00")).toBe("17:00");
  });

  it('"10:00:00" → "10:00" — @Tanya\'s Round-12 sighting, the same defect she read as a value', () => {
    expect(resumeDefaultTime("10:00:00")).toBe("10:00");
  });

  it("an already-clean value is untouched — TASK-288's assertion still holds", () => {
    expect(resumeDefaultTime("17:00")).toBe("17:00");
  });
});

describe("🔴 slicing is NOT the rule — membership is", () => {
  it('"17:30:00" slices to a NON-slot, so it falls back rather than going out empty again', () => {
    // 🔑 This is the assertion that separates the fix from the obvious one: `.slice(0, 5)` gives `"17:30"`,
    // which `TIME_SLOTS` does not contain, and the field would be empty for exactly the same reason.
    expect("17:30:00".slice(0, 5)).toBe("17:30");
    expect(TIME_SLOTS).not.toContain("17:30");
    expect(toTimeSlot("17:30:00")).toBe(FALLBACK_TIME);
  });

  it("absent, empty and malformed all land on a VISIBLE time", () => {
    expect(toTimeSlot(null)).toBe(FALLBACK_TIME);
    expect(toTimeSlot(undefined)).toBe(FALLBACK_TIME);
    expect(toTimeSlot("")).toBe(FALLBACK_TIME);
    expect(toTimeSlot("garbage")).toBe(FALLBACK_TIME);
    expect(toTimeSlot("23:00:00")).toBe(FALLBACK_TIME);
  });

  it("🔑 the RESULT is always a member — that is the whole promise", () => {
    const inputs = [null, undefined, "", "garbage", "17:00:00", "17:30:00", "09:00", "23:00:00", "9:0"];
    for (const v of inputs) expect(TIME_SLOTS).toContain(toTimeSlot(v));
    // And the fallback is itself a slot — the return type says so, this says it out loud.
    expect(TIME_SLOTS).toContain(FALLBACK_TIME);
  });

  it("🚫 it never invents a time — a non-member becomes the fallback, not the nearest slot", () => {
    expect(toTimeSlot("17:30:00")).not.toBe("17:00");
    expect(toTimeSlot("17:30:00")).not.toBe("18:00");
  });
});

describe("🔴 §3 — the SECOND call site, which nobody had reported", () => {
  const modal = readFileSync("src/components/partials/Bookings/PlanModal.tsx", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  it("the MOVE dialog seeds through the same rule", () => {
    // `seed.startTime` is a plan row from the same DTO, feeding the same `TIME_SLOTS` Select — so it opened
    // empty too, on the everyday path, for exactly the same reason.
    expect(modal).toContain("toTimeSlot(seed?.startTime, TIME_SLOTS[0])");
  });

  it("🚫 the three DISPLAY sites are untouched — the contract's promise is kept where it was already kept", () => {
    // ⚠️ The defect was never that the value has seconds. Changing the DTO would have broken these three and a
    // documented contract to fix one place that forgot to call the rule.
    expect(modal.match(/startTime\.slice\(0, 5\)/g)?.length).toBe(3);
  });
});

describe("🔴 @Tanya Round 13 — the typed value that never became a value", () => {
  const dialog = readFileSync("src/components/partials/Bookings/DropResumeDialog.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("the time field is not searchable — its text can no longer differ from its value", () => {
    // She read the DOM and reported "a hidden third input still carrying 10:00:00, so the field the admin edits
    // is not the field submitted". There is no third input — there is exactly ONE resume submitter in this repo
    // — but a `searchable` Select's search box is not its value: type, do not pick, and it reverts on blur.
    expect(dialog).not.toContain("searchable");
  });

  it("🔑 and there is still exactly one place that submits a resume", () => {
    expect(dialog.match(/resume\.mutateAsync/g)?.length).toBe(1);
  });
});
