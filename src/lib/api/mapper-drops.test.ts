import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * TASK-543 — **what `dtoToBooking` does NOT carry, written down.**
 *
 * 🔴 Why: `dtoToBooking` is an **allow-list**, and `CourseSummary.leaveRemaining` / `adminUnlocked` were never mapped
 * although the server had sent them all along ⇒ **two facts invisible to every screen**, and **the compiler cannot say,
 * because an allow-list that omits a field looks exactly like one that never had it.** (TASK-541's addendum needed one of
 * them; TASK-542 is its mirror — *the server never sent it* — and this is *we dropped it on our own side of the wire*.)
 *
 * 🔑 **The deliverable is a LIST, not a mapping.** Dropping is fine and usually right; dropping **by accident** is not.
 * So the dropped set is **derived from the contract and the mapper source** and compared with the declaration below, and
 * **every entry carries a one-line reason** — ⚠️ *a list with no reasons is copied forward without thought, and then it
 * is just a longer silence.* A newly dropped field **fails this file until someone writes down why.**
 *
 * 🚫 Nothing was newly mapped "while I was here": a field nobody reads is how this mapper became long enough to hide two.
 *
 * 📌 **The shape of the silence, and it is narrower than the task assumed:** **every one of `BookingDTO`'s own 36 fields
 * IS mapped.** What hides fields is a **nested object the mapper REDUCES** to a scalar or two (`course` → `courseId` +
 * `courseLeaveLocked`; `student` → two names; `teacher` → an id; `subject` → a name). A nested object passed through whole
 * (`other`, `group`, `rental`, `discount`, `rate`, `coStudent`) **cannot hide anything.** ⇒ the declarations below are
 * per REDUCED object, which is exactly where the two lost facts lived.
 */

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The body of a `{ … }` block that starts at `header`, by brace matching. */
const block = (src: string, header: string): string => {
  const i = src.indexOf(header);
  expect(i).toBeGreaterThan(-1);
  let depth = 0;
  let j = i + header.length - 1;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(i + header.length, j);
};

/** The property names declared at depth 0 of an interface body (nested object literals are skipped, not flattened). */
const topKeys = (body: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    const m = depth === 0 ? line.match(/^\s*(\w+)\??\s*:/) : null;
    if (m) out.push(m[1]);
    for (const ch of line) {
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
    }
  }
  return out;
};

const contract = strip(readFileSync("src/types/api/contract.ts", "utf8"));
const mappers = strip(readFileSync("src/lib/api/mappers.ts", "utf8"));
const bookingBody = block(mappers, "export function dtoToBooking(dto: BookingDTO): Booking {");
/**
 * 📌 TASK-544 — the other two mappers, in THIS file with THESE helpers. @Sober asked whether to generalise; the honest
 * answer is **half**: the four helpers above are already generic, so all three mappers share one mechanism — but the
 * declarations stay **three explicit lists with their own `describe`**, because a table driving three mappers through one
 * loop would hide which mapper an entry belongs to, and 🔑 *a check nobody can read stops being maintained.*
 */
const teacherBody = block(mappers, "export function dtoToTeacher(dto: TeacherDTO): Teacher {");
const courseViewBody = block(mappers, "export function dtoToCourseView(row: CourseSummary & { student: StudentRef }): CoursePackageView {");

const ifaceKeys = (name: string) => topKeys(block(contract, `export interface ${name} {`));
/** What a mapper body reads off `<root>.<path>` — `…?.x` and `….x` alike. */
const readsIn = (body: string, path: string) =>
  new Set([...body.matchAll(new RegExp(`${path.replace(/\./g, "\\.")}[?]?\\.(\\w+)`, "g"))].map((m) => m[1]));
/** The booking mapper's own reads, kept short because most of this file is about it. */
const readsOf = (path: string) => readsIn(bookingBody, `dto.${path}`);
const dropped = (fields: string[], reads: Set<string>) => fields.filter((f) => !reads.has(f)).sort();

// ─────────────────────────────────────────────────────────────────────────────
// The declarations. A field may be dropped; it may not be dropped SILENTLY.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔑 **Deliberately empty.** Every top-level `BookingDTO` field is mapped today, so this pin is the one that makes the
 * NEXT accidental drop fail immediately — the check TASK-170 and TASK-541 both needed and did not have.
 */
