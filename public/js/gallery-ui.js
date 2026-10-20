// Gallery 卡片（首页和 /gallery 共用）
(function () {
  const { tt, esc, icon, subjectIcon, api, toast } = VA;
  const SUBJ = [['all', '全部', 'All'], ['chinese', '华文', 'Chinese'], ['math', '数学', 'Math'], ['english', '英文', 'English'], ['science', '科学', 'Science'], ['general', '综合', 'General']];
  let me = undefined;
  const who = async () => { if (me === undefined) { try { me = await api('/api/me'); } catch (e) { me = null; } } return me; };

  function card(g) {
    const name = tt(g.title[0], g.title[1]), desc = tt(g.desc[0], g.desc[1]), grade = tt(g.grade[0], g.grade[1]);
    return `<article class="gcard s-${esc(g.subject)}" data-id="${esc(g.id)}">
      <div class="gtop">${subjectIcon(g.subject)}<span class="gsub">${tt(SUBJ.find(s => s[0] === g.subject)[1], SUBJ.find(s => s[0] === g.subject)[2])}</span><span class="ggrade">${esc(grade)}</span></div>
      <h3>${esc(name)}</h3><p>${esc(desc)}</p>
      <div class="gmeta"><span>${icon('list-ordered')} ${g.n} ${tt('题', 'questions')}${g.listening ? ` · ${icon('volume-2')} ${tt('听力', 'Listening')}` : ''}</span><button type="button" class="gcopy" data-g="copy">${icon('copy')} ${tt('复制来改', 'Copy & edit')}</button></div>
      <div class="gacts">
        <a class="btn go sm" href="/try/${esc(g.id)}">${icon('play')} ${tt('单人试玩', 'Try it')}</a>
        <button type="button" class="btn ghost sm" data-g="host">${icon('presentation')} ${tt('投屏开一局', 'Host for class')}</button>
      </div></article>`;
  }
  function filters(active) {
    return SUBJ.map(([k, zh, en]) => `<button type="button" class="gchip${k === active ? ' on' : ''}" data-s="${k}">${k === 'all' ? '' : icon(VA.SUBJECT_ICON[k])} ${tt(zh, en)}</button>`).join('');
  }
  // 卡片上的按钮
  async function onClick(e) {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const id = b.closest('.gcard').dataset.id;
    if (b.dataset.g === 'host') return VA.pickMode(id, { gallery: true });
    if (b.dataset.g === 'copy') {
      if (!await who()) { toast(tt('先免费注册一个老师账号，就能复制和修改', 'Sign up free to copy and edit')); setTimeout(() => location.href = '/?signup=1', 1200); return; }
      try { const r = await api(`/api/gallery/${id}/copy`, { method: 'POST', body: { lang: VA.lang } }); location.href = `/edit?id=${r.id}`; } catch (x) { toast(tt('出错了，请再试一次', 'Something went wrong')); }
    }
  }
  window.KQG = { card, filters, onClick, SUBJ };
})();
