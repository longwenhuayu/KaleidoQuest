// 老师后台 · 班级：建班、学生名单和 4 位密码、打印登录条、看全班收集进度
(function () {
  const { tt, api, $, esc, toast, icon } = VA;
  const DECKS = [['zh', '字灵', 'Hanzi'], ['math', '数兽', 'Math'], ['science', '元素精灵', 'Science'], ['explorer', '探索者', 'Explorer']];
  const total = d => d === 'zh' ? 0 : KQ_CARDS.SETS[d].cards.length;
  let list = [], open = null;
  const meUrl = code => `${location.origin}/me?c=${code}`;

  async function load() { list = await api('/api/classes'); if (open) open = await api(`/api/classes/${open.id}`); render(); }
  function render() {
    $('#clsTab').textContent = tt('班级', 'Classes');
    if (open) return detail();
    $('#vClasses').innerHTML = `<div class="head"><h1>${tt('班级', 'Classes')}</h1><button class="btn main" id="clsNew">${icon('plus')} ${tt('新建班级', 'New class')}</button></div>
      <div class="muted" style="margin:-6px 0 14px;line-height:1.6">${tt('建好班级后，每个学生有一个 4 位密码。学生在 kaleido.quest/me 登录，玩游戏、做作业得到的卡就存进账号，换设备也不丢；你在这里能看到全班的收集进度。学生不登录也照样能玩。', 'Each student gets a 4-digit PIN. When they sign in at kaleido.quest/me, the cards they earn are saved to their account on any device, and you can see the class’s progress here. Students can still play without signing in.')}</div>
      ${list.length ? `<div class="sets">${list.map(c => `<div class="card set" data-cls="${c.id}" style="cursor:pointer"><h3><span class="subj" style="background:#ede9fe;color:#6d28d9">${icon('school')}</span><span>${esc(c.name)}</span></h3><div class="meta"><span>${c.n} ${tt('名学生', 'students')}</span><span>· ${tt('班级码', 'Code')} <b style="letter-spacing:1px">${esc(c.code)}</b></span></div></div>`).join('')}</div>` : `<div class="empty">${tt('还没有班级。新建一个，把学生名字贴进去就行。', 'No classes yet — create one and paste in your students’ names.')}</div>`}`;
    $('#clsNew').onclick = create;
    $('#vClasses').querySelectorAll('[data-cls]').forEach(el => el.onclick = async () => { open = await api(`/api/classes/${el.dataset.cls}`); render(); });
  }
  function namesBox(id) { return `<label class="field">${tt('学生名字（每行一个，或用逗号隔开；建议用名字或昵称，不要用全名）', 'Student names (one per line or comma-separated; first names or nicknames are best)')}<textarea class="in" id="${id}" rows="6" placeholder="${tt('小明\n小红\nAli', 'Mei\nAli\nRavi')}"></textarea></label>`; }
  function create() {
    const d = modal(`<h2>${icon('school')} ${tt('新建班级', 'New class')}</h2>
      <label class="field">${tt('班级名称', 'Class name')}<input class="in" id="cName" maxlength="40" placeholder="${tt('例如：小三忠班', 'e.g. P3 Courage')}"></label>
      ${namesBox('cNames')}<div class="err" id="cErr"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost sm mp-x" type="button">${tt('取消', 'Cancel')}</button><button class="btn main" id="cGo">${tt('建好了', 'Create')}</button></div>`);
    d.querySelector('#cName').focus();
    d.querySelector('#cGo').onclick = async () => {
      try { const r = await api('/api/classes', { method: 'POST', body: { name: d.querySelector('#cName').value, names: d.querySelector('#cNames').value } }); d.remove(); open = { id: r.id }; await load(); }
      catch (x) { d.querySelector('#cErr').textContent = x.message === 'name' ? tt('请填写班级名称', 'Enter a class name') : x.message === 'too_many_classes' ? tt('最多 30 个班级', 'Up to 30 classes') : tt('出错了，请再试一次', 'Something went wrong'); }
    };
  }
  function detail() {
    const c = open;
    $('#vClasses').innerHTML = `<div class="head"><button class="btn ghost sm" id="clsBack">${icon('arrow-left')}</button><h1>${esc(c.name)}</h1>
        <button class="btn ghost sm" id="clsPrint">${icon('download')} ${tt('打印登录条', 'Print sign-in slips')}</button><button class="btn ghost sm" id="clsAdd">${icon('plus')} ${tt('添加学生', 'Add students')}</button></div>
      <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px"><div style="flex:1;min-width:220px;line-height:1.7">${tt('学生打开', 'Students go to')} <b>${esc(location.host)}/me</b><br>${tt('班级码', 'Class code')} <b style="font-size:22px;letter-spacing:3px">${esc(c.code)}</b> · ${tt('再点自己的名字、输入 4 位密码', 'then tap their name and enter their PIN')}</div><div class="qr" id="clsQr" style="line-height:0"></div></div>
      ${c.students.length ? `<div class="card" style="padding:0;overflow:auto"><table class="ctab"><thead><tr><th>${tt('学生', 'Student')}</th><th>${tt('密码', 'PIN')}</th>${DECKS.map(([, zh, en]) => `<th>${tt(zh, en)}</th>`).join('')}<th></th></tr></thead><tbody>
        ${c.students.map(s => `<tr data-sid="${s.id}"><td><b>${esc(s.name)}</b></td><td class="pin">${esc(s.pin)}</td>${DECKS.map(([k]) => `<td>${s.cards[k] || 0}${total(k) ? `<span class="muted"> / ${total(k)}</span>` : ''}</td>`).join('')}
          <td style="white-space:nowrap"><button class="btn ghost sm" data-s="pin" title="${tt('重设密码', 'Reset PIN')}">${icon('rotate-ccw')}</button> <button class="btn ghost sm danger" data-s="del" title="${tt('删除', 'Remove')}">${icon('trash-2')}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${tt('还没有学生，点「添加学生」。', 'No students yet — click “Add students”.')}</div>`}
      <div style="margin-top:20px;text-align:right"><button class="btn ghost sm danger" id="clsDel">${icon('trash-2')} ${tt('删除这个班级', 'Delete this class')}</button></div>`;
    $('#clsBack').onclick = () => { open = null; load(); };
    qr($('#clsQr'), meUrl(c.code), 110);
    $('#clsAdd').onclick = () => {
      const d = modal(`<h2>${icon('plus')} ${tt('添加学生', 'Add students')}</h2>${namesBox('aNames')}<div class="err" id="aErr"></div><div class="row" style="justify-content:flex-end"><button class="btn ghost sm mp-x" type="button">${tt('取消', 'Cancel')}</button><button class="btn main" id="aGo">${tt('添加', 'Add')}</button></div>`);
      d.querySelector('#aGo').onclick = async () => {
        try { const r = await api(`/api/classes/${c.id}/students`, { method: 'POST', body: { names: d.querySelector('#aNames').value } }); d.remove(); toast(tt(`添加了 ${r.added} 名学生`, `Added ${r.added} students`)); load(); }
        catch (x) { d.querySelector('#aErr').textContent = x.message === 'too_many_students' ? tt('一个班最多 60 名学生', 'Up to 60 students per class') : tt('出错了，请再试一次', 'Something went wrong'); }
      };
    };
    $('#clsPrint').onclick = () => print(c);
    $('#clsDel').onclick = async e => {
      if (!e.currentTarget.dataset.armed) { e.currentTarget.dataset.armed = 1; e.currentTarget.innerHTML = icon('triangle-alert') + ' ' + tt('再点一次：学生账号和卡册都会删除', 'Click again: student accounts and cards will be deleted'); return; }
      await api(`/api/classes/${c.id}`, { method: 'DELETE' }); open = null; load();
    };
    $('#vClasses').querySelectorAll('[data-s]').forEach(b => b.onclick = async () => {
      const sid = b.closest('tr').dataset.sid, s = c.students.find(x => x.id == sid);
      if (!b.dataset.armed) { b.dataset.armed = 1; b.classList.add('main'); b.title = b.dataset.s === 'pin' ? tt(`再点一次：给 ${s.name} 换新密码`, `Click again to give ${s.name} a new PIN`) : tt(`再点一次：删除 ${s.name} 和他的卡册`, `Click again to remove ${s.name} and their cards`); toast(b.title); setTimeout(() => { delete b.dataset.armed; b.classList.remove('main'); }, 3000); return; }
      if (b.dataset.s === 'pin') { const r = await api(`/api/classes/${c.id}/students/${sid}/pin`, { method: 'POST' }); toast(tt(`${s.name} 的新密码：${r.pin}`, `${s.name}'s new PIN: ${r.pin}`)); }
      else await api(`/api/classes/${c.id}/students/${sid}`, { method: 'DELETE' });
      load();
    });
  }
  async function qr(el, text, size) {
    if (!window.QRCode) await new Promise(ok => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = s.onerror = ok; document.head.appendChild(s); });
    if (window.QRCode) { el.innerHTML = ''; new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); }
  }
  // 打印：每个学生一张登录条，剪开发下去
  async function print(c) {
    const w = window.open('', '_blank'); if (!w) return toast(tt('请允许弹出窗口', 'Please allow pop-ups'));
    const holder = document.createElement('div'); await qr(holder, meUrl(c.code), 220);
    const img = (holder.querySelector('canvas') || {}).toDataURL ? holder.querySelector('canvas').toDataURL() : '';
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(c.name)} · KaleidoQuest</title><style>
      body{font-family:"Noto Sans SC",system-ui,sans-serif;margin:12mm;color:#1e1b4b}h1{font-size:16px;margin:0 0 8mm}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:0}.s{border:1px dashed #999;padding:5mm;display:flex;gap:4mm;align-items:center;break-inside:avoid}
      .s img{width:26mm;height:26mm}.s b{font-size:18px;display:block}.s div{font-size:12px;line-height:1.6}.pin{font-size:20px;font-weight:900;letter-spacing:4px}
      @media print{h1{display:none}body{margin:8mm}}</style>
      <h1>${esc(c.name)} — ${tt('打印后沿虚线剪开，每人一张', 'Print and cut along the dashed lines')}</h1><div class="g">${c.students.map(s => `<div class="s">${img ? `<img src="${img}">` : ''}<div><b>${esc(s.name)}</b>${esc(location.host)}/me<br>${tt('班级码', 'Class code')} <b style="display:inline;font-size:14px;letter-spacing:2px">${esc(c.code)}</b><br>${tt('密码', 'PIN')} <span class="pin">${esc(s.pin)}</span></div></div>`).join('')}</div>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  }
  window.KQClasses = { load, render };
})();
