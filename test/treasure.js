// 夺宝模式模拟：12 个学生限时乱答、开宝箱、偷和换
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-tq-${Date.now()}.db`);
process.env.PORT = String(40000 + (Math.random() * 900 | 0));
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');
const G = require('../lib/game');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = cookie => new Promise(ok => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', cookie ? { headers: { cookie } } : {}); ws.inbox = []; ws.on('message', d => { const m = JSON.parse(d); ws.inbox.push(m); ws.onmsg && ws.onmsg(m); }); ws.sendj = m => ws.send(JSON.stringify(m)); ws.on('open', () => ok(ws)); });
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await sleep(20); } };

(async () => {
  await new Promise(r => server.on('listening', r));
  let r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'tq@x.com', name: 'T', password: 'secret123' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const questions = [
    { type: 'mcq', prompt: 'A?', options: ['ok', 'no', 'no2'], answer: [0], time: 20 },
    { type: 'tf', prompt: 'B?', answer: true, time: 20 },
    { type: 'input', prompt: 'C?', answer: ['42'], time: 20 }
  ];
  const { id } = await (await fetch(BASE + '/api/sets', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'TQ', questions }) })).json();
  const host = await open(cookie);
  host.sendj({ t: 'host', setId: id, mode: 'treasure', seconds: 4 });
  await until(() => host.inbox.some(m => m.t === 'room'));
  const pin = host.inbox.find(m => m.t === 'room').pin;
  assert.equal(host.inbox.find(m => m.t === 'room').mode, 'treasure');
  const right = { 0: 0, 1: true, 2: '42' }, wrong = { 0: 1, 1: false, 2: '7' };
  // S0 是登录的学生：结束后成绩记进他的账号
  const post = (u, body, c) => fetch(BASE + u, { method: 'POST', headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) });
  const { id: cid } = await (await post('/api/classes', { name: 'C', names: 'S0' }, cookie)).json();
  const cls = await (await fetch(BASE + `/api/classes/${cid}`, { headers: { cookie } })).json();
  const stu = (await post('/api/student/login', { code: cls.code, name: 'S0', pin: cls.students[0].pin })).headers.get('set-cookie').split(';')[0];
  const N = 12, ps = [];
  let stealSum = 0, stolenSum = 0, earlyNext = 0;
  for (let i = 0; i < N; i++) {
    const p = await open(i === 0 ? stu : undefined);
    p.k = i; p.sendj({ t: 'join', pin, name: 'S' + i });
    p.onmsg = m => {
      if (m.t === 'tq') { const bad = p.k % 3 === 0 && Math.random() < .5; setTimeout(() => p.sendj({ t: 'answer', qi: m.qi, ans: (bad ? wrong : right)[m.qi] }), 5 + Math.random() * 30); }
      if (m.t === 'tres' && m.correct) p.sendj({ t: 'pick' });
      if (m.t === 'tres' && !m.correct) { p.sendj({ t: 'tnext' }); earlyNext++; setTimeout(() => p.sendj({ t: 'tnext' }), m.wait + 30); }
      if (m.t === 'tpick') p.sendj({ t: 'target', id: m.players[0].id });
      if (m.t === 'tout') { if (m.kind === 'steal') stealSum += m.amount; p.sendj({ t: 'tnext' }); }
      if (m.t === 'hit' && m.kind === 'steal') stolenSum += m.amount;
      if (m.t === 'tq' || m.t === 'tout') assert.ok(!('answer' in (m.q || {})), '题目不带答案');
    };
    ps.push(p);
  }
  await until(() => ps.every(p => p.inbox.some(m => m.t === 'joined')));
  host.sendj({ t: 'start' });
  // 宝石不会是负数（每 100ms 查一次服务端状态）
  const room = G.rooms.get(pin);
  const check = setInterval(() => { for (const p of room.players.values()) assert.ok(p.score >= 0, '宝石不为负'); }, 100);
  await until(() => host.inbox.some(m => m.t === 'end'), 10000);
  clearInterval(check);
  const end = host.inbox.find(m => m.t === 'end');
  assert.equal(end.unit, '💎');
  assert.ok(host.inbox.some(m => m.t === 'tboard' && m.events.length), '大屏收到排行榜和事件');
  await until(() => ps.every(p => p.inbox.some(m => m.t === 'end')));
  assert.equal(stealSum, stolenSum, '偷走的 = 被偷的');
  ps.forEach(p => { const e = p.inbox.find(m => m.t === 'end'); assert.ok(e.reward && e.reward.cards.length >= 1 && e.reward.cards[0].set === 'explorer', '综合题包发探索者卡'); });
  const rep = await (await fetch(BASE + `/api/games/${end.reportId}`, { headers: { cookie } })).json();
  assert.equal(rep.mode, 'treasure');
  const tries = rep.report.players.reduce((a, p) => a + p.tries, 0), answered = rep.report.questions.reduce((a, q) => a + q.answered, 0);
  assert.equal(tries, answered, '报告里每题作答次数加起来 = 学生作答次数');
  assert.ok(tries > N * 5, `4 秒里大家答了不少题：${tries}`);
  // 答错后 2 秒内的「下一题」被忽略：答错的人题数明显少
  const wrongers = rep.report.players.filter(p => +p.name.slice(1) % 3 === 0), others = rep.report.players.filter(p => +p.name.slice(1) % 3 !== 0);
  const avg = a => a.reduce((s, p) => s + p.tries, 0) / a.length;
  assert.ok(avg(wrongers) < avg(others), `答错要等：${avg(wrongers).toFixed(1)} < ${avg(others).toFixed(1)}`);
  const mine = await (await fetch(BASE + '/api/student/results', { headers: { cookie: stu } })).json();
  const s0 = rep.report.players.find(p => p.name === 'S0');
  assert.equal(mine.results.length, 1); assert.equal(mine.results[0].kind, 'treasure');
  assert.deepEqual([mine.results[0].correct, mine.results[0].total, mine.results[0].score], [s0.correct, s0.tries, s0.score], '夺宝成绩记进学生账号');
  // 主持人重连拿到同一份结果
  const host2 = await open(cookie); host2.sendj({ t: 'host_resume', pin });
  await until(() => host2.inbox.some(m => m.t === 'end'));
  assert.equal(host2.inbox.find(m => m.t === 'end').reportId, end.reportId);
  const kinds = new Set(); ps.forEach(p => p.inbox.filter(m => m.t === 'tout').forEach(m => kinds.add(m.kind)));
  console.log(`✅ 夺宝模式通过：${N} 人 4 秒共答 ${tries} 题；宝箱结果出现 ${[...kinds].join('/')}；偷 ${stealSum} = 被偷 ${stolenSum}；答错等待生效；计时结束、报告、重连`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
