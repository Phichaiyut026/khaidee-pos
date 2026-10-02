import express from 'express';
import path from 'node:path';
import './db.js';
import { isAuthed, usingDefaultPassword } from './auth.js';
import { OrderError } from './orders.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import * as tiktok from './integrations/tiktok.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pub = path.resolve('public');

app.set('trust proxy', 1);
// Keep the raw body: LINE, Meta and TikTok webhooks are verified against it.
app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

app.use('/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

// TikTok seller authorization redirect (set as Redirect URL in TikTok Partner Center)
app.get('/integrations/tiktok/callback', async (req, res) => {
  if (!isAuthed(req)) return res.redirect('/admin/login.html');
  try {
    const shop = await tiktok.handleAuthCallback(String(req.query.code || ''));
    res.redirect(`/admin/#settings?tiktok=ok&shop=${encodeURIComponent(shop?.name || '')}`);
  } catch (err) {
    res.status(400).send(`เชื่อมต่อ TikTok Shop ไม่สำเร็จ: ${err.message}`);
  }
});

app.use('/admin', (req, res, next) => {
  if (req.path === '/login.html' || /\.(css|js|svg|png)$/.test(req.path) || isAuthed(req)) return next();
  res.redirect('/admin/login.html');
});
app.use('/admin', express.static(path.join(pub, 'admin')));
app.get('/', (req, res) => res.redirect('/admin/'));

app.use((err, req, res, next) => {
  const status = err instanceof OrderError ? err.status : err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'เกิดข้อผิดพลาดในระบบ' : err.message });
});

app.listen(PORT, () => {
  console.log(`🧾 หลังร้าน / POS   http://localhost:${PORT}/admin/`);
  if (usingDefaultPassword) console.warn('⚠️  ใช้รหัสผ่านเริ่มต้น "admin1234" — ตั้ง ADMIN_PASSWORD ในไฟล์ .env ก่อนใช้งานจริง');
  tiktok.startPolling();
});
