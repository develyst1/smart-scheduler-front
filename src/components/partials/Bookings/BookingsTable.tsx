"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Select, Loader, TextInput, Card, Pagination, Group } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Search } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { useAllBookings, useTeachers } from "@/hooks/scheduler";
import type { BookingStatus, BookingType } from "@/types/app/scheduler";
import { BOOKING_STATUS_LABEL } from "@/types/app/scheduler";
import { BOOKING_TYPE_OPTIONS } from "@/components/partials/Calendar/Calendar.config";
import { useT } from "@/lib/i18n";

type DateRange = "ALL" | "TODAY" | "WEEK" | "MONTH";

const DATE_RANGE_KEYS: Record<DateRange, string> = {
  ALL: "bookings.rangeAll",
  TODAY: "bookings.rangeToday",
  WEEK: "bookings.rangeWeek",
  MONTH: "bookings.rangeMonth",
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  // กลับไปหน้า 1 เมื่อเปลี่ยนเงื่อนไขกรอง/จำนวนต่อหน้า
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter, teacherFilter, dateRange, pageSize]);

  const query = useMemo(() => {
    const { from, to } = rangeToDates(dateRange);
    return {
      q: debouncedSearch.trim() || undefined,
      type: typeFilter === "ALL" ? undefined : typeFilter,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      teacherId: teacherFilter === "ALL" ? undefined : teacherFilter,
      from,
      to,
      page,
      limit: pageSize,
    };
  }, [debouncedSearch, typeFilter, statusFilter, teacherFilter, dateRange, page, pageSize]);

  const { data, isLoading } = useAllBookings(query);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const teacherName = (id: string) => teachers.find((tc) => tc.id === id)?.nickname ?? "-";

  if (isLoading) {
    return (
      <Card padding="lg">
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label={t("bookings.searchStudent")}
          placeholder={t("bookings.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<Search size={16} />}
          size="sm"
          className="min-w-52 flex-1"
        />
        <Select
          label={t("bookings.status")}
          size="sm"
          className="max-w-44"
          value={statusFilter}
          onChange={(v) => setStatusFilter((v || "ALL") as BookingStatus | "ALL")}
          allowDeselect={false}
          searchable
          data={[
            { value: "ALL", label: t("bookings.allStatuses") },
            ...(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => ({
              value: s,
              label: t(`bookingStatus.${s}`),
            })),
          ]}
        />
        <Select
          label={t("bookings.teacher")}
          size="sm"
          className="max-w-40"
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
          className="max-w-40"
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
          className="max-w-40"
          value={dateRange}
          onChange={(v) => setDateRange((v || "ALL") as DateRange)}
          allowDeselect={false}
          searchable
          data={(Object.keys(DATE_RANGE_KEYS) as DateRange[]).map((r) => ({
            value: r,
            label: t(DATE_RANGE_KEYS[r]),
          }))}
        />
      </div>

      <p className="text-xs text-default-400">{t("bookings.found", { count: total })}</p>

      <Table highlightOnHover verticalSpacing="sm" withTableBorder aria-label={t("bookings.tableLabel")}>
        <Table.Thead className="bg-default-100">
          <Table.Tr className="text-xs uppercase tracking-wide text-default-500">
            <Table.Th>{t("bookings.colStudent")}</Table.Th>
            <Table.Th>{t("bookings.colSubject")}</Table.Th>
            <Table.Th>{t("bookings.colTeacher")}</Table.Th>
            <Table.Th>{t("bookings.colDate")}</Table.Th>
            <Table.Th>{t("bookings.colTime")}</Table.Th>
            <Table.Th>{t("bookings.colType")}</Table.Th>
            <Table.Th>{t("bookings.colStatus")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7} className="text-center text-sm text-default-400">
                {t("bookings.noMatch")}
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td className="font-medium">{b.studentName}</Table.Td>
                <Table.Td>{b.subject}</Table.Td>
                <Table.Td>{teacherName(b.teacherId)}</Table.Td>
                <Table.Td>{b.date}</Table.Td>
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
        <Pagination total={totalPages} value={page} onChange={setPage} size="sm" radius="md" />
      </Group>
    </Card>
  );
}
