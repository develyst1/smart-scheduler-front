# TODO — smart-scheduler-front (Frontoffice Web)

สถานะงานเทียบ **[docs/requirement-timeline.md](docs/requirement-timeline.md)** (สัญญา **Option C**)
repo นี้ = หน้าจอ staff (Next.js 16 + Mantine v9) · **เชื่อม API จริงแล้ว** (`smart-scheduler-back`)

> สถานะ: ✅ เสร็จ · 🟡 บางส่วน · ❌ ยังไม่มี · อัปเดต 2026-06-30
> Scope: **[FE]** ทำในรีโปนี้ · **[BE]** ต้องมี `smart-scheduler-back` · **[BO]** ฝั่ง backoffice

---

## ✅ Foundation (เสร็จ — เปลี่ยนจาก mock → API จริง)

- [x] ✅ **Axios client + env** (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCK`) — [client.ts](src/lib/api/client.ts)
- [x] ✅ **Contract types + mappers** DTO↔UI — [contract.ts](src/types/api/contract.ts), [mappers.ts](src/lib/api/mappers.ts)
- [x] ✅ **ทุกหน้าเชื่อม API จริง** (calendar/bookings/teachers/reports) ผ่าน hooks — [useScheduler.ts](src/hooks/scheduler/useScheduler.ts)
- [x] ✅ **Auth/Login (B.7 FE)** — หน้า `/login` + เก็บ token + axios แนบ Bearer + ดัก 401 redirect + `AuthGuard` + ปุ่ม logout
  - [auth-store.ts](src/lib/api/auth-store.ts), [auth.service.ts](src/services/auth.service.ts), [login/page.tsx](src/app/login/page.tsx), [AuthGuard.tsx](src/components/auth/AuthGuard.tsx)

---

## 1. ปฏิทิน & การจอง — ✅ เสร็จ (timeline 2026-06-28 ข้อ 1)

- [x] ✅ **ตัวกรองตามครู (MultiSelect)** — [CalendarHeader.tsx](src/components/partials/Calendar/CalendarHeader.tsx)
- [x] ✅ **Dropdown 4 ประเภทการจอง** (Trial/รายครั้ง/คอร์สรายสัปดาห์/Voucher) — [BookingModal.tsx](src/components/partials/Calendar/Modal/BookingModal.tsx)
- [x] ✅ **Conflict Resolution (จองทับ)** — UI 3 ทางเลือก + **เชื่อม API จริงแล้ว** (BE B.1 เสร็จ: `with-reschedule`/confirm/cancel ใน transaction + LINE)
  - _เดิม todo เขียน "เหลือ BE ย้าย logic" → ตอนนี้ **เสร็จฝั่ง BE แล้ว**_

---

## 2. เช็คอิน / กฎลา / CRM — ❌ รอ BE (timeline ข้อ 2)

- [ ] ❌ **[BE+FE] QR / LINE check-in & แจ้งลา** — ปัจจุบันเช็คอิน/ลา ทำมือผ่านปุ่มในโมดอลเท่านั้น
  - รอ **BE C.1** (ออก QR + endpoint เช็คอิน) + **C.4** (LINE OA) · FE: หน้าสแกน/แสดง QR + สถานะ
- [ ] ❌ **[BE+FE] CRM แต้ม + Level นักเรียน** — ยังไม่มี model แต้ม/level
  - รอ **BE C.2** (schema แต้ม/level) · FE: badge/level ในหน้าการจอง + ผูกลำดับความสำคัญ
- [x] ✅ กฎลา/ขยายคาบ + Policy Lock (เชื่อม BE แล้ว — sick-leave/extend/unlock)
- [ ] ❌ **[BE] ตัดโควตาอัตโนมัติสิ้นวัน** = งาน BE C.3 (FE ไม่ต้องทำ)

---

## 3. จัดการครู — ✅ เสร็จ (timeline ข้อ 3)

- [x] ✅ **จัดลำดับครู drag reorder** — [TeachersContent.tsx](src/components/partials/Teachers/TeachersContent.tsx)
  - _เดิม "in-memory only" → ตอนนี้ **persist ใน DB จริงแล้ว** (BE B.2: `/teachers/type-order`)_
- [x] ✅ **Auto-Disable Freelance เมื่อถึงเพดานรายได้** (FE: progress + badge + override switch)
  - [ ] 🟡 **[BO] เรท/เพดานจริง** ยังมาจาก mock — รอ backoffice API (D.1) แทน `hourlyRate`/`incomeLimit`

---

## 4. LINE OA & แจ้งเตือน — ❌ รอ BE (timeline ข้อ 4)

- [ ] ❌ **[BE] ยืนยันตัวตน/บทบาทผ่าน LINE OA** = งาน BE **C.4** (webhook + ผูก userId↔role)
- [ ] ❌ **[BE+FE] ลูกค้าแจ้งลา → push LINE แอดมิน** = BE **C.5** · FE (option) inbox/feed ในแอป
- [x] ✅ Toast แจ้งผล LINE หลัง confirm (อ่านจาก `notification.status` ที่ BE ส่งกลับ)

---

## 5. เพิ่มเติม — ฟอร์มสมัครคอร์ส/Voucher (FE pending, BE พร้อม)

- [ ] ❌ **[FE] ฟอร์มสมัครคอร์ส (recurring)** — ยิง `POST /courses` (BE B.4 พร้อมแล้ว) → preview คาบรายสัปดาห์
- [ ] ❌ **[FE] ฟอร์มซื้อ Voucher** — ยิง `POST /vouchers` (BE B.5 พร้อมแล้ว)
- [x] ✅ แสดงคอร์ส/โควตาการลา ([CoursePackagePanel.tsx](src/components/partials/Bookings/CoursePackagePanel.tsx))

---

## สรุป

| ส่วน | สถานะ |
|------|--------|
| Foundation (API wired + Auth/login) | ✅ เสร็จ |
| ปฏิทิน/จอง + Conflict + ครู/priority + Freelance limit (FE) | ✅ เสร็จ |
| ฟอร์มสมัครคอร์ส/Voucher (BE พร้อม) | ❌ FE pending |
| QR check-in · CRM level · LINE OA · notification inbox | ❌ รอ BE (C.1–C.5) |
| เรท/เพดานครูจาก backoffice | 🟡 รอ D.1 |

> **งาน FE ที่ทำได้โดยไม่รอ BE เหลือ:** ฟอร์มสมัครคอร์ส/Voucher (ข้อ 5) — ที่เหลือต้องรอ backend C.* / backoffice
