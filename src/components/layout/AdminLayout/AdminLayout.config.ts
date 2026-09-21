import {
  CalendarDays,
  Users,
  BookOpenCheck,
  BarChart3,
  Tag,
  LayoutDashboard,
  Contact,
  BellRing,
  PieChart,
  Link2,
  Settings2,
  Tent,
  UserCog,
  ShieldCheck,
} from "lucide-react";
import { hasMenu, type MenuAccess, type MenuKey } from "@/lib/rbac/menus";

export interface NavItem {
  key: string;
  /** i18n key resolved with t() at render (see nav.* in dictionaries). */
  labelKey: string;
  href: string;
  icon: typeof CalendarDays;
  /** REQ-092 Stage 1 — shown only to a super admin (`session.user.isSuperAdmin`); the server guards the routes. */
  superAdminOnly?: boolean;
  /**
   * REQ-092 Stage 2 (TASK-382) — the `menu:*` grant that opens this entry (`lib/rbac/menus.ts`, the BE's mirror). An
   * entry shows and its page renders iff super admin OR granted; the server refuses the routes without it (`403`).
   * Every entry has one except `users` (super-admin-only, no grant).
   */
  menuKey?: MenuKey;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "calendar",
    labelKey: "nav.calendar",
    href: "/scheduler/calendar",
    icon: CalendarDays,
    menuKey: "menu:calendar",
  },
  {
    key: "teachers",
    labelKey: "nav.teachers",
    href: "/scheduler/teachers",
    icon: Users,
    menuKey: "menu:teachers",
  },
  {
    key: "people",
    labelKey: "nav.people",
    href: "/scheduler/people",
    icon: Contact,
    menuKey: "menu:people",
  },
  {
    key: "linkRequests",
    labelKey: "nav.linkRequests",
    href: "/scheduler/link-requests",
    icon: Link2,
    menuKey: "menu:link-requests",
  },
  {
    key: "bookings",
    labelKey: "nav.bookings",
    href: "/scheduler/bookings",
    icon: BookOpenCheck,
    menuKey: "menu:bookings",
  },
  {
    key: "badges",
    labelKey: "nav.badges",
    href: "/scheduler/badges",
    icon: Tag,
    menuKey: "menu:badges",
  },
  // REQ-095 Stage 3a (TASK-402) — Balance camp: weeks · roster · sell · redeem · mark. After Badges, before the reports.
  { key: "camp", labelKey: "nav.camp", href: "/scheduler/camp", icon: Tent, menuKey: "menu:camp" },
  { key: "som", labelKey: "nav.som", href: "/scheduler/som", icon: PieChart, menuKey: "menu:som" },
  {
    key: "attention",
    labelKey: "nav.attention",
    href: "/scheduler/attention",
    icon: BellRing,
    menuKey: "menu:attention",
  },
  {
    key: "reports",
    labelKey: "nav.reports",
    href: "/scheduler/reports",
    icon: BarChart3,
    menuKey: "menu:reports",
  },
  {
    key: "settings",
    labelKey: "nav.settings",
    href: "/scheduler/settings",
    icon: Settings2,
    menuKey: "menu:settings",
  },
  // REQ-092 Stage 1 (TASK-378) — the super admin's Users page. Hidden for everyone else; the server is the guard.
  {
    key: "users",
    labelKey: "nav.users",
    href: "/scheduler/users",
    icon: UserCog,
    superAdminOnly: true,
  },
  // REQ-092 Stage 4 (TASK-388) — the Roles page (builder + matrix), beside Users; super admin only, like it.
  {
    key: "roles",
    labelKey: "nav.roles",
    href: "/scheduler/roles",
    icon: ShieldCheck,
    superAdminOnly: true,
  },
];

/**
 * REQ-092 Stage 2 — the ONE rule for "may this user open this entry?": a `superAdminOnly` entry needs the flag; an
 * entry with a `menuKey` needs the grant (a super admin has them all); an entry with neither is open. The nav, the
 * route guard and the landing all ask this. The server is still the guard — this is the honest UI.
 */
export const mayOpen = (me: MenuAccess | null | undefined, item: NavItem): boolean => {
  if (item.superAdminOnly) return me?.isSuperAdmin === true;
  if (item.menuKey) return hasMenu(me, item.menuKey);
  return true;
};

/** The nav a given user sees — `superAdminOnly` entries for a super admin, `menuKey` entries by grant. */
export const navItemsFor = (me: MenuAccess | null | undefined): NavItem[] => NAV_ITEMS.filter((i) => mayOpen(me, i));

/** The app's landing page (`/` and the login both send here); a user without its menu is sent to their first one. */
export const LANDING_HREF = "/scheduler/calendar";

/** The nav entry (visible or hidden) a path belongs to, or `undefined` for a route outside the nav. */
/**
 * REQ-101 (TASK-429) — sub-pages that belong to a menu without being one: the Manage-plan page `/scheduler/other/:key`
 * is the calendar's (`menu:calendar` guards it, `/other-series/*` is under that menu on the server too).
 */
export const ROUTE_ALIASES: Record<string, string> = { "/scheduler/other": "/scheduler/calendar" };

export const navItemForPath = (pathname: string | null | undefined): NavItem | undefined => {
  const alias = Object.entries(ROUTE_ALIASES).find(([prefix]) => pathname?.startsWith(prefix))?.[1];
  return [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS].find((i) => pathname?.startsWith(i.href) || (alias !== undefined && i.href === alias));
};

/**
 * REQ-026 Stage 1 — hidden from the sidebar, **not deleted**. The route, page and components all still exist
 * and resolve if visited directly; only the menu entry is gone.
 *
 * Why this one: its "by teacher" view is already beaten by the Daily report's workload section (sessions *and*
 * attended, vs a bare count), and its only unique content — "by badge" — stands on the parked badge system
 * whose report silently drops untagged rows. Duplicated plus untrustworthy.
 *
 * **To restore: move this entry back into `NAV_ITEMS`.** It lives here rather than in a comment so it stays
 * type-checked — a commented-out entry rots silently the first time `NavItem` gains a field.
 *
 * Stage 2 (merging the statistics screens into Overview / Today) is an open question with the owner and is
 * deliberately NOT done here.
 */
export const HIDDEN_NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "nav.dashboard",
    href: "/scheduler/dashboard",
    icon: LayoutDashboard,
    menuKey: "menu:dashboard",
  },
  // TASK-382 — was a commented-out line in `NAV_ITEMS`; it lives here (type-checked, and its `menu:overview` grant
  // is one of the twelve) so a hidden page still has its key. Restore the same way: move it back.
  {
    key: "overview",
    labelKey: "nav.overview",
    href: "/scheduler/overview",
    icon: LayoutDashboard,
    menuKey: "menu:overview",
  },
];

// TASK-357 (REQ-089 item 0) — the customer's name, the owner's spelling. Identifiers, keys and filenames keep the old name.
export const APP_NAME = "SOM SCHEDULE";
