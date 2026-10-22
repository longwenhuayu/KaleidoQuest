// SQLite（Node 内置 node:sqlite），一个文件存全部数据
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'arena.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  pw TEXT NOT NULL,
  created INTEGER NOT NULL,
  referred_by INTEGER,
  first_game_at INTEGER,
  bonus_ai INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'general',
  grade TEXT NOT NULL DEFAULT '',
  questions TEXT NOT NULL DEFAULT '[]',
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  set_id INTEGER,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  started INTEGER NOT NULL,
  ended INTEGER NOT NULL,
  report TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sets_teacher ON sets(teacher_id, updated DESC);
CREATE INDEX IF NOT EXISTS games_teacher ON games(teacher_id, ended DESC);
CREATE INDEX IF NOT EXISTS events_kind_created ON events(kind, created DESC);
CREATE INDEX IF NOT EXISTS admin_logs_created ON admin_logs(created DESC);
`);

// 后来加的列：已经存在就跳过
for (const sql of [
  'ALTER TABLE teachers ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE teachers ADD COLUMN last_seen INTEGER',
  'ALTER TABLE teachers ADD COLUMN referred_by INTEGER',
  'ALTER TABLE teachers ADD COLUMN first_game_at INTEGER',
  'ALTER TABLE teachers ADD COLUMN bonus_ai INTEGER NOT NULL DEFAULT 0'
]) {
  try { db.exec(sql); } catch (e) {}
}
db.exec(`
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS teachers_referred_by ON teachers(referred_by);
`);

const q = sql => db.prepare(sql);
module.exports = { db, q };
