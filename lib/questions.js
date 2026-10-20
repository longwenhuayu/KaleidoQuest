// 通用题目格式（所有学科共用）：
// { type: 'mcq' | 'tf' | 'input' | 'order', prompt, speak?, lang?, image?, options?, answer, time, note? }
//   mcq   options: 2–6 个选项，answer: 正确选项的下标数组（有多个时选中任一个都算对）
//   tf    answer: true / false
//   input answer: 可接受的答案数组（不分大小写、全半角；数字按数值比，3/4 = 0.75）
//   order options: 按正确顺序排列的 2–6 项（出题时会打乱）
const TYPES = new Set(['mcq', 'tf', 'input', 'order']);
const LANGS = new Set(['zh-CN', 'en-US', 'en-GB', 'ms-MY', 'ta-IN']);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function clean(raw) {
  if (!raw || typeof raw !== 'object' || !TYPES.has(raw.type)) return null;
  const q = { type: raw.type, prompt: str(raw.prompt, 300), time: Math.min(120, Math.max(5, Math.round(+raw.time || 20))) };
  if (raw.speak) { q.speak = str(raw.speak, 120); q.lang = LANGS.has(raw.lang) ? raw.lang : 'zh-CN'; }
  if (raw.image && /^https:\/\/[^\s"'<>]+$/.test(raw.image)) q.image = str(raw.image, 500);
  if (raw.note) q.note = str(raw.note, 300);
  if (!q.prompt && !q.speak) return null;
  if (q.type === 'mcq' || q.type === 'order') {
    q.options = (Array.isArray(raw.options) ? raw.options : []).map(o => str(o, 120)).filter(Boolean).slice(0, 6);
    if (q.options.length < 2) return null;
  }
  if (q.type === 'mcq') {
    q.answer = [...new Set((Array.isArray(raw.answer) ? raw.answer : [raw.answer]).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < q.options.length))];
    if (!q.answer.length) return null;
  } else if (q.type === 'tf') {
    q.answer = raw.answer === true || raw.answer === 'true';
  } else if (q.type === 'input') {
    q.answer = (Array.isArray(raw.answer) ? raw.answer : [raw.answer]).map(a => str(a, 80)).filter(Boolean).slice(0, 10);
    if (!q.answer.length) return null;
  }
  return q;
}
const cleanAll = list => (Array.isArray(list) ? list : []).slice(0, 200).map(clean).filter(Boolean);

// 判分用的规范化：全角转半角、去空格和标点、小写
function norm(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/[\s.,!?;:'"，。！？；：、“”‘’（）()]/g, '');
}
function num(s) {
  // 数字不能走 norm（会去掉小数点），只去空格
  const t = String(s).normalize('NFKC').replace(/\s/g, '');
  const m = t.match(/^(-?\d+)\/(\d+)$/);
  if (m && +m[2]) return +m[1] / +m[2];
  if (/^-?\d+(\.\d+)?$/.test(t)) return +t;
  return null;
}
function check(q, ans) {
  switch (q.type) {
    case 'mcq': return Number.isInteger(ans) && q.answer.includes(ans);
    case 'tf': return typeof ans === 'boolean' && ans === q.answer;
    case 'input': {
      if (typeof ans !== 'string' || !ans.trim()) return false;
      const a = norm(ans), n = num(ans);
      return q.answer.some(x => norm(x) === a || (n != null && num(x) != null && Math.abs(num(x) - n) < 1e-9));
    }
    case 'order': return Array.isArray(ans) && ans.length === q.options.length && ans.every((v, i) => v === i);
  }
  return false;
}
// 发给学生端的题目：去掉答案；排序题打乱（带原下标）
function forPlayer(q) {
  const out = { type: q.type, prompt: q.prompt, time: q.time };
  if (q.image) out.image = q.image;
  if (q.type === 'mcq') out.options = q.options;
  if (q.type === 'order') {
    let idx = q.options.map((_, i) => i);
    do { idx = idx.sort(() => Math.random() - .5); } while (idx.every((v, i) => v === i) && idx.length > 1);
    out.items = idx.map(i => ({ i, text: q.options[i] }));
  }
  return out;
}
function answerText(q) {
  if (q.type === 'mcq') return q.answer.map(i => q.options[i]).join(' / ');
  if (q.type === 'tf') return q.answer ? '✔' : '✘';
  if (q.type === 'input') return q.answer[0];
  return q.options.join(' → ');
}
module.exports = { clean, cleanAll, check, forPlayer, answerText };
