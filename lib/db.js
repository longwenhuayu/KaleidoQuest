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
  created INTEGER NOT NULL
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
CREATE INDEX IF NOT EXISTS sets_teacher ON sets(teacher_id, updated DESC);
CREATE INDEX IF NOT EXISTS games_teacher ON games(teacher_id, ended DESC);
`);

const q = sql => db.prepare(sql);
module.exports = { db, q };
