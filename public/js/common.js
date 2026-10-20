// 共用：中英文、接口、小工具
(function () {
  const DICT = {
    tagline: ['每一门课，都是一场闯关 —— 全班一起玩的课堂答题游戏', 'Live quiz games your whole class plays together'],
    join_title: ['我是学生', "I'm a student"], join_pin: ['输入房间码', 'Game code'], join_btn: ['加入游戏', 'Join'],
    teacher_title: ['我是老师', "I'm a teacher"], login: ['登录', 'Log in'], register: ['注册', 'Sign up'], logout: ['退出', 'Log out'],
    email: ['邮箱', 'Email'], password: ['密码（至少 8 位）', 'Password (8+ characters)'], your_name: ['怎么称呼您', 'Your name'],
    my_sets: ['我的题包', 'My question sets'], reports: ['赛后报告', 'Reports'], new_set: ['新建题包', 'New set'],
    play: ['开始游戏', 'Host game'], edit: ['编辑', 'Edit'], copy: ['复制', 'Duplicate'], del: ['删除', 'Delete'],
    questions: ['题', 'questions'], confirm_del: ['确定删除？再点一次', 'Click again to delete'], empty_sets: ['还没有题包，先新建一个吧！', 'No sets yet — create your first one!'],
    empty_reports: ['开过一局游戏后，报告会出现在这里。', 'Reports appear here after you host a game.'],
    players: ['人', 'players'], save: ['保存', 'Save'], saved: ['已保存', 'Saved'], back: ['返回', 'Back'],
    s_chinese: ['华文', 'Chinese'], s_math: ['数学', 'Math'], s_english: ['英文', 'English'], s_science: ['科学', 'Science'], s_general: ['综合', 'General'], s_malay: ['马来文', 'Malay'], s_tamil: ['淡米尔文', 'Tamil'],
    err_email: ['邮箱格式不对', 'Invalid email'], err_password: ['密码至少 8 位', 'Password must be 8+ characters'], err_name: ['请填写称呼', 'Please enter your name'],
    err_exists: ['这个邮箱已经注册过，请直接登录', 'Email already registered — please log in'], err_wrong: ['邮箱或密码不对。还没有账号？请先点上面的「注册」。', 'Wrong email or password. No account yet? Click “Sign up” above first.'], err_disabled: ['这个账号已被停用，请联系 ask@visionchinese.com', 'This account has been disabled — contact ask@visionchinese.com'], err_too_many: ['尝试太多次，请 15 分钟后再试', 'Too many attempts. Try again in 15 minutes'],
    err_room_not_found: ['找不到这个房间，请检查房间码', 'Game not found — check the code'], err_locked: ['房间已锁定，请让老师解锁', 'This game is locked'], err_full: ['房间满了', 'Game is full'],
    err_name_req: ['请输入昵称', 'Please enter a nickname'], err_login_required: ['请先登录', 'Please log in first'], err_generic: ['出错了，请再试一次', 'Something went wrong — please try again']
  };
  let lang = 'zh';
  try { lang = localStorage.getItem('va_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en'); } catch (e) {}
  const t = k => (DICT[k] || [k, k])[lang === 'en' ? 1 : 0];
  const tt = (zh, en) => lang === 'en' ? en : zh;
  function setLang(l) { lang = l; try { localStorage.setItem('va_lang', l); } catch (e) {} document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN'; applyI18n(); document.dispatchEvent(new Event('langchange')); }
  function applyI18n(root = document) {
    root.querySelectorAll('[data-i]').forEach(e => { e.textContent = t(e.dataset.i); });
    root.querySelectorAll('[data-ip]').forEach(e => { e.placeholder = t(e.dataset.ip); });
    root.querySelectorAll('.lang').forEach(b => { b.textContent = lang === 'en' ? '中文' : 'EN'; });
  }
  document.addEventListener('click', e => { if (e.target.closest('.lang')) setLang(lang === 'en' ? 'zh' : 'en'); });

  async function api(path, opts = {}) {
    const r = await fetch(path, { method: opts.method || 'GET', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((data && data.error) || 'generic'); err.status = r.status; throw err; }
    return data;
  }
  const $ = (s, root = document) => root.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  // 选项标记：字母徽章（颜色 + 字母 + 底纹三重区分，不靠颜色也分得清）
  const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F'];
  // 图标：Lucide（public/icons.svg）
  const icon = (name, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="/icons.svg#${name}"></use></svg>`;
  // 学科：Lucide 图标 + 底色
  const SUBJECT_ICON = { chinese: 'languages', math: 'calculator', english: 'type', science: 'flask-conical', general: 'book-open', malay: 'message-square-text', tamil: 'message-circle-more' };
  const SUBJECT_TONE = { chinese: ['#fee2e2', '#be123c'], math: ['#dbeafe', '#1d4ed8'], english: ['#ede9fe', '#6d28d9'], science: ['#dcfce7', '#15803d'], general: ['#f1f5f9', '#334155'], malay: ['#fef3c7', '#b45309'], tamil: ['#ffedd5', '#c2410c'] };
  const subjectIcon = s => { const [bg, fg] = SUBJECT_TONE[s] || SUBJECT_TONE.general; return `<span class="subj" style="background:${bg};color:${fg}">${icon(SUBJECT_ICON[s] || 'book-open')}</span>`; };
  const wsUrl = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  // 声音：WebAudio 合成，免下载
  let actx = null, muted = false;
  try { muted = localStorage.getItem('va_muted') === '1'; } catch (e) {}
  function tone(f, d, type = 'triangle', v = .12, when = 0) {
    if (muted) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t0 = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + d); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + d); } catch (e) {}
  }
  const sfx = {
    join: () => tone(880, .12, 'sine', .08),
    tick: () => tone(1200, .05, 'square', .04),
    go: () => [523, 784].forEach((f, i) => tone(f, .15, 'triangle', .12, i * .1)),
    ok: () => [660, 990].forEach((f, i) => tone(f, .16, 'triangle', .12, i * .08)),
    bad: () => tone(160, .3, 'sawtooth', .08),
    reveal: () => [523, 659, 784].forEach((f, i) => tone(f, .2, 'triangle', .1, i * .08)),
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .28, 'triangle', .12, i * .14))
  };
  const setMuted = m => { muted = m; try { localStorage.setItem('va_muted', m ? '1' : '0'); } catch (e) {} };
  function speak(text, l) { if (!('speechSynthesis' in window) || !text) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = l || 'zh-CN'; u.rate = .9; const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(u.lang)); if (v) u.voice = v; speechSynthesis.speak(u); }

  // 开始游戏前选模式：擂台抢答 / 夺宝（选时长）
  function pickMode(setId, opts = {}) {
    const q = opts.gallery ? `gallery=${encodeURIComponent(setId)}` : `set=${setId}`;
    document.querySelector('.modepick')?.remove();
    const d = document.createElement('div');
    d.className = 'modepick';
    d.innerHTML = `<div class="mp-box"><h2>${tt('选一种玩法', 'Choose a game mode')}</h2>
      <div class="mp-card"><b>${icon('swords')} ${tt('擂台抢答', 'Classic')}</b><span>${tt('全班同一题，大屏倒计时。适合新课检查。', 'Everyone answers the same question together on the big screen.')}</span>
        <div class="mp-min"><a class="btn go sm" href="/host?${q}&mode=classic">${icon('zap')} ${tt('越快分越高', 'Speed counts')}</a><a class="btn ghost sm" href="/host?${q}&mode=classic&acc=1" title="${tt('答对就是 1000 分，不比快慢，照顾答得慢的学生', 'Every right answer is 1000 points — no rush, kinder to slower students')}">${icon('check')} ${tt('不计速度，只算对错', 'Accuracy only')}</a></div></div>
      <div class="mp-card"><b>${icon('gem')} ${tt('夺宝', 'Treasure Quest')}</b><span>${tt('各答各的，答对开宝箱：可能翻倍、偷别人的宝石，后面的也能翻盘。适合复习。', 'Self-paced. Correct answers open chests — double up, steal, or swap gems. Anyone can come back.')}</span>
        <div class="mp-min">${[5, 7, 10].map(m => `<a class="btn go sm" href="/host?${q}&mode=treasure&min=${m}">${m} ${tt('分钟', 'min')}</a>`).join('')}</div></div>
      <button class="btn ghost sm mp-x" type="button">${tt('取消', 'Cancel')}</button></div>`;
    d.onclick = e => { if (e.target === d || e.target.closest('.mp-x')) d.remove(); };
    document.body.appendChild(d);
  }

  // 密码框加「小眼睛」：点一下显示 / 隐藏密码
  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function passwordEyes(root = document) {
    root.querySelectorAll('input[type=password]:not([data-eye])').forEach(inp => {
      inp.dataset.eye = '1';
      const wrap = document.createElement('span'); wrap.className = 'pw-wrap';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye';
      const sync = () => { const shown = inp.type === 'text'; b.innerHTML = shown ? EYE_OFF : EYE; b.setAttribute('aria-pressed', shown); b.setAttribute('aria-label', shown ? tt('隐藏密码', 'Hide password') : tt('显示密码', 'Show password')); b.title = b.getAttribute('aria-label'); };
      b.onclick = () => { const pos = inp.selectionStart; inp.type = inp.type === 'password' ? 'text' : 'password'; sync(); inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) {} };
      sync(); wrap.appendChild(b);
      document.addEventListener('langchange', sync);
    });
  }

  // 吉祥物 Kaleido：hello / think / cheer / point / wait
  const mascot = (pose, size = 120) => `<img class="mascot" src="/mascot/${pose}.webp" width="${size}" height="${size}" alt="">`;
  // 头像：emoji，或者 card:<id>（收集到的卡片角色）
  const av = a => { const m = /^card:([a-z0-9]{1,20})$/.exec(String(a || '')); return m ? `<img class="av-img" src="/card-art/${m[1]}.webp" alt="">` : esc(a); };
  window.VA = { av, mascot, t, tt, get lang() { return lang; }, setLang, applyI18n, api, $, esc, toast, pickMode, passwordEyes, icon, subjectIcon, SHAPES, SUBJECT_ICON, wsUrl, sfx, tone, get muted() { return muted; }, setMuted, speak };
  document.addEventListener('DOMContentLoaded', () => { document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; applyI18n(); passwordEyes(); });
})();
