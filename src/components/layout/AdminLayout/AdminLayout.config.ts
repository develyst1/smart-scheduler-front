import { CalendarDays, Users, BookOpenCheck, BarChart3, Tag, LayoutDashboard, Contact, BellRing, PieChart, Link2, Settings2 } from "lucide-react";

export interface NavItem {
  key: string;
  /** i18n key resolved with t() at render (see nav.* in dictionaries). */
  labelKey: string;
  href: string;
  icon: typeof CalendarDays;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "calendar", labelKey: "nav.calendar", href: "/scheduler/calendar", icon: CalendarDays },
  { key: "teachers", labelKey: "nav.teachers", href: "/scheduler/teachers", icon: Users },
  { key: "people", labelKey: "nav.people", href: "/scheduler/people", icon: Contact },
  { key: "linkRequests", labelKey: "nav.linkRequests", href: "/scheduler/link-requests", icon: Link2 },
  { key: "bookings", labelKey: "nav.bookings", href: "/scheduler/bookings", icon: BookOpenCheck },
  { key: "badges", labelKey: "nav.badges", href: "/scheduler/badges", icon: Tag },
  { key: "som", labelKey: "nav.som", href: "/scheduler/som", icon: PieChart },
  { key: "attention", labelKey: "nav.attention", href: "/scheduler/attention", icon: BellRing },
  { key: "reports", labelKey: "nav.reports", href: "/scheduler/reports", icon: BarChart3 },
  { key: "settings", labelKey: "nav.settings", href: "/scheduler/settings", icon: Settings2 },
];

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
  { key: "dashboard", labelKey: "nav.dashboard", href: "/scheduler/dashboard", icon: LayoutDashboard },
];

export const APP_NAME = "Smart Scheduler";
