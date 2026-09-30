"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { ActionIcon, Alert, Badge, Button, Card, Group, Loader, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { ChevronLeft, ChevronRight, Info, Tent, TentTree } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import { useCampWeeks, useDeleteCampWeek, useUpdateCampWeek } from "@/hooks/scheduler/useCamp";
import { formatDateDisplay } from "@/lib/ui/format";
import { weeksByMonth } from "@/lib/camp/units";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import OpenWeekDialog from "./OpenWeekDialog";
import WeekRoster from "./WeekRoster";

/**
 * REQ-095 Stage 3a / SPEC-082 (TASK-402) — the **Camp** menu (behind `menu:camp` — the nav and the route guard hide
 * it; the server refuses the routes). Weeks by month (a month at a time, ± a week so a week straddling the edge shows)
 * → a week's roster. `Open a week` behind `camp.week-open`; closing a week is the same key (`status: CLOSED`, one tap
 * — it only stops new redeems; nothing is deleted). 🚫 No expiry anywhere — there is none.
 */
export default function CampContent() {
  const t = useT();
  const can = useCan();
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const from = dayjs(`${month}-01`).subtract(7, "day").format("YYYY-MM-DD");
  const to = dayjs(`${month}-01`).endOf("month").add(7, "day").format("YYYY-MM-DD");
  const { data: weeks = [], isLoading } = useCampWeeks(from, to);
  const update = useUpdateCampWeek();
  // 🔴 TASK-586 — Delete is a second door with its own refusal; it never shares the status mutation's spinner.
  const remove = useDeleteCampWeek();
  /** The week whose delete is being confirmed, and the SERVER's refusal for it (verbatim, never paraphrased). */
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openOpen, setOpenOpen] = useState(false);
  const groups = weeksByMonth(weeks.filter((w) => w.startDate.slice(0, 7) === month || w.endDate.slice(0, 7) === month));

  /**
   * 🔴 **TASK-581 (BE) → TASK-586 — Close stops NEW bookings and nothing else.** Existing bookings stay, the coaches stay
   * blocked, both reminders keep going, the per-day swap still works, and the days still charge because they still run.
   * 🔑 **Close ⇒ Open restores the week EXACTLY** (the server proves it by value), which is why the words below say so
   * without hedging.
   */
  const setStatus = async (id: string, name: string, status: "OPEN" | "CLOSED") => {
    setRefusal(null);
    try {
      await update.mutateAsync({ id, input: { status } });
      notify({ title: t(status === "CLOSED" ? "camp.weekClosedOk" : "camp.weekOpenedOk", { name }), color: "default" });
    } catch (e) {
      notify({ title: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
    }
  };

  /**
   * 🔴 **Delete — and the refusal is the point.** The server counts the week's bookings **at the act**, so a camp that
   * gained one while this dialog was open is refused. ⚠️ **Its sentence already says how many there are and to use Close
   * instead** ⇒ 🚫 **it is shown VERBATIM and never replaced with a generic failure.** It stays on screen (not a toast)
   * because it is the answer to the question the admin just asked.
   */
  const doDelete = async () => {
    if (!confirmDelete) return;
    setRefusal(null);
    try {
      await remove.mutateAsync(confirmDelete.id);
      notify({ title: t("camp.weekDeletedOk", { name: confirmDelete.name }), color: "default" });
      setConfirmDelete(null);
    } catch (e) {
      setRefusal(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="subtle" color="gray" aria-label={t("camp.prevMonth")} onClick={() => setMonth(dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM"))}>
            <ChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} className="tabular-nums">
            {dayjs(`${month}-01`).format("MMMM YYYY")}
          </Text>
          <ActionIcon variant="subtle" color="gray" aria-label={t("camp.nextMonth")} onClick={() => setMonth(dayjs(`${month}-01`).add(1, "month").format("YYYY-MM"))}>
            <ChevronRight size={18} />
          </ActionIcon>
        </Group>
        {can("action:camp.week-open") && (
          <Button leftSection={<TentTree size={16} />} onClick={() => setOpenOpen(true)}>
            {t("camp.openWeek")}
          </Button>
        )}
      </Group>

      {isLoading ? (
        <Loader size="sm" />
      ) : groups.length === 0 ? (
        <Card withBorder padding="lg">
          <Group justify="center" c="dimmed" gap="xs">
            <Tent size={18} />
            <Text size="sm">{t("camp.noWeeks")}</Text>
          </Group>
        </Card>
      ) : (
        <Stack gap="xs">
          {groups.flatMap((g) => g.weeks).map((w) => {
            const kids = Object.values(w.dayCounts).reduce((s, n) => s + n, 0);
            return (
              <Card key={w.id} withBorder padding="sm" className={selected === w.id ? "border-primary" : undefined} data-week={w.id}>
                <Group justify="space-between" wrap="wrap">
                  <UnstyledButton onClick={() => setSelected(selected === w.id ? null : w.id)} className="min-w-0 flex-1">
                    <Text fw={600}>{w.name}</Text>
                    <Text size="xs" c="dimmed">
                      {formatDateDisplay(w.startDate)} → {formatDateDisplay(w.endDate)} · {t("camp.kidDays", { n: String(kids) })}
                      {w.capacity !== null ? ` · ${t("camp.capacityLine", { n: String(w.capacity) })}` : ""}
                    </Text>
                  </UnstyledButton>
                  <Group gap="xs">
                    <Badge size="sm" variant="light" color={w.status === "OPEN" ? "green" : "gray"}>
                      {t(`camp.weekStatus_${w.status}`)}
                    </Badge>
                    {can("action:camp.week-open") && w.status === "OPEN" && (
                      <Button size="compact-xs" variant="subtle" color="gray" loading={update.isPending && update.variables?.id === w.id} data-week-close={w.id} onClick={() => void setStatus(w.id, w.name, "CLOSED")}>
                        {t("camp.closeWeek")}
                      </Button>
                    )}
                    {/* 🔑 TASK-586 — the way BACK. A closed week could be closed and never reopened from this screen, and
                        the server restores it exactly, so the door belongs here on the same key. */}
                    {can("action:camp.week-open") && w.status === "CLOSED" && (
                      <Button size="compact-xs" variant="subtle" color="teal" loading={update.isPending && update.variables?.id === w.id} data-week-open={w.id} onClick={() => void setStatus(w.id, w.name, "OPEN")}>
                        {t("camp.openWeekBack")}
                      </Button>
                    )}
                    {/* ⚠️ Delete is offered only where it can plausibly succeed (no children counted on any day) — but
                        🔑 that is a CONVENIENCE: the server counts at the act and its refusal is the guard. */}
                    {can("action:camp.week-open") && kids === 0 && (
                      <Button size="compact-xs" variant="subtle" color="red" data-week-delete={w.id} onClick={() => { setRefusal(null); setConfirmDelete({ id: w.id, name: w.name }); }}>
                        {t("camp.deleteWeek")}
                      </Button>
                    )}
                    <Button size="compact-xs" variant="light" onClick={() => setSelected(selected === w.id ? null : w.id)}>
                      {selected === w.id ? t("camp.hideRoster") : t("camp.roster")}
                    </Button>
                  </Group>
                </Group>
                {selected === w.id && (
                  <div className="mt-3 border-t border-muted-200 pt-3">
                    <WeekRoster weekId={w.id} weeks={weeks} />
                  </div>
                )}
              </Card>
            );
          })}
        </Stack>
      )}

      {openOpen && <OpenWeekDialog opened={openOpen} week={null} onClose={() => setOpenOpen(false)} />}

      {/* 🔴 TASK-586 — the delete confirm. The refusal lives HERE, not in a toast: it is the answer to the question the
          admin just asked, it names the number of bookings, and it tells them to use Close instead. */}
      <Modal opened={confirmDelete !== null} onClose={() => { setConfirmDelete(null); setRefusal(null); }} centered title={t("camp.deleteWeekTitle", { name: confirmDelete?.name ?? "" })}>
        <Stack gap="sm">
          {refusal && (
            <Alert color="orange" variant="light" icon={<Info size={16} />} data-delete-refusal>
              {refusal}
            </Alert>
          )}
          <Text fz="sm">{t("camp.deleteWeekBody")}</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => { setConfirmDelete(null); setRefusal(null); }}>
              {t("common.cancel")}
            </Button>
            <Button color="red" loading={remove.isPending} data-delete-confirm onClick={() => void doDelete()}>
              {t("camp.deleteWeekConfirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
