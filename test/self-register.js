// 学生自己注册：旧库迁移、注册 / 用户名登录、加入班级、老师重设临时密码、家长邮箱找回、移出 / 删班级时账号保留
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `arena-self-${Date.now()}.db`);
process.env.PORT = String(45000 + (Math.random() * 900 | 0));
const assert = require('assert');
// 先造一个旧格式的库（students.class_id / pin 是 NOT NULL），里面有学生、卡、记录
{
  const { DatabaseSync } = require('node:sqlite');
  const old = new DatabaseSync(process.env.DB_PATH);
  old.exec(`
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, pw TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE classes (id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
    CREATE TABLE students (id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, name TEXT NOT NULL, pin TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE (class_id, name));
    CREATE TABLE student_cards (student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, card_id TEXT NOT NULL, card TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, first INTEGER NOT NULL, PRIMARY KEY (student_id, card_id));
    INSERT INTO teachers VALUES (1, 'old@x.com', '旧老师', 'x', 1);
    INSERT INTO classes VALUES (1, 1, '旧班', 'oldcls', 1);
    INSERT INTO students VALUES (1, 1, '旧生', '1234', 1);
    INSERT INTO student_cards VALUES (1, 'math:pi', '{}', 2, 1);`);
  old.close();
}
const { server } = require('../server');
const { q } = require('../lib/db');
const mail = require('../lib/mail');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const req = (p, { body, cookie, method } = {}) => fetch(BASE + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const json = async (p, o) => (await req(p, o)).json();
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];

