const { Database: WasmDatabase } = require('node-sqlite3-wasm')

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

// Wrap a raw node-sqlite3-wasm Statement to accept variadic positional args
// like better-sqlite3 does (stmt.run(a, b, c) instead of stmt.run([a, b, c])).
function wrapStmt(raw) {
  return {
    get: (...args) => raw.get(args),
    run: (...args) => raw.run(args),
    all: (...args) => raw.all(args),
  }
}

// Patch a WasmDatabase instance to expose the better-sqlite3 surface used
// by this codebase: .pragma(), .transaction(), and variadic .prepare().
function addCompatLayer(db) {
  db.pragma = (str) => { db.exec('PRAGMA ' + str) }

  const origPrepare = db.prepare.bind(db)
  db.prepare = (sql) => wrapStmt(origPrepare(sql))

  // better-sqlite3: db.transaction(fn) returns a callable that runs fn inside
  // a BEGIN/COMMIT/ROLLBACK block.  Nested calls (already in transaction) just
  // execute fn directly, matching better-sqlite3's deferred-transaction behavior.
  db.transaction = (fn) => (...args) => {
    if (db.inTransaction) return fn(...args)
    db.exec('BEGIN')
    try {
      const result = fn(...args)
      db.exec('COMMIT')
      return result
    } catch (e) {
      try { db.exec('ROLLBACK') } catch {}
      throw e
    }
  }

  return db
}

function initDb(dbPath) {
  if (_db) {
    try { _db.close() } catch {}
    _db = null
  }
  const raw = new WasmDatabase(dbPath)
  addCompatLayer(raw)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  raw.exec(SCHEMA)
  _db = raw
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
