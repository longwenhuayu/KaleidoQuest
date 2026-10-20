// 浏览器测试：忘记密码 → 从本地服务器日志拿重设链接 → 设新密码 → 进入后台
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const fs = require('fs');
const LOG = process.env.SERVER_LOG || '/tmp/claude-501/kq-r.log';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3048/');
  await p.fill('#email', 'me@x.sg');
  await p.click('#forgotLink');
  await p.click('#fBtn');
  await p.waitForFunction(() => document.querySelector('#forgotHint b'));
  await p.screenshot({ path: 'test/shots/20-forgot.png' });
  await p.waitForTimeout(300);
  const link = fs.readFileSync(LOG, 'utf8').match(/http:\/\/\S+\/reset\?token=\S+/)[0];
  await p.goto(link);
  await p.fill('#pw', 'newpass123'); await p.fill('#pw2', 'newpass123');
  await p.screenshot({ path: 'test/shots/21-reset.png' });
  await p.click('#go');
  await p.waitForURL('**/teacher');
  console.log(JSON.stringify({ landed: p.url(), who: await p.textContent('#who'), errs }));
  await b.close();
})();
