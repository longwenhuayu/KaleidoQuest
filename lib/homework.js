// 作业模式：老师发链接，学生回家自己做；每题在服务器判分，同名取最好的一次
const crypto = require('crypto');
const { db, q } = require('./db');
const A = require('./auth');
const Q = require('./questions');
const C = require('./cards');
const S = require('./students');

db.exec(`
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  set_id INTEGER,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  questions TEXT NOT NULL,
  created INTEGER NOT NULL,
  due INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  qorder TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  qsent INTEGER NOT NULL DEFAULT 0,
  started INTEGER NOT NULL,
  finished INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS attempts_assignment ON attempts(assignment_id, name);
CREATE INDEX IF NOT EXISTS assignments_teacher ON assignments(teacher_id, created DESC);
`);

// 早期建的表没有 subject 列，补上
try { db.exec("ALTER TABLE assignments ADD COLUMN subject TEXT NOT NULL DEFAULT 'general'"); } catch (e) {}
try { db.exec('ALTER TABLE attempts ADD COLUMN student_id INTEGER'); } catch (e) {}

const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => { let c; do { c = Array.from({ length: 6 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join(''); } while (q('SELECT 1 FROM assignments WHERE code = ?').get(c)); return c; };
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
const shuffle = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const status = a => a.closed ? 'closed' : Date.now() > a.due ? 'due' : 'open';

// 学生开始 / 答题的频率限制：同一 IP 每小时 300 次请求
const hits = new Map();
function limited(ip) { const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 3600e3); list.push(now); hits.set(ip, list); return list.length > 300; }
setInterval(() => hits.clear(), 6 * 3600e3).unref();

// 把所有尝试汇总成和课堂报告一样的格式
function buildReport(a) {
  const qs = JSON.parse(a.questions);
  const rows = q('SELECT * FROM attempts WHERE assignment_id = ? AND finished IS NOT NULL ORDER BY score DESC, finished ASC').all(a.id);
  const best = new Map(), count = new Map();
  for (const r of rows) { count.set(r.name, (count.get(r.name) || 0) + 1); if (!best.has(r.name)) best.set(r.name, r); }
  const stats = qs.map(() => ({ answered: 0, correct: 0, ms: 0 }));
  const players = [...best.values()].map((r, i) => {
    const ans = JSON.parse(r.answers);
    Object.entries(ans).forEach(([k, v]) => { const s = stats[k]; if (s) { s.answered++; s.ms += v.ms; if (v.c) s.correct++; } });
    return { rank: i + 1, name: r.name, avatar: '📝', score: r.score, correct: r.correct, tries: count.get(r.name), best: 0, minutes: Math.round((r.finished - r.started) / 6e4), answers: qs.map((_, k) => ans[k] ? (ans[k].c ? 1 : 0) : null) };
  });
  return {
    title: a.title, mode: 'homework', total: qs.length, due: a.due,
    questions: qs.map((qq, i) => ({ prompt: qq.prompt || qq.speak, type: qq.type, answerText: Q.answerText(qq), answered: stats[i].answered, correct: stats[i].correct, avgMs: stats[i].answered ? Math.round(stats[i].ms / stats[i].answered) : 0 })),
    players
  };
}

module.exports = function routes(app) {
  // ── 老师 ──
  app.post('/api/assignments', A.requireTeacher, (req, res) => {
    const s = q('SELECT * FROM sets WHERE id = ? AND teacher_id = ?').get(+req.body.setId, req.teacher.id);
    if (!s) return res.status(404).json({ error: 'not_found' });
    const questions = Q.cleanAll(JSON.parse(s.questions));
    if (!questions.length) return res.status(400).json({ error: 'empty_set' });
    const due = Math.min(Date.now() + 60 * 86400e3, Math.max(Date.now() + 3600e3, +req.body.due || Date.now() + 7 * 86400e3));
    const tries = [0, 1, 2, 3].includes(+req.body.tries) ? +req.body.tries : 0;
    const title = String(req.body.title || s.title).trim().slice(0, 80) || s.title;
    const code = newCode();
    const id = Number(q('INSERT INTO assignments (teacher_id, set_id, code, title, questions, created, due, tries, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.teacher.id, s.id, code, title, JSON.stringify(questions), Date.now(), due, tries, s.subject).lastInsertRowid);
    res.json({ id, code });
  });
  app.get('/api/assignments', A.requireTeacher, (req, res) => {
    res.json(q(`SELECT a.id, a.code, a.title, a.created, a.due, a.tries, a.closed, json_array_length(a.questions) AS n,
      (SELECT count(DISTINCT name) FROM attempts t WHERE t.assignment_id = a.id AND t.finished IS NOT NULL) AS done
      FROM assignments a WHERE a.teacher_id = ? ORDER BY a.created DESC LIMIT 200`).all(req.teacher.id).map(a => ({ ...a, status: status(a) })));
  });
  const own = (req, res) => { const a = q('SELECT * FROM assignments WHERE id = ? AND teacher_id = ?').get(+req.params.id, req.teacher.id); if (!a) res.status(404).json({ error: 'not_found' }); return a; };
  app.get('/api/assignments/:id', A.requireTeacher, (req, res) => {
    const a = own(req, res); if (!a) return;
    res.json({ id: a.id, code: a.code, title: a.title, mode: 'homework', started: a.created, ended: Math.min(Date.now(), a.due), due: a.due, status: status(a), setId: a.set_id, report: buildReport(a) });
  });
  app.post('/api/assignments/:id/close', A.requireTeacher, (req, res) => { const a = own(req, res); if (!a) return; q('UPDATE assignments SET closed = ? WHERE id = ?').run(req.body.closed ? 1 : 0, a.id); res.json({ ok: true }); });
  app.delete('/api/assignments/:id', A.requireTeacher, (req, res) => { const a = own(req, res); if (!a) return; q('DELETE FROM assignments WHERE id = ?').run(a.id); res.json({ ok: true }); });

  // ── 学生（不用登录，凭作业码 + 尝试令牌）──
  const byCode = c => q('SELECT * FROM assignments WHERE code = ?').get(String(c || '').toLowerCase());
  app.get('/api/hw/:code', (req, res) => {
    const a = byCode(req.params.code);
    if (!a) return res.status(404).json({ error: 'not_found' });
    const t = q('SELECT name FROM teachers WHERE id = ?').get(a.teacher_id);
    res.json({ title: a.title, total: JSON.parse(a.questions).length, due: a.due, tries: a.tries, status: status(a), teacher: t ? t.name : '' });
  });
  function sendQuestion(res, a, at, extra = {}) {
    const qs = JSON.parse(a.questions), order = JSON.parse(at.qorder);
    if (at.pos >= order.length) {
      const r = q('UPDATE attempts SET finished = ? WHERE id = ? AND finished IS NULL').run(Date.now(), at.id);
      const fresh = q('SELECT * FROM attempts WHERE id = ?').get(at.id);
      const used = q('SELECT count(*) n FROM attempts WHERE assignment_id = ? AND name = ? AND finished IS NOT NULL').get(a.id, at.name).n;
      // 这个名字第一次做完才发卡（重做不发，免得刷卡）
      const reward = r.changes && used === 1 ? { id: `hw-${at.id}`, cards: C.draw(a.subject || 'general', qs, fresh.correct >= order.length * .8 ? 2 : 1) } : null;
      if (reward) S.award(at.student_id, reward);
      const ans = JSON.parse(fresh.answers);
      if (r.changes) S.record(at.student_id, { ref: `hw-${at.id}`, kind: 'homework', title: a.title, score: fresh.score, correct: fresh.correct, total: order.length, items: order.map(k => [qs[k].prompt || qs[k].speak, ans[k] ? ans[k].c : 0]) });
      return res.json({ ...extra, done: true, score: fresh.score, correct: fresh.correct, total: order.length, canRetry: status(a) === 'open' && (!a.tries || used < a.tries), first: !!r.changes, reward });
    }
    const qi = order[at.pos];
    q('UPDATE attempts SET qsent = ? WHERE id = ?').run(Date.now(), at.id);
    const qq = qs[qi];
    res.json({ ...extra, pos: at.pos, total: order.length, score: at.score, q: { ...Q.forPlayer(qq), ...(qq.speak ? { speak: qq.speak, lang: qq.lang } : {}) } });
  }
  app.post('/api/hw/:code/start', (req, res) => {
    if (limited(req.ip)) return res.status(429).json({ error: 'too_many' });
    const a = byCode(req.params.code);
    if (!a) return res.status(404).json({ error: 'not_found' });
    if (status(a) !== 'open') return res.status(403).json({ error: status(a) });
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'name' });
    if (a.tries) {
      const used = q('SELECT count(*) n FROM attempts WHERE assignment_id = ? AND name = ? AND finished IS NOT NULL').get(a.id, name).n;
      if (used >= a.tries) return res.status(403).json({ error: 'no_tries' });
    }
    const n = JSON.parse(a.questions).length, token = crypto.randomBytes(18).toString('base64url');
    const stu = S.studentFrom(req);
    q('INSERT INTO attempts (assignment_id, name, token, qorder, started, student_id) VALUES (?, ?, ?, ?, ?, ?)').run(a.id, name, token, JSON.stringify(shuffle(n)), Date.now(), stu ? stu.id : null);
    const at = q('SELECT * FROM attempts WHERE token = ?').get(token);
    sendQuestion(res, a, at, { token, name });
  });
  // 刷新页面后接着做
  app.post('/api/hw/:code/resume', (req, res) => {
    const a = byCode(req.params.code), at = a && q('SELECT * FROM attempts WHERE token = ? AND assignment_id = ?').get(String(req.body.token || ''), a.id);
    if (!at) return res.status(404).json({ error: 'not_found' });
    sendQuestion(res, a, at, { name: at.name });
  });
  app.post('/api/hw/:code/answer', (req, res) => {
    if (limited(req.ip)) return res.status(429).json({ error: 'too_many' });
    const a = byCode(req.params.code), at = a && q('SELECT * FROM attempts WHERE token = ? AND assignment_id = ?').get(String(req.body.token || ''), a.id);
    if (!at) return res.status(404).json({ error: 'not_found' });
    if (at.finished) return sendQuestion(res, a, at);
    if (+req.body.pos !== at.pos) return sendQuestion(res, a, at); // 重复提交：回到当前题
    const qs = JSON.parse(a.questions), qi = JSON.parse(at.qorder)[at.pos], qq = qs[qi];
    const ms = Math.max(0, Date.now() - at.qsent), correct = Q.check(qq, req.body.ans);
    // 和课堂一样：答对最快 1000，最慢 500；作业不计连对
    const points = correct ? Math.round(1000 * (1 - Math.min(1, ms / (qq.time * 1000)) / 2)) : 0;
    const answers = JSON.parse(at.answers); answers[qi] = { c: correct ? 1 : 0, ms };
    q('UPDATE attempts SET pos = pos + 1, score = score + ?, correct = correct + ?, answers = ? WHERE id = ? AND pos = ?').run(points, correct ? 1 : 0, JSON.stringify(answers), at.id, at.pos);
    const next = q('SELECT * FROM attempts WHERE id = ?').get(at.id);
    sendQuestion(res, a, next, { result: { correct, points, answerText: Q.answerText(qq), note: qq.note || '' } });
  });
};
