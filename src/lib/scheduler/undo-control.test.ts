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
    // hidden, never disabled — the component returns null rather than rendering a greyed control
    expect(control).toContain('if (!undoDoor(can("action:calendar.undo"), booking) || !kind) return null;');
    expect(control).not.toMatch(/disabled=\{!/);
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
    expect(control).toContain("const label = t(UNDO_LABEL_KEYS[kind]);");
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
      // the leave body also carries its two other facts: the quota comes back and the make-up is cancelled
      expect(u.leaveMsg).toMatch(lang === "en" ? /quota/i : /โควตาลา/);
      expect(u.leaveMsg).toMatch(lang === "en" ? /make-?up/i : /คาบชดเชย/);
    }
    expect(control).toContain("<Text size=\"sm\">{t(UNDO_BODY_KEYS[kind])}</Text>");
  });
  it("📝 the one remaining DRAFT (the toast) is marked, and the marker stays load-bearing", () => {
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect((raw.match(/📝 DRAFT \(Fern, TASK-518\)/g) ?? []).length).toBe(2); // both languages
    expect(typeof dictionaries.en.undo.done).toBe("string");
    expect(typeof dictionaries.th.undo.done).toBe("string");
    // and the approved copy carries NO draft marker any more
    expect(raw).not.toContain("📝 DRAFT (Fern, TASK-514)");
  });
  it("copy counted: `undo` has 12 keys in both languages", () => {
    expect(Object.keys(dictionaries.en.undo).length).toBe(12);
    expect(Object.keys(dictionaries.en.undo).length).toBe(Object.keys(dictionaries.th.undo).length);
    for (const k of Object.keys(dictionaries.en.undo)) expect((dictionaries.th.undo as Record<string, string>)[k]?.length).toBeGreaterThan(0);
  });
});

describe("§3 — two surfaces, one control; the refusals; no optimism", () => {
  it("the roster modal and the plan editor mount the SAME component", () => {
    expect(modal).toContain("<UndoControl booking={booking} onDone={onClose} />");
    expect(plan).toContain("<UndoControl booking={session as unknown as import(\"@/types/app/scheduler\").Booking} />");
    expect(existsSync("src/components/common/UndoControl.tsx")).toBe(true);
  });
  it("🔴 TASK-514's ATTENDED branch is GONE: the Sick-leave control is a leave on every row again", () => {
    expect(modal).not.toContain("const undoing = booking.status === \"ATTENDED\";");
    expect(modal).not.toMatch(/undoAttended(Btn|Done|Title|Msg)/);
    expect(modal).toContain('title: t("confirmAction.leaveTitle"),');
    expect(modal).toContain('message: t("confirmAction.leaveMsg"),');
    expect(modal).toContain('data-status-action="sick-leave"');
    // exactly ONE control undoes an attendance now
    expect((modal.match(/<UndoControl /g) ?? []).length).toBe(1);
    // and TASK-514's leave-side guarantee is kept: the leave copy is byte-identical
    expect(dictionaries.en.confirmAction.leaveMsg).toBe("This uses one of the course's leaves and adds a make-up session at the end.");
    expect(dictionaries.th.confirmAction.leaveMsg).toBe("จะใช้โควตาลาของคอร์ส 1 ครั้ง และเพิ่มคาบชดเชยต่อท้ายให้");
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
