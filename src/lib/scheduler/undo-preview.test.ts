import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { canConfirm, previewLines, previewNothingElse, previewState, refusalOf } from "./undo-preview";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { UndoPreview } from "@/types/api/contract";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const control = codeOf("src/components/common/UndoControl.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");
const en = dictionaries.en.undo as unknown as Record<string, string>;
const th = dictionaries.th.undo as unknown as Record<string, string>;

const ok = (over: Partial<Extract<UndoPreview, { ok: true }>> = {}): UndoPreview => ({
  ok: true,
  kind: "leave",
  leaveRefunded: false,
  makeupCancelled: null,
  expiry: null,
  ...over,
});
const refused: UndoPreview = { ok: false, code: "UNDO_DAY_SETTLED", message: "วันนี้ปิดยอดแล้ว" };

describe("TASK-547 §2 — the four states of a forecast", () => {
  it("loading · failed · refused · ready, and a failed REQUEST outranks any body it happens to hold", () => {
    expect(previewState(undefined, true, false)).toBe("loading");
    expect(previewState(undefined, false, true)).toBe("failed");
    expect(previewState(undefined, false, false)).toBe("failed"); // asked, no answer, not loading ⇒ we do not know
    // 🔑 the one that matters: an error with a stale body is still FAILED — the words must say we could not check
    expect(previewState(ok(), false, true)).toBe("failed");
    expect(previewState(refused, false, false)).toBe("refused");
    expect(previewState(ok(), false, false)).toBe("ready");
  });

  it("🔑 only a REFUSAL blocks the act — a failed check does not, because the act is the authority", () => {
    expect(canConfirm("ready")).toBe(true);
    expect(canConfirm("failed")).toBe(true); // a preview outage must not stop a legitimate undo
    expect(canConfirm("refused")).toBe(false); // the act's own read half already said no
    expect(canConfirm("loading")).toBe(false); // a 200 ms wait, not a verdict
  });

  it("the refusal is the server's sentence, and exists only when the server refused", () => {
    expect(refusalOf(refused)).toBe("วันนี้ปิดยอดแล้ว");
    expect(refusalOf(ok())).toBeNull();
    expect(refusalOf(undefined)).toBeNull();
  });
});

describe("TASK-547 §2 — the lines, and only the lines the server gave", () => {
  it("each fact appears only when the preview states it, in a fixed order", () => {
    expect(previewLines(ok({ leaveRefunded: true }))).toEqual([{ key: "undo.previewLeaveBack" }]);
    expect(previewLines(ok({ makeupCancelled: { id: "x", date: "2026-11-04" } }))).toEqual([
      { key: "undo.previewMakeupOff", vars: { date: "2026-11-04" } },
    ]);
    expect(previewLines(ok({ expiry: { from: "2026-11-11", to: "2026-11-04" } }))).toEqual([
      { key: "undo.previewExpiry", vars: { from: "2026-11-11", to: "2026-11-04" } },
    ]);
    const all = previewLines(ok({ leaveRefunded: true, makeupCancelled: { id: "x", date: "2026-11-04" }, expiry: { from: "a", to: "b" } }));
    expect(all.map((l) => l.key)).toEqual(["undo.previewLeaveBack", "undo.previewMakeupOff", "undo.previewExpiry"]);
  });

  it("🚫 nothing is listed for a refusal, a failure, or a fact the preview did not state", () => {
    expect(previewLines(refused)).toEqual([]);
    expect(previewLines(undefined)).toEqual([]);
    // 🔑 an absent make-up is not "no make-up" — it is nothing to say, which is why the empty case has its own sentence
    expect(previewLines(ok())).toEqual([]);
    expect(previewNothingElse(ok())).toBe(true);
    expect(previewNothingElse(ok({ leaveRefunded: true }))).toBe(false);
    expect(previewNothingElse(refused)).toBe(false); // a refusal is not "nothing else follows"
    expect(previewNothingElse(undefined)).toBe(false);
  });
});

