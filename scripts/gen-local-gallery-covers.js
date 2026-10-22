const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_PATH || '/Users/haibinzhu/Desktop/工具开发/board-game-studio/node_modules/sharp');

const OUT = path.join(__dirname, '..', 'public', 'gallery-covers');
fs.mkdirSync(OUT, { recursive: true });

const covers = {
  'zh-story': ['看图讲故事', 'STORY STARTERS', '#7c3aed', '✦  ◇  ✧  ◇  ✦', '◒  ◓  ◒'],
  'm-money': ['小小理财家', 'MONEY MATTERS', '#0891b2', '$  ¥  €  ¢', '◆  ◇  ◆  ◇'],
  'sci-weather': ['天气观察站', 'WEATHER WATCH', '#16a34a', '☼  ☁  ☂  ✦', '≈  ≈  ≈  ≈'],
  'hw-culture': ['万圣节探险', 'HALLOWEEN ADVENTURE', '#f59e0b', '☾  ✦  ☽  ✦', '♢  ◇  ♢  ◇'],
  'hw-english': ['Halloween word hunt', 'HALLOWEEN WORD HUNT', '#db2777', '☾  ✧  ☾  ✧', '✦  ◇  ✦  ◇']
};

function svg([title, subtitle, accent, symbols, bottom]) {
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0e0b26"/><stop offset="1" stop-color="#241449"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1280" height="720" fill="url(#bg)"/><circle cx="1080" cy="150" r="250" fill="url(#glow)" opacity=".45"/><circle cx="150" cy="610" r="220" fill="url(#glow)" opacity=".22"/>
  <g fill="none" stroke="${accent}" stroke-opacity=".3" stroke-width="3"><path d="M0 560L280 300l210 170 220-250 570 360"/><path d="M40 120l190 160 230-210 260 210 220-160"/><path d="M820 70l75 110 130-15 75 105"/></g>
  <g fill="${accent}" opacity=".9"><circle cx="190" cy="170" r="12"/><circle cx="1030" cy="550" r="9"/><circle cx="1160" cy="320" r="15"/></g>
  <text x="90" y="150" fill="#fff" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="6">KALEIDOQUEST</text>
  <text x="90" y="260" fill="#fff" font-family="Arial, sans-serif" font-size="64" font-weight="800">${safe}</text>
  <text x="94" y="315" fill="${accent}" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="4">${subtitle}</text>
  <text x="90" y="475" fill="#fff" opacity=".9" font-family="Arial, sans-serif" font-size="58" letter-spacing="14">${symbols}</text>
  <text x="90" y="620" fill="#fff" opacity=".6" font-family="Arial, sans-serif" font-size="32" letter-spacing="12">${bottom}</text>
  <g transform="translate(1040 500)"><polygon points="0,80 70,0 140,80 70,160" fill="${accent}" opacity=".9"/><polygon points="70,0 140,80 70,80" fill="#fff" opacity=".25"/><polygon points="0,80 70,80 70,160" fill="#000" opacity=".18"/></g>
</svg>`;
}

(async () => {
  for (const [id, data] of Object.entries(covers)) {
    await sharp(Buffer.from(svg(data))).resize(640, 360).webp({ quality: 82 }).toFile(path.join(OUT, `${id}.webp`));
    console.log(`✓ ${id}`);
  }
})();
