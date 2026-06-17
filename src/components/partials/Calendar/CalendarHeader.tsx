"use client";

import dayjs from "dayjs";
import { Button } from "@heroui/react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { StatusChip } from "@/components/common/BookingBadges";
import { STATUS_LEGEND } from "./Calendar.config";

interface Props {
  date: string;
  onChangeDate: (date: string) => void;
}

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export default function CalendarHeader({ date, onChangeDate }: Props) {
  const d = dayjs(date);
  const shift = (n: number) => onChangeDate(d.add(n, "day").format("YYYY-MM-DD"));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button isIconOnly variant="flat" onPress={() => shift(-1)} aria-label="วันก่อนหน้า">
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-56 text-center">
          <p className="text-base font-semibold">
            วัน{THAI_DAYS[d.day()]} ที่ {d.format("D MMM")} {d.year() + 543}
          </p>
          <p className="text-xs text-default-400">{date}</p>
        </div>
        <Button isIconOnly variant="flat" onPress={() => shift(1)} aria-label="วันถัดไป">
          <ChevronRight size={18} />
        </Button>
        <Button
          variant="light"
          size="sm"
          startContent={<CalendarDays size={16} />}
          onPress={() => onChangeDate(dayjs().format("YYYY-MM-DD"))}
        >
          วันนี้
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_LEGEND.map((l) => (
          <StatusChip key={l.status} status={l.status} />
        ))}
      </div>
    </div>
  );
}
