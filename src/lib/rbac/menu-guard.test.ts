import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { HIDDEN_NAV_ITEMS, LANDING_HREF, NAV_ITEMS, mayOpen, navItemForPath, navItemsFor } from "@/components/layout/AdminLayout/AdminLayout.config";
import { MENU_KEYS, hasMenu } from "./menus";

/**
 * REQ-092 Stage 2 / TASK-382 — the nav filters on the user's menus, ONE route guard on the admin layout, the empty
 * shell, the per-user menu checklist (the bridge until Stage 4), change-my-password, the disabled reason on login.
 *
 * 🔑 The server is the guard (`403 FORBIDDEN "ไม่มีสิทธิ์เข้าถึงเมนูนี้"` without the grant); everything here is the honest
 * UI: `MENU_KEYS` mirrors the BE's list by name (pinned against the nav, in order), `/auth/me` is the truth the session's
 * login body only seeds, and `mayOpen` is the ONE rule the sidebar, the guard and the landing all ask.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const stripTrailing = (src: string) => src.replace(/\/\/[^\n]*$/gm, "");
const guard = codeOf("src/components/layout/AdminLayout/MenuGuard.tsx");
const useMe = codeOf("src/hooks/scheduler/useMe.ts");
const client = codeOf("src/lib/api/client.ts");
const header = codeOf("src/components/layout/AdminLayout/Header/Header.tsx");
const page = codeOf("src/components/partials/Users/UsersContent.tsx");
const usersSvc = codeOf("src/services/users.service.ts");
const meSvc = codeOf("src/services/me.service.ts");
const login = codeOf("src/app/login/page.tsx");

const ALL = [...MENU_KEYS];
const TWO = ["menu:calendar", "menu:reports"];

describe("§1 — the registry and the nav", () => {
  it("MENU_KEYS: thirteen `menu:<navKey>` keys, in the nav's order (visible entries, then the hidden pages) — the BE's mirror", () => {
    expect(MENU_KEYS.length).toBe(13); // 12 + TASK-401's `menu:camp`
    expect(ALL).toEqual([
      "menu:calendar",
      "menu:teachers",
      "menu:people",
      "menu:link-requests",
      "menu:bookings",
      "menu:badges",
      "menu:camp",
      "menu:som",
      "menu:attention",
      "menu:reports",
      "menu:settings",
      "menu:dashboard",
      "menu:overview",
    ]);
    // every nav entry but `users` carries exactly its key, and the nav-derived list IS the registry (order included)
    const derived = [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS].flatMap((i) => (i.menuKey ? [i.menuKey] : []));
    expect(derived).toEqual(ALL);
    expect(NAV_ITEMS.find((i) => i.key === "users")?.menuKey).toBeUndefined();
    expect(NAV_ITEMS.find((i) => i.key === "roles")).toMatchObject({ href: "/scheduler/roles", superAdminOnly: true }); // Stage 4
    for (const i of [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS]) if (i.key !== "users" && i.key !== "roles") expect(i.menuKey).toBe(`menu:${i.href.split("/").pop()}`);
    expect(HIDDEN_NAV_ITEMS.map((i) => i.key)).toEqual(["dashboard", "overview"]); // overview: hidden, no longer a comment
  });

  it("navItemsFor / mayOpen, value-tested: a super admin sees all; a two-menu user exactly two; zero ⇒ nothing", () => {
    expect(navItemsFor({ isSuperAdmin: true, menus: [] }).map((i) => i.key)).toEqual(NAV_ITEMS.map((i) => i.key));
    expect(navItemsFor({ isSuperAdmin: false, menus: TWO }).map((i) => i.key)).toEqual(["calendar", "reports"]);
    expect(navItemsFor({ isSuperAdmin: false, menus: [] })).toEqual([]);
    expect(navItemsFor(undefined)).toEqual([]); // grants not known yet ⇒ nothing listed
    // the same rule answers for a page, visible or hidden
    const dashboard = HIDDEN_NAV_ITEMS[0];
    expect(mayOpen({ isSuperAdmin: false, menus: TWO }, dashboard)).toBe(false);
    expect(mayOpen({ isSuperAdmin: false, menus: ["menu:dashboard"] }, dashboard)).toBe(true);
    expect(mayOpen({ isSuperAdmin: true, menus: [] }, dashboard)).toBe(true);
    expect(hasMenu({ isSuperAdmin: false, menus: TWO }, "menu:teachers")).toBe(false);
    expect(hasMenu(null, "menu:calendar")).toBe(false);
    // the path → entry lookup the guard and the header share
    expect(navItemForPath("/scheduler/link-requests?x=1")?.menuKey).toBe("menu:link-requests");
    expect(navItemForPath("/scheduler/overview")?.menuKey).toBe("menu:overview");
    expect(navItemForPath("/scheduler/nowhere")).toBeUndefined();
    expect(LANDING_HREF).toBe("/scheduler/calendar");
  });

  it("the session seeds, `/auth/me` is the truth: login body → token → session; useMe refetches at once and on a 403", () => {
    expect(codeOf("src/auth.ts")).toContain("menus: Array.isArray(data.user.menus) ? data.user.menus : [],");
    const cfg = codeOf("src/auth.config.ts");
    expect(cfg).toContain("token.menus = user.menus;");
    expect(cfg).toContain("session.user.menus = token.menus;");
    expect(meSvc).toContain('api.get<MeResponse>("/me")');
    expect(useMe).toContain("queryFn: getMe,");
    expect(useMe).toContain('enabled: status === "authenticated",');
    expect(useMe).toContain("initialData: seed,");
    expect(useMe).toContain("initialDataUpdatedAt: 0,"); // the seed is stale on arrival ⇒ the real read fires now
    expect(useMe).toContain("refetchOnWindowFocus: true,");
    expect(useMe).toContain("window.addEventListener(FORBIDDEN_EVENT, onForbidden);");
    expect(client).toContain('if (error.response?.status === 403 && typeof window !== "undefined") window.dispatchEvent(new Event(FORBIDDEN_EVENT));');
    expect(useMe).toContain('export const FORBIDDEN_EVENT = "ss:forbidden";');
    expect(client).toContain('const FORBIDDEN_EVENT = "ss:forbidden";');
  });
});

describe("§2 — the route guard, in ONE place", () => {
  it("the admin layout wraps every page in MenuGuard; a page without its menu never renders (the sentence + a door instead)", () => {
    expect(codeOf("src/components/layout/AdminLayout/AdminLayout.tsx")).toContain("<MenuGuard>{children}</MenuGuard>");
    expect(guard).toContain("const item = navItemForPath(pathname);");
    expect(guard).toContain("const granted = !item || mayOpen(access, item);");
    expect(guard).toContain('t("rbac.noMenu")');
    expect(guard).toContain('t("rbac.goTo", { menu: t(first.labelKey) })');
    // order: loading → shell → not granted → the page; the children appear exactly once, last
    const iLoad = guard.indexOf("if (isLoading || redirectTo)");
    const iShell = guard.indexOf("if (shell)");
    const iNo = guard.indexOf("if (!granted)");
    const iChildren = guard.indexOf("return <>{children}</>;");
    expect(iLoad).toBeGreaterThan(0);
    expect(iLoad).toBeLessThan(iShell);
    expect(iShell).toBeLessThan(iNo);
    expect(iNo).toBeLessThan(iChildren);
    expect((guard.match(/\{children\}/g) ?? []).length).toBe(1);
  });

  it("the empty shell for zero menus (not a super admin); the landing sends a user without its menu to their first one", () => {
    expect(guard).toContain("const shell = !!access && !access.isSuperAdmin && access.menus.length === 0;");
    expect(guard).toContain('t("rbac.shellTitle")');
    expect(guard).toContain('t("rbac.shellBody")');
    expect(guard).toContain("const redirectTo = !isLoading && !granted && !shell && pathname === LANDING_HREF && first ? first.href : null;");
    expect(guard).toContain("if (redirectTo) router.replace(redirectTo);");
    // the sidebar reads the same access
    expect(codeOf("src/components/layout/AdminLayout/Sidebar/Sidebar.tsx")).toContain("const { access } = useMe();");
  });
});

describe("§3 — the Users page checklist (the bridge until Stage 4)", () => {
  it("PUT /users/:id/menus { keys } — only registry keys, in the registry's order; a super admin row has no checklist", () => {
    expect(usersSvc).toContain("api.put<{ user: UserDTO }>(`/users/${id}/menus`, { keys })");
    expect(page).toContain("await save.mutateAsync({ id: user.id, keys: MENU_KEYS.filter((k) => keys.includes(k)) });");
    expect(page).toContain('t("users.colMenus")');
    const cell = page.slice(page.indexOf('t("users.menusAll")') - 200, page.indexOf('t("users.menusAll")') + 400);
    expect(cell).toContain("{user.isSuperAdmin ? (");
    expect(cell).toContain('t("users.menusCount", { n: String(user.menus?.length ?? 0) })');
    // twelve rows labelled by the nav's own words, in the nav's order; select all / none — Stage 4 moved the rows
    // into the SHARED `GrantChecklists.tsx` (the Roles page renders the same); the dialog mounts it and saves OWN rows
    const shared = codeOf("src/components/partials/Users/GrantChecklists.tsx");
    expect(shared).toContain("export const MENU_ROWS: { key: MenuKey; labelKey: string }[] = [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS]");
    expect(shared).toContain(".map((i) => ({ key: i.menuKey, labelKey: i.labelKey }));");
    expect(shared).toContain("label={t(row.labelKey)}");
    expect(shared).toContain("checked={isTicked(value, locked, row.key)}");
    expect(shared).toContain("onClick={() => onChange(withKeys(value, free, true))}");
    expect(shared).toContain("onClick={() => onChange([])}");
    expect(page).toContain("<MenusChecklist value={keys} onChange={setKeys} locked={locked}");
    expect(codeOf("src/hooks/scheduler/useUsers.ts")).toContain("mutationFn: ({ id, keys }: { id: string; keys: string[] }) => setUserMenus(id, keys),");
  });
});

describe("§4 — change my password, and the disabled reason on login", () => {
  it("the header's user menu: name · username · change password · sign out; the dialog posts { currentPassword, newPassword }", () => {
    expect(header).toContain('t("header.changePassword")');
    expect(header).toContain('t("header.logout")');
    expect(header).toContain('onClick={() => signOut({ callbackUrl: "/login" })}');
    expect(header).toContain("<ChangePasswordModal opened={pwOpen} onClose={() => setPwOpen(false)} />");
    expect(meSvc).toContain('api.post<{ ok: true }>("/me/password", { currentPassword, newPassword })');
    const modal = codeOf("src/components/layout/AdminLayout/Header/ChangePasswordModal.tsx");
    expect(modal).toContain("await change.mutateAsync({ currentPassword: current, newPassword: password });");
    expect(modal).toContain("const mismatch = confirm.length > 0 && confirm !== password;");
    expect(modal).toContain("disabled={!current || !password || mismatch || confirm.length === 0}");
    // no client rule beyond the two boxes matching
    expect(stripTrailing(modal)).not.toMatch(/length\s*[<>]=?\s*8|PASSWORD_TOO_SHORT/);
    // TASK-384: a wrong current password is a 400 — the api client has NO path exemption; every 401 signs out
    expect(client).toContain('if (error.response?.status === 401 && typeof window !== "undefined" && !useMockData) {');
    expect(stripTrailing(client)).not.toMatch(/SELF_PASSWORD_PATH|endsWith\(|error\.config\?\.url/);
    expect(stripTrailing(modal)).not.toMatch(/401|SELF_PASSWORD/);
    // the old paths are gone everywhere in src (the BE answers 404 there)
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const p = join(d, e);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
      });
    for (const f of walk("src")) expect({ f, hit: readFileSync(f, "utf8").includes("/auth/me") }).toEqual({ f, hit: false });
  });

  it("`reason=disabled` rides the sign-out ONLY for the guard's disabled sentence; the login page shows one line for it", () => {
    expect(client).toContain('export const DISABLED_SENTENCE = "บัญชีนี้ถูกปิดใช้งาน";');
    expect(client).toContain('const reason = body?.error?.message === DISABLED_SENTENCE ? "&reason=disabled" : "";');
    expect(client).toContain("void signOut({ callbackUrl: `/login?next=${next}${reason}` });");
    expect(login).toContain('setDisabledReason(new URLSearchParams(window.location.search).get("reason") === "disabled");');
    expect(login).toContain('t("login.disabledReason")');
    expect((login.match(/reason/g) ?? []).length).toBeGreaterThan(0);
    expect(login).not.toMatch(/reason"\)\s*===\s*"(?!disabled)/); // no second reason exists
    expect(dictionaries.en.login.disabledReason).toBe("This account has been disabled — contact your admin.");
  });
});

describe("copy", () => {
  it("keys counted in both languages: rbac 4 · header +6 · login +1 · users +8 (46); the twelve rows' nav labels resolve", () => {
    const both = (block: string, n: number) => {
      const en = (dictionaries.en as Record<string, Record<string, string>>)[block];
      const th = (dictionaries.th as Record<string, Record<string, string>>)[block];
      expect(Object.keys(en).length).toBe(n);
      for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
    };
    both("rbac", 4);
    both("header", 11);
    both("login", 7);
    both("users", 58); // 46 + the Stage-3 `Actions` checklist's 8 + Stage 4's role column 4
    for (const i of [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS]) {
      const k = i.labelKey.replace("nav.", "");
      expect(dictionaries.en.nav[k as keyof typeof dictionaries.en.nav]?.length).toBeGreaterThan(0);
      expect(dictionaries.th.nav[k as keyof typeof dictionaries.th.nav]?.length).toBeGreaterThan(0);
    }
  });
});
