// 管理后台 · 学生账号：权限、列表筛选、详情、改资料、重设（PIN / 临时密码）、代发家长邮件、移出班级、删除、操作日志、总览计数
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = 'boss@x.com';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-adm-stu-${Date.now()}.db`);
process.env.PORT = String(46000 + (Math.random() * 900 | 0));
const assert = require('assert');
const { server } = require('../server');
const { q } = require('../lib/db');
const { outbox } = require('../lib/mail');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const req = (method, p, body, cookie) => fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const json = async (...a) => (await req(...a)).json();
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];
(async () => {
  await new Promise(r => server.on('listening', r));
  const boss = cookieOf(await req('POST', '/api/register', { email: 'boss@x.com', name: '管理员', password: 'secret123' }));
  const T = cookieOf(await req('POST', '/api/register', { email: 't@x.com', name: '王老师', password: 'secret123' }));
  // 一个班（老师建的小明、小红）+ 两个自注册学生（一个加了班、一个没加）
  const { id: cid } = await json('POST', '/api/classes', { name: '三忠', names: '小明\n小红' }, T);
  const cls = await json('GET', `/api/classes/${cid}`, null, T);
  const ming = cls.students.find(s => s.name === '小明');
  const M = cookieOf(await req('POST', '/api/student/login', { code: cls.code, name: '小明', pin: ming.pin }));
  const A1 = cookieOf(await req('POST', '/api/student/register', { username: 'ali_01', password: 'secret1', name: 'Ali', parentEmail: 'mum@x.com' }));
  await json('POST', '/api/student/join', { code: cls.code }, A1);
  const B1 = cookieOf(await req('POST', '/api/student/register', { username: 'bo_02', password: 'secret2' }));
  await json('POST', '/api/student/cards/merge', { cards: [{ id: 'math:pi', n: 1 }] }, B1);
  // 权限
  assert.equal((await req('GET', '/api/admin/students', null, T)).status, 403);
  assert.equal((await req('GET', '/api/admin/students')).status, 401);
  // 总览计数
  const o = await json('GET', '/api/admin/overview', null, boss);
  assert.deepEqual([o.totals.students, o.totals.studentsOwn, o.totals.studentsActiveWeek], [4, 2, 3], '学生总数 / 自注册 / 7 天活跃（登录过的 3 个）');
  // 列表、搜索、筛选
  let list = await json('GET', '/api/admin/students', null, boss);
  assert.equal(list.length, 4);
  assert.deepEqual((await json('GET', '/api/admin/students?kind=own', null, boss)).map(s => s.username).sort(), ['ali_01', 'bo_02']);
  assert.deepEqual((await json('GET', '/api/admin/students?kind=class', null, boss)).map(s => s.name).sort(), ['小明', '小红']);
  assert.deepEqual((await json('GET', '/api/admin/students?q=三忠', null, boss)).length, 3, '按班级名搜');
  const ali = list.find(s => s.username === 'ali_01'), bo = list.find(s => s.username === 'bo_02'), mingRow = list.find(s => s.name === '小明');
  assert.equal(ali.className, '三忠'); assert.equal(ali.teacher, '王老师'); assert.equal(bo.className, null); assert.equal(bo.cards, 1);
  // 详情
  let d = await json('GET', `/api/admin/students/${ali.id}`, null, boss);
  assert.equal(d.parentEmail, 'mum@x.com'); assert.equal(d.classCode, cls.code); assert.ok(Array.isArray(d.results) && Array.isArray(d.missed));
  assert.deepEqual((await json('GET', `/api/admin/students/${bo.id}`, null, boss)).decks, { math: 1 });
  assert.equal((await req('GET', '/api/admin/students/99999', null, boss)).status, 404);
  // 改资料
  assert.equal((await req('PATCH', `/api/admin/students/${ali.id}`, { name: '小明' }, boss)).status, 409, '班里重名');
  assert.equal((await req('PATCH', `/api/admin/students/${ali.id}`, { parentEmail: 'bad' }, boss)).status, 400);
  assert.equal((await req('PATCH', `/api/admin/students/${mingRow.id}`, { parentEmail: 'a@x.com' }, boss)).status, 400, '老师建的账号没有家长邮箱');
  assert.equal((await req('PATCH', `/api/admin/students/${ali.id}`, { name: '阿里', parentEmail: 'dad@x.com' }, boss)).status, 200);
  d = await json('GET', `/api/admin/students/${ali.id}`, null, boss); assert.deepEqual([d.name, d.parentEmail], ['阿里', 'dad@x.com']);
  await req('PATCH', `/api/admin/students/${ali.id}`, { parentEmail: '' }, boss);
  assert.equal((await json('GET', `/api/admin/students/${ali.id}`, null, boss)).parentEmail, null, '清空家长邮箱');
  // 代发家长邮件
  assert.equal((await req('POST', `/api/admin/students/${ali.id}/reset-email`, {}, boss)).status, 400, '没有家长邮箱');
  await req('PATCH', `/api/admin/students/${ali.id}`, { parentEmail: 'dad@x.com' }, boss);
  outbox.length = 0;
  assert.equal((await req('POST', `/api/admin/students/${ali.id}/reset-email`, {}, boss)).status, 200);
  assert.equal(outbox.length, 1); assert.equal(outbox[0].to, 'dad@x.com');
  // 重设：老师建的给 PIN，自注册的给临时密码；旧登录失效
  const { pin } = await json('POST', `/api/admin/students/${mingRow.id}/password`, {}, boss);
  assert.match(pin, /^\d{4}$/); assert.equal((await req('GET', '/api/student/me', null, M)).status, 401);
  assert.equal((await req('POST', '/api/student/login', { code: cls.code, name: '小明', pin })).status, 200);
  const { password } = await json('POST', `/api/admin/students/${ali.id}/password`, {}, boss);
  assert.match(password, /^[a-z0-9]{6}$/); assert.equal((await req('GET', '/api/student/me', null, A1)).status, 401);
  assert.equal((await req('POST', '/api/student/login-user', { username: 'ali_01', password })).status, 200);
  // 移出班级：只限自注册
  assert.equal((await req('POST', `/api/admin/students/${mingRow.id}/leave`, {}, boss)).status, 400);
  assert.equal((await req('POST', `/api/admin/students/${ali.id}/leave`, {}, boss)).status, 200);
  assert.equal((await json('GET', `/api/admin/students/${ali.id}`, null, boss)).className, null);
  // 删除：卡册连带删除
  assert.equal((await req('DELETE', `/api/admin/students/${bo.id}`, null, T)).status, 403);
  assert.equal((await req('DELETE', `/api/admin/students/${bo.id}`, null, boss)).status, 200);
  assert.equal((await req('GET', '/api/student/me', null, B1)).status, 401);
  assert.equal(q('SELECT count(*) n FROM student_cards').get().n, 0);
  // 操作日志
  const logs = (await json('GET', '/api/admin/logs', null, boss)).map(l => l.action);
  for (const a of ['student_updated', 'student_reset_email', 'student_password_reset', 'student_left_class', 'student_deleted']) assert.ok(logs.includes(a), a);
  console.log('✅ 管理后台 · 学生通过：权限、总览计数、列表搜索筛选、详情、改名（班内重名拦截）/ 家长邮箱、代发邮件、PIN / 临时密码重设、移出班级、删除连带清理、操作日志');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
