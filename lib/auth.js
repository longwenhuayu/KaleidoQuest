// 老师账号：scrypt 存密码，随机 token 做会话（HttpOnly cookie）
const crypto = require('crypto');
const { q } = require('./db');

const COOKIE = 'va_session';
const DAYS = 30;

function hash(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verify(pw, stored) {
  const [, salt, key] = String(stored).split('$');
  if (!salt || !key) return false;
  const k = Buffer.from(key, 'base64');
  return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(salt, 'base64'), k.length), k);
}

function cookies(header) {
  const out = {};
  String(header || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function startSession(res, teacherId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('INSERT INTO sessions (token, teacher_id, expires) VALUES (?, ?, ?)').run(token, teacherId, Date.now() + DAYS * 86400e3);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
function endSession(req, res) {
  const t = cookies(req.headers.cookie)[COOKIE];
  if (t) q('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
// 从请求（HTTP 或 WebSocket 握手）里找出当前老师
function teacherFrom(req) {
  const t = cookies(req.headers.cookie)[COOKIE];
  if (!t) return null;
  const row = q('SELECT t.id, t.email, t.name FROM sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.token = ? AND s.expires > ?').get(t, Date.now());
  return row || null;
}
function requireTeacher(req, res, next) {
  const t = teacherFrom(req);
  if (!t) return res.status(401).json({ error: 'login_required' });
  req.teacher = t;
  next();
}

// 登录失败限速：同一 IP 15 分钟内最多 10 次
const fails = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (fails.get(ip) || []).filter(t => now - t < 15 * 60e3);
  fails.set(ip, list);
  return list.length >= 10;
}
const recordFail = ip => fails.set(ip, [...(fails.get(ip) || []), Date.now()]);
setInterval(() => { q('DELETE FROM sessions WHERE expires < ?').run(Date.now()); fails.clear(); }, 6 * 3600e3).unref();

module.exports = { hash, verify, startSession, endSession, teacherFrom, requireTeacher, tooMany, recordFail };
