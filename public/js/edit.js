// 题包编辑器：通用题型 + 学科插件出题
const { t, tt, api, $, esc, toast, SHAPES } = VA;
const params = new URLSearchParams(location.search);
let setId = params.get('id') ? +params.get('id') : null;
let qs = [], dirty = false;
const SUBJECTS = ['chinese', 'math', 'english', 'science', 'general', 'malay', 'tamil'];
const TYPES = () => ({ mcq: tt('选择题', 'Multiple choice'), tf: tt('判断题', 'True / False'), input: tt('填空题', 'Type answer'), order: tt('排序题', 'Ordering') });
const TIMES = [5, 10, 20, 30, 45, 60, 90, 120];
const LANGS = [['zh-CN', '中文'], ['en-US', 'English'], ['ms-MY', 'Melayu'], ['ta-IN', 'தமிழ்']];
const blank = type => ({ type, prompt: '', time: 20, ...(type === 'mcq' ? { options: ['', '', '', ''], answer: [0] } : type === 'tf' ? { answer: true } : type === 'input' ? { answer: [''] } : { options: ['', '', ''] }) });

// 和服务端 lib/questions.js 一样的规则，先在这里提示
function problem(q) {
  if (!q.prompt.trim() && !(q.speak || '').trim()) return tt('请写题目（或朗读内容）', 'Add a question (or audio text)');
  if (q.type === 'mcq' || q.type === 'order') { if (q.options.filter(o => o.trim()).length < 2) return tt('至少 2 个选项', 'At least 2 options'); }
  if (q.type === 'mcq' && !q.answer.some(i => (q.options[i] || '').trim())) return tt('请勾选正确答案', 'Mark the correct answer');
  if (q.type === 'input' && !q.answer.some(a => a.trim())) return tt('请写正确答案', 'Add the accepted answer');
  return '';
}
// 存之前去掉空选项，并把正确答案的下标对齐
function tidy(q) {
  const out = { ...q };
  if (q.type === 'mcq') {
    const keep = q.options.map((o, i) => [o.trim(), i]).filter(([o]) => o);
    out.options = keep.map(([o]) => o);
    out.answer = keep.map(([, i], k) => q.answer.includes(i) ? k : -1).filter(k => k >= 0);
  }
  if (q.type === 'order') out.options = q.options.map(o => o.trim()).filter(Boolean);
  if (q.type === 'input') out.answer = q.answer.map(a => a.trim()).filter(Boolean);
  if (!out.speak) { delete out.speak; delete out.lang; }
  return out;
}

