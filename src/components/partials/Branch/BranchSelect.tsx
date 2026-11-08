"use client";

import { Select, type SelectProps } from "@mantine/core";
import { useT } from "@/lib/i18n";
import type { Branch } from "@/types/api/contract";
import { BRANCH_LIVE } from "./config";

export const BRANCHES: readonly Branch[] = ["BRAVO", "OTHER"];
/** The branch every booking, course and voucher has unless the admin says otherwise. */
export const DEFAULT_BRANCH: Branch = "BRAVO";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  /** `null` only where the current branch is not known (the whole-course control, until the plan reader sends it). */
  value: Branch | null;
  onChange: (b: Branch) => void;
  /** The ship gate (`BRANCH_LIVE`). Only a test passes it; callers leave it out. */
  live?: boolean;
}

/**
 * The Branch field (TASK-898): "Branch" / สาขา, options Bravo / Other (อื่นๆ), default Bravo, no empty choice once one is picked.
 * 🔴 SHIP GATE: with `BRANCH_LIVE` false this renders nothing (so no field can show before the server stores it).
 */
export default function BranchSelect({ value, onChange, live = BRANCH_LIVE, label, ...rest }: Props) {
  const t = useT();
  if (!live) return null;
  return (
    <Select
      label={label ?? t("branch.label")}
      data={BRANCHES.map((b) => ({ value: b, label: t(`branch.${b}`) }))}
      value={value}
      onChange={(v) => v && onChange(v as Branch)}
      allowDeselect={false}
      {...rest}
    />
  );
}
