// Unified inbox core: every platform funnels incoming/outgoing messages through here.
import { db } from '../db.js';
import { broadcast } from '../events.js';
import * as line from './line.js';
import * as meta from './meta.js';

const senders = {
  line: { configured: line.isConfigured, send: (userId, text) => line.pushText(userId, text) },
  facebook: { configured: meta.isConfigured, send: (userId, text) => meta.sendText(userId, text) },
  instagram: { configured: meta.isConfigured, send: (userId, text) => meta.sendText(userId, text) },
};

export const PLATFORMS = Object.keys(senders);

/**
 * Record an incoming message. `getProfile` is called only for first-time contacts.
 */
export async function recordIncoming({ platform, userId, text, externalId, getProfile }) {
  if (externalId && db.prepare('SELECT 1 FROM messages WHERE external_id = ?').get(externalId)) return; // webhook retry

  let conv = db.prepare('SELECT * FROM conversations WHERE platform = ? AND external_user_id = ?').get(platform, userId);
  if (!conv) {
    let profile = {};
    try {
      profile = (await getProfile?.()) || {};
    } catch (err) {
      console.warn(`[${platform}] ไม่สามารถดึงโปรไฟล์ได้:`, err.message);
    }
    db.prepare('INSERT INTO conversations (platform, external_user_id, display_name, avatar_url) VALUES (?, ?, ?, ?)')
      .run(platform, userId, profile.name || `${platform} ${userId.slice(-6)}`, profile.avatar || '');
    conv = db.prepare('SELECT * FROM conversations WHERE platform = ? AND external_user_id = ?').get(platform, userId);
  }

  const { lastInsertRowid } = db.prepare('INSERT INTO messages (conversation_id, direction, text, external_id) VALUES (?, ?, ?, ?)')
    .run(conv.id, 'in', text, externalId || null);
  db.prepare("UPDATE conversations SET last_message = ?, last_message_at = datetime('now'), unread = unread + 1 WHERE id = ?")
    .run(text, conv.id);

  broadcast('message', { conversation_id: conv.id, message_id: Number(lastInsertRowid), direction: 'in', platform });
}

export async function sendReply(conversationId, text) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) throw Object.assign(new Error('ไม่พบห้องแชท'), { status: 404 });
  const sender = senders[conv.platform];

  let status = 'sent';
  let error = null;
  if (!sender?.configured()) {
    status = 'demo'; // no credentials yet: keep the message locally so the inbox still works
  } else {
    try {
      await sender.send(conv.external_user_id, text);
    } catch (err) {
      status = 'failed';
      error = err.message;
    }
  }

  const { lastInsertRowid } = db.prepare('INSERT INTO messages (conversation_id, direction, text, status, error) VALUES (?, ?, ?, ?, ?)')
    .run(conv.id, 'out', text, status, error);
  db.prepare("UPDATE conversations SET last_message = ?, last_message_at = datetime('now') WHERE id = ?").run(text, conv.id);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid);
  broadcast('message', { conversation_id: conv.id, message_id: message.id, direction: 'out', platform: conv.platform });
  return message;
}
