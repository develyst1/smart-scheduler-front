import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "bun:test";

/**
 * 🔴 TASK-339 — **stop counting raw time renders by eye.**
 *
 * The count went **4 → 6 → 9 → 11**, and every miss after the first was the same shape: **three were a `value=`
 * PROP and five were a `t()` ARGUMENT KEY.** ⇒ *"We keep sweeping for a RENDER."* Twice the wrong number was
 * @Sober's and twice it was mine — **which makes it a method problem, not a carelessness one.**
 *
 * 🔑 **This checks the `t()`-argument shape**, which is the larger half and the one that hid longest. ⚠️ **It
 * does NOT cover the `value=` prop shape** — see the limit note at the bottom, stated rather than implied.
 */

/**
 * Blank out comments **while preserving offsets and newlines**, so a reported line number is the REAL one.
 * 🔻 My first version stripped comments by deleting them and reported line numbers from the shortened text —
 * **I nearly quoted those to @Sober as file positions.** A sweep whose output cannot be looked up is worse than
 * no sweep: it sends the next reader to the wrong line and costs them the trust to check.
 */
const blank = (m: string) => m.replace(/[^\n]/g, " ");
const stripKeepingOffsets = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/.*$/gm, blank);

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return tsxFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [p] : [];
  });

/** Top-level `key: value` pairs of the object literal opening at `open`, with each value's offset. */
const topLevelEntries = (src: string, open: number): Array<{ key: string; value: string; at: number }> => {
  const out: Array<{ key: string; value: string; at: number }> = [];
  let depth = 0;
  let expectKey = true;
  let token = "";
  let key = "";
  let valueStart = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      depth++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) {
        if (!expectKey) out.push({ key, value: src.slice(valueStart, i).trim(), at: valueStart });
        break;
      }
      continue;
    }
    if (depth !== 1) continue;
    if (expectKey) {
      if (/[A-Za-z0-9_$]/.test(c)) token += c;
      else if (c === ":") {
        key = token;
        token = "";
        expectKey = false;
        valueStart = i + 1;
      } else if (c === ",") token = "";
      else if (!/\s/.test(c)) token = "";
    } else if (c === ",") {
      out.push({ key, value: src.slice(valueStart, i).trim(), at: valueStart });
      expectKey = true;
      token = "";
    }
  }
  return out;
};

type Hit = { where: string; id: string; key: string; value: string };

/**
 * 🔻 **Identity is FILE + EXPRESSION, never `file:line` — and I learned that by breaking my own check.**
 *
 * TASK-339 pinned `file:line`. Adding the comments this task's fixes carry moved every pinned line and **three
 * assertions went red for no reason but their own brittleness.** ⇒ a pin that a comment can break teaches the
 * next person to delete it. **The expression is what the rule is about; the line is only how a human finds it**
 * — so `where` (with the line) is for reading, and `id` is what anything asserts on.
 */
const identify = (file: string, value: string) => `${file.replace("src/components/", "")} | ${value.trim()}`;

/** Every `key: value` inside a bare `t(…, { … })` argument object, across the components tree. */
const tArgumentEntries = (): Array<Hit & { file: string }> => {
  const hits: Array<Hit & { file: string }> = [];
  for (const file of tsxFiles("src/components")) {
    const src = stripKeepingOffsets(readFileSync(file, "utf8"));
    for (let i = src.indexOf("t("); i >= 0; i = src.indexOf("t(", i + 1)) {
      // A BARE `t(` only — `format(`, `.at(` and friends end in an identifier character.
      if (/[A-Za-z0-9_$.]/.test(src[i - 1] ?? "")) continue;
      const brace = src.indexOf("{", i);
      const close = src.indexOf(")", i);
      if (brace < 0 || brace > close) continue; // `t("key")` with no argument object
      for (const e of topLevelEntries(src, brace)) {
        const line = src.slice(0, e.at).split("\n").length;
        hits.push({ file, where: `${file.replace("src/components/", "")}:${line}`, id: identify(file, e.value), key: e.key, value: e.value });
      }
    }
  }
  return hits;
};

