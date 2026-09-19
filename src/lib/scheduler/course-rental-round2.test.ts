import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";

/**
 * REQ-091 §14 / TASK-391 — rental round 2 on the FE: the paid-upfront / pay-per-session switch at creation
 * (`paidUpfront` in the body, both ways) and the red "remove rental from remaining sessions" on the course card (two
 * taps, no money, by the new key `action:bookings.course-rental`). 🚫 No client rule: the server refuses
 * (`RENTAL_NOT_ON_COURSE`, `404`), the FE shows its sentence and names the count from the response.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const panel = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
const svc = codeOf("src/services/scheduler.service.ts");

describe("§1 — the switch at creation", () => {
  it("Paid upfront / Pay per session beside the tier picker; default paid upfront; `paidUpfront` rides in the body both ways", () => {
    expect(flow).toContain("const [rentalPaidUpfront, setRentalPaidUpfront] = useState(true);");
    expect(flow).toContain('value={rentalPaidUpfront ? "upfront" : "perSession"}');
    expect(flow).toContain('onChange={(v) => setRentalPaidUpfront(v === "upfront")}');
    expect(flow).toContain('{ value: "upfront", label: t("rental.paidUpfront") },');
    expect(flow).toContain('{ value: "perSession", label: t("rental.payPerSession") },');
    // the switch renders only with the rental ON, right under the picker
    const on = flow.slice(flow.indexOf("{rentalOn && ("), flow.indexOf("createSummaryLine="));
    expect(on).toContain("<RentalTierPicker");
    expect(on).toContain("<SegmentedControl");
    expect(on.indexOf("<RentalTierPicker")).toBeLessThan(on.indexOf("<SegmentedControl"));
    // the form → the service → the wire: the flag is present in BOTH states (never dropped as `undefined`)
    expect(flow).toContain("paidUpfront: rentalPaidUpfront } : undefined,");
    expect(svc).toContain("paidUpfront: input.rental.paidUpfront }");
    expect(svc).toContain("rental?: { code: string; remark?: string; paidUpfront: boolean };");
    expect(JSON.parse(JSON.stringify({ rental: { code: "rental-set", paidUpfront: false } }))).toEqual({ rental: { code: "rental-set", paidUpfront: false } });
    expect(JSON.parse(JSON.stringify({ rental: { code: "rental-set", paidUpfront: true } }))).toEqual({ rental: { code: "rental-set", paidUpfront: true } });
    // the summary line says which
    expect(flow).toContain('rentalPaidUpfront ? t("rental.paidUpfront") : t("rental.payPerSession")');
  });
});

describe("§2 — the course card", () => {
  it("the rental line gains the variant (+ `n to collect` per session); the red remove is gated by the new key and shown only while the course is writable", () => {
    expect(panel).toContain('{c.rental.paidUpfront ? t("rental.paidUpfront") : t("rental.payPerSession")}');
    expect(panel).toContain('!c.rental.paidUpfront && c.rental.unpaidSessions > 0 ? ` · ${t("rental.toCollect", { n: String(c.rental.unpaidSessions) })}` : ""');
    expect(panel).toContain('const canRemoveRental = can("action:bookings.course-rental");');
    expect(panel).toContain("{canRemoveRental && isCourseWritable(c.status) && (");
    expect(panel).toContain("onClick={() => setRentalTarget(c)}");
    // the whole line is inside `c.rental && (` — removed (null) ⇒ the line, the variant and the button are all gone
    const line = panel.slice(panel.indexOf("{c.rental && ("), panel.indexOf("{isCourseWritable(c.status) &&"));
    expect(line).toContain('t("rental.removeFromCourse")');
    expect(line).not.toContain("rental === null"); // no second condition: null hides it by the existing guard
  });

  it("two taps: the link opens the dialog, the dialog's red confirm calls DELETE /courses/:id/rental; no money; the count from the response", () => {
    const dialog = panel.slice(panel.indexOf("function RemoveCourseRentalDialog"));
    expect(dialog).toContain("const res = await remove.mutateAsync(course.id);");
    expect(dialog).toContain('notify({ title: t("rental.removedFromCourseOk", { n: String(res.removed) }), color: "success" });');
    expect(dialog).toContain('<Button color="red" leftSection={<PackageX size={15} />} loading={remove.isPending} onClick={submit}>');
    expect(dialog).toContain('t("rental.removeFromCourseBody")');
    expect(dialog).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(svc).toContain("api.delete<{ removed: number }>(`/courses/${courseId}/rental`)");
    // the same invalidation set as the other course actions
    const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");
    expect(hooks).toContain("mutationFn: (courseId: string) => removeCourseRental(courseId), onSuccess: () => invalidateAll(qc)");
    // the dialog's own words say no money moves — in both languages
    expect(dictionaries.en.rental.removeFromCourseBody).toContain("No money is changed");
    expect(dictionaries.th.rental.removeFromCourseBody).toContain("ไม่มีการเปลี่ยนแปลงเงิน");
    // 🚫 no client rule: `unpaidSessions` is read exactly twice, both in the "n to collect" display; nothing gates on it
    expect((panel.match(/unpaidSessions/g) ?? []).length).toBe(2);
    expect(panel).not.toMatch(/paidUpfront\s*&&\s*set|unpaidSessions[^\n]*setRentalTarget/);
  });

  it("the 47th key and the copy: `action:bookings.course-rental` in the snapshot (TASK-390's name); rental keys +9 ×2", () => {
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:bookings.course-rental");
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(55); // 47 + student-archive + other-series + group-series + TASK-402's four camp keys + TASK-407's teacher-leave
    for (const k of ["paidUpfront", "payPerSession", "toCollect", "removeFromCourse", "removeFromCourseTitle", "removeFromCourseBody", "removeFromCourseConfirm", "removedFromCourseOk"]) {
      expect((dictionaries.en.rental as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.rental as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
    expect(codeOf("src/types/api/contract.ts")).toContain("rental?: { code: string; remark: string | null; paidUpfront: boolean; unpaidSessions: number } | null;");
  });
});
