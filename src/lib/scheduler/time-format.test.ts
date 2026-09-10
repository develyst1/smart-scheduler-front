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
    // ⚠️ **COMMENT-STRIPPED, and it is the sixth time this week.** Written against the raw file, this failed
    // when TASK-329 §2 added a doc comment that NAMES `formatTimeDisplay` while explaining that the contract
    // does not use it. **The rule is about the CODE; the prose is allowed to discuss it.**
    const contract = codeOf("src/types/api/contract.ts");
    expect(contract).toContain("startTime: HhMm;");
    expect(contract).not.toContain("formatTimeDisplay");
  });
});

describe("🔵 TASK-326 §1 — the two sites the sweep missed", () => {
  const sites: Array<[string, string]> = [
    ["src/components/partials/Calendar/CalendarWeekGrid.tsx", "formatTimeDisplay(b.startTime)"],
    ["src/components/partials/Checkin/CheckinContent.tsx", "formatTimeDisplay(b.startTime)"],
  ];

  for (const [file, call] of sites) {
    it(file.split("/").pop()!, () => {
      // Neither was showing seconds — both receive `toBookingDTO`'s `hhmm()` output. Routed anyway, for the
      // reason TASK-324 settled: a renderer correct only because a mapper elsewhere is correct breaks silently
      // the day that mapper moves. ⚠️ `CheckinContent` is a PUBLIC page with its own local type, fetched
      // directly — the least protected of the nine.
      expect(codeOf(file)).toContain(call);
    });
  }

  it("🚫 `CheckinContent` no longer needs its own empty-guard for the end time", () => {
    // `formatTimeDisplay` absorbs it: absent → "" is the helper's contract, the same one `formatDateDisplay`
    // keeps. One fallback, in one place.
    expect(codeOf("src/components/partials/Checkin/CheckinContent.tsx")).not.toContain("b.endTime ?? \"\"");
  });
});

describe("🔻 TASK-326 §2 — the lockstep sentence now exists in this repo", () => {
  it("is on the row it documents, not on the one it would be false about", () => {
    // BE `contract.ts:156` documents `PlanSessionRow.startTime`. The FE's contract copy has no such type, and
    // its only `startTime` is `BookingDTO`'s — which IS `hhmm()`-mapped, so the comment would be a lie there.
    const appTypes = readFileSync("src/types/app/scheduler/index.ts", "utf8");
    expect(appTypes).toContain("As stored (`HH:mm:ss`) — unchanged by TASK-184; the FE formats.");
    expect(readFileSync("src/types/api/contract.ts", "utf8")).not.toContain("As stored");
  });

  it("🚫 comment only — no type was changed to carry it", () => {
    const appTypes = readFileSync("src/types/app/scheduler/index.ts", "utf8");
    // ⚠️ Scoped to `PlanSession`, twice over, and both narrowings were forced by running it:
    //   1. LINE-ANCHORED — as a plain `not.toContain` it failed on the doc comment that EXPLAINS the removal,
    //      which quotes the old declaration. **Fifth time this week; a ban must match the DECLARATION.**
    //   2. SCOPED TO THIS INTERFACE — file-wide it then failed on `Booking`, `RescheduleTarget` and
    //      `CoursePackage`, whose `// HH:mm` annotations are all TRUE (the first two are `hhmm()`-mapped, the
    //      third is a client-side literal). 🔑 **The annotations were an accurate map of which payloads are
    //      normalised — the plan row's was the one that lied, which is exactly the payload that is not mapped.**
    const block = appTypes.slice(appTypes.indexOf("export interface PlanSession {"));
    const planSession = block.slice(0, block.indexOf("\n}"));
    // The field is still a plain `string`, exactly as before; only the prose above it is new.
    expect(planSession).toContain("  startTime: string;");
    expect(planSession).not.toMatch(/^\s*startTime: string; \/\/ HH:mm$/m);
  });
});

