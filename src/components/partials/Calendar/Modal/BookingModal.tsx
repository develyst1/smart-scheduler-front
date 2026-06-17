"use client";

import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Select,
  SelectItem,
  Input,
  Divider,
  addToast,
} from "@heroui/react";
import { BadgeCheck, CalendarX2, Bell } from "lucide-react";
import { BookingTypeChip, StatusChip } from "@/components/common/BookingBadges";
import {
  useConfirmBooking,
  useCreateBooking,
  useMarkAttended,
  useMarkSickLeave,
} from "@/hooks/scheduler";
import type { Booking, BookingType, Teacher } from "@/types/app/scheduler";
import { TIME_SLOTS } from "@/types/app/scheduler";
import { BOOKING_TYPE_OPTIONS } from "../Calendar.config";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  booking?: Booking;
  createSlot?: { teacherId: string; time: string; date: string };
  teachers: Teacher[];
}

export default function BookingModal({ isOpen, onClose, booking, createSlot, teachers }: Props) {
  const isCreate = !booking;
  const teacher = teachers.find((t) => t.id === (booking?.teacherId ?? createSlot?.teacherId));

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        {isCreate && createSlot ? (
          <CreateForm createSlot={createSlot} teachers={teachers} onClose={onClose} />
        ) : booking ? (
          <ViewBooking booking={booking} teacherName={teacher?.name ?? "-"} onClose={onClose} />
        ) : null}
      </ModalContent>
    </Modal>
  );
}

// ───────────────────────── View / actions ─────────────────────────

function ViewBooking({
  booking,
  teacherName,
  onClose,
}: {
  booking: Booking;
  teacherName: string;
  onClose: () => void;
}) {
  const confirm = useConfirmBooking();
  const attended = useMarkAttended();
  const sickLeave = useMarkSickLeave();

  const handleConfirm = async () => {
    await confirm.mutateAsync(booking.id);
    addToast({
      title: "ยืนยันตารางแล้ว",
      description: "ส่งแจ้งเตือนทันทีผ่าน Line ไปยังครู/ผู้เกี่ยวข้อง",
      color: "primary",
    });
    onClose();
  };

  const handleSickLeave = async () => {
    const res = await sickLeave.mutateAsync(booking.id);
    if (res.locked) {
      addToast({
        title: "ลาเกินโควตา — ล็อกการเลื่อนตาราง",
        description: "นักเรียนใช้สิทธิ์การลาครบแล้ว ต้องให้แอดมินปลดล็อกที่หน้า การจอง/นักเรียน",
        color: "danger",
      });
    } else if (res.extended) {
      addToast({
        title: "บันทึกการลาแล้ว",
        description: `สร้างคาบเรียนชดเชยอัตโนมัติในสัปดาห์ถัดไป (${res.extended.date})`,
        color: "success",
      });
    } else {
      addToast({ title: "บันทึกการลาแล้ว", color: "default" });
    }
    onClose();
  };

  const handleAttended = async () => {
    await attended.mutateAsync(booking.id);
    addToast({ title: "บันทึกการเข้าเรียนแล้ว", color: "success" });
    onClose();
  };

  return (
    <>
      <ModalHeader className="flex flex-col gap-1">
        <span>{booking.studentName}</span>
        <div className="flex items-center gap-2">
          <StatusChip status={booking.status} />
          <BookingTypeChip type={booking.bookingType} />
        </div>
      </ModalHeader>
      <ModalBody>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ครูผู้สอน" value={teacherName} />
          <Field label="วิชา" value={booking.subject} />
          <Field label="วันที่" value={booking.date} />
          <Field label="เวลา" value={`${booking.startTime} - ${booking.endTime}`} />
        </dl>
        {booking.note && (
          <>
            <Divider className="my-3" />
            <p className="text-sm text-default-500">หมายเหตุ: {booking.note}</p>
          </>
        )}
      </ModalBody>
      <ModalFooter className="flex-wrap">
        <Button variant="light" onPress={onClose}>
          ปิด
        </Button>
        <Button
          color="default"
          variant="flat"
          startContent={<CalendarX2 size={16} />}
          isLoading={sickLeave.isPending}
          onPress={handleSickLeave}
        >
          บันทึกลา/ป่วย
        </Button>
        <Button
          color="success"
          variant="flat"
          startContent={<BadgeCheck size={16} />}
          isLoading={attended.isPending}
          onPress={handleAttended}
        >
          มาเรียน
        </Button>
        {booking.status === "PENDING" && (
          <Button
            color="primary"
            startContent={<Bell size={16} />}
            isLoading={confirm.isPending}
            onPress={handleConfirm}
          >
            ยืนยัน + แจ้งเตือน Line
          </Button>
        )}
      </ModalFooter>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-default-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ───────────────────────── Create form ─────────────────────────

function CreateForm({
  createSlot,
  teachers,
  onClose,
}: {
  createSlot: { teacherId: string; time: string; date: string };
  teachers: Teacher[];
  onClose: () => void;
}) {
  const create = useCreateBooking();
  const [studentName, setStudentName] = useState("");
  const [teacherId, setTeacherId] = useState(createSlot.teacherId);
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState(createSlot.time);
  const [bookingType, setBookingType] = useState<BookingType>("SINGLE_SESSION");

  const valid = studentName.trim() && subject.trim() && teacherId && startTime;

  const handleSubmit = async () => {
    if (!valid) return;
    await create.mutateAsync({
      studentName: studentName.trim(),
      teacherId,
      subject: subject.trim(),
      date: createSlot.date,
      startTime,
      bookingType,
    });
    addToast({ title: "สร้างการจองแล้ว", description: "สถานะ: รอยืนยัน", color: "success" });
    onClose();
  };

  return (
    <>
      <ModalHeader>เพิ่มการจอง · {createSlot.date}</ModalHeader>
      <ModalBody className="gap-4">
        <Input
          label="ชื่อนักเรียน"
          value={studentName}
          onValueChange={setStudentName}
          isRequired
        />
        <Input label="วิชา" value={subject} onValueChange={setSubject} isRequired />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="ครูผู้สอน"
            selectedKeys={[teacherId]}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            {teachers
              .filter((t) => t.active)
              .map((t) => (
                <SelectItem key={t.id}>{t.nickname}</SelectItem>
              ))}
          </Select>
          <Select
            label="เวลา"
            selectedKeys={[startTime]}
            onChange={(e) => setStartTime(e.target.value)}
          >
            {TIME_SLOTS.map((t) => (
              <SelectItem key={t}>{t}</SelectItem>
            ))}
          </Select>
        </div>
        <Select
          label="รูปแบบการจอง"
          selectedKeys={[bookingType]}
          onChange={(e) => setBookingType(e.target.value as BookingType)}
        >
          {BOOKING_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.key}>{o.label}</SelectItem>
          ))}
        </Select>
      </ModalBody>
      <ModalFooter>
        <Button variant="light" onPress={onClose}>
          ยกเลิก
        </Button>
        <Button color="primary" isDisabled={!valid} isLoading={create.isPending} onPress={handleSubmit}>
          บันทึก
        </Button>
      </ModalFooter>
    </>
  );
}
