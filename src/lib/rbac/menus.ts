// REQ-092 RBAC Stage 2 (TASK-382, SPEC-079 §2) — the MENU KEY registry, the FE's mirror of the BE's
// `lib/permissions.ts` `MENU_KEYS`. Keys are CODE CONSTANTS, never rows: the BE stores `(user_id, key)` grants against
// its list and both sides pin the list by name (the FE test pins this literal against the nav's `menuKey`s, in order).
//
// 🔴 One key per nav entry, in the nav's order — the visible entries first, then the hidden ones (`dashboard`,
// `overview`). `users` is NOT a key: the Users page is super-admin-only by `requireSuperAdmin`, not by a grant.
// Stage 3 adds the `action:*` keys HERE; Stage 4's roles bundle the same keys.

export const MENU_KEYS = [
  "menu:calendar",
  "menu:teachers",
  "menu:people",
  "menu:link-requests",
  "menu:bookings",
  "menu:badges",
  "menu:camp", // TASK-401/402 — the Camp menu, after Badges (the operational menus, before the reports)
  "menu:som",
  "menu:attention",
  "menu:reports",
  "menu:settings",
  "menu:dashboard",
  "menu:overview",
] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

/**
 * What the app knows about the signed-in user's access: the super-admin flag, the menus and (Stage 3) the actions `/me`
 * handed back. `can()` in `actions.ts` reads the same object.
 */
export interface MenuAccess {
  isSuperAdmin: boolean;
  menus: readonly string[];
  actions: readonly string[];
  /** REQ-097 (TASK-407) — set when the account is linked to a teacher: the server scopes every route; `can()` follows. */
  teacherId?: string | null;
}

/** The ONE answer to "may this user open this menu?": a super admin may open all; anyone else needs the grant. Pure. */
export const hasMenu = (me: MenuAccess | null | undefined, key: MenuKey): boolean =>
  !!me && (me.isSuperAdmin || me.menus.includes(key));
