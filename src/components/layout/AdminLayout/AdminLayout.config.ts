import { CalendarDays, Users, BookOpenCheck, BarChart3 } from "lucide-react";

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
  { key: "bookings", labelKey: "nav.bookings", href: "/scheduler/bookings", icon: BookOpenCheck },
  { key: "reports", labelKey: "nav.reports", href: "/scheduler/reports", icon: BarChart3 },
];

export const APP_NAME = "Smart Scheduler";
