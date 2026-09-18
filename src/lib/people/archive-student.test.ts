import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";

/**
 * REQ-093 / TASK-393 — archive a student on the FE: the red Archive beside Delete (two taps; history and money stay;
 * the 409 sentence in the dialog), a remembered `Show archived` toggle listing the archived children dimmed with a
 * one-tap Restore, both under `action:people.student-archive`. 🔑 The server hides archived students from every
 * working read — pickers and the calendar carry NO client-side `archivedAt` filter (walk-pinned).
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/People/PeopleContent.tsx");
const svc = codeOf("src/services/people.service.ts");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });

describe("§1 — archive, two taps", () => {
  it("the red Archive icon sits beside the trash on every working row, under the key; the dialog's red confirm is the second tap", () => {
    const rows = page.slice(page.indexOf("{p.students.map((s) => {"), page.indexOf("{showArchived &&"));
    expect(rows).toContain('{can("action:people.student-archive") && (');
    expect(rows).toContain("<Archive size={15} />");
    expect(rows).toContain("setArchiveTarget(s);");
    // archive BEFORE delete on the row, both red, each under its own key
    expect(rows.indexOf('t("people.archiveStudent")')).toBeLessThan(rows.indexOf('t("people.deleteStudent")'));
    const dialog = page.slice(page.indexOf("opened={archiveTarget !== null}"), page.indexOf("opened={deleteTarget !== null}"));
    expect(dialog).toContain('t("people.archiveStudentBody")');
    expect(dialog).toContain("{archiveError && (");
    expect(dialog).toContain('<Button color="red" leftSection={<Archive size={15} />} loading={archiveStudent.isPending} onClick={runArchive}>');
    // the second tap is the ONLY call; its refusal is the server's sentence in the dialog
    const run = page.slice(page.indexOf("const runArchive = async"), page.indexOf("const runRestore = async"));
    expect(run).toContain("await archiveStudent.mutateAsync(archiveTarget.id);");
    expect(run).toContain("setArchiveError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(run).not.toMatch(/bookings|sessions|history|STUDENT_HAS_LIVE_SESSIONS/); // no client rule, no composed sentence
    // the dialog's own words: history and money stay — in both languages
    expect(dictionaries.en.people.archiveStudentBody).toContain("History and money stay");
    expect(dictionaries.th.people.archiveStudentBody).toContain("ประวัติและเงินคงเดิม");
  });

  it("request shapes: POST /students/:id/archive · /unarchive ⇒ { student }; both re-read the parents; one key for both", () => {
    expect(svc).toContain("api.post<{ student: Student }>(`/students/${id}/archive`, {})");
    expect(svc).toContain("api.post<{ student: Student }>(`/students/${id}/unarchive`, {})");
    const hooks = codeOf("src/hooks/scheduler/usePeople.ts");
    expect(hooks).toContain("mutationFn: (id: string) => archiveStudent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY })");
    expect(hooks).toContain("mutationFn: (id: string) => unarchiveStudent(id), onSuccess: () => qc.invalidateQueries({ queryKey: PARENTS_KEY })");
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:people.student-archive");
    expect((page.match(/"action:people\.student-archive"/g) ?? []).length).toBe(2); // the icon and the Restore, nothing else
  });
});

describe("§2 — Show archived + Restore", () => {
  it("a remembered toggle (the calendar's boolStore, its own key), default OFF; the archived children render dimmed from the read's own `archivedStudents` with a one-tap Restore", () => {
    const store = codeOf("src/lib/people/show-archived.ts");
    expect(store).toContain('boolStore("ss.showArchivedStudents", false)');
    expect(codeOf("src/lib/scheduler/cancelled-tray.ts")).toContain("export function boolStore(");
    expect(page).toContain("const { shown: showArchived, toggle: toggleShowArchived } = useShowArchived();");
    expect(page).toContain('<Switch size="sm" label={t("people.showArchived")} checked={showArchived} onChange={toggleShowArchived} />');
    const block = page.slice(page.indexOf("{showArchived &&"), page.indexOf("opened={archiveTarget !== null}"));
    expect(block).toContain("(p.archivedStudents?.length ?? 0) > 0");
    expect(block).toContain('className="opacity-60"');
    expect(block).toContain('t("people.archivedBadge")');
    expect(block).toContain("onClick={() => void runRestore(s)}");
    expect(block).toContain('{can("action:people.student-archive") && (');
    // restore is ONE tap: no dialog, no confirm
    const restore = page.slice(page.indexOf("const runRestore = async"), page.indexOf("const runSuspend = async"));
    expect(restore).toContain("await unarchiveStudent.mutateAsync(s.id);");
    expect(restore).not.toMatch(/askConfirm|setArchiveTarget|Modal/);
    // no second call for the archived list: nothing on the page fetches with `archived`
    expect(page).not.toMatch(/archived=true|includeArchived|\?archived/);
  });

  it("pickers and the calendar are untouched: no client-side `archivedAt` filter anywhere outside the People page and its types/service", () => {
    const allowed = /people\/index\.ts|people\.service\.ts|people\.mock\.service\.ts|People\/PeopleContent\.tsx|lib\/people\/show-archived\.ts/;
    const hits = walk("src").filter((f) => !allowed.test(f.replace(/\\/g, "/")) && /archivedAt|archivedStudents/.test(codeOf(f)));
    expect(hits).toEqual([]);
    // and even on the People page, `archivedAt` never decides anything — the split is the server's two lists
    expect(page).not.toContain("archivedAt");
    // the working list is still `p.students`; the archived list is `p.archivedStudents` — never one filtered from the other
    expect(page).toContain("{p.students.map((s) => {");
    expect(page).not.toMatch(/students\.filter\([^)]*archiv/);
  });

  it("copy: people +9 × 2; the types carry `archivedAt` and `archivedStudents`", () => {
    for (const k of ["archiveStudent", "archiveStudentTitle", "archiveStudentBody", "archiveStudentConfirm", "archivedOk", "showArchived", "archivedBadge", "restore", "restoredOk"]) {
      expect((dictionaries.en.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
    const types = readFileSync("src/types/app/people/index.ts", "utf8");
    expect(types).toContain("archivedAt?: string | null;");
    expect(types).toContain("archivedStudents?: Student[];");
  });
});
