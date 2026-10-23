// 班级和学生：老师建班、每个学生一个 4 位密码；学生登录后，得到的卡由服务器记下来（换设备也在）
const crypto = require('crypto');
const { db, q } = require('./db');
const A = require('./auth');

db.exec(`
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE (class_id, name)
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
  return q('SELECT s.id, s.name, s.class_id AS classId, c.name AS className FROM student_sessions x JOIN students s ON s.id = x.student_id JOIN classes c ON c.id = s.class_id WHERE x.token = ? AND x.expires > ?').get(t, Date.now()) || null;
}

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
    const rows = q('SELECT id, name, pin FROM students WHERE class_id = ? ORDER BY name').all(c.id);
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
    const pin = newPin();
    q('UPDATE students SET pin = ? WHERE id = ?').run(pin, s.id);
    q('DELETE FROM student_sessions WHERE student_id = ?').run(s.id);
    hits.delete('stu:' + s.id);
    res.json({ pin });
  });
  app.get('/api/classes/:id/students/:sid/results', A.requireTeacher, (req, res) => { const s = ownStudent(req, res); if (!s) return; res.json({ name: s.name, ...history(s.id) }); });
  app.delete('/api/classes/:id/students/:sid',A.requireTeacher, (req, res) => { const s = ownStudent(req, res); if (!s) return; q('DELETE FROM students WHERE id = ?').run(s.id); res.json({ ok: true }); });
  app.delete('/api/classes/:id', A.requireTeacher, (req, res) => { const c = own(req, res); if (!c) return; q('DELETE FROM classes WHERE id = ?').run(c.id); res.json({ ok: true }); });

  // ── 学生：班级码 + 选名字 + 4 位密码 ──
  app.get('/api/class/:code', (req, res) => {
    if (limited('look:' + req.ip, 60, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    hit('look:' + req.ip);
    const c = q('SELECT id, name FROM classes WHERE code = ?').get(String(req.params.code).trim().toLowerCase());
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json({ name: c.name, students: q('SELECT name FROM students WHERE class_id = ? ORDER BY name').all(c.id).map(s => s.name) });
  });
  app.post('/api/student/login', (req, res) => {
    if (limited('ip:' + req.ip, 30, 15 * 60e3)) return res.status(429).json({ error: 'too_many' });
    const c = q('SELECT id FROM classes WHERE code = ?').get(String(req.body.code || '').trim().toLowerCase());
    const s = c && q('SELECT * FROM students WHERE class_id = ? AND name = ?').get(c.id, cleanName(req.body.name));
    if (s && limited('stu:' + s.id, 8, 3600e3)) return res.status(429).json({ error: 'locked' });
    const pin = String(req.body.pin || '').trim();
    if (!s || pin.length !== 4 || !crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(s.pin))) { hit('ip:' + req.ip); if (s) hit('stu:' + s.id); return res.status(401).json({ error: 'wrong' }); }
    const token = crypto.randomBytes(32).toString('base64url');
    q('INSERT INTO student_sessions (token, student_id, expires) VALUES (?, ?, ?)').run(token, s.id, Date.now() + DAYS * 86400e3);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
    res.json({ name: s.name });
  });
  app.post('/api/student/logout', (req, res) => {
    const t = A.cookies(req.headers.cookie)[COOKIE];
    if (t) q('DELETE FROM student_sessions WHERE token = ?').run(t);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
  app.get('/api/student/me', (req, res) => { const s = studentFrom(req); s ? res.json({ name: s.name, className: s.className }) : res.status(401).json({ error: 'login_required' }); });
  app.get('/api/student/cards', (req, res) => {
    const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' });
    const book = {}; for (const r of q('SELECT * FROM student_cards WHERE student_id = ?').all(s.id)) book[r.card_id] = { card: JSON.parse(r.card), n: r.n, first: r.first };
    res.json(book);
  });
  app.get('/api/student/results', (req, res) => { const s = studentFrom(req); if (!s) return res.status(401).json({ error: 'login_required' }); res.json(history(s.id)); });
}
module.exports = { routes, studentFrom, award, record };