/**
 * 🔑 **The discriminator is the VALUE, not the key.** Five `time:` keys in this tree pass a locally formatted
 * timestamp (`fmtTime(lastRun.finishedAt)`, `fmtDateTime(data.generatedAt)`, `arrivedText`) — they are not
 * booking times and no exemption should pretend they are. **Keying on a DTO field access excludes them by
 * MEANING rather than by allow-list**, which is the difference between a rule and a list of apologies.
 */
const TIME_KEYS = new Set(["time", "startTime", "endTime"]);
const DTO_TIME_FIELD = /\.(startTime|endTime)\b/;

const rawTimeHits = () =>
  tArgumentEntries().filter(
    (h) => TIME_KEYS.has(h.key) && DTO_TIME_FIELD.test(h.value) && !h.value.includes("formatTimeDisplay("),
  );

/**
 * Known, REPORTED and deliberately unfixed — **each with its reason at the entry** (TASK-322's rule).
 * 🚫 TASK-339 §4 forbids any product-code change, so these cannot be fixed here; they were reported in
 * TASK-329 §3 and @Sober has them to cut.
 */
const KNOWN_OPEN: Record<string, string> = {
  "partials/Calendar/Modal/BookingModal.tsx | blocked.startTime":
    "`t('booking.blockedDesc', { …, time: blocked.startTime })` — reported in TASK-329 §3, awaiting @Sober's cut. Not showing seconds today (a DTO-mapped booking), so it is a latent break, not a live defect.",
  // 🔻 `CancelBookingDialog | booking?.startTime` was the second entry and is GONE, not moved: TASK-340 fixed
  // it, because its `date:` sibling in the SAME `t()` call was being formatted and leaving the time raw would
  // have AUTHORED the adjacent-lines defect rather than inherited it. **An allow-list entry outliving its
  // defect is the same class as a comment outliving its mechanism** — so it is deleted, with the reason here.
};

describe("🔑 the shape sweep — a `t()` argument carrying an unformatted DTO time", () => {
  it("finds exactly the two already reported — a NEW one fails here", () => {
    const found = rawTimeHits().map((h) => h.id).sort();
    expect(found).toEqual(Object.keys(KNOWN_OPEN).sort());
  });

  it("🚫 no bare exemptions — every known-open entry carries its reason", () => {
    for (const reason of Object.values(KNOWN_OPEN)) expect(reason.length).toBeGreaterThan(40);
  });

  it("🔑 the sweep actually reaches the code — it sees the FIXED sites too", () => {
    // A check that finds nothing because it is looking nowhere passes just as quietly as a clean tree. These
    // two are TASK-329's fixes; if the scanner stopped working, this line goes first.
    const formatted = tArgumentEntries().filter(
      (h) => TIME_KEYS.has(h.key) && h.value.includes("formatTimeDisplay("),
    );
    // ⚠️ THREE now, not two: TASK-340 added `CancelBookingDialog`'s, and this line going red is how I found
    // out — which is the pin doing its job in the direction that matters. A formatted site appearing is as
    // much a change to the sweep's world as a raw one.
    expect(formatted.map((h) => h.id).sort()).toEqual([
      'partials/Calendar/Modal/CancelBookingDialog.tsx | booking ? formatTimeDisplay(booking.startTime) : "—"',
      "partials/Calendar/Modal/BookingModal.tsx | formatTimeDisplay(booking.startTime)",
      "partials/Calendar/PausedTray.tsx | formatTimeDisplay(b.startTime)",
    ].sort());
  });

  it("⚪ a locally formatted timestamp is NOT in class, and is excluded by meaning", () => {
    // `time: fmtTime(lastRun.finishedAt)` is a job-run clock, not a booking time. Keying on `.startTime` /
    // `.endTime` excludes it without an exemption — no allow-list entry has to apologise for it.
    const all = tArgumentEntries().filter((h) => TIME_KEYS.has(h.key));
    expect(all.length).toBeGreaterThan(rawTimeHits().length);
    expect(all.some((h) => h.value.includes("fmtTime("))).toBe(true);
  });
});

