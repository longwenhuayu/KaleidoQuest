// 压力测试：ROOMS 个房间 × PLAYERS 人同时答题（对着正在运行的服务器）
const WebSocket = require('ws');
const BASE = process.env.BASE || 'http://127.0.0.1:3048', ROOMS = +process.env.ROOMS || 10, PLAYERS = +process.env.PLAYERS || 40, QN = 5;
const open = (cookie) => new Promise(ok => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', cookie ? { headers: { cookie } } : {}); ws.q = []; ws.w = []; ws.on('message', d => { ws.q.push(JSON.parse(d)); ws.w.splice(0).forEach(f => f()); }); ws.wait = async t => { for (;;) { const i = ws.q.findIndex(m => m.t === t); if (i >= 0) return ws.q.splice(i, 1)[0]; await new Promise(r => { ws.w.push(r); setTimeout(r, 300); }); } }; ws.on('open', () => ok(ws)); });
(async () => {
  let r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `load${Date.now()}@t.sg`, name: 'load', password: 'secret123' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const questions = Array.from({ length: QN }, (_, i) => ({ type: 'mcq', prompt: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: [0], time: 10 }));
  const { id } = await (await fetch(BASE + '/api/sets', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'load', questions }) })).json();
  const mem0 = process.memoryUsage().rss;
  const t0 = Date.now();
  const lat = [];
  await Promise.all(Array.from({ length: ROOMS }, async () => {
    const host = await open(cookie); host.send(JSON.stringify({ t: 'host', setId: id }));
    const { pin } = await host.wait('room');
    const ps = await Promise.all(Array.from({ length: PLAYERS }, async (_, i) => { const p = await open(); p.send(JSON.stringify({ t: 'join', pin, name: 'p' + i })); await p.wait('joined'); return p; }));
    host.send(JSON.stringify({ t: 'start' }));
    for (let k = 0; k < QN; k++) {
      await Promise.all(ps.map(p => p.wait('q')));
      const s = Date.now();
      ps.forEach((p, i) => p.send(JSON.stringify({ t: 'answer', qi: k, ans: i % 4 })));
      const rev = await host.wait('reveal');
      lat.push(Date.now() - s);
      if (rev.answered !== PLAYERS) throw new Error('lost answers ' + rev.answered);
      await Promise.all(ps.map(p => p.wait('result')));
      host.send(JSON.stringify({ t: 'next' })); await host.wait('board'); host.send(JSON.stringify({ t: 'next' }));
    }
    await host.wait('end');
    ps.forEach(p => p.close()); host.close();
  }));
  lat.sort((a, b) => a - b);
  console.log(`✅ ${ROOMS} 个房间 × ${PLAYERS} 人 × ${QN} 题，共 ${ROOMS * PLAYERS} 个连接，没有丢答案`);
  console.log(`   全员作答 → 揭晓：中位数 ${lat[lat.length >> 1]}ms，最慢 ${lat.at(-1)}ms（含 600ms 的揭晓缓冲）；总用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
