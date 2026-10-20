// 插件单元测试（在 Node 里模拟浏览器的 window / VA）
const assert = require('assert');
const fs = require('fs');
global.window = global; global.VA = { tt: (zh) => zh, esc: s => s, toast() {} };
global.document = { querySelector: () => null, createElement: () => ({}), head: { appendChild() {} } };
for (const f of ['math', 'import', 'chinese']) eval(fs.readFileSync(`public/js/plugins/${f}.js`, 'utf8'));
const Q = require('../lib/questions');
const [chinese, math, imp] = ['chinese', 'math', 'import'].map(id => VAPlugins.find(p => p.id === id));

// 数学：每种运算 300 次，答案用服务端判分器验证
const evalExpr = p => Function(`return (${p.replace('= ?', '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')})`)();
for (const op of ['add', 'sub', 'mul', 'div', 'mix', 'frac', 'cmp', 'tt']) for (const max of [10, 20, 100, 1000]) for (let i = 0; i < 300; i++) {
  const g = math._make(op, max);
  for (const fmt of ['input', 'mcq']) {
    const q = Q.clean(math._toQuestion(g, fmt));
    assert.ok(q, `${op} 题目格式合法`);
    if (op === 'frac' || ['add', 'sub', 'mul', 'div', 'mix'].includes(op)) {
      const val = evalExpr(g.prompt);
      if (fmt === 'input') assert.ok(Q.check(q, String(+val.toFixed(10))), `${g.prompt} 的数值答案能判对：${val}`);
      else { assert.ok(Math.abs(evalExpr(q.options[q.answer[0]] + '') - val) < 1e-9, `${g.prompt} 选择题正确项 ${q.options[q.answer[0]]}`); assert.equal(new Set(q.options).size, q.options.length, '选项不重复'); }
      if (['add', 'sub'].includes(op)) assert.ok(val >= 0 && val <= max, `${op} 不出负数、不超范围`);
      if (op === 'div') assert.ok(Number.isInteger(val), '除法整除');
      if (op === 'frac') assert.ok(val > 0, '分数结果为正');
    }
    if (op === 'tt') assert.equal(q.answer, evalExpr(g.prompt.split('=')[0]) === +g.prompt.split('=')[1]);
  }
}
// 导入：Kahoot 模板（前面几行说明 + 表头）
const kahoot = [['Quiz template'], [], ['Question - max 120 characters', 'Answer 1 - max 75 characters', 'Answer 2 - max 75 characters', 'Answer 3 - max 75 characters', 'Answer 4 - max 75 characters', 'Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs', 'Correct answer(s) - choose at least one'],
  ['Capital of France?', 'Berlin', 'Paris', 'Rome', '', '30', '2'], ['Pick primes', '2', '3', '4', '9', '20', '1,2'], ['No answer row', 'a', 'b', '', '', '20', '']];
let r = imp._toQuestions(kahoot);
assert.equal(r.length, 2); assert.deepEqual(r[0].options, ['Berlin', 'Paris', 'Rome']); assert.deepEqual(r[0].answer, [1]); assert.equal(r[0].time, 30); assert.deepEqual(r[1].answer, [0, 1]);
// Blooket CSV
const blooket = [['Blooket\nImport Template'], ['Question #', 'Question Text', 'Answer 1', 'Answer 2', 'Answer 3\n(Optional)', 'Answer 4\n(Optional)', 'Time Limit (sec)\n(Max: 300 seconds)', 'Correct Answer(s)\n(Only include Answer #)'],
  ['1', '2 + 2 = ?', '3', '4', '', '', '20', '2'], ['2', 'The sun is a star', 'True', 'False', '', '', '10', '1']];
r = imp._toQuestions(blooket);
assert.equal(r.length, 2); assert.equal(r[0].prompt, '2 + 2 = ?'); assert.deepEqual(r[0].answer, [1]); assert.equal(r[1].type, 'tf'); assert.equal(r[1].answer, true);
// 我们的模板 + 粘贴（无表头）
r = imp._toQuestions([['水在几度结冰？', '', '', '', '', '0', '20'], ['3×3', '6', '9', '', '', '9', '']]);
assert.equal(r[0].type, 'input'); assert.deepEqual(r[0].answer, ['0']); assert.deepEqual(r[1].answer, [1], '正确答案写选项文字也认');
r.forEach(q => assert.ok(Q.clean(q)));
console.log('✅ 插件测试通过：数学 8 种运算 × 4 种范围 × 2 种格式各 300 次；Kahoot、Blooket、模板、粘贴导入');

// 华文：用真的拼音库和汉字数据
global.pinyinPro = require('pinyin-pro');
eval(fs.readFileSync('public/data/hanzi-data.js', 'utf8'));
// 拼音库和汉字数据已经在上面装好，让插件里的动态加载直接返回
document.querySelector = sel => sel.startsWith('script') ? {} : null;
{
  // 用一个假 DOM 跑面板的生成按钮
  const els = {}, mk = id => els[id] || (els[id] = { value: '', textContent: '', disabled: false, onclick: null, querySelectorAll: () => [] });
  const root = { set innerHTML(v) {}, querySelector: s => mk(s), querySelectorAll: s => s === '.checks input:checked' ? ['listen', 'py2w', 'w2py', 'tone', 'parts'].map(v => ({ value: v })) : [] };
  const added = [];
  chinese.panel(root, qs => added.push(...qs));
  mk('#zhWords').value = '熊猫，学校，老师，朋友，好，明，林，长大，银行';
  mk('#zhMax').value = '30';
  (async () => {
    await mk('#zhGo').onclick();
    assert.ok(added.length >= 20, '出题数量 ' + added.length);
    for (const q of added) {
      const c = Q.clean(q); assert.ok(c, '格式合法 ' + JSON.stringify(q));
      assert.equal(new Set(c.options).size, c.options.length, '选项不重复');
      if (q.prompt.startsWith('「熊猫」怎么读')) {
        assert.equal(q.options[q.answer[0]], 'xióng māo');
        assert.ok(q.options.some(o => /^xi.ng m.o$/.test(o) && o !== 'xióng māo'), '有只改一个声调的干扰项：' + q.options.join(' / '));
      }
      if (/「长大」的「长」/.test(q.prompt)) assert.equal(q.answer[0], 2, '长大的长读第三声');
      if (/「银行」的「银」/.test(q.prompt)) assert.equal(q.answer[0], 1);
      if (q.prompt === '女 + 子 = ?') assert.equal(q.options[q.answer[0]], '好');
      if (q.prompt === '日 + 月 = ?') assert.equal(q.options[q.answer[0]], '明');
    }
    const kinds = ['听一听', '怎么读', '读第几声', ' + '].map(k => added.filter(q => q.prompt.includes(k)).length);
    assert.ok(kinds.every(n => n > 0), '每种题型都有：' + kinds);
    console.log(`✅ 华文插件通过：${added.length} 题，含听音/拼音/声调/部件，多音字按上下文（长大、银行）`);
  })().catch(e => { console.error('❌', e.message); process.exit(1); });
}
