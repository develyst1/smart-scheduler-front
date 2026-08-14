"use client";

import { useState } from "react";
import { Tabs, Button, Group } from "@mantine/core";
import { CalendarPlus, Ticket, History, PackageOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import CoursePackagePanel from "./CoursePackagePanel";
import VoucherPanel from "./VoucherPanel";
import BookingsTable from "./BookingsTable";
import CreatePlanFlow from "./CreatePlanFlow";
import CreateVoucherModal from "./CreateVoucherModal";
import ImportBalanceModal from "./ImportBalanceModal";
import PlanModal from "./PlanModal";
import RentalModal from "@/components/partials/Rental/RentalModal";

export default function BookingsContent() {
  const t = useT();
  const [courseOpen, setCourseOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  // SPEC-025 — migrating an existing balance is its own explicit action, never a mode of "sell". Selling
  // stays the primary button; this sits beside it as a plainly-labelled secondary.
  const [importOpen, setImportOpen] = useState(false);
  // REQ-030 / TASK-099 — the shared per-entitlement plan editor, opened from a course/voucher card.
  const [planId, setPlanId] = useState<string | null>(null);
  // REQ-028 / TASK-109 — standalone equipment rental (walk-in), no booking to attach to.
  const [rentalOpen, setRentalOpen] = useState(false);

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
            <p className="max-w-2xl text-sm text-muted-500">{t("bookings.coursesHint")}</p>
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
          <CoursePackagePanel onManage={setPlanId} />
        </Tabs.Panel>

        <Tabs.Panel value="vouchers" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-muted-500">{t("bookings.vouchersHint")}</p>
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
          <VoucherPanel onManage={setPlanId} />
        </Tabs.Panel>

        <Tabs.Panel value="all" pt="md">
          <Group justify="flex-end" mb="md">
            <Button
              variant="default"
              leftSection={<PackageOpen size={16} />}
              onClick={() => setRentalOpen(true)}
            >
              {t("rental.standaloneBtn")}
            </Button>
          </Group>
          <BookingsTable />
        </Tabs.Panel>
      </Tabs>

      <CreatePlanFlow opened={courseOpen} onClose={() => setCourseOpen(false)} />
      <CreateVoucherModal opened={voucherOpen} onClose={() => setVoucherOpen(false)} />
      <ImportBalanceModal opened={importOpen} onClose={() => setImportOpen(false)} />
      <PlanModal opened={!!planId} onClose={() => setPlanId(null)} entitlementId={planId} />
      <RentalModal opened={rentalOpen} onClose={() => setRentalOpen(false)} />
    </>
  );
}
