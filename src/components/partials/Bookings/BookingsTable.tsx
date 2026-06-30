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

type DateRange = "ALL" | "TODAY" | "WEEK" | "MONTH";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "ALL", label: "ทุกช่วงเวลา" },
  { value: "TODAY", label: "วันนี้" },
  { value: "WEEK", label: "สัปดาห์นี้" },
  { value: "MONTH", label: "เดือนนี้" },
];

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

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.nickname ?? "-";

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
          กำลังโหลด...
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label="ค้นชื่อนักเรียน"
          placeholder="พิมพ์ชื่อ..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<Search size={16} />}
          size="sm"
          className="min-w-52 flex-1"
        />
        <Select
          label="สถานะ"
          size="sm"
          className="max-w-44"
          value={statusFilter}
          onChange={(v) => setStatusFilter((v || "ALL") as BookingStatus | "ALL")}
          allowDeselect={false}
          data={[
            { value: "ALL", label: "ทุกสถานะ" },
            ...(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => ({
              value: s,
              label: BOOKING_STATUS_LABEL[s],
            })),
          ]}
        />
        <Select
          label="ครู"
          size="sm"
          className="max-w-40"
          value={teacherFilter}
          onChange={(v) => setTeacherFilter(v || "ALL")}
          allowDeselect={false}
          data={[{ value: "ALL", label: "ครูทุกคน" }, ...teacherSelectData(teachers)]}
          renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
        />
        <Select
          label="รูปแบบ"
          size="sm"
          className="max-w-40"
          value={typeFilter}
          onChange={(v) => setTypeFilter((v || "ALL") as BookingType | "ALL")}
          allowDeselect={false}
          data={[{ key: "ALL", label: "ทุกรูปแบบ" }, ...BOOKING_TYPE_OPTIONS].map((o) => ({
            value: o.key,
            label: o.label,
          }))}
        />
        <Select
          label="ช่วงวันที่"
          size="sm"
          className="max-w-40"
          value={dateRange}
          onChange={(v) => setDateRange((v || "ALL") as DateRange)}
          allowDeselect={false}
          data={DATE_RANGE_OPTIONS}
        />
      </div>

      <p className="text-xs text-default-400">พบ {rows.length} รายการ</p>

      <Table highlightOnHover verticalSpacing="sm" withTableBorder aria-label="รายการการจอง">
        <Table.Thead className="bg-default-100">
          <Table.Tr className="text-xs uppercase tracking-wide text-default-500">
            <Table.Th>นักเรียน</Table.Th>
            <Table.Th>วิชา</Table.Th>
            <Table.Th>ครู</Table.Th>
            <Table.Th>วันที่</Table.Th>
            <Table.Th>เวลา</Table.Th>
            <Table.Th>รูปแบบ</Table.Th>
            <Table.Th>สถานะ</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7} className="text-center text-sm text-default-400">
                ไม่พบรายการที่ตรงเงื่อนไข
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
