// 浏览器端到端：夺宝模式（老师 + 3 个手机学生，跑 15 秒后提前结束）
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => p.on('pageerror', e => errs.push(`${who}: ${e.message}`));
  const T = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage(); watch(T, 'host');
  await T.goto(BASE + '/');
  const setId = await T.evaluate(async () => {
    await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tq${Date.now()}@test.sg`, name: '李老师', password: 'secret123' }) });
    const qs = [1, 2, 3, 4, 5, 6].map(i => ({ type: 'mcq', prompt: `${i} + ${i} = ?`, options: [String(i * 2), String(i * 2 + 1), String(i * 2 - 1), String(i + 1)], answer: [0], time: 20 }));
    qs.push({ type: 'tf', prompt: '7 × 8 = 56', answer: true, time: 10 });
    return (await (await fetch('/api/sets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '口算夺宝', subject: 'math', questions: qs }) })).json()).id;
  });
  await T.goto(`${BASE}/teacher`);
  await T.click('[data-act=play]');
  await shot(T, '30-mode-picker');
  await T.locator('a[href*="mode=treasure"]').first().click();
  await T.waitForSelector('#sLobby.on');
  const pin = (await T.textContent('#pin')).replace(/\s/g, '');
  const S = [];
  for (const name of ['小明', 'Ali', '小红']) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage(); watch(p, name);
    await p.goto(`${BASE}/play?pin=${pin}`); await p.fill('#nameIn', name); await p.click('#joinBtn'); await p.waitForSelector('#vWait.on');
    S.push(p);
  }
  await T.click('#startBtn');
  await T.waitForSelector('#sTreasure.on');
  const seen = new Set(), stop = Date.now() + 15000;
  // 每个学生自己循环：答对（第一个选项都是对的）→ 开宝箱 → 选人 → 下一题
  await Promise.all(S.map(async (p, i) => {
    while (Date.now() < stop) {
      const v = await p.evaluate(() => document.querySelector('.view.on')?.id);
      if (v === 'vQ') { await p.locator('.choice').first().click().catch(() => {}); }
      else if (v === 'vChest') { if (!seen.has('chest')) { seen.add('chest'); await shot(p, '31-student-chest'); } await p.locator('#chests button').nth(i % 3).click().catch(() => {}); }
      else if (v === 'vPick') { if (!seen.has('pick')) { seen.add('pick'); await shot(p, '32-student-pick'); } await p.locator('#pickList button').first().click().catch(() => {}); }
      else if (v === 'vOut') { const k = await p.textContent('#outE'); if (!seen.has(k)) { seen.add(k); await shot(p, `33-student-out-${seen.size}`); } await p.click('#outGo').catch(() => {}); }
      await p.waitForTimeout(120);
    }
  }));
  await shot(T, '34-host-treasure');
  const board = await T.evaluate(() => ({ rows: document.querySelectorAll('.trow').length, events: document.querySelectorAll('.ev').length, clock: document.querySelector('#tqClock').textContent }));
  await T.click('#tqEnd'); await T.click('#tqEnd');
  await T.waitForSelector('#sEnd.on');
  await T.waitForTimeout(2200); await shot(T, '35-host-podium');
  await S[0].waitForSelector('#vEnd.on'); await shot(S[0], '36-student-end');
  await T.goto(BASE + (await T.getAttribute('#reportBtn', 'href')), { waitUntil: 'networkidle' });
  await T.waitForSelector('.qrow'); await shot(T, '37-report');
  const rep = await T.evaluate(() => ({ mode: G.mode, players: G.report.players.map(p => `${p.name}:${p.score}💎 ${p.correct}/${p.tries}`) }));
  console.log(JSON.stringify({ board, seen: [...seen], rep, errs }, null, 1));
  await b.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
