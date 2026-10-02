import { Router } from 'express';
import { db, getSetting, setSetting } from '../db.js';
import { login, logout, requireAuth } from '../auth.js';
import { sseHandler, broadcast } from '../events.js';
import { createOrder, getOrder, setOrderStatus, OrderError } from '../orders.js';
import QRCode from 'qrcode';
import { promptPayQR } from '../promptpay.js';
import { recordIncoming, sendReply, PLATFORMS } from '../integrations/chat.js';
import * as line from '../integrations/line.js';
import * as meta from '../integrations/meta.js';
import * as tiktok from '../integrations/tiktok.js';

const r = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

r.post('/login', login);
r.post('/logout', logout);
r.use(requireAuth);
r.get('/me', (req, res) => res.json({ ok: true }));
r.get('/events', sseHandler);

// ---------- Dashboard ----------
r.get('/dashboard', (req, res) => {
  const today = "date(created_at, 'localtime') = date('now', 'localtime')";
  const byChannel = db.prepare(`SELECT channel, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
    FROM orders WHERE ${today} AND status != 'cancelled' GROUP BY channel`).all();
  const last7 = db.prepare(`SELECT date(created_at, 'localtime') AS day, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
    FROM orders WHERE status != 'cancelled' AND date(created_at, 'localtime') >= date('now', 'localtime', '-6 days')
    GROUP BY day ORDER BY day`).all();
  const topProducts = db.prepare(`SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' AND date(o.created_at, 'localtime') >= date('now', 'localtime', '-29 days')
    GROUP BY oi.name ORDER BY qty DESC LIMIT 5`).all();
  const lowStock = db.prepare('SELECT id, sku, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock').all();
  const pending = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending', 'paid') AND channel != 'pos'").get().n;
  const unread = db.prepare('SELECT COALESCE(SUM(unread), 0) AS n FROM conversations').get().n;
  res.json({ byChannel, last7, topProducts, lowStock, pending, unread });
});

// ---------- Products ----------
const PRODUCT_FIELDS = ['sku', 'barcode', 'name', 'description', 'category', 'price', 'cost', 'stock', 'image_url', 'active'];

function productValues(body) {
  const p = {};
  for (const f of PRODUCT_FIELDS) if (body[f] !== undefined) p[f] = body[f];
  for (const f of ['price', 'cost']) if (p[f] !== undefined) p[f] = Number(p[f]) || 0;
  for (const f of ['stock']) if (p[f] !== undefined) p[f] = Math.floor(Number(p[f]) || 0);
  for (const f of ['active']) if (p[f] !== undefined) p[f] = p[f] ? 1 : 0;
  return p;
}

r.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY active DESC, category, name').all());
});

r.post('/products', (req, res) => {
  const p = productValues(req.body);
  if (!p.sku || !p.name) return res.status(400).json({ error: 'กรุณากรอก SKU และชื่อสินค้า' });
  const cols = Object.keys(p);
  try {
    const { lastInsertRowid } = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map((c) => p[c]));
    broadcast('stock', {});
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'SKU นี้มีอยู่แล้ว' });
    throw err;
  }
});

r.put('/products/:id', (req, res) => {
  const p = productValues(req.body);
  const cols = Object.keys(p);
  if (!cols.length) return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะแก้ไข' });
  try {
    db.prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => p[c]), req.params.id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'SKU นี้มีอยู่แล้ว' });
    throw err;
  }
  broadcast('stock', {});
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

r.delete('/products/:id', (req, res) => {
  // Keep history intact: products referenced by orders are only deactivated.
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(req.params.id);
  if (used) db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  else db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  broadcast('stock', {});
  res.json({ ok: true, deactivated: Boolean(used) });
});

