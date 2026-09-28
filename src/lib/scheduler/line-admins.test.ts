import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { adminRowLabel, adminRows, afterRemovalKey, notKnownLines } from "./line-admins";
import { dictionaries } from "@/lib/i18n/dictionaries";

/** Comment-stripped source, so a pin can never be satisfied by a sentence in a comment (an earlier task's scar). */
const codeOf = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const svc = codeOf("src/services/users.service.ts");
const hook = codeOf("src/hooks/scheduler/useUsers.ts");
const panel = codeOf("src/components/partials/LinkRequests/LineAdminsPanel.tsx");
const page = codeOf("src/components/partials/LinkRequests/LinkRequestsContent.tsx");

const dict = (lang: "en" | "th") => (dictionaries[lang] as unknown as Record<string, Record<string, string>>).lineAdmins;

describe("TASK-539 — the rules for the LINE-admin list", () => {
  it("a row we can name is named; a row we cannot is the honest key, never a blank", () => {
    expect(adminRowLabel({ alsoTeacher: "บีม", alsoParent: null })).toEqual({ name: "บีม" });
    expect(adminRowLabel({ alsoTeacher: null, alsoParent: "คุณขวัญ" })).toEqual({ name: "คุณขวัญ" });
    // 🔑 the case this page exists for: nothing known ⇒ the copy key, so nothing can read as an invented person
    expect(adminRowLabel({ alsoTeacher: null, alsoParent: null })).toEqual({ key: "lineAdmins.unknownAccount" });
    // whitespace is not a name either — a " " would paint a row that reads as a blank name
    expect(adminRowLabel({ alsoTeacher: "  ", alsoParent: null })).toEqual({ key: "lineAdmins.unknownAccount" });
    // a coach we know wins over a parent we know: it is the more specific fact about the same account
    expect(adminRowLabel({ alsoTeacher: "บีม", alsoParent: "คุณขวัญ" })).toEqual({ name: "บีม" });
  });

  it("the after-removal sentence follows the server's menu, and an unknown/absent menu promises the LEAST", () => {
    expect(afterRemovalKey("teacher-menu")).toBe("lineAdmins.afterTeacher");
    expect(afterRemovalKey("parent-menu")).toBe("lineAdmins.afterParent");
    expect(afterRemovalKey("visitor-menu")).toBe("lineAdmins.afterVisitor");
    // 🔑 over-promising kept access is the wrong way to be wrong on a dialog that takes rights away
    expect(afterRemovalKey(null)).toBe("lineAdmins.afterVisitor");
    expect(afterRemovalKey(undefined)).toBe("lineAdmins.afterVisitor");
  });

  it("rows and the cannot-know lines are taken as sent; junk is dropped, nothing is invented", () => {
    expect(adminRows(null)).toEqual([]);
    expect(adminRows({ admins: null })).toEqual([]);
    expect(adminRows({ admins: [{ ref: "", idTail: "…1" }, { ref: "ab", idTail: "…2" }] })).toEqual([{ ref: "ab", idTail: "…2" }]);
    expect(notKnownLines({ notKnown: ["a", "  ", ""] })).toEqual(["a"]);
    expect(notKnownLines(undefined)).toEqual([]);
  });
});

