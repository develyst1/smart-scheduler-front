import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { dtoToBooking, dtoToCourseView } from "@/lib/api/mappers";
import { GROUP_KINDS } from "@/lib/scheduler/group-session";
import DuoRateLine from "@/components/partials/Bookings/DuoRateLine";
import type { BookingDTO, CourseListItem } from "@/types/api/contract";
import { CREATABLE_GROUP_KINDS, DUO_PRICE_GROUP, callName, duoBody, duoReady, emptyDuo, priceGroupFor, rateChange, rateTag, sessionRateChange, studentLabel } from "./duo";

/**
 * REQ-095 §13 / SPEC-087 / TASK-420/421 — DUO = ONE course, TWO kids. The two-name label through ONE pure function
 * (a Private byte-identical), the create body's `duo` block only when the toggle is on (never beside a groupKey), the
 * DUO price from the server's card by its group name, the move/edit rate only when changed, `Create group` = Group only.
 * 🚫 No client pool/leave logic; the same-child rule is the server's (hinted only). No key.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const groupDlg = codeOf("src/components/partials/Calendar/Modal/GroupSeriesDialog.tsx");
const panel = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
const rateLine = codeOf("src/components/partials/Bookings/DuoRateLine.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const mappers = codeOf("src/lib/api/mappers.ts");
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));

const dto = (over: Partial<BookingDTO>): BookingDTO =>
  ({
    id: "b1",
    date: "2026-09-27",
    startTime: "10:00",
    endTime: "11:00",
    bookingType: "COURSE_PACKAGE",
    status: "CONFIRMED",
    note: null,
    student: { id: "s1", name: "Somchai", nickname: "A" },
    teacher: { id: "t1", name: "T", nickname: "T", type: "FULL_TIME" },
    teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }],
    subject: { id: "sub", name: "Skate" },
    displayName: "A",
    course: null,
    badges: [],
    ...over,
  }) as unknown as BookingDTO;

describe("§1 — the two-name label and the bodies, by value", () => {
  it("studentLabel: a Private is byte-identical; a DUO reads `first & <co's call name>` (nickname, else name; a blank nickname ⇒ name)", () => {
    expect(studentLabel("A", null)).toBe("A");
    expect(studentLabel("A", undefined)).toBe("A");
    expect(studentLabel("A", { id: "s2", name: "Somsri", nickname: "B" })).toBe("A & B");
    expect(studentLabel("A", { id: "s2", name: "Somsri", nickname: null })).toBe("A & Somsri");
    expect(studentLabel("A", { id: "s2", name: "Somsri", nickname: "  " })).toBe("A & Somsri");
    expect(callName(null)).toBeNull();
  });
  it("the `duo` block rides ONLY when the toggle is on and both fields are filled; the rate in satang via the ONE bahtToMinor", () => {
    expect(duoBody(emptyDuo())).toBeUndefined();
    expect(duoBody({ on: false, coStudentId: "s2", rateBaht: 500 })).toBeUndefined();
    expect(duoBody({ on: true, coStudentId: null, rateBaht: 500 })).toBeUndefined();
    expect(duoBody({ on: true, coStudentId: "s2", rateBaht: "" })).toBeUndefined();
    expect(duoBody({ on: true, coStudentId: "s2", rateBaht: 500 })).toEqual({ coStudentId: "s2", classRateMinor: 50000 });
    expect(duoReady(emptyDuo(), "s1")).toBe(true); // Private: nothing to fill
    expect(duoReady({ on: true, coStudentId: "s1", rateBaht: 500 }, "s1")).toBe(false); // the same child — hinted, the server's rule
    expect(duoReady({ on: true, coStudentId: "s2", rateBaht: 500 }, "s1")).toBe(true);
    expect(duoReady({ on: true, coStudentId: "s2", rateBaht: "" }, "s1")).toBe(false);
  });
  it("the move/edit rate rides only when it differs from the course's satang; the DUO card is picked by its group NAME, the price from the card", () => {
    expect(rateChange("", 50000)).toBeUndefined();
    expect(rateChange(500, 50000)).toBeUndefined();
    expect(rateChange(600, 50000)).toEqual({ classRateMinor: 60000 });
    expect(rateChange(500, null)).toEqual({ classRateMinor: 50000 });
    expect(DUO_PRICE_GROUP).toBe("balance-duo");
    expect(priceGroupFor(true, "skate")).toBe("balance-duo");
    expect(priceGroupFor(false, "skate")).toBe("skate");
    expect(codeOf("src/lib/scheduler/duo.ts")).not.toMatch(/6[,.]?800|9[,.]?360|14[,.]?200/); // never a price here
  });
  it("`Create group` offers Group only; `GROUP_KINDS` keeps DUO so existing DUO series still render", () => {
    expect([...CREATABLE_GROUP_KINDS]).toEqual(["GROUP"]);
    expect([...GROUP_KINDS]).toEqual(["DUO", "GROUP"]);
    expect(groupDlg).toContain("data={CREATABLE_GROUP_KINDS.map((k) => ({ value: k, label: t(`booking.groupKind_${k}`) }))}");
    expect(groupDlg).toContain('useState<GroupKind>("GROUP")');
    expect(groupDlg).not.toMatch(/[^_]GROUP_KINDS.map/);
  });
});

describe("§2 — both names everywhere, through the ONE mapper", () => {
  it("dtoToBooking (TASK-424): `displayName` is carried straight through — the SERVER joins `A & B` now; the pure `studentLabel` and the server's string AGREE (pinned by value); the three rate facts ride as sent", () => {
    const priv = dtoToBooking(dto({}));
    expect(priv.displayName).toBe("A");
    expect(priv.coStudent).toBeNull();
    expect(priv.rate).toBeNull();
    // the server's own rule since TASK-423: `<nick ?? name> & <nick ?? name>` — the same string `studentLabel` builds
    const serverDisplayName = "A & B";
    const duo = dtoToBooking(dto({ displayName: serverDisplayName, coStudent: { id: "s2", name: "Somsri", nickname: "B" }, rate: { effectiveMinor: 60000, overrideMinor: 60000, defaultMinor: 50000 } }));
    expect(duo.displayName).toBe(serverDisplayName);
    expect(studentLabel(callName({ name: "Somchai", nickname: "A" }) as string, { id: "s2", name: "Somsri", nickname: "B" })).toBe(serverDisplayName);
    expect(duo.coStudent?.id).toBe("s2");
    expect(duo.rate).toEqual({ effectiveMinor: 60000, overrideMinor: 60000, defaultMinor: 50000 });
    expect(mappers).toContain("displayName: dto.displayName,");
    expect(mappers).not.toContain("displayName: studentLabel("); // no second join — the server's field, byte for byte
    expect(mappers).toContain("rate: dto.rate ?? null,");
  });
  it("dtoToCourseView: a DUO course names both children (by name); a Private is the one name; kind and rate carried", () => {
    const base = { id: "c1", size: 6, usedSessions: 0, leaveUsed: 0, leaveQuota: 2, leaveRemaining: 2, maxWeek: 8, leaveLocked: false, adminUnlocked: false, endedAt: null, endReason: null, status: "ACTIVE", expiryDate: "2026-12-31", student: { id: "s1", name: "Somchai", nickname: "A" } } as unknown as CourseListItem;
    expect(dtoToCourseView(base).studentName).toBe("Somchai");
    expect(dtoToCourseView(base).courseKind).toBe("PRIVATE");
    const duo = dtoToCourseView({ ...base, courseKind: "DUO", coStudent: { id: "s2", name: "Somsri", nickname: "B" }, classRateMinor: 50000 });
    expect(duo.studentName).toBe("Somchai & B");
    expect(duo.courseKind).toBe("DUO");
    expect(duo.classRateMinor).toBe(50000);
    // the cells, the Bookings table and the modal header all read `displayName` — no second join anywhere in components
    expect(codeOf("src/components/partials/Bookings/BookingsTable.tsx")).toContain("{b.displayName}");
    expect(codeOf("src/components/partials/Calendar/CalendarGrid.tsx")).toContain("{booking.displayName}");
    expect(codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx")).toContain("{b.displayName}");
  });
});

describe("§3 — the forms", () => {
  it("New course: the Private/DUO toggle (default Private, hidden inside a group), the second child + the rate box under DUO, the body's `duo` never beside a groupKey", () => {
    expect(flow).toContain('value={duo.on ? "DUO" : "PRIVATE"}');
    expect(flow).toContain("const duoOn = !group && duo.on;");
    expect(flow).toContain('<StudentSelect value={coStudent} onChange={setCoStudent} label={t("course.coStudent")} required />');
    expect(flow).toContain("duo: group ? undefined : duoBody(duo),");
    expect(flow).toContain("duoReady(duo, student?.id) &&");
    expect(flow).toContain('{t("course.duoSameChild")}');
    expect(flow).toContain("packageForGroup(card, priceGroupFor(true, null), size)");
    expect(svc).toContain("duo: input.duo,");
    expect(svc).toContain("duo?: { coStudentId: string; classRateMinor: number };");
  });
  it("§13.3 pure: the (default)/(override) tag reads `overrideMinor` alone; THIS session's body only when it differs from the EFFECTIVE rate; Clear ⇒ null only when an override is set; no `override ?? default` anywhere", () => {
    const def = { effectiveMinor: 50000, overrideMinor: null, defaultMinor: 50000 };
    const ovr = { effectiveMinor: 60000, overrideMinor: 60000, defaultMinor: 50000 };
    const zero = { effectiveMinor: 0, overrideMinor: 0, defaultMinor: 50000 };
    expect(rateTag(def)).toBe("default");
    expect(rateTag(ovr)).toBe("override");
    expect(rateTag(zero)).toBe("override"); // 0 is a rate
    expect(rateTag(null)).toBeNull();
    // 📌 the facts DIVERGE here — an override equal to the default is still an override (the tag reads `overrideMinor`,
    // never `effective !== default`); and the body compares against the EFFECTIVE, not the default
    const sameAsDefault = { effectiveMinor: 50000, overrideMinor: 50000, defaultMinor: 50000 };
    expect(rateTag(sameAsDefault)).toBe("override");
    expect(sessionRateChange(500, ovr, false)).toEqual({ classRateMinor: 50000 }); // typed = the default, ≠ the effective ⇒ a body
    expect(sessionRateChange(500, def, false)).toBeUndefined(); // typed = effective
    expect(sessionRateChange(600, def, false)).toEqual({ classRateMinor: 60000 });
    expect(sessionRateChange(0, def, false)).toEqual({ classRateMinor: 0 }); // zero is a rate
    expect(sessionRateChange("", def, false)).toBeUndefined(); // blank typed ⇒ leave as is
    expect(sessionRateChange(600, ovr, true)).toEqual({ classRateMinor: null }); // Clear on an override ⇒ null
    expect(sessionRateChange(600, def, true)).toBeUndefined(); // Clear with no override ⇒ nothing to clear
    expect(sessionRateChange(600, null, false)).toBeUndefined(); // not a course row
    expect(codeOf("src/lib/scheduler/duo.ts")).not.toMatch(/overrideMinor\s*\?\?\s*defaultMinor|effectiveMinor\s*=|defaultMinor\s*\+/);
  });
  it("Move-session (§13.3): the box on a COURSE row (`rate` non-null), prefilled from `effectiveMinor`, the tag from the facts, `Clear` ⇒ null; relabelled THIS session's rate with the default in the hint", () => {
    const move = modal.slice(modal.indexOf("function MoveBookingForm("), modal.indexOf("function CreateForm("));
    expect(move).toContain("const rate = booking.rate ?? null;");
    expect(move).toContain('useState<number | "">(rate ? rate.effectiveMinor / 100 : "")');
    expect(move).toContain("Object.assign(patch, sessionRateChange(rateBaht, rate, rateClear));");
    expect(move).toContain("{rate && (");
    expect(move).toContain('data-session-rate={rateTag(rate)}');
    expect(move).toContain('{t("course.sessionRate")}');
    expect(move).toContain('{t(rateTag(rate) === "override" ? "course.rateOverride" : "course.rateDefault")}');
    expect(move).toContain('description={t("course.sessionRateHint", { baht: typeof rate.defaultMinor === "number" ? rate.defaultMinor / 100 : "—" })}');
    expect(move).toContain('{rateTag(rate) === "override" && (');
    expect(move).not.toContain("isDuo"); // the box is a COURSE thing now, not a DUO thing
    expect(move).not.toMatch(/overrideMinor\s*\?\?|\?\?\s*rate\.defaultMinor/); // no arithmetic on the FE
    expect(move.indexOf("Object.assign(patch, sessionRateChange")).toBeLessThan(move.indexOf("if (Object.keys(patch).length === 0) {"));
    expect(svc).toContain("classRateMinor?: number | null;");
    expect(codeOf("src/components/partials/Bookings/BookingsTable.tsx")).toContain("{b.displayName}"); // the table's names are the server's
  });
  it("the course card (§13.3): the DEFAULT coach rate on ANY course (edit by `bookings.course-edit`) ⇒ `PATCH /courses/:id { classRateMinor }` only when changed, never null (no Clear); the DUO tag stays DUO-only", () => {
    expect(panel.match(/\{c\.courseKind === "DUO" && \(/g)?.length).toBe(1); // the tag alone
    expect(panel).not.toMatch(/\{c\.courseKind === "DUO" && \(\s*<DuoRateLine/);
    expect(panel).toContain("<DuoRateLine");
    expect(panel).toContain("editable={canEdit}");
    expect(panel).toContain("await updateRate.mutateAsync({ courseId: c.id, classRateMinor });");
    expect(rateLine).toContain("const change = rateChange(baht, rateMinor);");
    expect(rateLine).not.toMatch(/classRateMinor: null|rateClear/); // the default is set, never cleared
    expect(rateLine).toContain('label={t("course.defaultRate")}');
    expect(svc).toContain("api.patch<{ course: CourseListItem }>(`/courses/${courseId}`, { classRateMinor })");
    const html = render(h(DuoRateLine, { rateMinor: 50000, editable: true, saving: false, onSave: async () => {} }));
    expect(html).toContain('data-duo-rate="50000"');
    expect(html).toContain("Default coach rate 500 ฿ / session");
    const ro = render(h(DuoRateLine, { rateMinor: null, editable: false, saving: false, onSave: async () => {} }));
    expect(ro).not.toContain("aria-label=\"Edit rate\"");
    expect(ro).toContain("Default coach rate — ฿ / session");
  });
  it("copy counted both languages; snapshot unchanged (no key)", () => {
    for (const lang of ["en", "th"] as const)
      for (const k of ["kindPrivate", "kindDuo", "coStudent", "duoSameChild", "classRate", "classRateHint", "classRateMoveHint", "duoTag", "rateLine", "rateEdit", "rateSavedOk", "sessionRate", "sessionRateHint", "rateDefault", "rateOverride", "rateClear", "defaultRate", "defaultRateLine"]) expect((dictionaries[lang].course as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(57) /* TASK-427: + teachers.budget-view */;
  });
});
