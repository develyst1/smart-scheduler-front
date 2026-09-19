import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { MENU_KEYS } from "@/lib/rbac/menus";
import { NAV_ITEMS } from "@/components/layout/AdminLayout/AdminLayout.config";
import CampDayBanner from "@/components/partials/Calendar/CampDayBanner";
import { bannerWeeksFor, creditDays, creditLabel, datesBetween, redeemBody, sellCampBody, weeksByMonth } from "./units";

/**
 * REQ-095 Stage 3a / SPEC-082 / TASK-402 — Balance camp on the FE: the Camp menu (weeks · roster · sell · redeem ·
 * mark), the student's Camp card (credit in UNITS ⇒ days + ½), the calendar day banner from `campWeeks`. 🚫 No client
 * rule: units, capacity, credit, the transitions are the server's; 🚫 no expiry anywhere (there is none); the four
 * prices come from `GET /camp/prices`, never a constant.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const svc = codeOf("src/services/camp.service.ts");
const sell = codeOf("src/components/partials/Camp/SellCampDialog.tsx");
const redeem = codeOf("src/components/partials/Camp/RedeemDialog.tsx");
const roster = codeOf("src/components/partials/Camp/WeekRoster.tsx");
const content = codeOf("src/components/partials/Camp/CampContent.tsx");
const card = codeOf("src/components/partials/Camp/CampCardModal.tsx");
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));

describe("§1 — the pure arithmetic (units ⇒ days + ½), value-tested", () => {
  it("creditDays / creditLabel: 9 units = 4½ days · 10 = 5 · 1 = ½ · 0 = 0; never negative, never a rule", () => {
    expect(creditDays(9)).toEqual({ days: 4, half: true });
    expect(creditDays(10)).toEqual({ days: 5, half: false });
    expect(creditDays(1)).toEqual({ days: 0, half: true });
    expect(creditDays(0)).toEqual({ days: 0, half: false });
    expect(creditDays(-3)).toEqual({ days: 0, half: false });
    expect(creditLabel(9)).toBe("4½");
    expect(creditLabel(10)).toBe("5");
    expect(creditLabel(1)).toBe("½");
    expect(creditLabel(0)).toBe("0");
    // the card renders the label and the server's numbers; nothing computes credit here
    expect(card).toContain('t("camp.daysLeft", { n: creditLabel(p.credit) })');
    expect(card).not.toMatch(/totalUnits\s*-|usedUnits\s*\+|expir/i);
  });

  it("the banner's date math: only OPEN weeks covering the date, each with that day's server count; weeks group by month", () => {
    const weeks = [
      { id: "a", name: "Camp A", startDate: "2026-10-05", endDate: "2026-10-09", status: "OPEN" as const, dayCounts: { "2026-10-06": 7 } },
      { id: "b", name: "Camp B", startDate: "2026-10-06", endDate: "2026-10-06", status: "CLOSED" as const, dayCounts: { "2026-10-06": 2 } },
      { id: "c", name: "Camp C", startDate: "2026-11-02", endDate: "2026-11-06", status: "OPEN" as const, dayCounts: {} },
    ];
    expect(bannerWeeksFor(weeks, "2026-10-06")).toEqual([{ week: weeks[0], kids: 7 }]);
    expect(bannerWeeksFor(weeks, "2026-10-07")).toEqual([{ week: weeks[0], kids: 0 }]); // covered, nobody planned that day
    expect(bannerWeeksFor(weeks, "2026-10-10")).toEqual([]);
    expect(bannerWeeksFor(undefined, "2026-10-06")).toEqual([]);
    expect(weeksByMonth(weeks).map((g) => [g.month, g.weeks.map((w) => w.id)])).toEqual([["2026-10", ["a", "b"]], ["2026-11", ["c"]]]);
    expect(datesBetween("2026-10-05", "2026-10-09")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(datesBetween("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
  });

  it("the bodies: sell (days only on DAILY, firstWeek only with ticks, dates sorted) · redeem (dates sorted)", () => {
    expect(sellCampBody({ studentId: "s", kind: "FULL", plan: "FULL_WEEK", days: 3 })).toEqual({ studentId: "s", kind: "FULL", plan: "FULL_WEEK" });
    expect(sellCampBody({ studentId: "s", kind: "HALF", plan: "DAILY", days: 3, note: "  " })).toEqual({ studentId: "s", kind: "HALF", plan: "DAILY", days: 3 });
    expect(sellCampBody({ studentId: "s", kind: "FULL", plan: "FULL_WEEK", discount: { kind: "BAHT", value: 1000, reason: "early bird" }, firstWeek: { weekId: "w", dates: ["2026-10-07", "2026-10-06"], half: "FULL" } })).toEqual({
      studentId: "s",
      kind: "FULL",
      plan: "FULL_WEEK",
      discount: { kind: "BAHT", value: 1000, reason: "early bird" },
      firstWeek: { weekId: "w", dates: ["2026-10-06", "2026-10-07"], half: "FULL" },
    });
    expect("firstWeek" in sellCampBody({ studentId: "s", kind: "FULL", plan: "FULL_WEEK", firstWeek: { weekId: "w", dates: [], half: "FULL" } })).toBe(false);
    expect(redeemBody("w", ["2026-10-08", "2026-10-06"], "AM")).toEqual({ weekId: "w", dates: ["2026-10-06", "2026-10-08"], half: "AM" });
  });
});

describe("§2 — the wire and the doors", () => {
  it("the routes and bodies as confirmed; every write re-reads camp + the calendar; the prices from GET /camp/prices", () => {
    expect(svc).toContain('api.get<CampPrices>("/camp/prices")');
    expect(svc).toContain('api.get<{ weeks: CampWeek[] }>("/camp/weeks", { params: { from, to } })');
    expect(svc).toContain('api.post<{ week: CampWeek }>("/camp/weeks", {');
    expect(svc).toContain("api.patch<{ week: CampWeek }>(`/camp/weeks/${id}`, {");
    expect(svc).toContain("api.get<CampWeekDays>(`/camp/weeks/${id}/days`)");
    expect(svc).toContain('api.get<{ packages: CampPackage[] }>("/camp/packages", { params: { studentId } })');
    expect(svc).toContain('"/camp/packages", sellCampBody(input))');
    expect(svc).toContain("`/camp/packages/${packageId}/days`, redeemBody(weekId, dates, half))");
    expect(svc).toContain("api.patch<{ package: CampPackage }>(`/camp/days/${dayId}`, markBody(status, reason))"); // TASK-404 — the body via the pure `markBody` (reason only on the undo)
    const hooks = codeOf("src/hooks/scheduler/useCamp.ts");
    expect(hooks).toContain("void qc.invalidateQueries({ queryKey: CAMP_KEY });");
    expect(hooks).toContain("void qc.invalidateQueries({ queryKey: CALENDAR_KEY });");
    // the price on the sell form is the card's item (× days on DAILY); no number of its own
    expect(sell).toContain("const item = prices?.items.find((i) => i.kind === kind && i.plan === plan);");
    expect(sell).toContain("item.priceMinor * days");
    expect(sell).not.toMatch(/11500|5900|2600|1300|1150000/);
    // early bird = the existing discount block, nothing special
    expect(sell).toContain("<DiscountSection fullMinor={fullMinor} value={discount} onChange={setDiscount} serverProblems={problems} />");
    expect(sell).not.toMatch(/earlyBird|early_bird/);
  });

  it("the keys: the four doors by their acts; `menu:camp` in the registry after Badges and on the nav; hidden not disabled", () => {
    expect(MENU_KEYS[6]).toBe("menu:camp");
    expect(NAV_ITEMS.find((i) => i.key === "camp")).toMatchObject({ href: "/scheduler/camp", menuKey: "menu:camp", labelKey: "nav.camp" });
    expect(NAV_ITEMS.findIndex((i) => i.key === "camp")).toBe(NAV_ITEMS.findIndex((i) => i.key === "badges") + 1);
    for (const k of ["action:camp.week-open", "action:camp.sell", "action:camp.redeem", "action:camp.day-mark"]) expect(ACTION_KEYS_SNAPSHOT).toContain(k);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(54);
    expect(content).toContain('{can("action:camp.week-open") && (');
    expect(roster).toContain('{can("action:camp.sell") && (');
    expect(roster).toContain('{can("action:camp.redeem") && week.status === "OPEN" && (');
    expect(roster).toContain('{can("action:camp.day-mark") && e.status !== "CANCELLED" && (');
    for (const f of [content, roster, card, sell, redeem]) expect(f).not.toMatch(/disabled=\{!can\(/);
    expect(codeOf("src/app/(admin)/scheduler/camp/page.tsx")).toContain("<CampContent />");
  });

  it("the roster: a column per date with count/cap from the server; Mark offers the three server words; redeem keeps the ticks on a 409; the picker is limited to the week", () => {
    expect(roster).toContain("data-count={`${d.count}/${d.capacity ?? \"∞\"}`}");
    expect(roster).toContain('{CAMP_MARKS.filter((m) => m !== e.status).map((m) => (');
    expect(roster).toContain("await mark.mutateAsync({ dayId, status });");
    // the cap is SHOWN, not enforced here: the one comparison colours the badge red, nothing dims, disables or hides on it
    expect((roster.match(/d\.count >= d\.capacity/g) ?? []).length).toBe(1);
    expect(roster).not.toMatch(/aria-disabled|opacity:|capacity\s*-\s*count|count\s*<\s*(d\.)?capacity/);
    const catchBlock = redeem.slice(redeem.indexOf("} catch (e) {"), redeem.indexOf("return ("));
    expect(catchBlock).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(catchBlock).not.toContain("setDates");
    expect(redeem).toContain("<MultiDateField value={dates} onChange={setDates} minDate={week.startDate} maxDate={week.endDate} />");
    expect(redeem).toContain("await redeem.mutateAsync({ packageId: chosen.id, weekId: week.id, dates, half });");
    expect(redeem).toContain("const withCredit = packages.filter((p) => p.credit > 0);"); // the server's number, shown as choices — not a rule
  });

  it("the calendar day banner renders from `campWeeks`: name · n kids, one row per open week, nothing on an uncovered day; click ⇒ the Camp menu", () => {
    const weeks = [
      { id: "a", name: "Camp A", startDate: "2026-10-05", endDate: "2026-10-09", status: "OPEN" as const, dayCounts: { "2026-10-06": 7 } },
      { id: "b", name: "Closed B", startDate: "2026-10-06", endDate: "2026-10-06", status: "CLOSED" as const, dayCounts: { "2026-10-06": 2 } },
    ];
    const html = render(h(CampDayBanner, { campWeeks: weeks, date: "2026-10-06" }));
    expect(html).toContain('data-camp-banner="2026-10-06"');
    expect(html).toContain("Camp A");
    expect(html).toContain("7");
    expect(html).not.toContain("Closed B");
    expect(html).toContain('href="/scheduler/camp"');
    const base = render(h("span", null)).replace("<span></span>", "");
    expect(render(h(CampDayBanner, { campWeeks: weeks, date: "2026-10-20" }))).toBe(base);
    // mounted above the DAY grid only; the payload field is typed and read `?.campWeeks`
    const cal = codeOf("src/components/partials/Calendar/CalendarContent.tsx");
    expect(cal).toContain("<CampDayBanner campWeeks={calendar?.campWeeks} date={date} />");
    expect(cal.indexOf("<CampDayBanner")).toBeLessThan(cal.search(/<CalendarGrid\s/)); // the grid, not its skeleton
    expect(cal.indexOf("<CampDayBanner")).toBeGreaterThan(cal.indexOf('view === "day" ? ('));
    expect(codeOf("src/types/api/contract.ts")).toContain("campWeeks?: CampWeekLiteDTO[];");
  });

  it("copy: camp 60 · nav.camp — both languages; the Camp card door on every student row", () => {
    const en = dictionaries.en.camp as Record<string, string>;
    const th = dictionaries.th.camp as Record<string, string>;
    expect(Object.keys(en).length).toBe(69); // TASK-402: 60 · TASK-404: +9 (undo ×7, qr ×2)
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    expect(dictionaries.en.nav.camp).toBe("Camp");
    expect(dictionaries.th.nav.camp.length).toBeGreaterThan(0);
    expect(codeOf("src/components/partials/People/PeopleContent.tsx")).toContain("<CampCardModal student={{ id: campTarget.id, name: campTarget.nickname || campTarget.name }}");
  });
});
