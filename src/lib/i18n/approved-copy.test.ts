import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dictionaries } from "./dictionaries";

/**
 * TASK-549 — **the owner's approved words, pinned BY VALUE.**
 *
 * On 2026-09-28 he answered *"ผ่านหมด"* to every draft in `COPY-REVIEW-2026-09-28.md` §A–§D, so **those letters are now the
 * spec** and this file is the reference: each row below is the sentence in his file, character for character, in both
 * languages.
 *
 * 🔑 **This does NOT replace the shape pins, and that is the point.** A value pin says *these letters*; a shape pin says
 * *this promise* — and **the promise is what caught all four defects.** The shape pins stay where they are
 * (`leave-claim.test.ts`, `undo-preview.test.ts`, `line-admins.test.ts`, `undo-control.test.ts`): they assert the absence
 * of a quota claim, the *"would"* framing, `ไม่ใช่การลบ` only as a denial, a title ending in `?`. ⇒ **if he rewords a
 * sentence, one line here changes and the promise is still held.** If a reword broke a promise, a shape pin fails and that
 * is a conversation, not a copy edit.
 *
 * 📌 **TASK-555 — the eight the §D table left out are now approved too** (§D2, on 09-28), so the LINE-admin page is final in
 * full: **17 of 17.** ✅ **The boundary they were held behind is kept, not deleted** (`UNREVIEWED`, below): the pin now says
 * *every key on that page is either approved or a declared draft*, so **a string that arrives tomorrow cannot pass as his.**
 * 🔑 *The mechanism is the valuable part, not the eight rows.*
 *
 * ⚠️ **Still NOT here:** the discount error strings and the attendee-note hint (marked DRAFT for their own reasons, and
 * pinned as still-marked), and §E's LINE messages, which are the backend's (TASK-550).
 */

const en = dictionaries.en as unknown as Record<string, Record<string, string>>;
const th = dictionaries.th as unknown as Record<string, Record<string, string>>;
const at = (d: Record<string, Record<string, string>>, path: string) => {
  const [group, key] = path.split(".");
  return d[group][key];
};

