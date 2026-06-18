"use client";

import { useMemo, useState } from "react";
import { Table, Select, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import { getAllBookings } from "@/services/scheduler.service";
import { useTeachers } from "@/hooks/scheduler";
import type { BookingType } from "@/types/app/scheduler";
import { BOOKING_TYPE_OPTIONS } from "@/components/partials/Calendar/Calendar.config";

export default function BookingsTable() {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", "all"],
    queryFn: getAllBookings,
  });
  const { data: teachers = [] } = useTeachers();
  const [typeFilter, setTypeFilter] = useState<BookingType | "ALL">("ALL");

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.nickname ?? "-";

  const rows = useMemo(
    () =>
      [...bookings]
        .filter((b) => typeFilter === "ALL" || b.bookingType === typeFilter)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [bookings, typeFilter],
  );

  if (isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Select
          label="กรองตามรูปแบบ"
          size="sm"
          className="max-w-52"
          value={typeFilter}
          onChange={(v) => setTypeFilter((v || "ALL") as BookingType | "ALL")}
          allowDeselect={false}
          data={[{ key: "ALL", label: "ทั้งหมด" }, ...BOOKING_TYPE_OPTIONS].map((o) => ({
            value: o.key,
            label: o.label,
          }))}
        />
      </div>

      <Table highlightOnHover verticalSpacing="sm" aria-label="รายการการจอง">
        <Table.Thead>
          <Table.Tr>
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
                ไม่มีข้อมูล
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
    </div>
  );
}
