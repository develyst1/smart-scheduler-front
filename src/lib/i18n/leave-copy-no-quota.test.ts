import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "./dictionaries";

/**
 * 🔴 **TASK-658 (REQ-112) — no screen says "quota", "locked" or "x of y" about leaves, and none ever will again.**
 *
 * The rule changed under the whole front end: **there is NO leave quota; each leave adds a make-up; nothing is ever locked.**
 * *A screen still showing "2 of 4 leaves used" after the rule is gone is worse than no screen at all* — @Porter's biggest fear
 * for this round, and the reason this is a TEST over the WHOLE dictionary and not a grep in a report.
 *
 * 🔑 **Whole dictionary, not a scope list.** A scope list is a list somebody has to remember to extend; the word is banned
 * EVERYWHERE and the few legitimate uses are an allowlist whose size is asserted — so a quietly growing allowlist is how this
 * test would die, and it cannot grow without somebody editing a number.
 */

/** The words a leave string may no longer say. 🔑 Thai needs care: ล็อก is also *catalogue* (แคตตาล็อก) and *block* (บล็อก). */
export const BANNED = {
  en: /quota|\b(?:un|re)?lock(?:ed|ing)?\b|\{quota\}|\{used\}\s*\/\s*\{quota\}/i,
  th: /โควตา|ปลดล็อก|(?<!บ)(?<!แคตตา)ล็อก|\{quota\}|\{used\}\s*\/\s*\{quota\}/,
} as const;

/** Every string leaf of a dictionary, as `group.key` (nested keys joined). */
const leaves = (o: Record<string, unknown>, path = ""): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) => {
    const p = path ? `${path}.${k}` : k;
    return typeof v === "string" ? [[p, v] as [string, string]] : v && typeof v === "object" ? leaves(v as Record<string, unknown>, p) : [];
  });

/**
 * 🔴 **The allowlist: the words that survive, each for a reason that is NOT a leave.** Derived by running the ban over the
 * whole dictionary, not remembered — 🔑 **it is FOUR, not the three I first estimated: the voucher hints say "doesn't lock the
 * teacher or time", which is about what a voucher is, and the derivation found them.**
 */
const ALLOWED: Record<string, string> = {
  "plan.locked": "an ATTENDED session is frozen in the plan editor — it is about a delivered class, not a leave",
  "course.createdAlertTitle": "\"schedule locked\" on a NEW course: the generated schedule's fixed times — not a leave",
  "voucher.infoAlert": "\"vouchers don't lock a teacher or time\" — says what a VOUCHER is; it has no plan and no leave",
  "bookings.vouchersHint": "the same sentence as `voucher.infoAlert`, on the list page",
};

const hits = (lang: "en" | "th") =>
  leaves(dictionaries[lang] as unknown as Record<string, unknown>)
    .filter(([, v]) => BANNED[lang].test(v))
    .map(([p]) => p);

describe("🔴 TASK-658 — the ban, over the WHOLE dictionary, both languages", () => {
  it("🔑 no string says quota / locked / unlock / `{used}/{quota}` — except the allowlist, and that is all that is left", () => {
    for (const lang of ["en", "th"] as const) {
      const outside = hits(lang).filter((p) => !(p in ALLOWED));
      expect(outside).toEqual([]);
    }
  });

  it("🔑 the allowlist is EXACTLY these four, each with a real reason — and each STILL matches the ban (a stale entry fails)", () => {
    // 🚫 a quietly growing allowlist is how a test like this dies: the SIZE is asserted
    expect(Object.keys(ALLOWED).length).toBe(4);
    for (const [path, why] of Object.entries(ALLOWED)) {
      expect(why.trim().length).toBeGreaterThanOrEqual(20);
      const matched = (["en", "th"] as const).some((l) => hits(l).includes(path));
      expect(matched).toBe(true);
    }
  });

  it("🔑 the ban can SEE the defect, and does NOT cry wolf on the words that merely contain it (proven on fixtures)", () => {
    const caught = (lang: "en" | "th", s: string) => BANNED[lang].test(s);
    // the words that must be caught
    expect(caught("en", "Leave quota")).toBe(true);
    expect(caught("en", "Rescheduling is locked")).toBe(true);
    expect(caught("en", "Unlock (admin)")).toBe(true);
    expect(caught("en", "Used {used}/{quota} · extendable")).toBe(true);
    expect(caught("th", "ลาเกินโควตา")).toBe(true);
    expect(caught("th", "ล็อกการเลื่อนตาราง")).toBe(true);
    expect(caught("th", "ปลดล็อก (แอดมิน)")).toBe(true);
    expect(caught("th", "ใช้ไป {used}/{quota}")).toBe(true);
    // 🚫 and the words that CONTAIN it but are not it — a ban that cried wolf would be switched off
    expect(caught("en", "This slot is already booked, blocked by another class")).toBe(false);
    expect(caught("en", "Choose from the catalog")).toBe(false);
    expect(caught("th", "เลือกจากแคตตาล็อก")).toBe(false);
    expect(caught("th", "ย้ายบล็อกของวันแล้ว")).toBe(false);
  });
});

