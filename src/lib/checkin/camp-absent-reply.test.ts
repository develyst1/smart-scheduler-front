import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { CampSuccessView } from "@/components/partials/Checkin/CheckinContent";
import type { CampCheckinResult } from "@/types/api/contract";

/**
 * 🔴 TASK-483 — a camp day the coach marked **ABSENT** must not be reported as a check-in. The refusal is the server's
 * and it is correct (TASK-480); what misled the nanny at the counter was the SCREEN: a green tick and "Already checked
 * in", with `Status: Absent` four lines down. So the pins here are about the MARK and the HEADLINE, by rendering —
 * asserting the success mark is ABSENT, not merely that some text changed.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const content = codeOf("src/components/partials/Checkin/CheckinContent.tsx");
const shop = codeOf("src/components/partials/Checkin/ShopfrontCheckinContent.tsx");

const reply = (status: string, already: boolean): CampCheckinResult =>
  ({ already, day: { dayId: "d1", weekId: "w1", date: "2026-09-27", half: "AM", units: 1, status, undoReason: null } }) as unknown as CampCheckinResult;
const html = (r: CampCheckinResult) => renderToString(h(MantineProvider, null, h(I18nProvider, null, h(CampSuccessView, { result: r }))));
const seen = (s: string) =>
  s
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("§1 — ABSENT is recorded, not checked in", () => {
  it("no success mark and no green: the mark is neutral, by rendering", () => {
    const out = html(reply("ABSENT", true));
    expect(out).toContain('data-camp-mark="neutral"');
    // 🔑 the ABSENCE of the success mark — the thing the nanny actually reads
    expect(out).not.toContain('data-camp-mark="success"');
    expect(out).not.toContain("bg-success");
    expect(out).not.toContain("lucide-circle-check"); // the tick's own class, whatever the wrapper does
    expect(out).toContain("lucide-clipboard-list");
  });
  it("the headline says already RECORDED, in both languages, and the status stays readable", () => {
    expect(seen(html(reply("ABSENT", true)))).toContain("Already recorded");
    expect(seen(html(reply("ABSENT", true)))).not.toContain("Already checked in");
    expect(seen(html(reply("ABSENT", true)))).toContain("Absent"); // the fact is still there, just no longer the only clue
    expect(dictionaries.en.checkin.recordedTitle).toBe("Already recorded");
    expect(dictionaries.th.checkin.recordedTitle).toBe("บันทึกแล้ว");
    expect(Object.keys(dictionaries.en.checkin).length).toBe(Object.keys(dictionaries.th.checkin).length);
  });
  it("🚫 an ATTENDED reply is untouched — green tick, 'already checked in'; and a fresh scan still reads as a success", () => {
    const already = html(reply("ATTENDED", true));
    expect(already).toContain('data-camp-mark="success"');
    expect(already).toContain("bg-success");
    expect(seen(already)).toContain("Already checked in");
    expect(seen(already)).not.toContain("Already recorded");
    const fresh = html(reply("ATTENDED", false));
    expect(fresh).toContain('data-camp-mark="success"');
    expect(seen(fresh)).toContain("Check-in complete");
    // the other statuses keep the success face too — this page must not look anxious about every repeat scan
    for (const s of ["PLANNED", "CANCELLED"]) expect(html(reply(s, true))).toContain('data-camp-mark="success"');
  });
});

describe("§2 — both doors, one component", () => {
  it("the SHOP-FRONT path renders this very view, so the poster's door shows the new shape too", () => {
    expect(shop).toContain('import { API_BASE, CampSuccessView, SuccessView, type CheckinResult } from "./CheckinContent";');
    expect(shop).toContain("<CampSuccessView result={phase.result} />");
    // and the roster-link door is the same component in the same file (one branch, not two)
    expect(content).toContain("{phase.kind === \"camp\" && <CampSuccessView result={phase.result} />}");
    expect((content.match(/export function CampSuccessView/g) ?? []).length).toBe(1);
  });
  it("the view branches on the SERVER's status and nothing else", () => {
    expect(content).toContain('const absent = d.status === "ABSENT";');
    expect(content).not.toMatch(/absent\s*=\s*[^;]*(already|undoReason|units)/);
  });
});
