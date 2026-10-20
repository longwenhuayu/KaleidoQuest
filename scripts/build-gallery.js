// 生成 Gallery 题包（lib/data/gallery.json）：5 个学科 × 5 个游戏 + 节日专题（lib/data/collections.json）
// 拼音用 pinyin-pro 按上下文注音，部件拼字用 Make Me a Hanzi 数据；选项打乱用固定种子，每次生成结果一样
// 用法：node scripts/build-gallery.js
const fs = require('fs');
const path = require('path');
const P = require('pinyin-pro');
const Q = require('../lib/questions');

const HANZI = (() => { const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'hanzi-data.js'), 'utf8'); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); })();
let seed = 20261020;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const py = w => P.pinyin(w);

// 选择题：正确项 + 干扰项，打乱
function mcq(prompt, right, wrong, extra = {}) {
  const opts = shuffle([right, ...wrong.filter(w => w !== right).slice(0, 3)]);
  return { type: 'mcq', prompt, options: opts, answer: [opts.indexOf(right)], time: 20, ...extra };
}
const others = (w, pool, n = 3) => shuffle(pool.filter(x => x !== w)).slice(0, n);
const tf = (prompt, answer, extra = {}) => ({ type: 'tf', prompt, answer, time: 15, ...extra });
const input = (prompt, answer, extra = {}) => ({ type: 'input', prompt, answer: [].concat(answer).map(String), time: 30, ...extra });
const order = (prompt, items, extra = {}) => ({ type: 'order', prompt, options: items, time: 30, ...extra });

const SETS = [];
const add = (id, subject, grade, title, desc, questions, collection) => SETS.push({ id, subject, grade, title, desc, questions, ...(collection ? { collection } : {}) });

// ── 华文 ──
{
  const animals = ['熊猫', '大象', '狮子', '老虎', '猴子', '兔子', '企鹅', '海豚', '蝴蝶', '青蛙', '乌龟', '长颈鹿'];
  const qs = [];
  shuffle(animals).slice(0, 4).forEach(w => qs.push(mcq('听一听，选出你听到的字词', w, others(w, animals), { speak: w, lang: 'zh-CN' })));
  shuffle(animals).slice(0, 4).forEach(w => qs.push(mcq(py(w), w, others(w, animals), { note: `${w} ${py(w)}` })));
  add('zh-animals', 'chinese', ['小一 – 小二', 'P1 – P2'], ['动物认读', 'Animal words'], ['听音选字、看拼音选字，认识 12 种动物', 'Listen or read pinyin to find the animal'], qs);
}
{
  const chars = ['好', '明', '林', '休', '妈', '吗', '男', '字', '安', '想', '河', '江'];
  const ok = chars.filter(c => { const d = HANZI[c]; return d && d[2] && d[2] !== '⿻' && d[3] && !d[3].includes('？'); });
  const qs = ok.slice(0, 8).map(c => mcq(`${[...HANZI[c][3]].join(' + ')} = ?`, c, others(c, ok), { note: `${[...HANZI[c][3]].join(' + ')} = ${c}（${py(c)}）`, time: 15 }));
  add('zh-parts', 'chinese', ['小一 – 小三', 'P1 – P3'], ['部件拼字', 'Build the character'], ['两个部件拼成一个字：女 + 子 = 好', 'Two parts make one character'], qs);
}
{
  const words = ['熊猫', '学校', '老师', '朋友', '爸爸', '天空', '下雨', '水果'];
  const T = ['第一声 ā', '第二声 á', '第三声 ǎ', '第四声 à'];
  const qs = words.map(w => { const ch = [...w][0], t = +P.pinyin(w, { pattern: 'num', type: 'array' })[0]; return { type: 'mcq', prompt: `「${w}」的「${ch}」读第几声？`, options: T, answer: [t - 1], time: 15, speak: w, lang: 'zh-CN', note: `${w} ${py(w)}` }; });
  add('zh-tones', 'chinese', ['小二 – 小四', 'P2 – P4'], ['声调大挑战', 'Tone challenge'], ['听一听、想一想：这个字读第几声？', 'Which tone is it?'], qs);
}
{
  const idioms = [['一心一意', '专心，只想着一件事'], ['三心二意', '不专心，想这想那'], ['半途而废', '事情做到一半就放弃'], ['画蛇添足', '多做了不必要的事，反而不好'], ['守株待兔', '不努力，只想等好运'], ['亡羊补牢', '出了问题以后赶快补救'], ['井底之蛙', '见识很少的人'], ['对牛弹琴', '说话不看对象']];
  const qs = idioms.map(([w, m]) => mcq(`「${w}」是什么意思？`, m, others(m, idioms.map(x => x[1])), { note: `${w}（${py(w)}）：${m}` }));
  add('zh-idioms', 'chinese', ['小四 – 小六', 'P4 – P6'], ['成语小达人', 'Idiom master'], ['8 个常用成语，选出正确的意思', 'Match common idioms to their meanings'], qs);
}
{
  const mw = [['猫', '只'], ['书', '本'], ['鱼', '条'], ['纸', '张'], ['车', '辆'], ['树', '棵'], ['鞋', '双'], ['伞', '把']];
  const qs = mw.map(([n, m]) => mcq(`一 ___ ${n}`, m, others(m, mw.map(x => x[1])), { note: `一${m}${n}` }));
  add('zh-measure', 'chinese', ['小二 – 小四', 'P2 – P4'], ['量词小超市', 'Measure words'], ['一只猫、一本书……选出正确的量词', 'Pick the right measure word'], qs);
}

