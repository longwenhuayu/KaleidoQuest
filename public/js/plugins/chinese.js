// 华文插件：粘贴本课字词 → 听音选字、看拼音选字、看字选拼音、声调、部件拼字
(function () {
  const { tt, esc, toast } = VA;
  const PINYIN = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/dist/index.js';
  const PRESETS = [
    ['小一生字', '人，口，手，大，小，上，下，日，月，水，火，山，石，田，土，木，花，鸟'],
    ['学校', '学校，老师，同学，教室，课本，铅笔，橡皮，书包，黑板，图书馆，操场，作业'],
    ['动物', '熊猫，大象，狮子，老虎，猴子，兔子，企鹅，海豚，蝴蝶，青蛙，乌龟，小鸟'],
    ['好拆的字', '好，明，林，休，你，妈，吃，唱，想，字，安，男，打，和，问，河']
  ];
  const TYPES = [
    ['listen', '🔊 听音选字', '🔊 Listen & choose'],
    ['py2w', '🔤 看拼音选字', '🔤 Pinyin → word'],
    ['w2py', '📖 看字选拼音', '📖 Word → pinyin'],
    ['tone', '🎵 声调', '🎵 Tones'],
    ['parts', '🧩 部件拼字', '🧩 Build the character']
  ];
  const load = src => new Promise(ok => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = s.onerror = ok; document.head.appendChild(s); });
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isHan = c => /[㐀-鿿]/.test(c);
  const py = w => pinyinPro.pinyin(w);
  // 数字声调 → 带调号：xiong2 → xióng
  const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
  function mark(syl) {
    const m = syl.match(/^([a-zü]+)([1-4])$/); if (!m) return syl.replace(/[0-5]$/, '');
    const [, b, t] = m, base = b.replace('v', 'ü');
    const at = base.includes('a') ? base.indexOf('a') : base.includes('e') ? base.indexOf('e') : base.includes('ou') ? base.indexOf('o') : Math.max(...[...'iouü'].map(v => base.lastIndexOf(v)));
    return at < 0 ? base : base.slice(0, at) + MARKS[base[at]][t - 1] + base.slice(at + 1);
  }
  // 只改一个音节的声调，做成很像的干扰项
  function toneVariants(w) {
    const nums = pinyinPro.pinyin(w, { toneType: 'num', type: 'array' }), out = new Set();
    nums.forEach((s, i) => { const m = s.match(/^([a-zü]+)([1-4])$/); if (!m) return; for (let t = 1; t <= 4; t++) if (t !== +m[2]) out.add(nums.map((x, k) => mark(k === i ? m[1] + t : x)).join(' ')); });
    return shuffle([...out]);
  }
  // ordered：干扰项按给的顺序取前 3 个（最像的放前面），否则随机取
  function mcq(prompt, correct, wrong, extra = {}, ordered = false) {
    const pool = [...new Set(wrong)].filter(x => x && x !== correct);
    const opts = shuffle([correct, ...(ordered ? pool : shuffle(pool)).slice(0, 3)]);
    return opts.length < 2 ? null : { type: 'mcq', prompt, options: opts, answer: [opts.indexOf(correct)], time: 20, ...extra };
  }
  const near = (w, pool) => { const same = pool.filter(x => x !== w && [...x].length === [...w].length); return shuffle(same.length >= 3 ? same : pool.filter(x => x !== w)); };

  const GEN = {
    listen: (w, pool) => mcq(tt('🔊 听一听，选出你听到的字词', '🔊 Listen and choose the word you hear'), w, near(w, pool), { speak: w, lang: 'zh-CN' }),
    py2w: (w, pool) => mcq(py(w), w, near(w, pool), { note: `${w} ${py(w)}` }),
    w2py: (w, pool) => mcq(tt(`「${w}」怎么读？`, `How do you read 「${w}」?`), py(w), [...toneVariants(w).slice(0, 2), ...near(w, pool).map(py)], {}, true),
    tone: w => {
      const ch = [...w].find(isHan); if (!ch) return null;
      const t = +pinyinPro.pinyin(w, { pattern: 'num', type: 'array' })[[...w].indexOf(ch)] || 0;
      if (!t) return null;
      const opts = [tt('第一声 ā', '1st tone ā'), tt('第二声 á', '2nd tone á'), tt('第三声 ǎ', '3rd tone ǎ'), tt('第四声 à', '4th tone à')];
      return { type: 'mcq', prompt: [...w].length > 1 ? tt(`「${w}」的「${ch}」读第几声？`, `In 「${w}」, which tone is 「${ch}」?`) : tt(`「${ch}」读第几声？`, `Which tone is 「${ch}」?`), options: opts, answer: [t - 1], time: 15, speak: w, lang: 'zh-CN', note: `${w} ${py(w)}` };
    },
    parts: (w, pool, chars) => {
      const out = [];
      for (const ch of [...w].filter(isHan)) {
        const d = (window.HANZI_DATA || {})[ch];
        if (!d || !d[2] || d[2] === '⿻' || !d[3] || d[3].includes('？')) continue;
        const wrong = chars.filter(c => c !== ch);
        const q = mcq(`${[...d[3]].join(' + ')} = ?`, ch, wrong, { note: `${[...d[3]].join(' + ')} = ${ch}（${py(ch)}）`, time: 15 });
        if (q) out.push(q);
      }
      return out;
    }
  };

  function panel(el, add) {
    el.innerHTML = `
      <div class="muted">${tt('贴上本课字词，自动出题。拼音按上下文标注（多音字也对）。', 'Paste this lesson’s words. Pinyin follows context, so polyphones are handled.')}</div>
      <div class="ptabs" id="zhPre">${PRESETS.map((p, i) => `<button type="button" data-i="${i}">${p[0]}</button>`).join('')}</div>
      <textarea class="in" id="zhWords" placeholder="${tt('例如：熊猫，学校，老师…', 'e.g. 熊猫，学校，老师…')}"></textarea>
      <div class="checks">${TYPES.map(([k, zh, en], i) => `<label><input type="checkbox" value="${k}"${i < 4 ? ' checked' : ''}> ${tt(zh, en)}</label>`).join('')}</div>
      <label class="field">${tt('最多出几题', 'Max questions')}<select class="in" id="zhMax"><option>10</option><option selected>15</option><option>20</option><option>30</option></select></label>
      <button class="btn main" id="zhGo">⚡ ${tt('生成题目', 'Generate')}</button>
      <div class="err" id="zhErr"></div>`;
    el.querySelector('#zhPre').onclick = e => { const b = e.target.closest('[data-i]'); if (b) el.querySelector('#zhWords').value = PRESETS[b.dataset.i][1]; };
    el.querySelector('#zhGo').onclick = async () => {
      const err = el.querySelector('#zhErr'); err.textContent = '';
      const words = [...new Set(el.querySelector('#zhWords').value.split(/[\s,，、;；\n]+/).map(s => s.trim()).filter(s => [...s].some(isHan)))];
      const types = [...el.querySelectorAll('.checks input:checked')].map(c => c.value);
      if (words.length < 4) { err.textContent = tt('至少 4 个字词（选择题要有干扰项）', 'At least 4 words are needed for answer choices'); return; }
      if (!types.length) { err.textContent = tt('至少选一种题型', 'Pick at least one question type'); return; }
      el.querySelector('#zhGo').disabled = true; el.querySelector('#zhGo').textContent = tt('准备拼音…', 'Loading pinyin…');
      await load(PINYIN);
      if (types.includes('parts')) await load('/data/hanzi-data.js');
      el.querySelector('#zhGo').disabled = false; el.querySelector('#zhGo').textContent = '⚡ ' + tt('生成题目', 'Generate');
      if (!window.pinyinPro) { err.textContent = tt('拼音库加载失败，请检查网络', 'Could not load pinyin library'); return; }
      const chars = [...new Set(words.join('').split('').filter(isHan))];
      // 每种题型轮流出，直到达到上限
      const max = +el.querySelector('#zhMax').value, buckets = types.map(k => shuffle(words).flatMap(w => { const r = GEN[k](w, words, chars); return Array.isArray(r) ? r : r ? [r] : []; }));
      const out = [];
      for (let i = 0; out.length < max && buckets.some(b => b.length); i++) { const b = buckets[i % buckets.length]; if (b.length) out.push(b.shift()); }
      if (!out.length) { err.textContent = tt('这些字词出不了所选的题型，换一种试试', 'No questions could be made with these settings'); return; }
      add(out);
    };
  }
  (window.VAPlugins = window.VAPlugins || []).push({ id: 'chinese', icon: '🀄', name: ['华文', 'Chinese'], panel });
})();
