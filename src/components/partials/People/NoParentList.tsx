"use client";

import { Card, Loader, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { formatDob } from "@/lib/people/birthday-filter";
import type { StudentListItem } from "@/types/api/contract";

/**
 * 🔴 **TASK-664 (piece B) — the children with no household, findable on purpose.** People lists children BY PARENT, so a
 * child with no parent was not unlabelled — it was unlisted. This is the list the owner bought the import exemption with.
 *
 * - The rows are the server's answer to `GET /students?noParent=true` (TASK-663), in the server's order. 🚫 Nothing here
 *   filters or sorts.
 * - 🔑 **Quiet, factual, and the reason said ONCE** — the explainer at the top of the list, where somebody went looking
 *   (Porter). No red, no warning icon.
 * - 🚫 **No action control, no bulk action:** no screen can set a child's parent today (the student edit's allow-list
 *   excludes `parentId`). This view makes them visible; it does not fix them, and must not promise to.
 * - Each row shows what the existing student list shows: name · nickname · birth date or `—`.
 */
export default function NoParentList({ rows, loading }: { rows: StudentListItem[] | undefined; loading: boolean }) {
  const t = useT();
  return (
    <Card padding="md" withBorder data-no-parent-list={rows?.length ?? 0}>
      {/* 🔒 OWNER'S JUDGEMENT (approved 2026-10-05, do not "tidy"): the explainer appears ONCE, here under the filter —
          never per row. The person who opened the filter came looking; everyone else must not be taught to ignore it. */}
      <Text size="xs" c="dimmed" mb="xs" data-no-parent-explainer>
        {t("student.noParentExplainer")}
      </Text>
      {loading && !rows ? (
        <Loader size="sm" />
      ) : (rows?.length ?? 0) === 0 ? (
        <Text ta="center" c="dimmed" size="sm" data-no-parent-empty>
          {t("student.noParentEmpty")}
        </Text>
      ) : (
        <Stack gap={0}>
          {/* 🔒 OWNER'S JUDGEMENT (approved 2026-10-05, do not "tidy"): NO action button, no bulk action. No screen can set a
              child's parent, so a button would promise what the product cannot do. This view makes them VISIBLE; it does
              not fix them. (Pinned: 0 buttons or links in this list.) */}
          {rows!.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-t border-muted-100 py-1.5 text-sm" data-no-parent-row={s.id}>
              <span className="min-w-0">
                <span className="font-medium">{s.name}</span>
                {s.nickname && s.nickname !== s.name && <span className="ml-1 text-muted-500">({s.nickname})</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-500" data-dob={s.birthDate ?? "none"}>
                {formatDob(s.birthDate)}
              </span>
            </div>
          ))}
        </Stack>
      )}
    </Card>
  );
}
