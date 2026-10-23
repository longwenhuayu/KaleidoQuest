// 浏览器端到端：老师建班 → 学生 /me 登录 → 试玩得卡 → 卡册显示已登录 → 老师看到进度；编辑器 AI 出题面板
const { chromium } = require('/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3048';
const shot = (p, n) => p.screenshot({ path: `test/shots/${n}.png` });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|fonts|401/.test(m.text())) errs.push(who + ' console: ' + m.text()); }); };
  const T = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(T, 'teacher');
  await T.goto(BASE + '/');
  await T.evaluate(() => fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cls${Date.now()}@test.sg`, name: '林老师', password: 'secret123' }) }));
  await T.goto(BASE + '/teacher#classes'); await T.waitForSelector('#clsNew');
  const galBtn = await T.isVisible('#galBtn') || (await T.click('[data-v=sets]'), await T.isVisible('#galBtn'));
  await T.click('[data-v=classes]');
  await T.click('#clsNew'); await T.fill('#cName', '小三忠班'); await T.fill('#cNames', '小明\n小红\nAli');
  await T.click('#cGo'); await T.waitForSelector('.ctab'); await T.waitForTimeout(600);
  await shot(T, '70-class-detail');
  const code = await T.evaluate(() => document.querySelector('.card b[style*="letter-spacing:3px"]').textContent);
  const pin = await T.evaluate(() => [...document.querySelectorAll('.ctab tr')].find(r => r.textContent.includes('小明')).querySelector('.pin').textContent);
  // 学生登录
  const S = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage(); watch(S, 'student');
  await S.goto(`${BASE}/me?c=${code}`); await S.waitForSelector('#names button');
  await S.click('#names button:has-text("小明")'); await shot(S, '71-me-pick');
  await S.fill('#pin', pin === '0000' ? '1111' : '0000'); await S.click('#f2 button'); await S.waitForTimeout(400);
  const wrongMsg = await S.textContent('#e2');
  await S.fill('#pin', pin); await S.click('#f2 button'); await S.waitForSelector('.hello'); await shot(S, '72-me-in');
  // 试玩得卡
  await S.goto(BASE + '/try/m-20'); await S.waitForSelector('#vIntro.on');
  const nameFilled = await S.inputValue('#name'), note = await S.textContent('#stuNote');
  await S.click('#startBtn');
  for (;;) {
    await S.waitForSelector('#vQ.on, #vDone.on'); if (await S.isVisible('#vDone')) break;
    await S.fill('#typeIn', '1'); await S.click('.typebox button');
    await S.waitForSelector('#fb .fb'); await S.click('#nextBtn', { timeout: 800 }).catch(() => {}); await S.waitForSelector('#fb .fb', { state: 'detached' });
  }
  // 换一台「设备」：清空本机卡册，登录后卡还在
  await S.evaluate(() => localStorage.clear());
  await S.goto(BASE + '/cards'); await S.waitForTimeout(800); await S.click('[data-k=math]'); await S.waitForTimeout(500);
  const serverCards = await S.locator('#grid .kc').count(), cardNote = await S.textContent('#note');
  await shot(S, '73-cards-signed-in');
  await S.goto(BASE + '/play'); await S.waitForTimeout(600);
  const playName = await S.inputValue('#nameIn');
  // 学生看自己的成绩
  await S.goto(BASE + '/me'); await S.waitForSelector('#res'); await S.click('#res'); await S.waitForSelector('.box .ctab');
  const myRes = await S.textContent('.box'); await shot(S, '76-me-results');
  // 老师看进度
  await T.reload(); await T.click('[data-v=classes]'); await T.click('[data-cls]'); await T.waitForSelector('.ctab');
  const row = await T.evaluate(() => [...document.querySelectorAll('.ctab tr')].find(r => r.textContent.includes('小明')).textContent);
  await shot(T, '74-class-progress');
  // 老师点名字看学习记录
  await T.click('.ctab tr:has-text("小明") [data-hist]'); await T.waitForSelector('.mp-box .ctab');
  const tRes = await T.textContent('.mp-box'); await T.waitForTimeout(400); await shot(T, '77-class-record'); await T.click('.mp-box .mp-x');
  // 编辑器 AI 面板
  await T.goto(BASE + '/edit'); await T.waitForSelector('#ptabs'); await T.selectOption('#subject', 'science'); await T.click('[data-p=ai]');
  const aiLang = await T.inputValue('#aiLang');
  let aiN = -1;
  if (process.env.AI) {
    await T.fill('#aiTopic', 'Magnets'); await T.click('#aiGo');
    await T.waitForFunction(() => document.querySelectorAll('.qc').length > 0, null, { timeout: 90000 }); aiN = await T.locator('.qc').count();
  }
  await shot(T, '75-editor-ai');
  await b.close();
  const ok = galBtn && /不对|Wrong/.test(wrongMsg) && nameFilled === '小明' && /小明/.test(note) && serverCards >= 1 && /已登录|Signed in/.test(cardNote) && playName === '小明' && /小明\s*\d{4}\s*1\s*\d+%.+?0\s*[12]/.test(row) && /试玩|Practice/.test(myRes) && /常错|Often missed/.test(myRes) && /学习记录|Learning record/.test(tRes) && /试玩|Practice/.test(tRes) && aiLang === 'en' && (!process.env.AI || aiN > 0) && !errs.length;
  console.log({ galBtn, wrongMsg, nameFilled, note, serverCards, cardNote: cardNote.slice(0, 40), playName, row, myRes: myRes.slice(0, 80), tRes: tRes.slice(0, 80), aiLang, aiN, errs });
  console.log(ok ? '✅ 班级浏览器测试通过' : '❌ 失败'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
