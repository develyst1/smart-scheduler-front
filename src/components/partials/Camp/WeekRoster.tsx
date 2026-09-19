"use client";

import { useState } from "react";
import { ActionIcon, Badge, Button, Card, Group, Loader, Menu, Stack, Text } from "@mantine/core";
import { ChevronDown, Pencil, QrCode, ShoppingCart, Ticket, Undo2 } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import { useCampDayCheckin, useCampWeekDays, useMarkCampDay } from "@/hooks/scheduler/useCamp";
import { formatDateDisplay } from "@/lib/ui/format";
import { CAMP_MARKS, canUndoCampDay, type CampMark } from "@/lib/camp/units";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import QrDialog from "@/components/common/QrDialog";
import { CampHalfChip, CampStatusChip } from "./campChips";
import OpenWeekDialog from "./OpenWeekDialog";
import RedeemDialog from "./RedeemDialog";
import SellCampDialog from "./SellCampDialog";
import UndoDayDialog from "./UndoDayDialog";
import type { CampDayEntry, CampWeek } from "@/types/api/contract";

/**
 * REQ-095 Stage 3a (TASK-402) — a week's ROSTER: one column per date, the children with a kind/half chip and a status
 * chip, the count vs capacity from the server. `Mark` per child per day (`camp.day-mark`: the same three words as the
 * server; PLANNED → any, ATTENDED ↔ ABSENT — the server refuses the rest with its sentence, `CAMP_DAY_STARTED` ⇒ its
 * "บันทึกขาดแทน" hint). `Redeem into this week` (`camp.redeem`) and `Sell a camp` (`camp.sell`) open their dialogs.
 * Stage 3b (TASK-404): `Undo` in the same menu on ATTENDED|ABSENT (same key) ⇒ `UndoDayDialog` (a reason ⇒ PLANNED);
 * the entry shows its `undoReason`; a QR button on a PLANNED entry ⇒ the SHARED `QrDialog` with the day's check-in
 * URL, minted lazily by `GET /camp/days/:id/checkin` only while the dialog is open.
 */