// ── 数学 ──
{
  const qs = []; const seen = new Set();
  while (qs.length < 8) {
    const plus = rand() < .5, a = 1 + Math.floor(rand() * 19), b = plus ? Math.floor(rand() * (20 - a + 1)) : Math.floor(rand() * (a + 1));
    const p = plus ? `${a} + ${b} = ?` : `${a} − ${b} = ?`;
    if (seen.has(p)) continue; seen.add(p);
    qs.push(input(p, plus ? a + b : a - b, { time: 20 }));
  }
  add('m-20', 'math', ['小一', 'P1'], ['20 以内加减', 'Add & subtract within 20'], ['口算 8 题，输入答案，越快分越高', 'Mental maths — type the answer'], qs);
}
{
  const qs = [];
  [[7, 8], [6, 9], [8, 4], [9, 9]].forEach(([a, b]) => qs.push(input(`${a} × ${b} = ?`, a * b, { time: 15 })));
  [[6, 7, 42], [8, 8, 63], [9, 4, 36], [7, 7, 48]].forEach(([a, b, c]) => qs.push(tf(`${a} × ${b} = ${c}`, a * b === c, { time: 10 })));
  add('m-times', 'math', ['小二 – 小三', 'P2 – P3'], ['乘法口诀', 'Times tables'], ['填空和判断，熟练乘法口诀', 'Know your times tables'], shuffle(qs));
}
{
  const qs = [
    mcq('哪个分数比较大？', '1/2', ['1/3', '1/4', '1/5']),
    mcq('哪个分数和 1/2 相等？', '2/4', ['2/3', '1/4', '3/4']),
    input('1/4 + 2/4 = ?', ['3/4', '0.75']),
    input('5/6 − 1/6 = ?', ['2/3', '4/6']),
    input('1/2 + 1/4 = ?', ['3/4', '0.75']),
    mcq('把 6/8 化成最简分数', '3/4', ['2/3', '6/8', '1/2']),
    tf('3/5 比 1/2 大', true),
    input('12 的 1/3 是多少？', 4)
  ];
  add('m-fractions', 'math', ['小三 – 小五', 'P3 – P5'], ['分数闯关', 'Fractions'], ['比较、约分、加减，小数和分数都算对', 'Compare, simplify, add and subtract'], qs.map(q => ({ ...q, note: q.note || (q.type === 'input' ? '分数和小数都算对' : undefined) })));
}
{
  const ex = [['2 + 3 × 4', 14], ['(2 + 3) × 4', 20], ['18 ÷ 3 + 2', 8], ['20 − 4 × 3', 8], ['6 × (5 − 2)', 18], ['100 ÷ (4 + 6)', 10], ['7 + 8 ÷ 2', 11], ['3 × 3 + 3 × 3', 18]];
  const qs = ex.map(([e, v]) => mcq(`${e} = ?`, String(v), [String(v + 2), String(v - 1), String(v * 2), String(v + 10)].filter((x, i, a) => a.indexOf(x) === i), { note: '先算括号，再算乘除，最后算加减', time: 25 }));
  add('m-order', 'math', ['小四 – 小六', 'P4 – P6'], ['四则运算顺序', 'Order of operations'], ['先乘除后加减，有括号先算括号', 'Brackets, then × ÷, then + −'], qs);
}
{
  const qs = [
    input('阿里有 24 张贴纸，送给朋友 9 张，还剩多少张？', 15),
    input('一盒鸡蛋有 6 排，每排 8 个，一共有多少个？', 48),
    input('3 支铅笔 1.20 元，1 支铅笔多少元？', ['0.40', '0.4', '$0.40']),
    input('美美有 3/4 个披萨，吃了 1/4 个，还剩多少个？', ['1/2', '0.5', '2/4']),
    input('火车上午 9:15 出发，10:40 到达，一共走了多少分钟？', 85, { time: 45 }),
    input('学校有 120 名学生，其中 1/3 是男生，女生有多少名？', 80, { time: 45 }),
    input('长方形长 7 厘米、宽 5 厘米，面积是多少平方厘米？', 35),
    input('小明每天读 12 页书，读完 84 页要几天？', 7)
  ].map(q => ({ ...q, time: q.time === 30 ? 40 : q.time }));
  add('m-word', 'math', ['小三 – 小六', 'P3 – P6'], ['生活应用题', 'Word problems'], ['购物、时间、面积……用数学解决生活问题', 'Shopping, time, area — maths in real life'], qs);
}

