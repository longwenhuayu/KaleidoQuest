// 浏览器检查管理后台（先跑过其他 e2e 造数据；管理员邮箱 admin@test.sg）
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/');
  await p.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.sg', name: '朱老师', password: 'secret123' }) }));
  await p.goto(BASE + '/teacher'); await p.waitForSelector('a[href="/admin"]');
  await p.click('a[href="/admin"]'); await p.waitForSelector('.chart svg');
  await p.hover('.chart .hit >> nth=29'); await p.waitForTimeout(200);
  await p.screenshot({ path: 'test/shots/50-admin-overview.png' });
  await p.click('.ttabs button[data-v=tc]'); await p.waitForSelector('tr[data-id]');
  await p.screenshot({ path: 'test/shots/51-admin-teachers.png' });
  await p.locator('tr[data-id]').nth(1).click(); await p.waitForSelector('.drawer');
  const v = p.locator('.drawer [data-set]'); if (await v.count()) { await v.first().click(); await p.waitForSelector('.qv'); }
  await p.screenshot({ path: 'test/shots/52-admin-teacher.png' });
  await p.click('.drawer [data-x]');
  // 学生账号：列表、筛选自己注册的、打开详情、给临时密码
  await p.click('.ttabs button[data-v=st]'); await p.waitForSelector('tr[data-sid]');
  const stuRows = await p.locator('tr[data-sid]').count();
  await p.screenshot({ path: 'test/shots/54-admin-students.png' });
  await p.selectOption('#sk', 'own'); await p.waitForTimeout(500);
  const ownRows = await p.locator('tr[data-sid]').count();
  await p.locator('tr[data-sid]').first().click(); await p.waitForSelector('.drawer [data-a=pw]');
  await p.click('.drawer [data-a=pw]'); await p.waitForSelector('#pwOut .li'); await p.waitForTimeout(300);
  const temp = await p.textContent('#pwOut b');
  await p.screenshot({ path: 'test/shots/55-admin-student.png' });
  await p.click('.drawer [data-x]');
  await p.click('.ttabs button[data-v=sys]'); await p.waitForSelector('#vsys .tile');
  await p.screenshot({ path: 'test/shots/53-admin-system.png' });
  // 普通老师进不去
  const p2 = await (await b.newContext()).newPage();
  await p2.goto(BASE + '/'); await p2.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `n${Date.now()}@test.sg`, name: 'n', password: 'secret123' }) }));
  await p2.goto(BASE + '/admin'); await p2.waitForTimeout(800);
  console.log(JSON.stringify({ rows: await p.locator('tr[data-id]').count(), stuRows, ownRows, temp, denied: await p2.textContent('.wrap'), errs }));
  await b.close();
})();
