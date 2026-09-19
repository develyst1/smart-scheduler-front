"use client";

import { useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Badge, Button, Card, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { ShoppingCart, Ticket } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import { useCampPackages, useCampWeeks } from "@/hooks/scheduler/useCamp";
import { formatDateDisplay } from "@/lib/ui/format";
import { creditDays, creditLabel } from "@/lib/camp/units";
import { CampHalfChip, CampStatusChip } from "./campChips";
import SellCampDialog from "./SellCampDialog";
import type { StudentSelectValue } from "@/components/common/StudentSelect";

/**
 * REQ-095 Stage 3a (TASK-402) — the student's CAMP CARD: their packages with `credit / total` in DAYS with the half
 * (`4½ days left`, from the server's UNITS — `creditDays` is pure), used, planned, the planned days; a `Sell` door
 * (`camp.sell`) and a link to the Camp menu to redeem. 🚫 No expiry — there is none.
 */
export default function CampCardModal({ student, opened, onClose }: { student: StudentSelectValue & { id: string }; opened: boolean; onClose: () => void }) {
  const t = useT();
  const can = useCan();
  const { data: packages = [], isLoading } = useCampPackages(opened ? student.id : null);
  const from = dayjs().subtract(7, "day").format("YYYY-MM-DD");
  const to = dayjs().add(60, "day").format("YYYY-MM-DD");
  const { data: weeks = [] } = useCampWeeks(from, to, opened);
  const [sellOpen, setSellOpen] = useState(false);

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t("camp.cardTitle", { name: student.name })}>
      <Stack gap="sm">
        {isLoading ? (
          <Loader size="xs" />
        ) : packages.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("camp.noPackages")}
          </Text>
        ) : (
          packages.map((p) => {
            const { days, half } = creditDays(p.credit);
            return (
              <Card key={p.id} withBorder padding="sm" data-package={p.id} data-credit={`${days}${half ? "½" : ""}`}>
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Text fw={600}>
                      {t(`camp.kind_${p.kind}`)} · {t(`camp.plan_${p.plan}`)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t("camp.boughtOn", { date: formatDateDisplay(p.createdAt) })}
                      {p.note ? ` · ${p.note}` : ""}
                    </Text>
                  </div>
                  <Badge size="lg" variant="light" color={p.credit > 0 ? "green" : "gray"}>
                    {t("camp.daysLeft", { n: creditLabel(p.credit) })}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {t("camp.creditLine", { total: creditLabel(p.totalUnits), used: creditLabel(p.usedUnits), planned: creditLabel(p.plannedUnits) })}
                </Text>
                {p.days.length > 0 && (
                  <Stack gap={2} mt={6}>
                    {p.days.map((d) => (
                      <div key={d.dayId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">
                          {formatDateDisplay(d.date)} · {d.weekName}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <CampHalfChip half={d.half} />
                          <CampStatusChip status={d.status} />
                        </span>
                      </div>
                    ))}
                  </Stack>
                )}
              </Card>
            );
          })
        )}
        <Group justify="flex-end" gap="sm">
          {can("action:camp.redeem") && (
            <Button component={Link} href="/scheduler/camp" variant="light" leftSection={<Ticket size={15} />}>
              {t("camp.goRedeem")}
            </Button>
          )}
          {can("action:camp.sell") && (
            <Button leftSection={<ShoppingCart size={15} />} onClick={() => setSellOpen(true)}>
              {t("camp.sellCamp")}
            </Button>
          )}
        </Group>
      </Stack>
      {sellOpen && <SellCampDialog opened={sellOpen} student={student} weeks={weeks} onClose={() => setSellOpen(false)} />}
    </Modal>
  );
}