export default function WeekRoster({ weekId, weeks }: { weekId: string; weeks: CampWeek[] }) {
  const t = useT();
  const can = useCan();
  const { data, isLoading, error } = useCampWeekDays(weekId);
  const mark = useMarkCampDay();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [undo, setUndo] = useState<{ entry: CampDayEntry; date: string } | null>(null);
  const [qrDayId, setQrDayId] = useState<string | null>(null);
  const qr = useCampDayCheckin(qrDayId);

  const runMark = async (dayId: string, status: CampMark) => {
    try {
      await mark.mutateAsync({ dayId, status });
      notify({ title: t(`camp.marked_${status}`), color: status === "ATTENDED" ? "success" : "default" });
    } catch (e) {
      notify({ title: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
    }
  };

  if (isLoading || !data) return <Loader size="sm" />;
  if (error) return <Text c="red">{error instanceof ApiClientError ? error.message : String(error)}</Text>;
  const { week, days } = data;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Text fw={600}>
            {week.name}{" "}
            <Badge size="xs" variant="light" color={week.status === "OPEN" ? "green" : "gray"} ml={4}>
              {t(`camp.weekStatus_${week.status}`)}
            </Badge>
          </Text>
          <Text size="xs" c="dimmed">
            {formatDateDisplay(week.startDate)} → {formatDateDisplay(week.endDate)}
            {week.capacity !== null ? ` · ${t("camp.capacityLine", { n: String(week.capacity) })}` : ""}
          </Text>
        </div>
        <Group gap="xs">
          {can("action:camp.week-open") && (
            <Button size="xs" variant="subtle" leftSection={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
              {t("camp.editWeek")}
            </Button>
          )}
          {can("action:camp.sell") && (
            <Button size="xs" variant="light" leftSection={<ShoppingCart size={13} />} onClick={() => setSellOpen(true)}>
              {t("camp.sellCamp")}
            </Button>
          )}
          {can("action:camp.redeem") && week.status === "OPEN" && (
            <Button size="xs" leftSection={<Ticket size={13} />} onClick={() => setRedeemOpen(true)}>
              {t("camp.redeemInto")}
            </Button>
          )}
        </Group>
      </Group>

      <StickyScrollArea minWidth={Math.max(720, days.length * 200)}>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(180px, 1fr))` }}>
          {days.map((d) => (
            <Card key={d.date} withBorder padding="sm" data-day={d.date} data-count={`${d.count}/${d.capacity ?? "∞"}`}>
              <Group justify="space-between" mb={6}>
                <Text size="sm" fw={600}>
                  {formatDateDisplay(d.date)}
                </Text>
                <Badge size="sm" variant="light" color={d.capacity !== null && d.count >= d.capacity ? "red" : "blue"}>
                  {d.count}/{d.capacity ?? "∞"}
                </Badge>
              </Group>
              {d.entries.length === 0 ? (
                <Text size="xs" c="dimmed">
                  {t("camp.noKids")}
                </Text>
              ) : (
                <Stack gap={4}>
                  {d.entries.map((e) => (
                    <div key={e.dayId} className="flex items-center justify-between gap-1 text-sm" data-entry={e.dayId}>
                      <span className="min-w-0 truncate">
                        {e.studentName}
                        {e.undoReason && (
                          <Text component="span" size="xs" c="dimmed" ml={4} data-undo-reason>
                            · {t("camp.undoneLine", { reason: e.undoReason })}
                          </Text>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <CampHalfChip half={e.half} kind={e.kind} />
                        <CampStatusChip status={e.status} />
                        {e.status === "PLANNED" && (
                          <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("camp.qr")} title={t("camp.qr")} onClick={() => setQrDayId(e.dayId)}>
                            <QrCode size={14} />
                          </ActionIcon>
                        )}
                        {can("action:camp.day-mark") && e.status !== "CANCELLED" && (
                          <Menu shadow="md" position="bottom-end" withinPortal>
                            <Menu.Target>
                              <Button size="compact-xs" variant="subtle" color="gray" rightSection={<ChevronDown size={12} />} loading={mark.isPending && mark.variables?.dayId === e.dayId}>
                                {t("camp.mark")}
                              </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {CAMP_MARKS.filter((m) => m !== e.status).map((m) => (
                                <Menu.Item key={m} color={m === "CANCELLED" ? "red" : undefined} onClick={() => void runMark(e.dayId, m)}>
                                  {t(`camp.status_${m}`)}
                                </Menu.Item>
                              ))}
                              {canUndoCampDay(e.status) && (
                                <>
                                  <Menu.Divider />
                                  <Menu.Item color="orange" leftSection={<Undo2 size={13} />} onClick={() => setUndo({ entry: e, date: d.date })}>
                                    {t("camp.undo")}
                                  </Menu.Item>
                                </>
                              )}
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </span>
                    </div>
                  ))}
                </Stack>
              )}
            </Card>
          ))}
        </div>
      </StickyScrollArea>

      {redeemOpen && <RedeemDialog opened={redeemOpen} week={week} onClose={() => setRedeemOpen(false)} />}
      {sellOpen && <SellCampDialog opened={sellOpen} weeks={weeks} weekPreset={week} onClose={() => setSellOpen(false)} />}
      {editOpen && <OpenWeekDialog opened={editOpen} week={week} onClose={() => setEditOpen(false)} />}
      {undo && <UndoDayDialog opened entry={undo.entry} date={undo.date} onClose={() => setUndo(null)} />}
      {qrDayId && (
        <QrDialog
          opened
          onClose={() => setQrDayId(null)}
          title={t("camp.qrTitle")}
          subtitle={qr.data ? `${qr.data.studentName} · ${formatDateDisplay(qr.data.date)} · ${qr.data.half === "FULL" ? t("camp.halfFull") : qr.data.half}` : undefined}
          url={qr.data?.url}
          expiresAt={qr.data?.expiresAt}
          loading={qr.isLoading}
          error={qr.error ? (qr.error instanceof ApiClientError ? qr.error.message : String(qr.error)) : null}
        />
      )}
    </Stack>
  );
}
