// Gallery：列表、免登录单人试玩、复制、访客投屏开局
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-gal-${Date.now()}.db`);
process.env.PORT = String(43000 + (Math.random() * 900 | 0));
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');
const G = require('../lib/gallery');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const post = (p, body, cookie) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 用题库里的原题找出正确答案（测试专用）
function solve(setId, q) {
  const src = G.byId.get(setId).questions.find(x => x.prompt === q.prompt && x.type === q.type && (!q.options || JSON.stringify(x.options) === JSON.stringify(q.options)) && (!q.items || x.options && x.options.length === q.items.length));
  if (q.type === 'mcq') return src.answer[0];
  if (q.type === 'tf') return src.answer;
  if (q.type === 'input') return src.answer[0];
  return q.items.map(it => it.i).sort((a, b) => a - b);
}
const open = cookie => new Promise(ok => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', cookie ? { headers: { cookie } } : {}); ws.box = []; ws.on('message', d => ws.box.push(JSON.parse(d))); ws.sendj = m => ws.send(JSON.stringify(m)); ws.on('open', () => ok(ws)); });
const wait = async (ws, t, ms = 8000) => { const end = Date.now() + ms; for (;;) { const i = ws.box.findIndex(m => m.t === t); if (i >= 0) return ws.box.splice(i, 1)[0]; if (Date.now() > end) throw new Error('timeout ' + t); await sleep(20); } };

(async () => {
  await new Promise(r => server.on('listening', r));
  const list = await (await fetch(BASE + '/api/gallery')).json();
  assert.equal(list.length, 25);
  for (const subj of ['chinese', 'math', 'english', 'science', 'general']) assert.equal(list.filter(x => x.subject === subj).length, 5, subj + ' 5 个');
  assert.ok(!JSON.stringify(list).includes('"answer"'), '列表不带答案');
  // 单人试玩：每个游戏都全对跑一遍
  for (const g of list) {
    let r = await (await post(`/api/try/${g.id}/start`, { name: '访客' })).json();
    const token = r.token;
    for (let k = 0; !r.done; k++) {
      assert.ok(!('answer' in r.q), '试玩题目不带答案');
      if (k === 2) { r = await (await post(`/api/try/${g.id}/resume`, { token })).json(); assert.equal(r.pos, 2, '刷新后接着做'); }
      r = await (await post(`/api/try/${g.id}/answer`, { token, pos: r.pos, ans: solve(g.id, r.q) })).json();
      assert.ok(r.result.correct, `${g.id} 第 ${k + 1} 题应该判对：${JSON.stringify(r.result)}`);
    }
    assert.equal(r.correct, g.n, g.id + ' 全对');
    assert.equal(r.reward.cards.length, 2, '全对 2 张卡');
  }
  // 复制到题包：要登录
  assert.equal((await post('/api/gallery/zh-idioms/copy')).status, 401);
  const cookie = (await post('/api/register', { email: 'g@x.com', name: 'G', password: 'secret123' })).headers.get('set-cookie').split(';')[0];
  const { id } = await (await post('/api/gallery/zh-idioms/copy', {}, cookie)).json();
  const set = await (await fetch(BASE + `/api/sets/${id}`, { headers: { cookie } })).json();
  assert.equal(set.title, '成语小达人'); assert.equal(set.questions.length, 8); assert.equal(set.subject, 'chinese');
  // 访客投屏开局
  const host = await open();
  host.sendj({ t: 'host', gallery: 'm-times', mode: 'classic' });
  const room = await wait(host, 'room');
  assert.equal(room.guest, true); assert.ok(room.hostToken);
  const p = await open(); p.sendj({ t: 'join', pin: room.pin, name: '小明' }); await wait(p, 'joined');
  host.sendj({ t: 'start' });
  for (let k = 0; k < 8; k++) {
    const m = await wait(p, 'q', 8000);
    p.sendj({ t: 'answer', qi: m.qi, ans: solve('m-times', m.q) });
    await wait(host, 'reveal'); host.sendj({ t: 'next' }); await wait(host, 'board'); host.sendj({ t: 'next' });
  }
  const end = await wait(host, 'end');
  assert.equal(end.reportId, null, '访客的局不写报告');
  assert.equal((await wait(p, 'end')).correct, 8);
  // 重连：有令牌可以，没有不行
  const h2 = await open(); h2.sendj({ t: 'host_resume', pin: room.pin }); assert.equal((await wait(h2, 'error')).error, 'room_not_found');
  const h3 = await open(); h3.sendj({ t: 'host_resume', pin: room.pin, hostToken: room.hostToken }); await wait(h3, 'end');
  // 访客开局限次数（已经开了 1 局，再开 9 局可以，第 11 局被拒）
  for (let i = 0; i < 9; i++) { const h = await open(); h.sendj({ t: 'host', gallery: 'g-space' }); await wait(h, 'room'); h.close(); }
  const hx = await open(); hx.sendj({ t: 'host', gallery: 'g-space' }); assert.equal((await wait(hx, 'error')).error, 'too_many');
  // 登录的老师不受这个限制
  const ht = await open(cookie); ht.sendj({ t: 'host', gallery: 'g-space' }); assert.equal((await wait(ht, 'room')).guest, false);
  console.log('✅ Gallery 通过：25 个游戏（5 科 × 5）全部能全对通关并得卡、续玩、复制要登录、访客开局不写报告、令牌重连、访客限流');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
