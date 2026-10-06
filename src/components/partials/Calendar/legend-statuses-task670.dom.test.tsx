import { describe, expect, it, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { STATUS_LEGEND } from "./Calendar.config";
import CalendarLegendBar from "./CalendarLegendBar";

/**
 * 🔴 **TASK-670 (5b) — the legend says what the red cells mean.** NO_SHOW and CANCELLED both draw red on the grid and the
 * legend did not list them, so a red cell had no key. The owner ruled both in; their labels (`bookingStatus.*`) already
 * exist and are approved, so **no new words** — this asserts the legend shows the EXISTING labels.
 */

const en = dictionaries.en.bookingStatus as Record<string, string>;
const mount = () => render(h(MantineProvider, null, h(I18nProvider, null, h(CalendarLegendBar))));

afterEach(cleanup);

describe("🔴 TASK-670 (5b) — the status legend", () => {
  it("🔑 NO_SHOW and CANCELLED are in it, drawn on screen with the existing approved labels", () => {
    mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain(en.NO_SHOW); // "No-show"
    expect(text).toContain(en.CANCELLED); // "Cancelled"
    expect(STATUS_LEGEND).toContain("NO_SHOW");
    expect(STATUS_LEGEND).toContain("CANCELLED");
  });

  it("the six statuses that were already there are all still there, in their order", () => {
    expect(STATUS_LEGEND.slice(0, 6)).toEqual(["CONFIRMED", "ATTENDED", "PENDING", "SICK_LEAVE", "EXTENDED", "PENDING_RESCHEDULE"]);
    mount();
    for (const s of STATUS_LEGEND) expect(document.body.textContent).toContain(en[s]);
  });

  it("every chip carries an icon (shape beside colour) — including the two new ones", () => {
    mount();
    // each legend chip is `<span class=…border…><svg/>label</span>`; count the status chips by their labels
    const chips = [...document.querySelectorAll("span.font-bold")].filter((c) => STATUS_LEGEND.some((s) => c.textContent === en[s]));
    expect(chips.length).toBe(STATUS_LEGEND.length);
    expect(chips.every((c) => c.querySelectorAll("svg").length === 1)).toBe(true);
  });
});