// ── 英文 ──
{
  const words = [['elephant', ['elefant', 'eliphant', 'elephent']], ['giraffe', ['girafe', 'jiraffe', 'giraff']], ['butterfly', ['buterfly', 'butterfli', 'butterflye']], ['crocodile', ['crocodil', 'crokodile', 'crocadile']], ['dolphin', ['dolfin', 'dolphine', 'dalphin']], ['penguin', ['pengiun', 'penguine', 'pinguin']], ['squirrel', ['squirel', 'squirrell', 'squrrel']], ['kangaroo', ['kangeroo', 'kangaru', 'kangarooo']]];
  const qs = words.map(([w, bad]) => mcq('Listen and choose the correct spelling', w, bad, { speak: w, lang: 'en-GB' }));
  add('en-spelling', 'english', ['P2 – P4', 'P2 – P4'], ['Spelling bee: animals', 'Spelling bee: animals'], ['听单词，选出正确拼写', 'Listen, then pick the right spelling'], qs);
}
{
  const qs = [
    mcq('Which word means the SAME as "happy"?', 'glad', ['sad', 'angry', 'tired']),
    mcq('Which word means the SAME as "big"?', 'large', ['tiny', 'thin', 'short']),
    mcq('Which word means the OPPOSITE of "quick"?', 'slow', ['fast', 'rapid', 'swift']),
    mcq('Which word means the OPPOSITE of "ancient"?', 'modern', ['old', 'antique', 'early']),
    mcq('Which word means the SAME as "brave"?', 'courageous', ['afraid', 'nervous', 'shy']),
    mcq('Which word means the OPPOSITE of "tiny"?', 'huge', ['small', 'little', 'mini']),
    mcq('Which word means the SAME as "begin"?', 'start', ['finish', 'stop', 'end']),
    mcq('Which word means the OPPOSITE of "noisy"?', 'quiet', ['loud', 'busy', 'crowded'])
  ];
  add('en-words', 'english', ['P3 – P5', 'P3 – P5'], ['Synonyms & antonyms', 'Synonyms & antonyms'], ['同义词和反义词', 'Words that mean the same — or the opposite'], qs);
}
{
  const qs = [
    mcq('Yesterday, she ___ to the zoo.', 'went', ['go', 'goes', 'going']),
    mcq('He ___ his homework every day.', 'does', ['do', 'did', 'doing']),
    mcq('Look! They ___ football now.', 'are playing', ['play', 'played', 'plays']),
    mcq('I have already ___ my lunch.', 'eaten', ['eat', 'ate', 'eating']),
    mcq('If it rains, we ___ stay at home.', 'will', ['would', 'are', 'did']),
    mcq('She ___ a book when I called her.', 'was reading', ['reads', 'is reading', 'read']),
    mcq('We ___ in Singapore since 2015.', 'have lived', ['live', 'lived', 'are living']),
    mcq('The cake ___ by my mother.', 'was baked', ['baked', 'bakes', 'is baking'])
  ].map(q => ({ ...q, time: 25 }));
  add('en-tenses', 'english', ['P4 – P6', 'P4 – P6'], ['Grammar: tenses', 'Grammar: tenses'], ['选对动词时态', 'Choose the right verb form'], qs);
}
{
  const qs = [
    order('Put the words in order', ['The', 'cat', 'sat', 'on', 'the', 'mat.']),
    order('Put the words in order', ['I', 'like', 'to', 'read', 'books.']),
    order('Put the words in order', ['We', 'went', 'to', 'the', 'park', 'yesterday.']),
    order('Put the words in order', ['My', 'mother', 'cooks', 'dinner', 'every', 'evening.']),
    order('Put the words in order', ['Can', 'you', 'help', 'me,', 'please?']),
    order('Put the story in order', ['Tom woke up.', 'He brushed his teeth.', 'He ate breakfast.', 'He went to school.'], { time: 40 }),
    tf('"i live in singapore." is written correctly.', false, { note: 'I live in Singapore.' }),
    tf('A question ends with a question mark (?).', true)
  ];
  add('en-sentences', 'english', ['P1 – P3', 'P1 – P3'], ['Build a sentence', 'Build a sentence'], ['把单词排成句子，把故事排好顺序', 'Put words and events in order'], qs);
}
{
  const qs = [
    mcq('One child, two ___', 'children', ['childs', 'childrens', 'child']),
    mcq('One mouse, two ___', 'mice', ['mouses', 'mices', 'mouse']),
    mcq('One box, two ___', 'boxes', ['boxs', 'boxies', 'box']),
    mcq('One leaf, two ___', 'leaves', ['leafs', 'leafes', 'leaf']),
    mcq('One tooth, two ___', 'teeth', ['tooths', 'teeths', 'toothes']),
    mcq('___ apple a day keeps the doctor away.', 'An', ['A', 'The', 'Some']),
    mcq('He is ___ honest boy.', 'an', ['a', 'the', 'some']),
    mcq('She wants to study at ___ university.', 'a', ['an', 'some', 'many'], { note: '"university" starts with a "you" sound, so we use "a".' })
  ];
  add('en-plurals', 'english', ['P2 – P4', 'P2 – P4'], ['Plurals & a / an', 'Plurals & a / an'], ['不规则复数、a 和 an 的用法', 'Irregular plurals and articles'], qs);
}

