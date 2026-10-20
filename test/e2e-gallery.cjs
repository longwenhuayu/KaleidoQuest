// 浏览器端到端：首页 Gallery → 免登录单人试玩 → /gallery 筛选 → 访客投屏开一局 → 学生加入 → 结束页显示注册入口
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|fonts|401/.test(m.text())) errs.push(who + ' console: ' + m.text()); }); };
  // 首页
  const H = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage(); watch(H, 'home');
  await H.goto(BASE + '/'); await H.waitForSelector('#galGrid .gcard');
  const homeCards = await H.locator('#galGrid .gcard').count(), festCards = await H.locator('#festGrid .gcard').count();
  await H.click('#tryLink'); await H.waitForTimeout(600); await shot(H, '60-home-gallery');
  // 手机单人试玩
  const P = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage(); watch(P, 'try');
  await P.goto(BASE + '/'); await P.waitForSelector('#galGrid .gcard');
  await P.locator('#galGrid .gcard[data-id="m-20"] .gacts a[href="/try/m-20"]').click();
  await P.waitForSelector('#vIntro.on'); await shot(P, '61-try-intro');
  await P.click('#startBtn');
  for (let k = 0; ; k++) {
    await P.waitForSelector('#vQ.on, #vDone.on');
    if (await P.isVisible('#vDone')) break;
    if (k === 0) await shot(P, '62-try-question');
    const type = await P.evaluate(() => cur.q.type);
    if (type === 'input') { if (await P.evaluate(() => getComputedStyle(document.querySelector('#typeIn')).color) === 'rgb(255, 255, 255)') errs.push('答题输入框是白字'); await P.fill('#typeIn', '1'); await P.click('.typebox button'); }
    else if (type === 'order') { const items = await P.evaluate(() => cur.q.items.map(x => x.i)); for (const v of items) await P.click(`.ord-pick button[data-i="${v}"]`); await P.click('#ordGo'); }
    else await P.locator('.choice').first().click();
    // 答对且没有讲解时 1.2 秒后自动下一题
    await P.waitForSelector('#fb .fb', { timeout: 5000 }).catch(async e => { await shot(P, 'zz-fail'); console.log(await P.evaluate(() => ({ cur, fb: document.querySelector('#fb').innerHTML, view: document.querySelector('.view.on').id, val: document.querySelector('#typeIn') && document.querySelector('#typeIn').value }))); throw e; }); await P.click('#nextBtn', { timeout: 800 }).catch(() => {}); await P.waitForSelector('#fb .fb', { state: 'detached' });
  }
  await P.waitForTimeout(1500); await shot(P, '63-try-done');
  const doneText = await P.textContent('#vDone'), doneCards = await P.locator('#dCards .kc').count(), more = await P.locator('#dMore a').count();
  // /gallery 页：筛选
  await H.goto(BASE + '/gallery'); await H.waitForSelector('.gcard');
  const all = await H.locator('.gcard').count();
  // 节日专题筛选 + 搜索
  await H.click('.colls [data-c=cny]'); const cny = await H.locator('.gcard').count();
  await H.click('.colls [data-c=cny]'); await H.fill('#q', '分数'); await H.waitForTimeout(200); const found = await H.locator('.gcard').count();
  await H.fill('#q', 'fractions'); await H.waitForTimeout(200); const foundEn = await H.locator('.gcard').count();
  await H.fill('#q', 'zzzz'); await H.waitForTimeout(200); const none = await H.isVisible('.none'); await shot(H, '63b-gallery-search');
  await H.fill('#q', '');
  await H.click('.gchip[data-s=science]'); const sci = await H.locator('.gcard').count();
  await shot(H, '64-gallery-science');
  await H.click('.gchip[data-s=all]');
  // 未登录点复制 → 去注册
  await H.locator('.gcard[data-id="en-words"] [data-g=copy]').click();
  await H.waitForURL(/signup=1/, { timeout: 5000 }); await H.waitForTimeout(400);
  const regOn = await H.getAttribute('[data-tab=register]', 'class');
  await shot(H, '65-signup-from-gallery');
  // 访客投屏
  await H.goto(BASE + '/gallery'); await H.waitForSelector('.gcard');
  await H.locator('.gcard[data-id="sci-living"] [data-g=host]').click();
  await H.waitForSelector('.mp-card'); await shot(H, '66-gallery-mode');
  await H.locator('a[href*="mode=classic"]').first().click();
  await H.waitForSelector('#sLobby.on'); const pin = (await H.textContent('#pin')).replace(/\s/g, '');
  const S = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage(); watch(S, 'student');
  await S.goto(`${BASE}/play?pin=${pin}`); await S.fill('#nameIn', '小明'); await S.click('#joinBtn'); await S.waitForSelector('#vWait.on');
  await H.waitForFunction(() => document.querySelectorAll('.pl').length === 1);
  await shot(H, '67-guest-lobby');
  // 刷新主持页：靠主持令牌回到同一个房间
  await H.reload(); await H.waitForSelector('#sLobby.on');
  const pin2 = (await H.textContent('#pin')).replace(/\s/g, '');
  await H.click('#startBtn');
  for (let k = 0; ; k++) {
    await H.waitForSelector('#sQ.on, #sEnd.on', { timeout: 15000 });
    if (await H.isVisible('#sEnd')) break;
    await S.waitForSelector('#vQ.on');
    const type = await S.evaluate(() => cur.q.type);
    if (type === 'input') { await S.fill('#typeIn', 'x'); await S.click('.typebox button'); }
    else if (type === 'order') { const items = await S.evaluate(() => cur.q.items.map(x => x.i)); for (const v of items) await S.click(`.ord-pick button[data-i="${v}"]`); await S.click('#ordGo'); }
    else await S.locator('.choice').first().click();
    await H.waitForSelector('#sReveal.on', { timeout: 15000 });
    await H.click('#toBoard'); await H.waitForSelector('#sBoard.on'); await H.click('#nextBtn');
  }
  await H.waitForTimeout(2200); await shot(H, '68-guest-end');
  const repHref = await H.getAttribute('#reportBtn', 'href'), dash = await H.getAttribute('#toDash', 'href'), again = await H.getAttribute('#againBtn', 'href');
  await b.close();
  const ok = homeCards === 5 && /挑战完成|全对/.test(doneText) && doneCards >= 1 && more === 2 && all === 37 && festCards === 3 && cny === 3 && found >= 1 && foundEn >= 1 && none && sci === 5 && /on/.test(regOn) && pin2 === pin && repHref === '/?signup=1' && dash === '/gallery' && /gallery=sci-living/.test(again) && !errs.length;
  console.log({ homeCards, festCards, doneCards, more, all, cny, found, foundEn, none, sci, regOn, pin, pin2, repHref, dash, again, errs });
  console.log(ok ? '✅ Gallery 浏览器测试通过' : '❌ 失败'); process.exit(ok ? 0 : 1);
})().catch(async e => { console.error(e.message); process.exit(1); });
