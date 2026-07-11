"use client";

import { useState } from "react";
import { Tabs, Button, Group } from "@mantine/core";
import { CalendarPlus, Ticket } from "lucide-react";
import { useT } from "@/lib/i18n";
import CoursePackagePanel from "./CoursePackagePanel";
import VoucherPanel from "./VoucherPanel";
import BookingsTable from "./BookingsTable";
import CreateCourseModal from "./CreateCourseModal";
import CreateVoucherModal from "./CreateVoucherModal";

export default function BookingsContent() {
  const t = useT();
  const [courseOpen, setCourseOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);

  return (
    <>
      <Tabs defaultValue="courses" color="blue" variant="default">
        <Tabs.List>
          <Tabs.Tab value="courses">{t("bookings.tabCourses")}</Tabs.Tab>
          <Tabs.Tab value="vouchers">{t("bookings.tabVouchers")}</Tabs.Tab>
          <Tabs.Tab value="all">{t("bookings.tabAll")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="courses" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-default-500">{t("bookings.coursesHint")}</p>
            <Button
              leftSection={<CalendarPlus size={16} />}
              onClick={() => setCourseOpen(true)}
            >
              {t("bookings.newCourse")}
            </Button>
          </Group>
          <CoursePackagePanel />
        </Tabs.Panel>

        <Tabs.Panel value="vouchers" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-default-500">{t("bookings.vouchersHint")}</p>
            <Button leftSection={<Ticket size={16} />} onClick={() => setVoucherOpen(true)}>
              {t("bookings.issueVoucher")}
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
