import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * TASK-311 — `REQ-085 §12.1` (the expiry must be clickable ON THE CARD) · `§11.3` (an earlier date must say what
 * it cuts off BEFORE saving) · `§12` (the `Create plan` ceiling gate can no longer fire and must go).
 *
 * 🔑 Almost everything here is an ABSENCE or a WIRING fact, so it is read from source, comments stripped —
 * the shape TASK-291/295 settled on after three tests failed on their own explanations.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CARD = "src/components/partials/Bookings/CoursePackagePanel.tsx";
const DIALOG = "src/components/partials/Bookings/EditExpiryDialog.tsx";
const PLAN_MODAL = "src/components/partials/Bookings/PlanModal.tsx";
const CREATE_FLOW = "src/components/partials/Bookings/CreatePlanFlow.tsx";
const SERVICE = "src/services/scheduler.service.ts";
const CONTRACT = "src/types/api/contract.ts";
const { en, th } = dictionaries;

describe("🔴 §1 — the `expires …` line on the card OPENS the expiry dialog", () => {
  const card = codeOf(CARD);

  it("the date is inside a control that targets the dialog", () => {
    // Before: the date was a label and the only control was a 14px icon after it. Now the words the owner
    // reads are the button, and the icon sits inside it — one control, not two adjacent ones.
    const btn = card.slice(card.indexOf("<UnstyledButton"), card.indexOf("</UnstyledButton>"));
    expect(btn).toContain("onClick={() => setExpiryTarget(c)}");
    expect(btn).toContain('t("course.expiresOn"');
    expect(btn).toContain("<CalendarClock");
  });

  it("🚫 there is still ONE dialog, mounted once", () => {
    expect(card.match(/<EditExpiryDialog/g)?.length).toBe(1);
  });

  it("the split strings say the same thing the one string said, in both languages", () => {
    expect(en.course.sizeLine).toBe("{size}-session course");
    expect(en.course.expiresOn).toBe("expires {expiry}");
    expect(th.course.expiresOn).toBe("หมดอายุ {expiry}");
    // The old combined key is gone — a string nothing renders is a label waiting to outlive its value.
    expect((en.course as Record<string, unknown>).summary).toBeUndefined();
  });
});

describe("🔴 §1 / §11.3 — an EARLIER date says what it cuts off BEFORE saving", () => {
  const dialog = codeOf(DIALOG);
  const service = codeOf(SERVICE);

  it("asks POST /courses/:id/expiry/preview and renders what comes back", () => {
    expect(dialog).toContain("usePreviewCourseExpiry");
    expect(service).toContain("`/courses/${courseId}/expiry/preview`");
    expect(dialog).toContain("<ExpiryPreviewBlock preview={previewed} />");
  });

  it("🔑 shows an answer only for the date on screen — the server's echo is the guard", () => {
    expect(dialog).toContain("if (p.expiryWarning.expiryDate === wanted.current) setPreviewed(p);");
  });

  it("🚫 computes nothing on the client — no date arithmetic, no filtering of sessions", () => {
    const block = dialog.slice(dialog.indexOf("function ExpiryPreviewBlock"));
    expect(block).not.toContain("dayjs(");
    expect(block).not.toContain(".filter(");
    expect(block).not.toMatch(/[<>]=?\s*expiryDate/);
    // The leave verdict is the server's boolean, not a comparison made here.
    expect(block).toContain("room.roomForAll");
  });

  it("🔴 still NOT a gate — Save reads neither the preview nor the warning", () => {
    expect(dialog).toContain("disabled={!course || !expiry}");
    expect(dialog).not.toMatch(/disabled=\{[^}]*(preview|warn)/);
  });

  it("the preview block does not borrow the post-save alert, whose text says the date IS saved", () => {
    // `ExpiryWarningAlert` renders `warnStillSaves` — true after a PATCH, false before one. §3 keeps that
    // component rendering exactly what it renders, so the pre-save block is its own.
    const block = dialog.slice(dialog.indexOf("function ExpiryPreviewBlock"));
    expect(block).not.toContain("ExpiryWarningAlert");
    expect(block).toContain('t("expiry.previewNotSaved")');
    expect(en.expiry.warnStillSaves).toContain("has been saved");
  });

  it("the SPENT case renders no leave line — TASK-298 §5, kept on this side", () => {
    const block = dialog.slice(dialog.indexOf("function ExpiryPreviewBlock"));
    expect(block).toContain("room.remainingLeave > 0 &&");
  });
});

describe("🧹 §2 — the `Create plan` ceiling gate is GONE, and so is its sentence", () => {
  const modal = codeOf(PLAN_MODAL);
  const flow = codeOf(CREATE_FLOW);

  it("nothing on the front end reads `exceedsCeiling` any more", () => {
    expect(modal).not.toContain("exceedsCeiling");
    expect(flow).not.toContain("exceedsCeiling");
    expect(flow).not.toContain("setCeiling");
  });

  it('🔴 "can only extend to week N" no longer exists in either language', () => {
    // The owner's own screenshot two days ago: told to change what he wanted because a date could not move.
    expect((en.plan as Record<string, unknown>).ceilingRefusal).toBeUndefined();
    expect((th.plan as Record<string, unknown>).ceilingRefusal).toBeUndefined();
    expect(modal).not.toContain("plan.ceilingRefusal");
  });

  it("`Create plan` is disabled only while the preview is in flight", () => {
    expect(modal).toContain("disabled={previewPending}");
    // And the tooltip branch that only the ceiling ever fed is gone with it — a reachable-by-nothing branch is
    // the same dead gate one level down.
    expect(modal).not.toContain("disabledHint");
  });

  it("🚫 `contract.ts` is untouched, and the FIELD stays where it is typed — only the reader went", () => {
    // The order @Jason set: the FE reader goes first, the field later, never both at once. On this side the
    // field lives on `CoursePreview` in `types/app/scheduler` (optional), not in `contract.ts` — which this
    // commit did not touch for either half of the task.
    const contract = readFileSync(CONTRACT, "utf8");
    expect(contract).not.toContain("exceedsCeiling");
    expect(contract).not.toContain("ExpiryPreview");
    expect(codeOf("src/types/app/scheduler/index.ts")).toContain("exceedsCeiling?: boolean;");
  });
});
