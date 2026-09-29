import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { canOfferExtend, isSameDate, movesEarlier, refusalAnswerKey, voucherExpiryBody } from "./voucher-expiry";
import { dictionaries } from "@/lib/i18n/dictionaries";

const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const rule = codeOf("src/lib/scheduler/voucher-expiry.ts");
const dialog = codeOf("src/components/partials/Bookings/ExtendVoucherExpiryDialog.tsx");
const panel = codeOf("src/components/partials/Bookings/VoucherPanel.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const { en, th } = dictionaries;

describe("TASK-572 — the door, and the rule it deliberately does NOT own", () => {
  it("offered with the key on anything but ENDED — and EXPIRED is the whole point of the feature", () => {
    expect(canOfferExtend({ expiry: true }, { status: "EXPIRED" })).toBe(true);
    expect(canOfferExtend({ expiry: true }, { status: "ACTIVE" })).toBe(true);
    expect(canOfferExtend({ expiry: true }, { status: "EXHAUSTED" })).toBe(true);
    expect(canOfferExtend({ expiry: true }, { status: "ENDED" })).toBe(false);
    // an older payload with no `status` still gets the door: the server decides, as everywhere else on this row
    expect(canOfferExtend({ expiry: true }, {})).toBe(true);
  });

  it("🚫 hidden without the key — never disabled (REQ-092 Stage 3)", () => {
    expect(canOfferExtend({ expiry: false }, { status: "ACTIVE" })).toBe(false);
    expect(panel).not.toContain("disabled={!canExpiry");
  });

  it("🔑 the server's NOT-STARTED rule is NOT re-implemented — and this row has no field that could", () => {
    // What NOT STARTED means on the BE: no non-cancelled booking exists yet. A voucher row carries hours and a status,
    // and `usedHours: 0` is equally true of a voucher with a PENDING booking ⇒ a copy here could only ever GUESS.
    expect(rule).not.toContain("usedHours");
    expect(rule).not.toContain("remaining");
    expect(rule).not.toMatch(/today|new Date|dayjs/);
    // the door's own body reads the grant and the status, and nothing else
    const door = rule.slice(rule.indexOf("export const canOfferExtend"), rule.indexOf("export const voucherExpiryBody"));
    expect(door).toContain("grants.expiry && v.status !== \"ENDED\"");
  });

  it("one body, one question — the preview and the save are asked the same thing", () => {
    expect(voucherExpiryBody("2026-12-31")).toEqual({ expiryDate: "2026-12-31" });
    // 🔑 both wire calls build their body from it, so neither can quietly send a different shape
    const preview = svc.slice(svc.indexOf("export const previewVoucherExpiry"), svc.indexOf("export const updateVoucherExpiry"));
    const save = svc.slice(svc.indexOf("export const updateVoucherExpiry"));
    expect(preview).toContain("voucherExpiryBody(expiryDate)");
    expect(save.slice(0, save.indexOf("};"))).toContain("voucherExpiryBody(expiryDate)");
  });

  it("the two routes are the server's own, preview and PATCH", () => {
    expect(svc).toContain("/vouchers/${voucherId}/expiry/preview");
    expect(svc).toContain("api.patch<UpdateVoucherExpiryResponse>(`/vouchers/${voucherId}/expiry`");
  });

  it("a date that is not a change is not a question", () => {
    expect(isSameDate("2026-12-01", "2026-12-01")).toBe(true);
    expect(isSameDate("2026-12-01", "2026-12-02")).toBe(false);
    expect(isSameDate(null, "2026-12-02")).toBe(false);
  });

  it("⚠️ an EARLIER date is named, because “extend” would be the wrong word for that save", () => {
    expect(movesEarlier("2026-12-01", "2026-11-01")).toBe(true);
    expect(movesEarlier("2026-12-01", "2027-01-01")).toBe(false);
    expect(movesEarlier("2026-12-01", "2026-12-01")).toBe(false);
    // 🚫 and it is not a gate: the Save is disabled by three things, none of them this one
    expect(dialog).toContain("disabled={!voucher || !expiry || !changed || Boolean(refusal)}");
    expect(dialog).not.toContain("movesEarlier(voucher?.expiryDate, expiry) &&\n              <Button");
  });
});

describe("TASK-572 — a refusal is an ANSWER, and the server's words are the answer's first half", () => {
  it("🔑 the two refusals have a what-to-do; 🚫 an unknown code gets NO suggestion", () => {
    expect(refusalAnswerKey("VOUCHER_ENDED")).toBe("voucherExpiry.answerEnded");
    expect(refusalAnswerKey("VOUCHER_NOT_STARTED")).toBe("voucherExpiry.answerNotStarted");
    // 📌 A suggestion invented for a refusal we do not understand is worse than none — the admin would act on it.
    expect(refusalAnswerKey("SOMETHING_NEW")).toBeNull();
    expect(refusalAnswerKey(undefined)).toBeNull();
    expect(refusalAnswerKey("")).toBeNull();
  });

  it("🔴 the server's sentence is rendered VERBATIM, and the answer is ADDED under it — never instead of it", () => {
    const block = dialog.slice(dialog.indexOf("{refusal && !saved && ("), dialog.indexOf("data-voucher-earlier"));
    expect(block).toContain("{refusal.message}");
    expect(block).toContain("{t(answerKey)}");
    // 🚫 no generic replacement anywhere in the dialog
    expect(dialog).not.toContain("plan.genericError\")}</Text>");
    expect(dialog).not.toContain("voucherExpiry.refusedGeneric");
  });

  it("🔴 a refused date CANNOT be saved — two guards, and the reason is the SERVER's refusal, not a warning", () => {
    expect(dialog).toContain("if (!voucher || !expiry || refusal || isSameDate(voucher.expiryDate, expiry)) return;");
    expect(dialog).toContain("Boolean(refusal)");
    // 🚫 and no warning is ever allowed to gate: AC-4 is warn-and-still-save
    expect(dialog).not.toContain("disabled={!voucher || !expiry || previewed");
    expect(dialog).not.toContain("expiryWarning.warn && setDisabled");
  });

  it("the refusal is shown at the PREVIEW, so a 409 also lands on the save path", () => {
    // both catch blocks read the same 409 → refusal rule: the save can still meet it (a race, or a second tab)
    const catches = dialog.split("e instanceof ApiClientError && e.status === 409").length - 1;
    expect(catches).toBe(2);
  });

  it("a new date discards the last answer — a refusal about another date is not about this one", () => {
    const handler = dialog.slice(dialog.indexOf("onChange={(v) => {"), dialog.indexOf("valueFormat="));
    expect(handler).toContain("setPreviewed(null);");
    expect(handler).toContain("setRefusal(null);");
  });
});

describe("TASK-572 — the copy: answers, no invented notice, and one wording shared with the course", () => {
  it("both refusal answers say WHY NOT and WHAT TO DO, in both languages", () => {
    for (const d of [en, th]) {
      expect(d.voucherExpiry.answerEnded.length).toBeGreaterThan(40);
      expect(d.voucherExpiry.answerNotStarted.length).toBeGreaterThan(40);
    }
    // the ENDED answer names the way to give hours back; the NOT STARTED one names the act that starts validity
    expect(en.voucherExpiry.answerEnded).toContain("new voucher");
    expect(th.voucherExpiry.answerEnded).toContain("วอยเชอร์ใบใหม่");
    expect(en.voucherExpiry.answerNotStarted).toContain("first booking");
    expect(th.voucherExpiry.answerNotStarted).toContain("การจองครั้งแรก");
    // 🔑 and the NOT-STARTED answer keeps the REASON the BE gives — that a date now could end it EARLIER
    expect(en.voucherExpiry.answerNotStarted).toContain("EARLIER");
    expect(th.voucherExpiry.answerNotStarted).toContain("เร็วขึ้น");
  });

  it("🚫 the heading is not a failure banner, and nothing here says “could not”", () => {
    expect(en.voucherExpiry.refusedTitle).toContain("why");
    for (const d of [en, th]) {
      expect(d.voucherExpiry.refusedTitle).not.toMatch(/error|failed|Error/);
    }
  });

  it("🔕 the audience is NAMED as nobody — and 🚫 no string in this block claims anyone was told", () => {
    expect(en.voucherExpiry.audience).toContain("Nobody is told");
    expect(th.voucherExpiry.audience).toContain("ไม่มีการแจ้งใคร");
    // 📌 The pin that matters: not one sentence here may imply a notice went out. *A screen saying the family has been
    // notified would be a lie — the audience is deliberately none.*
    for (const d of [en, th]) {
      for (const [key, value] of Object.entries(d.voucherExpiry)) {
        if (key === "audience") continue;
        expect({ key, value }).toEqual({ key, value: expect.not.stringMatching(/notified|แจ้งลูกค้า|ส่งข้อความ|sent to|informed/) });
      }
    }
  });

  it("🔑 the preview sentences are the COURSE's own, reused — one question, one wording, two entitlements", () => {
    expect(dialog).toContain('t("expiry.previewCuts"');
    expect(dialog).toContain('t("expiry.previewClear"');
    expect(dialog).toContain('t("expiry.previewNotSaved")');
    expect(dialog).toContain('t("expiry.previewChecking")');
    // 🚫 not copied into the voucher block under new names
    expect(Object.keys(en.voucherExpiry)).not.toContain("previewCuts");
    expect(Object.keys(en.voucherExpiry)).not.toContain("previewNotSaved");
  });

  it("every new key is a DECLARED draft — the boundary rule, unchanged", () => {
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(raw).toContain("DRAFT (Fern, TASK-572)");
  });

  it("🚫 the pre-save block does not borrow the post-save alert, whose text says the date IS saved", () => {
    const block = dialog.slice(dialog.indexOf("function VoucherExpiryPreviewBlock"));
    expect(block).not.toContain("ExpiryWarningAlert");
    expect(block).not.toContain("warnStillSaves");
    // 🚫 and it computes nothing: no date arithmetic, no filtering of the server's list
    expect(block).not.toContain("dayjs(");
    expect(block).not.toContain(".filter(");
    // 🚫 no leave line: a voucher has no plan and no quota, so the answer carries no `leaveRoom`
    expect(block).not.toContain("leaveRoom");
    expect(dialog).not.toContain("previewLeave");
  });
});