describe("🔵 TASK-329 §3 — the last three sites, and NOTHING renders differently", () => {
  const sites: Array<[string, string]> = [
    ["src/components/partials/Calendar/Modal/BookingModal.tsx", "formatTimeDisplay(booking.startTime)"],
    ["src/components/partials/Calendar/PausedTray.tsx", "formatTimeDisplay(b.startTime)"],
  ];

  for (const [file, call] of sites) {
    it(file.split("/").pop()!, () => {
      expect(codeOf(file)).toContain(call);
    });
  }

  it("🔴 the adjacent-lines finding is closed — date AND time both formatted, in the same call", () => {
    // Before: `date: formatDateDisplay(b.date)` and `time: b.startTime`, one line apart. The whole of TASK-324
    // visible in two lines, in a call no grep for a render shape could find.
    for (const f of sites.map(([file]) => codeOf(file))) {
      expect(f).toMatch(/date: formatDateDisplay\([\w.]+\.date\),\s*\n\s*time: formatTimeDisplay\(/);
      expect(f).not.toMatch(/time: (booking|b)\.startTime,/);
    }
  });

  it("🔑 nothing renders differently — the property that makes this safe to land mid-test", () => {
    // Every site touched here receives `toBookingDTO`'s `hhmm()` output, and `formatTimeDisplay` is a
    // `slice(0, 5)` ⇒ on an `HH:mm` input it is the IDENTITY. So the pixels are unchanged and @Tanya has
    // nothing to re-check. ⚠️ This is the assertion, not the claim.
    for (const v of ["09:00", "17:30", "23:59", "00:00"]) expect(formatTimeDisplay(v)).toBe(v);
  });
});

describe("🔻 TASK-329 §1/§2 — the header stops promising, and the type stops claiming", () => {
  const raw = readFileSync("src/types/api/contract.ts", "utf8");

  it("§1 the header no longer promises lockstep, and says what a type here IS", () => {
    // ⚠️ **The FIRST LINE, not the file — and this is the SEVENTH instance of the trap this week, the second
    // inside this one task.** A file-wide `not.toContain("keep in lockstep")` failed because the new header
    // QUOTES the old promise while explaining that it was false. 🔑 **The claim a file makes is its opening
    // line; the prose below is allowed to quote what it replaced.**
    const firstLine = raw.split("\n")[0];
    expect(firstLine).not.toContain("Synced from");
    expect(firstLine).toContain("The shapes this FE expects from the API");
    expect(raw).toContain("this repo's CLAIM about the wire, not the BE's declaration");
    // It also names the two facts that made the old claim false, so the next reader does not re-derive them.
    expect(raw).toContain("17 of");
    expect(raw).toContain("PlanSessionRow");
  });

  it("§2 `ExpiryWarningSession.startTime` matches what the BE actually declares", () => {
    const block = raw.slice(raw.indexOf("export interface ExpiryWarningSession {"));
    const iface = block.slice(0, block.indexOf("\n}"));
    expect(iface).toContain("startTime?: string | null;");
    expect(iface).not.toMatch(/^\s*startTime\?: HhMm \| null;$/m);
  });

  it("🚫 §1 is COMMENT ONLY — no type was moved, renamed or deleted", () => {
    // The 17 FE-only exports and the three verified-TRUE `// HH:mm` annotations all stay untouched (§4).
    const code = codeOf("src/types/api/contract.ts");
    // ⚠️ `interface` OR `type` — `CourseListItem` and `CourseStatusCounts` are type aliases, and a loop that
    // assumed `interface` failed on the first of them. The rule is that the EXPORT survives, not its keyword.
    for (const name of ["ExpiryWarning", "ResumeCourseResponse", "PostedSale", "Paged", "CourseListItem"]) {
      expect(code).toMatch(new RegExp(`export (interface|type) ${name}\\b`));
    }
    expect(code).toContain("export type HhMm = string;");
  });
});
