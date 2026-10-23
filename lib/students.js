// 班级和学生：老师建班、每个学生一个 4 位密码；学生也可以自己注册（用户名 + 密码），再用班级码加入班级
// 学生登录后，得到的卡由服务器记下来（换设备也在）
const crypto = require('crypto');
const { db, q } = require('./db');
const A = require('./auth');
const C = require('./cards');
const mail = require('./mail');

// 两种学生：老师建的（有 pin、class_id 必有）；自己注册的（有 username / pw，class_id 可以为空）
const STUDENTS = `(
  id INTEGER PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin TEXT,
  username TEXT UNIQUE COLLATE NOCASE,
  pw TEXT,
  parent_email TEXT,
  created INTEGER NOT NULL,
  UNIQUE (class_id, name)
)`;
db.exec(`
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students ${STUDENTS};`);
// 旧库的 students 表 class_id / pin 是 NOT NULL：按 SQLite 的做法建新表、搬数据、改名（关掉外键，免得连带删除卡册和记录）
if (!q('PRAGMA table_info(students)').all().some(c => c.name === 'username')) {
  db.exec(`PRAGMA foreign_keys = OFF; BEGIN;
    CREATE TABLE students_new ${STUDENTS};
    INSERT INTO students_new (id, class_id, name, pin, created) SELECT id, class_id, name, pin, created FROM students;
    DROP TABLE students;
    ALTER TABLE students_new RENAME TO students;
    COMMIT; PRAGMA foreign_keys = ON;`);
}
try { db.exec('ALTER TABLE students ADD COLUMN last_seen INTEGER'); } catch (e) {}
db.exec(`
-- 删班级（或删老师连带删班级）时：自己注册的学生只是退出班级，账号、卡册、记录都留着
CREATE TRIGGER IF NOT EXISTS classes_keep_own_accounts BEFORE DELETE ON classes BEGIN
  UPDATE students SET class_id = NULL WHERE class_id = OLD.id AND username IS NOT NULL;
END;
CREATE TABLE IF NOT EXISTS student_resets (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS student_sessions (
  token TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS student_cards (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  card TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  first INTEGER NOT NULL,
  PRIMARY KEY (student_id, card_id)
);
CREATE TABLE IF NOT EXISTS student_awards (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (student_id, reward_id)
);
CREATE TABLE IF NOT EXISTS student_results (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  at INTEGER NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  UNIQUE (student_id, ref)
);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes(teacher_id, created DESC);
CREATE INDEX IF NOT EXISTS student_results_at ON student_results(student_id, at DESC);
`);