/**
 * 🔴 **The approved set, BY VALUE.** On 2026-10-06 the owner approved `COPY-REVIEW §T-658` as one set, with two choices made:
 * **D6 = "ใช้ได้ถึงสัปดาห์ที่ {week}" / "Valid until week {week}"** and **D14 = โควตา → ยอดคงเหลือ**. 🚫 Approved strings are never
 * "improved" — an approved string "improved" on the way in is an unapproved string. (D2, D3, D13 and D14 sit in
 * `approved-copy.test.ts` beside the rows they replaced.)
 */
const APPROVED_T658: Array<[string, string | null, string | null]> = [
  // [path, TH, EN] — `null` = that language was not part of the row (D12 is EN only)
  ["confirmAction.leaveMsg", "คาบนี้จะถูกบันทึกเป็นการลา และเพิ่มคาบชดเชยในสัปดาห์ถัดไปที่ว่างให้ วันสิ้นสุดคอร์สไม่เปลี่ยน", "This session is recorded as leave and a make-up session is added in the next free week. The course's end date does not change."],
  ["booking.leaveExtendedDesc", "เพิ่มคาบเรียนชดเชยแล้วในวันที่ {date}", "A make-up session was added on {date}"],
  ["course.usage", "ใช้ได้ถึงสัปดาห์ที่ {week}", "Valid until week {week}"],
  ["course.sizeOption", "{size} ครั้ง (ขยายถึงสัปดาห์ที่ {week})", "{size} sessions (extend to week {week})"],
  ["course.infoAlert", "ระบบจะสร้างคาบรายสัปดาห์ตามวัน-เวลาเริ่มต้น · ขยายได้ถึงสัปดาห์ที่ {week}", "Weekly sessions are generated from the start date/time · extend to week {week}"],
  ["importBalance.extraWeeks", "สัปดาห์ที่ขยายได้เพิ่ม", "Extra weeks of validity"],
  ["importBalance.extraWeeksHint", "แพ็กเกจนี้ใช้ได้นานกว่าจำนวนคาบกี่สัปดาห์ — ขนาดตามการ์ดราคามีค่าของตัวเองอยู่แล้ว", "How many weeks beyond the course size this package stays valid — the price-card sizes bring their own"],
  ["plan.insertHint", "เลื่อนคาบที่ค้างเข้ามาในแผน (ไม่คิดเงิน)", "Reschedule an owed session into the plan (no charge)."],
  ["plan.extraHint", "ขายคาบเดี่ยวแบบคิดเงิน ไม่กระทบจำนวนคาบหรือวันจบคอร์ส", "A charged single-session sale. Doesn't change the course size or end date."],
  ["history.sumLeave", null, "Leaves taken"],
];
const at = (lang: "en" | "th", path: string): string | undefined => {
  const [g, k] = path.split(".");
  return (dictionaries[lang] as unknown as Record<string, Record<string, string>>)[g]?.[k];
};

