// 用 SiliconFlow（Qwen-Image）生成游戏库封面 → public/gallery-covers/<id>.webp（16:9）
// 用法：SILICONFLOW_API_KEY=... node scripts/gen-gallery-covers.js [id ...] [--force]
const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_PATH || '/Users/haibinzhu/Desktop/工具开发/board-game-studio/node_modules/sharp');
const GAL = require('../lib/data/gallery.json');

const KEY = process.env.SILICONFLOW_API_KEY;
if (!KEY) { console.error('缺少 SILICONFLOW_API_KEY'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'public', 'gallery-covers');
fs.mkdirSync(OUT, { recursive: true });

// 和收集卡同一套画风
const STYLE = 'Wide landscape scene illustration (an illustration only, never a title card or logo). Cute friendly chibi characters built from faceted kaleidoscope geometry (crystal facets, triangles, hexagons), flat vector art with soft gradients and gentle glow. ' +
  'Brand palette: violet #7c3aed, teal #0891b2, amber #f59e0b, magenta #db2777, green #16a34a on a deep midnight navy #0e0b26 background with soft kaleidoscope light. Lively, playful, children\'s educational game, clean composition with the main scene centred. ' +
  'Absolutely no text, no title, no logo, no letters, no words, no numbers written anywhere, no watermark, no border.';
const SCENE = {
  'zh-animals': 'a group of cute animals (panda, cat, rabbit, tiger, bird) sitting together around a glowing scroll',
  'zh-parts': 'a crystal character assembling glowing puzzle pieces shaped like brush strokes into a square tile',
  'zh-tones': 'four musical waves of different shapes (flat, rising, dipping, falling) floating above a happy singing character',
  'zh-idioms': 'an ancient Chinese storybook opening with tiny scenes popping out: a rabbit and a tree stump, a painted snake',
  'zh-measure': 'a character neatly sorting objects into groups: books, fish, flowers, pencils on shelves',
  'm-20': 'a cheerful character juggling glowing dots and counting beads on an abacus',
  'm-times': 'a rocket made of a multiplication grid of glowing squares blasting off',
  'm-fractions': 'a pizza and a chocolate bar split into equal glowing parts, a character sharing slices with friends',
  'm-order': 'characters standing on stairs of different heights, arranged from shortest to tallest',
  'm-word': 'a market stall with fruits, coins and a shopping basket, a character thinking with a lightbulb',
  'en-spelling': 'animals (cat, elephant, giraffe, penguin) playing with smooth plain coloured toy blocks that have no markings',
  'en-words': 'a friendly dictionary book character with pages flying out as colourful butterflies',
  'en-tenses': 'a character walking through three glowing doors: a clock of yesterday, today and tomorrow',
  'en-sentences': 'a cheerful toy train of plain colourful carriages with completely plain sides, crystal characters riding on top',
  'en-plurals': 'one cute mouse becoming many mice, one box becoming many boxes, playful multiplying',
  'sci-living': 'a crystal explorer with a magnifying glass looking at a butterfly, a frog, a mushroom and a bird',
  'sci-plants': 'a sunflower with visible roots, stem, leaves and flower, a seed sprouting beside it, sunlight rays',
  'sci-matter': 'an ice cube, a water droplet and a puff of steam as three cute characters holding hands',
  'sci-body': 'a friendly cartoon heart, lungs and brain characters waving together, playful and not scary',
  'sci-forces': 'a horseshoe magnet pulling stars, a flashlight casting a shadow, a ball rolling down a ramp',
  'g-singapore': 'Singapore skyline at night with Marina Bay, Merlion fountain and Gardens by the Bay supertrees, friendly characters waving',
  'g-world': 'a globe with famous landmarks around it (pyramid, Eiffel tower, Great Wall), a character with a passport',
  'g-festivals': 'festival celebration with lanterns, oil lamps, fireworks and mooncakes, characters celebrating together',
  'g-health': 'characters with fruits and vegetables, a water bottle, toothbrush and a skipping rope, healthy and happy',
  'g-space': 'a little astronaut character floating among planets, a rocket and the moon, stars sparkling'
};

async function gen(id) {
  const prompt = `${STYLE} Scene: ${SCENE[id]}.`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.siliconflow.cn/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen/Qwen-Image', prompt, negative_prompt: 'text, title, logo, brand name, letters, words, numbers, chinese characters, watermark, signature, frame, border, blurry, realistic photo, scary', image_size: '1664x928', batch_size: 1 })
      });
      const d = await r.json();
      const url = d.images && d.images[0] && d.images[0].url;
      if (!url) throw new Error(JSON.stringify(d).slice(0, 200));
      const img = Buffer.from(await (await fetch(url)).arrayBuffer());
      // 裁掉四周一圈：去掉偶尔出现的边框和角落的平台标记
      const { width: w, height: h } = await sharp(img).metadata();
      await sharp(img).extract({ left: Math.round(w * .06), top: Math.round(h * .08), width: Math.round(w * .88), height: Math.round(h * .84) }).resize(640, 360).webp({ quality: 80 }).toFile(path.join(OUT, `${id}.webp`));
      return true;
    } catch (e) { console.error(`  ${id} 第 ${attempt} 次失败：${e.message}`); }
  }
  return false;
}

(async () => {
  const args = process.argv.slice(2), force = args.includes('--force'), only = args.filter(a => !a.startsWith('--'));
  const jobs = GAL.map(g => g.id).filter(id => only.length ? only.includes(id) : force || !fs.existsSync(path.join(OUT, `${id}.webp`)));
  console.log(`要生成 ${jobs.length} 张`);
  let i = 0, ok = 0;
  await Promise.all([0, 1, 2].map(async () => { while (i < jobs.length) { const id = jobs[i++]; if (await gen(id)) { ok++; console.log(`✓ ${id}`); } } }));
  console.log(`完成 ${ok}/${jobs.length}`);
})();
