# TODO — smart-scheduler-front

รายการสิ่งที่ต้องแก้/เพิ่ม โดยเทียบจาก **requirement2.md** (ฉบับล่าสุดหลังคุยกับลูกค้า) กับโค้ดปัจจุบัน
ของ repo นี้ (Frontoffice Web — Next.js 16 + Mantine v9, ตอนนี้ใช้ mock data)

> สถานะ: ✅ มีแล้ว · 🟡 มีบางส่วน/ต้องปรับ · ❌ ยังไม่มี
> Scope: **[FE]** ทำในรีโปนี้ได้ · **[BE]** ต้องมี backend (`smart-scheduler-back`) · **[BO]** เป็นของฝั่ง Backoffice

---

## 1. ระบบตารางเรียนและการจอง (Visual Calendar & Booking)
อ้างอิง: **requirement2.md ข้อ 1**

- [ ] 🟡 **[FE] ตัวกรองตารางตามรายชื่อครู (Filter by teacher)** บนหน้า Dashboard/ปฏิทิน
  - อ้างอิง: ข้อ 1 — *"เพิ่มฟังก์ชันตัวกรอง (Filter) เพื่อให้สามารถเลือกดูตารางตามรายชื่อครูผู้สอนได้"*
  - ปัจจุบัน: [CalendarHeader.tsx](src/components/partials/Calendar/CalendarHeader.tsx) มีแค่ปุ่มเลือกวัน/สัปดาห์ + legend ยัง **ไม่มี** ตัวกรองครู
  - ต้องทำ: เพิ่ม `MultiSelect`/`Select` ครู แล้ว filter `teachers`/`bookings` ที่ส่งเข้า `CalendarGrid` / `CalendarWeekGrid`

- [x] ✅ **[FE] Dropdown เลือกประเภทการจอง 4 ประเภท** (ตอนกดจองลงตาราง)
  - อ้างอิง: ข้อ 1 — *"1. ทดลองเรียน 2. จองรายครั้ง 3. คอร์สรายสัปดาห์ 4. ใช้ Voucher"*
  - ปัจจุบัน: มีครบใน [BookingModal.tsx `CreateForm`](src/components/partials/Calendar/Modal/BookingModal.tsx) + [Calendar.config.ts](src/components/partials/Calendar/Calendar.config.ts)
  - 🟡 ต้องปรับ: ปรับ label ให้ตรงสำนวนลูกค้า — ปัจจุบัน `SINGLE_SESSION = "รายชั่วโมง"` (req ใช้ "จองรายครั้ง / One time"), `COURSE_PACKAGE = "คอร์ส"` (req ใช้ "คอร์สรายสัปดาห์ / Weekly Course") ดู [types](src/types/app/scheduler/index.ts)

- [ ] ❌ **[FE+BE] การจัดการตารางชนกัน (Conflict Resolution)**
  - อ้างอิง: ข้อ 1 — *"หากสร้างคิวจองในวันที่มีการจองอยู่แล้ว ระบบจะมี Dropdown ให้เลือกวิธีจัดการกับการจองเก่า"*
  - ปัจจุบัน: [createBooking](src/services/scheduler.service.ts) push เข้า array ทันที **ไม่มีการตรวจชน** และ `CreateForm` ไม่มี UI จัดการ
  - ต้องทำ: ตรวจ slot ชน (ครู+วัน+เวลา ซ้ำ) → แสดง Dropdown ทางเลือกจัดการ **การจองเก่า**:
    1. ย้ายออกไปวันอื่น (เด้งเตือนให้ติดต่อตกลงกับผู้ปกครองก่อน)
    2. ย้ายไปสัปดาห์อื่น (เด้งเตือนให้ติดต่อตกลงกับผู้ปกครองก่อน)
    3. ย้ายไปให้ครูคนอื่นสอนแทน

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

- [ ] 🟡 **[FE] จัดลำดับความสำคัญครู (Priority Dropdown / drag reorder)**
  - อ้างอิง: ข้อ 3 — *"แอดมินจัดเรียงลำดับกลุ่มครูได้ตามต้องการ (ลาก Freelance ขึ้นบนสุด) ... ตอนจองระบบแนะนำ/กระจายงานตาม Priority ที่ตั้งไว้"*
  - ปัจจุบัน: ลำดับ **ฮาร์ดโค้ด** `FULL_TIME → PART_TIME → FREELANCE` ใน [TEACHER_TYPE_PRIORITY](src/types/app/scheduler/index.ts) และ `GROUP_ORDER` ใน [TeachersContent.tsx](src/components/partials/Teachers/TeachersContent.tsx) แก้ไม่ได้
  - ต้องทำ: เปลี่ยนเป็น priority ที่แอดมินตั้งเอง (drag-and-drop / dropdown) เก็บค่า แล้วใช้ลำดับนี้ตอนแนะนำครูในการจอง

