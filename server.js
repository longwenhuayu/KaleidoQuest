// KaleidoQuest — 课堂实时答题游戏（kaleido.quest，by Vision Chinese Academy）
const fs = require('fs');
const path = require('path');
for (const line of (fs.existsSync(path.join(__dirname, '.env')) ? fs.readFileSync(path.join(__dirname, '.env'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { q } = require('./lib/db');
const A = require('./lib/auth');
const Q = require('./lib/questions');
const G = require('./lib/game');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });

// ── 账号 ──
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
app.post('/api/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), name = String(req.body.name || '').trim().slice(0, 40), pw = String(req.body.password || '');
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'email' });
  if (!name) return res.status(400).json({ error: 'name' });
  if (pw.length < 8) return res.status(400).json({ error: 'password' });
  if (q('SELECT 1 FROM teachers WHERE email = ?').get(email)) return res.status(409).json({ error: 'exists' });
  const id = Number(q('INSERT INTO teachers (email, name, pw, created) VALUES (?, ?, ?, ?)').run(email, name, A.hash(pw), Date.now()).lastInsertRowid);
  A.startSession(res, id);
  res.json({ id, email, name });
});
app.post('/api/login', (req, res) => {
  if (A.tooMany(req.ip)) return res.status(429).json({ error: 'too_many' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const t = q('SELECT * FROM teachers WHERE email = ?').get(email);
  if (!t || !A.verify(String(req.body.password || ''), t.pw)) { A.recordFail(req.ip); return res.status(401).json({ error: 'wrong' }); }
  A.startSession(res, t.id);
  res.json({ id: t.id, email: t.email, name: t.name });
});
app.post('/api/logout', (req, res) => { A.endSession(req, res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => { const t = A.teacherFrom(req); t ? res.json(t) : res.status(401).json({ error: 'login_required' }); });

// ── 题包 ──
const SUBJECTS = new Set(['chinese', 'math', 'english', 'science', 'general', 'malay', 'tamil']);
const setOut = s => ({ id: s.id, title: s.title, subject: s.subject, grade: s.grade, updated: s.updated, questions: JSON.parse(s.questions) });
const setIn = b => ({ title: String(b.title || '').trim().slice(0, 80) || '未命名题包', subject: SUBJECTS.has(b.subject) ? b.subject : 'general', grade: String(b.grade || '').slice(0, 30), questions: Q.cleanAll(b.questions) });
app.get('/api/sets', A.requireTeacher, (req, res) => {
  res.json(q('SELECT id, title, subject, grade, updated, json_array_length(questions) AS n FROM sets WHERE teacher_id = ? ORDER BY updated DESC').all(req.teacher.id));
});
app.post('/api/sets', A.requireTeacher, (req, res) => {
  const s = setIn(req.body);
  const id = Number(q('INSERT INTO sets (teacher_id, title, subject, grade, questions, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.teacher.id, s.title, s.subject, s.grade, JSON.stringify(s.questions), Date.now()).lastInsertRowid);
  res.json({ id, dropped: (Array.isArray(req.body.questions) ? req.body.questions.length : 0) - s.questions.length });
});
const ownSet = (req, res) => { const s = q('SELECT * FROM sets WHERE id = ? AND teacher_id = ?').get(+req.params.id, req.teacher.id); if (!s) res.status(404).json({ error: 'not_found' }); return s; };
app.get('/api/sets/:id', A.requireTeacher, (req, res) => { const s = ownSet(req, res); if (s) res.json(setOut(s)); });
app.put('/api/sets/:id', A.requireTeacher, (req, res) => {
  if (!ownSet(req, res)) return;
  const s = setIn(req.body);
  q('UPDATE sets SET title = ?, subject = ?, grade = ?, questions = ?, updated = ? WHERE id = ?').run(s.title, s.subject, s.grade, JSON.stringify(s.questions), Date.now(), +req.params.id);
  res.json({ ok: true, n: s.questions.length, dropped: (Array.isArray(req.body.questions) ? req.body.questions.length : 0) - s.questions.length });
});
app.post('/api/sets/:id/copy', A.requireTeacher, (req, res) => {
  const s = ownSet(req, res); if (!s) return;
  const id = Number(q('INSERT INTO sets (teacher_id, title, subject, grade, questions, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.teacher.id, (s.title + '（副本）').slice(0, 80), s.subject, s.grade, s.questions, Date.now()).lastInsertRowid);
  res.json({ id });
});
app.delete('/api/sets/:id', A.requireTeacher, (req, res) => { if (!ownSet(req, res)) return; q('DELETE FROM sets WHERE id = ?').run(+req.params.id); res.json({ ok: true }); });

// ── 赛后报告 ──
app.get('/api/games', A.requireTeacher, (req, res) => {
  res.json(q("SELECT id, title, mode, started, ended, json_array_length(report, '$.players') AS players FROM games WHERE teacher_id = ? ORDER BY ended DESC LIMIT 100").all(req.teacher.id));
});
app.get('/api/games/:id', A.requireTeacher, (req, res) => {
  const g = q('SELECT * FROM games WHERE id = ? AND teacher_id = ?').get(+req.params.id, req.teacher.id);
  if (!g) return res.status(404).json({ error: 'not_found' });
  res.json({ id: g.id, title: g.title, mode: g.mode, started: g.started, ended: g.ended, setId: g.set_id, report: JSON.parse(g.report) });
});
app.delete('/api/games/:id', A.requireTeacher, (req, res) => { q('DELETE FROM games WHERE id = ? AND teacher_id = ?').run(+req.params.id, req.teacher.id); res.json({ ok: true }); });

app.get('/api/health', (req, res) => res.json({ ok: true, rooms: G.rooms.size }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// ── WebSocket：主持人和学生都走这里 ──
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', (ws, req) => {
  let room = null, player = null, isHost = false, count = 0, windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    // 每个连接每秒最多 20 条
    if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
    if (++count > 20) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'host' || m.t === 'host_resume') {
      const teacher = A.teacherFrom(req);
      if (!teacher) return G.send(ws, { t: 'error', error: 'login_required' });
      if (m.t === 'host') {
        const s = q('SELECT * FROM sets WHERE id = ? AND teacher_id = ?').get(+m.setId, teacher.id);
        if (!s) return G.send(ws, { t: 'error', error: 'set_not_found' });
        room = G.createRoom(teacher, { id: s.id, title: s.title, questions: JSON.parse(s.questions) }, ws);
        if (!room) return G.send(ws, { t: 'error', error: 'empty_set' });
      } else {
        const r = G.rooms.get(String(m.pin));
        if (!r || r.teacherId !== teacher.id) return G.send(ws, { t: 'error', error: 'room_not_found' });
        room = r; room.host = ws;
      }
      isHost = true;
      G.send(ws, { t: 'room', pin: room.pin, title: room.title, total: room.questions.length });
      return m.t === 'host' ? G.lobby(room) : G.resyncHost(room);
    }
    if (m.t === 'join' || m.t === 'rejoin') {
      const r = G.rooms.get(String(m.pin || '').trim());
      if (!r) return G.send(ws, { t: 'error', error: 'room_not_found' });
      let p;
      if (m.t === 'rejoin') {
        p = [...r.players.values()].find(x => x.token === m.token);
        if (!p) return G.send(ws, { t: 'error', error: 'rejoin_failed' });
        if (p.ws && p.ws !== ws) try { p.ws.close(); } catch (e) {}
        p.ws = ws;
      } else {
        const res = G.join(r, m.name, ws);
        if (res.error) return G.send(ws, { t: 'error', error: res.error });
        p = res.player;
      }
      room = r; player = p; r.touched = Date.now();
      G.send(ws, { t: 'joined', pin: r.pin, id: p.id, token: p.token, name: p.name, avatar: p.avatar, title: r.title, score: p.score });
      G.lobby(r);
      return G.resync(r, p);
    }
    if (!room) return;
    if (isHost && room.host === ws) return G.hostCmd(room, m);
    if (player && m.t === 'answer') return G.answer(room, player, m.qi, m.ans);
  });
  ws.on('close', () => { if (room && player) G.lobby(room); });
});
// 心跳：30 秒没回应的连接关掉（学生手机锁屏后会这样）
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30e3).unref();

const PORT = +process.env.PORT || 3048;
server.listen(PORT, '127.0.0.1', () => console.log(`KaleidoQuest on http://127.0.0.1:${PORT}`));
module.exports = { server };