/**
 * ⚠️ **The limit, stated rather than implied.** This covers the `t()`-argument shape — **5 of the 11 sites.**
 * It does NOT cover:
 *   • the **`value=` prop** shape (3 of 11) — a prop's value is an arbitrary expression with no key to key on;
 *   • a DTO time reaching `t()` through a **local variable** (`const x = b.startTime; t(k, { time: x })`).
 * 🔑 Both are real gaps. **Naming them is the point:** the previous four counts were each believed complete.
 */

// ───────────────────────────── TASK-340 — the same shape, carrying DATES ─────────────────────────────

/**
 * 🔴 TASK-340 §2 — **the sweep widened, exactly as TASK-339 §3 said it should be.**
 *
 * ⚠️ The date keys were the half of that finding that is a **defect**: these values are UNFORMATTED, not
 * differently-formatted. 🚫 The five LOCAL formatters (`fmtTime`, `fmtDate` ×2, `fmtDateTime` ×2) are the other
 * half — **they format, they just do not share** — and *"may this surface legitimately format differently?"* is
 * a product decision that is with the owner. **They are asserted untouched below, with that reason.**
 */
const DATE_KEYS = new Set(["date", "startDate", "endDate"]);
const DTO_DATE_FIELD = /\.(date|expiryDate|postedAt)\b/;

const rawDateHits = () =>
  tArgumentEntries().filter(
    (h) => DATE_KEYS.has(h.key) && DTO_DATE_FIELD.test(h.value) && !h.value.includes("formatDateDisplay("),
  );

describe("🔵 TASK-340 — a `t()` argument carrying an unformatted DTO date", () => {
  it("finds none — all four are routed", () => {
    expect(rawDateHits().map((h) => h.id).sort()).toEqual([]);
  });

  it("🔑 the sweep still reaches the code — the FORMATTED date sites are pinned", () => {
    // Same two-directional guard as the time half: if the scanner stopped seeing dates, an empty raw list would
    // look identical to a clean tree. This line goes red first.
    const formatted = tArgumentEntries().filter(
      (h) => DATE_KEYS.has(h.key) && h.value.includes("formatDateDisplay("),
    );
    expect(formatted.length).toBeGreaterThanOrEqual(10);
    expect(formatted.map((h) => h.id)).toContain("partials/Calendar/Modal/CancelBookingDialog.tsx | booking ? formatDateDisplay(booking.date) : \"—\"");
  });

  it("🚫 §3/§5 — the five LOCAL formatters are untouched, and this is why", () => {
    // They FORMAT; they just do not share `formatDateDisplay`. That is MONEY's state — one shared helper and
    // several private ones — and whether a surface may legitimately format differently is the owner's call,
    // sitting with @Porter beside the money duplication and the copied `ATTENDEE_NOTE_MAX`.
    // 🚫 Routing them here would decide that question by accident, in a task whose scope is unformatted values.
    const local: Array<[string, string]> = [
      ["src/components/partials/Attention/AttentionContent.tsx", "const fmtTime"],
      ["src/components/partials/Bookings/ImportBalanceModal.tsx", "const fmtDate"],
      ["src/components/partials/Overview/OverviewContent.tsx", "const fmtDateTime"],
      ["src/components/partials/Som/SomContent.tsx", "const fmtDate"],
      ["src/components/partials/Som/SomContent.tsx", "const fmtDateTime"],
    ];
    for (const [file, decl] of local) expect(readFileSync(file, "utf8")).toContain(decl);
  });
});
