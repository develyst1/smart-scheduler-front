"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { AlertTriangle, ArrowLeftRight, CalendarPlus, CheckCheck, Pencil, UserMinus, UserPlus, XCircle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { useCan } from "@/hooks/scheduler/useMe";
import { useAllBookings, useTeachers } from "@/hooks/scheduler";
import { useConfirmAllOtherSeries, useOtherSeries } from "@/hooks/scheduler/useOtherSeries";
import { seriesDoors, statusCounts } from "@/lib/scheduler/other-series";
import { COACH_RATE_KEY } from "@/lib/scheduler/duo";
import { StatusChip } from "@/components/common/BookingBadges";
import type { Booking } from "@/types/app/scheduler";
import { AddDatesDialog, CancelAllDialog, EditHeaderDialog, TeacherDialog } from "./OtherSeriesDialogs";

/**
 * REQ-101 / SPEC-088 Part A (TASK-429 → TASK-435, the owner's re-spec) — the Manage-plan MODAL for an ECA/Free/KOL
 * series, on the calendar (no page, no navigation). The header (title · kind · heads · time · the teachers with their
 * rates), the rows in date order with their status chips, and the series doors — each hidden without its key
 * (`seriesDoors`, pure): Confirm all (`status`), Cancel all (key 58), Add / Remove / Swap teacher (`booking-edit`,
 * `fromDate` default today), Add dates (`other-series`), Edit header (`booking-edit`). Two entry points, ONE modal:
 * the OTHER block's `Manage plan` button and a `Series in range` row. A row click hands the booking to the calendar's
 * SINGLE `BookingModal` (`onOpenBooking`) and closes this one — one instance, no modal-over-modal. Every 409 is the
 * server's sentence; the data refetches only on 2xx.
 */
