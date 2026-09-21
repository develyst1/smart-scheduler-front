import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { MENU_KEYS } from "@/lib/rbac/menus";
import { settingHelp } from "@/lib/scheduler/setting-help";
import { QrPanel } from "@/components/common/QrDialog";
import { CAMP_TOKEN_EXPIRED, CAMP_UNDO_FROM, canUndoCampDay, checkinEndpointFor, markBody } from "./units";

/**
 * REQ-095 Stage 3b / TASK-404 — `Undo` on an attended/absent camp day (a reason ⇒ PLANNED, the same route and key as
 * a mark), the day's check-in QR on the roster (lazy, the SHARED `QrDialog` — the first and only QR component on the
 * FE), the camp token on the public check-in page (one page, two kinds, the path says which; `410 CAMP_TOKEN_EXPIRED`
 * draws the clock), and the `camp_reminder_enabled` flag rendered by the existing Settings page with its pending note.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const svc = codeOf("src/services/camp.service.ts");
const hooks = codeOf("src/hooks/scheduler/useCamp.ts");
const roster = codeOf("src/components/partials/Camp/WeekRoster.tsx");
const undo = codeOf("src/components/partials/Camp/UndoDayDialog.tsx");
const qr = codeOf("src/components/common/QrDialog.tsx");
const checkin = codeOf("src/components/partials/Checkin/CheckinContent.tsx");
const campRoute = codeOf("src/app/checkin/camp/page.tsx");
const contract = codeOf("src/types/api/contract.ts");

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));
const lookup = (dict: Record<string, unknown>) => (key: string, vars?: Record<string, string | number>) => {
  const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
  if (typeof v !== "string") return key;
  return Object.entries(vars ?? {}).reduce((s, [k, x]) => s.split(`{${k}}`).join(String(x)), v);
};

describe("§1 — the pure shapes", () => {
  it("markBody: a mark carries `status` alone; the undo is `status: PLANNED` + a trimmed `reason` — never a reason on a mark", () => {
    expect(markBody("ATTENDED")).toEqual({ status: "ATTENDED" });
    expect("reason" in markBody("ATTENDED", "typed by mistake")).toBe(false);
    expect(markBody("CANCELLED")).toEqual({ status: "CANCELLED" });
    expect(markBody("PLANNED", "  wrong child  ")).toEqual({ status: "PLANNED", reason: "wrong child" });
    expect(markBody("PLANNED")).toEqual({ status: "PLANNED", reason: "" }); // the server's 400, not a client rule
  });
  it("undo leaves ATTENDED | ABSENT only; PLANNED and CANCELLED have no undo", () => {
    expect([...CAMP_UNDO_FROM]).toEqual(["ATTENDED", "ABSENT"]);
    expect(canUndoCampDay("ATTENDED")).toBe(true);
    expect(canUndoCampDay("ABSENT")).toBe(true);
    expect(canUndoCampDay("PLANNED")).toBe(false);
    expect(canUndoCampDay("CANCELLED")).toBe(false);
  });
  it("the check-in endpoint follows the KIND (the path), never the token", () => {
    expect(checkinEndpointFor("session")).toBe("/checkin");
    expect(checkinEndpointFor("camp")).toBe("/checkin/camp");
    expect(CAMP_TOKEN_EXPIRED).toBe("CAMP_TOKEN_EXPIRED");
  });
});

describe("§2 — the undo on the wire and the roster", () => {
  it("the service: one route for mark and undo, the body from `markBody`; the hook forwards `reason`; the day rows carry `undoReason`", () => {
    expect(svc).toContain("export const markCampDay = async (dayId: string, status: CampDayStatusWrite, reason?: string): Promise<CampPackage> =>");
    expect(svc).toContain("api.patch<{ package: CampPackage }>(`/camp/days/${dayId}`, markBody(status, reason))");
    expect(hooks).toContain("({ dayId, status, reason }: { dayId: string; status: CampDayStatusWrite; reason?: string }) => markCampDay(dayId, status, reason)");
    expect(contract.match(/undoReason: string \| null;/g)?.length).toBe(3); // CampDayEntry · CampPackageDay · the public day
  });
  it("the dialog: ONE call `{ status: PLANNED, reason }`; the reason is required by presence only — the bounds are the server's sentence", () => {
    expect(undo).toContain('await mark.mutateAsync({ dayId: entry.dayId, status: "PLANNED", reason });');
    expect(undo).toContain("disabled={reason.trim().length === 0}");
    expect(undo).not.toMatch(/length\s*[<>]=?\s*(3|200)\b/); // no client copy of 3..200
    expect(undo).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(undo).not.toContain("undoReason ="); // nothing computed here
  });
  it("the roster: `Undo` sits INSIDE the `camp.day-mark` menu, only for ATTENDED|ABSENT; the entry shows `undoReason`", () => {
    const gate = roster.indexOf('{can("action:camp.day-mark") && e.status !== "CANCELLED" && (');
    const item = roster.indexOf("{canUndoCampDay(e.status) && (");
    const close = roster.indexOf("</Menu>");
    expect(gate).toBeGreaterThan(-1);
    expect(item).toBeGreaterThan(gate);
    expect(close).toBeGreaterThan(item);
    expect(roster).toContain("onClick={() => setUndo({ entry: e, date: d.date })}");
    expect(roster).toContain("{e.undoReason && (");
    expect(roster).toContain('{t("camp.undoneLine", { reason: e.undoReason })}');
    expect(roster).toContain("<UndoDayDialog opened entry={undo.entry} date={undo.date}");
  });
});

describe("§3 — the QR: one shared component, lazy, PLANNED only", () => {
  it("exactly ONE file on the FE draws a QR, and it is the shared dialog", () => {
    const users = walk("src").filter((p) => readFileSync(p, "utf8").includes('from "qrcode.react"'));
    expect(users.map((p) => p.replace(/\\/g, "/"))).toEqual(["src/components/common/QrDialog.tsx"]);
    expect(qr).toContain("<QRCodeSVG value={url}");
    expect(qr).not.toMatch(/checkin\?token|\/checkin/); // draws what it is given; composes nothing
  });
  it("the roster mints lazily (`GET /camp/days/:id/checkin` only while the dialog is open) and mounts the SHARED dialog, on a PLANNED entry only", () => {
    expect(svc).toContain("api.get<CampDayCheckin>(`/camp/days/${dayId}/checkin`)");
    expect(hooks).toContain("queryFn: () => getCampDayCheckin(dayId as string), enabled: !!dayId");
    expect(roster).toContain('import QrDialog from "@/components/common/QrDialog";');
    expect(roster).toContain("const qr = useCampDayCheckin(qrDayId);");
    expect(roster).toMatch(/\{e\.status === "PLANNED" && \(\s*<ActionIcon[^>]*aria-label=\{t\("camp\.qr"\)\}[^>]*onClick=\{\(\) => setQrDayId\(e\.dayId\)\}/);
    expect(roster).toContain("url={qr.data?.url}");
    expect(roster).toContain("expiresAt={qr.data?.expiresAt}");
    expect(roster).not.toContain("useCampDayCheckin(e.dayId)"); // never one fetch per entry
  });
  it("rendered: the panel draws an <svg> for the URL it is given and prints the URL; nothing while loading", () => {
    const url = "http://localhost:3000/checkin/camp?token=abc";
    const html = render(h(QrPanel, { url, expiresAt: "2026-09-19T20:00:00.000Z", subtitle: "Nong A · 19 Sep · Full" }));
    expect(html).toContain("<svg");
    expect(html).toContain(`data-qr-url="${url}"`);
    expect(html).toContain("Nong A · 19 Sep · Full");
    expect(html).toContain("Copy link");
    const loading = render(h(QrPanel, { loading: true }));
    expect(loading).not.toContain("<svg");
    expect(loading).not.toContain("data-qr-url");
  });
});

describe("§4 — the public page: one page, two token kinds", () => {
  it("the path picks the endpoint; the camp shape renders the day and its undone line; 410 CAMP_TOKEN_EXPIRED draws the clock", () => {
    expect(checkin).toContain('export default function CheckinContent({ kind = "session" }: { kind?: CheckinKind })');
    expect(checkin).toContain("await fetch(`${API_BASE}${checkinEndpointFor(kind)}`, {");
    expect(checkin).toContain('if (kind === "camp") setPhase({ kind: "camp", result: data as CampCheckinResult });');
    expect(checkin).toContain('setPhase({ kind: "error", message, code: data?.error?.code });');
    expect(checkin).toContain("code === CAMP_TOKEN_EXPIRED ||");
    expect(checkin).toContain('{d.undoReason && <p className="text-xs text-muted-500">{t("checkin.undone", { reason: d.undoReason })}</p>}');
    expect(checkin).not.toMatch(/token\.(startsWith|includes|split)/); // the token never says which kind
    expect(campRoute).toContain('<CheckinContent kind="camp" />');
    expect(codeOf("src/app/checkin/page.tsx")).toContain("<CheckinContent />"); // the session's page unchanged
    for (const lang of ["en", "th"] as const) for (const k of ["campTitle", "date", "half", "status", "undone"]) expect((dictionaries[lang].checkin as Record<string, string>)[k]?.length).toBeGreaterThan(0);
  });
});

describe("§5 — the reminder flag through the existing Settings page; the registries unchanged", () => {
  it("the option words and the pending note exist in both languages; the note comes from `settingHelp` (no row-specific code on the page)", () => {
    for (const lang of ["en", "th"] as const) {
      const s = dictionaries[lang].settings as { opt: Record<string, Record<string, string>>; help: Record<string, string> };
      expect(Object.keys(s.opt.camp_reminder_enabled)).toEqual(["off", "on"]);
      expect(s.help.camp_reminder_enabled.length).toBeGreaterThan(0);
    }
    expect(settingHelp(lookup(dictionaries.en as unknown as Record<string, unknown>), "camp_reminder_enabled", "off")).toBe("Reminder copy pending owner approval");
    expect(settingHelp(lookup(dictionaries.th as unknown as Record<string, unknown>), "camp_reminder_enabled", "on")).toBe("ข้อความแจ้งเตือนรอเจ้าของอนุมัติ");
    expect(codeOf("src/components/partials/Settings/SettingsContent.tsx")).not.toContain("camp_reminder"); // the server's row, rendered generically
    expect(codeOf("src/services/settings.mock.service.ts")).toContain('{ key: "camp_reminder_enabled", label: "ส่งแจ้งเตือน LINE วันแคมป์ (08:15)", type: "enum", unit: "option", default: "off", options: ["off", "on"] }');
  });
  it("snapshot unchanged: 54 actions, 13 menus; the undo uses the mark's key", () => {
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(57) /* TASK-427: + teachers.budget-view */; // TASK-407 (teacher-leave) and TASK-412 (parent-archive) came after this task
    expect(MENU_KEYS.length).toBe(13);
    expect(undo).not.toContain("action:"); // the door is the roster's menu (day-mark); the dialog asks nothing more
    const camp = dictionaries.en.camp as Record<string, string>;
    for (const k of ["undo", "undoTitle", "undoLine", "undoReason", "undoReasonHint", "undoneOk", "undoneLine", "qr", "qrTitle"]) expect(camp[k]?.length).toBeGreaterThan(0);
    for (const k of ["copy", "copied", "expires"]) expect((dictionaries.th.qr as Record<string, string>)[k]?.length).toBeGreaterThan(0);
  });
});
