"use client";

import { Tabs } from "@mantine/core";
import CoursePackagePanel from "./CoursePackagePanel";
import BookingsTable from "./BookingsTable";

export default function BookingsContent() {
  return (
    <Tabs defaultValue="courses" color="blue" variant="default">
      <Tabs.List>
        <Tabs.Tab value="courses">คอร์ส + สิทธิ์การลา</Tabs.Tab>
        <Tabs.Tab value="all">การจองทั้งหมด</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="courses" pt="md">
        <p className="mb-4 text-sm text-default-500">
          โควตาการลาผูกกับขนาดคอร์ส: 4 ครั้ง → ลาได้ 1 · 6 ครั้ง → 2 · 10 ครั้ง → 3 ·
          ลาเกินโควตาระบบจะล็อกการเลื่อนตาราง จนกว่าแอดมินจะปลดล็อก
        </p>
        <CoursePackagePanel />
      </Tabs.Panel>

      <Tabs.Panel value="all" pt="md">
        <BookingsTable />
      </Tabs.Panel>
    </Tabs>
  );
}
