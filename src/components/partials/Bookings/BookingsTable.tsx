"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
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
      <div className="flex h-40 items-center justify-center">
        <Spinner label="กำลังโหลด..." />
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
          selectedKeys={[typeFilter]}
          onChange={(e) => setTypeFilter((e.target.value || "ALL") as BookingType | "ALL")}
        >
          {[{ key: "ALL", label: "ทั้งหมด" }, ...BOOKING_TYPE_OPTIONS].map((o) => (
            <SelectItem key={o.key}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>

      <Table aria-label="รายการการจอง" removeWrapper>
        <TableHeader>
          <TableColumn>นักเรียน</TableColumn>
          <TableColumn>วิชา</TableColumn>
          <TableColumn>ครู</TableColumn>
          <TableColumn>วันที่</TableColumn>
          <TableColumn>เวลา</TableColumn>
          <TableColumn>รูปแบบ</TableColumn>
          <TableColumn>สถานะ</TableColumn>
        </TableHeader>
        <TableBody emptyContent="ไม่มีข้อมูล">
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.studentName}</TableCell>
              <TableCell>{b.subject}</TableCell>
              <TableCell>{teacherName(b.teacherId)}</TableCell>
              <TableCell>{b.date}</TableCell>
              <TableCell>
                {b.startTime}-{b.endTime}
              </TableCell>
              <TableCell>
                <BookingTypeChip type={b.bookingType} />
              </TableCell>
              <TableCell>
                <StatusChip status={b.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