- [ ] ❌ **[FE+BE] ควบคุมงบครู Freelance (Auto-Disable เมื่อถึง Limit รายได้)**
  - อ้างอิง: ข้อ 3 — *"ตั้ง Limit รายได้ครู Freelance ... ดึงเรทต่อชั่วโมงจากหลังบ้านมาคูณชั่วโมง ถ้าถึงลิมิตเดือนนั้น → Auto-Disable ซ่อนจาก Dashboard"*
  - ปัจจุบัน: `Teacher` มีแค่ `active` (เปิด/ปิดมือ) **ไม่มี** field เรท/ลิมิต/ชั่วโมงสะสม ดู [types](src/types/app/scheduler/index.ts)
  - ต้องทำ: [BE/BO] เก็บเรทต่อชั่วโมง + รายได้สะสมเดือนนี้ + ลิมิต · [FE] ตั้งค่าลิมิต + auto ปิด (`active=false`) เมื่อถึงลิมิต พร้อมเหตุผลที่แสดง

---

## 4. ระบบแจ้งเตือนและการยืนยันตัวตน (LINE OA & Notifications)
อ้างอิง: **requirement2.md ข้อ 4**

- [ ] ❌ **[BE] ยืนยันตัวตน + บทบาทผ่าน LINE OA (Role Verification)**
  - อ้างอิง: ข้อ 4 — *"ทักเข้า LINE OA → บอทถามบทบาท (1.ลูกค้า 2.ครู 3.แอดมิน) + กรอกรหัสยืนยัน (เช่น 'ขอรหัสแอดมิน : 229') → จดจำ chat ID คู่กับบทบาท"*
  - ปัจจุบัน: ยังไม่มี backend/integration LINE (FE มีแค่ comment `TODO(phase2)` ใน [scheduler.service.ts](src/services/scheduler.service.ts))
  - ต้องทำ: [BE] LINE webhook + bot flow ถามบทบาท/ตรวจรหัส + ผูก `userId` ↔ role (ใช้ outbox + audit ตาม root CLAUDE.md)

- [ ] ❌ **[BE+FE] ศูนย์กลางการแจ้งเตือน (ลูกค้าแจ้งลา → เด้งเข้า LINE แอดมิน)**
  - อ้างอิง: ข้อ 4 — *"ลูกค้าระบุตัวตนแล้ว การแจ้งลา/แจ้งเตือนจะถูกเด้งไปแสดงที่ LINE ของแอดมินโดยตรง"*
  - ปัจจุบัน: การลา set สถานะใน mock เท่านั้น ([markSickLeave](src/services/scheduler.service.ts)) ไม่มีการ push ไป LINE แอดมิน
  - ต้องทำ: [BE] push LINE หาแอดมินเมื่อมีคำขอลาจากลูกค้า · [FE] (option) inbox/feed รวมการแจ้งเตือนในแอป

> หมายเหตุ: ตาม root CLAUDE.md — **LINE push เป็นหน้าที่ของ backend เท่านั้น** browser ห้ามถือ token,
> และ **LINE Notify ปิดบริการแล้ว** ให้ใช้ LINE Messaging API (Official Account)

---

## 5. ระบบหลังบ้านแบบครบวงจร (Backoffice & API — Option C)
อ้างอิง: **requirement2.md ข้อ 5** — *อยู่นอก scope ของ repo นี้* (เป็นของ `smart-scheduler-backoffice-*`)
บันทึกไว้เพื่อความครบถ้วน + จุดที่ frontoffice ต้องเชื่อมต่อ

- [ ] ❌ **[BO] ระบบคลังสินค้า Mini ERP/POS** — คีย์รับเข้า/ตัดยอดเมื่อขาย (ข้อ 5)
- [ ] ❌ **[BO] API อิสระแบบ Jira** ให้ฝั่งจองตารางยิงมาตัดสต๊อก/ดึงเรทครู/ปรับข้อมูล (ข้อ 5)
  - จุดเชื่อมที่กระทบ repo นี้: ข้อ 3 (ดึง **เรทครู** มาคำนวณลิมิต) ต้องเรียกผ่าน API ตัวนี้

---

## สรุปลำดับความสำคัญที่แนะนำ (เฉพาะ [FE] ที่ทำได้เลยในรีโปนี้)

1. **ตัวกรองครูในปฏิทิน** (ข้อ 1) — เล็ก เห็นผลทันที
2. **ปรับ label ประเภทการจอง** ให้ตรงสำนวนลูกค้า (ข้อ 1)
3. **Conflict Resolution UI + logic** (ข้อ 1) — domain logic สำคัญ
4. **Priority ครูแบบจัดเรียงเองได้** (ข้อ 3)
5. งานที่เหลือ (CRM, QR/LINE, auto-deduct, income limit, notification center) ต้องรอ/ทำคู่กับ **backend**
