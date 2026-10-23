// 班级和学生：建班、PIN 登录、限速、各种模式得卡存进账号、权限隔离、重设密码、删除
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-stu-${Date.now()}.db`);
process.env.PORT = String(44000 + (Math.random() * 900 | 0));
delete process.env.SILICONFLOW_API_KEY;
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server');
const G = require('../lib/gallery');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const req = (p, { body, cookie, method } = {}) => fetch(BASE + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const json = async (p, o) => (await req(p, o)).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];
function solve(setId, q) {
  const src = G.byId.get(setId).questions.find(x => x.prompt === q.prompt && x.type === q.type && (!q.options || JSON.stringify(x.options) === JSON.stringify(q.options)) && (!q.items || x.options && x.options.length === q.items.length));
  if (q.type === 'mcq') return src.answer[0];
  if (q.type === 'tf') return src.answer;
  if (q.type === 'input') return src.answer[0];
  return q.items.map(it => it.i).sort((a, b) => a - b);
}
const open = cookie => new Promise(ok => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', cookie ? { headers: { cookie } } : {}); ws.box = []; ws.on('message', d => ws.box.push(JSON.parse(d))); ws.sendj = m => ws.send(JSON.stringify(m)); ws.on('open', () => ok(ws)); });
const wait = async (ws, t, ms = 8000) => { const end = Date.now() + ms; for (;;) { const i = ws.box.findIndex(m => m.t === t); if (i >= 0) return ws.box.splice(i, 1)[0]; if (Date.now() > end) throw new Error('timeout ' + t); await sleep(20); } };
const count = book => Object.values(book).reduce((s, x) => s + x.n, 0);

(async () => {
  await new Promise(r => server.on('listening', r));
  const T = cookieOf(await req('/api/register', { body: { email: 's@x.com', name: '陈老师', password: 'secret123' } }));
  const T2 = cookieOf(await req('/api/register', { body: { email: 's2@x.com', name: '别的老师', password: 'secret123' } }));
  // 建班
  assert.equal((await req('/api/classes', { body: { name: '' }, cookie: T })).status, 400);
  const { id: cid } = await json('/api/classes', { body: { name: '小三忠班', names: '小明\n小红, Ali、小明\n<b>坏</b>' }, cookie: T });
  let c = await json(`/api/classes/${cid}`, { cookie: T });
  assert.deepEqual(c.students.map(s => s.name).sort(), ['Ali', 'b坏/b', '小明', '小红'].sort(), '去重、去掉尖括号');
  assert.ok(c.students.every(s => /^\d{4}$/.test(s.pin)));
  assert.equal((await req(`/api/classes/${cid}`, { cookie: T2 })).status, 404, '别的老师看不到');
  assert.equal((await req(`/api/classes/${cid}/students`, { body: { names: 'x' }, cookie: T2 })).status, 404);
  assert.equal((await json(`/api/classes/${cid}/students`, { body: { names: '小红\n小华' }, cookie: T })).added, 1);
  c = await json(`/api/classes/${cid}`, { cookie: T });
  const ming = c.students.find(s => s.name === '小明'), hong = c.students.find(s => s.name === '小红');
  // 学生登录
  assert.equal((await req('/api/class/zzzzzz')).status, 404);
  const pub = await json(`/api/class/${c.code.toUpperCase()}`);
  assert.equal(pub.name, '小三忠班'); assert.ok(!JSON.stringify(pub).includes(ming.pin), '公开名单不带密码');
  const wrong = ming.pin === '0000' ? '1111' : '0000';
  assert.equal((await req('/api/student/login', { body: { code: c.code, name: '小明', pin: wrong } })).status, 401);
  assert.equal((await req('/api/student/login', { body: { code: c.code, name: '没这人', pin: '1234' } })).status, 401);
  const S = cookieOf(await req('/api/student/login', { body: { code: c.code, name: '小明', pin: ming.pin } }));
  assert.deepEqual(await json('/api/student/me', { cookie: S }), { name: '小明', className: '小三忠班', username: null });
  assert.equal((await req('/api/student/me')).status, 401);
  assert.equal((await req('/api/student/me', { cookie: T })).status, 401, '老师 cookie 不是学生');
  // 单人试玩：卡存进账号
  let r = await json('/api/try/m-20/start', { body: {}, cookie: S });
  const tok = r.token;
  while (!r.done) r = await json('/api/try/m-20/answer', { body: { token: tok, pos: r.pos, ans: solve('m-20', r.q) } });
  let book = await json('/api/student/cards', { cookie: S });
  assert.equal(count(book), 2, '试玩全对 2 张'); assert.ok(Object.keys(book).every(k => k.startsWith('math:')));
  await json('/api/try/m-20/answer', { body: { token: tok, pos: 8, ans: 1 } }); // 重发结算不重复记
  assert.equal(count(await json('/api/student/cards', { cookie: S })), 2);
  // 课堂实时：登录的学生得卡记账号，没登录的不记
  const sets = await json('/api/gallery/sci-living/copy', { body: {}, cookie: T });
  const host = await open(T); host.sendj({ t: 'host', setId: sets.id, mode: 'classic' });
  const room = await wait(host, 'room');
  const p1 = await open(S); p1.sendj({ t: 'join', pin: room.pin, name: '小明', avatar: 'card:pi' });
  assert.equal((await wait(p1, 'joined')).avatar, 'card:pi', '卡片头像');
  const p2 = await open(); p2.sendj({ t: 'join', pin: room.pin, name: '路人', avatar: 'card:<img src=x>' });
  const j2 = await wait(p2, 'joined'); assert.ok(!j2.avatar.startsWith('card:'), '伪造的头像不收');
  const p3 = await open(); p3.sendj({ t: 'join', pin: room.pin, name: '路人2', avatar: 'card:nothere' });
  assert.ok(!(await wait(p3, 'joined')).avatar.startsWith('card:')); p3.close();
  host.sendj({ t: 'start' });
  for (let k = 0; k < 8; k++) {
    const m = await wait(p1, 'q'); await wait(p2, 'q');
    p1.sendj({ t: 'answer', qi: m.qi, ans: solve('sci-living', m.q) });
    p2.sendj({ t: 'answer', qi: m.qi, ans: 0 });
    await wait(host, 'reveal'); host.sendj({ t: 'next' }); await wait(host, 'board'); host.sendj({ t: 'next' });
  }
  const end1 = await wait(p1, 'end');
  book = await json('/api/student/cards', { cookie: S });
  assert.equal(count(book), 2 + end1.reward.cards.length, '课堂得卡记进账号');
  // 作业
  const hw = await json('/api/assignments', { body: { setId: sets.id, due: Date.now() + 86400e3 }, cookie: T });
  r = await json(`/api/hw/${hw.code}/start`, { body: { name: '小明' }, cookie: S });
  const ht = r.token;
  while (!r.done) r = await json(`/api/hw/${hw.code}/answer`, { body: { token: ht, pos: r.pos, ans: 0 } });
  const before = count(book);
  book = await json('/api/student/cards', { cookie: S });
  assert.equal(count(book), before + r.reward.cards.length, '作业得卡记进账号');
  // 学习记录：试玩、课堂、作业各一条；没登录的路人不记
  const { q: dbq } = require('../lib/db');
  assert.equal(dbq('SELECT count(*) n FROM student_results').get().n, 3, '只记登录的学生');
  let mine = await json('/api/student/results', { cookie: S });
  assert.deepEqual(mine.results.map(x => x.kind).sort(), ['classic', 'homework', 'try']);
  const cl = mine.results.find(x => x.kind === 'classic');
  assert.equal(cl.correct, 8); assert.equal(cl.total, 8); assert.equal(cl.score, end1.score);
  const hwr = mine.results.find(x => x.kind === 'homework');
  assert.equal(hwr.correct, r.correct, '作业对题数'); assert.equal(hwr.total, 8);
  assert.ok(mine.missed.length && mine.missed.every(m => m.wrong >= 1 && m.prompt), '常错的题');
  assert.equal((await req('/api/student/results')).status, 401);
  await json(`/api/hw/${hw.code}/answer`, { body: { token: ht, pos: 8, ans: 0 } }); // 做完再提交不重复记
  assert.equal(dbq('SELECT count(*) n FROM student_results').get().n, 3);
  // 老师看进度
  c = await json(`/api/classes/${cid}`, { cookie: T });
  const prog = c.students.find(s => s.name === '小明').cards;
  assert.ok(prog.math >= 1 && (prog.explorer || 0) + (prog.science || 0) >= 1, JSON.stringify(prog));
  assert.deepEqual(c.students.find(s => s.name === '小红').cards, {});
  const mst = c.students.find(s => s.name === '小明').stats;
  assert.equal(mst.games, 3); assert.ok(mst.rate > 0 && mst.rate <= 100 && mst.last);
  assert.deepEqual(c.students.find(s => s.name === '小红').stats, { games: 0, rate: null, last: null });
  const tv = await json(`/api/classes/${cid}/students/${ming.id}/results`, { cookie: T });
  assert.equal(tv.name, '小明'); assert.equal(tv.results.length, 3);
  assert.equal((await req(`/api/classes/${cid}/students/${ming.id}/results`, { cookie: T2 })).status, 404, '别的老师看不到成绩');
  // 重设密码：旧会话失效
  const { pin: newPin } = await json(`/api/classes/${cid}/students/${ming.id}/pin`, { body: {}, cookie: T });
  assert.equal((await req('/api/student/me', { cookie: S })).status, 401, '重设后旧登录失效');
  const S2 = cookieOf(await req('/api/student/login', { body: { code: c.code, name: '小明', pin: newPin } }));
  assert.equal(count(await json('/api/student/cards', { cookie: S2 })), count(book), '卡还在');
  // 合并本机卡册：只认真实卡 id，内容以服务器为准，张数取较大值，最多 20
  assert.equal((await req('/api/student/cards/merge', { body: { cards: [{ id: 'math:pi', n: 1 }] } })).status, 401);
  const n0 = count(await json('/api/student/cards', { cookie: S2 }));
  const fake = { id: 'math:pi', n: 3, card: { name: ['<b>假</b>'], rarity: 'e' } };
  let mg = await json('/api/student/cards/merge', { body: { cards: [fake, { id: 'math:nope', n: 5 }, { id: 'zh:好', n: 2 }, { id: 'zh:好好', n: 1 }, { id: 'science:' + 'x'.repeat(3), n: 1 }, null, { id: 'explorer:' }, { id: 'zh:人', n: 999 }] }, cookie: S2 });
  assert.equal(mg.merged, 3, '只收真实的卡');
  book = await json('/api/student/cards', { cookie: S2 });
  assert.equal(book['math:pi'].card.name[0], '圆周率 π', '卡片内容来自服务器');
  assert.equal(book['zh:人'].n, 20, '张数封顶');
  const n1 = count(book);
  await json('/api/student/cards/merge', { body: { cards: [fake, { id: 'zh:好', n: 2 }] }, cookie: S2 });
  assert.equal(count(await json('/api/student/cards', { cookie: S2 })), n1, '重复合并不翻倍');
  assert.ok(n1 > n0);
  // 同一个学生错 8 次就锁
  const hb = hong.pin === '9999' ? '8888' : '9999';
  for (let i = 0; i < 8; i++) assert.equal((await req('/api/student/login', { body: { code: c.code, name: '小红', pin: hb } })).status, 401);
  assert.equal((await req('/api/student/login', { body: { code: c.code, name: '小红', pin: hong.pin } })).status, 429, '锁住');
  await json(`/api/classes/${cid}/students/${hong.id}/pin`, { body: {}, cookie: T });
  const hong2 = (await json(`/api/classes/${cid}`, { cookie: T })).students.find(s => s.name === '小红');
  assert.equal((await req('/api/student/login', { body: { code: c.code, name: '小红', pin: hong2.pin } })).status, 200, '老师重设后解锁');
  // 退出、删除
  await req('/api/student/logout', { body: {}, cookie: S2 });
  assert.equal((await req('/api/student/me', { cookie: S2 })).status, 401);
  assert.equal((await req(`/api/classes/${cid}`, { method: 'DELETE', cookie: T2 })).status, 404);
  await req(`/api/classes/${cid}`, { method: 'DELETE', cookie: T });
  assert.equal((await json('/api/classes', { cookie: T })).length, 0);
  const { q } = require('../lib/db');
  assert.equal(q('SELECT count(*) n FROM student_cards').get().n, 0, '卡册连带删除');
  assert.equal(q('SELECT count(*) n FROM student_results').get().n, 0, '学习记录连带删除');
  // 擂台「不计速度」：快慢都是 1000 分
  const T3 = cookieOf(await req('/api/register', { body: { email: 's3@x.com', name: '速度', password: 'secret123' } }));
  const set3 = await json('/api/gallery/m-order/copy', { body: {}, cookie: T3 });
  const h3 = await open(T3); h3.sendj({ t: 'host', setId: set3.id, mode: 'classic', accuracy: true });
  const room3 = await wait(h3, 'room'); assert.equal(room3.accuracy, true);
  const fast = await open(); fast.sendj({ t: 'join', pin: room3.pin, name: '快' }); await wait(fast, 'joined');
  const slow = await open(); slow.sendj({ t: 'join', pin: room3.pin, name: '慢' }); await wait(slow, 'joined');
  h3.sendj({ t: 'start' });
  const q3 = await wait(fast, 'q'); await wait(slow, 'q');
  fast.sendj({ t: 'answer', qi: q3.qi, ans: solve('m-order', q3.q) }); await sleep(1500); slow.sendj({ t: 'answer', qi: q3.qi, ans: solve('m-order', q3.q) });
  const [rf, rs] = [await wait(fast, 'result'), await wait(slow, 'result')];
  assert.equal(rf.points, 1000); assert.equal(rs.points, 1000, '慢也是 1000');
  [h3, fast, slow].forEach(w => w.close());
  // 一局最多 100 人，第 101 人进不来
  const h4 = await open(T3); h4.sendj({ t: 'host', setId: set3.id, mode: 'classic' }); const room4 = await wait(h4, 'room');
  const crowd = [];
  for (let i = 0; i < 100; i++) { const w = await open(); w.sendj({ t: 'join', pin: room4.pin, name: `S${i}` }); await wait(w, 'joined'); crowd.push(w); }
  const extra = await open(); extra.sendj({ t: 'join', pin: room4.pin, name: 'S100' });
  assert.equal((await wait(extra, 'error')).error, 'full', '第 101 人被拒');
  [h4, extra, ...crowd].forEach(w => w.close());
  // AI 出题：没配 key 时返回 ai_off；要登录
  assert.equal((await req('/api/ai/questions', { body: { topic: 'x' } })).status, 401);
  assert.equal((await req('/api/ai/questions', { body: { topic: 'x' }, cookie: T })).status, 503);
  console.log('✅ 班级与学生通过：建班去重、PIN 登录、权限隔离、试玩 / 课堂 / 作业得卡入账号且不重复、老师看进度、重设密码使旧登录失效、错 8 次锁定、删除连带清理、AI 出题权限、卡片头像校验、不计速度模式、100 人上限');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