// ---------- POS checkout ----------
r.post('/sales', (req, res) => {
  const { items, discount, payment_method, cash_received, customer_name, note } = req.body;
  const method = payment_method || 'cash';
  let received = 0;
  const order = createOrder({
    channel: 'pos',
    status: 'completed',
    items,
    discount,
    payment_method: method,
    customer_name,
    note,
  }, {
    validate: ({ total }) => {
      if (method !== 'cash') return;
      received = cash_received === undefined || cash_received === '' ? total : Number(cash_received);
      if (!(received >= total)) throw new OrderError('รับเงินไม่พอ');
    },
  });
  if (method === 'cash') {
    db.prepare('UPDATE orders SET cash_received = ?, change_amount = ? WHERE id = ?').run(received, received - order.total, order.id);
  }
  res.json(getOrder(order.id));
});

// ---------- Orders (all channels) ----------
r.get('/orders', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.channel) { where.push('channel = ?'); params.push(req.query.channel); }
  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.q) {
    where.push('(order_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
    params.push(...Array(3).fill(`%${req.query.q}%`));
  }
  const sql = `SELECT id, order_no, channel, status, customer_name, customer_phone, total, payment_method, created_at
    FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...params));
});

r.get('/orders/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  res.json(order);
});

r.patch('/orders/:id', (req, res) => {
  res.json(setOrderStatus(Number(req.params.id), req.body.status));
});

// ---------- Unified chat ----------
r.get('/conversations', (req, res) => {
  const where = req.query.platform ? 'WHERE platform = ?' : '';
  const params = req.query.platform ? [req.query.platform] : [];
  res.json(db.prepare(`SELECT * FROM conversations ${where} ORDER BY last_message_at DESC LIMIT 300`).all(...params));
});

r.get('/conversations/:id/messages', (req, res) => {
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(req.params.id));
});

r.post('/conversations/:id/messages', wrap(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  res.json(await sendReply(Number(req.params.id), text));
}));

// Simulate an incoming message so the inbox can be tested before connecting real accounts.
r.post('/conversations/simulate', wrap(async (req, res) => {
  const platform = PLATFORMS.includes(req.body.platform) ? req.body.platform : 'line';
  const name = String(req.body.name || 'ลูกค้าทดสอบ');
  await recordIncoming({
    platform,
    userId: `demo-${platform}-${name}`,
    text: String(req.body.text || 'สวัสดีค่ะ สินค้ายังมีไหมคะ'),
    getProfile: async () => ({ name }),
  });
  res.json({ ok: true });
}));

// ---------- Integrations / settings ----------
r.get('/integrations', (req, res) => {
  res.json({
    line: { configured: line.isConfigured() },
    meta: { configured: meta.isConfigured(), webhook_ready: Boolean(meta.verifyToken()) },
    tiktok: tiktok.status(),
  });
});

r.post('/tiktok/sync', wrap(async (req, res) => {
  res.json(await tiktok.syncOrders());
}));

const SETTING_KEYS = ['shop_name', 'shop_phone', 'shop_address', 'promptpay_id', 'receipt_footer'];

r.get('/settings', (req, res) => {
  res.json(Object.fromEntries(SETTING_KEYS.map((k) => [k, getSetting(k)])));
});

r.put('/settings', (req, res) => {
  for (const k of SETTING_KEYS) if (req.body[k] !== undefined) setSetting(k, req.body[k]);
  res.json(Object.fromEntries(SETTING_KEYS.map((k) => [k, getSetting(k)])));
});

// QR images for product labels
r.post('/qr', wrap(async (req, res) => {
  const texts = Array.isArray(req.body.texts) ? req.body.texts.slice(0, 500).map(String) : [];
  const qrs = await Promise.all(texts.map((t) => QRCode.toDataURL(t, { margin: 1, width: 240, errorCorrectionLevel: 'M' })));
  res.json({ qrs });
}));

r.get('/promptpay', wrap(async (req, res) => {
  res.json({ qr: await promptPayQR(getSetting('promptpay_id'), Number(req.query.amount) || 0) });
}));

export default r;
