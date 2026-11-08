// 向 ops-hub（文心书院运营中台）上报 AI / 语音调用用量（ai_call 事件）。
// 只在 .env 配了 OPS_INGEST_KEY_KALEIDO 时启用；内存缓冲、每 15 秒批量发送，失败保留 24 小时重试。
// 任何异常只打日志，绝不影响主流程。口径见 ops-hub/docs/口径与事件字典_v0.1.md
const crypto = require('crypto');

const URL_ = (process.env.OPS_HUB_URL || 'http://127.0.0.1:3062') + '/api/events';
const KEY = process.env.OPS_INGEST_KEY_KALEIDO;
const ENABLED = !!KEY;
let buffer = [];

function report({ userRef, provider, model, task, tokensIn = 0, tokensOut = 0, tokensCached = 0, audioS = 0, chars = 0, latencyMs = 0, status = 'ok' }) {
  if (!ENABLED) return;
  try {
    buffer.push({
      event_id: `kaleido:ai_call:${crypto.randomUUID()}`, event: 'ai_call', schema_version: 1, product_id: 'kaleido',
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), is_internal: false, ...(userRef ? { user_ref: userRef } : {}),
      provider, model: String(model || 'unknown'), task_type: task || 'unknown',
      tokens_in: tokensIn, tokens_out: tokensOut, tokens_cached: Math.min(tokensCached, tokensIn),
      audio_s: Math.round(audioS * 100) / 100, chars, latency_ms: Math.max(0, Math.round(latencyMs)), status,
    });
    if (buffer.length > 5000) buffer = buffer.slice(-5000);
  } catch (e) { console.warn('[ops] report:', e.message); }
}

async function flush() {
  if (!buffer.length) return;
  const cutoff = Date.now() - 24 * 3600e3;
  const batch = buffer.filter((e) => Date.parse(e.ts) >= cutoff).slice(0, 500);
  buffer = buffer.filter((e) => Date.parse(e.ts) >= cutoff).slice(batch.length);
  try {
    const res = await fetch(URL_, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(batch), signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status >= 500) throw new Error(`ops-hub HTTP ${res.status}`);
    const body = await res.json().catch(() => ({}));
    if (body.rejected && body.rejected.length) console.warn('[ops] rejected:', JSON.stringify(body.rejected.slice(0, 3)));
  } catch (e) {
    buffer = batch.concat(buffer);
    console.warn('[ops] flush failed, will retry:', e.message);
  }
}
if (ENABLED) setInterval(flush, 15000).unref();

module.exports = { report };
