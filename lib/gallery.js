// Gallery：现成的游戏，免登录单人试玩、访客投屏开局；登录的老师可以复制到自己的题包
const crypto = require('crypto');
const { q } = require('./db');
const A = require('./auth');
const Q = require('./questions');
const C = require('./cards');
const S = require('./students');

const SETS = require('./data/gallery.json').map(s => ({ ...s, questions: Q.cleanAll(s.questions) }));
const byId = new Map(SETS.map(s => [s.id, s]));
const COLLECTIONS = require('./data/collections.json');
// 节日专题：按新加坡日期，正在进行的排前面；都不在时间内就给下一个
function collections(now = new Date()) {
  const md = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', month: '2-digit', day: '2-digit' }).format(now); // MM-DD
  const ahead = c => { const [m, d] = c.from.split('-').map(Number), [m0, d0] = md.split('-').map(Number); return ((m - m0) * 31 + (d - d0) + 372) % 372; };
  return COLLECTIONS.map(c => ({ ...c, active: c.from <= md && md <= c.to })).sort((a, b) => (b.active - a.active) || ahead(a) - ahead(b));
}

// 单人试玩只放在内存里（不写库），3 小时后清掉
const tries = new Map();
const MAX_TRIES = 5000;
setInterval(() => { const old = Date.now() - 3 * 3600e3; for (const [k, t] of tries) if (t.started < old) tries.delete(k); }, 10 * 60e3).unref();

const hits = new Map();
function limited(key, max, ms = 3600e3) { const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < ms); list.push(now); hits.set(key, list); return list.length > max; }
setInterval(() => hits.clear(), 6 * 3600e3).unref();
const shuffle = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const brief = s => ({ id: s.id, subject: s.subject, collection: s.collection || null, grade: s.grade, title: s.title, desc: s.desc, n: s.questions.length, types: [...new Set(s.questions.map(x => x.type))], listening: s.questions.some(x => x.speak) });

function routes(app) {
  app.get('/api/gallery', (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(SETS.map(brief)); });
  app.get('/api/collections', (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(collections()); });
  app.post('/api/gallery/:id/copy', A.requireTeacher, (req, res) => {
    const s = byId.get(req.params.id); if (!s) return res.status(404).json({ error: 'not_found' });
    const title = (req.body.lang === 'en' ? s.title[1] : s.title[0]).slice(0, 80);
    const id = Number(q('INSERT INTO sets (teacher_id, title, subject, grade, questions, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.teacher.id, title, s.subject, s.grade[0], JSON.stringify(s.questions), Date.now()).lastInsertRowid);
    res.json({ id });
  });

  // ── 单人试玩：接口形状和作业一样，前端共用 hw.html ──
  app.get('/api/try/:id', (req, res) => {
    const s = byId.get(req.params.id); if (!s) return res.status(404).json({ error: 'not_found' });
    res.json({ ...brief(s), total: s.questions.length, status: 'open', tryMode: true });
  });
  function sendQuestion(res, s, t, extra = {}) {
    if (t.pos >= t.order.length) {
      const first = !t.finished;
      if (first) { t.finished = Date.now(); t.reward = { id: `try-${t.token}`, cards: C.draw(s.subject, s.questions, t.correct >= t.order.length * .8 ? 2 : 1) }; S.award(t.studentId, t.reward); S.record(t.studentId, { ref: t.reward.id, kind: 'try', title: s.title[0], score: t.score, correct: t.correct, total: t.order.length, items: t.order.map(k => [s.questions[k].prompt || s.questions[k].speak, t.right[k] ? 1 : 0]) }); }
      return res.json({ ...extra, done: true, score: t.score, correct: t.correct, total: t.order.length, canRetry: true, first, reward: t.reward });
    }
    const qq = s.questions[t.order[t.pos]];
    t.qsent = Date.now();
    res.json({ ...extra, pos: t.pos, total: t.order.length, score: t.score, q: { ...Q.forPlayer(qq), ...(qq.speak ? { speak: qq.speak, lang: qq.lang } : {}) } });
  }
  app.post('/api/try/:id/start', (req, res) => {
    const s = byId.get(req.params.id); if (!s) return res.status(404).json({ error: 'not_found' });
    if (limited('try:' + req.ip, 120)) return res.status(429).json({ error: 'too_many' });
    if (tries.size >= MAX_TRIES) { const oldest = [...tries.entries()].sort((a, b) => a[1].started - b[1].started)[0]; tries.delete(oldest[0]); }
    const token = crypto.randomBytes(18).toString('base64url');
    const t = { token, id: s.id, name: String(req.body.name || '').trim().slice(0, 20), order: shuffle(s.questions.length), pos: 0, score: 0, correct: 0, right: {}, started: Date.now(), qsent: 0, studentId: (S.studentFrom(req) || {}).id };
    tries.set(token, t);
    sendQuestion(res, s, t, { token, name: t.name });
  });
  const find = (req, res) => { const t = tries.get(String(req.body.token || '')); const s = t && byId.get(req.params.id); if (!t || !s || t.id !== s.id) { res.status(404).json({ error: 'not_found' }); return []; } return [s, t]; };
  app.post('/api/try/:id/resume', (req, res) => { const [s, t] = find(req, res); if (t) sendQuestion(res, s, t, { name: t.name }); });
  app.post('/api/try/:id/answer', (req, res) => {
    if (limited('tryans:' + req.ip, 2000)) return res.status(429).json({ error: 'too_many' });
    const [s, t] = find(req, res); if (!t) return;
    if (t.finished || +req.body.pos !== t.pos) return sendQuestion(res, s, t);
    const qq = s.questions[t.order[t.pos]], ms = Math.max(0, Date.now() - t.qsent), correct = Q.check(qq, req.body.ans);
    const points = correct ? Math.round(1000 * (1 - Math.min(1, ms / (qq.time * 1000)) / 2)) : 0;
    if (correct) t.right[t.order[t.pos]] = 1;
    t.pos++; t.score += points; if (correct) t.correct++;
    sendQuestion(res, s, t, { result: { correct, points, answerText: Q.answerText(qq), note: qq.note || '' } });
  });
}

// 访客投屏开局：同一 IP 每小时最多 10 局
function guestRoomAllowed(ip) { return !limited('guestroom:' + ip, 10); }

module.exports = { routes, byId, guestRoomAllowed, collections };
