// 收集卡（非华文）：数学「数兽」、科学「元素精灵」、通用「探索者」
// 华文「字灵」由服务器根据本局出现的汉字生成（lib/cards.js）
// 每张：[id, emoji, 中文名, 英文名, 稀有度 c/r/e, 中文知识点, 英文知识点]
(function (root) {
  const SETS = {
    math: { zh: '数兽', en: 'Number Beasts', cards: [
      ['zero', '0️⃣', '零', 'Zero', 'r', '有了 0，同一个 1 放在不同位置就能变成 10、100、1000。', 'Zero lets the same 1 become 10, 100 or 1000 just by its place.'],
      ['pi', '🥧', '圆周率 π', 'Pi', 'e', '任何圆的周长 ÷ 直径都约等于 3.14159…，小数永远写不完。', 'Any circle’s circumference ÷ diameter ≈ 3.14159… and the digits never end.'],
      ['prime', '🧱', '质数', 'Prime', 'r', '只能被 1 和自己整除的数，比如 2、3、5、7。2 是唯一的偶数质数。', 'Divisible only by 1 and itself: 2, 3, 5, 7… 2 is the only even prime.'],
      ['fib', '🌻', '斐波那契数', 'Fibonacci', 'e', '1、1、2、3、5、8…每个数都是前两个数的和，向日葵的花盘里也能找到它们。', '1, 1, 2, 3, 5, 8… each is the sum of the two before. Look for them in sunflowers.'],
      ['square', '🟪', '平方数', 'Square numbers', 'c', '1、4、9、16…这些数的点可以排成正方形。', '1, 4, 9, 16… these dots can form a square.'],
      ['triangle', '🔺', '三角形数', 'Triangular numbers', 'c', '1、3、6、10…这些数的点可以排成三角形。', '1, 3, 6, 10… these dots can form a triangle.'],
      ['infinity', '♾️', '无限', 'Infinity', 'e', '数永远数不完：再大的数加上 1，还会更大。', 'Numbers never end: add 1 to any number and it gets bigger.'],
      ['negative', '🥶', '负数', 'Negative numbers', 'c', '比 0 还小的数。零下 5 度就写成 −5 °C。', 'Numbers below zero — 5 degrees below zero is −5 °C.'],
      ['fraction', '🍕', '分数', 'Fractions', 'c', '把一个整体平均分。1/2 就是分成 2 份，取其中 1 份。', 'Sharing a whole equally: 1/2 means 1 of 2 equal parts.'],
      ['percent', '💯', '百分数', 'Percent', 'c', '50% 就是 100 份里的 50 份，也就是一半。', '50% means 50 out of 100 — exactly half.'],
      ['right', '📐', '直角', 'Right angle', 'c', '90 度的角。书本和桌子的角通常都是直角。', 'A 90-degree angle, like the corner of a book or a table.'],
      ['hexagon', '🐝', '六边形', 'Hexagon', 'r', '蜂巢用六边形，能用最少的蜂蜡围出最多的空间。', 'Bees build hexagons: the most space for the least wax.'],
      ['symmetry', '🦋', '对称', 'Symmetry', 'c', '沿着一条线对折，两边完全重合。蝴蝶的翅膀就是对称的。', 'Fold along a line and both halves match — like butterfly wings.'],
      ['ten', '🖐️', '十进制', 'Base ten', 'c', '我们用 0–9 十个数字来记数，很可能是因为人有十根手指。', 'We count with ten digits 0–9 — probably because we have ten fingers.'],
      ['binary', '💻', '二进制', 'Binary', 'r', '电脑只用 0 和 1 两个数字来表示所有信息。', 'Computers store everything using only 0 and 1.'],
      ['sixty', '⏰', '六十进制', 'Base sixty', 'r', '1 小时 60 分钟、1 分钟 60 秒，这种以 60 计数的方法来自古巴比伦。', '60 minutes, 60 seconds — counting in sixties comes from ancient Babylon.']
    ] },
    science: { zh: '元素精灵', en: 'Science Sprites', cards: [
      ['h', '☀️', '氢', 'Hydrogen', 'r', '宇宙里最多的元素。太阳靠氢的核聚变发光发热。', 'The most common element in the universe. The Sun shines by fusing hydrogen.'],
      ['he', '🎈', '氦', 'Helium', 'c', '比空气轻，所以氦气球会往上飘。', 'Lighter than air, so helium balloons float up.'],
      ['c', '💎', '碳', 'Carbon', 'e', '铅笔芯里的石墨和钻石都是碳，只是原子排列方式不同。', 'Pencil graphite and diamonds are both carbon, arranged differently.'],
      ['o', '🫁', '氧', 'Oxygen', 'c', '我们呼吸需要的气体，大约占空气的五分之一。', 'The gas we breathe — about one fifth of the air.'],
      ['n', '🌬️', '氮', 'Nitrogen', 'c', '空气里最多的气体，大约占五分之四。', 'The most common gas in air — about four fifths.'],
      ['fe', '🩸', '铁', 'Iron', 'r', '血液里的血红蛋白含有铁，它负责把氧气送到全身。', 'Iron in haemoglobin helps blood carry oxygen around your body.'],
      ['au', '👑', '金', 'Gold', 'e', '金几乎不会生锈，所以几千年前的金器到今天还闪闪发亮。', 'Gold hardly corrodes, so ancient gold still shines today.'],
      ['water', '💧', '水', 'Water', 'c', '地球表面大约 71% 被水覆盖。', 'About 71% of Earth’s surface is covered by water.'],
      ['light', '💡', '光', 'Light', 'e', '光一秒钟大约能绕地球七圈半。', 'Light could circle the Earth about seven and a half times in one second.'],
      ['sound', '🔊', '声音', 'Sound', 'r', '声音在水里传播的速度比在空气里快四倍多。', 'Sound travels more than four times faster in water than in air.'],
      ['magnet', '🧲', '磁铁', 'Magnet', 'c', '同极相斥，异极相吸。地球本身也像一块大磁铁。', 'Like poles repel, opposite poles attract — Earth is a giant magnet too.'],
      ['photo', '🌿', '光合作用', 'Photosynthesis', 'r', '植物用阳光、水和二氧化碳制造养分，同时放出氧气。', 'Plants use sunlight, water and CO₂ to make food — and release oxygen.'],
      ['cell', '🔬', '细胞', 'Cell', 'r', '所有生物都由细胞组成，人体大约有几十万亿个细胞。', 'All living things are made of cells — tens of trillions in your body.'],
      ['gravity', '🍎', '重力', 'Gravity', 'c', '让苹果往下掉，也让月亮一直绕着地球转。', 'It makes apples fall and keeps the Moon circling Earth.'],
      ['evap', '☁️', '蒸发', 'Evaporation', 'c', '水受热变成水蒸气升到空中，冷却后变成云，再落下成雨。', 'Warm water turns to vapour, cools into clouds, and falls as rain.'],
      ['fossil', '🦖', '化石', 'Fossil', 'e', '埋在岩石里几百万年的生物遗迹，我们就是靠化石认识恐龙的。', 'Traces of life kept in rock for millions of years — how we know dinosaurs.']
    ] },
    explorer: { zh: '探索者', en: 'Explorers', cards: [
      ['compass', '🧭', '小小探索者', 'Explorer', 'c', '每一次答题都是一次探索。', 'Every question is a new adventure.'],
      ['streak', '🔥', '连对达人', 'Streak Master', 'r', '连续答对，手感正热！', 'On a roll — keep the streak going!'],
      ['flash', '⚡', '闪电手', 'Lightning Hands', 'r', '又快又准，是你的风格。', 'Fast and accurate — that’s your style.'],
      ['owl', '🦉', '智慧猫头鹰', 'Wise Owl', 'r', '想清楚再作答，答得更稳。', 'Think first, answer well.'],
      ['turtle', '🐢', '稳稳龟', 'Steady Turtle', 'c', '慢一点没关系，每一步都算数。', 'Slow is fine — every step counts.'],
      ['target', '🎯', '神射手', 'Sharpshooter', 'r', '瞄准目标，一击即中。', 'Aim, answer, bullseye.'],
      ['rocket', '🚀', '火箭', 'Rocket', 'c', '今天比昨天进步一点点，就是在起飞。', 'A little better than yesterday is lift-off.'],
      ['key', '🗝️', '钥匙', 'Key', 'c', '每学会一个知识点，就多一把打开世界的钥匙。', 'Every idea you learn is a key to the world.'],
      ['gem', '💎', '宝石猎人', 'Gem Hunter', 'r', '在夺宝里眼疾手快。', 'Quick hands in Treasure Quest.'],
      ['book', '📚', '书虫', 'Bookworm', 'c', '读得越多，懂得越多。', 'The more you read, the more you know.'],
      ['rainbow', '🌈', '彩虹', 'Rainbow', 'e', '万花筒里的每一种颜色，都是一门课。', 'Every colour in the kaleidoscope is a subject.'],
      ['crown', '👑', '冠军', 'Champion', 'e', '站上领奖台的感觉真好！', 'Nothing beats the top of the podium!']
    ] }
  };
  const out = { SETS, RARITY: { c: ['普通', 'Common'], r: ['稀有', 'Rare'], e: ['史诗', 'Epic'] } };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.KQ_CARDS = out;
})(this);