(async () => {
  await new Promise(r => server.on('listening', r));
  // 迁移：旧数据还在、能用 PIN 登录，外键（连带删除）照样生效
  assert.deepEqual(q('SELECT id, class_id, name, pin, username FROM students').get(), { id: 1, class_id: 1, name: '旧生', pin: '1234', username: null });
  assert.equal((await req('/api/student/login', { body: { code: 'oldcls', name: '旧生', pin: '1234' } })).status, 200, '迁移后旧学生能登录');
  assert.equal(q('PRAGMA foreign_key_check').all().length, 0);
  q('DELETE FROM classes WHERE id = 1').run();
  assert.equal(q('SELECT count(*) n FROM student_cards').get().n, 0, '迁移后连带删除仍有效');

  // 注册
  const reg = b => req('/api/student/register', { body: b });
  assert.equal((await reg({ username: 'ab', password: 'secret1' })).status, 400, '用户名太短');
  assert.equal((await reg({ username: '小明', password: 'secret1' })).status, 400, '用户名只能字母数字下划线');
  assert.equal((await reg({ username: 'ming01', password: '12345' })).status, 400, '密码至少 6 位');
  assert.equal((await reg({ username: 'ming01', password: 'secret1', parentEmail: 'not-an-email' })).status, 400);
  let r = await reg({ username: 'Ming01', password: 'secret1', name: '小明', parentEmail: 'Mum@X.com' });
  assert.equal(r.status, 200); const M = cookieOf(r);
  assert.equal((await reg({ username: 'MING01', password: 'secret1' })).status, 409, '用户名不分大小写');
  assert.deepEqual(await json('/api/student/me', { cookie: M }), { name: '小明', className: null, username: 'ming01', avatar: null });
  r = await reg({ username: 'hong_02', password: 'secret2' }); const H = cookieOf(r);
  assert.equal((await json('/api/student/me', { cookie: H })).name, 'hong_02', '没填名字就用用户名');
  // 没加班级也能记卡和成绩
  assert.equal((await json('/api/student/cards/merge', { body: { cards: [{ id: 'math:pi', n: 1 }] }, cookie: M })).merged, 1);
  // 用户名登录
  assert.equal((await req('/api/student/login-user', { body: { username: 'ming01', password: 'nope00' } })).status, 401);
  assert.equal((await req('/api/student/login-user', { body: { username: 'MING01', password: 'secret1' } })).status, 200);
  // 加入班级
  const T = cookieOf(await req('/api/register', { body: { email: 'sr@x.com', name: '陈老师', password: 'secret123' } }));
  const T2 = cookieOf(await req('/api/register', { body: { email: 'sr2@x.com', name: '别班', password: 'secret123' } }));
  const { id: cid } = await json('/api/classes', { body: { name: '三忠', names: '小明\n小红' }, cookie: T });
  const code = (await json(`/api/classes/${cid}`, { cookie: T })).code;
  assert.equal((await req('/api/student/join', { body: { code: 'zzzzzz' }, cookie: M })).status, 404);
  assert.equal((await req('/api/student/join', { body: { code }, cookie: M })).status, 409, '班里已有同名的「小明」');
  assert.equal((await json('/api/student/join', { body: { code }, cookie: H })).className, '三忠');
  assert.equal((await json('/api/student/me', { cookie: H })).className, '三忠');
  const pinStu = (await json(`/api/classes/${cid}`, { cookie: T })).students.find(s => s.name === '小明');
  const P = cookieOf(await req('/api/student/login', { body: { code, name: '小明', pin: pinStu.pin } }));
  assert.equal((await req('/api/student/join', { body: { code }, cookie: P })).status, 400, '老师建的账号不能自己换班');
  let c = await json(`/api/classes/${cid}`, { cookie: T });
  const hong = c.students.find(s => s.username === 'hong_02');
  assert.ok(hong && hong.pin === null, '老师看到自注册学生（没有 PIN）');
  assert.ok(!(await json(`/api/class/${code}`)).students.includes('hong_02'), 'PIN 登录名单里没有自注册学生');
  assert.equal((await req('/api/student/login', { body: { code, name: 'hong_02', pin: '0000' } })).status, 401, '自注册学生不能用 PIN 登录');
  // 老师重设：给临时密码，旧登录失效
  assert.equal((await req(`/api/classes/${cid}/students/${hong.id}/pin`, { body: {}, cookie: T2 })).status, 404);
  const { password: temp } = await json(`/api/classes/${cid}/students/${hong.id}/pin`, { body: {}, cookie: T });
  assert.match(temp, /^[a-z0-9]{6}$/);
  assert.equal((await req('/api/student/me', { cookie: H })).status, 401, '旧登录失效');
  const H2 = cookieOf(await req('/api/student/login-user', { body: { username: 'hong_02', password: temp } }));
  // 自己改密码
  assert.equal((await req('/api/student/password', { body: { old: 'wrong1', password: 'newpass' }, cookie: H2 })).status, 401);
  assert.equal((await req('/api/student/password', { body: { old: temp, password: '123' }, cookie: H2 })).status, 400);
  assert.equal((await req('/api/student/password', { body: { old: temp, password: 'newpass' }, cookie: H2 })).status, 200);
  assert.equal((await req('/api/student/login-user', { body: { username: 'hong_02', password: 'newpass' } })).status, 200);
  assert.equal((await req('/api/student/password', { body: { old: '1234', password: 'newpass' }, cookie: P })).status, 400, 'PIN 账号没有密码可改');
  // 家长邮箱找回
  mail.outbox.length = 0;
  assert.equal((await req('/api/student/forgot', { body: { username: 'ming01' } })).status, 200);
  assert.equal((await req('/api/student/forgot', { body: { username: 'hong_02' } })).status, 200, '没填家长邮箱也回一样的结果');
  assert.equal((await req('/api/student/forgot', { body: { username: 'nobody' } })).status, 200);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(mail.outbox.length, 1); assert.equal(mail.outbox[0].to, 'mum@x.com');
  const token = /token=([\w-]+)/.exec(mail.outbox[0].text)[1];
  assert.ok(mail.outbox[0].text.includes('/reset?student=1&token='));
  assert.equal((await req('/api/student/reset', { body: { token, password: '12' } })).status, 400);
  assert.equal((await req('/api/student/reset', { body: { token: 'bad', password: 'brandnew' } })).status, 400);
  r = await req('/api/student/reset', { body: { token, password: 'brandnew' } }); assert.equal(r.status, 200);
  assert.equal((await json('/api/student/me', { cookie: cookieOf(r) })).username, 'ming01', '重设后直接登录');
  assert.equal((await req('/api/student/reset', { body: { token, password: 'again99' } })).status, 400, '链接只能用一次');
  assert.equal((await req('/api/student/login-user', { body: { username: 'ming01', password: 'brandnew' } })).status, 200);
  // 老师「删除」自注册学生 = 移出班级，账号和卡还在
  await req(`/api/classes/${cid}/students/${hong.id}`, { method: 'DELETE', cookie: T });
  assert.equal((await json('/api/student/me', { cookie: H2 })).className, null);
  assert.equal((await json(`/api/student/join`, { body: { code }, cookie: H2 })).className, '三忠', '可以再加入');
  // 删班级：自注册学生账号保留，老师建的学生删除
  await req(`/api/classes/${cid}`, { method: 'DELETE', cookie: T });
  assert.deepEqual(q("SELECT username, class_id FROM students WHERE username = 'hong_02'").get(), { username: 'hong_02', class_id: null });
  assert.equal(q("SELECT count(*) n FROM students WHERE username IS NULL").get().n, 0);
  // 删老师（连带删班级）也一样
  const { id: cid2 } = await json('/api/classes', { body: { name: '四忠' }, cookie: T2 });
  await json('/api/student/join', { body: { code: (await json(`/api/classes/${cid2}`, { cookie: T2 })).code }, cookie: H2 });
  q("DELETE FROM teachers WHERE email = 'sr2@x.com'").run();
  assert.deepEqual(q("SELECT class_id FROM students WHERE username = 'hong_02'").get(), { class_id: null }, '删老师后账号还在');
  assert.equal(q("SELECT count(*) n FROM student_cards WHERE student_id = (SELECT id FROM students WHERE username = 'ming01')").get().n, 1, '卡还在');
  console.log('✅ 学生自己注册通过：旧库迁移、注册校验、用户名登录、加入班级（同名拦截）、老师临时密码、自己改密码、家长邮箱找回（防探测、一次性）、移出 / 删班级 / 删老师时账号保留');
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
