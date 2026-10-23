// 收集卡：每局结束发卡。华文从本局出现的汉字里抽「字灵」，其他学科从固定卡池按稀有度抽
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SETS } = require('../public/data/cards.js');
const ETY = require('./data/hanzi-ety.json');

// hanzi-data.js 是给浏览器用的（window.HANZI_DATA = {...}），这里直接取出 JSON
const HANZI = (() => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'hanzi-data.js'), 'utf8');
  return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
})();
const isHan = c => /[㐀-鿿]/.test(c);
const POOL = { math: 'math', science: 'science' };
const pick = a => a[crypto.randomInt(a.length)];

function zhCard(ch) {
  const d = HANZI[ch]; if (!d) return null;
  const e = ETY[ch], strokes = d[1];
  return { id: 'zh:' + ch, set: 'zh', ch, rarity: strokes >= 12 ? 'e' : strokes >= 7 ? 'r' : 'c', radical: d[0], strokes, structure: d[2] || '', parts: d[3] || '', ety: e ? { t: e[0], hint: e[1], sem: e[2], pho: e[3] } : null };
}
function poolCard(set, row) {
  const [id, emoji, zh, en, rarity, fzh, fen] = row;
  return { id: `${set}:${id}`, set, emoji, name: [zh, en], rarity, fact: [fzh, fen] };
}
function rarity() { const x = crypto.randomInt(100); return x < 5 ? 'e' : x < 30 ? 'r' : 'c'; }

// 本局的生字：选项、答案、朗读内容、题干里「」括起来的部分（「怎么读」这类题干套话和「第一声」选项不算）
function charsIn(questions) {
  const han = t => [...new Set([...t].filter(c => isHan(c) && HANZI[c]))];
  const core = han(questions.map(q => [q.speak, ...(q.options || []).filter(o => !/^第[一二三四]声/.test(o)), ...(Array.isArray(q.answer) ? q.answer.filter(a => typeof a === 'string') : []), ...((q.prompt || '').match(/「[^」]*」/g) || [])].join('')).join(''));
  return core.length ? core : han(questions.map(q => q.prompt || '').join(''));
}

function draw(subject, questions, n) {
  if (subject === 'chinese') {
    const chars = charsIn(questions);
    if (chars.length) {
      const out = new Set();
      while (out.size < Math.min(n, chars.length)) out.add(pick(chars));
      return [...out].map(zhCard);
    }
  }
  const set = POOL[subject] || 'explorer', cards = SETS[set].cards;
  return Array.from({ length: n }, () => { const r = rarity(), list = cards.filter(c => c[4] === r); return poolCard(set, pick(list.length ? list : cards)); });
}

// 按 id 重建卡片（合并本机卡册用）：只认真实存在的卡，内容以服务器为准
function cardById(id) {
  const [set, key] = String(id).split(':');
  if (set === 'zh') return key && [...key].length === 1 ? zhCard(key) : null;
  const row = SETS[set] && SETS[set].cards.find(c => c[0] === key);
  return row ? poolCard(set, row) : null;
}

module.exports = { draw, zhCard, charsIn, cardById };
