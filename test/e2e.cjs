// 浏览器端到端：老师注册 → 出题 → 开房 → 3 个学生加入答题 → 报告
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(`${who}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${who} console: ${m.text()}`); }); };
  // 老师
  const tctx = await b.newContext({ viewport: { width: 1366, height: 820 } });
  const T = await tctx.newPage(); watch(T, 'teacher');
  await T.goto(BASE + '/', { waitUntil: 'networkidle' });
  await shot(T, '01-home');
  await T.click('#signupBtn');
  await T.fill('#name', '王老师'); await T.fill('#email', `t${Date.now()}@test.sg`); await T.fill('#password', 'secret123');
  await T.click('#authBtn');
  await T.waitForURL('**/teacher');
  await T.click('#newBtn'); await T.waitForURL('**/edit');
  await T.fill('#title', '小三第五课 · 混合测验');
  // 华文插件
  await T.click('[data-p=chinese]');
  await T.fill('#zhWords', '熊猫，学校，老师，朋友，长大，银行，好，明');
  await T.selectOption('#zhMax', '10');
  await T.click('#zhGo');
  await T.waitForFunction(() => document.querySelectorAll('.qc').length >= 10, null, { timeout: 15000 });
  // 数学插件
  await T.click('[data-p=math]');
  await T.selectOption('#mN', '10');
  await T.click('#mGo');
  await T.waitForFunction(() => document.querySelectorAll('.qc').length >= 20);
  // 手动加一道排序题
  await T.click('[data-add=order]');
  const last = T.locator('.qc').last();
  await last.locator('textarea[data-f=prompt]').fill('把词语排成句子');
  await last.locator('textarea[data-f=order]').fill('我\n喜欢\n学\n中文');
  await shot(T, '02-editor');
  await T.click('#saveBtn');
  await T.waitForURL(/edit\?id=\d+/);
  const setId = new URL(T.url()).searchParams.get('id');
  // 只保留 5 题来跑游戏：选择、听音、数学填空、数学选择、排序
  await T.evaluate(async id => {
    const s = await (await fetch('/api/sets/' + id)).json();
    const pick = [s.questions.find(q => q.speak), s.questions.find(q => q.prompt.includes('怎么读')), s.questions.find(q => q.type === 'input'), s.questions.find(q => q.type === 'tf') || s.questions[12], s.questions[s.questions.length - 1]].filter(Boolean);
    pick.forEach(q => q.time = 8);
    await fetch('/api/sets/' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...s, questions: pick }) });
  }, setId);
  await T.goto(`${BASE}/host?set=${setId}`);
  await T.waitForSelector('#sLobby.on');
  const pin = (await T.textContent('#pin')).replace(/\s/g, '');
  // 3 个学生（手机尺寸）
  const S = [];
  for (const [i, name] of ['小明', 'Ali', '小红'].entries()) {
    const c = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    const p = await c.newPage(); watch(p, name);
    await p.goto(`${BASE}/play?pin=${pin}`);
    await p.fill('#nameIn', name); await p.click('#joinBtn');
    await p.waitForSelector('#vWait.on');
    S.push(p);
  }
  await T.waitForFunction(() => document.querySelectorAll('.pl').length === 3);
  await shot(T, '03-lobby'); await shot(S[0], '04-student-wait');
  await T.click('#startBtn');
  for (let k = 0; ; k++) {
    await T.waitForSelector('#sQ.on, #sEnd.on', { timeout: 15000 });
    if (await T.isVisible('#sEnd')) break;
    await Promise.all(S.map(p => p.waitForSelector('#vQ.on')));
    if (k === 0) { await shot(T, '05-host-question'); await shot(S[0], '06-student-question'); }
    // 学生 0 尽量答对（向服务器拿不到答案，就按题型点第一个/输入）；学生 1 随便答；学生 2 不答
    const type = await S[0].evaluate(() => cur.q.type);
    for (const [i, p] of S.slice(0, 2).entries()) {
      if (type === 'order') { const items = await p.evaluate(() => cur.q.items.map(x => x.i)); for (const v of [...items].sort()) await p.click(`.ord-pick button[data-i="${v}"]`); await p.click('#ordGo'); }
      else if (type === 'input') { await p.fill('#typeIn', i === 0 ? await T.evaluate(() => '') || '0' : 'abc'); await p.click('.typebox button'); }
      else await p.locator('.choice').nth(i).click();
    }
    if (k === 0) await shot(S[0], '07-student-sent');
    await T.waitForSelector('#sReveal.on', { timeout: 15000 });
    await S[0].waitForSelector('#vRes.on');
    if (k === 0) { await shot(T, '08-host-reveal'); await shot(S[0], '09-student-result'); }
    await T.click('#toBoard'); await T.waitForSelector('#sBoard.on');
    if (k === 0) await shot(T, '10-host-board');
    await T.click('#nextBtn');
  }
  await T.waitForTimeout(2200);
  await shot(T, '11-host-podium');
  await S[0].waitForSelector('#vEnd.on'); await S[0].waitForTimeout(1500); await shot(S[0], '12-student-end');
  const endCards = await S[0].locator('#endCards .kc').count();
  await S[0].goto(BASE + '/cards'); await S[0].waitForSelector('.kc');
  await shot(S[0], '14-card-book');
  await S[0].locator('.kc').first().click(); await S[0].waitForSelector('.kb'); await S[0].waitForTimeout(1500);
  await shot(S[0], '15-card-detail');
  const book = await S[0].evaluate(() => Object.keys(KQC.all()));
  const reportHref = await T.getAttribute('#reportBtn', 'href');
  await T.goto(BASE + reportHref, { waitUntil: 'networkidle' });
  await T.waitForSelector('.qrow');
  await shot(T, '13-report');
  const rep = await T.evaluate(() => ({ players: G.report.players.length, q: G.report.questions.length, order: G.report.questions.at(-1) }));
  if (await T.isVisible('#reviewBtn')) { await T.click('#reviewBtn'); await T.waitForURL(/edit\?id=\d+/); rep.review = await T.locator('.qc').count(); }
  console.log(JSON.stringify({ pin, rep, endCards, book, errs }, null, 1));
  await b.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
