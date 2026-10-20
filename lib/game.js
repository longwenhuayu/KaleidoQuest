// 擂台抢答：主持大屏 + 学生设备，全班同一题，越快分越高
const crypto = require('crypto');
const { WebSocket } = require('ws');
const { q } = require('./db');
const Q = require('./questions');
const C = require('./cards');
const S = require('./students');

const AVATARS = ['🐼', '🦊', '🐯', '🐲', '🦁', '🐨', '🐸', '🐵', '🦄', '🐧', '🐙', '🦉', '🐢', '🐳', '🦋', '🐰', '🐻', '🐹', '🐮', '🐷', '🐔', '🦖', '🐬', '🦜', '🐝', '🦀', '🐺', '🦒', '🦓', '🐘'];
const MAX_PLAYERS = 60;
const rooms = new Map();

const send = (ws, msg) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
const newPin = () => { let p; do { p = String(100000 + crypto.randomInt(900000)); } while (rooms.has(p)); return p; };

function createRoom(teacher, set, hostWs, opts = {}) {
  const questions = Q.cleanAll(set.questions);
  if (!questions.length) return null;
  const room = {
    pin: newPin(), teacherId: teacher.id, setId: set.id, title: set.title, questions, subject: set.subject || 'general',
    host: hostWs, hostToken: crypto.randomBytes(16).toString('base64url'),
    players: new Map(), state: 'lobby', qi: -1, qStart: 0, answers: new Map(), timer: null,
    locked: false, created: Date.now(), touched: Date.now(), started: 0,
    mode: opts.mode === 'treasure' ? 'treasure' : 'classic', minutes: [3, 5, 7, 10, 15].includes(+opts.minutes) ? +opts.minutes : 7
  };
  // 测试时可以用几秒钟的局
  if (process.env.NODE_ENV === 'test' && +opts.seconds) room.minutes = +opts.seconds / 60;
  rooms.set(room.pin, room);
  return room;
}

