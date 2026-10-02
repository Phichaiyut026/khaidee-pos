// TikTok Shop Open API (version 202309) — pulls orders into the shared orders table.
// Docs: https://partner.tiktokshop.com/docv2
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from '../db.js';
import { upsertExternalOrder } from '../orders.js';

const API = 'https://open-api.tiktokglobalshop.com';
const AUTH_API = 'https://auth.tiktok-shops.com';
const appKey = () => process.env.TIKTOK_APP_KEY;
const appSecret = () => process.env.TIKTOK_APP_SECRET;

const accessToken = () => getSetting('tiktok_access_token') || process.env.TIKTOK_ACCESS_TOKEN || '';
const refreshToken = () => getSetting('tiktok_refresh_token') || process.env.TIKTOK_REFRESH_TOKEN || '';
const shopCipher = () => getSetting('tiktok_shop_cipher') || process.env.TIKTOK_SHOP_CIPHER || '';

export const hasApp = () => Boolean(appKey() && appSecret());
export const isConfigured = () => Boolean(hasApp() && accessToken());

export function authorizeUrl() {
  const serviceId = process.env.TIKTOK_SERVICE_ID;
  return serviceId ? `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(serviceId)}` : null;
}

export function status() {
  return {
    configured: isConfigured(),
    has_app: hasApp(),
    shop_name: getSetting('tiktok_shop_name'),
    last_sync: Number(getSetting('tiktok_last_sync')) || null,
    authorize_url: authorizeUrl(),
  };
}

// --- Request signing -------------------------------------------------------
function sign(path, query, body) {
  const keys = Object.keys(query).filter((k) => k !== 'sign' && k !== 'access_token').sort();
  const base = appSecret() + path + keys.map((k) => k + query[k]).join('') + (body || '') + appSecret();
  return crypto.createHmac('sha256', appSecret()).update(base).digest('hex');
}