// ── 科学 ──
add('sci-living', 'science', ['P3 – P4', 'P3 – P4'], ['Living things', 'Living things'], ['生物的分类：哺乳动物、鸟类、昆虫……', 'Classify living things'], [
  mcq('Which of these is a mammal?', 'Bat', ['Penguin', 'Frog', 'Shark']),
  mcq('How many legs does an insect have?', '6', ['4', '8', '10']),
  mcq('How many legs does a spider have?', '8', ['6', '4', '10'], { note: 'Spiders are not insects.' }),
  mcq('A mushroom is a ___', 'fungus', ['plant', 'animal', 'bacterium']),
  tf('A whale is a fish.', false, { note: 'A whale is a mammal — it breathes air and feeds its young with milk.' }),
  tf('A penguin is a bird.', true),
  tf('All living things can move from place to place.', false, { note: 'Plants are living things but cannot move from place to place.' }),
  mcq('What do ALL living things need to survive?', 'Food, water and air', ['Only sunlight', 'Only water', 'Soil'])
]);
add('sci-plants', 'science', ['P3 – P5', 'P3 – P5'], ['Plant parts', 'Plant parts'], ['根、茎、叶、花的作用，植物的生命周期', 'Parts of a plant and what they do'], [
  mcq('Which part of the plant takes in water from the soil?', 'Roots', ['Leaves', 'Flowers', 'Fruits']),
  mcq('Which part of the plant makes food?', 'Leaves', ['Roots', 'Stem', 'Seeds']),
  mcq('What carries water from the roots to the leaves?', 'Stem', ['Flower', 'Fruit', 'Seed']),
  mcq('Plants make food using sunlight. This is called ___', 'photosynthesis', ['germination', 'evaporation', 'pollination']),
  mcq('The green substance in leaves is called ___', 'chlorophyll', ['oxygen', 'nectar', 'pollen']),
  tf('A seed needs light to germinate.', false, { note: 'Seeds need water, air and warmth to germinate. Light is needed later to make food.' }),
  mcq('Which part of a flowering plant develops into a fruit?', 'Flower', ['Leaf', 'Root', 'Stem']),
  order('Put the life cycle of a flowering plant in order', ['Seed', 'Seedling', 'Young plant', 'Adult plant with flowers'])
]);
add('sci-matter', 'science', ['P3 – P5', 'P3 – P5'], ['States of matter', 'States of matter'], ['固体、液体、气体，熔化、蒸发和凝结', 'Solids, liquids, gases and changes of state'], [
  mcq('Which has a definite shape AND a definite volume?', 'Solid', ['Liquid', 'Gas', 'None of them']),
  mcq('Which has a definite volume but NO definite shape?', 'Liquid', ['Solid', 'Gas', 'All of them']),
  mcq('Which has NO definite shape and NO definite volume?', 'Gas', ['Solid', 'Liquid', 'Ice']),
  input('At what temperature (°C) does pure water boil at sea level?', ['100']),
  input('At what temperature (°C) does ice melt?', ['0']),
  tf('Air has mass.', true),
  mcq('Water droplets form on the outside of a cold glass. This is ___', 'condensation', ['evaporation', 'melting', 'freezing']),
  mcq('Wet clothes dry in the sun because water ___', 'evaporates', ['condenses', 'freezes', 'melts'])
]);
add('sci-body', 'science', ['P4 – P6', 'P4 – P6'], ['The human body', 'The human body'], ['心脏、肺、消化系统和骨骼', 'Heart, lungs, digestion and bones'], [
  mcq('Which organ pumps blood around the body?', 'Heart', ['Lungs', 'Stomach', 'Brain']),
  mcq('Which organs help us take in oxygen?', 'Lungs', ['Kidneys', 'Liver', 'Heart']),
  mcq('Where are digested food substances mostly absorbed into the blood?', 'Small intestine', ['Mouth', 'Gullet', 'Large intestine']),
  tf('Digestion begins in the mouth.', true),
  input('How many bones are there in an adult human body?', ['206']),
  mcq('The skeleton ___', 'supports and protects the body', ['digests food', 'pumps blood', 'takes in oxygen']),
  order('Put the parts of the digestive system in order', ['Mouth', 'Gullet', 'Stomach', 'Small intestine', 'Large intestine']),
  mcq('Which system carries blood around the body?', 'Circulatory system', ['Digestive system', 'Skeletal system', 'Respiratory system'])
]);
add('sci-forces', 'science', ['P4 – P6', 'P4 – P6'], ['Magnets, light & forces', 'Magnets, light & forces'], ['磁铁、光、影子、摩擦力和重力', 'Magnets, light, shadows, friction and gravity'], [
  mcq('A magnet attracts objects made of ___', 'iron', ['copper', 'plastic', 'wood']),
  tf('The north poles of two magnets attract each other.', false, { note: 'Like poles repel; unlike poles attract.' }),
  mcq('What is the main source of energy for living things on Earth?', 'The Sun', ['The Moon', 'Soil', 'Wind']),
  tf('Light travels in a straight line.', true),
  mcq('A shadow forms when ___', 'an object blocks light', ['light passes through glass', 'an object gives out light', 'light bends around an object']),
  mcq('Which force slows down a rolling ball on a carpet?', 'Friction', ['Magnetic force', 'Gravity only', 'Push']),
  mcq('Which force makes an apple fall to the ground?', 'Gravity', ['Friction', 'Magnetic force', 'Elastic force']),
  mcq('Which material lets MOST light pass through?', 'Clear glass', ['Wood', 'Cardboard', 'Metal'])
]);