const playerList = r => [...r.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: !!(p.ws && p.ws.readyState === WebSocket.OPEN) }));
const ranking = r => [...r.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
function lobby(r) { send(r.host, { t: 'lobby', pin: r.pin, title: r.title, total: r.questions.length, locked: r.locked, mode: r.mode, minutes: r.minutes, players: playerList(r) }); }

function join(r, name, ws) {
  if (r.locked || r.state === 'ended') return { error: 'locked' };
  if (r.players.size >= MAX_PLAYERS) return { error: 'full' };
  name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  if (!name) return { error: 'name' };
  const taken = new Set([...r.players.values()].map(p => p.name));
  let n = name, k = 2; while (taken.has(n)) n = `${name}${k++}`;
  const used = new Set([...r.players.values()].map(p => p.avatar));
  const free = AVATARS.filter(a => !used.has(a));
  const p = { id: crypto.randomBytes(6).toString('base64url'), token: crypto.randomBytes(16).toString('base64url'), name: n, avatar: (free.length ? free : AVATARS)[crypto.randomInt((free.length ? free : AVATARS).length)], score: 0, streak: 0, best: 0, answers: [], firstTry: {}, ws };
  r.players.set(p.id, p);
  return { player: p };
}

function sendQuestionTo(r, p) {
  const qq = r.questions[r.qi];
  const left = Math.max(0, qq.time * 1000 - (Date.now() - r.qStart));
  send(p.ws, { t: 'q', qi: r.qi, total: r.questions.length, q: r.playerQ, left, answered: r.answers.has(p.id) });
}

function startQuestion(r) {
  r.qi++;
  if (r.qi >= r.questions.length) return finish(r);
  const qq = r.questions[r.qi];
  r.state = 'question'; r.answers = new Map(); r.qStart = Date.now() + 2500; // 2.5 秒「准备」再开始计时
  r.playerQ = Q.forPlayer(qq);
  send(r.host, { t: 'q', qi: r.qi, total: r.questions.length, q: { ...r.playerQ, speak: qq.speak, lang: qq.lang }, startIn: 2500, players: r.players.size });
  for (const p of r.players.values()) send(p.ws, { t: 'get_ready', qi: r.qi, total: r.questions.length });
  clearTimeout(r.timer);
  r.timer = setTimeout(() => {
    for (const p of r.players.values()) sendQuestionTo(r, p);
    r.timer = setTimeout(() => reveal(r), qq.time * 1000 + 400);
  }, 2500);
}

function answer(r, p, qi, ans) {
  if (r.state !== 'question' || qi !== r.qi || r.answers.has(p.id) || Date.now() < r.qStart) return;
  const qq = r.questions[r.qi], ms = Date.now() - r.qStart;
  if (ms > qq.time * 1000 + 300) return;
  const correct = Q.check(qq, ans);
  p.streak = correct ? p.streak + 1 : 0;
  p.best = Math.max(p.best, p.streak);
  // 答对：最快 1000 分，最慢 500 分；连对从第 2 题起每题再加 100，最多 +500
  const points = correct ? Math.round(1000 * (1 - Math.min(1, ms / (qq.time * 1000)) / 2)) + Math.min(500, (p.streak - 1) * 100) : 0;
  p.score += points;
  r.answers.set(p.id, { ans, correct, ms, points });
  p.answers[r.qi] = { ans, correct, ms, points };
  send(p.ws, { t: 'answered' });
  const online = [...r.players.values()].filter(x => x.ws && x.ws.readyState === WebSocket.OPEN).length;
  send(r.host, { t: 'progress', answered: r.answers.size, players: online });
  if (r.answers.size >= online) { clearTimeout(r.timer); r.timer = setTimeout(() => reveal(r), 600); }
}

function reveal(r) {
  if (r.state !== 'question') return;
  clearTimeout(r.timer);
  r.state = 'reveal';
  const qq = r.questions[r.qi], list = [...r.answers.values()];
  const dist = qq.type === 'mcq' ? qq.options.map((_, i) => list.filter(a => a.ans === i).length)
    : qq.type === 'tf' ? [list.filter(a => a.ans === true).length, list.filter(a => a.ans === false).length] : null;
  const correctN = list.filter(a => a.correct).length;
  send(r.host, { t: 'reveal', qi: r.qi, answer: qq.answer, answerText: Q.answerText(qq), options: qq.options, dist, correct: correctN, answered: list.length, players: r.players.size, note: qq.note || '' });
  const rank = ranking(r);
  rank.forEach((p, i) => {
    const a = r.answers.get(p.id);
    send(p.ws, { t: 'result', correct: !!(a && a.correct), answered: !!a, points: a ? a.points : 0, score: p.score, streak: p.streak, rank: i + 1, of: rank.length, answerText: Q.answerText(qq) });
  });
}

function board(r) {
  r.state = 'board';
  const top = ranking(r).slice(0, 5).map(p => ({ name: p.name, avatar: p.avatar, score: p.score, streak: p.streak }));
  send(r.host, { t: 'board', top, qi: r.qi, total: r.questions.length, last: r.qi >= r.questions.length - 1 });
}

function finish(r) {
  clearTimeout(r.timer);
  r.state = 'ended';
  const rank = ranking(r);
  const report = {
    title: r.title, total: r.questions.length,
    questions: r.questions.map((qq, i) => {
      const as = rank.map(p => p.answers[i]).filter(Boolean);
      return { prompt: qq.prompt || qq.speak, type: qq.type, answerText: Q.answerText(qq), answered: as.length, correct: as.filter(a => a.correct).length, avgMs: as.length ? Math.round(as.reduce((s, a) => s + a.ms, 0) / as.length) : 0 };
    }),
    players: rank.map((p, i) => ({ rank: i + 1, name: p.name, avatar: p.avatar, score: p.score, best: p.best, correct: p.answers.filter(a => a && a.correct).length, answers: r.questions.map((_, k) => p.answers[k] ? (p.answers[k].correct ? 1 : 0) : null) }))
  };
  const reportId = saveReport(r, report, 'classic');
  r.endMsg = { t: 'end', podium: rank.slice(0, 3).map(p => ({ name: p.name, avatar: p.avatar, score: p.score })), reportId, players: rank.length };
  send(r.host, r.endMsg);
  rank.forEach((p, i) => {
    // 前三名或正确率 ≥ 80% 得 2 张卡，其余 1 张
    p.reward = { id: `${r.pin}-${p.id}`, cards: C.draw(r.subject, r.questions, i < 3 || report.players[i].correct >= r.questions.length * .8 ? 2 : 1) };
    S.award(p.studentId, p.reward);
    send(p.ws, { t: 'end', rank: i + 1, of: rank.length, score: p.score, correct: report.players[i].correct, total: r.questions.length, best: p.best, reward: p.reward });
  });
}

function saveReport(r, report, mode) {
  // 访客（Gallery 免登录）开的局不保存报告
  if (!r.teacherId || !r.started || !r.players.size) return null;
  return Number(q('INSERT INTO games (teacher_id, set_id, title, mode, started, ended, report) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(r.teacherId, r.setId, r.title, mode, r.started, Date.now(), JSON.stringify(report)).lastInsertRowid);
}
const T = require('./treasure')({ send, ranking, finishReport: saveReport });

// 主持人的指令
function hostCmd(r, m) {
  r.touched = Date.now();
  switch (m.t) {
    case 'start':
      if (r.state !== 'lobby' || !r.players.size) break;
      if (r.mode === 'treasure') T.start(r); else { r.started = Date.now(); startQuestion(r); }
      break;
    case 'next':
      if (r.mode === 'treasure') break;
      if (r.state === 'question') reveal(r);
      else if (r.state === 'reveal') board(r);
      else if (r.state === 'board') startQuestion(r);
      break;
    case 'end': if (r.state !== 'ended') r.mode === 'treasure' ? T.finish(r) : finish(r); break;
    case 'lock': r.locked = !!m.on; lobby(r); break;
    case 'kick': {
      const p = r.players.get(String(m.id));
      if (p) { send(p.ws, { t: 'kicked' }); p.ws && p.ws.close(); r.players.delete(p.id); lobby(r); }
      break;
    }
  }
}

// 断线重连时，把当前画面补发给这个人
function resync(r, p) {
  if (r.mode === 'treasure') return T.resync(r, p);
  if (r.state === 'lobby') send(p.ws, { t: 'wait' });
  else if (r.state === 'question') { if (Date.now() >= r.qStart) sendQuestionTo(r, p); else send(p.ws, { t: 'get_ready', qi: r.qi, total: r.questions.length }); }
  else if (r.state === 'ended') send(p.ws, { t: 'end', rank: ranking(r).indexOf(p) + 1, of: r.players.size, score: p.score, correct: p.answers.filter(a => a && a.correct).length, total: r.questions.length, best: p.best, reward: p.reward });
  else send(p.ws, { t: 'between', score: p.score, rank: ranking(r).indexOf(p) + 1, of: r.players.size });
}
function resyncHost(r) {
  lobby(r);
  if (r.mode === 'treasure') return T.resyncHost(r);
  if (r.state === 'question') send(r.host, { t: 'q', qi: r.qi, total: r.questions.length, q: r.playerQ, startIn: Math.max(0, r.qStart - Date.now()), left: Math.max(0, r.questions[r.qi].time * 1000 - (Date.now() - r.qStart)), players: r.players.size, resumed: true });
  else if (r.state === 'reveal' || r.state === 'board') board(r);
  else if (r.state === 'ended') send(r.host, r.endMsg);
}

// 学生的指令：按模式分流
function playerCmd(r, p, m) {
  r.touched = Date.now();
  if (r.mode === 'treasure') {
    if (m.t === 'answer') T.answer(r, p, m.qi, m.ans);
    else if (m.t === 'pick') T.pick(r, p);
    else if (m.t === 'target') T.target(r, p, String(m.id));
    else if (m.t === 'tnext') T.next(r, p);
  } else if (m.t === 'answer') answer(r, p, m.qi, m.ans);
}

// 3 小时没动静的房间清掉
setInterval(() => { const now = Date.now(); for (const [pin, r] of rooms) if (now - r.touched > 3 * 3600e3) { clearTimeout(r.timer); rooms.delete(pin); } }, 10 * 60e3).unref();

module.exports = { rooms, createRoom, join, playerCmd, hostCmd, lobby, resync, resyncHost, send, MAX_PLAYERS };
