"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Table,
  Select,
  Loader,
  TextInput,
  Card,
  Group,
  Checkbox,
  Button,
  Modal,
  Badge,
  Stack,
  Text,
  ScrollArea,
  UnstyledButton,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { Search, CheckCheck, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import PagerBar from "@/components/common/PagerBar";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { useAllBookings, useBulkConfirm, useTeachers } from "@/hooks/scheduler";
import { formatDateDisplay } from "@/lib/ui/format";
import type { BookingSort } from "@/services/scheduler.service";
import type { BookingStatus, BookingType } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR } from "@/types/app/scheduler";
import type { BulkConfirmResult } from "@/types/api/contract";
import { BOOKING_TYPE_OPTIONS } from "@/components/partials/Calendar/Calendar.config";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";

type DateRange = "ALL" | "TODAY" | "WEEK" | "MONTH" | "CUSTOM";

const DATE_RANGE_KEYS: Record<DateRange, string> = {
  ALL: "bookings.rangeAll",
  TODAY: "bookings.rangeToday",
  WEEK: "bookings.rangeWeek",
  MONTH: "bookings.rangeMonth",
  CUSTOM: "bookings.rangeCustom",
};

/** แปลง preset ช่วงเวลา → from/to (YYYY-MM-DD) สำหรับส่งเข้า API */
const rangeToDates = (range: DateRange): { from?: string; to?: string } => {
  if (range === "ALL") return {};
  const now = dayjs();
  if (range === "TODAY") {
    const d = now.format("YYYY-MM-DD");
    return { from: d, to: d };
  }
  if (range === "MONTH") {
    return { from: now.startOf("month").format("YYYY-MM-DD"), to: now.endOf("month").format("YYYY-MM-DD") };
  }
  // WEEK (อา–ส)
  return { from: now.day(0).format("YYYY-MM-DD"), to: now.day(6).format("YYYY-MM-DD") };
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export default function BookingsTable() {
  const t = useT();
  const { data: teachers = [] } = useTeachers();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 350);
  const [typeFilter, setTypeFilter] = useState<BookingType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL">("ALL");
  const [teacherFilter, setTeacherFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("ALL");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  // TASK-074 — server-side date order. `upcoming` (the default) opens on the next thing that happens;
  // flipping gives oldest-first. Both are pure sorts: no row is hidden either way.
  const [sort, setSort] = useState<BookingSort>("upcoming");

  // กลับไปหน้า 1 เมื่อเปลี่ยนเงื่อนไขกรอง/จำนวนต่อหน้า/การเรียงลำดับ
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter, teacherFilter, dateRange, customFrom, customTo, pageSize, sort]);

  const query = useMemo(() => {
    const { from, to } =
      dateRange === "CUSTOM"
        ? { from: customFrom ?? undefined, to: customTo ?? undefined }
        : rangeToDates(dateRange);
    return {
      q: debouncedSearch.trim() || undefined,
      type: typeFilter === "ALL" ? undefined : typeFilter,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      teacherId: teacherFilter === "ALL" ? undefined : teacherFilter,
      from,
      to,
      sort,
      page,
      limit: pageSize,
    };
  }, [debouncedSearch, typeFilter, statusFilter, teacherFilter, dateRange, customFrom, customTo, sort, page, pageSize]);

  const { data, isLoading } = useAllBookings(query);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const teacherName = (id: string) => teachers.find((tc) => tc.id === id)?.nickname ?? "-";

  // ── Bulk-confirm (SPEC-011): tick PENDING rows → confirm in one call ──
  const bulk = useBulkConfirm();
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<BulkConfirmResult[] | null>(null);

  // Selection only makes sense within a single page/filter view → clear when the query changes.
  useEffect(() => setSelected([]), [query]);

  const pendingIds = rows.filter((b) => b.status === "PENDING").map((b) => b.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.includes(id));
  const somePendingSelected = selected.length > 0 && !allPendingSelected;

  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllPending = () => setSelected(allPendingSelected ? [] : pendingIds);

  const studentName = (id: string) => rows.find((b) => b.id === id)?.studentName ?? id;

  const handleBulkConfirm = async () => {
    if (selected.length === 0) return;
    try {
      const res = await bulk.mutateAsync(selected);
      setResults(res);
      setSelected([]);
    } catch {
      notify({ title: t("common.error"), color: "danger" });
    }
  };

  const OUTCOME_LABEL: Record<BulkConfirmResult["outcome"], string> = {
    confirmed: t("bookings.bulkOutcomeConfirmed"),
    already_confirmed: t("bookings.bulkOutcomeAlready"),
    skipped: t("bookings.bulkOutcomeSkipped"),
  };
  const OUTCOME_COLOR: Record<BulkConfirmResult["outcome"], string> = {
    confirmed: "green",
    already_confirmed: "blue",
    skipped: "orange",
  };

  if (isLoading) {
    return (
      <Card padding="lg">
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="space-y-3">
      {/* TASK-081 — every control here carries a **min** width, not just a max. A flex item defaults to
          shrinking below its content, and an empty date input has no text to hold it open, so before this the
          two CUSTOM pickers collapsed to ~30px while the text-bearing Selects looked fine. With a min, a row
          that runs out of space **wraps** instead of crushing — which is also what protects the next control
          anyone adds here. Measured: 1280px → all five presets on one line; CUSTOM sends From/To to their own
          line at 176px each; 375px → one control per line, no horizontal overflow. */}
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label={t("bookings.searchStudent")}
          placeholder={t("bookings.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<Search size={16} />}
          size="sm"
          className="min-w-40 flex-1"
        />
        <Select
          label={t("bookings.status")}
          size="sm"
          className="min-w-40 max-w-64"
          value={statusFilter}
          onChange={(v) => setStatusFilter((v || "ALL") as BookingStatus | "ALL")}
          allowDeselect={false}
          searchable
          data={[
            { value: "ALL", label: t("bookings.allStatuses") },
            ...(Object.keys(BOOKING_STATUS_COLOR) as BookingStatus[]).map((s) => ({
              value: s,
              label: t(`bookingStatus.${s}`),
            })),
          ]}
        />
        <Select
          label={t("bookings.teacher")}
          size="sm"
          className="min-w-40 max-w-64"
          value={teacherFilter}
          onChange={(v) => setTeacherFilter(v || "ALL")}
          allowDeselect={false}
          searchable
          data={[{ value: "ALL", label: t("bookings.allTeachers") }, ...teacherSelectData(teachers)]}
          renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
        />
        <Select
          label={t("bookings.type")}
          size="sm"
          className="min-w-40 max-w-64"
          value={typeFilter}
          onChange={(v) => setTypeFilter((v || "ALL") as BookingType | "ALL")}
          allowDeselect={false}
          searchable
          data={[
            { value: "ALL", label: t("bookings.allTypes") },
            ...BOOKING_TYPE_OPTIONS.map((k) => ({ value: k, label: t(`bookingType.${k}`) })),
          ]}
        />
        <Select
          label={t("bookings.dateRange")}
          size="sm"
          className="min-w-40 max-w-64"
          value={dateRange}
          onChange={(v) => setDateRange((v || "ALL") as DateRange)}
          allowDeselect={false}
          searchable
          data={(Object.keys(DATE_RANGE_KEYS) as DateRange[]).map((r) => ({
            value: r,
            label: t(DATE_RANGE_KEYS[r]),
          }))}
        />
        {dateRange === "CUSTOM" && (
          <>
            <DatePickerInput
              label={t("bookings.rangeFrom")}
              size="sm"
              className="min-w-44 max-w-52"
              value={customFrom}
              onChange={setCustomFrom}
              valueFormat="D MMM YYYY"
              clearable
              maxDate={customTo ?? undefined}
              popoverProps={{ withinPortal: true }}
            />
            <DatePickerInput
              label={t("bookings.rangeTo")}
              size="sm"
              className="min-w-44 max-w-52"
              value={customTo}
              onChange={setCustomTo}
              valueFormat="D MMM YYYY"
              clearable
              minDate={customFrom ?? undefined}
              popoverProps={{ withinPortal: true }}
            />
          </>
        )}
      </div>

      <Group justify="space-between" align="center">
        <p className="text-xs text-muted-400">{t("bookings.found", { count: total })}</p>
        {selected.length > 0 && (
          <Button
            size="xs"
            leftSection={<CheckCheck size={15} />}
            loading={bulk.isPending}
            onClick={handleBulkConfirm}
          >
            {t("bookings.bulkConfirmSelected", { n: selected.length })}
          </Button>
        )}
      </Group>

      <StickyScrollArea minWidth={760}>
      <Table highlightOnHover verticalSpacing="sm" withTableBorder aria-label={t("bookings.tableLabel")} className="whitespace-nowrap tabular-nums">
        <Table.Thead className="bg-muted-100">
          <Table.Tr className="text-xs uppercase tracking-wide text-muted-500">
            <Table.Th w={40} data-pin="lead">
              <Checkbox
                aria-label={t("bookings.bulkSelectAll")}
                checked={allPendingSelected}
                indeterminate={somePendingSelected}
                disabled={pendingIds.length === 0}
                onChange={toggleAllPending}
              />
            </Table.Th>
            <Table.Th>{t("bookings.colStudent")}</Table.Th>
            <Table.Th>{t("bookings.colSubject")}</Table.Th>
            <Table.Th>{t("bookings.colTeacher")}</Table.Th>
            {/* The sort lives ON the date column rather than in another select — the filter row is already
                full, and คุณฟีน's "ไม่อึดอัด" is why TASK-071 deferred this in the first place. */}
            <Table.Th>
              <UnstyledButton
                onClick={() => setSort((s) => (s === "upcoming" ? "date_asc" : "upcoming"))}
                aria-label={t(sort === "upcoming" ? "bookings.sortToOldest" : "bookings.sortToUpcoming")}
                className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-500 hover:text-muted-900"
              >
                {t("bookings.colDate")}
                {sort === "upcoming" ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />}
              </UnstyledButton>
            </Table.Th>
            <Table.Th>{t("bookings.colTime")}</Table.Th>
            <Table.Th>{t("bookings.colType")}</Table.Th>
            <Table.Th>{t("bookings.colStatus")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={8} className="text-center text-sm text-muted-400">
                {t("bookings.noMatch")}
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td data-pin="lead">
                  {b.status === "PENDING" && (
                    <Checkbox
                      aria-label={t("bookings.bulkSelectRow")}
                      checked={selected.includes(b.id)}
                      onChange={() => toggleOne(b.id)}
                    />
                  )}
                </Table.Td>
                <Table.Td className="font-medium">{b.studentName}</Table.Td>
                <Table.Td>{b.subject}</Table.Td>
                <Table.Td>{teacherName(b.teacherId)}</Table.Td>
                <Table.Td>{formatDateDisplay(b.date)}</Table.Td>
                <Table.Td>
                  {b.startTime}-{b.endTime}
                </Table.Td>
                <Table.Td>
                  <BookingTypeChip type={b.bookingType} />
                </Table.Td>
                <Table.Td>
                  <StatusChip status={b.status} />
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
      </StickyScrollArea>

      <Group justify="space-between" pt="xs">
        <Select
          aria-label={t("bookings.perPage")}
          size="sm"
          className="w-40 shrink-0"
          value={String(pageSize)}
          onChange={(v) => setPageSize(Number(v) || PAGE_SIZE_OPTIONS[0])}
          allowDeselect={false}
          data={PAGE_SIZE_OPTIONS.map((n) => ({
            value: String(n),
            label: `${n} / ${t("bookings.perPage")}`,
          }))}
        />
        <PagerBar total={total} page={page} limit={pageSize} onPage={setPage} />
      </Group>

      <Modal
        opened={results !== null}
        onClose={() => setResults(null)}
        centered
        title={t("bookings.bulkResultTitle")}
      >
        {results && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {t("bookings.bulkResultSummary", {
                confirmed: results.filter((r) => r.outcome === "confirmed").length,
                already: results.filter((r) => r.outcome === "already_confirmed").length,
                skipped: results.filter((r) => r.outcome === "skipped").length,
              })}
            </Text>
            <ScrollArea.Autosize mah={320}>
              <Stack gap="xs">
                {results.map((r) => (
                  <Group key={r.id} justify="space-between" wrap="nowrap" gap="sm">
                    <div className="min-w-0">
                      <Text size="sm" truncate>
                        {studentName(r.id)}
                      </Text>
                      {r.reason && (
                        <Text size="xs" c="dimmed">
                          {r.reason}
                        </Text>
                      )}
                    </div>
                    <Badge color={OUTCOME_COLOR[r.outcome]} variant="light" className="shrink-0">
                      {OUTCOME_LABEL[r.outcome]}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setResults(null)}>
                {t("common.close")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}
