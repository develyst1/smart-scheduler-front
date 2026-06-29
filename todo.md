# TODO — smart-scheduler-front

รายการสิ่งที่ต้องแก้/เพิ่ม โดยเทียบจาก **requirement2.md** (ฉบับล่าสุดหลังคุยกับลูกค้า) กับโค้ดปัจจุบัน
ของ repo นี้ (Frontoffice Web — Next.js 16 + Mantine v9, ตอนนี้ใช้ mock data)

> สถานะ: ✅ มีแล้ว/เสร็จแล้ว · 🟡 มีบางส่วน/ต้องปรับ · ❌ ยังไม่มี
> Scope: **[FE]** ทำในรีโปนี้ได้ · **[BE]** ต้องมี backend (`smart-scheduler-back`) · **[BO]** เป็นของฝั่ง Backoffice

---

## 1. ระบบตารางเรียนและการจอง (Visual Calendar & Booking)
อ้างอิง: **requirement2.md ข้อ 1**

- [x] ✅ **[FE] ตัวกรองตารางตามรายชื่อครู (Filter by teacher)** บนหน้า Dashboard/ปฏิทิน
  - อ้างอิง: ข้อ 1 — *"เพิ่มฟังก์ชันตัวกรอง (Filter) เพื่อให้สามารถเลือกดูตารางตามรายชื่อครูผู้สอนได้"*
  - ✅ เสร็จแล้ว: เพิ่ม `MultiSelect` กรองครู (เลือกหลายคนได้, ค้นหาได้) ใน [CalendarHeader.tsx](src/components/partials/Calendar/CalendarHeader.tsx) + state `selectedTeacherIds` ใน [CalendarContent.tsx](src/components/partials/Calendar/CalendarContent.tsx) — filter ก่อนส่งเข้า `CalendarGrid` / `CalendarWeekGrid`

- [x] ✅ **[FE] Dropdown เลือกประเภทการจอง 4 ประเภท** (ตอนกดจองลงตาราง)
  - อ้างอิง: ข้อ 1 — *"1. ทดลองเรียน 2. จองรายครั้ง 3. คอร์สรายสัปดาห์ 4. ใช้ Voucher"*
  - ✅ เสร็จแล้ว: มีครบใน [BookingModal.tsx `CreateForm`](src/components/partials/Calendar/Modal/BookingModal.tsx) + [Calendar.config.ts](src/components/partials/Calendar/Calendar.config.ts)
  - ✅ label ตรงสำนวนลูกค้าแล้ว: `SINGLE_SESSION = "จองรายครั้ง"`, `COURSE_PACKAGE = "คอร์สรายสัปดาห์"` ดู [types](src/types/app/scheduler/index.ts)

- [x] ✅ **[FE] การจัดการตารางชนกัน (Conflict Resolution)**
  - อ้างอิง: ข้อ 1 — *"หากสร้างคิวจองในวันที่มีการจองอยู่แล้ว ระบบจะมี Dropdown ให้เลือกวิธีจัดการกับการจองเก่า"*
  - ✅ เสร็จแล้ว: [BookingModal.tsx `CreateForm`](src/components/partials/Calendar/Modal/BookingModal.tsx) มี `detectConflict` + Dropdown 3 ทางเลือก (ย้ายวัน / ย้ายสัปดาห์ / ย้ายครู) + [scheduler.service.ts](src/services/scheduler.service.ts) มี `createBookingWithReschedule`, `confirmReschedule`, `cancelReschedule` ครบ
  - 🟡 เหลือ [BE]: ตอน wire API จริง ต้องย้าย conflict logic ไปฝั่ง backend (ป้องกัน race condition) + LINE push จริง

---

## 2. ระบบเช็คอิน กฎการลา และ CRM (Attendance, Policy & CRM)
อ้างอิง: **requirement2.md ข้อ 2**

