"use client";

import { useEffect, useRef } from "react";
import type { AttentionLink } from "@/lib/scheduler/attention-link";
import { useEntitlementPlan } from "./useScheduler";

/**
 * 🔴 REQ-132 (TASK-841) — open the plan window an Attention link asks for (`?course=<id>` / `?voucher=<id>`), **once**.
 * 🔑 It asks the SERVER for that plan first and opens only when it LOADS and is the kind the link names — an unknown id, an id of the other kind, or a plan that cannot load opens
 * NOTHING (no crash, no toast: the page just shows as usual). `opened` makes it ONCE, so closing the window never brings it back.
 */
export const useOpenPlanFromLink = (request: AttentionLink | null, open: (id: string) => void) => {
  const plan = useEntitlementPlan(request?.id ?? null, !!request);
  const done = useRef(false);
  useEffect(() => {
    if (!request || done.current || !plan.data) return;
    if (plan.data.kind !== request.kind) return;
    done.current = true;
    open(request.id);
  }, [request?.id, request?.kind, plan.data]); // eslint-disable-line react-hooks/exhaustive-deps
};
