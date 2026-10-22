// AI 出题：给一个主题或贴一段课文，AI 生成题目加到下面，老师再检查修改
(function () {
  const { tt, icon, api } = VA;
  const TYPES = [['mcq', '选择题', 'Multiple choice'], ['tf', '判断题', 'True / false'], ['input', '填空题', 'Type answer'], ['order', '排序题', 'Ordering']];
  const ERR = { topic: ['请填写主题，或者贴一段课文', 'Enter a topic or paste some lesson text'], quota: ['今天的 AI 出题次数用完了，明天再来', "You've used today's AI quota — try again tomorrow"], busy: ['上一次还在生成，请稍等', 'Still working on the last request'], ai_off: ['AI 出题暂时没有开通', 'AI generation is not available right now'] };

  function panel(el, add) {
    el.innerHTML = `
      <div class="muted">${tt('写一个主题，或者把课文贴进来，AI 会按上面选的学科和年级出题。出完请检查一遍再用。', 'Give a topic or paste your lesson text. AI writes questions for the subject and level above — please check them before use.')}</div>
      <input class="in" id="aiTopic" maxlength="200" value="${VA.esc(new URLSearchParams(location.search).get('topic') || '')}" placeholder="${tt('主题，例如：植物的部分 / 第五课《小猫钓鱼》生字', 'Topic, e.g. parts of a plant / past tense verbs')}">
      <textarea class="in" id="aiText" maxlength="4000" placeholder="${tt('（选填）贴上课文，题目只从课文里出', '(Optional) paste lesson text — questions will come only from it')}"></textarea>
      <div class="row" style="align-items:center;gap:8px">
        <select class="in" id="aiLang" style="width:auto">${[['zh', '中文题目', 'In Chinese'], ['en', '英文题目', 'In English'], ['ms', '马来文题目', 'In Malay'], ['ta', '淡米尔文题目', 'In Tamil']].map(([k, zh, en]) => `<option value="${k}">${tt(zh, en)}</option>`).join('')}</select>
        <select class="in" id="aiN" style="width:auto">${[5, 8, 10, 15].map(n => `<option value="${n}"${n === 8 ? ' selected' : ''}>${n} ${tt('题', 'questions')}</option>`).join('')}</select>
        ${TYPES.map(([k, zh, en]) => `<label style="display:inline-flex;align-items:center;gap:4px;font-weight:700"><input type="checkbox" value="${k}"${k === 'mcq' || k === 'tf' ? ' checked' : ''}> ${tt(zh, en)}</label>`).join('')}
      </div>
      <button class="btn main" id="aiGo">${icon('sparkles')} ${tt('AI 出题', 'Generate')}</button>
      <div class="muted" id="aiLeft" style="font-size:12px"></div>
      <div class="muted" style="font-size:12px">${tt('填的主题和课文会发送给 AI 服务商（硅基流动）生成题目，请不要填写学生的个人资料。', 'Your topic and text are sent to our AI provider (SiliconFlow). Please don’t include students’ personal details.')} <a href="/privacy" target="_blank">${tt('隐私说明', 'Privacy')}</a></div>
      <div class="err" id="aiErr"></div>`;
    const $ = s => el.querySelector(s), err = $('#aiErr');
    // 题目语言默认跟学科走：新加坡的英文、数学、科学都用英文教
    const DEF = { chinese: 'zh', english: 'en', math: 'en', science: 'en', malay: 'ms', tamil: 'ta' };
    $('#aiLang').value = DEF[document.querySelector('#subject').value] || (VA.lang === 'en' ? 'en' : 'zh');
    const showLeft = n => { $('#aiLeft').textContent = tt(`今天还可以用 ${n} 次`, `${n} generations left today`); };
    api('/api/ai/quota').then(d => showLeft(d.left)).catch(() => {});
    $('#aiGo').onclick = async () => {
      err.textContent = '';
      const types = [...el.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
      if (!types.length) { err.textContent = tt('至少选一种题型', 'Pick at least one question type'); return; }
      const b = $('#aiGo'); b.disabled = true; b.innerHTML = `${icon('hourglass')} ${tt('正在出题，大约 20–40 秒…', 'Writing questions, about 20–40 s…')}`;
      try {
        const d = await api('/api/ai/questions', { method: 'POST', body: { subject: document.querySelector('#subject').value, grade: document.querySelector('#grade').value, topic: $('#aiTopic').value, text: $('#aiText').value, n: +$('#aiN').value, types, qlang: $('#aiLang').value } });
        add(d.questions, tt(`AI 出了 ${d.questions.length} 题，已加到下面，请检查`, `Added ${d.questions.length} AI questions below — please review them`));
        showLeft(d.left);
      } catch (x) { const m = ERR[x.message]; err.textContent = m ? tt(m[0], m[1]) : tt('生成失败，请再试一次', 'Generation failed — please try again'); }
      b.disabled = false; b.innerHTML = `${icon('sparkles')} ${tt('AI 出题', 'Generate')}`;
    };
  }
  (window.VAPlugins = window.VAPlugins || []).push({ id: 'ai', icon: 'sparkles', name: ['AI 出题', 'AI'], panel });
})();
