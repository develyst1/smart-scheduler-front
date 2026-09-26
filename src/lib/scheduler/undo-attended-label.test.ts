import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 TASK-514 — the control that undoes an attendance said **"Sick leave"** and promised to spend the family's quota and
 * add a make-up. TASK-497 had already changed what it DOES (back to CONFIRMED, the class returned, no quota, no make-up,
 * nobody told), so an admin reading the dialog was told that correcting OUR mistake costs a family a leave — and would
 * not press it. The words now follow **this row's state**, from ONE branch, so label · dialog · toast cannot disagree.
 *
 * 🔑 Only the ATTENDED case changes. Every other row's "Sick leave" is byte-identical — pinned.
 * 📝 The wording is a DRAFT (the owner's final words are with @Porter): pinned **by shape** — the four facts — so his
 * answer is a one-line change in the dictionary and this test still holds.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");

describe("§1 — one control, its words chosen by THIS row's state", () => {
  it("the state is the only input, and it picks label · dialog · toast together (they cannot drift apart)", () => {
    expect(modal).toContain('const undoing = booking.status === "ATTENDED";');
    // one branch for all three, so a future change cannot fix the label and leave the dialog lying
    expect(modal).toContain('title: t(undoing ? "confirmAction.undoAttendedTitle" : "confirmAction.leaveTitle"),');
    expect(modal).toContain('message: t(undoing ? "confirmAction.undoAttendedMsg" : "confirmAction.leaveMsg"),');
    expect(modal).toContain('confirmLabel: t(undoing ? "booking.undoAttendedBtn" : "booking.sickLeaveBtn"),');
    expect(modal).toContain('notify({ title: t(undoing ? "booking.undoAttendedDone" : "booking.leaveSavedTitle"), color: "default" });');
    expect(modal).toContain('{t(undoing ? "booking.undoAttendedBtn" : "booking.sickLeaveBtn")}');
    expect(modal).toContain('data-status-action={undoing ? "undo-attended" : "sick-leave"}');
    // 🚫 the row's state is read, never a second signal (a flag, the response, a count)
    expect(modal).not.toMatch(/undoing\s*=\s*[^;]*(res\.|already|leaveUsed|canUndo)/);
  });
  it("🔑 every OTHER row is byte-identical: the leave keys and the override path are untouched", () => {
    // the old sentences still exist, unchanged, and are still what a non-ATTENDED row is told
    expect(dictionaries.en.confirmAction.leaveTitle).toBe("Record leave for this session?");
    expect(dictionaries.en.confirmAction.leaveMsg).toBe("This uses one of the course's leaves and adds a make-up session at the end.");
    expect(dictionaries.th.confirmAction.leaveMsg).toBe("จะใช้โควตาลาของคอร์ส 1 ครั้ง และเพิ่มคาบชดเชยต่อท้ายให้");
    expect(dictionaries.en.booking.sickLeaveBtn).toBe("Record leave/sick");
    expect(dictionaries.th.booking.sickLeaveBtn).toBe("บันทึกลา/ป่วย");
    // the same one call for both cases — no second mutation, no second endpoint, no BE change
    expect((modal.match(/sickLeave\.mutateAsync\(/g) ?? []).length).toBe(1);
    expect(modal).toContain("const res = await sickLeave.mutateAsync({ id: booking.id, override });");
    // the override, the lock and the make-up toasts are the LEAVE path's and are not re-worded
    expect(modal).toContain('t("booking.leaveLockedTitle")');
    expect(modal).toContain('t("booking.leaveExtendedDesc", { date: formatDateDisplay(res.extended.date) })');
  });
});

describe("§2 — 📝 the DRAFT, pinned by SHAPE", () => {
  it("the ATTENDED sentence states the four facts (quota · make-up · message · what the row becomes) in both languages", () => {
    const en = dictionaries.en.confirmAction.undoAttendedMsg;
    const th = dictionaries.th.confirmAction.undoAttendedMsg;
    // by shape, not by exact text — the owner's words will differ, the FACTS must not
    expect(en).toMatch(/confirmed/i);
    expect(en).toMatch(/balance|returns/i);
    expect(en).toMatch(/no leave/i);
    expect(en).toMatch(/no make-?up/i);
    expect(en).toMatch(/nobody is told|no one is told/i);
    expect(th).toContain("ยืนยันแล้ว");
    expect(th).toContain("คืนคาบ");
    expect(th).toContain("ไม่ใช้โควตาลา");
    expect(th).toContain("ไม่เพิ่มคาบชดเชย");
    expect(th).toContain("ไม่มีการแจ้งใคร");
    // 🚫 and it must NOT repeat the old promises — the whole reason an admin would not press the button
    for (const s of [en, th]) expect(s).not.toMatch(/uses one of|โควตาลาของคอร์ส 1 ครั้ง/);
  });
  it("the label and the toast no longer say leave, and the draft is marked as a draft in the code", () => {
    expect(dictionaries.en.booking.undoAttendedBtn).not.toMatch(/leave|sick/i);
    expect(dictionaries.th.booking.undoAttendedBtn).not.toMatch(/ลา|ป่วย/);
    expect(dictionaries.en.booking.undoAttendedDone).not.toMatch(/leave/i);
    expect(dictionaries.th.booking.undoAttendedDone).not.toMatch(/การลา/);
    // 📝 the marker, so the owner's answer is an obvious one-line change and nobody mistakes a draft for approved copy
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(raw).toContain("📝 DRAFT (Fern, TASK-514)");
    expect((raw.match(/📝 DRAFT \(Fern, TASK-514\)/g) ?? []).length).toBe(4); // both blocks, both languages
  });
  it("copy counted: +2 in `confirmAction` and +2 in `booking`, both languages", () => {
    for (const lang of ["en", "th"] as const) {
      const c = dictionaries[lang] as unknown as Record<string, Record<string, string>>;
      for (const k of ["undoAttendedTitle", "undoAttendedMsg"]) expect(typeof c.confirmAction[k]).toBe("string");
      for (const k of ["undoAttendedBtn", "undoAttendedDone"]) expect(typeof c.booking[k]).toBe("string");
    }
    expect(Object.keys(dictionaries.en.confirmAction).length).toBe(Object.keys(dictionaries.th.confirmAction).length);
    expect(Object.keys(dictionaries.en.booking).length).toBe(Object.keys(dictionaries.th.booking).length);
  });
});
