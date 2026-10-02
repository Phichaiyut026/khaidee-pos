# KhaiDee POS (ขายดี)

ระบบ POS ร้านค้า รองรับเครื่องสแกนบาร์โค้ด/QR และ PDA · แชทรวม LINE, Instagram, Facebook · ดึงออเดอร์ TikTok Shop

ระบบเดียว ฐานข้อมูลเดียว ใช้สินค้าและสต็อกร่วมกันทุกช่องทาง

| ส่วน | URL | รายละเอียด |
|---|---|---|
| หลังร้าน / POS | `/admin/` | ขายหน้าร้าน (สแกนบาร์โค้ด, เงินทอน, พิมพ์ใบเสร็จ 80mm), จัดการสินค้า/สต็อก, ออเดอร์ทุกช่องทาง, แดชบอร์ด |
| แชทรวม | `/admin/#chat` | LINE OA + Facebook Page + Instagram ในหน้าเดียว ตอบกลับได้ทันที, แจ้งเตือนแบบ realtime, ข้อความด่วน |
| TikTok Shop | `/admin/#orders` | ดึงออเดอร์อัตโนมัติทุก 5 นาที + webhook, ตัดสต็อกโดยจับคู่ Seller SKU |

## เริ่มใช้งาน

ต้องใช้ Node.js 22.5 ขึ้นไป (ใช้ SQLite ที่มาในตัว Node ไม่ต้องติดตั้งฐานข้อมูลเพิ่ม)

```bash
npm install
cp .env.example .env   # แล้วแก้ ADMIN_PASSWORD และ SESSION_SECRET
npm run dev
```

เปิด http://localhost:3000 (จะพาไปหน้า POS / หลังร้านที่ `/admin/`)
ถ้ายังไม่ตั้ง `ADMIN_PASSWORD` รหัสผ่านเริ่มต้นคือ `admin1234`

ข้อมูลเก็บที่ `data/shop.db` (สำรองไฟล์นี้ไฟล์เดียวพอ) — ครั้งแรกระบบจะใส่สินค้าตัวอย่างให้ 8 รายการ

## เครื่องสแกนบาร์โค้ด / QR Code

รองรับเครื่องสแกนแบบ USB และ Bluetooth ที่ทำงานเป็นคีย์บอร์ด (HID / Keyboard mode — ค่าเริ่มต้นของเครื่องส่วนใหญ่) เสียบแล้วใช้ได้เลย ไม่ต้องลงไดรเวอร์

- **หน้าขาย (POS)** — ยิงได้ทันทีไม่ต้องคลิกช่องค้นหา สินค้าเข้าตะกร้าพร้อมเสียงบี๊บ (เสียงต่ำ = ไม่พบสินค้า/สต็อกไม่พอ) และการยิงสินค้าชิ้นถัดไปจะปิดหน้าใบเสร็จของลูกค้าคนก่อนให้เอง
- **ใช้ได้แม้แป้นพิมพ์เป็นภาษาไทย** — ระบบอ่านจากปุ่มจริงที่เครื่องสแกนกด จึงไม่กลายเป็นตัวอักษรไทย
- **หน้าสินค้า** — ยิงสินค้าที่มีอยู่จะเปิดหน้าแก้ไข ยิงสินค้าที่ยังไม่มีจะเปิดฟอร์มเพิ่มสินค้าพร้อมกรอกบาร์โค้ดให้
- **ในช่องกรอกข้อความ** (เช่น ช่องบาร์โค้ดในฟอร์มสินค้า) — รหัสจะถูกใส่ในช่องนั้นแทน
- **รูปแบบ QR ที่อ่านได้** — รหัสตรงๆ, `SKU:ABC-01`, JSON `{"sku":"ABC-01"}`, หรือ URL เช่น `https://.../p/ABC-01` หรือ `?sku=ABC-01` (จับคู่กับช่อง "บาร์โค้ด" หรือ "SKU" ของสินค้า)
- **สินค้าที่ไม่มีบาร์โค้ด** — หน้าสินค้า → **พิมพ์ป้าย QR** พิมพ์สติ๊กเกอร์ QR (A4, 4 ป้ายต่อแถว) ไปติดสินค้า กำหนดจำนวนได้ หรือใส่ตามจำนวนคงเหลือ

ตั้งค่าเครื่องสแกนให้ส่ง **Enter** ต่อท้าย (ค่าเริ่มต้นของเครื่องส่วนใหญ่) — ส่ง Tab หรือไม่ส่งอะไรเลยก็ใช้ได้ แต่ Enter เร็วและแม่นที่สุด

### เช็คสินค้า + เครื่อง PDA

- **เมนู "เช็คสินค้า"** — สแกนแล้วขึ้นชื่อ ราคา สต็อก ต้นทุน/กำไร ทันที พร้อมปุ่มปรับสต็อก / แก้ไข / ขายสินค้านี้ หน้าจอออกแบบให้ใช้บนมือถือและ PDA ได้
- **PDA จริง** (Android ที่มีหัวสแกนในตัว เช่น Zebra, Urovo, Sunmi, iData) — เปิดเบราว์เซอร์ไปที่ `http://<IP เครื่องที่รันระบบ>:3000/admin/#lookup` แล้วตั้งค่าแอปสแกนของเครื่อง (Scanner / DataWedge) เป็นโหมด **Keyboard / Keystroke output** และให้ส่ง Enter ต่อท้าย
- **เครื่อง PDA จำลอง** — `/admin/pda.html` (หรือเมนูซ้ายล่าง) สำหรับทดลองโดยไม่ต้องมีเครื่องจริง: คลิกเลือกสินค้า → กดปุ่ม SCAN หรือ Space / ดับเบิลคลิกเพื่อยิงทันที เลือกได้ว่าจะจำลองบาร์โค้ด / QR ลิงก์ / QR JSON, ความเร็วเครื่อง และแป้นพิมพ์ภาษาไทย หน้าจอของเครื่องคือระบบจริง (การขายใน POS ของเครื่องจำลองจะตัดสต็อกจริง)

