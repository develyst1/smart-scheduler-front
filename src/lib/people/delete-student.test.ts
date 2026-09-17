import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * TASK-365 (`REQ-089 item 3`) — hard delete of a history-free student, from the People page.
 *
 * 🔑 The rule has ONE source — the server (`409 STUDENT_HAS_HISTORY`, the Thai sentence with the counts). So what
 * this file pins is the SHAPE: two taps, the action offered on every student with no client-side history check,
 * the server's sentence shown in the dialog, and the same invalidation as create-student after a `200`.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/People/PeopleContent.tsx");
const svc = codeOf("src/services/people.service.ts");
const hooks = codeOf("src/hooks/scheduler/usePeople.ts");
const { en, th } = dictionaries;

describe("two taps — the red action on every student row, then a dialog that names the student", () => {
  it("first tap: a red Trash icon beside the student's Edit, with NO condition on the student or the parent", () => {
    const rows = page.slice(page.indexOf("p.students.map((s) =>"), page.indexOf("</Stack>", page.indexOf("p.students.map((s) =>")));
    expect(rows).toContain("<Trash2 size={15} />");
    expect(rows).toContain('color="red"');
    expect(rows).toContain("setDeleteTarget(s);");
    // offered on EVERY student: no `&&` guard around the delete icon, no suspend/history/bookings condition
    const icon = rows.slice(rows.indexOf('label={t("people.deleteStudent")}'), rows.indexOf("</Group>"));
    expect(icon).not.toMatch(/suspended|history|bookings|courses|hasHistory|\?\s*\(|&&\s*\(/);
    // and nothing about the STUDENT gates the tooltip either: between the Edit icon's close and the Delete tooltip the only
    // condition allowed is the USER's own grant (REQ-092 Stage 3 / TASK-386 — `can("action:people.student-delete")`),
    // which is stripped here before the negative runs; a suspend/history/parent condition would still trip it.
    const gap = rows
      .slice(rows.indexOf("</Tooltip>"), rows.indexOf('<Tooltip label={t("people.deleteStudent")}'))
      .replace(/\{can\("action:people\.student-delete"\) && \(/g, "");
    expect(gap.length).toBeGreaterThan(0);
    expect(gap).not.toMatch(/&&|\?|suspended/);
  });

  it("second tap: the dialog names the student, says permanent, red confirm beside a plain cancel", () => {
    const dialog = page.slice(page.indexOf("opened={deleteTarget !== null}"), page.indexOf("opened={suspendTarget !== null}"));
    expect(dialog).toContain('title={t("people.deleteStudentTitle", { name: deleteTarget?.nickname || deleteTarget?.name || "" })}');
    expect(dialog).toContain('t("people.deleteStudentBody")');
    expect(dialog).toContain('t("common.cancel")');
    expect(dialog).toContain("onClick={runDelete}");
    expect(dialog).toContain('color="red"');
    expect(dialog.indexOf('t("common.cancel")')).toBeLessThan(dialog.indexOf("onClick={runDelete}"));
  });
});

describe("🔑 the rule has ONE source — the server", () => {
  it("🚫 no client-side history check anywhere in the delete path (page, service, hook)", () => {
    const del = page.slice(page.indexOf("const runDelete"), page.indexOf("const runSuspend"));
    for (const src of [del, svc.slice(svc.indexOf("export const deleteStudent"), svc.indexOf("export const setParentSuspended")), hooks]) {
      expect(src).not.toMatch(/history|bookings\.length|courses\.length|hasHistory|STUDENT_HAS_HISTORY/);
    }
    expect(svc).toContain("api.delete<{ deleted: true }>(`/students/${id}`)");
  });

  it("409 ⇒ the server's sentence in the dialog, the dialog stays open; 200 ⇒ notice + close + the same invalidation as create", () => {
    const del = page.slice(page.indexOf("const runDelete"), page.indexOf("const runSuspend"));
    expect(del).toContain("setDeleteError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(del).not.toMatch(/catch[\s\S]*setDeleteTarget\(null\)/); // a refusal does not close the dialog
    expect(del).toContain("await deleteStudent.mutateAsync(deleteTarget.id);");
    expect(del).toContain('t("people.deletedOk", { name: deleteTarget.nickname || deleteTarget.name })');
    expect(del).toContain("setDeleteTarget(null);");
    // the dialog renders the sentence above the body
    const dialog = page.slice(page.indexOf("opened={deleteTarget !== null}"), page.indexOf("opened={suspendTarget !== null}"));
    expect(dialog).toContain("{deleteError}");
    // hook: same key as create-student
    const create = hooks.slice(hooks.indexOf("export const useCreateStudent"), hooks.indexOf("export const useUpdateStudent"));
    const remove = hooks.slice(hooks.indexOf("export const useDeleteStudent"), hooks.indexOf("export const useSetParentSuspended"));
    expect(create).toContain("qc.invalidateQueries({ queryKey: PARENTS_KEY })");
    expect(remove).toContain("qc.invalidateQueries({ queryKey: PARENTS_KEY })");
    expect(remove).toContain("mutationFn: (id: string) => deleteStudent(id),");
  });
});

describe("copy — five new keys × 2, the dialog says what happens", () => {
  it("both languages, name interpolated, permanent stated", () => {
    for (const d of [en, th]) {
      expect(d.people.deleteStudent.length).toBeGreaterThan(0);
      expect(d.people.deleteStudentTitle).toContain("{name}");
      expect(d.people.deletedOk).toContain("{name}");
      expect(d.people.deleteStudentConfirm.length).toBeGreaterThan(2);
    }
    expect(en.people.deleteStudentBody).toMatch(/cannot be undone/i);
    expect(th.people.deleteStudentBody).toContain("ย้อนกลับไม่ได้");
    expect(th.people.deleteStudentBody).toContain("ลบถาวร");
  });
});
