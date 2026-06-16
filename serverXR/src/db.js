const { DatabaseSync } = require('node:sqlite')

let _db = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    permanent INTEGER NOT NULL DEFAULT 0,
    allow_edits INTEGER NOT NULL DEFAULT 1,
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
