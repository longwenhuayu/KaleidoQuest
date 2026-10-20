// AI 出题：老师给主题或课文，SiliconFlow（DeepSeek）生成题目，服务器校验格式后返回给编辑器（不直接入库）
const A = require('./auth');
const Q = require('./questions');

const API = 'https://api.siliconflow.cn/v1/chat/completions';
const MODEL = process.env.AI_MODEL || 'deepseek-ai/DeepSeek-V3';
const DAILY = +process.env.AI_DAILY || 30;
const SUBJECT_NAME = { chinese: '华文（新加坡小学/中学华文）', math: '数学', english: 'English', science: 'Science', general: '综合常识', malay: 'Bahasa Melayu', tamil: 'Tamil' };
const TYPE_NAME = { mcq: 'mcq', tf: 'tf', input: 'input', order: 'order' };

// 每位老师每天的次数（重启清零；够用就行）
const used = new Map();
const today = () => new Date().toISOString().slice(0, 10);
function take(id) { const k = `${today()}:${id}`; const n = used.get(k) || 0; if (n >= DAILY) return false; used.set(k, n + 1); return true; }
function left(id) { return DAILY - (used.get(`${today()}:${id}`) || 0); }
setInterval(() => { const t = today(); for (const k of used.keys()) if (!k.startsWith(t)) used.delete(k); }, 3600e3).unref();
const busy = new Set();

const QLANG = { zh: 'Simplified Chinese', en: 'English', ms: 'Malay', ta: 'Tamil' };
function prompt({ subject, grade, topic, text, n, types, qlang }) {
  return [
    { role: 'system', content: 'You write classroom quiz questions for Singapore students. Output only JSON. Every question must be factually correct, age-appropriate, unambiguous, with exactly one defensible answer. Never invent facts about the given text.' },
    { role: 'user', content: `Subject: ${SUBJECT_NAME[subject] || subject}
Level: ${grade || 'primary school'}
${topic ? `Topic: ${topic}\n` : ''}${text ? `Base every question on this lesson text:\n"""\n${text}\n"""\n` : ''}
Write ${n} questions. Allowed types: ${types.join(', ')} (mix them; mostly mcq if allowed).
Write the questions in ${QLANG[qlang] || 'English'}.

Return {"questions":[...]} where each item is one of:
- {"type":"mcq","prompt":"...","options":["A","B","C","D"],"answer":[index of correct option, 0-based],"time":20,"note":"one-line explanation"}
- {"type":"tf","prompt":"a statement","answer":true or false,"time":15,"note":"..."}
- {"type":"input","prompt":"...","answer":["accepted answer","another accepted spelling"],"time":25,"note":"..."}   (short answers only: a number, a word or a short phrase)
- {"type":"order","prompt":"Put these in order: ...","options":["first","second","third","fourth"],"time":30,"note":"..."}   (options listed in the CORRECT order)
Rules: mcq has 3–4 options with plausible distractors, shuffled so the answer is not always first; prompts under 120 characters; options under 40 characters; time 10–40 seconds; no "all of the above". Stay within what the Singapore MOE syllabus teaches at this level; test core ideas, not exceptions or edge cases.` }
  ];
}

function routes(app) {
  app.get('/api/ai/quota', A.requireTeacher, (req, res) => res.json({ left: left(req.teacher.id), daily: DAILY, on: !!process.env.SILICONFLOW_API_KEY }));
  app.post('/api/ai/questions', A.requireTeacher, async (req, res) => {
    if (!process.env.SILICONFLOW_API_KEY) return res.status(503).json({ error: 'ai_off' });
    const b = req.body || {};
    const topic = String(b.topic || '').trim().slice(0, 200), text = String(b.text || '').trim().slice(0, 4000);
    if (!topic && !text) return res.status(400).json({ error: 'topic' });
    const n = Math.min(15, Math.max(3, Math.round(+b.n || 8)));
    const types = (Array.isArray(b.types) ? b.types : ['mcq']).filter(t => TYPE_NAME[t]);
    if (!types.length) types.push('mcq');
    const id = req.teacher.id;
    if (busy.has(id)) return res.status(429).json({ error: 'busy' });
    if (!take(id)) return res.status(429).json({ error: 'quota' });
    busy.add(id);
    try {
      const r = await fetch(API, {
        method: 'POST', signal: AbortSignal.timeout(90e3),
        headers: { Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: prompt({ subject: String(b.subject || 'general'), grade: String(b.grade || '').slice(0, 30), topic, text, n, types, qlang: String(b.qlang || '') }), temperature: 0.5, max_tokens: 4000, response_format: { type: 'json_object' } })
      });
      const d = await r.json();
      const content = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!content) throw new Error(JSON.stringify(d).slice(0, 200));
      const json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      const raw = Array.isArray(json) ? json : json.questions;
      const qs = Q.cleanAll(raw).filter(x => types.includes(x.type)).slice(0, n);
      if (!qs.length) throw new Error('no valid questions');
      res.json({ questions: qs, left: left(id) });
    } catch (e) {
      console.error('ai questions failed', e.message);
      used.set(`${today()}:${id}`, Math.max(0, (used.get(`${today()}:${id}`) || 1) - 1)); // 失败不扣次数
      res.status(502).json({ error: 'ai_failed' });
    } finally { busy.delete(id); }
  });
}
module.exports = { routes, prompt };
