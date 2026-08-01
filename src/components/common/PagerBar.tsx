"use client";

import { Group, Pagination } from "@mantine/core";

/** The single pagination control used by all three Bookings tabs (courses / vouchers / all-bookings),
 *  which now share TASK-070's `{ items, page, limit, total }` envelope. Renders nothing on a single page. */
export default function PagerBar({
  total,
  page,
  limit,
  onPage,
}: {
  total: number;
  page: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <Group justify="center" pt="sm">
      <Pagination total={totalPages} value={page} onChange={onPage} size="sm" radius="md" />
    </Group>
  );
}
