"use client";

import { useState } from "react";
import { Tabs, Button, Group } from "@mantine/core";
import { CalendarPlus, Ticket, History } from "lucide-react";
import { useT } from "@/lib/i18n";
import CoursePackagePanel from "./CoursePackagePanel";
import VoucherPanel from "./VoucherPanel";
import BookingsTable from "./BookingsTable";
import CreateCourseModal from "./CreateCourseModal";
import CreateVoucherModal from "./CreateVoucherModal";
import ImportBalanceModal from "./ImportBalanceModal";

export default function BookingsContent() {
  const t = useT();
  const [courseOpen, setCourseOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  // SPEC-025 — migrating an existing balance is its own explicit action, never a mode of "sell". Selling
  // stays the primary button; this sits beside it as a plainly-labelled secondary.
  const [importOpen, setImportOpen] = useState(false);

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
            <Group gap="sm">
              <Button
                variant="default"
                leftSection={<History size={16} />}
                onClick={() => setImportOpen(true)}
              >
                {t("bookings.importBalance")}
              </Button>
              <Button
                leftSection={<CalendarPlus size={16} />}
                onClick={() => setCourseOpen(true)}
              >
                {t("bookings.newCourse")}
              </Button>
            </Group>
          </Group>
          <CoursePackagePanel />
        </Tabs.Panel>

        <Tabs.Panel value="vouchers" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-default-500">{t("bookings.vouchersHint")}</p>
            <Group gap="sm">
              <Button
                variant="default"
                leftSection={<History size={16} />}
                onClick={() => setImportOpen(true)}
              >
                {t("bookings.importBalance")}
              </Button>
              <Button leftSection={<Ticket size={16} />} onClick={() => setVoucherOpen(true)}>
                {t("bookings.issueVoucher")}
              </Button>
            </Group>
          </Group>
          <VoucherPanel />
        </Tabs.Panel>

        <Tabs.Panel value="all" pt="md">
          <BookingsTable />
        </Tabs.Panel>
      </Tabs>

      <CreateCourseModal opened={courseOpen} onClose={() => setCourseOpen(false)} />
      <CreateVoucherModal opened={voucherOpen} onClose={() => setVoucherOpen(false)} />
      <ImportBalanceModal opened={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
