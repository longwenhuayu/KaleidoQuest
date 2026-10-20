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
const mail = require('./lib/mail');
const crypto = require('crypto');

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
  if (t.disabled) return res.status(403).json({ error: 'disabled' });
  A.startSession(res, t.id);
  res.json({ id: t.id, email: t.email, name: t.name });
});
app.post('/api/logout', (req, res) => { A.endSession(req, res); res.json({ ok: true }); });
// 忘记密码：发一个 1 小时内有效、只能用一次的链接（库里只存哈希）
const resetHits = new Map();
function resetLimited(key, max) {
  const now = Date.now(), list = (resetHits.get(key) || []).filter(t => now - t < 3600e3);
  if (list.length >= max) return true;
  resetHits.set(key, [...list, now]);
  return false;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
app.post('/api/forgot', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !mail.configured()) return res.status(503).json({ error: 'mail_off' });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'email' });
  if (resetLimited('ip:' + req.ip, 10) || resetLimited('em:' + email, 3)) return res.status(429).json({ error: 'too_many' });
  // 不管邮箱有没有注册都回一样的结果，免得被人拿来探测
  res.json({ ok: true });
  const t = q('SELECT id, name, email FROM teachers WHERE email = ? AND disabled = 0').get(email);
  if (!t) return;
  sendReset(t, req).catch(e => console.error('reset mail failed', e.message));
});
async function sendReset(t, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('DELETE FROM resets WHERE teacher_id = ?').run(t.id);
  q('INSERT INTO resets (token_hash, teacher_id, expires) VALUES (?, ?, ?)').run(sha(token), t.id, Date.now() + 3600e3);
  const link = `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/reset?token=${token}`;
  await mail.send({
    to: t.email,
    subject: '重设 KaleidoQuest 密码 / Reset your KaleidoQuest password',
    text: `${t.name} 您好：\n\n请在 1 小时内点下面的链接重设密码：\n${link}\n\n如果不是您本人操作，忽略这封邮件即可，密码不会改变。\n\n---\n\nHi ${t.name},\n\nReset your password within 1 hour:\n${link}\n\nIf you didn't ask for this, just ignore this email.\n\nKaleidoQuest · kaleido.quest · by Vision Chinese Academy`
  });
}
app.post('/api/reset', (req, res) => {
  const token = String(req.body.token || ''), pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'password' });
  const r = q('SELECT teacher_id FROM resets WHERE token_hash = ? AND expires > ?').get(sha(token), Date.now());
  if (!r) return res.status(400).json({ error: 'expired' });
  q('UPDATE teachers SET pw = ? WHERE id = ?').run(A.hash(pw), r.teacher_id);
  q('DELETE FROM resets WHERE teacher_id = ?').run(r.teacher_id);
  q('DELETE FROM sessions WHERE teacher_id = ?').run(r.teacher_id);
  A.startSession(res, r.teacher_id);
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => { const t = A.teacherFrom(req); t ? res.json({ ...t, isAdmin: A.isAdmin(t) }) : res.status(401).json({ error: 'login_required' }); });

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

require('./lib/homework')(app);
const GL = require('./lib/gallery');
GL.routes(app);
app.get(['/try/:id', '/hw/:code'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'hw.html')));
require('./lib/admin')(app, { sendReset, rooms: G.rooms });

app.get('/api/health', (req, res) => res.json({ ok: true, rooms: G.rooms.size }));
// HTML 每次都向服务器确认（部署后马上生效）；其他静态文件缓存 1 小时
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h', setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// ── WebSocket：主持人和学生都走这里 ──
const server = http.createServer(app);
// 真实 IP：nginx 转发时在 X-Forwarded-For 里（只信本机代理）
const clientIp = req => { const a = req.socket.remoteAddress || ''; return (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1') && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : a; };
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
      const opts = { mode: m.mode, minutes: m.minutes, seconds: m.seconds };
      if (m.t === 'host') {
        if (m.gallery) {
          // Gallery 的游戏：不登录也能开局（限次数），访客开的局不保存报告
          const g = GL.byId.get(String(m.gallery));
          if (!g) return G.send(ws, { t: 'error', error: 'set_not_found' });
          if (!teacher && !GL.guestRoomAllowed(clientIp(req))) return G.send(ws, { t: 'error', error: 'too_many' });
          room = G.createRoom(teacher || { id: 0 }, { id: null, title: m.lang === 'en' ? g.title[1] : g.title[0], subject: g.subject, questions: g.questions }, ws, opts);
        } else {
          if (!teacher) return G.send(ws, { t: 'error', error: 'login_required' });
          const s = q('SELECT * FROM sets WHERE id = ? AND teacher_id = ?').get(+m.setId, teacher.id);
          if (!s) return G.send(ws, { t: 'error', error: 'set_not_found' });
          room = G.createRoom(teacher, { id: s.id, title: s.title, subject: s.subject, questions: JSON.parse(s.questions) }, ws, opts);
        }
        if (!room) return G.send(ws, { t: 'error', error: 'empty_set' });
      } else {
        // 重连：本人（登录）或者拿着开局时发的主持令牌（访客）
        const r = G.rooms.get(String(m.pin));
        const ok = r && ((teacher && r.teacherId && r.teacherId === teacher.id) || (m.hostToken && m.hostToken === r.hostToken));
        if (!ok) return G.send(ws, { t: 'error', error: 'room_not_found' });
        room = r; room.host = ws;
      }
      isHost = true;
      G.send(ws, { t: 'room', pin: room.pin, title: room.title, total: room.questions.length, mode: room.mode, minutes: room.minutes, hostToken: room.hostToken, guest: !room.teacherId });
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
      G.send(ws, { t: 'joined', pin: r.pin, id: p.id, token: p.token, name: p.name, avatar: p.avatar, title: r.title, score: p.score, mode: r.mode });
      G.lobby(r);
      return G.resync(r, p);
    }
    if (!room) return;
    if (isHost && room.host === ws) return G.hostCmd(room, m);
    if (player) return G.playerCmd(room, player, m);
  });
  ws.on('close', () => { if (room && player) G.lobby(room); });
});
// 心跳：30 秒没回应的连接关掉（学生手机锁屏后会这样）
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30e3).unref();

const PORT = +process.env.PORT || 3048;
server.listen(PORT, '127.0.0.1', () => console.log(`KaleidoQuest on http://127.0.0.1:${PORT}`));
module.exports = { server };
