// 端到端模拟：注册老师 → 建题包 → 主持开房 → 30 个学生加入答题 → 检查计分、断线重连和报告
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-test-${Date.now()}.db`);
process.env.PORT = String(39000 + (Math.random() * 900 | 0));
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(cookie) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', cookie ? { headers: { cookie } } : {});
  const inbox = [];
  const waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); inbox.push(m); waiters.splice(0).forEach(w => w()); });
  ws.wait = async (t, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = inbox.findIndex(m => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error('timeout waiting ' + t + ' got ' + inbox.map(m => m.t).join(','));
      await new Promise(r => { waiters.push(r); setTimeout(r, 200); });
    }
  };
  ws.sendj = m => ws.send(JSON.stringify(m));
  return new Promise(ok => ws.on('open', () => ok(ws)));
}

(async () => {
  await new Promise(r => server.on('listening', r));
  // 注册 + 登录
  let r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'T@x.com', name: '王老师', password: 'secret123' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 't@x.com', name: 'x', password: 'secret123' }) })).status, 409, '邮箱不分大小写去重');
  assert.equal((await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 't@x.com', password: 'nope' }) })).status, 401);
  // 题包
  const questions = [
    { type: 'mcq', prompt: '「熊猫」怎么读？', options: ['xióng māo', 'xiōng máo', 'xióng mǎo', 'xiòng māo'], answer: [0], time: 5 },
    { type: 'tf', prompt: '3 × 4 = 12', answer: true, time: 5 },
    { type: 'input', prompt: '1/2 + 1/4 = ?', answer: ['3/4'], time: 5 },
    { type: 'order', prompt: '排成句子', options: ['我', '喜欢', '中文'], time: 5 },
    { type: 'bogus', prompt: '会被丢掉' }
  ];
  r = await fetch(BASE + '/api/sets', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: '测试题包', subject: 'chinese', questions }) });
  const { id: setId, dropped } = await r.json();
  assert.equal(dropped, 1, '非法题型要丢掉');
  assert.equal((await fetch(BASE + `/api/sets/${setId}`)).status, 401, '没登录不能看题包');

  // 没登录不能开房
  const anon = await client();
  anon.sendj({ t: 'host', setId });
  assert.equal((await anon.wait('error')).error, 'login_required');

  const host = await client(cookie);
  host.sendj({ t: 'host', setId });
  const { pin } = await host.wait('room');
  assert.match(pin, /^\d{6}$/);

  const N = 30, players = [];
  for (let i = 0; i < N; i++) {
    const p = await client();
    p.sendj({ t: 'join', pin, name: i < 2 ? '小明' : '学生' + i });
    p.me = await p.wait('joined');
    players.push(p);
  }
  assert.equal(players[1].me.name, '小明2', '重名自动加编号');
  const lob = await host.wait('lobby'); // 第一条
  host.sendj({ t: 'start' });

  const answers = [
    i => i % 4,                       // 选择题：1/4 的人答对
    i => i % 2 === 0,                 // 判断题：一半对
    i => i < 10 ? '0.75' : '1/2',     // 填空：前 10 人答对（数值相等也算）
    i => i < 5 ? [0, 1, 2] : [1, 0, 2]
  ];
  for (let k = 0; k < 4; k++) {
    const hq = await host.wait('q');
    assert.ok(!('answer' in hq.q), '主持端题目里也不带答案');
    for (const p of players) {
      const m = await p.wait('q');
      assert.ok(!('answer' in m.q), '学生端拿不到答案');
      if (k === 3) assert.equal(m.q.items.length, 3);
    }
    // 第 2 题：第 0 个学生断线重连
    if (k === 1) {
      players[0].terminate();
      const again = await client();
      again.sendj({ t: 'rejoin', pin, token: players[0].me.token });
      again.me = (await again.wait('joined'));
      assert.equal(again.me.name, '小明');
      const rq = await again.wait('q');
      assert.equal(rq.qi, 1, '重连后补发当前题目');
      players[0] = again;
    }
    players.forEach((p, i) => p.sendj({ t: 'answer', qi: k, ans: answers[k](i) }));
    players[3].sendj({ t: 'answer', qi: k, ans: answers[k](0) }); // 重复作答不算
    const rev = await host.wait('reveal', 8000);
    const expect = [null, N / 2, 10, 5][k];
    if (k === 0) assert.equal(rev.correct, players.filter((_, i) => i % 4 === 0).length);
    else assert.equal(rev.correct, expect, `第 ${k + 1} 题答对人数`);
    for (const p of players) await p.wait('result');
    host.sendj({ t: 'next' });
    const b = await host.wait('board');
    assert.ok(b.top[0].score >= b.top[1].score);
    host.sendj({ t: 'next' });
  }
  const end = await host.wait('end');
  assert.equal(end.podium.length, 3);
  assert.equal(end.players, N);
  // 第 0 和第 4 个学生 4 题全对，两人比速度，应该占前两名
  const e0 = await players[0].wait('end'), e4 = await players[4].wait('end');
  assert.equal(e0.correct, 4);
  assert.deepEqual([e0.rank, e4.rank].sort(), [1, 2]);
  // 报告
  const rep = await (await fetch(BASE + `/api/games/${end.reportId}`, { headers: { cookie } })).json();
  assert.equal(rep.report.players.length, N);
  assert.equal(rep.report.questions[2].correct, 10);
  // 主持人断线重连不会重复写报告
  const host2 = await client(cookie);
  host2.sendj({ t: 'host_resume', pin });
  assert.equal((await host2.wait('end')).reportId, end.reportId);
  const list = await (await fetch(BASE + '/api/games', { headers: { cookie } })).json();
  assert.equal(list.length, 1, '只写一份报告');
  // 忘记密码
  const { outbox } = require('../lib/mail');
  const post = (path, body, ck) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/forgot', { email: 'nobody@x.com' })).status, 200, '没注册的邮箱也回 200');
  assert.equal((await post('/api/forgot', { email: 'T@X.com' })).status, 200);
  await sleep(100);
  assert.equal(outbox.length, 1, '只给注册过的邮箱发信');
  assert.equal(outbox[0].to, 't@x.com');
  const token = outbox[0].text.match(/token=([\w-]+)/)[1];
  assert.equal((await post('/api/reset', { token, password: 'short' })).status, 400, '新密码太短');
  r = await post('/api/reset', { token, password: 'newpass123' });
  assert.equal(r.status, 200);
  const cookie2 = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(BASE + '/api/me', { headers: { cookie } })).status, 401, '旧会话失效');
  assert.equal((await fetch(BASE + '/api/me', { headers: { cookie: cookie2 } })).status, 200);
  assert.equal((await post('/api/reset', { token, password: 'another123' })).status, 400, '链接只能用一次');
  assert.equal((await post('/api/login', { email: 't@x.com', password: 'newpass123' })).status, 200);
  assert.equal((await post('/api/login', { email: 't@x.com', password: 'secret123' })).status, 401, '旧密码不能用');
  for (let i = 0; i < 3; i++) await post('/api/forgot', { email: 't@x.com' });
  assert.equal((await post('/api/forgot', { email: 't@x.com' })).status, 429, '同一邮箱 1 小时最多 3 次');
  console.log(`✅ 通过：${N} 人对局、4 种题型计分、重名、断线重连、防重复作答、答案不外泄、报告入库、找回密码`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