async function request(method, path, { query = {}, body, withShop = true } = {}) {
  await ensureFreshToken();
  const q = { app_key: appKey(), timestamp: Math.floor(Date.now() / 1000), ...query };
  if (withShop && shopCipher()) q.shop_cipher = shopCipher();
  const bodyStr = body ? JSON.stringify(body) : '';
  q.sign = sign(path, q, bodyStr);
  const url = `${API}${path}?${new URLSearchParams(q)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-tts-access-token': accessToken() },
    body: bodyStr || undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (json.code !== 0) throw new Error(`TikTok API ${json.code ?? res.status}: ${json.message || res.statusText}`);
  return json.data;
}

// --- OAuth -----------------------------------------------------------------
function saveTokens(data) {
  setSetting('tiktok_access_token', data.access_token);
  setSetting('tiktok_refresh_token', data.refresh_token);
  setSetting('tiktok_access_expires', data.access_token_expire_in);
}

async function authCall(path, params) {
  const url = `${AUTH_API}${path}?${new URLSearchParams({ app_key: appKey(), app_secret: appSecret(), ...params })}`;
  const json = await (await fetch(url)).json();
  if (json.code !== 0) throw new Error(`TikTok auth ${json.code}: ${json.message}`);
  return json.data;
}

let refreshing = null;
async function ensureFreshToken() {
  const expires = Number(getSetting('tiktok_access_expires')) || 0;
  if (!refreshToken() || !expires || expires - Date.now() / 1000 > 3600) return;
  refreshing ??= authCall('/api/v2/token/refresh', { refresh_token: refreshToken(), grant_type: 'refresh_token' })
    .then(saveTokens)
    .finally(() => (refreshing = null));
  await refreshing;
}

/** Exchange the auth code from the seller-authorization redirect, then remember the shop cipher. */
export async function handleAuthCallback(code) {
  saveTokens(await authCall('/api/v2/token/get', { auth_code: code, grant_type: 'authorized_code' }));
  const data = await request('GET', '/authorization/202309/shops', { withShop: false });
  const shop = data.shops?.[0];
  if (shop) {
    setSetting('tiktok_shop_cipher', shop.cipher);
    setSetting('tiktok_shop_name', shop.name);
  }
  return shop;
}

// --- Orders ----------------------------------------------------------------
const STATUS_MAP = {
  UNPAID: 'pending',
  ON_HOLD: 'paid',
  AWAITING_SHIPMENT: 'paid',
  PARTIALLY_SHIPPING: 'paid',
  AWAITING_COLLECTION: 'paid',
  IN_TRANSIT: 'shipped',
  DELIVERED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const toSqlTime = (unix) => new Date(unix * 1000).toISOString().slice(0, 19).replace('T', ' ');

/** Map a TikTok order object to our order input. TikTok returns one line_item per unit, so group them. */
export function mapOrder(o) {
  const grouped = new Map();
  for (const li of o.line_items || []) {
    const key = `${li.seller_sku || li.sku_id}|${li.sale_price}`;
    const g = grouped.get(key);
    if (g) g.qty += 1;
    else grouped.set(key, {
      sku: li.seller_sku || '',
      name: [li.product_name, li.sku_name].filter(Boolean).join(' - '),
      price: Number(li.sale_price) || 0,
      qty: 1,
    });
  }
  const p = o.payment || {};
  const addr = o.recipient_address || {};
  return {
    channel: 'tiktok',
    external_id: String(o.id),
    order_no: `TT-${o.id}`,
    status: STATUS_MAP[o.status] || 'pending',
    customer_name: addr.name || '',
    customer_phone: addr.phone_number || '',
    customer_address: addr.full_address || '',
    items: [...grouped.values()],
    discount: (Number(p.seller_discount) || 0) + (Number(p.platform_discount) || 0),
    shipping: Number(p.shipping_fee) || 0,
    total: Number(p.total_amount) || 0,
    payment_method: o.payment_method_name || 'TikTok Shop',
    note: o.buyer_message || '',
    created_at: o.create_time ? toSqlTime(o.create_time) : null,
    raw: o,
  };
}

function saveOrders(orders) {
  let created = 0;
  let updated = 0;
  for (const o of orders) {
    const r = upsertExternalOrder(mapOrder(o));
    r.created ? created++ : updated++;
  }
  return { created, updated };
}

export async function syncOrders() {
  if (!isConfigured()) return demoSync();
  const since = Number(getSetting('tiktok_last_sync')) || Math.floor(Date.now() / 1000) - 7 * 86400;
  const startedAt = Math.floor(Date.now() / 1000);
  let pageToken;
  const totals = { created: 0, updated: 0 };
  do {
    const query = { page_size: 50, sort_field: 'update_time', sort_order: 'ASC' };
    if (pageToken) query.page_token = pageToken;
    const data = await request('POST', '/order/202309/orders/search', {
      query,
      body: { update_time_ge: since - 120, update_time_lt: startedAt },
    });
    const r = saveOrders(data.orders || []);
    totals.created += r.created;
    totals.updated += r.updated;
    pageToken = data.next_page_token;
  } while (pageToken);
  setSetting('tiktok_last_sync', startedAt);
  return { ...totals, demo: false };
}

export async function fetchOrdersByIds(ids) {
  const data = await request('GET', '/order/202309/orders', { query: { ids: ids.join(',') } });
  return saveOrders(data.orders || []);
}

/** Webhook: TikTok signs with HMAC-SHA256(app_secret, app_key + raw body) in the Authorization header. */
export function verifyWebhook(rawBody, signature) {
  if (!hasApp() || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', appSecret()).update(appKey() + rawBody.toString()).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Demo mode (no credentials yet) ---------------------------------------
const DEMO_NAMES = ['คุณมะลิ', 'คุณต้นกล้า', 'คุณน้ำฝน', 'คุณภูผา', 'คุณใบเตย'];
const DEMO_STATUSES = ['AWAITING_SHIPMENT', 'AWAITING_SHIPMENT', 'UNPAID', 'IN_TRANSIT', 'COMPLETED'];

function demoSync() {
  const products = db.prepare('SELECT * FROM products WHERE active = 1').all();
  if (!products.length) return { created: 0, updated: 0, demo: true };
  const orders = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
    const lines = [];
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const p = products[Math.floor(Math.random() * products.length)];
      const qty = 1 + Math.floor(Math.random() * 2);
      for (let q = 0; q < qty; q++) lines.push({ product_name: p.name, seller_sku: p.sku, sale_price: String(p.price) });
    }
    const subtotal = lines.reduce((s, l) => s + Number(l.sale_price), 0);
    return {
      id: String(5770000000000000000n + BigInt(Math.floor(Math.random() * 1e15))),
      status: DEMO_STATUSES[Math.floor(Math.random() * DEMO_STATUSES.length)],
      create_time: Math.floor(Date.now() / 1000),
      line_items: lines,
      payment: { total_amount: String(subtotal + 30), shipping_fee: '30', seller_discount: '0', platform_discount: '0' },
      recipient_address: { name: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], phone_number: '(+66)8*****123', full_address: 'กรุงเทพมหานคร (ข้อมูลตัวอย่าง)' },
      payment_method_name: 'TikTok Shop (Demo)',
    };
  });
  setSetting('tiktok_last_sync', Math.floor(Date.now() / 1000));
  return { ...saveOrders(orders), demo: true };
}

export function startPolling() {
  const minutes = Number(process.env.TIKTOK_SYNC_MINUTES) || 5;
  setInterval(() => {
    if (!isConfigured()) return;
    syncOrders().catch((err) => console.error('[tiktok] sync ล้มเหลว:', err.message));
  }, minutes * 60 * 1000).unref();
}
