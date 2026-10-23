// 头像：动物 emoji，或者收集到的卡片角色 card:<id>（文字场景仍用 emoji；华文字灵没有插画，不能当头像）
const AVATARS = ['🐼', '🦊', '🐯', '🐲', '🦁', '🐨', '🐸', '🐵', '🦄', '🐧', '🐙', '🦉', '🐢', '🐳', '🦋', '🐰', '🐻', '🐹', '🐮', '🐷', '🐔', '🦖', '🐬', '🦜', '🐝', '🦀', '🐺', '🦒', '🦓', '🐘'];
const CARD_IDS = new Set(Object.values(require('../public/data/cards.js').SETS).flatMap(s => s.cards.map(c => c[0])));
const cardAvatar = a => { const m = /^card:([a-z0-9]{1,20})$/.exec(String(a || '')); return m && CARD_IDS.has(m[1]) ? a : null; };
const isEmoji = a => AVATARS.includes(a);

module.exports = { AVATARS, cardAvatar, isEmoji };
