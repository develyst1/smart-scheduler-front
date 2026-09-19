import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { NAV_ITEMS, navItemsFor } from "@/components/layout/AdminLayout/AdminLayout.config";
import { isTicked, withKeys } from "@/components/partials/Users/GrantChecklists";
import MatrixTable from "@/components/partials/Roles/MatrixTable";
import { MATRIX_GLYPH, matrixCell } from "./matrix";
import { MENU_KEYS } from "./menus";
import type { PermissionRegistry, UserDTO } from "@/types/api/contract";

/**
 * REQ-092 Stage 4 / TASK-388 — the Roles page (builder on the SHARED checklists), role assignment on the Users page,
 * inherited-vs-own ticks, the header's role name, the read-only matrix.
 *
 * 🔑 A role is LIVE and a user's own rows are additive: the dialogs show the role's keys ticked + LOCKED and edit only
 * the own rows; the save writes own rows only (`PUT …/menus` / `…/actions` unchanged). The server guards everything
 * (`requireSuperAdmin`); the nav entry and the page hide themselves on the flag as the honest UI. The matrix is a
 * rendered assertion from `grants`, no new route.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const rolesSvc = codeOf("src/services/roles.service.ts");
const usersSvc = codeOf("src/services/users.service.ts");
const rolesPage = codeOf("src/components/partials/Roles/RolesContent.tsx");
const usersPage = codeOf("src/components/partials/Users/UsersContent.tsx");
const shared = codeOf("src/components/partials/Users/GrantChecklists.tsx");

const user = (over: Partial<UserDTO>): UserDTO => ({
  id: "u1",
  username: "u1",
  displayName: "U One",
  isSuperAdmin: false,
  disabledAt: null,
  createdAt: "2026-09-18T00:00:00.000Z",
  menus: [],
  actions: [],
  roleId: null,
  roleName: null,
  grants: { fromRole: [], own: [] },
  ...over,
});
const REGISTRY: PermissionRegistry = {
  menus: [...MENU_KEYS],
  actions: [
    { key: "action:calendar.book", area: "calendar", labelTh: "จอง", labelEn: "Book" },
    { key: "action:calendar.status", area: "calendar", labelTh: "สถานะ", labelEn: "Status" },
    { key: "action:sales.discount", area: "sales", labelTh: "ส่วนลด", labelEn: "Discount" },
  ],
};

describe("§1 — the Roles page", () => {
  it("nav + page: `roles` is superAdminOnly beside `users`; the page refuses a non-super-admin and never fetches for them", () => {
    expect(NAV_ITEMS.find((i) => i.key === "roles")).toMatchObject({ href: "/scheduler/roles", labelKey: "nav.roles", superAdminOnly: true });
    expect(navItemsFor({ isSuperAdmin: false, menus: [...MENU_KEYS] }).map((i) => i.key)).not.toContain("roles");
    expect(navItemsFor({ isSuperAdmin: true, menus: [] }).map((i) => i.key)).toContain("roles");
    expect(rolesPage).toContain("const isSuperAdmin = session?.user?.isSuperAdmin === true;");
    expect(rolesPage).toContain("useRoles(isSuperAdmin)");
    expect(rolesPage).toContain('t("users.noAccess")');
    expect(codeOf("src/app/(admin)/scheduler/roles/page.tsx")).toContain("<RolesContent />");
  });

  it("CRUD request shapes: GET → roles · POST { name, description?, keys } · PATCH by presence (keys REPLACE) · DELETE", () => {
    expect(rolesSvc).toContain('api.get<{ roles: RoleDTO[] }>("/roles")');
    expect(rolesSvc).toContain('api.post<{ role: RoleDTO }>("/roles", {');
    expect(rolesSvc).toContain("name: input.name.trim(),");
    expect(rolesSvc).toContain("...(input.description?.trim() ? { description: input.description.trim() } : {}),");
    expect(rolesSvc).toContain("keys: input.keys,");
    expect(rolesSvc).toContain("api.patch<{ role: RoleDTO }>(`/roles/${id}`, {");
    expect(rolesSvc).toContain("...(input.name !== undefined ? { name: input.name.trim() } : {}),");
    expect(rolesSvc).toContain("...(input.keys !== undefined ? { keys: input.keys } : {}),");
    expect(rolesSvc).toContain("api.delete<{ deleted: true }>(`/roles/${id}`)");
    // the builder: the SAME two checklists (no locked rows on a role), keys in registry order, only changed fields on edit
    expect(rolesPage).toContain("<MenusChecklist value={menus} onChange={setMenus} />");
    expect(rolesPage).toContain("<ActionsChecklist registry={registry} value={actions} onChange={setActions} />");
    expect(rolesPage).toContain("const keys = [...MENU_KEYS.filter((k) => menus.includes(k)), ...registryActions.filter((k) => actions.includes(k))];");
    expect(rolesPage).toContain("...(name.trim() !== role.name ? { name } : {}),");
    expect(rolesPage).toContain("...(sameKeys ? {} : { keys }),");
    expect(rolesPage).toContain("await create.mutateAsync({ name, description, keys });");
    // no third list of labels anywhere on the page
    expect(rolesPage).not.toMatch(/labelEn:|labelTh:|ACTION_KEYS_SNAPSHOT|"action:[a-z]/);
    // 🚫 no templates, no default role, no client-side key rule
    expect(rolesPage).not.toMatch(/template|DEFAULT_ROLE|length\s*[<>]=?\s*60/i);
  });

  it("delete is two taps — the row's red button opens the dialog, its own red confirm is the second; ROLE_IN_USE lands in it", () => {
    expect(rolesPage).toContain("onClick={() => setDeleteTarget(r)}");
    const dialog = rolesPage.slice(rolesPage.indexOf("function DeleteRoleDialog"), rolesPage.indexOf("function MatrixTab"));
    expect(dialog).toContain("await del.mutateAsync(role.id);");
    expect(dialog).toContain("setError(errMsg(e));");
    expect(dialog).toContain('<Button color="red" leftSection={<Trash2 size={15} />} loading={del.isPending} onClick={submit}>');
    expect(dialog).toContain("{error && (");
    expect(rolesPage).not.toContain("ROLE_IN_USE\"") ; // the count sentence is the server's, never composed here
  });
});

describe("§2 — the Users page: assignment and the two-tone checklists", () => {
  it("PUT /users/:id/role { roleId } — `null` on *none*; the row's Select lists the roles + none; a super admin row has no Select", () => {
    expect(usersSvc).toContain("api.put<{ user: UserDTO }>(`/users/${id}/role`, { roleId })");
    expect(usersPage).toContain("onChange={(v) => void assignRole(v ? v : null)}");
    expect(usersPage).toContain('data={[{ value: "", label: t("users.roleNone") }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}');
    expect(usersPage).toContain("await setRole.mutateAsync({ id: user.id, roleId });");
    expect(codeOf("src/hooks/scheduler/useUsers.ts")).toContain("mutationFn: ({ id, roleId }: { id: string; roleId: string | null }) => setUserRole(id, roleId),");
    // the two dialogs: the role's keys are LOCKED, the own rows editable, the save writes OWN rows only
    expect(usersPage).toContain('setKeys(ownOf(user, "menu:"));');
    expect(usersPage).toContain('const locked = fromRoleOf(user, "menu:");');
    expect(usersPage).toContain('setKeys(ownOf(user, "action:"));');
    expect(usersPage).toContain('const locked = fromRoleOf(user, "action:");');
    expect(usersPage).toContain('lockedHint={user?.roleName ? t("users.fromRole", { role: user.roleName }) : undefined}');
    expect(usersPage).toContain("await save.mutateAsync({ id: user.id, keys: MENU_KEYS.filter((k) => keys.includes(k)) });");
    expect(usersPage).toContain("await save.mutateAsync({ id: user.id, keys: allKeys.filter((k) => keys.includes(k)) });");
    expect(shared).toContain("disabled={locked}");
  });

  it("locked vs own, value-tested: a locked key is ticked and never moves; select-all/none touch only the free keys", () => {
    const own = ["menu:calendar"];
    const locked = ["menu:reports", "menu:calendar"]; // calendar in both: own wins on save, it is still ticked
    expect(isTicked(own, locked, "menu:calendar")).toBe(true);
    expect(isTicked(own, locked, "menu:reports")).toBe(true);
    expect(isTicked(own, locked, "menu:people")).toBe(false);
    // un-ticking a locked key changes nothing in `own` (the checkbox is disabled; even a programmatic call is a no-op)
    expect(withKeys(own, ["menu:reports"], false)).toEqual(own);
    // ticking a free key adds it; un-ticking removes it; dedupe holds
    expect(withKeys(own, ["menu:people"], true)).toEqual(["menu:calendar", "menu:people"]);
    expect(withKeys(["menu:calendar", "menu:people"], ["menu:people"], false)).toEqual(["menu:calendar"]);
    expect(withKeys(own, ["menu:calendar"], true)).toEqual(own);
    // select-all over the FREE keys only (the checklist filters `locked` out before calling withKeys)
    const free = MENU_KEYS.filter((k) => !locked.includes(k));
    const all = withKeys(own, free, true);
    expect(all).not.toContain("menu:reports");
    expect(all.length).toBe(MENU_KEYS.length - 1);
    // what the save sends for that state: own rows only — the role's `menu:reports` is never written as own
    expect(MENU_KEYS.filter((k) => all.includes(k))).not.toContain("menu:reports");
    expect(shared).toContain("const free = MENU_KEYS.filter((k) => !locked.includes(k));");
  });

  it("the header shows the role name under the display name, from /me", () => {
    const header = codeOf("src/components/layout/AdminLayout/Header/Header.tsx");
    expect(header).toContain("const roleName = useMe().me?.roleName ?? null;");
    expect(header).toContain('{roleName && <span className="text-xs text-muted-400">{roleName}</span>}');
    expect(codeOf("src/types/api/contract.ts")).toContain("roleName: string | null; teacherId: string | null };"); // TASK-407 + teacherId
  });
});

describe("§3 — the matrix", () => {
  it("matrixCell, value-tested: own beats role; role shows; a super admin is everything; blank otherwise", () => {
    const both = user({ grants: { fromRole: ["menu:calendar", "action:calendar.book"], own: ["menu:calendar", "action:calendar.status"] } });
    expect(matrixCell(both, "menu:calendar")).toBe("own");
    expect(matrixCell(both, "action:calendar.book")).toBe("role");
    expect(matrixCell(both, "action:calendar.status")).toBe("own");
    expect(matrixCell(both, "menu:people")).toBeNull();
    expect(matrixCell(user({ isSuperAdmin: true }), "menu:people")).toBe("all");
    expect(MATRIX_GLYPH).toEqual({ own: "●", role: "▲", all: "●" });
  });

  it("renders from `grants` (rendered assertion): two users × the menus + the registry's actions, one glyph per source, sticky lead column", () => {
    const users = [
      user({ id: "a", username: "alice", roleId: "r1", roleName: "Front desk", grants: { fromRole: ["menu:calendar", "action:calendar.book"], own: ["action:sales.discount"] } }),
      user({ id: "b", username: "bob", isSuperAdmin: true }),
    ];
    const html = renderToString(h(MantineProvider, null, h(I18nProvider, null, h(MatrixTable, { users, registry: REGISTRY }))));
    // both rows, the role's name beside the username, the super admin labelled
    expect(html).toContain("alice");
    expect(html).toContain("Front desk");
    expect(html).toContain("bob");
    // the lead column is pinned; the column count is 12 menus + 3 actions per row
    expect(html).toContain('data-pin="lead"');
    const rowA = html.slice(html.indexOf("alice"), html.indexOf("bob"));
    expect((rowA.match(/data-cell="role"/g) ?? []).length).toBe(2); // menu:calendar + action:calendar.book
    expect((rowA.match(/data-cell="own"/g) ?? []).length).toBe(1); // action:sales.discount
    expect((rowA.match(/data-cell="none"/g) ?? []).length).toBe(13 + 3 - 3); // 13 menus since TASK-402
    const rowB = html.slice(html.indexOf("bob"));
    expect((rowB.match(/data-cell="all"/g) ?? []).length).toBe(16);
    expect(rowB).not.toContain('data-cell="none"');
    // glyphs by source
    expect(rowA).toContain("▲");
    expect(rowA).toContain("●");
    // read-only: no checkbox, no button in the table
    expect(html).not.toMatch(/<input|<button/);
    // the tab feeds it GET /users (no new route) and filters by role
    const tab = rolesPage.slice(rolesPage.indexOf("function MatrixTab"));
    expect(tab).toContain("const { data: users = [], isLoading } = useUsers();");
    expect(tab).toContain("users.filter((u) => u.roleId === roleFilter)");
    expect(tab).toContain("<MatrixTable users={rows} registry={registry} />");
    expect(codeOf("src/services/roles.service.ts")).not.toContain("matrix");
  });
});

describe("copy", () => {
  it("keys counted in both languages: roles 26 · nav.roles · users +4 (58)", () => {
    const en = dictionaries.en.roles as Record<string, string>;
    const th = dictionaries.th.roles as Record<string, string>;
    expect(Object.keys(en).length).toBe(26);
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    expect(dictionaries.en.nav.roles).toBe("Roles");
    expect(dictionaries.th.nav.roles).toBe("บทบาท");
    const u = dictionaries.en.users as Record<string, string>;
    expect(Object.keys(u).length).toBe(62); // + TASK-407's teacher link 4
    for (const k of ["colRoleName", "roleNone", "fromRole", "roleSavedOk"]) {
      expect(u[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
