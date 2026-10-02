// Meta Messenger Platform: Facebook Page inbox + Instagram Direct (IG business account linked to the Page)
// Webhook URL to set in Meta App Dashboard: https://<your-domain>/webhooks/meta
import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';
const pageToken = () => process.env.META_PAGE_ACCESS_TOKEN;
const appSecret = () => process.env.META_APP_SECRET;
export const verifyToken = () => process.env.META_VERIFY_TOKEN;

export const isConfigured = () => Boolean(pageToken());

export function verifySignature(rawBody, header) {
  if (!appSecret() || !header || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret()).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(method, path, body) {
  const url = new URL(GRAPH + path);
  url.searchParams.set('access_token', pageToken());
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Meta API ${res.status}: ${json.error?.message || 'unknown error'}`);
  return json;
}

export async function getProfile(platform, userId) {
  if (platform === 'instagram') {
    const p = await graph('GET', `/${userId}?fields=name,username,profile_pic`);
    return { name: p.name || p.username, avatar: p.profile_pic };
  }
  const p = await graph('GET', `/${userId}?fields=first_name,last_name,profile_pic`);
  return { name: [p.first_name, p.last_name].filter(Boolean).join(' '), avatar: p.profile_pic };
}

export function sendText(recipientId, text) {
  return graph('POST', '/me/messages', {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
    message: { text },
  });
}

/** Convert a Meta webhook body (object = page | instagram) into normalized incoming messages. */
export function parseWebhook(body) {
  const platform = body?.object === 'instagram' ? 'instagram' : body?.object === 'page' ? 'facebook' : null;
  if (!platform) return [];
  const out = [];
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      if (!m || m.is_echo || !ev.sender?.id || ev.sender.id === entry.id) continue;
      const text = m.text || (m.attachments?.length ? `[${m.attachments[0].type || 'ไฟล์แนบ'}]` : '[ข้อความ]');
      out.push({ platform, userId: ev.sender.id, text, externalId: `${platform}:${m.mid}` });
    }
  }
  return out;
}
