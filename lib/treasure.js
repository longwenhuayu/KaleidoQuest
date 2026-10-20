// 夺宝模式：限时，各答各的；答对开宝箱，可能加、翻倍、偷、换、扣
const crypto = require('crypto');
const Q = require('./questions');
const C = require('./cards');
const S = require('./students');
const GAINS = [10, 20, 30, 40, 50, 75, 100];
// 宝箱结果的权重（加起来 100）
const TABLE = [['gain', 46], ['double', 9], ['steal', 13], ['swap', 6], ['nothing', 12], ['lose25', 9], ['lose50', 5]];
const TARGET_TIMEOUT = 10e3;
const WRONG_WAIT = 2000;

function roll() {
  let x = crypto.randomInt(100);
  for (const [k, w] of TABLE) { if (x < w) return k; x -= w; }
  return 'gain';
}
const shuffled = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

module.exports = function treasure({ send, ranking, finishReport }) {
  function nextQuestion(r, p) {
    if (r.state !== 'playing') return;
    if (!p.queue || !p.queue.length) p.queue = shuffled(r.questions.length);
    p.qi = p.queue.shift();
    p.qStart = Date.now();
    p.pending = null;
    send(p.ws, { t: 'tq', qi: p.qi, q: Q.forPlayer(r.questions[p.qi]), endsAt: r.endsAt, now: Date.now(), score: p.score });
  }
  // 事件播报 + 排行榜，最多每 300ms 推一次给大屏
  function event(r, text) { r.events.unshift({ text, at: Date.now() }); r.events.length = Math.min(r.events.length, 8); pushBoard(r); }
  function pushBoard(r) {
    if (r.boardTimer) return;
    r.boardTimer = setTimeout(() => {
      r.boardTimer = null;
      send(r.host, { t: 'tboard', top: ranking(r).slice(0, 10).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score })), events: r.events, endsAt: r.endsAt, now: Date.now(), players: r.players.size });
    }, 300);
  }
  const tag = p => `${p.avatar}${p.name}`;

  function start(r) {
    r.state = 'playing';
    r.started = Date.now();
    r.endsAt = Date.now() + r.minutes * 60e3;
    r.events = [];
    r.qstats = r.questions.map(() => ({ answered: 0, correct: 0, ms: 0 }));
    for (const p of r.players.values()) { p.score = 0; p.correctN = 0; p.tries = 0; nextQuestion(r, p); }
    send(r.host, { t: 'tstart', endsAt: r.endsAt, now: Date.now(), minutes: r.minutes });
    pushBoard(r);
    clearTimeout(r.timer);
    r.timer = setTimeout(() => finish(r), r.minutes * 60e3);
  }

  function answer(r, p, qi, ans) {
    if (r.state !== 'playing' || p.pending || qi !== p.qi) return;
    const qq = r.questions[qi], ms = Date.now() - p.qStart, correct = Q.check(qq, ans);
    const st = r.qstats[qi]; st.answered++; st.ms += ms; if (correct) st.correct++;
    p.tries++;
    if (!(qi in p.firstTry)) p.firstTry[qi] = correct ? 1 : 0;
    if (correct) { p.correctN++; p.pending = { kind: 'chest' }; send(p.ws, { t: 'tres', correct: true }); }
    else { p.pending = { kind: 'wait', until: Date.now() + WRONG_WAIT }; send(p.ws, { t: 'tres', correct: false, answerText: Q.answerText(qq), wait: WRONG_WAIT }); }
  }

  function apply(r, p, kind, target) {
    let msg = { t: 'tout', kind }, ev = null;
    if (kind === 'gain') { const g = GAINS[crypto.randomInt(GAINS.length)]; p.score += g; msg.amount = g; ev = `${tag(p)} +${g} 💎`; }
    else if (kind === 'double') { msg.amount = p.score || 20; p.score = p.score ? p.score * 2 : 20; ev = `${tag(p)} ✨×2 → ${p.score} 💎`; }
    else if (kind === 'nothing') { /* 空宝箱 */ }
    else if (kind === 'lose25' || kind === 'lose50') { const l = Math.floor(p.score * (kind === 'lose25' ? .25 : .5)); p.score -= l; msg.amount = l; if (l) ev = `${tag(p)} −${l} 💎`; }
    else if (kind === 'steal' && target) { const s = Math.floor(target.score * (.1 + crypto.randomInt(16) / 100)); target.score -= s; p.score += s; msg.amount = s; msg.target = { name: target.name, avatar: target.avatar }; ev = `${tag(p)} 🦝 ${tag(target)} −${s} 💎`; send(target.ws, { t: 'hit', kind: 'steal', by: { name: p.name, avatar: p.avatar }, amount: s, score: target.score }); }
    else if (kind === 'swap' && target) { [p.score, target.score] = [target.score, p.score]; msg.target = { name: target.name, avatar: target.avatar }; ev = `${tag(p)} 🔄 ${tag(target)}`; send(target.ws, { t: 'hit', kind: 'swap', by: { name: p.name, avatar: p.avatar }, score: target.score }); }
    msg.score = p.score;
    p.pending = { kind: 'shown' };
    send(p.ws, msg);
    if (ev) event(r, ev); else pushBoard(r);
  }

  function pick(r, p) {
    if (r.state !== 'playing' || !p.pending || p.pending.kind !== 'chest') return;
    let kind = roll();
    const others = [...r.players.values()].filter(x => x !== p);
    if ((kind === 'steal' && !others.some(x => x.score > 0)) || (kind === 'swap' && !others.length)) kind = 'gain';
    if ((kind === 'lose25' || kind === 'lose50') && p.score < 4) kind = 'nothing';
    if (kind === 'steal' || kind === 'swap') {
      const list = (kind === 'steal' ? others.filter(x => x.score > 0) : others).sort((a, b) => b.score - a.score).slice(0, 8);
      p.pending = { kind: 'target', what: kind, ids: list.map(x => x.id), timer: setTimeout(() => target(r, p, list[crypto.randomInt(list.length)].id), TARGET_TIMEOUT) };
      send(p.ws, { t: 'tpick', kind, players: list.map(x => ({ id: x.id, name: x.name, avatar: x.avatar, score: x.score })), timeout: TARGET_TIMEOUT });
      return;
    }
    apply(r, p, kind);
  }
  function target(r, p, id) {
    if (r.state !== 'playing' || !p.pending || p.pending.kind !== 'target' || !p.pending.ids.includes(id)) return;
    clearTimeout(p.pending.timer);
    const t = r.players.get(id);
    apply(r, p, p.pending.what, t);
  }
  function next(r, p) {
    if (r.state !== 'playing' || !p.pending) return;
    if (p.pending.kind === 'wait' && Date.now() < p.pending.until - 150) return;
    if (p.pending.kind === 'wait' || p.pending.kind === 'shown') nextQuestion(r, p);
  }

  function finish(r) {
    if (r.state === 'ended') return;
    clearTimeout(r.timer); clearTimeout(r.boardTimer);
    for (const p of r.players.values()) if (p.pending && p.pending.timer) clearTimeout(p.pending.timer);
    r.state = 'ended';
    const rank = ranking(r);
    const report = {
      title: r.title, mode: 'treasure', total: r.questions.length, minutes: r.minutes,
      questions: r.questions.map((qq, i) => ({ prompt: qq.prompt || qq.speak, type: qq.type, answerText: Q.answerText(qq), answered: r.qstats[i].answered, correct: r.qstats[i].correct, avgMs: r.qstats[i].answered ? Math.round(r.qstats[i].ms / r.qstats[i].answered) : 0 })),
      players: rank.map((p, i) => ({ rank: i + 1, name: p.name, avatar: p.avatar, score: p.score, correct: p.correctN, tries: p.tries, best: 0, answers: r.questions.map((_, k) => k in p.firstTry ? p.firstTry[k] : null) }))
    };
    const reportId = finishReport(r, report, 'treasure');
    r.endMsg = { t: 'end', podium: rank.slice(0, 3).map(p => ({ name: p.name, avatar: p.avatar, score: p.score })), reportId, players: rank.length, unit: '💎' };
    send(r.host, r.endMsg);
    rank.forEach((p, i) => {
      p.reward = { id: `${r.pin}-${p.id}`, cards: C.draw(r.subject, r.questions, i < 3 ? 2 : 1) };
      S.award(p.studentId, p.reward);
      send(p.ws, { t: 'end', rank: i + 1, of: rank.length, score: p.score, correct: p.correctN, total: p.tries, unit: '💎', mode: 'treasure', reward: p.reward });
    });
  }

  // 断线重连：补发当前状态
  function resync(r, p) {
    if (r.state === 'lobby') return send(p.ws, { t: 'wait' });
    if (r.state === 'ended') return send(p.ws, { t: 'end', rank: ranking(r).indexOf(p) + 1, of: r.players.size, score: p.score, correct: p.correctN, total: p.tries, unit: '💎', mode: 'treasure', reward: p.reward });
    if (p.score == null) { p.score = 0; p.correctN = 0; p.tries = 0; } // 开局后才加入的学生
    const k = p.pending && p.pending.kind;
    if (k === 'chest') return send(p.ws, { t: 'tres', correct: true });
    if (k === 'target') { const list = p.pending.ids.map(id => r.players.get(id)).filter(Boolean); return send(p.ws, { t: 'tpick', kind: p.pending.what, players: list.map(x => ({ id: x.id, name: x.name, avatar: x.avatar, score: x.score })), timeout: TARGET_TIMEOUT }); }
    nextQuestion(r, p);
  }
  function resyncHost(r) {
    if (r.state === 'playing') { send(r.host, { t: 'tstart', endsAt: r.endsAt, now: Date.now(), minutes: r.minutes }); pushBoard(r); }
    else if (r.state === 'ended') send(r.host, r.endMsg);
  }

  return { start, answer, pick, target, next, finish, resync, resyncHost };
};
