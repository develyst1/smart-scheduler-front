"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Table, Select, Loader, TextInput, Card, Pagination, Group } from "@mantine/core";
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

const inRange = (date: string, range: DateRange) => {
  if (range === "ALL") return true;
  const d = dayjs(date);
  const now = dayjs();
  if (range === "TODAY") return d.isSame(now, "day");
  if (range === "MONTH") return d.isSame(now, "month");
  // WEEK (อา–ส)
  const start = now.day(0).startOf("day");
  const end = now.day(6).endOf("day");
  return (d.isAfter(start) || d.isSame(start)) && (d.isBefore(end) || d.isSame(end));
};

export default function BookingsTable() {
  const t = useT();
  const { data: bookings = [], isLoading } = useAllBookings();
  const { data: teachers = [] } = useTeachers();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<BookingType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL">("ALL");
  const [teacherFilter, setTeacherFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("ALL");

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // กลับไปหน้า 1 เมื่อเปลี่ยนเงื่อนไขกรอง
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter, teacherFilter, dateRange]);

  const teacherName = (id: string) => teachers.find((tc) => tc.id === id)?.nickname ?? "-";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...bookings]
      .filter((b) => !b.pendingSlot)
      .filter((b) => (q ? b.studentName.toLowerCase().includes(q) : true))
      .filter((b) => typeFilter === "ALL" || b.bookingType === typeFilter)
      .filter((b) => statusFilter === "ALL" || b.status === statusFilter)
      .filter((b) => teacherFilter === "ALL" || b.teacherId === teacherFilter)
      .filter((b) => inRange(b.date, dateRange))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [bookings, search, typeFilter, statusFilter, teacherFilter, dateRange]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          data={(Object.keys(DATE_RANGE_KEYS) as DateRange[]).map((r) => ({
            value: r,
            label: t(DATE_RANGE_KEYS[r]),
          }))}
        />
      </div>

      <p className="text-xs text-default-400">{t("bookings.found", { count: rows.length })}</p>

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
            pageRows.map((b) => (
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

      <Group justify="flex-end" pt="xs">
        <Pagination total={totalPages} value={page} onChange={setPage} size="sm" radius="md" />
      </Group>
    </Card>
  );
}
