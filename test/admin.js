// 管理后台：权限、总览统计、停用、代发重设、删除、只读查看
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = 'Boss@x.com, other-admin@x.com';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-admin-${Date.now()}.db`);
process.env.PORT = String(42000 + (Math.random() * 900 | 0));
const assert = require('assert');
const { server } = require('../server');
const { outbox } = require('../lib/mail');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const req = (method, p, body, cookie) => fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const reg = async (email, name) => (await req('POST', '/api/register', { email, name, password: 'secret123' })).headers.get('set-cookie').split(';')[0];
(async () => {
  await new Promise(r => server.on('listening', r));
  const boss = await reg('boss@x.com', '管理员'), t1 = await reg('t1@x.com', '王老师'), t2 = await reg('t2@x.com', '李老师');
  assert.equal((await (await req('GET', '/api/me', null, boss)).json()).isAdmin, true, '白名单里的是管理员（不分大小写）');
  assert.equal((await (await req('GET', '/api/me', null, t1)).json()).isAdmin, false);
  assert.equal((await req('GET', '/api/admin/overview', null, t1)).status, 403, '普通老师进不了');
  assert.equal((await req('GET', '/api/admin/overview')).status, 401, '没登录进不了');
  // 造点数据
  const { id: setId } = await (await req('POST', '/api/sets', { title: '王老师的题', questions: [{ type: 'tf', prompt: 'x', answer: true }] }, t1)).json();
  const { code } = await (await req('POST', '/api/assignments', { setId }, t1)).json();
  let s = await (await req('POST', `/api/hw/${code}/start`, { name: '小明' })).json();
  s = await (await req('POST', `/api/hw/${code}/answer`, { token: s.token, pos: 0, ans: true })).json();
  assert.ok(s.done);
  const o = await (await req('GET', '/api/admin/overview', null, boss)).json();
  assert.equal(o.totals.teachers, 3); assert.equal(o.totals.sets, 1); assert.equal(o.totals.assignments, 1); assert.equal(o.totals.participations, 1);
  assert.equal(o.days.length, 30); assert.equal(o.today.students, 1, '今天的作业完成算进学生人次'); assert.equal(o.today.teachers, 3);
  // 老师列表和详情
  let list = await (await req('GET', '/api/admin/teachers?q=王', null, boss)).json();
  assert.equal(list.length, 1); assert.equal(list[0].sets, 1); assert.equal(list[0].assignments, 1);
  const id1 = list[0].id;
  const detail = await (await req('GET', `/api/admin/teachers/${id1}`, null, boss)).json();
  assert.equal(detail.sets[0].title, '王老师的题'); assert.equal(detail.assignments[0].done, 1);
  assert.equal((await (await req('GET', `/api/admin/sets/${setId}`, null, boss)).json()).teacher, '王老师', '只读查看别人的题包');
  // 停用：会话失效、不能登录；再启用就能登录
  await req('POST', `/api/admin/teachers/${id1}/disable`, { disabled: true }, boss);
  assert.equal((await req('GET', '/api/me', null, t1)).status, 401, '停用后原来的会话失效');
  assert.equal((await req('POST', '/api/login', { email: 't1@x.com', password: 'secret123' })).status, 403, '停用后不能登录');
  await req('POST', `/api/admin/teachers/${id1}/disable`, { disabled: false }, boss);
  assert.equal((await req('POST', '/api/login', { email: 't1@x.com', password: 'secret123' })).status, 200);
  // 代发重设密码
  assert.equal((await req('POST', `/api/admin/teachers/${id1}/reset`, null, boss)).status, 200);
  assert.equal(outbox.at(-1).to, 't1@x.com');
  // 不能停用 / 删除自己
  const me = (await (await req('GET', '/api/admin/teachers?q=boss', null, boss)).json())[0];
  assert.equal(me.admin, true);
  assert.equal((await req('DELETE', `/api/admin/teachers/${me.id}`, null, boss)).status, 400);
  assert.equal((await req('POST', `/api/admin/teachers/${me.id}/disable`, { disabled: true }, boss)).status, 400);
  // 删除老师连带题包和作业
  await req('DELETE', `/api/admin/teachers/${id1}`, null, boss);
  assert.equal((await req('GET', `/api/admin/sets/${setId}`, null, boss)).status, 404);
  assert.equal((await req('GET', `/api/hw/${code}`)).status, 404);
  const sys = await (await req('GET', '/api/admin/system', null, boss)).json();
  assert.ok(sys.dbSize > 0 && sys.memory > 0);
  console.log('✅ 管理后台通过：权限、总览统计、搜索、只读查看、停用 / 启用、代发重设、不能删自己、删除连带清理');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