// ── 综合常识 ──
add('g-singapore', 'general', ['全年级', 'All levels'], ['新加坡知多少', 'Singapore quiz'], ['国庆、国花、国旗……你了解新加坡吗？', 'National Day, national flower, flag and more'], [
  mcq('新加坡的国庆日是几月几日？', '8 月 9 日', ['8 月 31 日', '10 月 1 日', '7 月 4 日']),
  mcq('新加坡的国花是什么？', '卓锦·万代兰', ['玫瑰', '樱花', '向日葵']),
  input('新加坡国旗上有几颗星星？', ['5', '五']),
  mcq('新加坡的国语是哪一种语言？', '马来语', ['英语', '华语', '淡米尔语']),
  input('新加坡有几种官方语言？', ['4', '四']),
  mcq('新加坡是哪一年独立的？', '1965 年', ['1945 年', '1959 年', '1975 年']),
  mcq('狮头鱼身的雕像叫什么？', '鱼尾狮', ['麒麟', '石狮', '龙']),
  mcq('新加坡的货币是什么？', '新加坡元', ['马来西亚令吉', '人民币', '美元'])
]);
add('g-world', 'general', ['小三以上', 'P3+'], ['世界首都', 'World capitals'], ['这些国家的首都是哪里？', 'Name the capital city'], [
  mcq('日本的首都是？', '东京', ['大阪', '京都', '首尔']),
  mcq('澳大利亚的首都是？', '堪培拉', ['悉尼', '墨尔本', '珀斯'], { note: '很多人以为是悉尼，其实是堪培拉。' }),
  mcq('马来西亚的首都是？', '吉隆坡', ['新山', '槟城', '马六甲']),
  mcq('法国的首都是？', '巴黎', ['伦敦', '罗马', '柏林']),
  mcq('泰国的首都是？', '曼谷', ['清迈', '普吉', '河内']),
  mcq('中国的首都是？', '北京', ['上海', '广州', '南京']),
  mcq('加拿大的首都是？', '渥太华', ['多伦多', '温哥华', '蒙特利尔']),
  mcq('英国的首都是？', '伦敦', ['巴黎', '都柏林', '爱丁堡'])
]);
add('g-festivals', 'general', ['全年级', 'All levels'], ['节日文化', 'Festivals'], ['新加坡多元文化的节日', 'Festivals of multicultural Singapore'], [
  mcq('中秋节常吃什么？', '月饼', ['粽子', '汤圆', '饺子']),
  mcq('端午节常吃什么？', '粽子', ['月饼', '年糕', '汤圆']),
  mcq('屠妖节（Deepavali）又叫什么节？', '光明节', ['开斋节', '圣诞节', '卫塞节']),
  mcq('开斋节（Hari Raya Puasa）庆祝什么？', '斋戒月结束', ['新年开始', '丰收', '春天到来']),
  mcq('农历新年长辈常给小孩什么？', '红包', ['月饼', '圣诞袜', '彩蛋']),
  input('圣诞节是 12 月几日？', ['25', '25日', '25 日']),
  mcq('卫塞节纪念的是谁？', '佛陀', ['孔子', '屈原', '嫦娥']),
  mcq('端午节划龙舟，是为了纪念谁？', '屈原', ['李白', '孔子', '嫦娥'])
]);
add('g-health', 'general', ['全年级', 'All levels'], ['健康生活', 'Healthy living'], ['我的健康餐盘、洗手、睡眠和喝水', 'Healthy plate, hand washing, sleep and water'], [
  mcq('「我的健康餐盘」里，水果和蔬菜应该占多少？', '一半', ['四分之一', '全部', '一点点就好']),
  mcq('口渴的时候，最健康的选择是？', '白开水', ['汽水', '奶茶', '果汁饮料']),
  input('用肥皂洗手，至少要搓洗多少秒？', ['20']),
  mcq('6 到 12 岁的孩子，每晚最好睡多少小时？', '9 到 12 小时', ['5 到 6 小时', '6 到 7 小时', '13 到 15 小时']),
  tf('全谷类食物（例如糙米）比白米更有营养。', true),
  tf('不吃早餐对学习没有影响。', false, { note: '吃早餐能帮助我们上午集中精神。' }),
  mcq('打喷嚏时应该怎么做？', '用纸巾或手肘遮住口鼻', ['对着别人打', '用手掌遮住后不洗手', '什么都不用做']),
  mcq('每天大约运动多长时间对孩子比较好？', '至少 1 小时', ['5 分钟', '完全不用', '只在周末'])
]);
add('g-space', 'general', ['小三以上', 'P3+'], ['太空探索', 'Space explorer'], ['太阳系的行星、月球和太空探索', 'Planets, the Moon and space exploration'], [
  tf('太阳是一颗恒星。', true),
  mcq('离太阳最近的行星是？', '水星', ['金星', '地球', '火星']),
  mcq('太阳系里最大的行星是？', '木星', ['土星', '地球', '海王星']),
  mcq('被称为「红色星球」的是？', '火星', ['金星', '木星', '水星']),
  input('太阳系有几颗行星？', ['8', '八']),
  mcq('第一个登上月球的人是？', '阿姆斯特朗', ['加加林', '杨利伟', '牛顿']),
  mcq('白天和黑夜是怎么形成的？', '地球自转', ['月球绕地球转', '太阳绕地球转', '地球离太阳时远时近']),
  tf('月球自己会发光。', false, { note: '月光是月球反射的太阳光。' })
]);

