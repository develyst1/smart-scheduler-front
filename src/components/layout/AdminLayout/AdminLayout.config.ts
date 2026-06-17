import { CalendarDays, Users, BookOpenCheck, BarChart3 } from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: typeof CalendarDays;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "calendar", label: "ตารางเรียน", href: "/scheduler/calendar", icon: CalendarDays },
  { key: "teachers", label: "คุณครู", href: "/scheduler/teachers", icon: Users },
  { key: "bookings", label: "การจอง / นักเรียน", href: "/scheduler/bookings", icon: BookOpenCheck },
  { key: "reports", label: "รายงานประจำวัน", href: "/scheduler/reports", icon: BarChart3 },
];

export const APP_NAME = "Smart Scheduler";
