// 浏览器端到端：学生用收集到的卡片角色当头像 → 大屏大厅、排行榜、颁奖台都显示；吉祥物出现在等待画面
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) errs.push(who + ' console: ' + m.text()); }); };
  const T = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); watch(T, 'host');
  await T.goto(BASE + '/');
  const setId = await T.evaluate(async () => {
    await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `av${Date.now()}@test.sg`, name: '头像测', password: 'secret123' }) });
    return (await (await fetch('/api/gallery/m-order/copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).id;
  });
  await T.goto(`${BASE}/host?set=${setId}&mode=classic&new=1`); await T.waitForSelector('#sLobby.on');
  const mascotLobby = await T.isVisible('.waiting .mascot');
  await shot(T, '80-lobby-mascot');
  const pin = (await T.textContent('#pin')).replace(/\s/g, '');
  // 学生 A：本机卡册里有两张卡
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('kq_cards', JSON.stringify({ 'math:pi': { card: { id: 'math:pi', set: 'math', emoji: '🥧', name: ['圆周率 π', 'Pi'], rarity: 'e', fact: ['', ''] }, n: 1, first: 1 }, 'explorer:owl': { card: { id: 'explorer:owl', set: 'explorer', emoji: '🦉', name: ['智慧猫头鹰', 'Wise Owl'], rarity: 'r', fact: ['', ''] }, n: 1, first: 2 } })));
  const A = await ctx.newPage(); watch(A, 'A');
  await A.goto(`${BASE}/play?pin=${pin}`); await A.waitForSelector('#avRow button');
  const choices = await A.locator('#avRow button').count();
  await A.click('#avRow [data-a="card:owl"]'); await A.fill('#nameIn', '小明');
  await shot(A, '81-avatar-pick');
  await A.click('#joinBtn'); await A.waitForSelector('#vWait.on'); await A.waitForTimeout(400);
  const waitImg = await A.isVisible('#waitAv img');
  await shot(A, '82-wait-avatar');
  // 学生 B：没有卡，看不到选择器
  const B = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage(); watch(B, 'B');
  await B.goto(`${BASE}/play?pin=${pin}`); await B.waitForTimeout(500);
  const bPicker = await B.isVisible('#avPick');
  await B.fill('#nameIn', 'Ali'); await B.click('#joinBtn'); await B.waitForSelector('#vWait.on');
  await T.waitForFunction(() => document.querySelectorAll('.pl').length === 2);
  const lobbyImg = await T.locator('.pl img.av-img').count();
  await shot(T, '83-lobby-avatars');
  await T.click('#startBtn');
  for (let k = 0; ; k++) {
    await T.waitForSelector('#sQ.on, #sEnd.on', { timeout: 15000 }); if (await T.isVisible('#sEnd')) break;
    await A.waitForSelector('#vQ.on'); await B.waitForSelector('#vQ.on');
    await A.locator('.choice').first().click(); await B.locator('.choice').nth(1).click();
    await T.waitForSelector('#sReveal.on'); await T.click('#toBoard'); await T.waitForSelector('#sBoard.on');
    if (k === 0) await shot(T, '84-board-avatar');
    await T.click('#nextBtn');
  }
  await T.waitForTimeout(1500);
  const podiumImg = await T.locator('#podium img.av-img').count();
  await shot(T, '85-podium-avatar');
  const repHref = await T.getAttribute('#reportBtn', 'href');
  await T.goto(BASE + repHref); await T.waitForSelector('.qrow');
  const repImg = await T.locator('img.av-img').count();
  await b.close();
  const ok = mascotLobby && choices === 3 && waitImg && !bPicker && lobbyImg === 1 && podiumImg === 1 && repImg >= 1 && !errs.length;
  console.log({ mascotLobby, choices, waitImg, bPicker, lobbyImg, podiumImg, repImg, errs });
  console.log(ok ? '✅ 头像浏览器测试通过' : '❌ 失败'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
