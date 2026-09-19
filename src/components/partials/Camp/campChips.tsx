"use client";

import { Badge } from "@mantine/core";
import { useT } from "@/lib/i18n";
import type { CampDayEntry, CampPackageDay } from "@/types/api/contract";

/** REQ-095 Stage 3a (TASK-402) — the two chips a camp day wears everywhere: kind/half and status. The words are the server's. */
export function CampHalfChip({ half, kind }: { half: CampPackageDay["half"]; kind?: CampDayEntry["kind"] }) {
  const t = useT();
  return (
    <Badge size="xs" variant="outline" color="gray">
      {half === "FULL" ? t("camp.halfFull") : half}
      {kind === "HALF" && half === "FULL" ? "" : ""}
    </Badge>
  );
}

const STATUS_COLOR: Record<CampPackageDay["status"], string> = { PLANNED: "blue", ATTENDED: "green", ABSENT: "orange", CANCELLED: "gray" };

export function CampStatusChip({ status }: { status: CampPackageDay["status"] }) {
  const t = useT();
  return (
    <Badge size="xs" variant="light" color={STATUS_COLOR[status]}>
      {t(`camp.status_${status}`)}
    </Badge>
  );
}
