// 数学插件：程序出题，不用题库，每次都不一样
(function () {
  const { tt, icon } = VA;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  const frac = (n, d) => { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? String(n) : `${n}/${d}`; };
  const OPS = [
    ['add', '+', '加法', 'Addition'], ['sub', '−', '减法', 'Subtraction'], ['mul', '×', '乘法', 'Multiplication'], ['div', '÷', '除法', 'Division'],
    ['mix', '±', '四则混合', 'Mixed operations'], ['frac', '½', '分数加减', 'Fractions + −'], ['cmp', '<>', '比较大小', 'Compare'], ['tt', '✓', '乘法口诀判断', 'Times-table true/false']
  ];
  const RANGES = [[10, '10 以内', 'within 10'], [20, '20 以内', 'within 20'], [100, '100 以内', 'within 100'], [1000, '1000 以内', 'within 1000']];

  // 每种题返回 { prompt, answer(数字或字符串) }
  function make(op, max) {
    const tbl = max <= 20 ? 5 : max <= 100 ? 10 : 12;
    switch (op) {
      case 'add': { const a = R(0, max), b = R(0, max - a); return { prompt: `${a} + ${b} = ?`, answer: a + b }; }
      case 'sub': { const a = R(1, max), b = R(0, a); return { prompt: `${a} − ${b} = ?`, answer: a - b }; }
      case 'mul': { const a = R(2, tbl), b = max >= 1000 ? R(11, 99) : R(2, tbl); return { prompt: `${a} × ${b} = ?`, answer: a * b }; }
      case 'div': { const b = R(2, tbl), q = R(1, Math.max(2, Math.min(tbl, Math.floor(max / b)))); return { prompt: `${b * q} ÷ ${b} = ?`, answer: q }; }
      case 'mix': {
        const a = R(1, Math.min(50, max)), b = R(2, 9), c = R(2, 9);
        return Math.random() < .5 ? { prompt: `${a} + ${b} × ${c} = ?`, answer: a + b * c, time: 30 } : { prompt: `(${a} + ${b}) × ${c} = ?`, answer: (a + b) * c, time: 30 };
      }
      case 'frac': {
        const d = R(3, 12), k = Math.random() < .5 ? 1 : R(2, 3), d2 = d * k;
        const a = R(1, d - 1), b = R(1, d2 - 1), plus = Math.random() < .6 || a / d <= b / d2;
        const n = plus ? a * k + b : a * k - b;
        return { prompt: `${a}/${d} ${plus ? '+' : '−'} ${b}/${d2} = ?`, answer: frac(n, d2), time: 40, note: tt('最简分数或小数都算对', 'Simplest form or decimal both accepted') };
      }
      case 'cmp': {
        const a = R(0, max), b = Math.random() < .2 ? a : R(0, max);
        return { prompt: `${a} ○ ${b}`, answer: a > b ? '>' : a < b ? '<' : '=', cmp: true };
      }
      case 'tt': {
        const a = R(2, 9), b = R(2, 9), right = Math.random() < .5, shown = right ? a * b : a * b + [-2, -1, 1, 2, a, -a][R(0, 5)];
        return { prompt: `${a} × ${b} = ${shown}`, answer: shown === a * b, tf: true };
      }
    }
  }
  // 选择题干扰项：差 1、差 10、数字对调
  function wrongs(ans) {
    if (typeof ans === 'string' && ans.includes('/')) { const [n, d] = ans.split('/').map(Number); return shuffle([`${n + 1}/${d}`, `${n}/${d + 1}`, `${Math.max(1, n - 1)}/${d}`, `${d}/${n}`]).filter(x => x !== ans); }
    const n = +ans, set = new Set([n + 1, n - 1, n + 10, n - 10, n + 2, +String(Math.abs(n)).split('').reverse().join('')].filter(x => x >= 0 && x !== n));
    return shuffle([...set]).map(String);
  }
  function toQuestion(g, format) {
    if (g.tf) return { type: 'tf', prompt: g.prompt, answer: g.answer, time: 10 };
    if (g.cmp) return { type: 'mcq', prompt: g.prompt.replace('○', '___'), options: ['>', '<', '='], answer: [['>', '<', '='].indexOf(g.answer)], time: 10 };
    const ans = String(g.answer);
    if (format === 'mcq') { const opts = shuffle([ans, ...wrongs(g.answer).slice(0, 3)]); return { type: 'mcq', prompt: g.prompt, options: opts, answer: [opts.indexOf(ans)], time: g.time || 20, ...(g.note ? { note: g.note } : {}) }; }
    return { type: 'input', prompt: g.prompt, answer: [ans], time: g.time || 20, ...(g.note ? { note: g.note } : {}) };
  }

  function panel(el, add) {
    el.innerHTML = `
      <div class="muted">${tt('程序自动出题，每次按都不一样，不用准备题库。', 'Questions are generated — different every time, no question bank needed.')}</div>
      <div class="checks">${OPS.map(([k, sym, zh, en], i) => `<label><input type="checkbox" value="${k}"${i < 2 ? ' checked' : ''}> <b class="opsym">${sym}</b> ${tt(zh, en)}</label>`).join('')}</div>
      <label class="field">${tt('数的范围', 'Number range')}<select class="in" id="mRange">${RANGES.map(([v, zh, en]) => `<option value="${v}"${v === 100 ? ' selected' : ''}>${tt(zh, en)}</option>`).join('')}</select></label>
      <label class="field">${tt('作答方式', 'Answer format')}<select class="in" id="mFmt"><option value="input">${tt('学生输入答案（更难）', 'Students type the answer (harder)')}</option><option value="mcq">${tt('四选一', 'Multiple choice')}</option></select></label>
      <label class="field">${tt('出几题', 'How many')}<select class="in" id="mN"><option>10</option><option selected>15</option><option>20</option><option>30</option></select></label>
      <button class="btn main" id="mGo">${icon('zap')} ${tt('生成题目', 'Generate')}</button>
      <div class="err" id="mErr"></div>`;
    el.querySelector('#mGo').onclick = () => {
      const ops = [...el.querySelectorAll('.checks input:checked')].map(c => c.value);
      if (!ops.length) { el.querySelector('#mErr').textContent = tt('至少选一种', 'Pick at least one'); return; }
      const max = +el.querySelector('#mRange').value, n = +el.querySelector('#mN').value, fmt = el.querySelector('#mFmt').value, seen = new Set(), out = [];
      for (let i = 0; out.length < n && i < n * 30; i++) {
        const g = make(ops[out.length % ops.length], max);
        if (seen.has(g.prompt)) continue;
        seen.add(g.prompt); out.push(toQuestion(g, fmt));
      }
      add(out);
    };
  }
  (window.VAPlugins = window.VAPlugins || []).push({ id: 'math', icon: 'calculator', name: ['数学', 'Math'], panel, _make: make, _toQuestion: toQuestion });
})();
