"use client";

import { Tabs, Tab } from "@heroui/react";
import CoursePackagePanel from "./CoursePackagePanel";
import BookingsTable from "./BookingsTable";

export default function BookingsContent() {
  return (
    <Tabs aria-label="การจอง" color="primary" variant="underlined">
      <Tab key="courses" title="คอร์ส + สิทธิ์การลา">
        <div className="pt-2">
          <p className="mb-4 text-sm text-default-500">
            โควตาการลาผูกกับขนาดคอร์ส: 4 ครั้ง → ลาได้ 1 · 6 ครั้ง → 2 · 10 ครั้ง → 3 ·
            ลาเกินโควตาระบบจะล็อกการเลื่อนตาราง จนกว่าแอดมินจะปลดล็อก
          </p>
          <CoursePackagePanel />
        </div>
      </Tab>
      <Tab key="all" title="การจองทั้งหมด">
        <div className="pt-2">
          <BookingsTable />
        </div>
      </Tab>
    </Tabs>
  );
}
