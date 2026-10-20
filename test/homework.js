// 作业模式：布置 → 学生做 → 刷新续做 → 次数限制 → 截止 / 关闭 → 报告
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-hw-${Date.now()}.db`);
process.env.PORT = String(41000 + (Math.random() * 900 | 0));
const assert = require('assert');
const { server } = require('../server');
const { q } = require('../lib/db');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const post = (p, body, cookie) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
(async () => {
  await new Promise(r => server.on('listening', r));
  const reg = async e => (await post('/api/register', { email: e, name: e, password: 'secret123' })).headers.get('set-cookie').split(';')[0];
  const cookie = await reg('hw@x.com'), other = await reg('other@x.com');
  const questions = [
    { type: 'mcq', prompt: 'Q0', options: ['right', 'wrong'], answer: [0], time: 20 },
    { type: 'input', prompt: 'Q1', answer: ['42'], time: 20 },
    { type: 'tf', prompt: 'Q2', answer: false, time: 20 }
  ];
  const right = { Q0: 0, Q1: '42', Q2: false }, wrong = { Q0: 1, Q1: '1', Q2: true };
  const { id: setId } = await (await post('/api/sets', { title: 'HW', questions }, cookie)).json();
  let r = await post('/api/assignments', { setId, tries: 2, title: '第五课作业' }, cookie);
  const { id, code } = await r.json();
  assert.match(code, /^[a-z2-9]{6}$/);
  assert.equal((await post('/api/assignments', { setId }, other)).status, 404, '别人的题包不能布置');
  // 布置后改题包，作业不受影响
  await fetch(BASE + `/api/sets/${setId}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'HW', questions: [questions[0]] }) });
  const info = await (await fetch(BASE + `/api/hw/${code.toUpperCase()}`)).json();
  assert.equal(info.total, 3, '作业用布置时的题目快照'); assert.equal(info.status, 'open'); assert.equal(info.teacher, 'hw@x.com');
  assert.equal((await fetch(BASE + '/hw/' + code)).status, 200, '学生页面');
  // 做一遍：全对
  async function run(name, pick, refreshAt = -1) {
    let res = await (await post(`/api/hw/${code}/start`, { name })).json();
    const token = res.token;
    for (let k = 0; !res.done; k++) {
      assert.ok(!('answer' in res.q), '题目不带答案');
      if (k === refreshAt) { res = await (await post(`/api/hw/${code}/resume`, { token })).json(); assert.equal(res.pos, k, '刷新后接着做'); }
      const ans = pick[res.q.prompt];
      const pos = res.pos;
      res = await (await post(`/api/hw/${code}/answer`, { token, pos, ans })).json();
      if (k === 0) { const dup = await (await post(`/api/hw/${code}/answer`, { token, pos, ans })).json(); assert.equal(dup.pos, pos + 1, '重复提交不会多算'); }
    }
    return res;
  }
  let done = await run('小明', right, 1);
  assert.equal(done.correct, 3); assert.ok(done.score > 2900, '全对接近满分 ' + done.score); assert.equal(done.canRetry, true);
  done = await run('小明', wrong);
  assert.equal(done.correct, 0); assert.equal(done.canRetry, false, '2 次用完');
  assert.equal((await post(`/api/hw/${code}/start`, { name: '小明' })).status, 403, '超过次数不能再做');
  await run('Ali', { Q0: 0, Q1: '0', Q2: false });
  // 开始了没做完的不算进报告
  await post(`/api/hw/${code}/start`, { name: '半途' });
  // 报告：同名取最好
  let rep = await (await fetch(BASE + `/api/assignments/${id}`, { headers: { cookie } })).json();
  assert.equal(rep.report.players.length, 2);
  const xm = rep.report.players.find(p => p.name === '小明');
  assert.equal(xm.correct, 3); assert.equal(xm.tries, 2); assert.equal(xm.rank, 1);
  assert.equal(rep.report.questions.find(x => x.prompt === 'Q1').correct, 1, 'Q1 只有小明（最好那次）答对');
  assert.equal((await fetch(BASE + `/api/assignments/${id}`, { headers: { cookie: other } })).status, 404, '别的老师看不到');
  const list = await (await fetch(BASE + '/api/assignments', { headers: { cookie } })).json();
  assert.equal(list[0].done, 2);
  // 关闭 / 截止
  await post(`/api/assignments/${id}/close`, { closed: true }, cookie);
  assert.equal((await post(`/api/hw/${code}/start`, { name: '新同学' })).status, 403, '关闭后不能开始');
  await post(`/api/assignments/${id}/close`, { closed: false }, cookie);
  q('UPDATE assignments SET due = ? WHERE id = ?').run(Date.now() - 1000, id);
  const late = await post(`/api/hw/${code}/start`, { name: '新同学' });
  assert.equal(late.status, 403); assert.equal((await late.json()).error, 'due', '截止后不能开始');
  console.log('✅ 作业模式通过：题目快照、续做、防重复提交、次数限制、关闭 / 截止、同名取最好、权限隔离');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
