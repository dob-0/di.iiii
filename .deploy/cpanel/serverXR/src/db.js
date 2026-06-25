const { DatabaseSync } = require('node:sqlite')

let _db = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    permanent INTEGER NOT NULL DEFAULT 0,
    allow_edits INTEGER NOT NULL DEFAULT 1,
    is_public INTEGER NOT NULL DEFAULT 0,
    published_project_id TEXT,
    scene_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_touched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS space_ops (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_space_ops ON space_ops(space_id, version);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Project',
    document_version INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'project',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_touched_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_space ON projects(space_id);

  CREATE TABLE IF NOT EXISTS project_ops (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_project_ops ON project_ops(project_id, version);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'editor',
    spaces TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

  CREATE TABLE IF NOT EXISTS migrations (
    key TEXT PRIMARY KEY,
    completed_at INTEGER NOT NULL
  );
`

// Patch a DatabaseSync instance to expose the better-sqlite3 surface used
// by this codebase: .pragma() and .transaction().
// node:sqlite's StatementSync already accepts variadic positional args,
// so .prepare() needs no wrapping.
function addCompatLayer(db) {
  db.pragma = (str) => { db.exec('PRAGMA ' + str) }

  // better-sqlite3: db.transaction(fn) returns a callable that runs fn inside
  // a BEGIN/COMMIT/ROLLBACK block. Track nesting so re-entrant calls run
  // inline instead of starting a nested BEGIN (which SQLite rejects).
  let _inTx = false
  db.transaction = (fn) => (...args) => {
    if (_inTx) return fn(...args)
    _inTx = true
    db.exec('BEGIN')
    try {
      const result = fn(...args)
      db.exec('COMMIT')
      return result
    } catch (e) {
      try { db.exec('ROLLBACK') } catch {}
      throw e
    } finally {
      _inTx = false
    }
  }

  return db
}

// CREATE TABLE IF NOT EXISTS only covers fresh databases; existing ones need
// columns added explicitly since SQLite has no "ADD COLUMN IF NOT EXISTS".
function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((col) => col.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

// Replace the legacy "spaces = JSON 'null' means unrestricted" convention with
// an explicit is_unrestricted flag. Runs once (guarded by the migrations table).
function backfillUserUnrestricted(db) {
  const KEY = 'v2_user_is_unrestricted'
  if (db.prepare('SELECT 1 FROM migrations WHERE key = ?').get(KEY)) return
  db.prepare("UPDATE users SET is_unrestricted = 1, spaces = '[]' WHERE spaces = 'null'").run()
  db.prepare('INSERT OR REPLACE INTO migrations (key, completed_at) VALUES (?, ?)').run(KEY, Date.now())
}

// Mark the default landing space as the shared 'global' editable space so the
// guest model has a sane default. Runs once (guarded by the migrations table).
function backfillGlobalSpace(db) {
  const KEY = 'v3_space_kind_global'
  if (db.prepare('SELECT 1 FROM migrations WHERE key = ?').get(KEY)) return
  db.prepare("UPDATE spaces SET kind = 'global' WHERE id = 'main'").run()
  db.prepare('INSERT OR REPLACE INTO migrations (key, completed_at) VALUES (?, ?)').run(KEY, Date.now())
}

function initDb(dbPath) {
  if (_db) {
    try { _db.close() } catch {}
    _db = null
  }
  const db = new DatabaseSync(dbPath)
  addCompatLayer(db)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  ensureColumn(db, 'spaces', 'is_public', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'spaces', 'kind', "TEXT NOT NULL DEFAULT 'normal'")
  ensureColumn(db, 'users', 'spaces', 'TEXT')
  ensureColumn(db, 'users', 'is_unrestricted', 'INTEGER NOT NULL DEFAULT 0')
  backfillUserUnrestricted(db)
  backfillGlobalSpace(db)
  _db = db
  return _db
}

function getDb() {
  if (!_db) throw new Error('DB not initialized. Call initDb(path) first.')
  return _db
}

function closeDb() {
  if (_db) {
    try { _db.close() } catch {}
    _db = null
  }
}

module.exports = { initDb, getDb, closeDb }