- [ ] ❌ **[BE+FE] เช็คอิน/แจ้งลาผ่าน QR Code + LINE**
  - อ้างอิง: ข้อ 2 — *"ลงทะเบียนผ่าน LINE OA เพื่อรับ QR Code สำหรับเช็คอินเข้าเรียนตามเวลา หรือกดแจ้งลาผ่าน LINE"*
  - ปัจจุบัน: เช็คอิน/ลา ทำมือผ่านปุ่มในโมดอล ([BookingModal `ViewBooking`](src/components/partials/Calendar/Modal/BookingModal.tsx)) เท่านั้น **ไม่มี** QR / LINE flow
  - ต้องทำ: [BE] webhook LINE OA + ออก QR ต่อคาบ + endpoint เช็คอิน · [FE] หน้าจอแสดง/สแกน QR และสถานะเช็คอิน

- [ ] ❌ **[BE+FE] CRM สะสมแต้ม + จัดระดับลูกค้า (Gamification)**
  - อ้างอิง: ข้อ 2 — *"ทำตามกฎ (เช็คอินตรงเวลา/แจ้งลาตามระบบ) ได้คะแนนสะสม เพื่อจัด Level ลูกค้า ... ระดับสูงได้สิทธิประโยชน์/โปรโมชั่น/ลำดับความสำคัญ"*
  - ปัจจุบัน: **ไม่มี** model คะแนน/level ของลูกค้าเลย (มีแค่ `studentName` เป็น string ใน Booking/CoursePackage)
  - ต้องทำ: [BE] schema นักเรียน + แต้ม + level + กติกาให้แต้ม · [FE] แสดง badge/level ในหน้า การจอง/นักเรียน และผูกกับลำดับความสำคัญตอนจอง

- [ ] ❌ **[BE] ตัดโควตาคอร์สอัตโนมัติสิ้นวัน**
  - อ้างอิง: ข้อ 2 — *"ถึงเวลาสิ้นสุดวันแล้วไม่มีการสแกนเช็คอิน และไม่มีการแจ้งลา → ตัดโควตาคอร์สอัตโนมัติ"*
  - ปัจจุบัน: การหักคาบ/เปลี่ยนสถานะทำมือเท่านั้น **ไม่มี** job ตัดอัตโนมัติ
  - ต้องทำ: [BE] cron/scheduled job เมื่อสิ้นเวลา 18:00 (Asia/Bangkok) → คาบที่ไม่เช็คอิน & ไม่แจ้งลา ให้ตัด `usedSessions`/เปลี่ยนสถานะ (พิจารณาเชื่อม wallet ฝั่ง Backoffice)

---

## 3. การจัดการครูผู้สอน (Teacher Management)
อ้างอิง: **requirement2.md ข้อ 3**

- [x] ✅ **[FE] จัดลำดับความสำคัญครู (Priority drag reorder)**
  - อ้างอิง: ข้อ 3 — *"แอดมินจัดเรียงลำดับกลุ่มครูได้ตามต้องการ (ลาก Freelance ขึ้นบนสุด)"*
  - ✅ เสร็จแล้ว: [TeachersContent.tsx](src/components/partials/Teachers/TeachersContent.tsx) มี `DragDropContext` (drag-and-drop ลำดับประเภทครู) + [scheduler.service.ts](src/services/scheduler.service.ts) มี `setTeacherTypeOrder` + `getTeachers` เรียง bookings grid ตาม `teacherTypeOrder` อัตโนมัติ
  - 🟡 เหลือ [BE]: persist ลำดับใน DB จริง (ตอนนี้ in-memory only)

- [x] ✅ **[FE] ควบคุมงบครู Freelance (Auto-Disable เมื่อถึง Limit รายได้)**
  - อ้างอิง: ข้อ 3 — *"ตั้ง Limit รายได้ครู Freelance ... ถึงลิมิต → Auto-Disable ซ่อนจาก Dashboard"*
  - ✅ เสร็จแล้ว (FE): [TeachersContent.tsx `FreelanceRow`](src/components/partials/Teachers/TeachersContent.tsx) แสดง progress bar รายได้ vs เพดาน + badge "เกินเพดาน · ปิดอัตโนมัติ" + switch override · [types](src/types/app/scheduler/index.ts) มี `TeacherView.overLimit`, `bookable`, `monthlyIncome`, `monthlyHours`
  - ❌ เหลือ [BE/BO]: ดึงเรทและเพดานจาก back-office API จริง (ตอนนี้ `hourlyRate`/`incomeLimit` อยู่ใน mock data)

---