/** [path, TH, EN] — copied from `COPY-REVIEW-2026-09-28.md`, which is now the reference document. */
const APPROVED: Array<[string, string, string]> = [
  // §A — what an admin reads BEFORE recording a leave
  [
    "confirmAction.leaveMsgNoCourse",
    "คาบนี้จะถูกบันทึกเป็นการลา คาบนี้ไม่มีคอร์สอยู่เบื้องหลัง จึงไม่ใช้โควตาลาและไม่มีคาบชดเชย ระบบจะแจ้งครูและแอดมิน",
    "This session is recorded as leave. There is no course behind it, so no leave quota is used and no make-up session is added. The coach and the admins are told.",
  ],
  [
    "confirmAction.leaveMsgCourseLocked",
    "คาบนี้จะถูกบันทึกเป็นการลา คอร์สนี้ใช้สิทธิ์การลาครบแล้ว จึงไม่ตัดโควตาและไม่มีคาบชดเชย และจะยังล็อกการเลื่อนตารางไว้จนแอดมินปลดล็อก ระบบจะแจ้งครูและแอดมิน",
    "This session is recorded as leave. The course has no leave left, so no leave quota is used and no make-up session is added — rescheduling stays locked until an admin unlocks it. The coach and the admins are told.",
  ],
  [
    "confirmAction.leaveMsgCourseDeclared",
    "คาบนี้จะถูกบันทึกเป็นการลา เป็นการลาที่แจ้งไว้ตั้งแต่สร้างคอร์ส จึงไม่ตัดโควตาลา แต่ยังเพิ่มคาบชดเชยต่อท้ายให้ ระบบจะแจ้งครูและแอดมิน",
    "This session is recorded as leave. It was declared when the course was created, so no leave quota is used — a make-up session is still added at the end. The coach and the admins are told.",
  ],
  // §B — the Undo body he approved trimmed, and the toast
  [
    "undo.leaveMsg",
    "คาบจะกลับเป็นยืนยันแล้ว และคืนคาบเข้าโควตาของลูกค้า ระบบจะแจ้งครูว่าคาบนี้กลับมาเรียนแล้ว",
    "The session goes back to confirmed and the class returns to the family's balance. The coach is told the class is on again.",
  ],
  ["undo.done", "ย้อนรายการแล้ว", "Undone"],
  // §C — the forecast
  ["undo.previewHeading", "ถ้าไม่มีอะไรเปลี่ยนก่อนกดยืนยัน รายการนี้จะ:", "If nothing changes before you confirm, this would:"],
  ["undo.previewLeaveBack", "คืนโควตาลาให้ลูกค้า", "return the leave to the family's quota"],
  ["undo.previewMakeupOff", "คาบชดเชยวันที่ {date} จะถูกยกเลิก", "cancel the make-up session on {date}"],
  ["undo.previewExpiry", "เลื่อนวันหมดอายุคอร์สจาก {from} กลับเป็น {to}", "move the course expiry from {from} back to {to}"],
  ["undo.previewNothingElse", "ไม่มีผลอื่นตามมา — ไม่คืนโควตาลา และไม่มีคาบชดเชยที่ต้องยกเลิก", "Nothing else follows — no leave is returned and no make-up is cancelled."],
  ["undo.previewForecast", "ระบบจะตรวจอีกครั้งเมื่อกดยืนยัน จึงยังมีสิทธิ์ปฏิเสธได้", "The server checks again when you confirm, so it may still refuse."],
  ["undo.previewLoading", "กำลังตรวจว่าจะมีผลอะไรตามมา…", "Checking what this would change…"],
  [
    "undo.previewFailed",
    "ตรวจไม่ได้ว่าจะมีผลอะไรตามมา ยังกดย้อนได้ ระบบจะเป็นผู้ตัดสินและจะแจ้งถ้าปฏิเสธ",
    "We could not check what this would change. You can still undo — the server decides, and it will say so if it refuses.",
  ],
  ["undo.previewRefused", "ระบบจะไม่ย้อนรายการนี้:", "The server will not undo this:"],
  // §D — the LINE-admin page, the ten rows his table listed
  ["lineAdmins.title", "บัญชี LINE ที่มีสิทธิ์แอดมิน", "LINE accounts with admin rights"],
  ["lineAdmins.hint", "บัญชีเหล่านี้จะได้รับข้อความแจ้งของแอดมิน ซึ่งมีชื่อเด็กของครอบครัวอื่นอยู่ด้วย", "These accounts receive the admin notices, which name other families' children."],
  ["lineAdmins.unknownAccount", "ไม่ทราบว่าเป็นบัญชีของใคร", "Unknown account"],
  ["lineAdmins.removeBtn", "ถอนสิทธิ์แอดมิน", "Remove admin rights"],
  ["lineAdmins.removeTitle", "ถอนสิทธิ์แอดมินของบัญชีนี้?", "Remove admin rights from this account?"],
  [
    "lineAdmins.removeBody",
    "บัญชีนี้จะไม่เป็นแอดมินอีกและจะไม่ได้รับข้อความแจ้งของแอดมิน ไม่ใช่การลบบัญชี",
    "It stops being an admin and stops receiving the admin notices. The account itself is not deleted.",
  ],
  ["lineAdmins.afterTeacher", "ยังใช้งานในฐานะครูได้ตามเดิม", "It keeps its coach access."],
  ["lineAdmins.afterParent", "ยังใช้งานในฐานะผู้ปกครองได้ตามเดิม", "It keeps its parent access."],
  [
    "lineAdmins.menuUnsettled",
    "ถอนสิทธิ์แอดมินแล้ว แต่ LINE ยังไม่รับการเปลี่ยนเมนู ระบบจะแก้ให้เองเมื่อบัญชีนี้เปิดแอปครั้งถัดไป",
    "Admin rights removed. LINE would not accept the menu change — it will settle the next time the account opens the app.",
  ],
  // §D2 (TASK-555) — the eight the §D table left out by accident. 🔑 **Held back rather than folded in, and approved on
  // their own on 09-28** — the reason holding them cost nothing: he answered a question he would never have been asked.
  ["lineAdmins.tail", "ไอดีลงท้าย {tail}", "id ends {tail}"],
  ["lineAdmins.alsoTeacher", "เป็นครู {name} ด้วย", "Also the coach {name}"],
  ["lineAdmins.alsoParent", "เป็นผู้ปกครอง {name} ด้วย", "Also the parent {name}"],
  ["lineAdmins.afterVisitor", "จะไม่มีสิทธิ์พิเศษใด ๆ เหลืออยู่", "It keeps no special access."],
  ["lineAdmins.confirm", "ถอนสิทธิ์แอดมิน", "Remove admin rights"],
  ["lineAdmins.removed", "ถอนสิทธิ์แอดมินแล้ว", "Admin rights removed"],
  ["lineAdmins.notKnownTitle", "สิ่งที่หน้านี้แสดงให้ไม่ได้ และเหตุผล", "What this page cannot show, and why"],
  ["lineAdmins.empty", "ยังไม่มีบัญชี LINE ที่มีสิทธิ์แอดมิน", "No LINE account has admin rights."],
];