const DROPPED_TOP: Record<string, string> = {};

/** `dto.course` → `courseId` + `courseLeaveLocked`. This is where the two lost facts lived. */
const DROPPED_COURSE: Record<string, string> = {
  size: "the package size is a course/plan-page fact; a calendar row never shows it",
  usedSessions: "a course-page counter — a booking row shows its own status, not the plan's progress",
  leaveUsed: "a course-page counter; the leave dialog needs only 'is it locked', which `leaveLocked` answers",
  leaveQuota: "same counter pair as `leaveUsed` — shown on the course page, never on a row",
  leaveRemaining: "🔑 deliberately NOT carried: with `adminUnlocked` it would let the FE recompute `leaveLocked`, and the server already sends that answer (TASK-543's own correction)",
  adminUnlocked: "🔑 same reason — the two of these ARE the server's `leaveLocked` condition; carrying them invites a second copy of one rule",
  maxWeek: "a scheduling bound the plan editor reads from its own course query",
  endedAt: "course lifecycle; the row's own `status` and the course pages carry what staff need",
  endReason: "course lifecycle, as above",
  status: "the COURSE's lifecycle badge — the row renders the BOOKING's status, and mixing the two is TASK-183's bug",
  expiryDate: "the expiry surfaces (course page, expiry preview) read the course directly",
  subject: "the row already has its own `subject` from `dto.subject`; a second source would be two opinions",
  rental: "the row carries its OWN `dto.rental` (this session's), which is the one a cell may show",
  courseKind: "PRIVATE/DUO is answered for a row by `coStudent`, which IS mapped",
  coStudent: "the row's own `dto.coStudent` is the sent-and-joined one (TASK-424); the course copy would be a second source",
  classRateMinor: "the row carries `dto.rate` — the three rate facts as sent, including the course default",
};

/** `dto.student` → `studentName` + `nickname`. */
const DROPPED_STUDENT: Record<string, string> = {
  id: "a booking row has never needed the student id; every action goes by booking id",
  crmPoints: "CRM belongs to the student's own page; a schedule row showing points invites decisions from the wrong screen",
  crmLevel: "CRM rung, same reason as `crmPoints` — it belongs to the student's page",
  crmLevelName: "the rung's label, same reason as `crmLevel`",
  priorityBooking: "advisory CRM perk, read where a booking is CREATED, not where one is displayed",
  perks: "advisory CRM perks, same reason as `priorityBooking` — a create-time concern",
};

/** `dto.teacher` → `teacherId` (and `dto.teachers`, carried whole). */
const DROPPED_TEACHER: Record<string, string> = {
  name: "carried whole in `teachers[]`, which every surface reads; `teacherId` stays for the legacy single-teacher readers",
  nickname: "carried whole in `teachers[]`, same as `name` — the cells read that array",
  type: "carried whole in `teachers[]`; the leave-notice rule reads the teacher's own record, not a row",
};

/** `dto.subject` → `subject` (its name). */
const DROPPED_SUBJECT: Record<string, string> = {
  id: "no surface acts on a subject id from a booking row",
  kind: "PRIVATE/DUO on a subject is a teacher/package fact (TASK-437); a row answers DUO from `coStudent`",
};

const REASON_MIN = 25;

