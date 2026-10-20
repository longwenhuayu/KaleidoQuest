// 密码框小眼睛：首页（登录 / 注册）和重设密码页
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/');
  await p.click('#loginBtn');
  await p.fill('#email', 'a@b.sg'); await p.fill('#password', 'MySecret9');
  const before = await p.getAttribute('#password', 'type');
  await p.click('.pw-eye');
  const after = await p.getAttribute('#password', 'type'), label = await p.getAttribute('.pw-eye', 'aria-label');
  await p.locator('#teacherPanel').screenshot({ path: 'test/shots/60-eye-login.png' });
  await p.click('.pw-eye');
  const back = await p.getAttribute('#password', 'type');
  // 注册时也在
  await p.click('[data-tab=register]');
  const regEye = await p.isVisible('.pw-eye');
  await p.goto(BASE + '/reset?token=x');
  const resetEyes = await p.locator('.pw-eye').count();
  await p.fill('#pw', 'abc12345'); await p.locator('.pw-eye').first().click();
  await p.locator('.box').screenshot({ path: 'test/shots/61-eye-reset.png' });
  // 手机宽度不溢出
  const m = await (await b.newContext({ viewport: { width: 375, height: 700 }, isMobile: true })).newPage();
  await m.goto(BASE + '/'); const overflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(JSON.stringify({ before, after, back, label, regEye, resetEyes, overflow, errs }));
  await b.close();
})();
