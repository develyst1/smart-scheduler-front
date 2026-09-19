import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { archivedParentsQuery } from "./parent-archive";

/**
 * REQ-098 / SPEC-084 / TASK-411/412 — archive a PARENT: a red door on the family card (the 56th key, the students'
 * door's shape), a confirm that says the children go with it and the LINE link is cleared; the `Show archived` toggle
 * REQ-093 gave the children now also lists the archived families (`GET /parents?archived=1` — the server's list, the
 * same search, fetched only while shown); a Restore whose confirm says the LINE link is NOT restored. 🚫 No client
 * rule: the cascade, the counts and every refusal are the server's sentence.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/People/PeopleContent.tsx");
const svc = codeOf("src/services/people.service.ts");
const hooks = codeOf("src/hooks/scheduler/usePeople.ts");

describe("§1 — the query (pure) and the key", () => {
  it("the restore view = the same search + `archived: 1`, no offset; the 56th key sits after `people.student-archive`", () => {
    expect(archivedParentsQuery(undefined)).toEqual({ archived: 1, limit: 100 });
    expect(archivedParentsQuery("som")).toEqual({ q: "som", archived: 1, limit: 100 });
    expect("offset" in archivedParentsQuery("x")).toBe(false);
    expect(ACTION_KEYS_SNAPSHOT.indexOf("action:people.parent-archive")).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:people.student-archive") + 1);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(56);
  });
});

describe("§2 — the two calls and the one toggle", () => {
  it("the wire: `POST /parents/:id/archive` and `/unarchive`, the response shapes; the list takes `archived`", () => {
    expect(svc).toContain("api.post<ArchiveParentResult>(`/parents/${id}/archive`, {})");
    expect(svc).toContain("api.post<UnarchiveParentResult>(`/parents/${id}/unarchive`, {})");
    expect(svc).toContain("archived?: 1;");
    expect(codeOf("src/types/app/people/index.ts")).toMatch(/archivedStudents: number;\s*clearedLineAccounts: number;/);
    expect(codeOf("src/types/app/people/index.ts")).toMatch(/restoredStudents: number;/);
    expect(hooks).toContain("queryKey: [...PARENTS_KEY, \"archived\", query], queryFn: () => listParents(query), enabled,");
    expect(hooks).toMatch(/useArchiveParent[\s\S]*mutationFn: \(id: string\) => archiveParent\(id\), onSuccess: \(\) => qc\.invalidateQueries\(\{ queryKey: PARENTS_KEY \}\)/);
  });
  it("ONE toggle drives both lists: the archived families are fetched only while `Show archived` is on, with the same search; no second control", () => {
    expect(page).toContain("useArchivedParents(archivedParentsQuery(debounced.trim() || undefined), showArchived)");
    expect(page).toContain("{showArchived && archivedParents.length > 0 && (");
    expect(page).toContain("{showArchived && (p.archivedStudents?.length ?? 0) > 0 && ("); // the children's block, untouched
    expect(page.match(/<Switch[^>]*label=\{t\("people\.showArchived"\)\}/g)?.length).toBe(1);
    expect(page).not.toContain("archivedAt"); // the split is the server's two lists; nothing here decides
  });
  it("the doors: archive on the working card, restore on the archived card — both by the 56th key, hidden not disabled; the confirm words", () => {
    expect(page.match(/can\("action:people\.parent-archive"\)/g)?.length).toBe(2);
    expect(page).toContain("setParentArchiveTarget({ parent: p, restore: false });");
    expect(page).toContain("setParentArchiveTarget({ parent: p, restore: true });");
    expect(page).not.toMatch(/disabled=\{[^}]*parent-archive/);
    expect(page).toContain("const r = await archiveParent.mutateAsync(parent.id);");
    expect(page).toContain('notify({ title: t("people.parentArchivedOk", { name: label, n: r.archivedStudents, line: r.clearedLineAccounts }), color: "success" });');
    expect(page).toContain("const r = await unarchiveParent.mutateAsync(parent.id);");
    expect(page).toContain('notify({ title: t("people.parentRestoredOk", { name: label, n: r.restoredStudents }), color: "success" });');
    expect(page).toContain("setParentArchiveError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(page).toContain('<Text size="sm">{t(parentArchiveTarget.restore ? "people.restoreParentBody" : "people.archiveParentBody")}</Text>');
    // the words: archive says the children go and the LINE link is cleared; restore says the LINE link is NOT restored
    expect(dictionaries.en.people.archiveParentBody).toMatch(/every student is archived with the parent/);
    expect(dictionaries.en.people.archiveParentBody).toMatch(/LINE link is cleared/);
    expect(dictionaries.en.people.restoreParentBody).toMatch(/LINE link is NOT restored/);
    expect(dictionaries.th.people.archiveParentBody).toMatch(/นักเรียนทุกคนถูกเก็บไปพร้อมผู้ปกครอง/);
    expect(dictionaries.th.people.restoreParentBody).toMatch(/การเชื่อมไลน์จะไม่กลับมา/);
  });
  it("copy: people +11, both languages", () => {
    for (const k of ["archiveParent", "archiveParentTitle", "archiveParentBody", "archiveParentConfirm", "parentArchivedOk", "restoreParentTitle", "restoreParentBody", "restoreParentConfirm", "parentRestoredOk", "archivedParents", "archivedWithStudents"]) {
      expect((dictionaries.en.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.people as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
