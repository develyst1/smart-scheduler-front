import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { endedLabel, voucherChip, voucherDoors } from "./voucher";

/**
 * REQ-103 / SPEC-089 B / TASK-440 — the voucher card's `Cancel voucher` door (the course's key), the ONE cancel
 * dialog for both entitlements, the `ENDED · Nh left` chip from the server's `status` + frozen `remaining`, the
 * book rule mirrored. 🚫 No client status derivation — asserted.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const panel = codeOf("src/components/partials/Bookings/VoucherPanel.tsx");
const dialog = codeOf("src/components/partials/Bookings/EndCourseDialog.tsx");
const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");
const service = codeOf("src/services/scheduler.service.ts");
const lib = codeOf("src/lib/scheduler/voucher.ts");

/** The provider's own interpolation is a plain `{name}` replace — mirrored here on the raw dictionary string. */
const render = (lang: "en" | "th", key: string, args: Record<string, number> = {}) => {
  const hit = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dictionaries[lang]) as string;
  return Object.entries(args).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), hit);
};

describe("§1 — voucherDoors / endedLabel / voucherChip, by value", () => {
  it("cancel: the key AND not ENDED; book: exactly the server's usable (ACTIVE); an older payload without `status` reads as bookable and cancellable", () => {
    const g = { cancel: true };
    expect(voucherDoors(g, { status: "ACTIVE", remaining: 6 })).toEqual({ cancel: true, book: true });
    expect(voucherDoors(g, { status: "ENDED", remaining: 6 })).toEqual({ cancel: false, book: false });
    expect(voucherDoors(g, { status: "EXHAUSTED", remaining: 0 })).toEqual({ cancel: true, book: false });
    expect(voucherDoors(g, { status: "EXPIRED", remaining: 3 })).toEqual({ cancel: true, book: false });
    expect(voucherDoors({ cancel: false }, { status: "ACTIVE", remaining: 6 })).toEqual({ cancel: false, book: true });
    expect(voucherDoors(g, { remaining: 6 })).toEqual({ cancel: true, book: true });
  });
  it("`ENDED · 7h left` — the frozen `remaining`, in both languages; the chip family: ENDED red, EXPIRED muted, EXHAUSTED red, ACTIVE green; no status ⇒ the old rule, never ENDED", () => {
    expect(endedLabel({ status: "ENDED", remaining: 7 })).toEqual({ key: "voucher.endedChip", args: { n: 7 } });
    expect(render("en", "voucher.endedChip", { n: 7 })).toBe("Ended · 7h left");
    expect(render("th", "voucher.endedChip", { n: 7 })).toBe("ยกเลิกแล้ว · เหลือ 7 ชม.");
    expect(voucherChip({ status: "ENDED", remaining: 7 })).toEqual({ key: "voucher.endedChip", args: { n: 7 }, tone: "danger" });
    expect(voucherChip({ status: "EXPIRED", remaining: 3 })).toEqual({ key: "course.status.EXPIRED", tone: "muted" });
    expect(voucherChip({ status: "EXHAUSTED", remaining: 0 })).toEqual({ key: "voucher.used", tone: "danger" });
    expect(voucherChip({ status: "ACTIVE", remaining: 6 })).toEqual({ key: "voucher.usable", tone: "success" });
    expect(voucherChip({ remaining: 0 })).toEqual({ key: "voucher.used", tone: "danger" });
    expect(voucherChip({ remaining: 6 })).toEqual({ key: "voucher.usable", tone: "success" });
    // an ENDED voucher with hours left is ENDED, not usable — the server's precedence, read, not recomputed
    expect(voucherChip({ status: "ENDED", remaining: 6 }).key).toBe("voucher.endedChip");
  });
  it("🚫 no client status derivation: the lib and the card never read `endedAt`/`expiryDate` to decide a status", () => {
    for (const src of [lib, panel]) {
      expect(src).not.toContain("endedAt");
      expect(src).not.toMatch(/expiryDate\s*[<>]/);
      expect(src).not.toMatch(/status\s*=\s*.*\?\s*"ENDED"/);
    }
  });
});