export default function OtherSeriesModal({ seriesKey, opened, onClose, onOpenBooking }: { seriesKey: string; opened: boolean; onClose: () => void; onOpenBooking: (b: Booking) => void }) {
  const t = useT();
  const can = useCan();
  const { data: series, isLoading, error } = useOtherSeries(seriesKey);
  const { data: teachers = [] } = useTeachers();
  const confirmAll = useConfirmAllOtherSeries();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [teacherDlg, setTeacherDlg] = useState<{ mode: "add" | "remove" | "swap"; teacherId?: string } | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // The rows as BOOKINGS (for the existing modal): the same `GET /bookings` the Bookings page uses, narrowed to the
  // series' teacher, type and date span; matched by id — never by title.
  const first = series?.rows[0]?.date;
  const last = series?.rows[series.rows.length - 1]?.date;
  const { data: page } = useAllBookings(series && first && last ? { type: "OTHER", teacherId: series.teacherId, from: first, to: last, limit: 200 } : { limit: 1 });
  const byId = useMemo(() => new Map((page?.items ?? []).map((b) => [b.id, b])), [page]);

  // REQ-092 — every door asks `can()` at its site; the pure `seriesDoors` adds the row conditions (key 58 alone gates cancel-all).
  const doors = seriesDoors({ status: can("action:calendar.status"), cancelAll: can("action:calendar.other-cancel-all"), edit: can("action:calendar.booking-edit"), series: can("action:calendar.other-series") }, series);
  const counts = statusCounts(series?.rows ?? []);
  const name = (id: string) => teachers.find((x) => x.id === id)?.nickname ?? id;
  // REQ-102 §8 (TASK-432) — the rates print only with key 59; the server sends `teacherRates: null` without it (never ฿0).
  const canRate = can(COACH_RATE_KEY);
  const rate = (id: string) => (canRate && typeof series?.teacherRates?.[id] === "number" ? ` · ฿${(series.teacherRates![id] / 100).toLocaleString("th-TH")}` : "");

  const runConfirmAll = async () => {
    try {
      const r = await confirmAll.mutateAsync(seriesKey);
      notify({ title: t("otherSeries.confirmedAll", { confirmed: r.confirmed, skipped: r.skipped }), color: "success" });
    } catch (e) {
      notify({ title: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
    }
  };

  const body = isLoading ? (
    <Loader size="sm" />
  ) : error || !series ? (
    <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
      {error instanceof ApiClientError ? error.message : t("otherSeries.notFound")}
    </Alert>
  ) : (
    <Stack gap="md" data-series={series.key}>
      <Card withBorder padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div className="min-w-0">
            <Group gap="xs" wrap="wrap">
              <Text fw={700} size="lg">
                {series.title}
              </Text>
              {series.kind && (
                <Badge variant="outline" color="gray">
                  {t(`booking.otherKind_${series.kind}`)}
                </Badge>
              )}
              {doors.editHeader && (
                <Button size="compact-xs" variant="subtle" leftSection={<Pencil size={12} />} onClick={() => setEditOpen(true)}>
                  {t("otherSeries.editHeader")}
                </Button>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {formatTimeDisplay(series.startTime)} · {t("otherSeries.heads", { n: series.headCount ?? "—" })} · {t("otherSeries.counts", { live: counts.live, pending: counts.pending, attended: counts.attended, cancelled: counts.cancelled })}
            </Text>
            <Text size="sm" mt={4} data-teachers={[series.teacherId, ...series.additionalTeacherIds].join(",")}>
              <span className="font-medium">{name(series.teacherId)}</span>
              {rate(series.teacherId)}
              {doors.swapPrimary && (
                <Button size="compact-xs" variant="subtle" color="gray" ml={4} leftSection={<ArrowLeftRight size={11} />} onClick={() => setTeacherDlg({ mode: "swap" })}>
                  {t("otherSeries.swapPrimary")}
                </Button>
              )}
              {series.additionalTeacherIds.map((id) => (
                <span key={id} className="ml-2 text-muted-600">
                  + {name(id)}
                  {rate(id)}
                  {doors.removeTeacher && (
                    <Button size="compact-xs" variant="subtle" color="red" ml={2} leftSection={<UserMinus size={11} />} onClick={() => setTeacherDlg({ mode: "remove", teacherId: id })}>
                      {t("otherSeries.removeTeacher")}
                    </Button>
                  )}
                </span>
              ))}
            </Text>
          </div>
          <Group gap="xs" wrap="wrap">
            {doors.addTeacher && (
              <Button size="xs" variant="light" leftSection={<UserPlus size={13} />} onClick={() => setTeacherDlg({ mode: "add" })}>
                {t("otherSeries.addTeacher")}
              </Button>
            )}
            {doors.addDates && (
              <Button size="xs" variant="light" leftSection={<CalendarPlus size={13} />} onClick={() => setDatesOpen(true)}>
                {t("otherSeries.addDates")}
              </Button>
            )}
            {doors.confirmAll && (
              <Button size="xs" color="blue" leftSection={<CheckCheck size={13} />} loading={confirmAll.isPending} onClick={() => void runConfirmAll()}>
                {t("otherSeries.confirmAll", { n: counts.pending })}
              </Button>
            )}
            {doors.cancelAll && (
              <Button size="xs" color="red" variant="light" leftSection={<XCircle size={13} />} onClick={() => setCancelOpen(true)}>
                {t("otherSeries.cancelAll")}
              </Button>
            )}
          </Group>
        </Group>
      </Card>

      <Card withBorder padding="sm">
        <Stack gap={4}>
          {series.rows.map((r) => {
            const b = byId.get(r.bookingId);
            return (
              <button
                key={r.bookingId}
                type="button"
                disabled={!b}
                onClick={() => {
                  if (!b) return;
                  onClose();
                  onOpenBooking(b);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted-100 disabled:cursor-default disabled:hover:bg-transparent"
                data-row={r.bookingId}
                data-status={r.status}
              >
                <span className="tabular-nums">{formatDateDisplay(r.date)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-600">
                  {name(r.teacherId)}
                  {r.additionalTeacherIds.length > 0 ? ` + ${r.additionalTeacherIds.map(name).join(", ")}` : ""}
                </span>
                <StatusChip status={r.status as Booking["status"]} />
              </button>
            );
          })}
        </Stack>
      </Card>

      {cancelOpen && <CancelAllDialog seriesKey={series.key} attended={counts.attended} live={counts.live} onClose={() => setCancelOpen(false)} />}
      {teacherDlg && <TeacherDialog seriesKey={series.key} series={series} teachers={teachers} mode={teacherDlg.mode} teacherId={teacherDlg.teacherId} onClose={() => setTeacherDlg(null)} />}
      {datesOpen && <AddDatesDialog seriesKey={series.key} existing={series.rows.map((r) => r.date)} onClose={() => setDatesOpen(false)} />}
      {editOpen && <EditHeaderDialog seriesKey={series.key} series={series} teachers={teachers} onClose={() => setEditOpen(false)} />}
    </Stack>
  );

  return (
    <Modal opened={opened} onClose={onClose} size="xl" centered title={t("otherSeries.managePlan")} data-series-modal={seriesKey}>
      {body}
    </Modal>
  );
}