describe("🔴 TASK-658 — the owner's approved set, by value, both languages COUNTED", () => {
  it("🔑 every row is his sentence exactly, in Thai and in English", () => {
    let th = 0;
    let en = 0;
    for (const [path, thText, enText] of APPROVED_T658) {
      if (thText !== null) {
        expect(at("th", path)).toBe(thText);
        th += 1;
      }
      if (enText !== null) {
        expect(at("en", path)).toBe(enText);
        en += 1;
      }
    }
    // 🔑 a bilingual assertion is satisfied by ONE language unless both are counted: 9 Thai rows, 10 English (D12 is EN only)
    expect(th).toBe(9);
    expect(en).toBe(10);
    expect(APPROVED_T658.length).toBe(10);
  });

  it("📌 the end-date sentences say EXACTLY the final model: it does not move — except the three declared cases", () => {
    // D1: an ordinary leave — the end date does not change, in both languages
    expect(at("en", "confirmAction.leaveMsg")).toMatch(/end date does not change/i);
    expect(at("th", "confirmAction.leaveMsg")).toContain("วันสิ้นสุดคอร์สไม่เปลี่ยน");
    // D3: the declared-at-creation leave is one of the three that moves it one week later
    expect(at("en", "confirmAction.leaveMsgCourseDeclared")).toMatch(/end date moves one week later/i);
    expect(at("th", "confirmAction.leaveMsgCourseDeclared")).toContain("เลื่อนออกไป 1 สัปดาห์");
    // 🚫 and no sentence promises a make-up past the end date or a held make-up: a leave with no room is REFUSED by the server
    for (const lang of ["en", "th"] as const) {
      for (const [p, v] of leaves(dictionaries[lang] as unknown as Record<string, unknown>)) {
        if (!p.startsWith("confirmAction.leave") && p !== "booking.leaveExtendedDesc") continue;
        expect(/past the (course )?end|held|หลังวันสิ้นสุด|หลังคอร์สสิ้นสุด/i.test(v)).toBe(false);
      }
    }
  });
});

const at2 = (lang: "en" | "th", path: string): string | undefined => {
  const [g, k] = path.split(".");
  return (dictionaries[lang] as unknown as Record<string, Record<string, string>>)[g]?.[k];
};

/** Every non-test source file under `src`, comments STRIPPED — the ban on removed identifiers is about CODE, not about history. */
const srcFiles = (dir = "src"): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return srcFiles(f);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [f.split("\\").join("/")] : [];
  });
const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/ .*$/gm, "");

