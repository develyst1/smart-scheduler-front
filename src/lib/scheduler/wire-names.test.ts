import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "bun:test";

/**
 * 🔴 TASK-322 — **the class TASK-320 belonged to: a form value that never arrives where the feature reads it.**
 *
 * TASK-320 sat from REQ-068 until an owner typed a note into a box that wrote it to the wrong column. Every
 * layer was green — the BE stored it, the client forwarded it, the schema declared it — because **each
 * asserted its own half of a boundary neither crossed.**
 *
 * ⚠️ **Read `§B` before trusting `§A`.** The check I proposed on TASK-320 (*"assert the key sets agree"*) is
 * `§A`, it is worth having, **and it would NOT have caught TASK-320.** The one that would is `§B`, and I only
 * found that by trying to make `§A` fail on the defect it was designed for.
 *
 * 🚫 No product code is changed by this file. It reads source text: no harness, no running request — a version
 * that needs a server is a version that gets skipped and stops being run.
 */

const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * Top-level keys of the object literal whose `{` is at `open`. Tracks bracket depth and skips strings, so a
 * nested literal, a call argument or a comma inside a template cannot be mistaken for a key. Shorthand
 * (`teacherId,`) counts — it is a key on the wire exactly like `teacherId: x`.
 */
const topLevelKeys = (src: string, open: number): string[] => {
  const keys: string[] = [];
  let depth = 0;
  let expectKey = true;
  let token = "";
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      depth++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    if (!expectKey) {
      if (c === ",") {
        expectKey = true;
        token = "";
      }
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) token += c;
    else if (c === ":") {
      if (token) keys.push(token);
      token = "";
      expectKey = false;
    } else if (c === ",") {
      if (token) keys.push(token);
      token = "";
    } else if (!/\s/.test(c)) token = "";
  }
  if (expectKey && token) keys.push(token);
  return keys;
};

const keysOfLiteralAfter = (src: string, anchor: string): string[] => {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  return topLevelKeys(src, src.indexOf("{", at));
};

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return tsxFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [p] : [];
  });

const SERVICE = codeOf("src/services/scheduler.service.ts");

// ───────────────────────────── §A — the key sets agree ─────────────────────────────

/**
 * Each pair: what a FORM hands to its mutation, against the request body the service builds for it.
 *
 * 🔑 **The allow-list is the deliverable as much as the check.** Every entry is a place a human decided the
 * names may legitimately differ, **written where the next reader meets it.** 🚫 A bare entry would be TASK-320
 * with a comment on it.
 */
const STUDENT_TRIPLE = {
  studentName: "folded into `student` by `studentPayload(input)` — the BE takes one student object, and these three are how a form offers 'pick an existing child or type a new one'.",
  studentId: "same fold — `studentPayload` emits `{ id }` when the child already exists.",
  studentPhone: "same fold — the parent's phone find-or-creates the guardian, server-side.",
};

const PAIRS: Array<{
  label: string;
  file: string;
  formAnchor: string;
  serviceAnchor: string;
  allow: Record<string, string>;
}> = [
  {
    label: "CreatePlanFlow → POST /courses",
    file: "src/components/partials/Bookings/CreatePlanFlow.tsx",
    formAnchor: "const result = await create.mutateAsync(",
    serviceAnchor: 'api.post<CreateCoursePackageResponse>("/courses", {',
    allow: { ...STUDENT_TRIPLE },
  },
  {
    label: "CreateVoucherModal → POST /vouchers",
    file: "src/components/partials/Bookings/CreateVoucherModal.tsx",
    formAnchor: "const res = await create.mutateAsync(",
    serviceAnchor: 'api.post<CreateVoucherResponse>("/vouchers", {',
    allow: { ...STUDENT_TRIPLE },
  },
  {
    label: "ImportBalanceModal (course) → POST /courses/import",
    file: "src/components/partials/Bookings/ImportBalanceModal.tsx",
    formAnchor: "await importCourse.mutateAsync(",
    serviceAnchor: '"/courses/import", {',
    allow: { ...STUDENT_TRIPLE },
  },
  {
    label: "ImportBalanceModal (voucher) → POST /vouchers/import",
    file: "src/components/partials/Bookings/ImportBalanceModal.tsx",
    formAnchor: "await importVoucher.mutateAsync(",
    serviceAnchor: '"/vouchers/import", {',
    allow: { ...STUDENT_TRIPLE },
  },
];

describe("§A — every key a form sends is a key its service forwards", () => {
  for (const pair of PAIRS) {
    it(pair.label, () => {
      const formKeys = keysOfLiteralAfter(codeOf(pair.file), pair.formAnchor);
      const bodyKeys = keysOfLiteralAfter(SERVICE, pair.serviceAnchor);
      expect(formKeys.length).toBeGreaterThan(0);
      const unexplained = formKeys.filter((k) => !bodyKeys.includes(k) && !(k in pair.allow));
      expect(unexplained).toEqual([]);
      // 🚫 No bare allow-list entries: an exemption without a reason is the defect wearing a comment.
      for (const [key, reason] of Object.entries(pair.allow)) {
        expect(reason.length).toBeGreaterThan(20);
        expect(formKeys).toContain(key);
      }
    });
  }
});

// ───────────────────────── §B — the one that would have caught TASK-320 ─────────────────────────