describe("TASK-543 — the fields `dtoToBooking` drops, declared", () => {
  it("🔴 every top-level `BookingDTO` field is mapped — and a NEW drop fails here until it is declared", () => {
    const keys = ifaceKeys("BookingDTO");
    expect(keys.length).toBeGreaterThan(30); // the parse found the interface, not an empty block
    expect(dropped(keys, new Set([...bookingBody.matchAll(/dto\.(\w+)/g)].map((m) => m[1])))).toEqual(
      Object.keys(DROPPED_TOP).sort(),
    );
  });

  it("🔑 `course` — the reduced object where the two lost facts lived", () => {
    expect(dropped(ifaceKeys("CourseSummary"), readsOf("course"))).toEqual(Object.keys(DROPPED_COURSE).sort());
    // and what IS carried, so the pin is about the split and not only about the losses
    expect(readsOf("course").has("id")).toBe(true);
    expect(readsOf("course").has("leaveLocked")).toBe(true);
  });

  it("`student` — reduced to the two names a row shows", () => {
    expect(dropped(ifaceKeys("StudentRef"), readsOf("student"))).toEqual(Object.keys(DROPPED_STUDENT).sort());
  });

  it("`subject` — reduced to its name", () => {
    expect(dropped(ifaceKeys("SubjectRef"), readsOf("subject"))).toEqual(Object.keys(DROPPED_SUBJECT).sort());
  });

  it("`teacher` — reduced to an id (the whole ref rides in `teachers[]`)", () => {
    // 📌 Its DTO type is a `Pick<>`, so the declared set is read from that Pick rather than from an interface.
    const pick = contract.match(/teacher: Pick<TeacherDTO,([^>]*)>/);
    expect(pick).not.toBeNull();
    const fields = [...pick![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(fields.length).toBe(4);
    expect(dropped(fields, readsOf("teacher"))).toEqual(Object.keys(DROPPED_TEACHER).sort());
  });

  it("⚠️ every declared drop carries a REAL reason — a list without reasons is just a longer silence", () => {
    const sets = [DROPPED_TOP, DROPPED_COURSE, DROPPED_STUDENT, DROPPED_TEACHER, DROPPED_SUBJECT];
    // 📌 Counted per SET, not over a merge: two objects legitimately drop a field of the same name (`id`), and a merge
    // would quietly hide one of the two reasons — the very shape of failure this file exists to catch.
    const all = sets.flatMap((s) => Object.entries(s));
    for (const [field, reason] of all) {
      expect(reason.trim().length).toBeGreaterThanOrEqual(REASON_MIN);
      // 🚫 no placeholder reasons: "n/a", "TODO", "unused", "-" — each of those is the silence with a label on it
      expect(/^(n\/?a|todo|tbd|unused|not used|-+|\?+)\.?$/i.test(reason.trim())).toBe(false);
      expect(field.length).toBeGreaterThan(0);
    }
    // the four reduced objects, plus the (currently empty) top level
    expect(all.length).toBe(27);
    expect(sets.map((s) => Object.keys(s).length)).toEqual([0, 16, 6, 3, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK-544 — the other two mappers. Same mechanism, their own declarations.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔑 **`dtoToTeacher` drops nothing, at either level** — and the reason is worth naming, because it is the pattern that
 * makes a mapper safe: `dto.subjects` is reduced to names for the list AND **carried whole** as `subjectOptions`. **A
 * nested object that is reduced *and* kept cannot hide a field**, which is precisely what `course` did not do.
 */
const DROPPED_TEACHER_TOP: Record<string, string> = {};

/** `dtoToCourseView` carries all 18 `CourseSummary` fields. Its one reduced object is `row.student` → a name. */
const DROPPED_COURSEVIEW_TOP: Record<string, string> = {};
const DROPPED_COURSEVIEW_STUDENT: Record<string, string> = {
  id: "the course page acts on the COURSE id; a student id would be a second handle on one row",
  nickname: "`studentName` is the server-joined label (TASK-424) — a nickname beside it would be two names for one child",
  crmPoints: "CRM belongs to the student's own page, the same reason as on a booking row",
  crmLevel: "CRM rung, same reason as `crmPoints`",
  crmLevelName: "the rung's label, same reason as `crmLevel`",
  priorityBooking: "advisory CRM perk, read where a booking is CREATED, not on a course card",
  perks: "advisory CRM perks, same reason as `priorityBooking`",
};

/**
 * 🔴 **The FINDING of TASK-544, RULED and FIXED in TASK-545 — and this pin changed meaning, deliberately.**
 *
 * `dtoToCourseView` used to **INVENT**: `CoursePackage` required `startDate` / `weekday` / `startTime`, `CourseSummary`
 * sends none, so the mapper filled `""`, `0` and `"09:00"`. 🔑 **A dropped field is `undefined` and every reader is
 * guarded; a fabricated one is a plausible value nobody questions** — `"09:00"` is a real time, `0` is Sunday, **so the
 * day a reader appeared nothing would have FAILED: a screen would just have shown Sunday 09:00.**
 * ⚖️ @Sober ruled **the TYPE, not the contract**: `CoursePackageView` now omits the three, so the mapper cannot supply
 * them and a reader is a compile error rather than a wrong screen.
 *
 * ⇒ **What this pin asserts now is the stronger statement:** not *"these three inventions are declared"* but **"this
 * mapper invents NOTHING — there is no literal-valued key in its body at all."** 🚫 It therefore cannot pass merely
 * because the three are gone: re-introducing **any** fabricated default, under any name, fails it.
 */
const INVENTED_COURSEVIEW: Record<string, string> = {};

describe("TASK-544 — `dtoToTeacher` and `dtoToCourseView` declare their drops", () => {
  it("🔑 `dtoToTeacher`: nothing dropped, because its one nested object is reduced AND kept whole", () => {
    expect(dropped(ifaceKeys("TeacherDTO"), readsIn(teacherBody, "dto"))).toEqual(Object.keys(DROPPED_TEACHER_TOP).sort());
    // the pattern itself, pinned: the names for the list, and the refs kept intact beside them
    expect(teacherBody).toContain("subjects: dto.subjects.map((s) => s.name),");
    expect(teacherBody).toContain("subjectOptions: dto.subjects,");
  });

  it("`dtoToCourseView`: all 18 summary fields carried; the reduced `student` declares its 7", () => {
    const keys = ifaceKeys("CourseSummary");
    expect(keys.length).toBe(18);
    expect(dropped(keys, readsIn(courseViewBody, "row"))).toEqual(Object.keys(DROPPED_COURSEVIEW_TOP).sort());
    expect(dropped(ifaceKeys("StudentRef"), readsIn(courseViewBody, "row.student"))).toEqual(
      Object.keys(DROPPED_COURSEVIEW_STUDENT).sort(),
    );
    // 🔑 the one field it does read off the student, through the shared label rule rather than a second join
    expect(courseViewBody).toContain("studentName: studentLabel(row.student.name, row.coStudent),");
  });

  it("🔴 TASK-545 — `dtoToCourseView` invents NOTHING: no literal-valued key, and the three are gone from the type", () => {
    // every key in this body must come from the row; a literal on the right-hand side IS an invention
    const literals = [...courseViewBody.matchAll(/^\s{4}(\w+): (?:"[^"]*"|\d+|true|false),$/gm)].map((m) => m[1]).sort();
    expect(literals).toEqual([]);
    expect(Object.keys(INVENTED_COURSEVIEW)).toEqual([]);
    // 🔑 and the reason it cannot come back: the view no longer REQUIRES what the summary does not send
    const appTypes = strip(readFileSync("src/types/app/scheduler/index.ts", "utf8"));
    expect(appTypes).toContain('export interface CoursePackageView extends Omit<CoursePackage, "startDate" | "weekday" | "startTime"> {');
    // 🚫 `CoursePackage` itself keeps all three — the plan flow has genuine times and they are not this type's business
    const pkg = block(appTypes, "export interface CoursePackage {");
    for (const f of ["startDate", "weekday", "startTime"]) expect(pkg).toContain(`${f}:`);
  });

  it("⚠️ these declarations carry real reasons too — the same bar as TASK-543's", () => {
    const sets = [DROPPED_TEACHER_TOP, DROPPED_COURSEVIEW_TOP, DROPPED_COURSEVIEW_STUDENT, INVENTED_COURSEVIEW];
    for (const [, reason] of sets.flatMap((s) => Object.entries(s))) {
      expect(reason.trim().length).toBeGreaterThanOrEqual(REASON_MIN);
      expect(/^(n\/?a|todo|tbd|unused|not used|-+|\?+)\.?$/i.test(reason.trim())).toBe(false);
    }
    // 📌 the last is 0 since TASK-545: the inventions are gone, and the pin above now says "invents nothing at all"
    expect(sets.map((s) => Object.keys(s).length)).toEqual([0, 0, 7, 0]);
  });
});

/**
 * 🚫 **Nothing outside `lib/api/mappers.ts` has this shape** — the services hand DTOs straight to their hooks, so there is
 * no fourth place to look. Pinned, so a fourth `dtoTo*` cannot appear without landing in one of the lists above.
 */
describe("TASK-543/544 — the mappers this file covers, exhaustively", () => {
  it("all three are covered here: a fourth would have nowhere to hide", () => {
    const fns = [...mappers.matchAll(/export function (dtoTo\w+)/g)].map((m) => m[1]).sort();
    expect(fns).toEqual(["dtoToBooking", "dtoToCourseView", "dtoToTeacher"]);
  });
});