describe("🔴 TASK-658 — the CODE has stopped reading the quota and the lock", () => {
  it("🔑 not one non-test source file still uses a removed identifier (comments excluded)", () => {
    const files = srcFiles();
    // 🚫 a sweep over an empty list passes forever
    expect(files.length).toBeGreaterThan(200);
    const REMOVED = /\b(leaveLocked|adminUnlocked|leaveRemaining|courseLeaveLocked|LEAVE_QUOTA_BY_SIZE|setCourseAdminUnlock|useSetCourseAdminUnlock|canTakeLeave|leaveRoom)\b/;
    const offenders = files
      .map((f) => ({ f, m: codeOf(f).match(REMOVED) }))
      // the contract/type files DECLARE the optional, unread server fields on purpose — those two are the declared exceptions
      .filter((r) => r.m && !["src/types/api/contract.ts"].includes(r.f))
      .map((r) => `${r.f}: ${r.m![1]}`);
    expect(offenders).toEqual([]);
  });

  it("🔑 the Undo preview does not READ `leaveRefunded` or `expiry` — the server still sends them, and neither is a sentence an admin needs", () => {
    // 🔴 `leaveRefunded` is NOT in the ban above on purpose: the server still sends it (the leave COUNT going back) and the mock mirrors
    // that shape. What is banned is a SCREEN reading it: the Undo never moves the end date, and there is no quota to return to.
    const lines = codeOf("src/lib/scheduler/undo-preview.ts");
    expect(lines.match(/leaveRefunded|.expiry|previewLeaveBack|previewExpiry/)?.[0] ?? null).toBeNull();
    const control = codeOf("src/components/common/UndoControl.tsx");
    expect(control.match(/leaveRefunded|.expiry/)?.[0] ?? null).toBeNull();
  });
  /**
   * 🔴 **The field that must NOT be deleted with the quota.** The import form's number was labelled *"Leave quota"*; under REQ-112 it is the
   * BASE of the validity window (`maxWeek = size + n`) and **it still sets the course's expiry**. 🔑 A tidy-up that removed it as "a quota
   * field" would silently break every off-card import — and nothing else in the suite would notice, because the wire-name pin checks that
   * keys the form sends reach the service, not that a key the form STOPPED sending was needed. So this asserts it, three ways.
   */
  it("🔴 the import form KEEPS the field — relabelled, rendered, and STILL sent on both calls", () => {
    const form = codeOf("src/components/partials/Bookings/ImportBalanceModal.tsx");
    expect(form.includes('label={t("importBalance.extraWeeks")}')).toBe(true);
    expect(form.includes('description={t("importBalance.extraWeeksHint")}')).toBe(true);
    // the body carries it at BOTH sites (the preview and the commit) — and only for an off-card size
    expect((form.match(/leaveQuota: offCard \? leaveQuota : undefined,/g) ?? []).length).toBe(2);
    // …and the service forwards it, so the server can derive the expiry
    expect(codeOf("src/services/scheduler.service.ts").includes("leaveQuota: input.leaveQuota,")).toBe(true);
  });

  /**
   * 🔴 **A deleted key must not still be READ.** `t("plan.leave")` over a key that no longer exists renders the RAW KEY — `plan.leave` —
   * to an admin, and `tsc` cannot see it (the dictionary is a plain object). The dictionary ban above guards the strings; this guards the
   * CALL SITES, which is the other half: a mutation that restored the `Leave {used}/{quota}` summary survived until this was written.
   */
  it("🔴 no source file reads a key REQ-112 deleted (the raw key would be shown to an admin)", () => {
    const DELETED = [
      "confirmAction.leaveMsgCourseLocked", "booking.leaveLockedTitle", "booking.leaveLockedDesc", "bookings.coursesHint",
      "course.unlockedTitle", "course.unlockedDesc", "course.unlockFailTitle", "course.unlockFailGeneric", "course.relockedTitle",
      "course.relockedDesc", "course.relockFailTitle", "course.relockFailGeneric", "course.relockBtn", "course.unlockConfirmTitle",
      "course.unlockConfirmMsg", "course.relockConfirmTitle", "course.relockConfirmMsg", "course.locked", "course.specialUnlock",
      "course.leaveQuota", "course.unlockBtn", "course.leftN", "plan.leave", "undo.previewLeaveBack", "undo.previewExpiry",
      "expiry.previewLeaveOk", "expiry.previewLeaveTight", "importBalance.leaveQuota", "importBalance.leaveQuotaHint",
    ];
    expect(DELETED.length).toBe(29);
    const sources = srcFiles().filter((f) => !f.endsWith("dictionaries.ts"));
    const reads = DELETED.flatMap((k) => sources.filter((f) => codeOf(f).includes(`"${k}"`)).map((f) => `${f}: ${k}`));
    expect(reads).toEqual([]);
    // …and each really IS gone from both dictionaries, so the list cannot go stale into a lie
    for (const k of DELETED) {
      expect(at2("en", k)).toBeUndefined();
      expect(at2("th", k)).toBeUndefined();
    }
  });

  it("🔴 the course card has NO unlock/relock control, no lock badge and no quota bar", () => {
    const panel = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
    // 🔑 asserted on the MATCHED WORD, never on the source: `expect(src).not.toMatch(...)` prints the WHOLE file when it
    // fails (TASK-596's lesson, which my own first draft of this line repeated). And `\bLock\b` needs a WORD BOUNDARY on purpose:
    // `CalendarClock` (an icon the card legitimately uses) contains "lock" and is not a lock — my first draft matched it.
    expect(panel.match(/unlock|relock|LockKeyholeOpen|\bLock\b|leaveQuota|leftN|<Progress\b/i)?.[0] ?? null).toBeNull();
    // …and it shows exactly the approved validity line, fed by the week alone
    expect(panel.includes('{t("course.usage", { week: c.maxWeek })}')).toBe(true);
  });

  it("🔑 the leave dialog has THREE bodies — no locked one — and the locked toast is gone", () => {
    const claim = readFileSync("src/lib/scheduler/leave-claim.ts", "utf8");
    expect((claim.match(/export const LEAVE_MSG_[A-Z_]+ =/g) ?? []).length).toBe(3);
    const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
    expect(modal).not.toMatch(/res\.locked|booking\.leaveLocked/);
  });
});
