import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";

/**
 * 🔴 TASK-324 — **there was no formatter for a time a human reads, and the date has had one since TASK-129.**
 *
 * 🔑 That asymmetry is the whole finding: **dates got a function, times never did**, so every time on screen
 * was a local decision — seven sites, three trimming inline and four doing nothing. The owner reported the
 * result four times in one week, and each report looked like its own one-line bug.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("🔑 the helper itself", () => {
  it("trims the seconds the API documents it will send", () => {
    expect(formatTimeDisplay("15:00:00")).toBe("15:00");
    expect(formatTimeDisplay("09:30:00")).toBe("09:30");
  });

  it("leaves an already-clean time alone", () => {
    expect(formatTimeDisplay("17:00")).toBe("17:00");
  });

  it("absent → empty string, the same contract `formatDateDisplay` keeps", () => {
    expect(formatTimeDisplay(null)).toBe("");
    expect(formatTimeDisplay(undefined)).toBe("");
    expect(formatTimeDisplay("")).toBe("");
    expect(formatDateDisplay(null)).toBe("");
  });

  it("🚫 a TRIM, not a parse — so it cannot change what the three inline sites rendered", () => {
    // A `dayjs` parse would "improve" a malformed value into something else, silently altering three call
    // sites that were already correct. Byte-identical to the expression they used to hold:
    for (const v of ["15:00:00", "17:00", "9:0", "garbage", "23:59:59"]) {
      expect(formatTimeDisplay(v)).toBe(v.slice(0, 5));
    }
  });
});

describe("🔴 the four raw sites now use it", () => {
  const sites: Array<[string, string]> = [
    ["src/components/common/ExpiryWarningAlert.tsx", "formatTimeDisplay(s.startTime)"],
    ["src/components/partials/Bookings/EditExpiryDialog.tsx", "formatTimeDisplay(s.startTime)"],
    ["src/components/partials/Bookings/BookingsTable.tsx", "formatTimeDisplay(b.startTime)"],
    ["src/components/partials/Bookings/CreateCourseModal.tsx", "formatTimeDisplay(b.startTime)"],
  ];

  for (const [file, call] of sites) {
    it(file.split("/").pop()!, () => {
      // ⚠️ Asserted PER SITE, not by a file-wide "no raw startTime" ban — that would fail on `Select` VALUES,
      // which are keys and not displays (TASK-295, `PlanModal`'s `toTimeSlot(seed?.startTime, …)`).
      expect(codeOf(file)).toContain(call);
    });
  }

  it("🚫 and the `Select` value is untouched — a key is not a display", () => {
    const modal = codeOf("src/components/partials/Bookings/PlanModal.tsx");
    expect(modal).toContain("toTimeSlot(seed?.startTime, TIME_SLOTS[0])");
    expect(modal).not.toContain("formatTimeDisplay(seed?.startTime)");
  });
});

describe("🚫 the contract is untouched — the FE is still the formatter, by agreement", () => {
  it("this task changed nothing about what arrives", () => {
    // The fix is ONE PLACE TO FORMAT, not a change to the payload.
    //
    // 🔻 **Found while writing this assertion: the sentence everyone cites is not in this file.** *"As stored
    // (`HH:mm:ss`) — the FE formats"* lives at **`smart-scheduler-back/src/types/contract.ts:156`**, and this
    // copy — whose own first line says *"Synced … keep in lockstep"* — never received it. TASK-295 and
    // TASK-324 both cite "contract.ts:155" for a line that exists only on the other side. Reported, not fixed.
    // ⚠️ Asserted on THIS repo only: a test reaching into a sibling checkout by relative path breaks for
    // anyone whose layout differs, which is a worse trade than the coverage it buys.
    const contract = readFileSync("src/types/api/contract.ts", "utf8");
    expect(contract).toContain("startTime: HhMm;");
    expect(contract).not.toContain("formatTimeDisplay");
  });
});
