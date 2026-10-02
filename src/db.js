import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.resolve('data/shop.db');
mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'ทั่วไป',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL,              -- pos | tiktok
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | shipped | completed | cancelled
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT '',
  cash_received REAL DEFAULT 0,
  change_amount REAL DEFAULT 0,
  note TEXT DEFAULT '',
  stock_applied INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(channel, external_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  sku TEXT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,             -- line | instagram | facebook
  external_user_id TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  last_message TEXT DEFAULT '',
  last_message_at TEXT DEFAULT (datetime('now')),
  unread INTEGER NOT NULL DEFAULT 0,
  UNIQUE(platform, external_user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,            -- in | out
  text TEXT NOT NULL,
  external_id TEXT,
  status TEXT DEFAULT 'sent',         -- sent | failed | demo
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? '' : String(value));
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  const insert = db.prepare(`INSERT INTO products (sku, barcode, name, description, category, price, cost, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const items = [
    ['TS-WHT-M', '8850000000011', 'เสื้อยืดคอตตอน สีขาว (M)', 'ผ้าคอตตอน 100% นุ่ม ใส่สบาย', 'เสื้อผ้า', 290, 120, 40],
    ['TS-BLK-M', '8850000000028', 'เสื้อยืดคอตตอน สีดำ (M)', 'ผ้าคอตตอน 100% นุ่ม ใส่สบาย', 'เสื้อผ้า', 290, 120, 35],
    ['CAP-01', '8850000000035', 'หมวกแก๊ปปักโลโก้', 'ปรับขนาดได้ ผ้าแคนวาส', 'เครื่องประดับ', 350, 150, 20],
    ['BAG-TOTE', '8850000000042', 'กระเป๋าผ้าโท้ท', 'ผ้าแคนวาสหนา ใส่โน้ตบุ๊ก 14" ได้', 'กระเป๋า', 390, 160, 25],
    ['TUM-500', '8850000000059', 'แก้วเก็บความเย็น 500ml', 'สแตนเลส 304 เก็บเย็น 12 ชม.', 'ของใช้', 459, 210, 30],
    ['STK-SET', '8850000000066', 'สติ๊กเกอร์ไดคัท (เซ็ต 10 ชิ้น)', 'กันน้ำ ติดแก้ว/โน้ตบุ๊กได้', 'ของใช้', 99, 25, 100],
    ['CASE-IP15', '8850000000073', 'เคสโทรศัพท์ iPhone 15', 'เคสใสกันกระแทก', 'เครื่องประดับ', 250, 80, 15],
    ['SOCK-3P', '8850000000080', 'ถุงเท้า แพ็ค 3 คู่', 'ผ้าฝ้ายผสม ระบายอากาศดี', 'เสื้อผ้า', 149, 50, 4],
  ];
  tx(() => items.forEach((p) => insert.run(...p)));
  setSetting('shop_name', process.env.SHOP_NAME || 'ร้านของฉัน');
  setSetting('shop_phone', '');
  setSetting('shop_address', '');
  setSetting('promptpay_id', process.env.PROMPTPAY_ID || '');
  setSetting('receipt_footer', 'ขอบคุณที่อุดหนุนค่ะ 🙏');
}
seed();
