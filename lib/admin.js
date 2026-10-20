// 平台管理后台（只有 .env 里 ADMIN_EMAILS 列出的账号能用）
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const { q } = require('./db');
const A = require('./auth');

const DAY = 86400e3;
// 按新加坡时间（UTC+8）算「哪一天」
const dayOf = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

module.exports = function routes(app, { sendReset, rooms }) {
  app.get('/api/admin/overview', A.requireAdmin, (req, res) => {
    const now = Date.now(), since30 = now - 30 * DAY;
    const one = sql => q(sql).get().n;
    const games = q('SELECT ended, json_array_length(report, \'$.players\') AS players FROM games WHERE ended > ?').all(since30);
    const attempts = q('SELECT finished FROM attempts WHERE finished > ?').all(since30);
    const teachersNew = q('SELECT created FROM teachers WHERE created > ?').all(since30);
    // 最近 30 天每天的开局数、学生参与人次（课堂人数 + 作业完成次数）、新老师
    const days = [];
    for (let i = 29; i >= 0; i--) days.push({ day: dayOf(now - i * DAY), games: 0, students: 0, teachers: 0 });
    const at = Object.fromEntries(days.map(d => [d.day, d]));
    games.forEach(g => { const d = at[dayOf(g.ended)]; if (d) { d.games++; d.students += g.players || 0; } });
    attempts.forEach(a => { const d = at[dayOf(a.finished)]; if (d) d.students++; });
    teachersNew.forEach(t => { const d = at[dayOf(t.created)]; if (d) d.teachers++; });
    const week = days.slice(-7);
    res.json({
      totals: {
        teachers: one('SELECT count(*) n FROM teachers'), activeWeek: q('SELECT count(*) n FROM teachers WHERE last_seen > ?').get(now - 7 * DAY).n,
        sets: one('SELECT count(*) n FROM sets'), games: one('SELECT count(*) n FROM games'), assignments: one('SELECT count(*) n FROM assignments'),
        participations: one("SELECT coalesce(sum(json_array_length(report, '$.players')), 0) n FROM games") + one('SELECT count(*) n FROM attempts WHERE finished IS NOT NULL')
      },
      today: days.at(-1), week: { games: week.reduce((s, d) => s + d.games, 0), students: week.reduce((s, d) => s + d.students, 0), teachers: week.reduce((s, d) => s + d.teachers, 0) },
      days
    });
  });

  app.get('/api/admin/teachers', A.requireAdmin, (req, res) => {
    const kw = `%${String(req.query.q || '').trim()}%`;
    res.json(q(`SELECT t.id, t.email, t.name, t.created, t.last_seen, t.disabled,
      (SELECT count(*) FROM sets s WHERE s.teacher_id = t.id) AS sets,
      (SELECT count(*) FROM games g WHERE g.teacher_id = t.id) AS games,
      (SELECT count(*) FROM assignments a WHERE a.teacher_id = t.id) AS assignments
      FROM teachers t WHERE t.email LIKE ? OR t.name LIKE ? ORDER BY coalesce(t.last_seen, t.created) DESC LIMIT 500`).all(kw, kw)
      .map(t => ({ ...t, admin: A.isAdmin(t) })));
  });
  const teacher = (req, res) => { const t = q('SELECT id, email, name, created, last_seen, disabled FROM teachers WHERE id = ?').get(+req.params.id); if (!t) res.status(404).json({ error: 'not_found' }); return t; };
  app.get('/api/admin/teachers/:id', A.requireAdmin, (req, res) => {
    const t = teacher(req, res); if (!t) return;
    res.json({
      ...t, admin: A.isAdmin(t),
      sets: q('SELECT id, title, subject, grade, updated, json_array_length(questions) AS n FROM sets WHERE teacher_id = ? ORDER BY updated DESC').all(t.id),
      games: q("SELECT id, title, mode, ended, json_array_length(report, '$.players') AS players FROM games WHERE teacher_id = ? ORDER BY ended DESC LIMIT 100").all(t.id),
      assignments: q(`SELECT a.id, a.title, a.code, a.created, a.due, a.closed, (SELECT count(DISTINCT name) FROM attempts x WHERE x.assignment_id = a.id AND x.finished IS NOT NULL) AS done FROM assignments a WHERE a.teacher_id = ? ORDER BY a.created DESC`).all(t.id)
    });
  });
  app.post('/api/admin/teachers/:id/disable', A.requireAdmin, (req, res) => {
    const t = teacher(req, res); if (!t) return;
    if (t.id === req.teacher.id) return res.status(400).json({ error: 'self' });
    const off = req.body.disabled ? 1 : 0;
    q('UPDATE teachers SET disabled = ? WHERE id = ?').run(off, t.id);
    if (off) q('DELETE FROM sessions WHERE teacher_id = ?').run(t.id);
    res.json({ ok: true });
  });
  app.post('/api/admin/teachers/:id/reset', A.requireAdmin, async (req, res) => {
    const t = teacher(req, res); if (!t) return;
    if (t.disabled) return res.status(400).json({ error: 'disabled' });
    try { await sendReset(t, req); res.json({ ok: true }); } catch (e) { res.status(502).json({ error: 'mail_failed' }); }
  });
  app.delete('/api/admin/teachers/:id', A.requireAdmin, (req, res) => {
    const t = teacher(req, res); if (!t) return;
    if (t.id === req.teacher.id) return res.status(400).json({ error: 'self' });
    q('DELETE FROM teachers WHERE id = ?').run(t.id);
    res.json({ ok: true });
  });

  // 只读查看任意老师的内容
  app.get('/api/admin/sets/:id', A.requireAdmin, (req, res) => {
    const s = q('SELECT s.*, t.name AS teacher FROM sets s JOIN teachers t ON t.id = s.teacher_id WHERE s.id = ?').get(+req.params.id);
    if (!s) return res.status(404).json({ error: 'not_found' });
    res.json({ id: s.id, title: s.title, subject: s.subject, grade: s.grade, teacher: s.teacher, updated: s.updated, questions: JSON.parse(s.questions) });
  });
  app.get('/api/admin/games/:id', A.requireAdmin, (req, res) => {
    const g = q('SELECT * FROM games WHERE id = ?').get(+req.params.id);
    if (!g) return res.status(404).json({ error: 'not_found' });
    res.json({ id: g.id, title: g.title, mode: g.mode, started: g.started, ended: g.ended, setId: null, report: JSON.parse(g.report) });
  });

  app.get('/api/admin/system', A.requireAdmin, (req, res) => {
    let live = 0, online = 0;
    for (const r of rooms.values()) { if (r.state !== 'ended') live++; for (const p of r.players.values()) if (p.ws && p.ws.readyState === WebSocket.OPEN) online++; }
    const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
    let backup = null;
    try {
      const f = fs.readdirSync(dir).filter(x => x.endsWith('.db.gz')).map(x => ({ name: x, ...fs.statSync(path.join(dir, x)) })).sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (f.length) backup = { name: f[0].name, at: f[0].mtimeMs, size: f[0].size, count: f.length };
    } catch (e) {}
    let dbSize = 0; try { dbSize = fs.statSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'arena.db')).size; } catch (e) {}
    res.json({ rooms: rooms.size, live, online, backup, dbSize, uptime: Math.round(process.uptime()), memory: Math.round(process.memoryUsage().rss / 1048576), node: process.version, mail: !!(process.env.SMTP_HOST && process.env.SMTP_PASS) });
  });
};
