// 从 lucide-static 挑出用到的图标，生成 public/icons.svg（SVG sprite）
// 用法：node scripts/build-icons.js；在页面里用 VA.icon('名字')
const fs = require('fs');
const path = require('path');
const ICONS = [
  'play', 'pencil', 'trash-2', 'copy', 'volume-2', 'volume-x', 'lock', 'lock-open', 'skip-forward', 'square', 'users', 'chart-column',
  'clipboard-list', 'send', 'link', 'qr-code', 'download', 'upload', 'rotate-ccw', 'undo-2', 'arrow-up', 'arrow-down', 'image', 'save',
  'lightbulb', 'timer', 'triangle-alert', 'check', 'x', 'shield', 'mail', 'search', 'ban', 'zap', 'arrow-left', 'arrow-right', 'trophy',
  'flame', 'gem', 'swords', 'layers', 'sparkles', 'repeat', 'graduation-cap', 'presentation', 'gamepad-2', 'school', 'book-open',
  'languages', 'calculator', 'type', 'flask-conical', 'message-square-text', 'message-circle-more', 'plus', 'log-out', 'music', 'puzzle',
  'sigma', 'percent', 'shapes', 'clock-3', 'award', 'hourglass', 'user', 'crown', 'medal', 'list-ordered', 'circle-help'
];
const dir = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const symbols = ICONS.map(name => {
  const svg = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
  const inner = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<symbol id="${name}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/\s*\n\s*/g, '')}</g></symbol>`;
});
const out = `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide icons (ISC License) https://lucide.dev — 由 scripts/build-icons.js 生成，不要手改 -->${symbols.join('')}</svg>\n`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'icons.svg'), out);
fs.copyFileSync(path.join(__dirname, '..', 'node_modules', 'lucide-static', 'LICENSE'), path.join(__dirname, '..', 'public', 'icons.LICENSE.txt'));
console.log(`icons.svg：${ICONS.length} 个图标，${(out.length / 1024).toFixed(1)} KB`);
