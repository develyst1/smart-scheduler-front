"use client";

import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { useUpdateCourseBranch } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { apiSentence } from "./api-sentence";
import BranchSelect from "./BranchSelect";
import { BRANCH_LIVE } from "./config";
import type { Branch } from "@/types/api/contract";

/**
 * The whole-course branch change (TASK-898 §2), next to Change teacher in the plan: `PATCH /courses/:id { branch }`; SB moves the course
 * and its not-yet-attended sessions. A select and a Save, nothing fires on choosing. `current` is the course's branch when the plan
 * sends it; until then the select starts empty and Save is open for any choice.
 * 🔴 SHIP GATE: with `BRANCH_LIVE` false this renders nothing.
 */
export default function CourseBranchControl({ courseId, current, live = BRANCH_LIVE }: { courseId: string; current?: Branch; live?: boolean }) {
  const t = useT();
  const change = useUpdateCourseBranch();
  const [picked, setPicked] = useState<Branch | null>(null);
  if (!live) return null;
  const shown = picked ?? current ?? null;
  const dirty = picked !== null && picked !== current;

  const save = async () => {
    if (!picked) return;
    try {
      await change.mutateAsync({ courseId, branch: picked });
      notify({ title: t("plan.changeApplied"), color: "success" });
      setPicked(null);
    } catch (e) {
      notify({ title: apiSentence(e) ?? t("plan.genericError"), color: "danger" });
    }
  };

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap" data-course-branch>
      <BranchSelect value={shown} onChange={setPicked} size="xs" w={130} live />
      <Button size="xs" variant="light" onClick={save} loading={change.isPending} disabled={!dirty}>
        {t("common.save")}
      </Button>
    </Group>
  );
}
