import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const COOKIE = 'pos_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

export const usingDefaultPassword = !process.env.ADMIN_PASSWORD;

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function isAuthed(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || !safeEqual(sig, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export function login(req, res) {
  if (!safeEqual(req.body?.password || '', PASSWORD)) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const expires = String(Date.now() + MAX_AGE_MS);
  res.cookie(COOKIE, `${expires}.${sign(expires)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: MAX_AGE_MS,
  });
  res.json({ ok: true });
}

export function logout(req, res) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
}