// ── 节日专题：每个专题 3 个游戏，按日期自动出现在首页（农历节日每年日期不同，窗口放宽一些）──
const COLLECTIONS = [
  { id: 'deepavali', title: ['屠妖节专题', 'Deepavali'], desc: ['光明节：油灯、彩绘和小印度的灯饰', 'Festival of Lights: diyas, rangoli and Little India'], from: '10-05', to: '11-20' },
  { id: 'yearend', title: ['圣诞与年终', 'Christmas & year-end'], desc: ['圣诞节、新年和年终假期', 'Christmas, New Year and the year-end holidays'], from: '11-21', to: '12-31' },
  { id: 'cny', title: ['农历新年专题', 'Chinese New Year'], desc: ['红包、团圆饭、捞鱼生和十二生肖', 'Red packets, reunion dinner, lo hei and the zodiac'], from: '01-01', to: '02-28' },
  { id: 'hariraya', title: ['开斋节专题', 'Hari Raya Puasa'], desc: ['斋月、马来粽和芽笼士乃的灯饰', 'Ramadan, ketupat and Geylang Serai'], from: '02-20', to: '04-15' }
];
// 屠妖节
add('dv-culture', 'general', ['全年级', 'All levels'], ['屠妖节知多少', 'All about Deepavali'], ['光明节的习俗和意义', 'Customs and meaning of the Festival of Lights'], [
  mcq('屠妖节（Deepavali）又叫什么节？', '光明节', ['开斋节', '丰收节', '卫塞节']),
  mcq('屠妖节点的传统小油灯叫什么？', '陶土油灯（diya）', ['纸灯笼', '孔明灯', '圣诞彩灯']),
  mcq('屠妖节时，家门口地上用彩色米粉画的图案叫什么？', '彩绘图案（rangoli / kolam）', ['春联', '剪纸', '门神']),
  mcq('新加坡哪里每年有屠妖节灯饰？', '小印度（实龙岗路）', ['牛车水', '芽笼士乃', '乌节路']),
  tf('屠妖节象征光明战胜黑暗、善良战胜邪恶。', true),
  mcq('屠妖节主要是哪个宗教的节日？', '印度教', ['伊斯兰教', '佛教', '基督教']),
  tf('屠妖节在新加坡是公共假期。', true),
  mcq('过屠妖节时，人们常常会怎么做？', '穿新衣、拜访亲友', ['吃月饼、赏月', '划龙舟', '堆雪人'])
], 'deepavali');
add('dv-english', 'english', ['P2 – P4', 'P2 – P4'], ['Festival of Lights', 'Festival of Lights'], ['屠妖节主题英文词汇', 'Deepavali words in English'], [
  mcq('Deepavali is also called the Festival of ___.', 'Lights', ['Lanterns', 'Harvest', 'Boats']),
  mcq('A small clay oil lamp lit during Deepavali is a ___.', 'diya', ['kite', 'bell', 'drum']),
  mcq('Colourful patterns drawn on the floor near the door are called ___.', 'rangoli', ['mosaic', 'origami', 'graffiti']),
  mcq('Little India is decorated with bright ___ during Deepavali.', 'lights', ['snowflakes', 'pumpkins', 'mooncakes']),
  tf('Deepavali celebrates the victory of light over darkness.', true),
  mcq('Which word is the opposite of "darkness"?', 'light', ['night', 'shadow', 'smoke']),
  input('Fill in the missing letter: l _ m p (a small light)', ['a']),
  order('Put the words in order to make a sentence.', ['We', 'light', 'the', 'lamps'])
], 'deepavali');
add('dv-math', 'math', ['小二 – 小四', 'P2 – P4'], ['数一数油灯', 'Counting diyas'], ['屠妖节主题应用题', 'Deepavali word problems'], [
  input('每排有 6 盏油灯，摆了 4 排，一共多少盏？', ['24']),
  input('妈妈买了 30 块印度甜点，平分给 5 个孩子，每人几块？', ['6']),
  input('小印度挂了 125 串彩灯，又挂上 75 串，一共几串？', ['200']),
  mcq('Rangoli 图案常常是对称的。下面哪个图形也是对称的？', '正方形', ['数字 7', '字母 F', '一块不规则的石头']),
  input('一盏油灯能点 3 小时，晚上 7 点点起，晚上几点熄灭？（填数字）', ['10']),
  tf('8 排油灯，每排 5 盏，一共 45 盏。', false, { note: '8 × 5 = 40' }),
  mcq('小明有 50 元，买新衣服用了 32 元，还剩多少元？', '18 元', ['28 元', '22 元', '82 元']),
  input('Rangoli 用了红、黄、蓝 3 种颜色，每种 12 包彩粉，一共几包？', ['36'])
], 'deepavali');
// 圣诞与年终
add('xm-culture', 'general', ['全年级', 'All levels'], ['圣诞与年终', 'Christmas & year-end'], ['圣诞节、新年和年终假期', 'Christmas, New Year and the holidays'], [
  mcq('圣诞节在每年的哪个月？', '十二月', ['十一月', '一月', '十月']),
  mcq('传说中，圣诞老人的雪橇由什么动物拉？', '驯鹿', ['马', '狗', '骆驼']),
  mcq('新加坡哪条街每年年底有圣诞灯饰？', '乌节路', ['实龙岗路', '芽笼士乃', '牛车水']),
  tf('新加坡十二月会下雪。', false, { note: '新加坡在赤道附近，全年都很温暖，不会下雪。' }),
  mcq('圣诞节常见的装饰树是什么树？', '松树（圣诞树）', ['椰子树', '榕树', '竹子']),
  mcq('一年的最后一天是几月几日？', '12 月 31 日', ['12 月 25 日', '1 月 1 日', '12 月 30 日']),
  mcq('新年的第一天是几月几日？', '1 月 1 日', ['1 月 31 日', '12 月 31 日', '2 月 1 日']),
  tf('学年结束后，新加坡的学校有年终假期。', true)
], 'yearend');
add('xm-english', 'english', ['P2 – P4', 'P2 – P4'], ['Holiday words', 'Holiday words'], ['圣诞和新年的英文', 'Christmas and New Year English'], [
  mcq("Santa's sleigh is pulled by ___.", 'reindeer', ['horses', 'dogs', 'camels']),
  mcq('One present, two ___.', 'presents', ['presentes', 'presentss', 'present']),
  mcq('Christmas Day is on 25 ___.', 'December', ['November', 'January', 'October']),
  order('Put the words in order to make a greeting.', ['Merry', 'Christmas', 'to', 'you']),
  tf('A snowman is made of sand.', false, { note: 'A snowman is made of snow.' }),
  mcq('Which word is the opposite of "first"?', 'last', ['next', 'early', 'begin']),
  input('Fill in the missing letter: g _ f t (a present)', ['i']),
  mcq('On 1 January we say "Happy ___ Year!"', 'New', ['Old', 'Big', 'First'])
], 'yearend');
add('xm-math', 'math', ['小二 – 小四', 'P2 – P4'], ['礼物数学', 'Gift maths'], ['年终主题应用题', 'Year-end word problems'], [
  input('一个礼物盒的长方形面长 20 厘米、宽 10 厘米，这一面的周长是多少厘米？', ['60']),
  input('圣诞树上挂了 48 个彩球，红色的占一半，红彩球有几个？', ['24']),
  input('12 月有几天？', ['31']),
  mcq('从 12 月 25 日到 12 月 31 日，一共几天？（两头都算）', '7 天', ['6 天', '8 天', '5 天']),
  input('买 8 份礼物，每份 15 元，一共多少元？', ['120']),
  tf('一年有 12 个月。', true),
  mcq('1 小时等于多少分钟？', '60 分钟', ['100 分钟', '24 分钟', '30 分钟']),
  input('年终假期有 6 个星期，一共多少天？', ['42'])
], 'yearend');
// 农历新年
add('cny-customs', 'chinese', ['全年级', 'All levels'], ['新年习俗', 'New Year customs'], ['红包、团圆饭、捞鱼生和舞狮', 'Red packets, reunion dinner, lo hei and lion dance'], [
  mcq('拜年时，常说的一句吉祥话是？', '恭喜发财', ['中秋快乐', '圣诞快乐', '生日快乐']),
  mcq('除夕晚上全家一起吃的饭叫什么？', '团圆饭', ['早餐', '下午茶', '夜宵']),
  mcq('新加坡人过年时常一起「捞」什么？', '鱼生', ['面线', '粥', '米粉']),
  mcq('拜年时，常带什么水果送给亲友？', '两个柑（橘子）', ['榴梿', '香蕉', '西瓜']),
  mcq('贴在门上、写着吉祥话的红纸叫什么？', '春联', ['红包', '灯笼', '贺卡']),
  mcq('过年时，牛车水常见的表演是？', '舞狮', ['划龙舟', '放风筝', '堆雪人']),
  tf('农历新年按农历计算，所以每年在阳历上的日期都不一样。', true),
  mcq('「年年有余」的图案里常画哪种动物？', '鱼', ['猫', '狗', '鸡'], { note: '「余」和「鱼」同音。' })
], 'cny');
add('cny-zodiac', 'chinese', ['小一 – 小四', 'P1 – P4'], ['十二生肖', 'The 12 zodiac animals'], ['生肖的名字和顺序', 'Names and order of the zodiac'], [
  order('按十二生肖的顺序排一排（第 1 到第 4 个）', ['鼠', '牛', '虎', '兔']),
  order('按十二生肖的顺序排一排（第 5 到第 8 个）', ['龙', '蛇', '马', '羊']),
  order('按十二生肖的顺序排一排（第 9 到第 12 个）', ['猴', '鸡', '狗', '猪']),
  input('十二生肖一共有几种动物？', ['12', '十二']),
  mcq('十二生肖排第一的是？', '鼠', ['牛', '龙', '猪']),
  mcq('「龙」后面是哪个生肖？', '蛇', ['马', '虎', '兔']),
  mcq('十二生肖里，哪一个是传说中的动物？', '龙', ['蛇', '马', '猴']),
  tf('生肖每 12 年轮一次。', true)
], 'cny');
add('cny-math', 'math', ['小二 – 小四', 'P2 – P4'], ['红包数学', 'Red packet maths'], ['新年主题应用题', 'Chinese New Year word problems'], [
  input('小明收到 5 个红包，每个 8 元，一共几元？', ['40']),
  input('一盒年饼有 36 块，平分给 4 个人，每人几块？', ['9']),
  mcq('每户人家送 2 个柑，拜访 6 户人家，一共要带几个柑？', '12 个', ['8 个', '6 个', '14 个']),
  input('团圆饭晚上 7 点开始，吃了 2 小时，晚上几点吃完？（填数字）', ['9']),
  tf('3 个灯笼，每个挂 8 条流苏，一共 24 条。', true),
  input('小红有 50 元红包钱，买书用了 23 元，还剩几元？', ['27']),
  mcq('舞狮队有 4 头狮子，每头狮子由 2 个人舞，一共几个人？', '8 人', ['6 人', '10 人', '4 人']),
  input('从正月初一到初三，一共几天？（两头都算）', ['3', '三'])
], 'cny');
// 开斋节
add('hr-culture', 'general', ['全年级', 'All levels'], ['开斋节知多少', 'All about Hari Raya'], ['斋月、开斋节的习俗', 'Ramadan and Hari Raya customs'], [
  mcq('开斋节之前，穆斯林斋戒的那个月叫什么？', '斋月（Ramadan）', ['腊月', '正月', '中秋月']),
  mcq('开斋节主要是哪些人的节日？', '穆斯林', ['印度教徒', '佛教徒', '基督徒']),
  mcq('新加坡哪里每年有开斋节灯饰和市集？', '芽笼士乃', ['小印度', '牛车水', '乌节路']),
  mcq('用椰叶编成小方格、里面包着米饭的食物叫什么？', '马来粽（ketupat）', ['粽子', '年糕', '月饼']),
  mcq('开斋节的问候语是？', 'Selamat Hari Raya', ['Gong Xi Fa Cai', 'Happy Deepavali', 'Merry Christmas']),
  tf('斋月期间，穆斯林从日出到日落都不吃东西、不喝水。', true),
  tf('开斋节时，人们会互相请求原谅。', true, { note: '常说 maaf zahir dan batin。' }),
  mcq('开斋节时，马来男士常穿的传统服装是？', 'Baju Melayu', ['旗袍', '纱丽', '和服'])
], 'hariraya');
add('hr-english', 'english', ['P2 – P4', 'P2 – P4'], ['Hari Raya words', 'Hari Raya words'], ['开斋节主题英文词汇', 'Hari Raya Puasa words in English'], [
  mcq('Hari Raya Puasa marks the end of the fasting month of ___.', 'Ramadan', ['December', 'Deepavali', 'spring']),
  mcq('Rice wrapped in woven coconut leaves is called ___.', 'ketupat', ['mooncake', 'dumpling', 'pizza']),
  tf('People visit relatives and friends during Hari Raya.', true),
  mcq('"Selamat Hari Raya" is a ___.', 'greeting', ['food', 'dance', 'game']),
  order('Put the words in order to make a sentence.', ['We', 'visit', 'our', 'grandparents']),
  mcq('We wear our ___ clothes on Hari Raya.', 'new', ['news', 'newly', 'knew']),
  input('Fill in the missing letter: f _ s t (to go without food)', ['a']),
  mcq('Which word is the opposite of "sunrise"?', 'sunset', ['sunshine', 'sunlight', 'sunny'])
], 'hariraya');
add('hr-math', 'math', ['小二 – 小四', 'P2 – P4'], ['市集数学', 'Bazaar maths'], ['开斋节主题应用题', 'Hari Raya word problems'], [
  input('一串马来粽有 6 个，买 7 串，一共几个？', ['42']),
  input('斋月有 30 天，已经过了 12 天，还剩几天？', ['18']),
  mcq('市集有 8 排摊位，每排 9 个，一共几个摊位？', '72 个', ['64 个', '81 个', '17 个']),
  input('一盘饼干 45 块，平分给 9 个人，每人几块？', ['5']),
  tf('晚上 7:15 日落，7:30 开始吃开斋饭，中间相隔 15 分钟。', true),
  input('拜访 3 户人家，每户待 40 分钟，一共多少分钟？', ['120']),
  mcq('收到 10 元、5 元、2 元的绿包，一共多少元？', '17 元', ['15 元', '12 元', '20 元']),
  input('2 小时等于多少分钟？', ['120'])
], 'hariraya');
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'data', 'collections.json'), JSON.stringify(COLLECTIONS.map(c => ({ ...c, games: SETS.filter(s => s.collection === c.id).map(s => s.id) })), null, 1));

// 校验并输出
const out = SETS.map(s => {
  const clean = Q.cleanAll(s.questions);
  if (clean.length !== s.questions.length) throw new Error(`${s.id} 有 ${s.questions.length - clean.length} 题格式不对`);
  if (clean.length < 8) throw new Error(`${s.id} 只有 ${clean.length} 题`);
  return { ...s, questions: clean };
});
const ids = new Set(out.map(s => s.id)); if (ids.size !== out.length) throw new Error('id 重复');
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'data', 'gallery.json'), JSON.stringify(out, null, 1));
const by = {}; out.forEach(s => by[s.subject] = (by[s.subject] || 0) + 1);
console.log(`gallery.json：${out.length} 个游戏，${out.reduce((a, s) => a + s.questions.length, 0)} 题`, by);
