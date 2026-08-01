import { CalendarDays, Users, BookOpenCheck, BarChart3, Tag, LayoutDashboard, Contact, BellRing, PieChart, Link2 } from "lucide-react";

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
  { key: "dashboard", labelKey: "nav.dashboard", href: "/scheduler/dashboard", icon: LayoutDashboard },
  { key: "som", labelKey: "nav.som", href: "/scheduler/som", icon: PieChart },
  { key: "attention", labelKey: "nav.attention", href: "/scheduler/attention", icon: BellRing },
  { key: "reports", labelKey: "nav.reports", href: "/scheduler/reports", icon: BarChart3 },
];

export const APP_NAME = "Smart Scheduler";