const COOKIE = 'kq_student';
const DAYS = 180;
const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => { let c; do { c = Array.from({ length: 6 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join(''); } while (q('SELECT 1 FROM classes WHERE code = ?').get(c)); return c; };
const newPin = () => String(crypto.randomInt(10000)).padStart(4, '0');
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
const names = list => [...new Set((Array.isArray(list) ? list : String(list || '').split(/[\n,，、]+/)).map(cleanName).filter(Boolean))].slice(0, 60);

function studentFrom(req) {
  const t = A.cookies(req.headers.cookie)[COOKIE];
  if (!t) return null;
  const s = q('SELECT s.id, s.name, s.username, s.last_seen, s.class_id AS classId, c.name AS className FROM student_sessions x JOIN students s ON s.id = x.student_id LEFT JOIN classes c ON c.id = s.class_id WHERE x.token = ? AND x.expires > ?').get(t, Date.now());
  if (!s) return null;
  // 最后活跃时间：5 分钟记一次就够（和老师一样）
  if (!s.last_seen || Date.now() - s.last_seen > 5 * 60e3) q('UPDATE students SET last_seen = ? WHERE id = ?').run(Date.now(), s.id);
  delete s.last_seen;
  return s;
}
function startSession(res, studentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('INSERT INTO student_sessions (token, student_id, expires) VALUES (?, ?, ?)').run(token, studentId, Date.now() + DAYS * 86400e3);
  q('UPDATE students SET last_seen = ? WHERE id = ?').run(Date.now(), studentId);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
const USERNAME = /^[a-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// 老师帮自己注册的学生重设：给一个 6 位临时密码
const tempPw = () => Array.from({ length: 6 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');

// 发卡：同一次奖励只记一次（断线重连会重发）
function award(studentId, reward) {
  if (!studentId || !reward || !Array.isArray(reward.cards) || !reward.cards.length) return;
  if (!q('INSERT OR IGNORE INTO student_awards (student_id, reward_id, at) VALUES (?, ?, ?)').run(studentId, String(reward.id), Date.now()).changes) return;
  const up = q('INSERT INTO student_cards (student_id, card_id, card, n, first) VALUES (?, ?, ?, 1, ?) ON CONFLICT (student_id, card_id) DO UPDATE SET n = n + 1');
  for (const c of reward.cards) up.run(studentId, String(c.id), JSON.stringify(c), Date.now());
}

// 学习记录：登录的学生每玩完一局记一行（ref 去重，断线重连不重复记）；items = [[题目, 1 对 / 0 错]]
function record(studentId, x) {
  if (!studentId) return;
  q('INSERT OR IGNORE INTO student_results (student_id, ref, kind, title, at, score, correct, total, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(studentId, String(x.ref), x.kind, String(x.title || '').slice(0, 80), Date.now(), x.score | 0, x.correct | 0, x.total | 0, JSON.stringify(x.items || []));
}
function history(studentId) {
  const rows = q('SELECT kind, title, at, score, correct, total, items FROM student_results WHERE student_id = ? ORDER BY at DESC LIMIT 200').all(studentId);
  // 常错的题：按答错次数排，最多 10 道
  const m = new Map();
  for (const r of rows) for (const [p, c] of JSON.parse(r.items)) { const e = m.get(p) || { prompt: p, seen: 0, wrong: 0 }; e.seen++; if (!c) e.wrong++; m.set(p, e); }
  const missed = [...m.values()].filter(e => e.wrong).sort((a, b) => b.wrong - a.wrong || b.seen - a.seen).slice(0, 10);
  return { results: rows.map(({ items, ...r }) => r), missed };
}

// 重设密码链接发到家长邮箱（1 小时内有效、只能用一次）；学生自己申请和管理员代发共用
function sendReset(s, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('DELETE FROM student_resets WHERE student_id = ?').run(s.id);
  q('INSERT INTO student_resets (token_hash, student_id, expires) VALUES (?, ?, ?)').run(sha(token), s.id, Date.now() + 3600e3);
  const link = `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/reset?student=1&token=${token}`;
  return mail.send({
    to: s.parent_email,
    subject: `重设孩子的 KaleidoQuest 密码 / Reset your child's KaleidoQuest password`,
    text: `家长您好：\n\n您的孩子（用户名 ${s.username}）申请重设 KaleidoQuest 学生账号的密码。请在 1 小时内点下面的链接设置新密码：\n${link}\n\n如果不是孩子申请的，忽略这封邮件即可，密码不会改变。\n\n---\n\nHello,\n\nYour child (username ${s.username}) asked to reset their KaleidoQuest student password. Set a new one within 1 hour:\n${link}\n\nIf this wasn't them, just ignore this email.\n\nKaleidoQuest · kaleido.quest · by Vision Chinese Academy`
  });
}

// 登录失败限速：同一 IP 15 分钟 30 次；同一个学生 1 小时错 8 次就先锁住
const hits = new Map();
function limited(key, max, ms) { const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < ms); hits.set(key, list); return list.length >= max; }
const hit = key => hits.set(key, [...(hits.get(key) || []), Date.now()]);
setInterval(() => { hits.clear(); q('DELETE FROM student_sessions WHERE expires < ?').run(Date.now()); }, 6 * 3600e3).unref();

function routes(app) {
  // ── 老师：班级管理 ──
  const own = (req, res) => { const c = q('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(+req.params.id, req.teacher.id); if (!c) res.status(404).json({ error: 'not_found' }); return c; };
  const addStudents = (classId, list) => { const ins = q('INSERT OR IGNORE INTO students (class_id, name, pin, created) VALUES (?, ?, ?, ?)'); let n = 0; for (const nm of list) n += ins.run(classId, nm, newPin(), Date.now()).changes; return n; };
  app.get('/api/classes', A.requireTeacher, (req, res) => {
    res.json(q('SELECT c.id, c.name, c.code, c.created, (SELECT count(*) FROM students s WHERE s.class_id = c.id) AS n FROM classes c WHERE c.teacher_id = ? ORDER BY c.created DESC').all(req.teacher.id));
  });
  app.post('/api/classes', A.requireTeacher, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'name' });
    if (q('SELECT count(*) n FROM classes WHERE teacher_id = ?').get(req.teacher.id).n >= 30) return res.status(400).json({ error: 'too_many_classes' });
    const id = Number(q('INSERT INTO classes (teacher_id, name, code, created) VALUES (?, ?, ?, ?)').run(req.teacher.id, name, newCode(), Date.now()).lastInsertRowid);
    addStudents(id, names(req.body.names));
    res.json({ id });
  });
  app.get('/api/classes/:id', A.requireTeacher, (req, res) => {
    const c = own(req, res); if (!c) return;
    const rows = q('SELECT id, name, pin, username FROM students WHERE class_id = ? ORDER BY name').all(c.id);
    const counts = q("SELECT student_id, substr(card_id, 1, instr(card_id, ':') - 1) AS deck, count(*) AS n FROM student_cards WHERE student_id IN (SELECT id FROM students WHERE class_id = ?) GROUP BY student_id, deck").all(c.id);
    const by = {}; for (const r of counts) (by[r.student_id] = by[r.student_id] || {})[r.deck] = r.n;
    const sums = {}; for (const r of q('SELECT student_id, count(*) AS games, sum(correct) AS correct, sum(total) AS total, max(at) AS last FROM student_results WHERE student_id IN (SELECT id FROM students WHERE class_id = ?) GROUP BY student_id').all(c.id)) sums[r.student_id] = { games: r.games, rate: r.total ? Math.round(r.correct * 100 / r.total) : null, last: r.last };
    res.json({ id: c.id, name: c.name, code: c.code, students: rows.map(s => ({ ...s, cards: by[s.id] || {}, stats: sums[s.id] || { games: 0, rate: null, last: null } })) });
  });
  app.post('/api/classes/:id/students', A.requireTeacher, (req, res) => {
    const c = own(req, res); if (!c) return;
    const list = names(req.body.names);
    if (q('SELECT count(*) n FROM students WHERE class_id = ?').get(c.id).n + list.length > 60) return res.status(400).json({ error: 'too_many_students' });
    res.json({ added: addStudents(c.id, list) });
  });
  const ownStudent = (req, res) => { const c = own(req, res); if (!c) return null; const s = q('SELECT * FROM students WHERE id = ? AND class_id = ?').get(+req.params.sid, c.id); if (!s) res.status(404).json({ error: 'not_found' }); return s; };
  app.post('/api/classes/:id/students/:sid/pin', A.requireTeacher, (req, res) => {
    const s = ownStudent(req, res); if (!s) return;
    q('DELETE FROM student_sessions WHERE student_id = ?').run(s.id);
    hits.delete('stu:' + s.id);
    // 自己注册的学生：给临时密码（登录后可以自己再改）
    if (s.username) { const password = tempPw(); q('UPDATE students SET pw = ? WHERE id = ?').run(A.hash(password), s.id); return res.json({ password }); }
    const pin = newPin();
    q('UPDATE students SET pin = ? WHERE id = ?').run(pin, s.id);
    res.json({ pin });
  });
  app.get('/api/classes/:id/students/:sid/results', A.requireTeacher, (req, res) => { const s = ownStudent(req, res); if (!s) return; res.json({ name: s.name, ...history(s.id) }); });
  // 自己注册的学生只移出班级，账号留着；老师建的学生连同卡册、记录一起删除
  app.delete('/api/classes/:id/students/:sid', A.requireTeacher, (req, res) => { const s = ownStudent(req, res); if (!s) return; q(s.username ? 'UPDATE students SET class_id = NULL WHERE id = ?' : 'DELETE FROM students WHERE id = ?').run(s.id); res.json({ ok: true }); });
  app.delete('/api/classes/:id', A.requireTeacher, (req, res) => { const c = own(req, res); if (!c) return; q('DELETE FROM classes WHERE id = ?').run(c.id); res.json({ ok: true }); });

  // ── 学生：班级码 + 选名字 + 4 位密码 ──
  app.get('/api/class/:code', (req, res) => {
    if (limited('look:' + req.ip, 60, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    hit('look:' + req.ip);
    const c = q('SELECT id, name FROM classes WHERE code = ?').get(String(req.params.code).trim().toLowerCase());
    if (!c) return res.status(404).json({ error: 'not_found' });
    // 只列老师建的学生（用 4 位密码登录）；自己注册的用用户名登录
    res.json({ name: c.name, students: q('SELECT name FROM students WHERE class_id = ? AND username IS NULL ORDER BY name').all(c.id).map(s => s.name) });
  });
  app.post('/api/student/login', (req, res) => {
    if (limited('ip:' + req.ip, 30, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    const c = q('SELECT id FROM classes WHERE code = ?').get(String(req.body.code || '').trim().toLowerCase());
    const s = c && q('SELECT * FROM students WHERE class_id = ? AND name = ? AND pin IS NOT NULL').get(c.id, cleanName(req.body.name));
    if (s && limited('stu:' + s.id, 8, 3600e3)) return res.status(429).json({ error: 'locked' });
    const pin = String(req.body.pin || '').trim();
    if (!s || pin.length !== 4 || !crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(s.pin))) { hit('ip:' + req.ip); if (s) hit('stu:' + s.id); return res.status(401).json({ error: 'wrong' }); }
    startSession(res, s.id);
    res.json({ name: s.name });
  });
  // ── 学生自己注册：用户名 + 密码；家长邮箱选填（只用来找回密码）；可以顺便填班级码 ──
  app.post('/api/student/register', (req, res) => {
    if (limited('reg:' + req.ip, 100, 3600e3)) return res.status(429).json({ error: 'too_many' });
    const username = String(req.body.username || '').trim().toLowerCase(), pw = String(req.body.password || '');
    const name = cleanName(req.body.name) || username.slice(0, 16), parent = String(req.body.parentEmail || '').trim().toLowerCase();
    if (!USERNAME.test(username)) return res.status(400).json({ error: 'username' });
    if (pw.length < 6) return res.status(400).json({ error: 'password' });
    if (parent && (!EMAIL.test(parent) || parent.length > 120)) return res.status(400).json({ error: 'email' });
    if (q('SELECT 1 FROM students WHERE username = ?').get(username)) return res.status(409).json({ error: 'username_taken' });
    hit('reg:' + req.ip);
    const id = Number(q('INSERT INTO students (name, username, pw, parent_email, created) VALUES (?, ?, ?, ?, ?)').run(name, username, A.hash(pw), parent || null, Date.now()).lastInsertRowid);
    startSession(res, id);
    res.json({ name });
  });
  app.post('/api/student/login-user', (req, res) => {
    if (limited('ip:' + req.ip, 30, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    const s = q('SELECT * FROM students WHERE username = ?').get(String(req.body.username || '').trim().toLowerCase());
    if (s && limited('stu:' + s.id, 8, 3600e3)) return res.status(429).json({ error: 'locked' });
    if (!s || !A.verify(String(req.body.password || ''), s.pw)) { hit('ip:' + req.ip); if (s) hit('stu:' + s.id); return res.status(401).json({ error: 'wrong' }); }
    startSession(res, s.id);
    res.json({ name: s.name });
  });
  // 用班级码加入班级（只限自己注册的学生；换班就是加入新的班级）
  app.post('/api/student/join', (req, res) => {
    const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' });
    if (!s.username) return res.status(400).json({ error: 'class_account' });
    if (limited('look:' + req.ip, 60, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    hit('look:' + req.ip);
    const c = q('SELECT id, name FROM classes WHERE code = ?').get(String(req.body.code || '').trim().toLowerCase());
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (c.id === s.classId) return res.json({ className: c.name });
    if (q('SELECT 1 FROM students WHERE class_id = ? AND name = ?').get(c.id, s.name)) return res.status(409).json({ error: 'name_taken' });
    if (q('SELECT count(*) n FROM students WHERE class_id = ?').get(c.id).n >= 60) return res.status(400).json({ error: 'too_many_students' });
    q('UPDATE students SET class_id = ? WHERE id = ?').run(c.id, s.id);
    res.json({ className: c.name });
  });
  app.post('/api/student/password', (req, res) => {
    const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' });
    const row = q('SELECT pw FROM students WHERE id = ?').get(s.id), pw = String(req.body.password || '');
    if (!row.pw) return res.status(400).json({ error: 'class_account' });
    if (limited('stu:' + s.id, 8, 3600e3)) return res.status(429).json({ error: 'locked' });
    if (!A.verify(String(req.body.old || ''), row.pw)) { hit('stu:' + s.id); return res.status(401).json({ error: 'wrong' }); }
    if (pw.length < 6) return res.status(400).json({ error: 'password' });
    q('UPDATE students SET pw = ? WHERE id = ?').run(A.hash(pw), s.id);
    res.json({ ok: true });
  });
  // 忘记密码：发重设链接到家长邮箱（1 小时内有效、只能用一次）；没填家长邮箱就请班级老师重设
  app.post('/api/student/forgot', (req, res) => {
    if (process.env.NODE_ENV === 'production' && !mail.configured()) return res.status(503).json({ error: 'mail_off' });
    const username = String(req.body.username || '').trim().toLowerCase();
    if (limited('fg:' + req.ip, 10, 3600e3) || limited('fgu:' + username, 3, 3600e3)) return res.status(429).json({ error: 'too_many' });
    hit('fg:' + req.ip); hit('fgu:' + username);
    // 不管用户名在不在、有没有家长邮箱，都回一样的结果，免得被人拿来探测
    res.json({ ok: true });
    const s = q('SELECT id, name, username, parent_email FROM students WHERE username = ? AND parent_email IS NOT NULL').get(username);
    if (s) sendReset(s, req).catch(e => console.error('student reset mail failed', e.message));
  });
  app.post('/api/student/reset', (req, res) => {
    const pw = String(req.body.password || '');
    if (pw.length < 6) return res.status(400).json({ error: 'password' });
    const r = q('SELECT student_id FROM student_resets WHERE token_hash = ? AND expires > ?').get(sha(String(req.body.token || '')), Date.now());
    if (!r) return res.status(400).json({ error: 'expired' });
    q('UPDATE students SET pw = ? WHERE id = ?').run(A.hash(pw), r.student_id);
    q('DELETE FROM student_resets WHERE student_id = ?').run(r.student_id);
    q('DELETE FROM student_sessions WHERE student_id = ?').run(r.student_id);
    hits.delete('stu:' + r.student_id);
    startSession(res, r.student_id);
    res.json({ ok: true });
  });
  app.post('/api/student/logout', (req, res) => {
    const t = A.cookies(req.headers.cookie)[COOKIE];
    if (t) q('DELETE FROM student_sessions WHERE token = ?').run(t);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
  app.get('/api/student/me', (req, res) => { const s = studentFrom(req); s ? res.json({ name: s.name, className: s.className, username: s.username }) : res.status(401).json({ error: 'login_required' }); });
  app.get('/api/student/cards', (req, res) => {
    const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' });
    const book = {}; for (const r of q('SELECT * FROM student_cards WHERE student_id = ?').all(s.id)) book[r.card_id] = { card: JSON.parse(r.card), n: r.n, first: r.first };
    res.json(book);
  });
  // 登录时把这台设备上（没登录时）收集的卡并进账号：只认真实卡 id，张数取较大值（重复合并不会翻倍），每张最多记 20
  app.post('/api/student/cards/merge', (req, res) => {
    const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' });
    const list = Array.isArray(req.body.cards) ? req.body.cards.slice(0, 500) : [];
    const up = q('INSERT INTO student_cards (student_id, card_id, card, n, first) VALUES (?, ?, ?, ?, ?) ON CONFLICT (student_id, card_id) DO UPDATE SET n = max(n, excluded.n)');
    let merged = 0;
    for (const x of list) {
      const c = x && C.cardById(x.id); if (!c) continue;
      up.run(s.id, c.id, JSON.stringify(c), Math.min(20, Math.max(1, x.n | 0)), Date.now()); merged++;
    }
    res.json({ merged });
  });
  app.get('/api/student/results',(req, res) => { const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' }); res.json(history(s.id)); });
}
module.exports = { routes, studentFrom, award, record, history, sendReset, newPin, tempPw, cleanName, EMAIL, clearLock: id => hits.delete('stu:' + id) };