describe("§2 — the card, the ONE dialog, the pair", () => {
  it("the door: `voucherDoors({ cancel: can(course-cancel) }, v).cancel` gates a `voucher.cancel` button (hidden, never disabled); the chip is `voucherChip`; Manage stays on every row (history)", () => {
    expect(panel).toContain('const canCancel = can("action:bookings.course-cancel");');
    expect(panel).toContain("{voucherDoors({ cancel: canCancel }, v).cancel && (");
    expect(panel).toContain('{t("voucher.cancel")}');
    expect(panel).not.toContain("disabled={");
    expect(panel).toContain("const chip = voucherChip(v);");
    expect(panel).not.toContain("RemainingBadge");
    expect(panel).toContain('target={endId ? { kind: "voucher", id: endId } : null}');
  });
  it("ONE dialog component: `EndCourseDialog` takes `target: { kind, id }`; the voucher picks the voucher pair, the course the course pair; the voucher shows the doomed draws and the frozen `remaining` (server's, no subtraction)", () => {
    expect(dialog).toContain('const isVoucher = target?.kind === "voucher";');
    expect(dialog).toContain("const preview = isVoucher ? previewVoucher : previewCourse;");
    expect(dialog).toContain("if (isVoucher) await endVoucherMut.mutateAsync({ voucherId: targetId, reason, note: note.trim() || undefined });");
    expect(dialog).toContain("else await endCourseMut.mutateAsync({ courseId: targetId, reason, note: note.trim() || undefined });");
    expect(dialog).toContain('{isVoucher && typeof data.remaining === "number" && (');
    expect(dialog).toContain('{t("voucher.endKept", { n: data.remaining })}');
    expect(dialog).toContain("{isVoucher && data.sessions.length > 0 && (");
    expect(dialog).not.toMatch(/remaining\s*[-+]/);
    // the reason radios: the closed END_REASONS (teacher-scope §6 pins the rest)
    expect(dialog).toContain("{END_COURSE_REASONS.map((r) => (");
    // the submit still hidden without the key
    expect(dialog).toContain('{!alreadyEnded && can("action:bookings.course-cancel") && (');
    // the course caller passes the course target
    expect(plan).toContain('target={isCourse && !isCreate && plan ? { kind: "course", id: plan.id } : null}');
  });
  it("the pair: `/vouchers/:id/cancel/preview {}` and `/vouchers/:id/cancel { reason, note }` — the course cancel's body byte-for-byte", () => {
    expect(service).toContain("api.post<EndCoursePreview>(`/vouchers/${voucherId}/cancel/preview`, {})");
    const body = (name: string) => {
      const i = service.indexOf(`export const ${name} =`);
      const chunk = service.slice(i, service.indexOf("};", i));
      return chunk.slice(chunk.indexOf("{", chunk.indexOf("api.post(")));
    };
    expect(body("endVoucher").replace(/voucherId/g, "ID")).toBe(body("endCourse").replace(/courseId/g, "ID"));
  });
  it("copy counted: voucher +8 in both languages (EN = TH key count); the EN/TH door words", () => {
    const keys = ["endedChip", "cancel", "endTitle", "endLine", "endKept", "endAlready", "endConfirm", "endDone"];
    for (const lang of ["en", "th"] as const) {
      const v = dictionaries[lang].voucher as Record<string, string>;
      for (const k of keys) expect(typeof v[k]).toBe("string");
      expect(v.endedChip).toContain("{n}");
      expect(v.endKept).toContain("{n}");
      expect(v.endLine).toContain("{student}");
      expect(v.endLine).toContain("{n}");
    }
    expect(Object.keys(dictionaries.en.voucher).length).toBe(Object.keys(dictionaries.th.voucher).length);
    expect(dictionaries.en.voucher.cancel).toBe("Cancel voucher");
    expect(dictionaries.th.voucher.cancel).toBe("ยกเลิกบัตรชั่วโมงทั้งใบ");
    expect(render("en", "voucher.endKept", { n: 7 })).toBe("7h left — kept for the customer");
  });
});
