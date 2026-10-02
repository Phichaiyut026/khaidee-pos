// LINE Messaging API (LINE Official Account)
// Webhook URL to set in LINE Developers console: https://<your-domain>/webhooks/line
import crypto from 'node:crypto';

const API = 'https://api.line.me/v2/bot';
const token = () => process.env.LINE_CHANNEL_ACCESS_TOKEN;
const secret = () => process.env.LINE_CHANNEL_SECRET;

export const isConfigured = () => Boolean(token() && secret());

export function verifySignature(rawBody, signature) {
  if (!secret() || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret()).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function getProfile(userId) {
  const p = await call('GET', `/profile/${encodeURIComponent(userId)}`);
  return { name: p.displayName, avatar: p.pictureUrl };
}

export function pushText(userId, text) {
  return call('POST', '/message/push', { to: userId, messages: [{ type: 'text', text }] });
}

const LABELS = { image: '[รูปภาพ]', video: '[วิดีโอ]', audio: '[ข้อความเสียง]', file: '[ไฟล์]', location: '[ตำแหน่ง]', sticker: '[สติ๊กเกอร์]' };

/** Convert a LINE webhook body into normalized incoming messages. */
export function parseWebhook(body) {
  const out = [];
  for (const ev of body?.events || []) {
    if (ev.type !== 'message' || !ev.source?.userId) continue;
    const m = ev.message;
    out.push({
      platform: 'line',
      userId: ev.source.userId,
      text: m.type === 'text' ? m.text : LABELS[m.type] || `[${m.type}]`,
      externalId: `line:${m.id}`,
    });
  }
  return out;
}