describe("TASK-547 §2 — the wire and the dialog", () => {
  it("the preview is the BE's route, asked only while the dialog is open, and never retried", () => {
    expect(svc).toContain("api.get<UndoPreview>(`/bookings/${bookingId}/undo-preview`)");
    expect(hooks).toContain("queryKey: [\"undo-preview\", bookingId],");
    expect(hooks).toContain("retry: false,");
    expect(control).toContain("const preview = useUndoPreview(booking.id, open);");
  });

  it("🚫 the failure path is NOT skipped because the forecast was clean", () => {
    // the act's own catch is untouched and still shows the server's sentence verbatim
    expect(control).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    // 🔑 and nothing in the control lets a clean preview stand in for the act's answer
    expect(control).not.toMatch(/if \(state === "ready"\)[^]*?return/);
    expect(control).not.toContain("preview.data.ok &&");
  });

  it("each state has its own words, and a FAILED preview renders no forecast of its own", () => {
    for (const s of ["loading", "failed", "refused", "ready"]) expect(control).toContain(`{state === "${s}" && (`);
    expect(control).toContain('t("undo.previewLoading")');
    expect(control).toContain('t("undo.previewFailed")');
    expect(control).toContain('title={t("undo.previewRefused")}');
    expect(control).toContain("{refusalOf(preview.data)}"); // the sentence itself, unwrapped and unworded
    expect(control).toContain('t("undo.previewForecast")');
    // the forecast's heading and lines live ONLY in the ready branch
    const ready = control.slice(control.indexOf('{state === "ready" && ('));
    expect(ready).toContain('t("undo.previewHeading")');
    const failed = control.slice(control.indexOf('{state === "failed" && ('), control.indexOf('{state === "refused" && ('));
    expect(failed).not.toContain("previewHeading");
    expect(failed).not.toContain("previewNothingElse");
  });
});

describe("TASK-547 §3 — the words (DRAFT, pinned by the shape of the claim)", () => {
  const KEYS = ["previewHeading", "previewLeaveBack", "previewMakeupOff", "previewExpiry", "previewNothingElse", "previewForecast", "previewLoading", "previewFailed", "previewRefused"];

  it("both languages carry all nine, with the placeholders the code passes", () => {
    for (const d of [en, th]) {
      for (const k of KEYS) expect(d[k].trim().length).toBeGreaterThan(0);
      expect(d.previewMakeupOff).toContain("{date}");
      expect(d.previewExpiry).toContain("{from}");
      expect(d.previewExpiry).toContain("{to}");
    }
  });

  it("🔑 the forecast is worded as a FORECAST — so a refusal after the click is not a contradiction", () => {
    expect(en.previewHeading.toLowerCase()).toContain("would");
    expect(en.previewForecast.toLowerCase()).toContain("may still refuse");
    expect(th.previewForecast).toContain("ปฏิเสธ");
    // 🚫 no promise words anywhere in the forecast family
    for (const d of [en, th]) {
      for (const k of ["previewHeading", "previewLeaveBack", "previewMakeupOff", "previewExpiry"]) {
        expect(d[k].toLowerCase()).not.toContain("guarantee");
        expect(d[k]).not.toContain("แน่นอน");
      }
    }
  });

  it("🔑 the failed-check words say we could NOT check, and do not describe an outcome", () => {
    expect(en.previewFailed.toLowerCase()).toContain("could not check");
    expect(en.previewFailed.toLowerCase()).toContain("still undo");
    expect(th.previewFailed).toContain("ตรวจไม่ได้");
    // 🚫 it must not claim the quota or the make-up in either direction — that is the defect, restated politely
    for (const d of [en, th]) {
      expect(d.previewFailed).not.toMatch(/quota|โควตา/);
      expect(d.previewFailed).not.toMatch(/make-?up|คาบชดเชย/);
    }
  });

  it("🔴 `previewRefused` is a HEADING only — the refusal itself is never our words", () => {
    // it must not contain a reason of its own: no because/เพราะ, no named code
    for (const d of [en, th]) {
      expect(d.previewRefused).not.toMatch(/because|เพราะ/i);
      expect(d.previewRefused).not.toMatch(/UNDO_/);
    }
    expect(en.previewRefused.trim().endsWith(":")).toBe(true);
    expect(th.previewRefused.trim().endsWith(":")).toBe(true);
  });

  it("📌 the vocabulary is shared with the dialog and the toast — not three features", () => {
    // the pre-leave dialog, the Undo forecast and the outcome toast all speak of the quota and the make-up the same way
    const pre = dictionaries.en.confirmAction as unknown as Record<string, string>;
    expect(pre.leaveMsg).toContain("make-up session");
    expect(en.previewMakeupOff).toContain("make-up session");
    expect(pre.leaveMsgCourseLocked).toContain("leave quota");
    expect(en.previewLeaveBack).toContain("quota");
  });
});
