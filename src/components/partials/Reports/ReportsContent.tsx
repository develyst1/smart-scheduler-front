"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Card, CardBody, Input, Spinner } from "@heroui/react";
import { Users, CheckCircle2, CalendarOff, Clock } from "lucide-react";
import { BookingTypeChip } from "@/components/common/BookingBadges";
import { useDailyReport } from "@/hooks/scheduler";

const STAT_CARDS = [
  { key: "totalBooked", label: "ลงเรียนทั้งหมด", icon: Users, color: "text-primary" },
  { key: "attended", label: "มาเรียนจริง", icon: CheckCircle2, color: "text-success" },
  { key: "onLeave", label: "ลา/ป่วย", icon: CalendarOff, color: "text-default-500" },
  { key: "pending", label: "รอยืนยัน", icon: Clock, color: "text-warning" },
] as const;

export default function ReportsContent() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const { data: report, isLoading } = useDailyReport(date);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Input
          type="date"
          label="เลือกวันที่"
          size="sm"
          className="max-w-52"
          value={date}
          onValueChange={setDate}
        />
      </div>

      {isLoading || !report ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="กำลังสรุปยอด..." />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STAT_CARDS.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.key} shadow="sm">
                  <CardBody className="flex flex-row items-center gap-4">
                    <span className={`${s.color}`}>
                      <Icon size={28} />
                    </span>
                    <div>
                      <p className="text-2xl font-bold">{report[s.key]}</p>
                      <p className="text-xs text-default-400">{s.label}</p>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          <Card shadow="sm">
            <CardBody className="gap-3">
              <p className="text-sm font-semibold">แยกตามรูปแบบการจอง</p>
              <div className="flex flex-wrap gap-4">
                {report.byBookingType.map((item) => (
                  <div
                    key={item.type}
                    className="flex items-center gap-2 rounded-xl border border-default-100 px-4 py-3"
                  >
                    <BookingTypeChip type={item.type} size="md" />
                    <span className="text-lg font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
