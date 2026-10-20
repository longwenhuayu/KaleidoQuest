// 浏览器端到端：布置作业 → 两个学生用手机做（一个中途刷新）→ 老师看成绩
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const T = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  T.on('pageerror', e => errs.push('teacher: ' + e.message));
  await T.goto(BASE + '/');
  await T.evaluate(async () => {
    await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `hw${Date.now()}@test.sg`, name: '陈老师', password: 'secret123' }) });
    const qs = [{ type: 'mcq', prompt: '「熊猫」怎么读？', options: ['xióng māo', 'xiōng māo', 'xióng mǎo'], answer: [0], time: 20, note: '熊 xióng 第二声' }, { type: 'input', prompt: '6 × 7 = ?', answer: ['42'], time: 20 }, { type: 'tf', prompt: '水在 0 度结冰', answer: true, time: 10 }, { type: 'order', prompt: '排成句子', options: ['我', '喜欢', '中文'], time: 20 }];
    await fetch('/api/sets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '第五课作业', subject: 'chinese', questions: qs }) });
  });
  await T.goto(BASE + '/teacher');
  await T.click('[data-act=hw]');
  await shot(T, '40-assign');
  await T.click('#hwGo');
  await T.waitForSelector('.share input'); await T.waitForTimeout(400);
  await shot(T, '41-share');
  const link = await T.inputValue('.share input');
  const code = link.split('/').pop();
  // 学生
  async function student(name, good, refreshAfter) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.goto(link);
    await p.waitForSelector('#vIntro.on');
    if (name === '小明') await shot(p, '42-hw-intro');
    await p.fill('#name', name); await p.click('#startBtn');
    for (let k = 0; k < 4; k++) {
      if (k === refreshAfter) { await p.reload(); }
      await p.waitForSelector('#vQ.on');
      const prompt = await p.textContent('#qText');
      if (name === '小明' && k === 0) await shot(p, '43-hw-question');
      if (prompt.includes('熊猫')) await p.locator('.choice').nth(good ? 0 : 1).click();
      else if (prompt.includes('×')) { await p.fill('#typeIn', good ? '42' : '40'); await p.click('.typebox button'); }
      else if (prompt.includes('结冰')) await p.locator('.choice').nth(good ? 0 : 1).click();
      else { for (const w of good ? ['我', '喜欢', '中文'] : ['中文', '我', '喜欢']) await p.click(`.ord-pick button:has-text("${w}")`); await p.click('#ordGo'); }
      await p.waitForSelector('.fb');
      if (!good && k === 0) await shot(p, '44-hw-feedback');
      await p.click('#nextBtn').catch(() => {});
    }
    await p.waitForSelector('#vDone.on');
    if (good) await shot(p, '45-hw-done');
    return { score: await p.textContent('#dScore'), stats: await p.textContent('#dStats'), retry: await p.isVisible('#retryBtn') };
  }
  const a = await student('小明', true, 2), c = await student('Ali', false, -1);
  await T.goto(BASE + '/teacher#hw'); await T.reload(); await T.waitForSelector('.hw');
  await shot(T, '46-hw-list');
  await T.click('.hw a.btn.go'); await T.waitForSelector('.qrow');
  await shot(T, '47-hw-report');
  const rep = await T.evaluate(() => ({ mode: G.mode, players: G.report.players.map(p => `${p.name}:${p.score} ${p.correct}/4 x${p.tries}`), q: G.report.questions.map(q => `${q.correct}/${q.answered}`) }));
  console.log(JSON.stringify({ code, a, c, rep, errs }, null, 1));
  await b.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
