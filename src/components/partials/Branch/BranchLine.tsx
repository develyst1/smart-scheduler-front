"use client";

import { Badge, Group, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import type { Branch } from "@/types/api/contract";
import { BRANCH_LIVE } from "./config";

/**
 * The branch the server returned, read-only (TASK-898 §3). Shown ONLY when it is not BRAVO, so today's screens do not change at all,
 * and only when the field is live.
 */
export default function BranchLine({ branch, live = BRANCH_LIVE }: { branch: Branch | undefined; live?: boolean }) {
  const t = useT();
  if (!live || branch !== "OTHER") return null;
  return (
    <Group gap={6} data-branch-line={branch}>
      <Text size="sm" c="dimmed">
        {t("branch.label")}
      </Text>
      <Badge variant="light" color="gray" tt="none">
        {t(`branch.${branch}`)}
      </Badge>
    </Group>
  );
}
