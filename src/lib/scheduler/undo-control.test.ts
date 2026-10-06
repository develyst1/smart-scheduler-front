import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { SCAN_CHANNELS, UNDO_BODY_KEYS, UNDO_KEY, UNDO_LABEL_KEYS, undoBody, undoDoor, undoKind } from "./undo";
import { CHECKIN_CHANNELS } from "@/types/api/contract";

/**
 * SPEC-094 (TASK-492 BE → TASK-518 FE) — **the admin Undo control.** The API shipped and nothing could press it.
 *
 * 🔑 The label names what happens to THIS row; where nothing is undoable there is **no control at all** (asserted as an
 * absence, not as a disabled button). 🔴 The verb is `ย้อน…`, never `ยกเลิก…` — Cancel takes a session off the schedule,
 * Undo puts one back, and the owner asked that they never blur. 🔴 The body varies by state and **the leave case says the
 * coach IS told** (TASK-508); shipping "nobody is told" on a leave row would be the very defect this control removes.
 * 🔑 The refusals are shown as the SERVER's own sentence — the re-booked hour names its holder, and
 * `UNDO_LEAVE_CHARGE_UNKNOWN` is correct by design and must not read as a bug.
 *
 * 📌 This file replaces `undo-attended-label.test.ts` (TASK-514): that task's ATTENDED branch on the "Sick leave" control
 * was removed by @Sober's ruling — one act, one door — so its pins moved here, and the leave-side pins it added (the
 * other rows byte-identical) are kept below.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const control = codeOf("src/components/common/UndoControl.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");

// TASK-526 — the label reads the CLOSED `checkinChannel`, never the open-ended `checkinSource` (and never the actor).
const row = (status: string, checkinChannel?: string | null) => ({ status, checkinChannel }) as never;

describe("§1 — which undo this row is (and where there is none)", () => {
  it("SICK_LEAVE ⇒ leave · an ATTENDED row on a SCAN channel ⇒ check-in · any other ATTENDED ⇒ attendance · everything else ⇒ NOTHING", () => {
    expect(undoKind(row("SICK_LEAVE"))).toBe("leave");
    expect(undoKind(row("SICK_LEAVE", "shopfront-qr"))).toBe("leave"); // the status decides first
    // by value for EVERY channel of the closed set — the three scans, and the two that are not scans
    for (const ch of ["shopfront-qr", "checkin-qr", "line"]) expect({ ch, kind: undoKind(row("ATTENDED", ch)) }).toEqual({ ch, kind: "checkin" });
    for (const ch of ["staff", "end-of-day"]) expect({ ch, kind: undoKind(row("ATTENDED", ch)) }).toEqual({ ch, kind: "attendance" });
    // 🔑 the safe default survives TASK-526: a channel nobody has seen, or none at all, still reads as ATTENDANCE
    for (const ch of ["", "SHOPFRONT-QR", "kiosk", "shopfront_qr", null, undefined]) expect({ ch, kind: undoKind(row("ATTENDED", ch)) }).toEqual({ ch, kind: "attendance" });
    for (const s of ["CONFIRMED", "PENDING", "CANCELLED", "NO_SHOW", "EXTENDED"]) expect({ s, kind: undoKind(row(s)) }).toEqual({ s, kind: null });
    // the scan list is a SUBSET of the server's closed set — not a set of hopeful strings
    for (const ch of SCAN_CHANNELS) expect(CHECKIN_CHANNELS).toContain(ch);
    expect([...SCAN_CHANNELS]).toEqual(["shopfront-qr", "checkin-qr", "line"]);
    expect([...CHECKIN_CHANNELS]).toEqual(["checkin-qr", "line", "shopfront-qr", "staff", "end-of-day"]); // mirrors the BE's `lib/checkin-channel.ts`
  });
  it("🚫 the label reads the CHANNEL only — never the actor (a person's username), never the deprecated source", () => {
    // the CODE, comments stripped: the prose may name the rule ("the actor is never read"), the code may not do it
    const lib = codeOf("src/lib/scheduler/undo.ts");
    expect(lib).not.toContain("checkinActor");
    expect(lib).not.toContain("checkinSource");
    // and the control that renders it does not reach for either
    expect(control).not.toContain("checkinActor");
    expect(control).not.toContain("checkinSource");
  });
  it("the door: the 60th key AND something to undo — no control otherwise, and none at all without the key", () => {
    expect(UNDO_KEY).toBe("action:calendar.undo");
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:calendar.undo");
    // the BE's slot (permissions.ts:84) — right after the teacher-leave key
    expect(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.undo")).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.teacher-leave") + 1);
    expect(undoDoor(true, row("ATTENDED"))).toBe(true);
    expect(undoDoor(true, row("CONFIRMED"))).toBe(false);
    expect(undoDoor(false, row("ATTENDED"))).toBe(false);
    expect(undoDoor(false, row("SICK_LEAVE"))).toBe(false);
    // hidden, never disabled — TASK-531: the HOOK returns two nulls rather than a greyed control
    // TASK-531 — and a LINKED (teacher) account gets no door at all: the server refuses it `403 SCOPE_TEACHER`, so a
    // control there could only ever fail. The host passes its own `scoped`, beside `canStatus = canAttend && !scoped`.
    expect(control).toContain('const shown = !scoped && undoDoor(can("action:calendar.undo"), booking) && kind !== null;');
    expect(control).toContain("if (!shown || !kind) return { menuItem: null, dialog: null };");
    // 📌 TASK-547 NARROWED this: *hidden, never disabled* is a rule about **the DOOR**, and the door is still absent or
    // present, never greyed. The CONFIRM inside the open dialog may now be blocked — but only when the server's own
    // refusal is rendered directly above it, which is the one case where a disabled button does not invite *"why?"*:
    // 🔑 **the answer is already on screen, in the server's words.** Pinned as exactly one `disabled`, and what it reads.
    expect(control).not.toMatch(/<Menu\.Item[^>]*disabled/);
    expect((control.match(/disabled=\{/g) ?? []).length).toBe(1);
    expect(control).toContain("disabled={!canConfirm(state)}");
    expect(control).toContain('{state === "refused" && (');
  });
  it("the mapper carries the provenance as SENT — a channel is never invented (TASK-526)", () => {
    const mappers = codeOf("src/lib/api/mappers.ts");
    expect(mappers).toContain("checkinChannel: dto.checkinChannel ?? null,");
    expect(mappers).toContain("checkinActor: dto.checkinActor ?? null,");
    // 📌 an absent channel must stay absent: substituting one would make an unscanned row read as a scan somewhere else
    expect(mappers).not.toMatch(/checkinChannel: dto.checkinChannel ?? "/);
  });
  it("the reason rides only when typed", () => {
    expect(undoBody("  ")).toEqual({});
    expect(undoBody(" keyed by mistake ")).toEqual({ reason: "keyed by mistake" });
  });
});

describe("§2 — the words: three approved labels, and a body that varies with the state", () => {
  it("🔴 the verb is `ย้อน…` and never `ยกเลิก…` anywhere in this family", () => {
    const th = dictionaries.th.undo as Record<string, string>;
    expect(th.attendanceBtn).toBe("ย้อนการเข้าเรียน");
    expect(th.checkinBtn).toBe("ย้อนการเช็คอิน");
    expect(th.leaveBtn).toBe("ย้อนการลา");
    for (const [k, v] of Object.entries(th)) expect({ k, cancelVerb: v.includes("ยกเลิกการจอง") || /^ยกเลิก/.test(v) }).toEqual({ k, cancelVerb: false });
    expect(dictionaries.en.undo.attendanceBtn).toBe("Undo attendance");
    expect(dictionaries.en.undo.checkinBtn).toBe("Undo check-in");
    expect(dictionaries.en.undo.leaveBtn).toBe("Undo leave");
    // the label comes from ONE table keyed by the kind — no literal in the component
    expect(UNDO_LABEL_KEYS).toEqual({ attendance: "undo.attendanceBtn", checkin: "undo.checkinBtn", leave: "undo.leaveBtn" });
    expect(control).toContain("{t(UNDO_LABEL_KEYS[kind])}"); // TASK-531: rendered straight into the menu item the hook returns
  });
  it("🔴 the LEAVE body says the coach IS told; the attendance and check-in bodies say nobody is", () => {
    expect(UNDO_BODY_KEYS).toEqual({ attendance: "undo.attendanceMsg", checkin: "undo.checkinMsg", leave: "undo.leaveMsg" });
    for (const lang of ["en", "th"] as const) {
      const u = dictionaries[lang].undo as Record<string, string>;
      const told = lang === "en" ? /coach is told/i : /แจ้งครู/;
      const nobody = lang === "en" ? /nobody is told/i : /ไม่มีการแจ้งใคร/;
      expect(u.leaveMsg).toMatch(told);
      expect(u.leaveMsg).not.toMatch(nobody); // 🔴 the defect this control exists to remove, shipping inside it
      for (const k of ["attendanceMsg", "checkinMsg"]) {
        expect(u[k]).toMatch(nobody);
        expect(u[k]).not.toMatch(told);
      }
      // 🔴 TASK-547 INVERTED these two, and the inversion is the fix: this body is shown for **every** leave, and the
      // quota-and-make-up promise is FALSE on a creation-declared, over-quota, 1-hour or voucher leave. The two facts now
      // come from the preview (`GET /bookings/:id/undo-preview`) and appear only when the server says they apply.
      // ⇒ what is pinned here is that the body **claims neither**, and that the claims exist as preview keys instead.
      expect(u.leaveMsg).not.toMatch(lang === "en" ? /quota/i : /โควตาลา/);
      expect(u.leaveMsg).not.toMatch(lang === "en" ? /make-?up/i : /คาบชดเชย/);
      // 🔻 TASK-658, declared: this asserted `previewLeaveBack` SAID quota. The line is DELETED — there is no quota to return — so the
      // forecast family no longer carries it in either language.
      expect(u.previewLeaveBack).toBeUndefined();
      expect(u.previewMakeupOff).toMatch(lang === "en" ? /make-?up/i : /คาบชดเชย/);
    }
    expect(control).toContain("<Text size=\"sm\">{t(UNDO_BODY_KEYS[kind])}</Text>");
  });
  it("✅ TASK-549 — nothing in this block is a draft any more; the toast is his too", () => {
    // 📌 This pin used to assert the toast's DRAFT marker was PRESENT (it was load-bearing: it said "not yet his"). The
    // owner approved every string on 2026-09-28 ("ผ่านหมด"), so it now asserts the opposite — and TASK-557 NARROWED it
    // from the whole FILE to **this block**: a file-wide absence would have forbidden the next honest draft elsewhere,
    // which is not the rule. The letters themselves are held BY VALUE in `i18n/approved-copy.test.ts`.
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    const undoBlocks = raw.split(/^  undo: {$/m).slice(1).map((part) => part.split(/^  },$/m)[0]);
    expect(undoBlocks.length).toBe(2); // both languages
    for (const block of undoBlocks) expect(block).not.toContain("📝");
    expect(dictionaries.en.undo.done).toBe("Undone");
    expect(dictionaries.th.undo.done).toBe("ย้อนรายการแล้ว");
    // 🔑 and the reason for the one word he was asked about outlives the approval
    expect(raw).toContain("“would”, deliberately:");
  });
  it("copy counted: `undo` has 19 keys in both languages", () => {
    // 12 + TASK-547's 9 forecast keys (heading · three lines · nothing-else · forecast caveat · loading · failed · refused)
    // 🔻 TASK-658 (REQ-112), declared: 21 → 19 — two forecast lines were DELETED with the model they described (return-to-quota;
    // move-the-expiry-back).
    expect(Object.keys(dictionaries.en.undo).length).toBe(19);
    expect(Object.keys(dictionaries.en.undo).length).toBe(Object.keys(dictionaries.th.undo).length);
    for (const k of Object.keys(dictionaries.en.undo)) expect((dictionaries.th.undo as Record<string, string>)[k]?.length).toBeGreaterThan(0);
  });
});

describe("§3 — two surfaces, one control; the refusals; no optimism", () => {
  it("the roster modal and the plan editor mount the SAME hook (TASK-531: one rule, two lifetimes)", () => {
    expect(modal).toContain("const undoControl = useUndoControl(booking, onClose, scoped);");
    expect(plan).toContain('const undoControl = useUndoControl(session as unknown as import("@/types/app/scheduler").Booking);');
    for (const src of [modal, plan]) {
      expect(src).toContain("{undoControl.menuItem}");
      expect(src).toContain("{undoControl.dialog}");
    }
    expect(existsSync("src/components/common/UndoControl.tsx")).toBe(true);
  });
  it("🔴 TASK-514's ATTENDED branch is GONE: the Sick-leave control is a leave on every row again", () => {
    expect(modal).not.toContain("const undoing = booking.status === \"ATTENDED\";");
    expect(modal).not.toMatch(/undoAttended(Btn|Done|Title|Msg)/);
    expect(modal).toContain('title: t("confirmAction.leaveTitle"),');
    // 📌 TASK-541 moved this line ON PURPOSE: the body now follows the ROW (`leaveClaimKey`), because on a booking with
    // no course behind it the course promise was false. What THIS pin cares about is unchanged and still pinned — the
    // leave dialog is reached from this one item, and the COURSE body is byte-identical (asserted just below).
    expect(modal).toContain("message: t(leaveClaimKey(booking)),");
    expect(modal).toContain('data-status-action="sick-leave"');
    // TASK-531 D5 — and on an ATTENDED row the leave item is not offered at all (the Undo owns that act)
    expect(modal).toContain('{canStatus && booking.status !== "ATTENDED" && (');
    // exactly ONE control undoes an attendance now
    expect((modal.match(/\{undoControl\.menuItem\}/g) ?? []).length).toBe(1);
    // and TASK-514's leave-side guarantee is kept: the leave copy does not drift — pinned BY VALUE.
    // 🔻 TASK-658 (REQ-112), declared: it was byte-identical to the REQ-073 sentence ("uses one of the course's leaves"), which is FALSE now
    // (there is no allowance). It is the owner's approved D1 (2026-10-06); ✅ what this pin protects — the leave body is held by value, so
    // an edit is a decision — is unchanged.
    expect(dictionaries.en.confirmAction.leaveMsg).toBe("This session is recorded as leave and a make-up session is added in the next free week. The course's end date does not change.");
    expect(dictionaries.th.confirmAction.leaveMsg).toBe("คาบนี้จะถูกบันทึกเป็นการลา และเพิ่มคาบชดเชยในสัปดาห์ถัดไปที่ว่างให้ วันสิ้นสุดคอร์สไม่เปลี่ยน");
    expect(dictionaries.en.booking.sickLeaveBtn).toBe("Record leave/sick");
  });
  it("the refusal is the SERVER's sentence, and a refusal never renders as a success", () => {
    expect(control).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    // 🚫 no code-switching: the page never translates a named refusal into words of its own
    // the server's refusal CODES never appear here — no code-switching, no sentence of our own for a named refusal
    // (the two `UNDO_*_KEYS` tables are copy-key maps, which is why the pin names the codes rather than the prefix)
    expect(control).not.toMatch(/UNDO_(DAY_SETTLED|SLOT_TAKEN|LEAVE_CHARGE_UNKNOWN|ALREADY_CHANGED|NOT_UNDOABLE|STAFF_ATTEND|MAKEUP|EXPIRY|PLAN_WOULD_CHANGE)/);
    // the success toast is only reachable AFTER the await resolves
    const run = control.slice(control.indexOf("const run = async"), control.indexOf("const label ="));
    expect(run.indexOf("await undo.mutateAsync(")).toBeLessThan(run.indexOf('notify({ title: t("undo.done")'));
    expect(run).toMatch(/catch \(e\) \{\s*setError/); // the catch sets the sentence and nothing else
    expect(run).not.toMatch(/catch[\s\S]*notify/);
  });
  it("🚫 no optimistic update: the row is re-read on success only, and nothing is patched locally", () => {
    expect(hooks).toContain("mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) => undoBooking(bookingId, undoBody(reason)),");
    expect(hooks).toMatch(/useUndoBooking[\s\S]{0,400}onSuccess: \(\) => invalidateAll\(qc\)/);
    expect(control).not.toMatch(/setQueryData|booking\.status\s*=/);
    expect(svc).toContain("api.post(`/bookings/${bookingId}/undo`, body)");
  });
});
