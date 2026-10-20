// 录首页「课堂上是这样的」三段动图：大屏 + 学生手机拼在一个画面里，逐帧截图合成动画 WebP → public/loops/*.webp
// 用法：先在 3048 端口开本地服务器（用测试数据库），再 node scripts/record-loops.js [classic|treasure|cards]
const { chromium } = require(process.env.PW_PATH || '/Users/haibinzhu/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright');
const sharp = require(process.env.SHARP_PATH || '/Users/haibinzhu/Desktop/工具开发/board-game-studio/node_modules/sharp');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3048';
const OUT = path.join(__dirname, '..', 'public', 'loops');
fs.mkdirSync(OUT, { recursive: true });
const W = 720, H = 450;
const BG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="a" cx="15%" cy="0%" r="70%"><stop offset="0" stop-color="#5b21b6"/><stop offset="1" stop-color="#0e0b26" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="100%" cy="100%" r="60%"><stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#0e0b26" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="#0e0b26"/><rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/></svg>`);
const round = (w, h, r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);

// 一帧：左边大屏（1280×800 缩到 480×300），右边手机（390×780 缩到 190×380）
async function frame(host, phone) {
  const [a, b] = await Promise.all([host.screenshot(), phone.screenshot()]);
  const big = await sharp(a).resize(480, 300).composite([{ input: round(480, 300, 14), blend: 'dest-in' }]).png().toBuffer();
  const ph = await sharp(b).resize(190, 380).composite([{ input: round(190, 380, 22), blend: 'dest-in' }]).png().toBuffer();
  return sharp(BG).composite([{ input: big, left: 22, top: 75 }, { input: ph, left: 518, top: 35 }]).png().toBuffer();
}
// 边录边做：fn 在后台跑动作，录 ms 毫秒
async function record(name, host, phone, ms, fn) {
  const frames = [], times = [];
  const done = fn();
  const end = Date.now() + ms;
  while (Date.now() < end) { const t = Date.now(); frames.push(await frame(host, phone)); times.push(t); }
  await done;
  const delay = times.map((t, i) => Math.max(60, Math.min(400, (times[i + 1] || t + 150) - t)));
  delay[delay.length - 1] = 1500; // 最后一帧停一下再循环
  await sharp(frames, { join: { animated: true } }).webp({ quality: 62, effort: 6, delay, loop: 0 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(`✓ ${name}.webp  ${frames.length} 帧  ${(fs.statSync(path.join(OUT, `${name}.webp`)).size / 1024).toFixed(0)} KB`);
}

async function setup(b, mode, setSlug) {
  const T = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await T.goto(BASE + '/');
  const setId = await T.evaluate(async slug => {
    await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `loop${Date.now()}@test.sg`, name: '演示老师', password: 'secret123' }) });
    return (await (await fetch(`/api/gallery/${slug}/copy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).id;
  }, setSlug);
  await T.goto(`${BASE}/host?set=${setId}&mode=${mode}&min=5&new=1`);
  await T.waitForSelector('#sLobby.on');
  const pin = (await T.textContent('#pin')).replace(/\s/g, '');
  const join = async (name, phone) => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })).newPage();
    await p.goto(`${BASE}/play?pin=${pin}`); await p.fill('#nameIn', name); await p.click('#joinBtn'); await p.waitForSelector('#vWait.on');
    return p;
  };
  const P = await join('小明');
  const others = [];
  for (const n of ['Ali', '小红', 'Mei', 'Ravi', '思敏']) others.push(await join(n));
  await T.waitForFunction(() => document.querySelectorAll('.pl').length === 6);
  return { T, P, others };
}

const solve = async p => p.evaluate(() => cur && cur.q);
// 演示里要答对：按题库里的原题找正确选项
const GAL = require('../lib/data/gallery.json');
async function rightIdx(p) { const q = await solve(p); for (const s of GAL) { const x = s.questions.find(y => y.prompt === q.prompt && y.type === 'mcq'); if (x) return q.options.indexOf(x.options[x.answer[0]]); } return 0; }
(async () => {
  const which = process.argv[2];
  const b = await chromium.launch({ channel: 'chrome' });
  if (!which || which === 'classic') {
    const { T, P, others } = await setup(b, 'classic', 'sci-forces');
    // 小明的屏幕录进画面，其余几个按不同速度作答，让分布条有高有低
    await T.click('#startBtn');
    await P.waitForSelector('#vQ.on', { timeout: 15000 });
    await record('classic', T, P, 7000, async () => {
      const ok = await rightIdx(P);
      await P.waitForTimeout(1300); await P.locator('.choice').nth(ok).click().catch(() => {});
      for (const [i, o] of others.entries()) { await o.waitForTimeout(250 + i * 180); await o.locator('.choice').nth(i % 3 === 2 ? (ok + 1) % 4 : ok).click().catch(() => {}); }
    });
  }
  if (!which || which === 'treasure') {
    const { T, P, others } = await setup(b, 'treasure', 'm-times');
    await T.click('#startBtn'); await T.waitForSelector('#sTreasure.on');
    // 其他人在后台一直答（让大屏的战况滚动起来）
    let stop = false;
    const bots = Promise.all(others.map(async (p, i) => { while (!stop) { const v = await p.evaluate(() => document.querySelector('.view.on')?.id).catch(() => ''); if (v === 'vQ') { if (await p.isVisible('#typeIn').catch(() => false)) { const q = await solve(p); const m = q && q.prompt.match(/(\d+)\s*[×x]\s*(\d+)/); await p.fill('#typeIn', m ? String(m[1] * m[2]) : '1').catch(() => {}); await p.click('.typebox button').catch(() => {}); } else await p.locator('.choice').first().click().catch(() => {}); } else if (v === 'vChest') await p.locator('#chests button').nth(i % 3).click().catch(() => {}); else if (v === 'vPick') await p.locator('#pickList button').first().click().catch(() => {}); else if (v === 'vOut') await p.click('#outGo').catch(() => {}); await p.waitForTimeout(500 + i * 120); } }));
    await T.waitForTimeout(3000);
    await P.waitForSelector('#vQ.on');
    await record('treasure', T, P, 8000, async () => {
      for (let k = 0; k < 2; k++) {
        await P.waitForSelector('#vQ.on'); await P.waitForTimeout(600);
        if (await P.isVisible('#typeIn')) { const q = await solve(P); const m = q && q.prompt.match(/(\d+)\s*[×x]\s*(\d+)/); await P.fill('#typeIn', m ? String(m[1] * m[2]) : '1'); await P.waitForTimeout(300); await P.click('.typebox button'); }
        else await P.locator('.choice').first().click();
        await P.waitForSelector('#vChest.on', { timeout: 4000 }).catch(() => {});
        if (await P.isVisible('#vChest')) { await P.waitForTimeout(700); await P.locator('#chests button').nth(1).click(); await P.waitForTimeout(400); }
        if (await P.isVisible('#vPick')) { await P.waitForTimeout(600); await P.locator('#pickList button').first().click(); }
        await P.waitForSelector('#vOut.on', { timeout: 4000 }).catch(() => {}); await P.waitForTimeout(1300); await P.click('#outGo').catch(() => {});
      }
    });
    stop = true; await bots;
  }
  if (!which || which === 'cards') {
    const { T, P, others } = await setup(b, 'classic', 'm-order');
    await T.click('#startBtn');
    for (let k = 0; k < 8; k++) {
      await P.waitForSelector('#vQ.on', { timeout: 15000 });
      const ok = await rightIdx(P);
      await Promise.all([P, ...others].map((p, i) => p.locator('.choice').nth(i === 3 ? (ok + 1) % 4 : ok).click().catch(() => {})));
      await T.waitForSelector('#sReveal.on'); await T.click('#toBoard'); await T.waitForSelector('#sBoard.on'); await T.click('#nextBtn');
    }
    await T.waitForSelector('#sEnd.on'); await P.waitForSelector('#vEnd.on');
    await record('cards', T, P, 4500, async () => {});
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