/**
 * 🔴 **`§A` would NOT have caught TASK-320, and this is the important result in this task.**
 *
 * The dialog sent `note:`; the service forwards `note: input.note` faithfully. **The key sets AGREED.** The
 * defect was not a dropped or renamed key — it was the *wrong valid field*, and no name-agreement check can
 * see that.
 *
 * 🔑 **What was actually observable: `CreateCourseInput.attendeeNote` was declared, forwarded by the service,
 * read by the BE — and set by NO form.** ⇒ **a field on a create input that nothing ever sets is a feature
 * that cannot be reached from the UI.** That is the shape of TASK-320, and it is checkable.
 */
/**
 * 🔻 **The first version of this check unioned every `mutateAsync` payload in the app, and it did NOT fail on
 * TASK-320's defect.** I found that by running the demonstration the DoD asks for, which is the only thing that
 * could have found it: **`attendeeNote` was always set by the per-session `Session note` editor**, so the union
 * contained it whatever the CREATE dialog did. ⇒ **the field looked reachable while the feature was not.**
 *
 * 🔑 **The fix is scope: a field is only "set" if it is set by a form that feeds THAT input.** Anything wider
 * lets one surface vouch for another, which is a smaller version of the very mistake being checked for.
 */
const FORMS_FEEDING: Record<string, Array<{ file: string; anchor: string }>> = {
  CreateCourseInput: [
    { file: "src/components/partials/Bookings/CreatePlanFlow.tsx", anchor: "const result = await create.mutateAsync(" },
    { file: "src/components/partials/Bookings/CreateCourseModal.tsx", anchor: "const result = await create.mutateAsync(" },
  ],
  CreateVoucherInput: [
    { file: "src/components/partials/Bookings/CreateVoucherModal.tsx", anchor: "const res = await create.mutateAsync(" },
  ],
  ImportCourseInput: [
    { file: "src/components/partials/Bookings/ImportBalanceModal.tsx", anchor: "await importCourse.mutateAsync(" },
  ],
  ImportVoucherInput: [
    { file: "src/components/partials/Bookings/ImportBalanceModal.tsx", anchor: "await importVoucher.mutateAsync(" },
  ],
};

const keysFeeding = (name: string): Set<string> =>
  new Set(FORMS_FEEDING[name].flatMap((f) => keysOfLiteralAfter(codeOf(f.file), f.anchor)));

const interfaceFields = (name: string): string[] => {
  const at = SERVICE.indexOf(`export interface ${name} {`);
  if (at < 0) throw new Error(`interface not found: ${name}`);
  const body = SERVICE.slice(SERVICE.indexOf("{", at), SERVICE.indexOf("\n}", at));
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
};

/**
 * Fields no form sets **on purpose**, each with its reason. 🔑 This list is the real output of the task: it is
 * every place someone decided a declared input may go unused.
 */
const ORPHANS_ALLOWED: Record<string, string> = {
  "ImportCourseInput.note": "🔴 FOUND BY THIS CHECK, reported not fixed (TASK-322 §3). The import form has no note box at all, so this declared+forwarded field has never been reachable from the UI — the same shape as `attendeeNote` before TASK-320, and the second instance. ⚠️ Whether the import SHOULD offer a note is a product question, so it is @Sober's, not this task's.",
};

describe("§B — a declared create-input field that no form FEEDING IT sets is an unreachable feature", () => {
  for (const name of Object.keys(FORMS_FEEDING)) {
    it(name, () => {
      const fields = interfaceFields(name);
      const set = keysFeeding(name);
      expect(fields.length).toBeGreaterThan(0);
      expect(set.size).toBeGreaterThan(0);
      const orphans = fields.filter((f) => !set.has(f) && !(`${name}.${f}` in ORPHANS_ALLOWED));
      expect(orphans).toEqual([]);
    });
  }

  it("🚫 no bare exemptions — every orphan carries its reason", () => {
    for (const reason of Object.values(ORPHANS_ALLOWED)) expect(reason.length).toBeGreaterThan(40);
  });

  it("🔑 the demonstration: this is the line that fails when TASK-320's defect is re-introduced", () => {
    // Put `note:` back in `CreatePlanFlow` and `attendeeNote` has no form feeding `CreateCourseInput` that sets
    // it — `CreateCourseModal` does not either. **That is the only proof the check catches what it was built
    // for**, and the first version of this file passed that test, which is why the scoping above exists.
    expect(keysFeeding("CreateCourseInput").has("attendeeNote")).toBe(true);
  });
});

describe("🚫 this task changed no product code", () => {
  it("reads source and asserts; it does not import the app or run a request", () => {
    // A version that needs a server is a version that gets skipped in CI and stops being run.
    //
    // ⚠️ Scoped to the IMPORT BLOCK, and the reason is worth the line: written file-wide, this assertion
    // **caught the string it was itself asserting on.** That is the fourth appearance this week of *a test
    // that forbids a string finding it in its own explanation* — here, in its own expectation. 🔑 Slice to the
    // region the rule is about; never the whole file.
    const self = readFileSync("src/lib/scheduler/wire-names.test.ts", "utf8");
    const imports = self.slice(0, self.indexOf("/**"));
    expect(imports).toContain('from "fs"');
    expect(imports).not.toContain("@/services/");
    expect(imports).not.toContain("@/components/");
  });
});
