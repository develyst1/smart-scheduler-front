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
import { CREATABLE_GROUP_KINDS, DUO_PRICE_GROUP, callName, duoBody, duoReady, emptyDuo, priceGroupFor, rateChange, studentLabel } from "./duo";

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
  it("dtoToBooking: a Private row's displayName is byte-identical to the server's; a DUO row reads `A & B`; the course's rate rides for the move box", () => {
    const priv = dtoToBooking(dto({}));
    expect(priv.displayName).toBe("A");
    expect(priv.coStudent).toBeNull();
    expect(priv.classRateMinor).toBeNull();
    const duo = dtoToBooking(dto({ coStudent: { id: "s2", name: "Somsri", nickname: "B" }, course: { classRateMinor: 50000 } as never }));
    expect(duo.displayName).toBe("A & B");
    expect(duo.coStudent?.id).toBe("s2");
    expect(duo.classRateMinor).toBe(50000);
    expect(mappers).toContain("displayName: studentLabel(dto.displayName, dto.coStudent),");
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
  it("Move-session: the rate box for a DUO session only, prefilled from the course, sent only when changed (alone is a body)", () => {
    const move = modal.slice(modal.indexOf("function MoveBookingForm("), modal.indexOf("function CreateForm("));
    expect(move).toContain("const isDuo = !!booking.coStudent;");
    expect(move).toContain('useState<number | "">(typeof booking.classRateMinor === "number" ? booking.classRateMinor / 100 : "")');
    expect(move).toContain("if (isDuo) Object.assign(patch, rateChange(rateBaht, booking.classRateMinor));");
    expect(move).toContain("{isDuo && (");
    expect(move.indexOf("Object.assign(patch, rateChange")).toBeLessThan(move.indexOf("if (Object.keys(patch).length === 0) {"));
    expect(svc).toContain("classRateMinor?: number;");
  });
  it("the course card: the DUO tag + the rate line (edit by `bookings.course-edit`) ⇒ `PATCH /courses/:id { classRateMinor }` only when changed; a Private never renders it", () => {
    // TWO gates — the tag and the rate line — each on `courseKind === "DUO"` (📌 one occurrence let the line show on a Private)
    expect(panel.match(/\{c\.courseKind === "DUO" && \(/g)?.length).toBe(2);
    expect(panel).toMatch(/\{c\.courseKind === "DUO" && \(\s*<DuoRateLine/);
    expect(panel).toContain("editable={canEdit}");
    expect(panel).toContain("await updateRate.mutateAsync({ courseId: c.id, classRateMinor });");
    expect(rateLine).toContain("const change = rateChange(baht, rateMinor);");
    expect(svc).toContain("api.patch<{ course: CourseListItem }>(`/courses/${courseId}`, { classRateMinor })");
    const html = render(h(DuoRateLine, { rateMinor: 50000, editable: true, saving: false, onSave: async () => {} }));
    expect(html).toContain('data-duo-rate="50000"');
    expect(html).toContain("Rate 500 ฿ / session");
    const ro = render(h(DuoRateLine, { rateMinor: null, editable: false, saving: false, onSave: async () => {} }));
    expect(ro).not.toContain("aria-label=\"Edit rate\"");
    expect(ro).toContain("Rate — ฿ / session");
  });
  it("copy counted both languages; snapshot unchanged (no key)", () => {
    for (const lang of ["en", "th"] as const)
      for (const k of ["kindPrivate", "kindDuo", "coStudent", "duoSameChild", "classRate", "classRateHint", "classRateMoveHint", "duoTag", "rateLine", "rateEdit", "rateSavedOk"]) expect((dictionaries[lang].course as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(56);
  });
});
