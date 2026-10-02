// Shared order logic for every channel (POS, TikTok Shop) so stock stays in one place.
import { db, tx } from './db.js';
import { broadcast } from './events.js';

export const STATUSES = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
const PREFIX = { pos: 'POS', tiktok: 'TT' };

export class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function nextOrderNo(channel) {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `${PREFIX[channel] || 'ORD'}-${ymd}-`;
  const last = db.prepare('SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`);
  const n = last ? Number(last.order_no.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

// sign = -1 deducts stock, +1 returns it.
function applyStock(orderId, sign) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').all(orderId);
  const update = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  for (const it of items) update.run(sign * it.qty, it.product_id);
  db.prepare('UPDATE orders SET stock_applied = ? WHERE id = ?').run(sign < 0 ? 1 : 0, orderId);
}

/**
 * Resolve requested items against the product table.
 * items: [{ product_id? , sku?, name?, price?, qty }]
 * When trustPrices is false (POS), price & name always come from the database.
 */
function resolveItems(items, { trustPrices, enforceStock }) {
  if (!Array.isArray(items) || items.length === 0) throw new OrderError('ไม่มีสินค้าในคำสั่งซื้อ');
  const byId = db.prepare('SELECT * FROM products WHERE id = ?');
  const bySku = db.prepare('SELECT * FROM products WHERE sku = ?');
  return items.map((it) => {
    const qty = Math.floor(Number(it.qty));
    if (!(qty > 0)) throw new OrderError('จำนวนสินค้าไม่ถูกต้อง');
    const product = it.product_id ? byId.get(it.product_id) : it.sku ? bySku.get(it.sku) : null;
    if (!trustPrices) {
      if (!product || !product.active) throw new OrderError(`ไม่พบสินค้า ${it.product_id || it.sku || ''}`);
      if (enforceStock && product.stock < qty) throw new OrderError(`สินค้า "${product.name}" คงเหลือ ${product.stock} ชิ้น`);
      return { product_id: product.id, sku: product.sku, name: product.name, price: product.price, qty };
    }
    return {
      product_id: product ? product.id : null,
      sku: it.sku || product?.sku || '',
      name: it.name || product?.name || it.sku || 'สินค้า',
      price: Number(it.price ?? product?.price ?? 0),
      qty,
    };
  });
}

export function createOrder(input, { trustPrices = false, enforceStock = true, validate } = {}) {
  const order = tx(() => {
    const items = resolveItems(input.items, { trustPrices, enforceStock });
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const discount = Math.max(0, Number(input.discount) || 0);
    const shipping = Math.max(0, Number(input.shipping) || 0);
    const total = input.total != null ? Number(input.total) : Math.max(0, subtotal - discount + shipping);
    const status = STATUSES.includes(input.status) ? input.status : 'pending';
    validate?.({ subtotal, discount, shipping, total }); // may throw OrderError → rollback
    const orderNo = input.order_no || nextOrderNo(input.channel);

    const { lastInsertRowid: orderId } = db.prepare(`INSERT INTO orders
      (order_no, channel, external_id, status, customer_name, customer_phone, customer_address,
       subtotal, discount, shipping, total, payment_method, cash_received, change_amount, note, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`).run(
      orderNo, input.channel, input.external_id ?? null, status,
      input.customer_name || '', input.customer_phone || '', input.customer_address || '',
      subtotal, discount, shipping, total, input.payment_method || '',
      Number(input.cash_received) || 0, Number(input.change_amount) || 0, input.note || '',
      input.raw ? JSON.stringify(input.raw) : null, input.created_at ?? null,
    );

    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, sku, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    for (const it of items) insertItem.run(orderId, it.product_id, it.sku, it.name, it.price, it.qty);
    if (status !== 'cancelled') applyStock(orderId, -1);
    return getOrder(orderId);
  });
  broadcast('order', { id: order.id, order_no: order.order_no, channel: order.channel, total: order.total });
  broadcast('stock', {});
  return order;
}

export function setOrderStatus(orderId, status) {
  if (!STATUSES.includes(status)) throw new OrderError('สถานะไม่ถูกต้อง');
  const order = tx(() => {
    const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!current) throw new OrderError('ไม่พบคำสั่งซื้อ', 404);
    if (status === 'cancelled' && current.stock_applied) applyStock(orderId, +1);
    if (status !== 'cancelled' && !current.stock_applied) applyStock(orderId, -1);
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
    return getOrder(orderId);
  });
  broadcast('order', { id: order.id, order_no: order.order_no, channel: order.channel, status });
  broadcast('stock', {});
  return order;
}

/** Insert an order from an external marketplace, or update its status if we already have it. */
export function upsertExternalOrder(input) {
  const existing = db.prepare('SELECT id, status FROM orders WHERE channel = ? AND external_id = ?').get(input.channel, input.external_id);
  if (!existing) return { order: createOrder(input, { trustPrices: true, enforceStock: false }), created: true };
  if (existing.status !== input.status) setOrderStatus(existing.id, input.status);
  if (input.raw) db.prepare('UPDATE orders SET raw_json = ? WHERE id = ?').run(JSON.stringify(input.raw), existing.id);
  return { order: getOrder(existing.id), created: false };
}

export function getOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  delete order.raw_json;
  return order;
}
