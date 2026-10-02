// Incoming webhooks from LINE, Meta (Facebook/Instagram) and TikTok Shop.
import { Router } from 'express';
import { recordIncoming } from '../integrations/chat.js';
import * as line from '../integrations/line.js';
import * as meta from '../integrations/meta.js';
import * as tiktok from '../integrations/tiktok.js';

const r = Router();

async function ingest(messages, getProfile) {
  for (const m of messages) {
    await recordIncoming({ ...m, getProfile: () => getProfile(m) }).catch((err) =>
      console.error(`[${m.platform}] บันทึกข้อความไม่สำเร็จ:`, err.message));
  }
}

// LINE
r.post('/line', (req, res) => {
  if (!line.verifySignature(req.rawBody, req.get('x-line-signature'))) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge quickly; LINE retries on slow responses
  ingest(line.parseWebhook(req.body), (m) => line.isConfigured() && line.getProfile(m.userId));
});

// Meta: verification handshake
r.get('/meta', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe' && meta.verifyToken() && req.query['hub.verify_token'] === meta.verifyToken();
  if (!ok) return res.sendStatus(403);
  res.send(req.query['hub.challenge']);
});

r.post('/meta', (req, res) => {
  if (!meta.verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200);
  ingest(meta.parseWebhook(req.body), (m) => meta.isConfigured() && meta.getProfile(m.platform, m.userId));
});

// TikTok Shop: order status change (type 1) → fetch the order and upsert it
r.post('/tiktok', (req, res) => {
  if (!tiktok.verifyWebhook(req.rawBody, req.get('authorization'))) return res.sendStatus(401);
  res.sendStatus(200);
  const orderId = req.body?.data?.order_id;
  if (req.body?.type === 1 && orderId) {
    tiktok.fetchOrdersByIds([String(orderId)]).catch((err) => console.error('[tiktok] webhook:', err.message));
  }
});

export default r;
