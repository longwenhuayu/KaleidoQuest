// 导入：Kahoot / Blooket 的 Excel、CSV，或从表格直接复制粘贴
(function () {
  const { tt } = VA;
  const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const load = src => new Promise(ok => { if (window.XLSX) return ok(); const s = document.createElement('script'); s.src = src; s.onload = s.onerror = ok; document.head.appendChild(s); });
  const cell = v => String(v == null ? '' : v).trim();

  // 找表头那一行：同时有「题目」和「选项 1 / Answer 1」
  function columns(rows) {
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const r = rows[h].map(c => cell(c).toLowerCase());
      const q = r.findIndex(c => /question\s*text|^question\b(?!\s*#)|^题目|^问题/.test(c));
      const opts = []; r.forEach((c, i) => { const m = c.match(/answer\s*(\d)|选项\s*(\d)/); if (m) opts[+(m[1] || m[2]) - 1] = i; });
      if (q >= 0 && opts.filter(x => x != null).length >= 1) return { h, q, opts: opts.filter(x => x != null), time: r.findIndex(c => /time|时间/.test(c)), correct: r.findIndex(c => /correct|正确|答案$/.test(c)) };
    }
    // 没有表头：按「题目, 选项1–4, 正确答案, 时间」的顺序
    return { h: -1, q: 0, opts: [1, 2, 3, 4], correct: 5, time: 6 };
  }
  function toQuestions(rows) {
    const c = columns(rows), out = [];
    for (const row of rows.slice(c.h + 1)) {
      const prompt = cell(row[c.q]); if (!prompt) continue;
      const opts = c.opts.map(i => cell(row[i]));
      const filled = opts.map((o, i) => [o, i]).filter(([o]) => o);
      const raw = c.correct >= 0 ? cell(row[c.correct]) : '';
      const time = c.time >= 0 && +cell(row[c.time]) ? Math.min(120, Math.max(5, +cell(row[c.time]))) : 20;
      if (filled.length >= 2) {
        // 正确答案可以是 1,3 这样的序号，也可以直接写选项文字
        let idx = raw.split(/[,，、\s]+/).map(Number).filter(n => n >= 1 && n <= opts.length).map(n => n - 1);
        if (!idx.length && raw) idx = opts.map((o, i) => o === raw ? i : -1).filter(i => i >= 0);
        const answer = filled.map(([, i], k) => idx.includes(i) ? k : -1).filter(k => k >= 0);
        const options = filled.map(([o]) => o);
        const tf = options.length === 2 && /^(true|对|正确|✔)$/i.test(options[0]) && /^(false|错|错误|✘)$/i.test(options[1]);
        if (tf && answer.length) out.push({ type: 'tf', prompt, answer: answer[0] === 0, time });
        else if (answer.length) out.push({ type: 'mcq', prompt, options, answer, time });
      } else if (raw || filled.length === 1) {
        out.push({ type: 'input', prompt, answer: (raw || filled[0][0]).split('|').map(s => s.trim()).filter(Boolean), time });
      }
    }
    return out;
  }
  function template() {
    const rows = [['题目 Question', '选项1 Answer 1', '选项2 Answer 2', '选项3 Answer 3', '选项4 Answer 4', '正确答案 Correct (1-4)', '时间 Time (sec)'],
      ['「熊猫」怎么读？', 'xióng māo', 'xiōng māo', 'xióng mǎo', 'xiòng māo', '1', '20'],
      ['7 × 8 = ?', '54', '56', '64', '48', '2', '20'],
      ['水在几度结冰？（填空题：只写正确答案）', '', '', '', '', '0', '20']];
    const csv = '﻿' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'kaleidoquest-template.csv'; a.click();
  }

  function panel(el, add) {
    el.innerHTML = `
      <div class="muted">${tt('支持 Kahoot、Blooket 导出的 Excel / CSV，或我们的模板。也可以从 Excel / Google 表格选中几行，直接粘贴。', 'Import Kahoot or Blooket spreadsheets (Excel/CSV), our template, or paste rows copied from Excel / Google Sheets.')}</div>
      <input type="file" id="imFile" accept=".xlsx,.xls,.csv" class="in">
      <textarea class="in" id="imPaste" placeholder="${tt('或在这里粘贴表格内容（题目、选项1–4、正确答案序号、时间）', 'Or paste rows here (question, answers 1–4, correct #, time)')}"></textarea>
      <button class="btn main" id="imGo">📥 ${tt('导入', 'Import')}</button>
      <button class="btn ghost sm" id="imTpl">⬇️ ${tt('下载模板', 'Download template')}</button>
      <div class="err" id="imErr"></div>`;
    const err = el.querySelector('#imErr');
    const done = (qs, n) => { if (!qs.length) { err.textContent = tt('没有读到题目，请检查格式或下载模板对照', 'No questions found — check the format or use the template'); return; } add(qs, tt(`导入了 ${qs.length} 题` + (n > qs.length ? `（${n - qs.length} 行缺少正确答案，已跳过）` : ''), `Imported ${qs.length} questions` + (n > qs.length ? ` (${n - qs.length} rows skipped: no correct answer)` : ''))); };
    el.querySelector('#imTpl').onclick = template;
    el.querySelector('#imGo').onclick = async () => {
      err.textContent = '';
      const f = el.querySelector('#imFile').files[0], paste = el.querySelector('#imPaste').value.trim();
      if (f) {
        await load(XLSX_SRC);
        if (!window.XLSX) { err.textContent = tt('读取 Excel 的组件加载失败，请检查网络', 'Could not load the spreadsheet reader'); return; }
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
        const qs = toQuestions(rows), c = columns(rows);
        return done(qs, rows.slice(c.h + 1).filter(r => cell(r[c.q])).length);
      }
      if (paste) {
        const rows = paste.split(/\r?\n/).map(l => l.split('\t'));
        const qs = toQuestions(rows), c = columns(rows);
        return done(qs, rows.slice(c.h + 1).filter(r => cell(r[c.q])).length);
      }
      err.textContent = tt('请选择文件或粘贴内容', 'Choose a file or paste some rows');
    };
  }
  (window.VAPlugins = window.VAPlugins || []).push({ id: 'import', icon: '📥', name: ['导入', 'Import'], panel, _toQuestions: toQuestions });
})();