/**
 * 🔑 **The approval BOUNDARY, and it is the valuable part — not the rows.** It is empty today because every string on
 * the LINE-admin page has now been shown to the owner and approved. **It is kept, not deleted:** the pin below asserts
 * that every key on that page is either in `APPROVED` or declared here with a reason, so **a new string cannot arrive
 * and be treated as his.** ⇒ *nobody may read silence as approval*, including about rows that do not exist yet.
 */
const UNREVIEWED: Record<string, string> = {};

describe("TASK-549 — the approved copy, by value", () => {
  it("🔑 all 31 rows are his sentence exactly, in Thai", () => {
    for (const [path, thText] of APPROVED) expect(at(th, path)).toBe(thText);
  });

  it("🔑 all 31 rows are his sentence exactly, in English", () => {
    for (const [path, , enText] of APPROVED) expect(at(en, path)).toBe(enText);
  });

  it("the set is the whole of §A–§D2 — 31 rows, not a subset that grew quietly", () => {
    expect(APPROVED.length).toBe(31);
    const groups = new Set(APPROVED.map(([p]) => p.split(".")[0]));
    expect([...groups].sort()).toEqual(["confirmAction", "lineAdmins", "undo"]);
  });

  it("✅ no approved string carries a DRAFT marker any more, and the REASONS stayed", () => {
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    // 📌 TASK-557 NARROWED this pin: it was a FILE-WIDE absence, which was true by accident on the day it was written
    // (every draft had just been approved) and would have forbidden the next honest draft. 🔑 What it MEANS is *no
    // APPROVED string carries a draft marker*, so it now reads the lines above each approved key — where a marker sits.
    const lines = raw.split(/\r?\n/);
    for (const [path] of APPROVED) {
      const key = path.split(".")[1];
      const at = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
      expect(at).toBeGreaterThan(0);
      expect(lines.slice(Math.max(0, at - 8), at).join("\n")).not.toContain("📝");
    }
    // and any marker that IS present must name its task, so a nameless draft cannot drift in
    for (const m of raw.match(/📝 \*{0,2}DRAFT \([^)]*\)/g) ?? []) expect(/TASK-\d+/.test(m)).toBe(true);
    expect((raw.match(/APPROVED by the owner 2026-09-28/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // 📌 and the reasons that must outlive the approval are still on the page
    expect(raw).toContain("“would”, deliberately:");
    expect(raw).toContain("anything here that LOOKED like a name would be invented");
    expect(raw).toContain("an admin who believes a leave costs the family an entitlement AVOIDS RECORDING IT");
  });

  it("🔑 the approval BOUNDARY still bites: every key is approved or a DECLARED draft — never merely present", () => {
    const approvedKeys = APPROVED.filter(([p]) => p.startsWith("lineAdmins.")).map(([p]) => p.split(".")[1]);
    const declared = Object.keys(UNREVIEWED);
    // 🔑 This is the pin that refused to treat the eight as approved before they were. Its list changed; it did not.
    expect(Object.keys(en.lineAdmins).sort()).toEqual([...approvedKeys, ...declared].sort());
    // every declared draft must say WHY it is not approved — an undeclared one cannot hide behind an empty string
    for (const [, why] of Object.entries(UNREVIEWED)) expect(why.trim().length).toBeGreaterThanOrEqual(20);
    // TASK-555: the page is final in full, so the exclusion list is empty — and that is asserted, not assumed
    expect(declared).toEqual([]);
    expect(approvedKeys.length).toBe(17);
  });

  it("📌 the drafts this task deliberately left alone are still marked as drafts", () => {
    const raw = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    // the discount errors and the attendee-note hint — other people's wording, other REQ lines
    expect((raw.match(/\/\/ DRAFT — no REQ line/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(raw).toContain("`hint` is a DRAFT: Porter owns the not-for-PII wording");
  });
});
