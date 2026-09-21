import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { GroupSeatsLine, OtherKindTag } from "@/components/common/BookingCellBody";
import { BOOKING_TYPE_OPTIONS } from "@/components/partials/Calendar/Calendar.config";
import type { Booking } from "@/types/app/scheduler";
import { DUO_CAP, GROUP_CAP_MAX, GROUP_CAP_MIN, GROUP_KINDS, groupSeriesBody, seatCapFor, seatsLabel } from "./group-session";

/**
 * REQ-095 Stage 2a / SPEC-081 / TASK-398 — DUO/Group on the FE: the group cell (`n/cap` from `group.seats`, the kind
 * tag), `Create group` by the 50th key on the shared fields + picker, sell-a-course-into-a-group through the EXISTING
 * course form (three fields locked, `groupKey` in the body), the teacher swap (its own route, no notice — said in one
 * line), the roster, `In group:` on a seat. 🚫 The ONE client rule is the DUO cap; 🚫 no seat filtering on the grid.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const groupDlg = codeOf("src/components/partials/Calendar/Modal/GroupSeriesDialog.tsx");
const swapDlg = codeOf("src/components/partials/Calendar/Modal/GroupSwapDialog.tsx");

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "g1",
    displayName: "Sat 10:00 group",
    teacherId: "t1",
    teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }],
    subject: null,
    date: "2026-09-20",
    startTime: "10:00",
    endTime: "11:00",
    bookingType: "GROUP",
    status: "CONFIRMED",
    badges: [],
    attendeeNote: null,
    courseLast: false,
    cancelReason: null,
    rental: null,
    other: null,
    group: null,
    groupId: null,
    groupName: null,
    pendingSlot: false,
    incomingBookingId: null,
    ...over,
  }) as unknown as Booking;
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));

describe("§1 — pure", () => {
  it("the DUO cap is the ONE client rule; the series body is the confirmed shape with dates sorted and optionals only when present", () => {
    expect(seatCapFor("DUO", 7)).toBe(DUO_CAP);
    expect(seatCapFor("DUO", "")).toBe(2);
    expect(seatCapFor("GROUP", 7)).toBe(7);
    expect(seatCapFor("GROUP", "")).toBe("");
    expect([DUO_CAP, GROUP_CAP_MIN, GROUP_CAP_MAX]).toEqual([2, 3, 12]);
    expect(GROUP_KINDS).toEqual(["DUO", "GROUP"]);
    expect(groupSeriesBody({ name: "A", groupKind: "DUO", seatCap: 2, teacherId: "t1", startTime: "10:00", dates: ["2026-09-27", "2026-09-20"] })).toEqual({
      name: "A",
      groupKind: "DUO",
      seatCap: 2,
      teacherId: "t1",
      startTime: "10:00",
      dates: ["2026-09-20", "2026-09-27"],
    });
    expect(groupSeriesBody({ name: "A", groupKind: "GROUP", seatCap: 6, teacherId: "t1", additionalTeacherIds: ["t2"], teacherRates: { t1: 50000 }, startTime: "10:00", dates: ["2026-09-20"] })).toMatchObject({
      additionalTeacherIds: ["t2"],
      teacherRates: { t1: 50000 },
    });
    expect("additionalTeacherIds" in groupSeriesBody({ name: "A", groupKind: "GROUP", seatCap: 6, teacherId: "t1", additionalTeacherIds: [], startTime: "10:00", dates: ["2026-09-20"] })).toBe(false);
    // `n/cap` reads the seats the server listed, nothing else
    expect(seatsLabel({ seats: [], seatCap: 6 })).toBe("0/6");
    expect(seatsLabel({ seats: [{ bookingId: "s1", studentId: "a", studentName: "A", status: "CONFIRMED", courseId: null }], seatCap: 2 })).toBe("1/2");
    // a seat counts whatever its status — the server listed it; nothing here filters by status
    expect(seatsLabel({ seats: [{ bookingId: "s1", studentId: "a", studentName: "A", status: "PENDING", courseId: null }, { bookingId: "s2", studentId: "b", studentName: "B", status: "SICK_LEAVE", courseId: null }], seatCap: 6 })).toBe("2/6");
  });
});

describe("§2 — the group cell (rendered)", () => {
  it("a GROUP row renders `n/cap` + the seated names and the DUO/Group tag; an empty group `0/cap`; a lesson row renders neither", () => {
    const g = booking({
      group: { key: "k", kind: "DUO", name: "Sat", seatCap: 2, seats: [{ bookingId: "s1", studentId: "a", studentName: "Ann", status: "CONFIRMED", courseId: "c1" }], teacherRates: {}, ratePostedAt: null },
    });
    const html = render(h(GroupSeatsLine, { booking: g }));
    expect(html).toContain('data-seats="1/2"');
    expect(html).toContain("Ann");
    const tag = render(h(OtherKindTag, { booking: g }));
    expect(tag).toContain("DUO");
    const empty = render(h(GroupSeatsLine, { booking: booking({ group: { key: "k", kind: "GROUP", name: "G", seatCap: 6, seats: [], teacherRates: {}, ratePostedAt: null } }) }));
    expect(empty).toContain('data-seats="0/6"');
    // a lesson row renders neither — even with a stray `group` object on it, the TYPE decides (the server's `group` is null there)
    const lesson = booking({ bookingType: "COURSE_PACKAGE", group: { key: "k", kind: "GROUP", name: "stray", seatCap: 6, seats: [], teacherRates: {}, ratePostedAt: null } });
    const base = render(h("span", null));
    expect(render(h(GroupSeatsLine, { booking: lesson }))).toBe(base.replace("<span></span>", ""));
    expect(render(h(OtherKindTag, { booking: lesson }))).toBe(base.replace("<span></span>", ""));
    // both grids mount it on the cell; the legend lists the two kinds; the type is in every hand-written list
    expect(codeOf("src/components/partials/Calendar/CalendarGrid.tsx")).toContain("<GroupSeatsLine booking={booking} />");
    expect(codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx")).toContain('<GroupSeatsLine booking={b} size="sm" />');
    expect(codeOf("src/components/partials/Calendar/CalendarLegendBar.tsx")).toContain("{GROUP_KINDS.map((k) => (");
    expect(BOOKING_TYPE_OPTIONS).toContain("GROUP");
    expect(dictionaries.en.bookingType.GROUP.length).toBeGreaterThan(0);
    expect(dictionaries.th.bookingType.GROUP.length).toBeGreaterThan(0);
    // 🚫 no seat filtering on the grid: no `groupId` read anywhere in the calendar partials
    for (const f of ["CalendarGrid.tsx", "CalendarWeekGrid.tsx"]) expect(codeOf(`src/components/partials/Calendar/${f}`)).not.toContain("groupId");
    // TASK-400's walk-in slot names a `groupId` on the content page — the door, never a filter over the rows
    expect(codeOf("src/components/partials/Calendar/CalendarContent.tsx")).not.toMatch(/filter\([^\n]*groupId|groupId[^\n]*\.filter\(/);
  });
});

describe("§3 — the doors and the bodies", () => {
  it("`Create group` by the 50th key beside `Create series`; the dialog reuses the shared fields (rates only) + the shared picker; ONE call; the ticks stay on a 409", () => {
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:calendar.group-series");
    expect(modal).toContain('{can("action:calendar.group-series") && (');
    expect(modal).toContain("onClick={() => setGroupOpen(true)}");
    expect(groupDlg).toContain("<OtherScheduleFields value={schedule} onChange={setSchedule} teacherIds={teacherIds} teachers={teachers} ratesOnly />");
    expect(groupDlg).toContain("<MultiDateField value={dates} onChange={setDates} />");
    expect(groupDlg).toContain("const seatCap = seatCapFor(kind, capTyped);");
    expect(groupDlg).toContain('disabled={kind === "DUO"}');
    expect(svc).toContain('api.post<GroupSeriesResponse>("/bookings/group-series", groupSeriesBody(input))');
    const catchBlock = groupDlg.slice(groupDlg.indexOf("} catch (e) {"), groupDlg.indexOf("return ("));
    expect(catchBlock).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(catchBlock).not.toContain("setDates");
    // no copy of the picker: exactly one `type="multiple"` in the whole Modal folder
    const folder = ["OtherSeriesDialog", "GroupSeriesDialog", "MultiDateField"].map((f) => codeOf(`src/components/partials/Calendar/Modal/${f}.tsx`)).join("\n");
    expect((folder.match(/type="multiple"/g) ?? []).length).toBe(1);
  });

  it("sell a course into the group: the EXISTING course form, the three fields locked, `groupKey` in the body; by the course-create key", () => {
    expect(modal).toContain('{can("action:bookings.course-create") && (');
    expect(modal).toContain("group={{ groupKey: booking.group.key, name: booking.group.name ?? booking.displayName, teacherId: booking.teacherId, startDate: booking.date, startTime: booking.startTime, priceGroup: booking.group.priceGroup }}"); // + TASK-400's price group
    expect(flow).toContain("group?: { groupKey: string; name: string; teacherId: string; startDate: string; startTime: string; priceGroup: string | null };"); // + TASK-400
    expect(flow).toContain("setTeacherId(group.teacherId);");
    expect(flow).toContain("setStartDate(group.startDate);");
    expect(flow).toContain("setStartTime(group.startTime);");
    expect((flow.match(/disabled=\{!!group\}/g) ?? []).length).toBe(3); // teacher · first date · time
    expect(flow).toContain("groupKey: group?.groupKey,");
    expect(svc).toContain("groupKey: input.groupKey,");
    // no second course form anywhere
    expect(modal).not.toMatch(/GroupCourseForm|SellIntoGroup/);
  });

  it("swap teacher: its own route, `{ teacherId, fromHereOn }`, behind booking-edit, and the one line that no message is sent", () => {
    expect(modal).toContain("onClick={() => setSwapOpen(true)}");
    expect(swapDlg).toContain("await swap.mutateAsync({ id: booking.id, input: { teacherId, fromHereOn } });");
    expect(svc).toContain("api.patch<MoveBookingResponse>(`/bookings/${id}/group-teacher`, { teacherId: input.teacherId, fromHereOn: input.fromHereOn })");
    expect(swapDlg).toContain('t("booking.groupSwapNoNotice")');
    expect(dictionaries.en.booking.groupSwapNoNotice).toContain("No message is sent");
    expect(dictionaries.th.booking.groupSwapNoNotice).toContain("ไม่ส่งข้อความ");
    expect(swapDlg).toContain('label={t("booking.groupSwapFromHereOn")}');
  });

  it("the roster, cap/rates through the Stage 1 editor, `In group:` on a seat", () => {
    const roster = modal.slice(modal.indexOf('{booking.bookingType === "GROUP" && booking.group && ('), modal.indexOf('{booking.bookingType === "OTHER" && booking.other && ('));
    expect(roster).toContain("{booking.group.seats.map((s) => (");
    expect(roster).toContain('<StatusChip status={s.status as Booking["status"]} />');
    expect(roster).toContain('t("booking.groupRosterEmpty")');
    expect(roster).toContain('t("booking.groupSeats", { n: seatsLabel(booking.group) })');
    expect(roster).toContain("onClick={() => setOtherDetailsOpen(true)}");
    expect(modal).toContain('{(booking.bookingType === "OTHER" || booking.bookingType === "GROUP") && otherDetailsOpen && (');
    const details = codeOf("src/components/partials/Calendar/Modal/OtherDetailsDialog.tsx");
    expect(details).toContain("const facts = isGroup && booking.group ? { kind: null, headCount: booking.group.seatCap, teacherRates: booking.group.teacherRates, ratePostedAt: booking.group.ratePostedAt } : booking.other;");
    expect(details).toContain("hideKind={isGroup}");
    expect(modal).toContain("{booking.groupName && (");
    expect(modal).toContain('t("booking.inGroup", { name: booking.groupName })');
  });

  it("copy: booking +22 · calendar +2 · bookingType +1 — both languages; the snapshot is 50", () => {
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(58) /* TASK-427 + TASK-429: budget-view, other-cancel-all */; // + TASK-402's four camp keys + TASK-407's teacher-leave + TASK-412's parent-archive
    for (const k of ["groupKind_DUO", "groupKind_GROUP", "groupCreate", "groupCreateTitle", "groupName", "groupKindLabel", "groupSeatCap", "groupSeatCapDuo", "groupSeatCapHint", "groupSeriesCreatedOk", "groupSeats", "groupRoster", "groupRosterEmpty", "groupSell", "groupSellInto", "groupSwap", "groupSwapTitle", "groupSwapFromHereOn", "groupSwapNoNotice", "groupSwapOk", "inGroup"]) {
      expect((dictionaries.en.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
    for (const k of ["groupKindTag_DUO", "groupKindTag_GROUP"]) {
      expect((dictionaries.en.calendar as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.calendar as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
