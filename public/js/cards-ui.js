// 收集卡：存在本机（学生不用注册），结算画面和卡册共用
(function () {
  const { tt, esc } = VA;
  const KEY = 'kq_cards', AWARDS = 'kq_awards';
  const SET_NAME = { zh: ['字灵', 'Hanzi Spirits'], math: ['数兽', 'Number Beasts'], science: ['元素精灵', 'Science Sprites'], explorer: ['探索者', 'Explorers'] };
  const RARITY = { c: ['普通', 'Common'], r: ['稀有', 'Rare'], e: ['史诗', 'Epic'] };
  const STRUCT = { '⿰': '左右结构', '⿲': '左中右结构', '⿱': '上下结构', '⿳': '上中下结构', '⿴': '全包围结构', '⿵': '半包围结构', '⿶': '半包围结构', '⿷': '半包围结构', '⿸': '半包围结构', '⿹': '半包围结构', '⿺': '半包围结构', '⿻': '独体字', '': '独体字' };
  const STRUCT_EN = { '左右结构': 'left–right', '左中右结构': 'left–middle–right', '上下结构': 'top–bottom', '上中下结构': 'top–middle–bottom', '全包围结构': 'enclosed', '半包围结构': 'half-enclosed', '独体字': 'single unit' };
  const ETY = { p: ['象形字', 'Pictograph'], i: ['会意字', 'Compound ideograph'], s: ['形声字', 'Phono-semantic'] };

  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const all = () => read(KEY);

  // 把一次奖励存进卡册；同一次奖励（断线重连会重发）只存一次
  function save(reward) {
    if (!reward || !reward.cards) return [];
    const book = all(), awards = read(AWARDS);
    const seen = !!awards[reward.id];
    const out = reward.cards.map(c => ({ card: c, isNew: !book[c.id] }));
    if (!seen) {
      reward.cards.forEach(c => { book[c.id] = { card: c, n: (book[c.id] ? book[c.id].n : 0) + 1, first: book[c.id] ? book[c.id].first : Date.now() }; });
      awards[reward.id] = Date.now();
      // 只留最近 300 次奖励记录
      const keys = Object.keys(awards); if (keys.length > 300) keys.sort((a, b) => awards[a] - awards[b]).slice(0, keys.length - 300).forEach(k => delete awards[k]);
      write(KEY, book); write(AWARDS, awards);
    }
    return out;
  }

  const face = c => c.set === 'zh' ? `<div class="kc-ch">${esc(c.ch)}</div>` : `<div class="kc-emo">${c.emoji}</div><div class="kc-nm">${esc(tt(c.name[0], c.name[1]))}</div>`;
  function mini(c, opts = {}) {
    return `<button type="button" class="kc r-${c.rarity}${opts.flip ? ' flip' : ''}" data-id="${esc(c.id)}" style="${opts.delay ? `animation-delay:${opts.delay}s` : ''}">
      ${opts.isNew ? '<span class="kc-new">NEW</span>' : ''}${opts.n > 1 ? `<span class="kc-n">×${opts.n}</span>` : ''}
      ${face(c)}<div class="kc-r">${tt(RARITY[c.rarity][0], RARITY[c.rarity][1])}</div></button>`;
  }
  function etyText(e) {
    if (!e) return '';
    if (e.t === 's' && e.sem && e.pho) return tt(`「${e.sem}」表示意思（${e.hint}），「${e.pho}」表示读音。`, `「${e.sem}」gives the meaning (${e.hint}); 「${e.pho}」gives the sound.`);
    return e.hint;
  }
  function big(c, py) {
    const set = tt(SET_NAME[c.set][0], SET_NAME[c.set][1]), r = tt(RARITY[c.rarity][0], RARITY[c.rarity][1]);
    if (c.set === 'zh') {
      const st = STRUCT[c.structure] || '独体字';
      return `<div class="kb r-${c.rarity}"><div class="kb-top">${set} · ${r}</div><div class="kb-ch">${esc(c.ch)}</div><div class="kb-py">${esc(py || '')}</div>
        <div class="kb-facts"><span>${tt('部首', 'Radical')} <b>${esc(c.radical)}</b></span><span>${tt(st, STRUCT_EN[st])}</span><span>${c.strokes} ${tt('画', 'strokes')}</span>${c.parts && !c.parts.includes('？') && c.structure !== '⿻' ? `<span>${[...c.parts].map(esc).join(' + ')}</span>` : ''}</div>
        ${c.ety ? `<div class="kb-ety"><b>${tt(ETY[c.ety.t][0], ETY[c.ety.t][1])}</b>${esc(etyText(c.ety))}</div>` : ''}</div>`;
    }
    return `<div class="kb r-${c.rarity}"><div class="kb-top">${set} · ${r}</div><div class="kb-emo">${c.emoji}</div><div class="kb-nm">${esc(c.name[0])}<small>${esc(c.name[1])}</small></div><div class="kb-ety">${esc(c.fact[0])}<br><small>${esc(c.fact[1])}</small></div></div>`;
  }
  // 结算画面：「获得新卡」
  function rewardHtml(reward) {
    const got = save(reward);
    if (!got.length) return '';
    return `<div class="kc-reward"><div class="kc-title">🎴 ${tt(`获得 ${got.length} 张收集卡`, `You got ${got.length} card${got.length > 1 ? 's' : ''}`)}</div><div class="kc-row">${got.map((g, i) => mini(g.card, { isNew: g.isNew, flip: true, delay: .3 + i * .35 })).join('')}</div><a class="kc-link" href="/cards">${tt('打开我的卡册 →', 'Open my card book →')}</a></div>`;
  }
  window.KQC = { all, save, mini, big, rewardHtml, SET_NAME, RARITY };
})();