## 4. ระบบแจ้งเตือนและการยืนยันตัวตน (LINE OA & Notifications)
อ้างอิง: **requirement2.md ข้อ 4**

- [ ] ❌ **[BE] ยืนยันตัวตน + บทบาทผ่าน LINE OA (Role Verification)**
  - อ้างอิง: ข้อ 4 — *"ทักเข้า LINE OA → บอทถามบทบาท (1.ลูกค้า 2.ครู 3.แอดมิน) + กรอกรหัสยืนยัน (เช่น 'ขอรหัสแอดมิน : 229') → จดจำ chat ID คู่กับบทบาท"*
  - ปัจจุบัน: ยังไม่มี backend/integration LINE (scheduling API enqueue outbox แล้ว แต่ยังไม่มี worker/webhook)
  - ต้องทำ: [BE] LINE webhook + bot flow ถามบทบาท/ตรวจรหัส + ผูก `userId` ↔ role (ใช้ outbox + audit ตาม root CLAUDE.md)

- [ ] ❌ **[BE+FE] ศูนย์กลางการแจ้งเตือน (ลูกค้าแจ้งลา → เด้งเข้า LINE แอดมิน)**
  - อ้างอิง: ข้อ 4 — *"ลูกค้าระบุตัวตนแล้ว การแจ้งลา/แจ้งเตือนจะถูกเด้งไปแสดงที่ LINE ของแอดมินโดยตรง"*
  - ปัจจุบัน: การลา set สถานะใน mock เท่านั้น ([markSickLeave](src/services/scheduler.service.ts)) ไม่มีการ push ไป LINE แอดมิน
  - ต้องทำ: [BE] push LINE หาแอดมินเมื่อมีคำขอลาจากลูกค้า · [FE] (option) inbox/feed รวมการแจ้งเตือนในแอป

> หมายเหตุ: ตาม root CLAUDE.md — **LINE push เป็นหน้าที่ของ backend เท่านั้น** browser ห้ามถือ token,
> และ **LINE Notify ปิดบริการแล้ว** ให้ใช้ LINE Messaging API (Official Account)

---

## 5. ระบบหลังบ้านแบบครบวงจร (Backoffice & API — Option C)
อ้างอิง: **requirement2.md ข้อ 5** — **อยู่ในสัญญา Option C** (`smart-scheduler-backoffice-*`, build wave 2)
บันทึกไว้เพื่อความครบถ้วน + จุดที่ frontoffice ต้องเชื่อมต่อ

- [ ] ❌ **[BO] ระบบคลังสินค้า Mini ERP/POS** — คีย์รับเข้า/ตัดยอดเมื่อขาย (ข้อ 5)
- [ ] ❌ **[BO] API อิสระแบบ Jira** ให้ฝั่งจองตารางยิงมาตัดสต๊อก/ดึงเรทครู/ปรับข้อมูล (ข้อ 5)
  - จุดเชื่อมที่กระทบ repo นี้: ข้อ 3 (ดึง **เรทครู** มาคำนวณลิมิต) ต้องเรียกผ่าน API ตัวนี้

---

## สรุปสถานะ [FE] ทั้งหมด

| # | งาน | สถานะ |
|---|-----|-------|
| 1.1 | ตัวกรองครูในปฏิทิน | ✅ เสร็จ |
| 1.2 | label ประเภทการจอง (จองรายครั้ง / คอร์สรายสัปดาห์) | ✅ เสร็จ |
| 1.3 | Conflict Resolution UI + logic | ✅ เสร็จ |
| 3.1 | Priority ครูแบบ drag reorder | ✅ เสร็จ |
| 3.2 | Auto-disable Freelance เมื่อถึง income limit (FE ส่วน) | ✅ เสร็จ |
| 2.1 | QR / LINE check-in (FE ส่วน) | ❌ รอ BE |
| 2.2 | CRM badge/level นักเรียน (FE ส่วน) | ❌ รอ BE |
| 4.2 | Notification inbox/feed (FE ส่วน) | ❌ รอ BE |

> **งาน FE ที่ทำได้ล่วงหน้า (ไม่รอ BE) ทำครบทุกข้อแล้ว** — งาน scheduling ที่เหลือรอ backend (B.*); backoffice อยู่ใน Option C build wave 2
