// 用 SiliconFlow（Qwen-Image）生成收集卡插画 → public/card-art/<id>.webp
// 用法：SILICONFLOW_API_KEY=... node scripts/gen-card-art.js [id ...]   （不传 id 就补齐缺的）
//      加 --force 重画已有的
const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_PATH || '/Users/haibinzhu/Desktop/工具开发/board-game-studio/node_modules/sharp');
const { SETS } = require('../public/data/cards.js');

const KEY = process.env.SILICONFLOW_API_KEY;
if (!KEY) { console.error('缺少 SILICONFLOW_API_KEY'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'public', 'card-art');
fs.mkdirSync(OUT, { recursive: true });

// 统一的品牌画风：万花筒切面 + 夜空底 + 品牌六色
const STYLE = 'KaleidoQuest collectible trading card illustration. Cute, friendly chibi character, centered, full body, facing viewer, big expressive eyes. ' +
  'Built from faceted kaleidoscope geometry: crystal facets, triangles and hexagons, mirrored symmetric patterns. Flat vector art with soft gradients and gentle glow, clean shapes, thick rounded silhouette. ' +
  'Colour palette: violet #7c3aed, teal #0891b2, amber #f59e0b, magenta #db2777, green #16a34a, on a deep midnight navy #0e0b26 background with a soft radial kaleidoscope glow behind the character. ' +
  'Children\'s educational game art, premium, consistent series style. Absolutely no text, no letters, no numbers written, no watermark, no border, no frame.';
const SET_STYLE = {
  math: 'Series "Number Beasts": a small magical creature whose body is made of mathematical shapes. Dominant colours violet and amber.',
  science: 'Series "Science Sprites": a small glowing elemental sprite embodying a science concept. Dominant colours teal and green.',
  explorer: 'Series "Explorers": a young adventurer mascot companion badge character. Dominant colours amber and magenta.'
};
// 每张卡画什么（只描述画面，不让模型写字）
const SUBJECT = {
  zero: 'a round ring-shaped creature, a hollow glowing circle body like a donut, curious and humble',
  pi: 'a round pie creature with a golden crust, an endless spiral swirl pattern on top',
  prime: 'a sturdy brick golem made of a few indivisible solid blocks that cannot be split',
  fib: 'a sunflower creature whose face is a golden spiral of seeds, petals like a mane',
  square: 'a cube-shaped creature made of a neat grid of glowing dots arranged in a square',
  triangle: 'a creature built from a triangular stack of glowing orbs, like a bowling pin pyramid',
  infinity: 'a serpent-like creature looping in a figure-eight infinity shape, shimmering',
  negative: 'a chilly ice creature below a thermometer line, frosty blue, shivering cutely',
  fraction: 'a pizza creature with slices that separate into equal parts, cheerful',
  percent: 'a creature holding a full progress bar, two round orbs separated by a slash on its chest',
  right: 'a set-square triangle ruler creature with a perfect square corner, precise and neat',
  hexagon: 'a bee creature with a honeycomb hexagon body pattern',
  symmetry: 'a butterfly creature with perfectly mirrored kaleidoscope wings',
  ten: 'a creature with two open hands showing ten fingers, counting happily',
  binary: 'a tiny robot creature made of glowing on and off light switches, pixel eyes',
  sixty: 'a round clock creature with a sixty-tick dial face and moving hands',
  h: 'a tiny bright sun sprite, the smallest and lightest, a single glowing core with one orbiting dot',
  he: 'a floating balloon sprite, light and bubbly, drifting upward',
  c: 'a diamond crystal sprite next to a pencil-graphite shard, faceted and sparkling',
  o: 'an airy bubble sprite breathing out fresh air swirls, lungs-shaped leaves',
  n: 'a swirling wind sprite made of gentle gusts, mostly invisible, misty',
  fe: 'a sturdy metallic iron sprite with a red-orange warm glow, magnetic sparks',
  au: 'a shiny gold nugget sprite wearing a tiny crown, gleaming',
  water: 'a water droplet sprite with wavy edges, splashing, three states swirling around it',
  light: 'a light bulb sprite splitting a beam into a rainbow through a prism',
  sound: 'a speaker sprite emitting concentric sound wave rings',
  magnet: 'a horseshoe magnet sprite with red and blue tips pulling tiny metal stars',
  photo: 'a leaf sprite soaking up sunlight and releasing oxygen bubbles',
  cell: 'a round cell sprite with a visible nucleus, under a magnifying lens glow',
  gravity: 'an apple sprite falling with the moon orbiting in the background',
  evap: 'a fluffy cloud sprite rising from warm water, raindrops below',
  fossil: 'a friendly baby dinosaur skeleton sprite emerging from layered rock',
  compass: 'a young explorer kid with a backpack holding a glowing compass',
  streak: 'a flame spirit mascot with a fiery streak trail, energetic',
  flash: 'a lightning bolt mascot with speed lines, fast and sharp',
  owl: 'a wise owl with round glasses reading a glowing book',
  turtle: 'a steady smiling turtle with a hexagon-patterned shell, walking forward',
  target: 'an archer mascot hitting the bullseye of a round target',
  rocket: 'a small rocket mascot blasting off with a sparkle trail',
  key: 'an ornate glowing key mascot unlocking a tiny door of light',
  gem: 'a treasure hunter mascot holding a big faceted gem above an open chest',
  book: 'a bookworm caterpillar wearing glasses peeking out of a stack of books',
  rainbow: 'a rainbow spirit arching over a kaleidoscope, every colour band shining',
  crown: 'a champion mascot on a winner podium wearing a golden crown, confetti'
};

async function gen(set, id) {
  const prompt = `${STYLE} ${SET_STYLE[set]} Subject: ${SUBJECT[id]}.`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.siliconflow.cn/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen/Qwen-Image', prompt, negative_prompt: 'text, letters, words, numbers, watermark, signature, frame, border, blurry, realistic photo, scary', image_size: '1328x1328', batch_size: 1 })
      });
      const d = await r.json();
      const url = d.images && d.images[0] && d.images[0].url;
      if (!url) throw new Error(JSON.stringify(d).slice(0, 200));
      const img = Buffer.from(await (await fetch(url)).arrayBuffer());
      const { width: w, height: h } = await sharp(img).metadata();
      await sharp(img).extract({ left: Math.round(w * .1), top: Math.round(h * .1), width: Math.round(w * .8), height: Math.round(h * .8) }).resize(512, 512).webp({ quality: 82 }).toFile(path.join(OUT, `${id}.webp`));
      return true;
    } catch (e) { console.error(`  ${id} 第 ${attempt} 次失败：${e.message}`); }
  }
  return false;
}

(async () => {
  const args = process.argv.slice(2), force = args.includes('--force'), only = args.filter(a => !a.startsWith('--'));
  const jobs = [];
  for (const [set, s] of Object.entries(SETS)) for (const c of s.cards) {
    const id = c[0];
    if (only.length && !only.includes(id)) continue;
    if (!force && !only.length && fs.existsSync(path.join(OUT, `${id}.webp`))) continue;
    jobs.push([set, id]);
  }
  console.log(`要生成 ${jobs.length} 张`);
  // 同时跑 3 个
  let i = 0, ok = 0;
  await Promise.all([0, 1, 2].map(async () => { while (i < jobs.length) { const [set, id] = jobs[i++]; if (await gen(set, id)) { ok++; console.log(`✓ ${id}`); } } }));
  console.log(`完成 ${ok}/${jobs.length}`);
})();
