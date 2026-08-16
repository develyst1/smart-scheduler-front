"use client";

import { useEffect, useState } from "react";
import { Combobox, InputBase, Loader, useCombobox } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEligibleStudents } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import { eligibleLabel, entKey, type EligibleType } from "@/lib/scheduler/eligible";

interface Props {
  type: EligibleType;
  /** The selected **entitlement** key (courseId / voucherId) — not a student id. */
  value: string | null;
  onChange: (entKey: string | null) => void;
  label?: string;
  required?: boolean;
}

/**
 * Course / Voucher student picker — SPEC-039 (REQ-043).
 *
 * The sibling of `StudentSelect`: same single-`Combobox` shape (one field, type-to-filter, results in
 * that same field) so all four booking tabs read as one control. Two things it deliberately keeps from
 * the two-box version it replaces:
 *  - the search is **server-side** (`useEligibleStudents`'s `q`, TASK-088/REQ-024) — Mantine's local
 *    `searchable` cannot match a **parent phone**, which never appears in the option label;
 *  - the option identity is the **entitlement** (`entKey`), so a student with two courses stays two
 *    distinguishable rows (REQ-029, AC-3).
 *
 * No add-new option: a student with no entitlement cannot be booked on these tabs.
 */
export default function EligibleStudentSelect({ type, value, onChange, label, required }: Props) {
  const t = useT();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const q = debounced.trim() || undefined;
  const { data: eligible = [], isFetching } = useEligibleStudents(type, true, q);

  // The parent clears the selection when the tab changes (or on reset) — follow it, so the field never
  // shows the label of an entitlement that is no longer selected.
  useEffect(() => {
    if (value === null) setSearch("");
  }, [value]);

  const handleType = (v: string) => {
    setSearch(v);
    combobox.openDropdown();
    combobox.updateSelectedOptionIndex();
    // Typing past a chosen row means the choice is being replaced — don't leave a stale entitlement
    // selected behind a search string that no longer describes it.
    if (value) onChange(null);
  };

  const handleSubmit = (val: string) => {
    const row = eligible.find((e) => entKey(e, type) === val);
    if (row) {
      setSearch(eligibleLabel(row, type, eligible));
      onChange(val);
    }
    combobox.closeDropdown();
  };

  const options = eligible.map((e) => {
    const key = entKey(e, type);
    return (
      <Combobox.Option value={key} key={key} active={key === value}>
        {eligibleLabel(e, type, eligible)}
      </Combobox.Option>
    );
  });

  // Never a silently blank dropdown: "nothing matched what you typed" and "nobody is eligible at all"
  // are different facts and staff need to be told which one they are looking at.
  const emptyMessage = search.trim()
    ? t("booking.noMatchStudent")
    : t(type === "COURSE_PACKAGE" ? "booking.noCourseStudents" : "booking.noVoucherStudents");

  return (
    <Combobox store={combobox} onOptionSubmit={handleSubmit}>
      <Combobox.Target>
        <InputBase
          label={label ?? t("booking.student")}
          required={required}
          component="input"
          value={search}
          onChange={(e) => handleType(e.currentTarget.value)}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          placeholder={t("booking.eligibleSearchPlaceholder")}
          rightSection={isFetching ? <Loader size={14} /> : <Combobox.Chevron />}
          rightSectionPointerEvents="none"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options}
          {!options.length && (
            <Combobox.Empty>{isFetching ? t("common.loading") : emptyMessage}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