describe("TASK-539 — the wire", () => {
  it("the two TASK-538 routes, by their exact paths", () => {
    expect(svc).toContain('api.get<LineAdminsResponse>("/users/line-admins")');
    expect(svc).toContain("api.delete<RemoveLineAdminResult>(`/users/line-admins/${ref}`)");
  });

  it("🔑 the gate is the SUPER ADMIN, not an action key — TASK-538 added none", () => {
    expect(panel).toContain("session?.user?.isSuperAdmin === true");
    expect(panel).toContain("if (!isSuperAdmin) return null;");
    // by ABSENCE: no invented `action:` key anywhere in this feature, and no `useCan` pretending there is one
    expect(panel).not.toContain("action:");
    expect(panel).not.toContain("useCan");
    expect(svc).not.toContain("action:");
    expect(readFileSync("src/lib/rbac/actions.ts", "utf8")).not.toContain("line-admin");
  });

  it("🚫 no optimistic removal: the list is refetched on the server's answer, not edited on click", () => {
    expect(hook).toContain("onSuccess: () => qc.invalidateQueries({ queryKey: LINE_ADMINS_KEY })");
    expect(hook).not.toContain("onMutate");
    expect(hook).not.toContain("setQueryData");
    expect(panel).not.toContain("setQueryData");
  });

  it("the list is not even fetched for a non-super-admin (the query is gated, not just the paint)", () => {
    expect(panel).toContain("useLineAdmins(isSuperAdmin)");
  });

  it("the panel is mounted on the LINE-links page — a control nobody can reach is not a control", () => {
    expect(page).toContain("<LineAdminsPanel />");
    expect(page).toContain('import LineAdminsPanel from "./LineAdminsPanel"');
  });

  it("a refusal keeps the dialog and shows the server's own sentence", () => {
    expect(panel).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message)");
    // the close sits on the success path only — never in a `finally`, which would close on a refusal too
    expect(panel).toContain("const res = await remove.mutateAsync({ ref: row.ref });");
    expect(panel).not.toContain("finally");
  });

  it("the half-done case is said, not swallowed", () => {
    expect(panel).toContain("res.menuSettled");
    expect(panel).toContain('t("lineAdmins.menuUnsettled")');
  });
});

describe("TASK-539 — the copy (DRAFT, pinned by form)", () => {
  const KEYS = [
    "title", "hint", "unknownAccount", "tail", "alsoTeacher", "alsoParent", "removeBtn",
    "removeTitle", "removeBody", "afterTeacher", "afterParent", "afterVisitor", "confirm",
    "removed", "menuUnsettled", "notKnownTitle", "empty",
  ];
  for (const lang of ["en", "th"] as const) {
    it(`${lang}: every key exists, nothing extra, nothing empty`, () => {
      const d = dict(lang);
      expect(Object.keys(d).sort()).toEqual([...KEYS].sort());
      for (const k of KEYS) expect(d[k].trim().length).toBeGreaterThan(0);
    });
    it(`${lang}: the placeholders the code passes are the ones the copy takes`, () => {
      const d = dict(lang);
      expect(d.tail).toContain("{tail}");
      expect(d.alsoTeacher).toContain("{name}");
      expect(d.alsoParent).toContain("{name}");
    });
    it(`${lang}: the dialog ASKS, and each consequence is named and distinct`, () => {
      const d = dict(lang);
      expect(d.removeTitle.trim().endsWith("?")).toBe(true);
      for (const k of ["afterTeacher", "afterParent", "afterVisitor"] as const) {
        expect(d[k].trim().length).toBeGreaterThan(8);
      }
      // one sentence reused for all three would say nothing at all
      expect(new Set([d.afterTeacher, d.afterParent, d.afterVisitor]).size).toBe(3);
    });
  }

  it("🚫 the act is never called a DELETE, in either language", () => {
    const en = dict("en");
    const th = dict("th");
    expect(en.removeBtn.toLowerCase()).not.toContain("delete");
    expect(en.confirm.toLowerCase()).not.toContain("delete");
    expect(en.removeTitle.toLowerCase()).not.toContain("delete");
    // the one place EN says it is to DENY it
    expect(en.removeBody.toLowerCase()).toContain("not deleted");
    // 🔴 Thai: `ลบ` may appear only inside the denial `ไม่ใช่การลบ`
    for (const v of Object.values(th)) {
      if (v.includes("ลบ")) expect(v).toContain("ไม่ใช่การลบ");
    }
    expect(th.removeBody).toContain("ไม่ใช่การลบ");
  });

  it("🔑 the honest label stays honest in both languages — it never reads as a name", () => {
    expect(dict("en").unknownAccount).toBe("Unknown account");
    expect(dict("th").unknownAccount).toContain("ไม่ทราบ");
    expect(dict("en").unknownAccount).not.toContain("{");
    expect(dict("th").unknownAccount).not.toContain("{");
  });
});