## โหมดทดลอง

ทุกการเชื่อมต่อใช้งานได้ทันทีแม้ยังไม่มี API key:
- **แชท** — กด "จำลองข้อความเข้า" ข้อความที่ตอบกลับจะถูกบันทึกในระบบ (ป้าย "โหมดทดลอง")
- **TikTok** — กด "ดึงออเดอร์ TikTok" จะสร้างออเดอร์ตัวอย่างจากสินค้าในร้าน

เมื่อใส่ key ใน `.env` แล้วรีสตาร์ท ระบบจะสลับไปใช้ของจริงอัตโนมัติ

## เชื่อมต่อช่องทางจริง

> Webhook ต้องเป็น HTTPS ที่เข้าถึงได้จากอินเทอร์เน็ต — ตอนทดสอบในเครื่องใช้ `ngrok http 3000` หรือ `cloudflared tunnel` ได้
> URL ทั้งหมดดูได้ที่หน้า **ตั้งค่า / เชื่อมต่อ** ในหลังร้าน

### LINE Official Account
1. [LINE Developers Console](https://developers.line.biz/console/) → สร้าง Messaging API channel
2. คัดลอก **Channel secret** → `LINE_CHANNEL_SECRET` และออก **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
3. Webhook URL: `https://<โดเมน>/webhooks/line` → เปิด *Use webhook*
4. ใน LINE Official Account Manager ปิด *Auto-reply messages* (ไม่งั้นบอทจะตอบซ้ำ)

### Facebook Page + Instagram
1. [Meta for Developers](https://developers.facebook.com/apps/) → สร้างแอปประเภท Business → เพิ่ม **Messenger** และ **Instagram**
2. เชื่อมบัญชี Instagram Business/Creator เข้ากับ Facebook Page
3. ออก **Page access token** (สิทธิ์ `pages_messaging`, `instagram_basic`, `instagram_manage_messages`) → `META_PAGE_ACCESS_TOKEN`
4. **App secret** (Settings → Basic) → `META_APP_SECRET`
5. Webhooks → Callback URL `https://<โดเมน>/webhooks/meta`, Verify token = ค่าเดียวกับ `META_VERIFY_TOKEN`
   แล้ว subscribe ฟิลด์ `messages` ทั้งของ **Page** และ **Instagram**
6. ใช้งานกับลูกค้าทั่วไปต้องผ่าน App Review ของ Meta ก่อน (ระหว่างพัฒนาใช้ได้กับบัญชีที่เป็น tester ของแอป)

### TikTok Shop
1. [TikTok Shop Partner Center](https://partner.tiktokshop.com/) → สร้างแอป (Custom app สำหรับร้านตัวเอง) ขอสิทธิ์ Order
2. ใส่ `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_SERVICE_ID`
3. Redirect URL: `https://<โดเมน>/integrations/tiktok/callback`
4. Webhook URL: `https://<โดเมน>/webhooks/tiktok` (เลือก event *Order status change*)
5. เข้าหลังร้าน → ตั้งค่า → กด **อนุญาตร้านค้า TikTok** → ระบบจะเก็บ token + shop cipher และต่ออายุ token ให้อัตโนมัติ
6. **ตั้ง Seller SKU ใน TikTok ให้ตรงกับ SKU ในระบบ** ไม่งั้นออเดอร์จะเข้าแต่จะไม่ตัดสต็อก (มีป้าย "ไม่ตรง SKU" ในรายละเอียดออเดอร์)

## ตรรกะสต็อก
- ขายหน้าร้าน: ตรวจสต็อกก่อนขาย ตัดสต็อกทันที (ราคาดึงจากฐานข้อมูลเสมอ)
- TikTok: ตัดสต็อกเมื่อออเดอร์เข้า (ยอมให้ติดลบ เพราะขายไปแล้วบนแพลตฟอร์ม)
- เปลี่ยนสถานะเป็น "ยกเลิก" → คืนสต็อกอัตโนมัติ (รวมถึงออเดอร์ TikTok ที่ถูกยกเลิกบนแพลตฟอร์ม)

## โครงสร้างโค้ด
```
src/
  server.js              Express app + เส้นทางหลัก
  db.js                  SQLite schema + ข้อมูลตัวอย่าง
  orders.js              สร้างออเดอร์ / เปลี่ยนสถานะ / ตัด-คืนสต็อก (ใช้ร่วมทุกช่องทาง)
  auth.js                ล็อกอินหลังร้าน (cookie ลงลายเซ็น HMAC)
  events.js              Server-Sent Events สำหรับแจ้งเตือน realtime
  promptpay.js           สร้าง QR พร้อมเพย์ (EMVCo)
  routes/admin.js        API หลังร้าน
  routes/webhooks.js     รับ webhook LINE / Meta / TikTok (ตรวจลายเซ็นทุกครั้ง)
  integrations/          chat.js, line.js, meta.js, tiktok.js
public/
  admin/                 หลังร้าน + POS + แชทรวม
```

## ก่อนขึ้นระบบจริง
- ตั้ง `ADMIN_PASSWORD` และ `SESSION_SECRET` (ถ้าไม่ตั้ง SESSION_SECRET ทุกคนจะถูกล็อกเอาต์เมื่อรีสตาร์ท)
- รันหลัง HTTPS (เช่น Nginx/Caddy หรือ Railway/Render/VPS)
- สำรอง `data/shop.db` เป็นประจำ
