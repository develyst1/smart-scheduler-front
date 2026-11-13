import { describe, expect, it, afterEach } from "bun:test";
import { createElement as h, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { emptyPatternRow, patternPayload, type PatternRow } from "@/lib/scheduler/weekly-pattern";
import WeeklyPatternEditor from "./WeeklyPatternEditor";

/**
 * 🔴 **TASK-970 (REQ-5016 F1, SPEC-109 §3.1) — the weekly-pattern editor, clicked: rows of day · time · coach, add / remove.** It only edits rows; what the screen may SEND from them is `patternPayload`.
 * 🔑 What can go wrong without anyone seeing it: «Add» that adds nothing or a row that opens on the wrong coach, a remove that removes the wrong row (or the last one), a row picked wrongly (Sunday read as
 * empty), a refusal not said in words, an editor that lets a 22nd row in. Every assertion is a count, a string or a body — never an element.
 */
const TEACHERS = [
  { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง" },
  { id: "t2", name: "ครูสอง", nickname: "สอง" },
];
let latest: PatternRow[] = [];
const Host = ({ start, seed }: { start: PatternRow[]; seed?: string | null }) => {
  const [rows, setRows] = useState(start);
  latest = rows;
  return h(WeeklyPatternEditor, { rows, onChange: setRows, teachers: TEACHERS, seedTeacherId: seed });
};
const mount = (start: PatternRow[], seed?: string | null) => {
  latest = start;
  return render(h(MantineProvider, null, h(I18nProvider, null, h(Host, { start, seed }))));
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
/** Open one select (by its data attribute) and press the option with exactly this label — in THAT select's own listbox. */
const pick = async (user: ReturnType<typeof userEvent.setup>, sel: string, label: string) => {
  const input = document.querySelector(sel) as HTMLElement;
  await user.click(input);
  const options = () => [...(document.getElementById(input.getAttribute("aria-controls") ?? "")?.querySelectorAll('[role="option"]') ?? [])];
  await waitFor(() => expect(options().length).toBeGreaterThan(0));
  await user.click(options().find((o) => o.textContent === label) as HTMLElement);
};
const full = (weekday: number, startTime: string, teacherId: string): PatternRow => ({ weekday, startTime, teacherId });

afterEach(cleanup);

describe("🔴 TASK-970 — the editor's rows", () => {
  it("🔑 one row per entry; «Add a class» appends an EMPTY row that opens on the seeded coach (and on no coach without a seed)", async () => {
    const user = userEvent.setup();
    mount([emptyPatternRow()], "t2");
    expect(q("[data-pattern-row]")).toBe(1);
    await user.click(document.querySelector("[data-pattern-add]") as HTMLElement);
    expect(q("[data-pattern-row]")).toBe(2);
    expect(latest[1]).toEqual({ weekday: null, startTime: null, teacherId: "t2" });
    cleanup();
    mount([emptyPatternRow()]);
    await user.click(document.querySelector("[data-pattern-add]") as HTMLElement);
    expect(latest[1].teacherId).toBeNull();
  });

  it("🔑 a row is filled by its three pickers: day (Sunday counts as 0, not empty), time (every half hour), coach", async () => {
    const user = userEvent.setup();
    mount([emptyPatternRow()]);
    await pick(user, '[data-pattern-day="0"]', "Sun");
    await pick(user, '[data-pattern-time="0"]', "10:30");
    await pick(user, '[data-pattern-coach="0"]', "สอง");
    expect(latest[0]).toEqual({ weekday: 0, startTime: "10:30", teacherId: "t2" });
  });

  it("🔑 remove takes out THAT row only, and the last row cannot be removed", async () => {
    const user = userEvent.setup();
    mount([full(1, "10:00", "t1"), full(2, "11:00", "t1"), full(4, "12:00", "t2")]);
    await user.click(document.querySelector('[data-pattern-remove="1"]') as HTMLElement);
    expect(latest.map((r) => `${r.weekday}|${r.startTime}`)).toEqual(["1|10:00", "4|12:00"]);
    await user.click(document.querySelector('[data-pattern-remove="0"]') as HTMLElement);
    expect(latest.length).toBe(1);
    expect((document.querySelector('[data-pattern-remove="0"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("🔑 «Add a class» stops at 21 rows", () => {
    mount(Array.from({ length: 21 }, (_, i) => full(i % 7, `${String(7 + Math.floor(i / 7)).padStart(2, "0")}:00`, "t1")));
    expect(q("[data-pattern-row]")).toBe(21);
    expect((document.querySelector("[data-pattern-add]") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("🔴 TASK-970 — what the editor says, and what it lets the sale send", () => {
  it("🔑 a half-filled row says so in words; the sale body is `null` (nothing sent) while it stands", () => {
    mount([full(1, "10:00", "t1"), emptyPatternRow()]);
    expect(document.querySelector("[data-pattern-issue]")?.getAttribute("data-pattern-issue")).toBe("incomplete");
    expect(text()).toContain(dictionaries.en.weeklyPattern.incomplete);
    expect(patternPayload(true, latest)).toBeNull();
  });

  it("🔑 two rows on one day and time say `duplicate`", () => {
    mount([full(1, "10:00", "t1"), full(1, "10:00", "t2")]);
    expect(document.querySelector("[data-pattern-issue]")?.getAttribute("data-pattern-issue")).toBe("duplicate");
    expect(text()).toContain(dictionaries.en.weeklyPattern.duplicate);
  });

  it("🔑 ONE complete row says it is a normal weekly class, and the sale body stays today's (`{}`)", () => {
    mount([full(1, "10:00", "t1")]);
    expect(q("[data-pattern-one-row]")).toBe(1);
    expect(q("[data-pattern-issue]")).toBe(0);
    expect(patternPayload(true, latest)).toEqual({});
  });

  it("🔑 two complete rows: no issue, no one-row note, and the body is the `pattern` in order", () => {
    mount([full(1, "10:00", "t1"), full(4, "12:00", "t2")]);
    expect(q("[data-pattern-issue]") + q("[data-pattern-one-row]")).toBe(0);
    expect(patternPayload(true, latest)).toEqual({
      pattern: [
        { weekday: 1, startTime: "10:00", teacherId: "t1" },
        { weekday: 4, startTime: "12:00", teacherId: "t2" },
      ],
    });
  });
});

describe("✅ TASK-970 — the words exist in both languages", () => {
  it("🔑 every key of the block, TH and EN, none empty; the TH toggle is the owner's word", () => {
    for (const k of Object.keys(dictionaries.en.weeklyPattern) as (keyof typeof dictionaries.en.weeklyPattern)[]) {
      expect(dictionaries.en.weeklyPattern[k].length).toBeGreaterThan(1);
      expect(dictionaries.th.weeklyPattern[k].length).toBeGreaterThan(1);
    }
    expect(dictionaries.th.weeklyPattern.toggle).toBe("วันเรียนหลายวัน");
  });
});
