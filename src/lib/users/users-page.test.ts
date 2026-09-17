import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { NAV_ITEMS, navItemsFor } from "@/components/layout/AdminLayout/AdminLayout.config";
import { MENU_KEYS } from "@/lib/rbac/menus";

/**
 * REQ-092 Stage 1 / TASK-378 — the session carries the REAL user; the Users page for the super admin.
 *
 * 🔑 The server is the guard (`requireSuperAdmin` ⇒ 403); the nav entry and the page hide themselves on
 * `session.user.isSuperAdmin` as the honest UI. Every rule is the server's — the page's one own check is that two
 * password boxes match. Pinned: the session shape end to end, the header, the nav gate (value-tested), every action's
 * request shape, two taps on disable and reset, the sentences, the 401 path, and the discount gate's widening.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const auth = codeOf("src/auth.ts");
const cfg = codeOf("src/auth.config.ts");
const types = readFileSync("src/types/next-auth.d.ts", "utf8");
const svc = codeOf("src/services/users.service.ts");
const page = codeOf("src/components/partials/Users/UsersContent.tsx");

describe("§1 — the session carries the real user; the login screen is untouched", () => {
  it("authorize maps the login response: id = the row id, name = displayName, isSuperAdmin strict; role still read", () => {
    const real = auth.slice(auth.indexOf("axios.post<LoginResponse>"), auth.indexOf("} catch"));
    expect(real).toContain("id: data.user.id,");
    expect(real).toContain("name: data.user.displayName,");
    expect(real).toContain("displayName: data.user.displayName,");
    expect(real).toContain("isSuperAdmin: data.user.isSuperAdmin === true,");
    expect(real).toContain("role: data.user.role,");
    expect(real).not.toContain("id: data.user.username");
    // jwt → session, both directions, and the augmentation
    expect(cfg).toContain("token.userId = user.id;");
    expect(cfg).toContain("token.isSuperAdmin = user.isSuperAdmin === true;");
    expect(cfg).toContain('session.user.id = token.userId ?? "";');
    expect(cfg).toContain("session.user.isSuperAdmin = token.isSuperAdmin === true;");
    expect(cfg).toContain("session.user.displayName = token.displayName;");
    expect(types).toContain("isSuperAdmin?: boolean;");
    expect(types).toContain("displayName?: string;");
    // the login screen: untouched (its form still calls signIn with the same two fields)
    const login = codeOf("src/app/login/page.tsx");
    expect(login).toContain('signIn("credentials"');
    expect(login).not.toMatch(/displayName|isSuperAdmin|users\./);
  });

  it("the header shows the display name, falling back to the username for a pre-Stage-1 token", () => {
    expect(codeOf("src/components/layout/AdminLayout/Header/Header.tsx")).toContain(
      'const name = session?.user?.displayName ?? session?.user?.username ?? t("header.staff");',
    );
  });

  it("a 401 (a disabled user's next call) takes the EXISTING sign-out path — nothing new (Stage 2 adds only `reason`)", () => {
    const client = codeOf("src/lib/api/client.ts");
    expect(client).toContain("error.response?.status === 401");
    expect(client).toContain("void signOut({ callbackUrl: `/login?next=${next}${reason}` });");
    expect(page).not.toMatch(/signOut|401/); // the page adds no second handler
  });

  it("the nav: `users` is superAdminOnly and `navItemsFor` hides it for everyone else (value-tested)", () => {
    const users = NAV_ITEMS.find((i) => i.key === "users");
    expect(users).toMatchObject({ href: "/scheduler/users", labelKey: "nav.users", superAdminOnly: true });
    // Stage 2: `navItemsFor` takes the user's access ({ isSuperAdmin, menus }); with every menu granted, `users` is
    // still the ONE entry the flag alone gates.
    const all = [...MENU_KEYS];
    expect(navItemsFor({ isSuperAdmin: true, menus: [] }).map((i) => i.key)).toContain("users");
    expect(navItemsFor({ isSuperAdmin: false, menus: all }).map((i) => i.key)).not.toContain("users");
    expect(navItemsFor({ isSuperAdmin: false, menus: all }).length).toBe(NAV_ITEMS.length - 1); // exactly one entry is gated by the flag
    const sidebar = codeOf("src/components/layout/AdminLayout/Sidebar/Sidebar.tsx");
    expect(sidebar).toContain("navItemsFor(access)");
    expect(sidebar).not.toContain("NAV_ITEMS.map");
  });
});

describe("§2 — the Users page", () => {
  it("hides itself for a non-super-admin (one calm sentence) and never fetches for them", () => {
    expect(page).toContain("const isSuperAdmin = session?.user?.isSuperAdmin === true;");
    expect(page).toContain("useUsers(isSuperAdmin)");
    expect(page).toContain('t("users.noAccess")');
    expect(codeOf("src/hooks/scheduler/useUsers.ts")).toContain("useQuery({ queryKey: USERS_KEY, queryFn: listUsers, enabled })");
  });

  it("request shapes: create (username trimmed+lowercased, isSuperAdmin only when true) · patch by presence · password · disable/enable", () => {
    expect(svc).toContain('api.post<{ user: UserDTO }>("/users", {');
    expect(svc).toContain("username: input.username.trim().toLowerCase(),");
    expect(svc).toContain("...(input.isSuperAdmin ? { isSuperAdmin: true } : {}),");
    expect(svc).toContain("api.patch<{ user: UserDTO }>(`/users/${id}`, {");
    expect(svc).toContain("...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),");
    expect(svc).toContain("...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),");
    expect(svc).toContain("api.post<{ ok: true }>(`/users/${id}/password`, { password })");
    expect(svc).toContain('api.post<{ user: UserDTO }>(`/users/${id}/${disabled ? "disable" : "enable"}`, {})');
    expect(svc).not.toMatch(/api\.delete|\/users\/\$\{id\}`\s*\)/); // no delete route exists
    // the edit dialog sends only what changed
    expect(page).toContain("...(displayName.trim() !== user.displayName ? { displayName } : {}),");
    expect(page).toContain("...(isSuperAdmin !== user.isSuperAdmin ? { isSuperAdmin } : {}),");
  });

  it("🚫 no client-side rule beyond 'the two boxes match': no username regex, no length check, no last-super-admin logic", () => {
    // trailing `// …` comments stripped too — the string trap: a comment SAYING "LAST_SUPER_ADMIN lands here" is not logic
    const strip = (src: string) => src.replace(/\/\/[^\n]*$/gm, "");
    for (const src of [strip(page), strip(svc)]) {
      expect(src).not.toMatch(/\[a-z0-9\._-\]|length\s*[<>]=?\s*8|LAST_SUPER_ADMIN|isSuperAdmin\)\.length|filter\(.*isSuperAdmin/);
    }
    expect(page).toContain("const mismatch = confirm.length > 0 && confirm !== password;");
    expect(dictionaries.en.users.usernameHint).toContain("3–40");
    expect(dictionaries.en.users.passwordHint).toContain("8");
  });

  it("two taps: DISABLE goes through the confirm dialog (enable does not); RESET is a dialog with its own submit", () => {
    const toggle = page.slice(page.indexOf("const toggle = async"), page.indexOf("return (", page.indexOf("const toggle = async")));
    expect(toggle).toContain("if (!disabled) {");
    expect(toggle).toContain("const ok = await askConfirm({");
    expect(toggle).toContain("if (!ok) return;");
    expect(toggle.indexOf("askConfirm(")).toBeLessThan(toggle.indexOf("setDisabled.mutateAsync"));
    const reset = page.slice(page.indexOf("function ResetPasswordModal"), page.length);
    expect(reset).toContain("await reset.mutateAsync({ id: user.id, password });");
    expect(reset).toContain("disabled={!password || mismatch || confirm.length === 0}");
    expect(reset).toContain('t("users.resetConfirm")');
  });

  it("refusals render the server's sentence — in the dialog for create/edit/reset, as a notice for disable", () => {
    expect(page).toContain("const errMsg = (e: unknown) => (e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect((page.match(/setError\(errMsg\(e\)\)/g) ?? []).length).toBe(4); // create · edit · reset · menus (Stage 2)
    expect(page).toContain('notify({ title: errMsg(e), color: "danger" });'); // disable/enable
  });

  it("copy: the page's keys exist in both languages (38 + 8 Stage 2 = 46 × 2), plus nav.users", () => {
    const keys = Object.keys(dictionaries.en.users);
    expect(keys.length).toBe(46);
    for (const k of keys) expect((dictionaries.th.users as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    expect(dictionaries.en.nav.users).toBe("Users");
    expect(dictionaries.th.nav.users).toBe("ผู้ใช้งาน");
  });
});

describe("the one FE role reader — the discount gate widened to the new claim", () => {
  it("`super_admin` sees the discount section (a super admin is at least an admin); anything else does not", () => {
    const d = codeOf("src/components/common/DiscountSection.tsx");
    expect(d).toContain('if (role !== "admin" && role !== "super_admin") return null;');
    expect(d).not.toContain('role !== "admin") return null');
  });
});
