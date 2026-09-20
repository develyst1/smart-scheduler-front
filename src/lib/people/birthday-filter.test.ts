import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import BirthdayFilter from "@/components/partials/People/BirthdayFilter";
import { EMPTY_BIRTHDAY, MONTHS, birthdayActive, birthdayQuery, formatDob } from "./birthday-filter";

/**
 * REQ-099 / TASK-414/415 — the People page's `Birthday` control (a month range OR `No DOB recorded`, exclusive — the
 * server's rule mirrored, the server still deciding), the student list that replaces the families view while it is
 * set (the server's order; name · nickname · DOB `DD-MM-YYYY` or `—` · phone), the families back on clear. 🚫 No
 * client filtering by month or null, no sort. No key.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/People/PeopleContent.tsx");
const control = codeOf("src/components/partials/People/BirthdayFilter.tsx");
const svc = codeOf("src/services/student.service.ts");
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));

describe("§1 — the pure query builder, value-tested", () => {
  it("unset / half-set ⇒ null; a range ⇒ the two months; noDob ⇒ the boolean-string — never both; `q` carried, trimmed", () => {
    expect(birthdayQuery(EMPTY_BIRTHDAY)).toBeNull();
    expect(birthdayQuery({ from: 11, to: null, noDob: false })).toBeNull();
    expect(birthdayActive({ from: null, to: 2, noDob: false })).toBe(false);
    expect(birthdayQuery({ from: 11, to: 2, noDob: false }, "  som ")).toEqual({ q: "som", birthMonthFrom: 11, birthMonthTo: 2, limit: 200 });
    expect(birthdayQuery({ from: 11, to: 2, noDob: false })).toEqual({ birthMonthFrom: 11, birthMonthTo: 2, limit: 200 });
    const both = birthdayQuery({ from: 3, to: 5, noDob: true }, "x");
    expect(both).toEqual({ q: "x", noDob: "true", limit: 200 });
    expect("birthMonthFrom" in (both ?? {})).toBe(false);
    expect([...MONTHS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("the DOB reads `DD-MM-YYYY`, null reads `—`", () => {
    expect(formatDob("2018-11-05")).toBe("05-11-2018");
    expect(formatDob("2018-11-05T00:00:00.000Z")).toBe("05-11-2018");
    expect(formatDob(null)).toBe("—");
    expect(formatDob(undefined)).toBe("—");
    expect(formatDob("nonsense")).toBe("—");
  });
});

describe("§2 — the wire and the page", () => {
  it("the list is the SAME `GET /students` with the built params; nothing filters or sorts on the FE", () => {
    expect(svc).toContain('const { data } = await api.get<StudentsResponse>("/students", { params });');
    expect(page).toContain("const birthdayParams = birthdayQuery(birthday, debounced);");
    expect(page).toContain("useBirthdayStudents(birthdayParams)");
    expect(codeOf("src/hooks/scheduler/useStudents.ts")).toContain("enabled: params !== null,");
    const list = page.slice(page.indexOf("{birthdayParams !== null ? ("), page.indexOf(') : phase === "skeleton" ? ('));
    expect(list).not.toMatch(/\.(sort|filter)\(/); // the server's order and set
    expect(list).toContain("{birthdayRows!.map((s) => (");
    expect(list).toContain("{formatDob(s.birthDate)}");
    expect(list).toContain('{t("people.birthdayFound", { n: birthdayRows!.length })}');
    expect(list).toContain('{t("people.birthdayEmpty")}');
    expect(page).not.toMatch(/birthDate\s*(===|!==|==|!=)\s*null/); // no null test of my own
    expect(page).not.toMatch(/getMonth\(|\.month\(/); // no month arithmetic of my own
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(56); // no key
  });
  it("set ⇒ the student list INSTEAD of the families (the skeleton/families branch is the else); cleared ⇒ the families", () => {
    expect(page).toContain("{birthdayParams !== null ? (");
    expect(page).toContain(') : phase === "skeleton" ? (');
    expect(control).toContain("onClick={() => onChange(EMPTY_BIRTHDAY)}");
    expect(page).toContain("<BirthdayFilter value={birthday} onChange={setBirthday} />");
  });
  it("rendered: the control reads `Birthday` when unset, the range when set, `No DOB recorded` when the switch is on; the range greys under the switch", () => {
    const off = render(h(BirthdayFilter, { value: EMPTY_BIRTHDAY, onChange: () => {} }));
    expect(off).toContain('data-birthday="off"');
    expect(off).toContain(">Birthday<");
    expect(off).not.toContain("Clear");
    const range = render(h(BirthdayFilter, { value: { from: 11, to: 2, noDob: false }, onChange: () => {} }));
    expect(range).toContain('data-birthday="on"');
    expect(range).toMatch(/Nov → Feb/);
    expect(range).toContain("Clear");
    const noDob = render(h(BirthdayFilter, { value: { from: 11, to: 2, noDob: true }, onChange: () => {} }));
    expect(noDob).toContain('data-birthday="on"');
    expect(noDob).toMatch(/>No DOB recorded</);
    expect(noDob).not.toMatch(/Nov → Feb/);
    // BOTH selects grey under the switch (source — the dropdown is a portal); 📌 a pin on one alone let the other stay live
    expect(control.match(/disabled=\{value\.noDob\}/g)?.length).toBe(2);
    expect(control.match(/<Select[\s\S]*?\/>/g)?.length).toBe(2);
  });
  it("copy: people +8, both languages", () => {
    for (const k of ["birthday", "birthdayHint", "birthdayFrom", "birthdayTo", "birthdayNoDob", "birthdayClear", "birthdayFound", "birthdayEmpty"]) {
      expect((dictionaries.en.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
