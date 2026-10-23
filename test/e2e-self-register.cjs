// 浏览器端到端：首页「学生自己注册」→ 注册 → 用班级码加入班级 → 老师看到 @用户名、给临时密码 → 学生用户名登录、改密码 → 忘记密码页
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|fonts|401|409/.test(m.text())) errs.push(who + ' console: ' + m.text()); }); };
  const user = 'e2e' + String(Date.now()).slice(-8);
  // 学生从首页点「学生自己注册」
  const S = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage(); watch(S, 'student');
  await S.goto(BASE + '/'); await S.click('#stuReg'); await S.waitForSelector('#fr');
  await S.fill('#ru', user); await S.fill('#rn', '阿明'); await S.fill('#rp', 'secret1'); await S.fill('#re', 'parent@test.sg');
  await shot(S, '80-self-register');
  await S.click('#fr button'); await S.waitForSelector('.hello');
  const hello1 = await S.textContent('.hello'); await shot(S, '81-self-in-no-class');
  // 老师建班
  const T = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(T, 'teacher');
  await T.goto(BASE + '/');
  await T.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `self${Date.now()}@test.sg`, name: '黄老师', password: 'secret123' }) }));
  await T.goto(BASE + '/teacher'); await T.click('[data-v=classes]');
  await T.click('#clsNew'); await T.fill('#cName', '四爱班'); await T.fill('#cNames', '小华'); await T.click('#cGo'); await T.waitForSelector('.ctab');
  const code = await T.evaluate(() => document.querySelector('.card b[style*="letter-spacing:3px"]').textContent);
  // 学生输入班级码加入
  await S.fill('#jc', code); await S.click('#fj button'); await S.waitForFunction(() => !document.querySelector('#fj'));
  const hello2 = await S.textContent('.hello');
  // 老师看到 @用户名，重设得到临时密码
  await T.reload(); await T.click('[data-v=classes]'); await T.click('[data-cls]'); await T.waitForSelector('.ctab');
  const row = await T.evaluate(u => [...document.querySelectorAll('.ctab tr')].find(r => r.textContent.includes(u)).textContent, user);
  const btn = T.locator(`.ctab tr:has-text("${user}") [data-s=pin]`); await btn.click(); await btn.click();
  await T.waitForSelector('.mp-box'); await T.waitForTimeout(400); await shot(T, '82-teacher-temp-password');
  const temp = await T.evaluate(() => document.querySelector('.mp-box b[style*="letter-spacing:3px"]').textContent);
  // 学生旧登录失效 → 用户名 + 临时密码登录 → 改密码
  await S.reload(); await S.waitForSelector('.tabs'); await S.click('[data-m=user]');
  await S.fill('#un', user); await S.fill('#up', temp); await S.click('#fu1 button'); await S.waitForSelector('.hello');
  await S.click('#pwBtn'); await S.fill('#po', temp); await S.fill('#pn', 'mynewpw'); await S.click('#fp button'); await S.waitForSelector('#pwBtn');
  await S.click('#out'); await S.waitForSelector('.tabs'); await S.click('[data-m=user]');
  await S.fill('#un', user); await S.fill('#up', 'mynewpw'); await S.click('#fu1 button'); await S.waitForSelector('.hello');
  const relogin = await S.textContent('.hello');
  // 忘记密码
  await S.click('#out'); await S.waitForSelector('.tabs'); await S.click('[data-m=user]'); await S.click('#fg');
  await S.fill('#fu', user); await S.click('#fb'); await S.waitForSelector('.ok'); await shot(S, '83-forgot');
  const forgot = await S.textContent('.ok');
  // 家长邮箱里的链接打开的重设页：学生模式至少 6 位
  await S.goto(BASE + '/reset?student=1&token=x'); const ph = await S.getAttribute('#pw', 'placeholder');
  await b.close();
  const ok = hello1.includes('@' + user) && /还没加入班级|Not in a class/.test(hello1) && hello2.includes('四爱班') && row.includes('@' + user) && /^[a-z0-9]{6}$/.test(temp) && relogin.includes('四爱班') && /家长邮箱|parent email/.test(forgot) && /6/.test(ph) && !errs.length;
  console.log({ hello1: hello1.slice(0, 60), hello2: hello2.slice(0, 60), row, temp, forgot: forgot.slice(0, 40), ph, errs });
  console.log(ok ? '✅ 学生自己注册浏览器测试通过' : '❌ 失败'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
