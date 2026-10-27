"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useCan } from "@/hooks/scheduler/useMe";
// straight from the hooks file, not the barrel (other test files stub the barrel with a fixed export list)
import { useOpenPlanFromLink } from "@/hooks/scheduler/useOpenPlanFromLink";
import { planRequestFromParams } from "@/lib/scheduler/attention-link";

export default function BookingsContent() {
  const t = useT();
  const [courseOpen, setCourseOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  // SPEC-025 — migrating an existing balance is its own explicit action, never a mode of "sell". Selling
  // stays the primary button; this sits beside it as a plainly-labelled secondary.
  const [importOpen, setImportOpen] = useState(false);
  // REQ-030 / TASK-099 — the shared per-entitlement plan editor, opened from a course/voucher card.
  const [planId, setPlanId] = useState<string | null>(null);
  /**
   * 🔴 REQ-132 (TASK-841) — **the ONE URL read on this page:** `?course=<id>` / `?voucher=<id>` (an Attention item's link) opens that entitlement's plan window once.
   * 🔑 It opens only after the plan LOADS and is the kind the link names — an unknown / wrong-kind id opens nothing (no crash, no toast: the page simply shows as usual).
   * `opened` makes it ONCE: closing the window must not bring it back.
   */
  const params = useSearchParams();
  const request = planRequestFromParams((k) => params?.get(k) ?? null);
  useOpenPlanFromLink(request, setPlanId);
  // REQ-028 / TASK-109 — standalone equipment rental (walk-in), no booking to attach to.
  const [rentalOpen, setRentalOpen] = useState(false);
  // REQ-092 Stage 3 (TASK-386) — every door to a mutate is behind its key; not granted ⇒ hidden.
  const can = useCan();

  return (
    <>
      <Tabs defaultValue={request?.kind === "voucher" ? "vouchers" : "courses"} color="blue" variant="default">
        <Tabs.List>
          <Tabs.Tab value="courses">{t("bookings.tabCourses")}</Tabs.Tab>
          <Tabs.Tab value="vouchers">{t("bookings.tabVouchers")}</Tabs.Tab>
          <Tabs.Tab value="all">{t("bookings.tabAll")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="courses" pt="md">
          {/* 🔴 TASK-658 (REQ-112) — the hint that sat here was ENTIRELY about the leave quota and the lock ("4 → 1 · 6 → 2 · 10 → 3 ·
              exceeding it locks…"). Neither exists, so the sentence is DELETED rather than rewritten; the buttons keep the right. */}
          <Group justify="flex-end" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <Group gap="sm">
              {can("action:bookings.course-import") && (
                <Button
                  variant="default"
                  leftSection={<History size={16} />}
                  onClick={() => setImportOpen(true)}
                >
                  {t("bookings.importBalance")}
                </Button>
              )}
              {can("action:bookings.course-create") && (
                <Button
                  leftSection={<CalendarPlus size={16} />}
                  onClick={() => setCourseOpen(true)}
                >
                  {t("bookings.newCourse")}
                </Button>
              )}
            </Group>
          </Group>
          <CoursePackagePanel onManage={setPlanId} />
        </Tabs.Panel>

        <Tabs.Panel value="vouchers" pt="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
            <p className="max-w-2xl text-sm text-muted-500">{t("bookings.vouchersHint")}</p>
            <Group gap="sm">
              {can("action:bookings.voucher-import") && (
                <Button
                  variant="default"
                  leftSection={<History size={16} />}
                  onClick={() => setImportOpen(true)}
                >
                  {t("bookings.importBalance")}
                </Button>
              )}
              {can("action:bookings.voucher-create") && (
                <Button leftSection={<Ticket size={16} />} onClick={() => setVoucherOpen(true)}>
                  {t("bookings.issueVoucher")}
                </Button>
              )}
            </Group>
          </Group>
          <VoucherPanel onManage={setPlanId} />
        </Tabs.Panel>

        <Tabs.Panel value="all" pt="md">
          {can("action:calendar.rental-sale") && (
            <Group justify="flex-end" mb="md">
              <Button
                variant="default"
                leftSection={<PackageOpen size={16} />}
                onClick={() => setRentalOpen(true)}
              >
                {t("rental.standaloneBtn")}
              </Button>
            </Group>
          )}
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