function qCard(q, i) {
  const err = q._touched ? problem(q) : '';
  let body = '';
  if (q.type === 'mcq') {
    body = `<div class="opts">${q.options.map((o, k) => `<div class="opt opt${k}"><span class="shape">${SHAPES[k]}</span><input type="text" data-f="opt" data-k="${k}" value="${esc(o)}" maxlength="120" placeholder="${tt('选项', 'Option')} ${k + 1}"><label><input type="checkbox" data-f="ans" data-k="${k}"${q.answer.includes(k) ? ' checked' : ''}>${tt('正确', 'Correct')}</label>${q.options.length > 2 ? `<button class="x" data-f="delopt" data-k="${k}" title="−">×</button>` : ''}</div>`).join('')}</div>
      ${q.options.length < 6 ? `<button class="btn ghost sm" data-f="addopt" style="margin-top:8px">＋ ${tt('加选项', 'Add option')}</button>` : ''}`;
  } else if (q.type === 'tf') {
    body = `<div class="tfrow"><button class="t${q.answer ? ' on' : ''}" data-f="tf" data-v="1">✔ ${tt('对', 'True')}</button><button class="f${!q.answer ? ' on' : ''}" data-f="tf" data-v="0">✘ ${tt('错', 'False')}</button></div>`;
  } else if (q.type === 'input') {
    body = `<label class="field" style="margin-top:10px">${tt('正确答案（可以写几个，用 | 分开；数字 0.75 和 3/4 自动算相同）', 'Accepted answers (separate with | ; 0.75 = 3/4 automatically)')}<input class="in" data-f="input" value="${esc(q.answer.join(' | '))}" maxlength="400"></label>`;
  } else {
    body = `<label class="field" style="margin-top:10px">${tt('按正确顺序，每行一项（学生看到的是打乱的）', 'Items in the correct order, one per line (shuffled for students)')}<textarea data-f="order">${esc(q.options.join('\n'))}</textarea></label>`;
  }
  return `<div class="card qc${err ? ' bad' : ''}" data-i="${i}">
    <div class="qh"><b>${i + 1}.</b><select data-f="type">${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}"${q.type === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <select data-f="time">${TIMES.map(s => `<option value="${s}"${q.time === s ? ' selected' : ''}>⏱ ${s}s</option>`).join('')}</select>
      <span class="sp"></span><button class="ib" data-f="up" title="↑">↑</button><button class="ib" data-f="down" title="↓">↓</button><button class="ib" data-f="dup" title="⧉">⧉</button><button class="ib" data-f="del" title="🗑">🗑</button></div>
    <textarea data-f="prompt" maxlength="300" placeholder="${tt('题目', 'Question')}">${esc(q.prompt)}</textarea>
    ${body}
    <details class="more"${q.speak || q.image || q.note ? ' open' : ''}><summary>${tt('更多：朗读、图片、讲解', 'More: audio, image, explanation')}</summary>
      <div class="row"><label class="field" style="flex:2">🔊 ${tt('大屏朗读的内容（听力题）', 'Read aloud on the big screen (listening)')}<input class="in" data-f="speak" value="${esc(q.speak || '')}" maxlength="120"></label>
      <label class="field" style="flex:1">${tt('语言', 'Language')}<select class="in" data-f="lang">${LANGS.map(([v, n]) => `<option value="${v}"${(q.lang || 'zh-CN') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field" style="flex:1">🖼 ${tt('图片网址（https://…）', 'Image URL (https://…)')}<input class="in" data-f="image" value="${esc(q.image || '')}" maxlength="500"></label></div>
      <div class="row"><label class="field" style="flex:1">💡 ${tt('揭晓答案时显示的讲解', 'Explanation shown after the answer')}<input class="in" data-f="note" value="${esc(q.note || '')}" maxlength="300"></label></div>
    </details>
    ${err ? `<div class="qerr">⚠️ ${err}</div>` : ''}
  </div>`;
}
function render() {
  $('#qlist').innerHTML = qs.map(qCard).join('') || `<div class="card muted" style="text-align:center;padding:30px">${tt('还没有题目。可以手动添加，或用右边的「快速出题」。', 'No questions yet. Add one below, or use Quick create on the right.')}</div>`;
  $('#count').textContent = `${qs.length} ${t('questions')}`;
}
function mark() { dirty = true; }

$('#qlist').addEventListener('input', e => {
  const el = e.target, card = el.closest('.qc'); if (!card) return;
  const q = qs[+card.dataset.i], f = el.dataset.f;
  if (f === 'prompt') q.prompt = el.value;
  if (f === 'opt') q.options[+el.dataset.k] = el.value;
  if (f === 'input') q.answer = el.value.split('|');
  if (f === 'order') q.options = el.value.split('\n');
  if (f === 'speak') { q.speak = el.value; q.lang = q.lang || 'zh-CN'; }
  if (f === 'image') q.image = el.value.trim();
  if (f === 'note') q.note = el.value;
  mark();
});
$('#qlist').addEventListener('change', e => {
  const el = e.target, card = el.closest('.qc'); if (!card) return;
  const i = +card.dataset.i, q = qs[i], f = el.dataset.f;
  if (f === 'type') { const n = blank(el.value); n.prompt = q.prompt; n.time = q.time; if (q.speak) { n.speak = q.speak; n.lang = q.lang; } if ((el.value === 'mcq' || el.value === 'order') && q.options) n.options = [...q.options]; qs[i] = n; render(); }
  if (f === 'time') q.time = +el.value;
  if (f === 'lang') q.lang = el.value;
  if (f === 'ans') { const k = +el.dataset.k; q.answer = el.checked ? [...new Set([...q.answer, k])] : q.answer.filter(x => x !== k); }
  mark();
});
$('#qlist').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b) return;
  const card = b.closest('.qc'), i = +card.dataset.i, q = qs[i], f = b.dataset.f;
  if (f === 'tf') q.answer = b.dataset.v === '1';
  if (f === 'addopt') q.options.push('');
  if (f === 'delopt') { const k = +b.dataset.k; q.options.splice(k, 1); q.answer = q.answer.filter(x => x !== k).map(x => x > k ? x - 1 : x); }
  if (f === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
  if (f === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
  if (f === 'dup') qs.splice(i + 1, 0, JSON.parse(JSON.stringify(q)));
  if (f === 'del') qs.splice(i, 1);
  mark(); render();
});

function addQuestions(list, msg) {
  qs.push(...list.map(q => ({ time: 20, ...q })));
  mark(); render(); toast(msg || tt(`已加入 ${list.length} 题`, `Added ${list.length} questions`));
  setTimeout(() => document.querySelectorAll('.qc')[qs.length - list.length]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

async function save() {
  qs.forEach(q => q._touched = true);
  const bad = qs.findIndex(q => problem(q));
  render();
  if (bad >= 0) { $('#saveErr').textContent = tt(`第 ${bad + 1} 题还没写完`, `Question ${bad + 1} is incomplete`); document.querySelectorAll('.qc')[bad].scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  $('#saveErr').textContent = '';
  const body = { title: $('#title').value, subject: $('#subject').value, grade: $('#grade').value, questions: qs.map(tidy) };
  try {
    if (setId) await api(`/api/sets/${setId}`, { method: 'PUT', body });
    else { setId = (await api('/api/sets', { method: 'POST', body })).id; history.replaceState(null, '', `/edit?id=${setId}`); }
    dirty = false; toast(t('saved')); showPlay(); return true;
  } catch (x) { $('#saveErr').textContent = x.status === 401 ? t('err_login_required') : t('err_generic'); return false; }
}
function showPlay() { const p = $('#playBtn'); p.hidden = !setId || !qs.length; p.href = `/host?set=${setId}`; p.textContent = '▶ ' + t('play'); }
$('#saveBtn').onclick = save; $('#saveTop').onclick = save;
$('#playBtn').onclick = async e => { if (dirty) { e.preventDefault(); if (await save()) location.href = $('#playBtn').href; } };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
['title', 'subject', 'grade'].forEach(id => $('#' + id).addEventListener('input', mark));

// ── 学科插件面板 ──
const PLUGINS = window.VAPlugins || [];
let activePlugin = null;
function renderPanel() {
  $('#ptabs').innerHTML = PLUGINS.map(p => `<button data-p="${p.id}"${p.id === activePlugin ? ' class="on"' : ''}>${p.icon} ${tt(p.name[0], p.name[1])}</button>`).join('');
  const p = PLUGINS.find(x => x.id === activePlugin) || PLUGINS[0];
  if (p) p.panel($('#pbody'), addQuestions);
}
$('#ptabs').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { activePlugin = b.dataset.p; renderPanel(); } };
$('#subject').addEventListener('change', () => { if (PLUGINS.some(p => p.id === $('#subject').value)) { activePlugin = $('#subject').value; renderPanel(); } });

function renderStatic() {
  $('#lTitle').textContent = tt('题包名称', 'Title'); $('#lSubject').textContent = tt('学科', 'Subject'); $('#lGrade').textContent = tt('年级 / 课次（选填）', 'Grade / unit (optional)');
  $('#lQuick').textContent = '⚡ ' + tt('快速出题', 'Quick create');
  $('#saveTop').textContent = t('save'); $('#saveBtn').textContent = '💾 ' + t('save');
  const cur = $('#subject').value;
  $('#subject').innerHTML = SUBJECTS.map(s => `<option value="${s}">${VA.SUBJECT_ICON[s]} ${t('s_' + s)}</option>`).join('');
  if (cur) $('#subject').value = cur;
  $('#addbar').innerHTML = Object.entries(TYPES()).map(([k, v]) => `<button class="btn ghost sm" data-add="${k}">＋ ${v}</button>`).join('');
  $('#title').placeholder = tt('例如：小三第五课 生字复习', 'e.g. P3 Unit 5 vocabulary');
  showPlay();
}
$('#addbar').onclick = e => { const b = e.target.closest('[data-add]'); if (!b) return; qs.push(blank(b.dataset.add)); mark(); render(); document.querySelectorAll('.qc')[qs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelectorAll('.qc textarea')[qs.length - 1]?.focus(); };
document.addEventListener('langchange', () => { renderStatic(); render(); renderPanel(); });

(async () => {
  try { await api('/api/me'); } catch (e) { location.href = '/'; return; }
  renderStatic();
  if (setId) {
    try {
      const s = await api(`/api/sets/${setId}`);
      $('#title').value = s.title; $('#subject').value = s.subject; $('#grade').value = s.grade;
      qs = s.questions.map(q => ({ ...q, options: q.options ? [...q.options] : q.options, answer: Array.isArray(q.answer) ? [...q.answer] : q.answer }));
    } catch (e) { toast(t('err_generic')); setId = null; }
  } else {
    $('#subject').value = params.get('subject') || 'chinese';
  }
  activePlugin = PLUGINS.some(p => p.id === $('#subject').value) ? $('#subject').value : (PLUGINS[0] || {}).id;
  render(); renderPanel(); showPlay();
})();
