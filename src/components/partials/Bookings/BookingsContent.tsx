"use client";

import { useState } from "react";
import { Tabs, Button, Group } from "@mantine/core";
import { CalendarPlus, Ticket } from "lucide-react";
import CoursePackagePanel from "./CoursePackagePanel";
import VoucherPanel from "./VoucherPanel";
import BookingsTable from "./BookingsTable";
import CreateCourseModal from "./CreateCourseModal";
import CreateVoucherModal from "./CreateVoucherModal";

export default function BookingsContent() {
  const [courseOpen, setCourseOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);

  return (
    <>
      <Tabs defaultValue="courses" color="blue" variant="default">
        <Tabs.List>
          <Tabs.Tab value="courses">คอร์ส + สิทธิ์การลา</Tabs.Tab>
          <Tabs.Tab value="vouchers">วอยเชอร์</Tabs.Tab>
          <Tabs.Tab value="all">การจองทั้งหมด</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="courses" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-default-500">
              โควตาการลาผูกกับขนาดคอร์ส: 4 ครั้ง → ลาได้ 1 · 6 ครั้ง → 2 · 10 ครั้ง → 3 ·
              ลาเกินโควตาระบบจะล็อกการเลื่อนตาราง จนกว่าแอดมินจะปลดล็อก
            </p>
            <Button
              leftSection={<CalendarPlus size={16} />}
              onClick={() => setCourseOpen(true)}
            >
              สมัครคอร์ส
            </Button>
          </Group>
          <CoursePackagePanel />
        </Tabs.Panel>

        <Tabs.Panel value="vouchers" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-default-500">
              วอยเชอร์ 5/10/15 ชม. — ไม่ล็อกครูหรือเวลา · อายุนับจากวันจองครั้งแรก ·
              ใช้จองผ่านปฏิทิน (ประเภท Voucher)
            </p>
            <Button leftSection={<Ticket size={16} />} onClick={() => setVoucherOpen(true)}>
              ออกวอยเชอร์
            </Button>
          </Group>
          <VoucherPanel />
        </Tabs.Panel>

        <Tabs.Panel value="all" pt="md">
          <BookingsTable />
        </Tabs.Panel>
      </Tabs>

      <CreateCourseModal opened={courseOpen} onClose={() => setCourseOpen(false)} />
      <CreateVoucherModal opened={voucherOpen} onClose={() => setVoucherOpen(false)} />
    </>
  );
}
