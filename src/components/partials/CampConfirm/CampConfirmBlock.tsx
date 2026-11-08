"use client";

import { useState } from "react";
import { Badge, Button, Group } from "@mantine/core";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import { formatDateDisplay } from "@/lib/ui/format";
import { isConfirmed } from "@/lib/camp/camp-confirm";
import ConfirmCampDialog from "./ConfirmCampDialog";
import type { CampPackage } from "@/types/api/contract";

/**
 * TASK-901 — the camp package's D3 state: a badge «Not confirmed yet» / «Confirmed · <date>» and the «Confirm camp» button (disabled once confirmed).
 * The button is drawn only for a user with `action:camp.sell` (the right the SPEC gives the confirm — hidden, never disabled-for-permission); the badge shows to everyone who sees the card.
 */
export default function CampConfirmBlock({ pkg }: { pkg: CampPackage }) {
  const t = useT();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const done = isConfirmed(pkg);
  return (
    <Group justify="space-between" mt={8} wrap="wrap" data-camp-confirm={pkg.id}>
      <Badge variant="light" color={done ? "green" : "orange"} data-confirm-state={done ? "confirmed" : "pending"}>
        {done ? t("campConfirm.confirmedOn", { date: formatDateDisplay(pkg.confirmedOn) }) : t("campConfirm.notConfirmed")}
      </Badge>
      {can("action:camp.sell") && (
        <Button size="xs" variant="light" leftSection={<Check size={14} />} disabled={done} onClick={() => setOpen(true)} data-confirm-camp>
          {t("campConfirm.confirm")}
        </Button>
      )}
      {open && <ConfirmCampDialog pkg={pkg} opened={open} onClose={() => setOpen(false)} />}
    </Group>
  );
}
