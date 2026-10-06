"use client";

import { ActionIcon, Badge, Button, Card, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { Archive, ArchiveRestore, Link2 } from "lucide-react";
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
 * - 🔴 **TASK-669 — a per-row LINK door ("ผูกผู้ปกครอง"), beside the archive door.** Link is the act for a REAL child, archive is
 *   the act for a title row. It only opens the dialog: the confirm there is what shows the family's children and the child's
 *   upcoming sessions before anything is written. 🚫 Still no bulk link, no "link all", nothing decided by a row's name.
 * - 🔴 **TASK-665 — per-row ARCHIVE, and its RESTORE under `Show archived`.** A parentless record has no parent card, so
 *   the card's restore cannot reach it: restore lives HERE, or the approved "restore any time" sentence is false. The
 *   handlers, the confirm and every word are the page's existing ones (passed in). 🚫 No bulk, no select-all, no delete.
 * - Each row shows what the existing student list shows: name · nickname · birth date or `—`.
 */
export default function NoParentList({
  rows,
  loading,
  archivedRows,
  canArchive,
  canLink,
  onLink,
  onArchive,
  onRestore,
  restoringId,
}: {
  rows: StudentListItem[] | undefined;
  loading: boolean;
  /** TASK-665 — the ARCHIVED parentless records; given only while `Show archived` is on. */
  archivedRows?: StudentListItem[];
  canArchive: boolean;
  /** TASK-669 — `action:people.parent-students`, asked by the page as a literal. */
  canLink: boolean;
  onLink: (s: StudentListItem) => void;
  onArchive: (s: StudentListItem) => void;
  onRestore: (s: StudentListItem) => void;
  restoringId?: string;
}) {
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
          {/* 🔒 OWNER'S JUDGEMENT (#3 approved 2026-10-05, do not "tidy"): never a button that promises what the product cannot
              do. It stood against a "link a parent" button while no screen could set a child's parent. 🔻 TASK-668 built that
              act, so the link door below promises something the product CAN do and does NOT reverse #3 (which still bars any
              control the product cannot honour). ➕ Per-row ARCHIVE approved 2026-10-06 (owner, TASK-665) on the same ground.
              ONE row at a time, for both: no bulk, no select-all, no "link all", no delete, nothing decided by the row's name
              (pinned by count). */}
          {rows!.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-t border-muted-100 py-1.5 text-sm" data-no-parent-row={s.id}>
              <span className="min-w-0">
                <span className="font-medium">{s.name}</span>
                {s.nickname && s.nickname !== s.name && <span className="ml-1 text-muted-500">({s.nickname})</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-500" data-dob={s.birthDate ?? "none"}>
                  {formatDob(s.birthDate)}
                </span>
                {/* TASK-669 — Link a parent: opens the picker + confirm. The act for a real child. */}
                {canLink && (
                  <Button size="compact-xs" variant="light" leftSection={<Link2 size={13} />} onClick={() => onLink(s)} data-no-parent-link={s.id}>
                    {t("people.linkParent")}
                  </Button>
                )}
                {/* TASK-665 — the family list's own archive door, first tap; the page's confirm is the second. */}
                {canArchive && (
                  <Tooltip label={t("people.archiveStudent")} withinPortal>
                    <ActionIcon variant="subtle" color="red" aria-label={t("people.archiveStudent")} onClick={() => onArchive(s)} data-no-parent-archive={s.id}>
                      <Archive size={15} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </span>
            </div>
          ))}
        </Stack>
      )}
      {/* TASK-665 — the archived parentless records, only under `Show archived`: dimmed, with a one-tap Restore — the family
          card's treatment, because a parentless record has no card to carry it. */}
      {(archivedRows?.length ?? 0) > 0 && (
        <Stack gap={6} mt="sm" className="opacity-60" data-no-parent-archived={archivedRows!.length}>
          {archivedRows!.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2" data-no-parent-archived-row={s.id}>
              <div className="min-w-0">
                <span className="text-sm font-medium line-through">{s.nickname || s.name}</span>
                <Badge size="xs" variant="light" color="gray" ml={6}>
                  {t("people.archivedBadge")}
                </Badge>
              </div>
              {canArchive && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="green"
                  leftSection={<ArchiveRestore size={13} />}
                  loading={restoringId === s.id}
                  onClick={() => onRestore(s)}
                >
                  {t("people.restore")}
                </Button>
              )}
            </div>
          ))}
        </Stack>
      )}
    </Card>
  );
}
