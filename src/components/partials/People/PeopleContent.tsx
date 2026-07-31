"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Card,
  TextInput,
  Button,
  Group,
  Stack,
  Loader,
  Pagination,
  Badge,
  Text,
  Modal,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Search, UserPlus, Pencil, Ban, CircleCheck, Baby, Phone, MapPin } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useParents, useSetParentSuspended } from "@/hooks/scheduler";
import { THAI_NATIONALITY, type Parent, type Student } from "@/types/app/people";
import ParentFormModal from "./ParentFormModal";
import StudentFormModal from "./StudentFormModal";

const PAGE_SIZE = 20;

export default function PeopleContent() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [debounced]);

  const query = useMemo(
    () => ({ q: debounced.trim() || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [debounced, page],
  );
  const { data, isLoading } = useParents(query);
  const parents = data?.parents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const suspend = useSetParentSuspended();

  const [parentModal, setParentModal] = useState<{ open: boolean; parent: Parent | null }>({
    open: false,
    parent: null,
  });
  const [studentModal, setStudentModal] = useState<{ open: boolean; parentId: string; student: Student | null }>({
    open: false,
    parentId: "",
    student: null,
  });
  const [suspendTarget, setSuspendTarget] = useState<{ parent: Parent; suspend: boolean } | null>(null);

  const genderLabel = (g: string | null) =>
    g === "male"
      ? t("people.genderMale")
      : g === "female"
        ? t("people.genderFemale")
        : g === "other"
          ? t("people.genderOther")
          : null;

  const studentMeta = (s: Student): string => {
    const parts: string[] = [];
    const gl = genderLabel(s.gender);
    if (gl) parts.push(gl);
    if (s.birthDate) {
      const age = dayjs().diff(dayjs(s.birthDate), "year");
      if (age >= 0 && age < 130) parts.push(t("people.age", { n: age }));
    }
    if (s.nationality) parts.push(s.nationality === THAI_NATIONALITY ? t("people.natThai") : s.nationality);
    return parts.join(" · ");
  };

  const runSuspend = async () => {
    if (!suspendTarget) return;
    const { parent, suspend: doSuspend } = suspendTarget;
    setSuspendTarget(null);
    try {
      await suspend.mutateAsync({ id: parent.id, suspended: doSuspend });
      notify({
        title: doSuspend ? t("people.suspendedOk") : t("people.unsuspendedOk"),
        description: parent.name || parent.phone,
        color: doSuspend ? "warning" : "success",
      });
    } catch (e) {
      notify({
        title: t("common.error"),
        description: e instanceof ApiClientError ? e.message : undefined,
        color: "danger",
      });
    }
  };

  return (
    <Stack gap="md">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("people.title")}</h1>
          <p className="max-w-2xl text-sm text-default-500">{t("people.subtitle")}</p>
        </div>
        <Button leftSection={<UserPlus size={16} />} onClick={() => setParentModal({ open: true, parent: null })}>
          {t("people.addParent")}
        </Button>
      </div>

      <TextInput
        placeholder={t("people.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        leftSection={<Search size={16} />}
        className="max-w-xl"
      />

      {isLoading ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      ) : parents.length === 0 ? (
        <Card padding="xl">
          <Text ta="center" c="dimmed" size="sm">
            {debounced.trim() ? t("people.noMatch") : t("people.empty")}
          </Text>
        </Card>
      ) : (
        <>
          <p className="text-xs text-default-400">{t("people.found", { count: total })}</p>
          <Stack gap="sm">
            {parents.map((p) => {
              const suspended = !!p.suspendedAt;
              return (
                <Card key={p.id} padding="lg" withBorder className={suspended ? "opacity-80" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{p.name || t("people.parentName")}</p>
                        {suspended && (
                          <Badge color="red" variant="light" leftSection={<Ban size={12} />}>
                            {t("people.suspendedBadge")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-default-500">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {p.phone}
                        </span>
                        {p.province && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {p.province}
                          </span>
                        )}
                      </div>
                    </div>

                    <Group gap="xs">
                      <Button
                        size="compact-sm"
                        variant="light"
                        color="gray"
                        leftSection={<Pencil size={13} />}
                        onClick={() => setParentModal({ open: true, parent: p })}
                      >
                        {t("people.edit")}
                      </Button>
                      <Button
                        size="compact-sm"
                        variant="light"
                        leftSection={<Baby size={13} />}
                        onClick={() => setStudentModal({ open: true, parentId: p.id, student: null })}
                      >
                        {t("people.addStudent")}
                      </Button>
                      {suspended ? (
                        <Button
                          size="compact-sm"
                          variant="light"
                          color="green"
                          leftSection={<CircleCheck size={13} />}
                          onClick={() => setSuspendTarget({ parent: p, suspend: false })}
                        >
                          {t("people.unsuspend")}
                        </Button>
                      ) : (
                        <Button
                          size="compact-sm"
                          variant="light"
                          color="red"
                          leftSection={<Ban size={13} />}
                          onClick={() => setSuspendTarget({ parent: p, suspend: true })}
                        >
                          {t("people.suspend")}
                        </Button>
                      )}
                    </Group>
                  </div>

                  {/* Students underneath */}
                  <div className="mt-3 border-t border-default-100 pt-3">
                    {p.students.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        {t("people.noStudents")}
                      </Text>
                    ) : (
                      <Stack gap={6}>
                        {p.students.map((s) => {
                          const meta = studentMeta(s);
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-sm font-medium">{s.nickname || s.name}</span>
                                {s.nickname && s.name !== s.nickname && (
                                  <span className="ml-1.5 text-xs text-default-400">{s.name}</span>
                                )}
                                {meta && <span className="ml-2 text-xs text-default-400">· {meta}</span>}
                              </div>
                              <Tooltip label={t("people.edit")} withinPortal>
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  aria-label={t("people.edit")}
                                  onClick={() =>
                                    setStudentModal({ open: true, parentId: p.id, student: s })
                                  }
                                >
                                  <Pencil size={15} />
                                </ActionIcon>
                              </Tooltip>
                            </div>
                          );
                        })}
                      </Stack>
                    )}
                  </div>
                </Card>
              );
            })}
          </Stack>

          {totalPages > 1 && (
            <Group justify="flex-end" pt="xs">
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" radius="md" />
            </Group>
          )}
        </>
      )}

      <ParentFormModal
        opened={parentModal.open}
        parent={parentModal.parent}
        onClose={() => setParentModal({ open: false, parent: null })}
      />
      <StudentFormModal
        opened={studentModal.open}
        parentId={studentModal.parentId}
        student={studentModal.student}
        onClose={() => setStudentModal({ open: false, parentId: "", student: null })}
      />

      <Modal
        opened={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        centered
        title={suspendTarget?.suspend ? t("people.suspendTitle") : t("people.unsuspendTitle")}
      >
        {suspendTarget && (
          <Stack gap="lg">
            <Text size="sm">
              {suspendTarget.suspend ? t("people.suspendBody") : t("people.unsuspendBody")}
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={() => setSuspendTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                color={suspendTarget.suspend ? "red" : "green"}
                leftSection={suspendTarget.suspend ? <Ban size={15} /> : <CircleCheck size={15} />}
                loading={suspend.isPending}
                onClick={runSuspend}
              >
                {suspendTarget.suspend ? t("people.suspend") : t("people.unsuspend")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
