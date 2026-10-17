"use client";

import { useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { Loader, Modal, Select, Table, Text } from "@mantine/core";
import { useNvrDetail, useTeachers } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import type { NvrBucket, NvrDetailRow, SomQuery } from "@/types/app/som";

type Column =
  | "student"
  | "package"
  | "courseTeacher"
  | "trialTeacher"
  | "trialDate"
  | "date"
  | "remark";

// Which columns each card's table shows, left → right.
const COLUMNS: Record<NvrBucket, Column[]> = {
  firstTrial: ["student", "trialDate", "trialTeacher", "remark"],
  newCourseThisMonth: [
    "student",
    "package",
    "courseTeacher",
    "trialTeacher",
    "trialDate",
    "date",
    "remark",
  ],
  newCoursePrevMonth: [
    "student",
    "package",
    "courseTeacher",
    "trialTeacher",
    "trialDate",
    "date",
    "remark",
  ],
  renewCourse: ["student", "package", "courseTeacher", "date", "remark"],
  trialNotConverted: ["student", "trialDate", "trialTeacher", "remark"],
  notRenewed: ["student", "package", "courseTeacher", "date", "remark"],
};

const isNewCourse = (b: NvrBucket) =>
  b === "newCourseThisMonth" || b === "newCoursePrevMonth";

export function NvrDetailModal({
  bucket,
  query,
  onClose,
}: {
  bucket: NvrBucket | null;
  query: SomQuery;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const { data: rows = [], isLoading } = useNvrDetail(bucket, query);
  const { data: teachers = [] } = useTeachers();
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const teacherName = (id?: string | null) => {
    if (!id) return t("common.none");
    const tc = teachers.find((x) => x.id === id);
    return tc ? tc.nickname || tc.name : t("common.none");
  };
  const fmtDate = (d?: string | null) =>
    d ? dayjs(d).locale(lang).format("D MMM YYYY") : t("common.none");

  const close = () => {
    setTeacherId(null);
    onClose();
  };

  if (!bucket) return null;
  const cols = COLUMNS[bucket];
  // New Course: one teacher filter matches either the course teacher or the 1st-Trial teacher.
  const shown =
    isNewCourse(bucket) && teacherId
      ? rows.filter(
          (r) =>
            r.courseTeacherId === teacherId || r.trialTeacherId === teacherId,
        )
      : rows;

  const cell = (r: NvrDetailRow, c: Column) => {
    switch (c) {
      case "student":
        return <span className="font-medium">{r.studentName}</span>;
      case "package":
        return r.packageLabel || t("common.none");
      case "courseTeacher":
        return teacherName(r.courseTeacherId);
      case "trialTeacher":
        return teacherName(r.trialTeacherId);
      case "trialDate":
        return fmtDate(r.trialDate);
      case "date":
        return fmtDate(r.date);
      case "remark":
        return (
          <span className="whitespace-pre-wrap">
            {r.remark || t("common.none")}
          </span>
        );
    }
  };

  return (
    <Modal opened onClose={close} title={t(`som.nvr.${bucket}`)} size="xl">
      {isNewCourse(bucket) && (
        <Select
          className="mb-3 max-w-xs"
          label={t("som.nvrTeacherFilter")}
          placeholder={t("som.nvrAllTeachers")}
          data={teachers.map((tc) => ({
            value: tc.id,
            label: tc.nickname || tc.name,
          }))}
          value={teacherId}
          onChange={setTeacherId}
          clearable
          searchable
        />
      )}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader size="sm" />
        </div>
      ) : (
        // On error (e.g. the endpoint isn't live yet) `rows` stays [] — still draw the table so the
        // columns are visible, with the empty-state row inside it.
        <>
          <Text size="xs" c="dimmed" mb="xs">
            {t("som.nvrRowCount", { n: shown.length })}
          </Text>
          <Table.ScrollContainer type="native" minWidth={cols.length * 120}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={44} ta="right">
                    #
                  </Table.Th>
                  {cols.map((c) => (
                    <Table.Th key={c} miw={c === "remark" ? 200 : undefined}>
                      {t(colLabelKey(bucket, c))}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shown.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={cols.length + 1}>
                      <Text size="sm" c="dimmed" ta="center">
                        {t("som.noData")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  shown.map((r, i) => (
                    <Table.Tr key={`${r.studentId}-${i}`}>
                      <Table.Td
                        ta="right"
                        className="tabular-nums text-muted-400"
                      >
                        {i + 1}
                      </Table.Td>
                      {cols.map((c) => (
                        <Table.Td key={c}>{cell(r, c)}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Modal>
  );
}

// The "date" column means something different per card (opened / renewed / ended).
function colLabelKey(bucket: NvrBucket, c: Column) {
  if (c !== "date") return `som.nvrCol.${c}`;
  if (bucket === "renewCourse") return "som.nvrCol.renewedDate";
  if (bucket === "notRenewed") return "som.nvrCol.endedDate";
  return "som.nvrCol.openedDate";
}
