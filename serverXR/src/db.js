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

  CREATE TABLE IF NOT EXISTS space_sync_keys (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    owner_user_id TEXT,
    secret_hash TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sync_keys_space ON space_sync_keys(space_id);

  CREATE TABLE IF NOT EXISTS space_invites (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    created_by_user_id TEXT,
    secret_hash TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked INTEGER NOT NULL DEFAULT 0,
    use_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_space_invites_space ON space_invites(space_id);

  CREATE TABLE IF NOT EXISTS space_links (
    space_id TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    ref TEXT,
    project_id TEXT NOT NULL,
    entry TEXT NOT NULL DEFAULT 'index.html',
    installation_id INTEGER,
    last_sync_sha TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_space_links_repo ON space_links(owner, repo);

  CREATE TABLE IF NOT EXISTS user_drive_tokens (
    user_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'google',
    email TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_ai_connections (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    label TEXT,
    api_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    node_id TEXT,
    project_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_chats_user ON ai_chats (user_id, updated_at);

  CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_messages_chat ON ai_messages (chat_id, created_at);

  CREATE TABLE IF NOT EXISTS mesh_room_lines (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    from_id TEXT NOT NULL DEFAULT '',
    payload TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mesh_room_lines_room ON mesh_room_lines (room_id);

  CREATE TABLE IF NOT EXISTS space_chat_lines (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    user_name TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_space_chat_lines_space ON space_chat_lines (space_id);

  CREATE TABLE IF NOT EXISTS public_assets (
    asset_id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    license TEXT,
    shared_by TEXT,
    shared_by_label TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_public_assets_name ON public_assets(name);

  CREATE TABLE IF NOT EXISTS open_call_applications (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_open_call_applications_call ON open_call_applications(call_id, created_at);

  CREATE TABLE IF NOT EXISTS migrations (
    key TEXT PRIMARY KEY,
    completed_at INTEGER NOT NULL
  );

  -- A gated write pauses here instead of running immediately. See approvalGate.js.
  CREATE TABLE IF NOT EXISTS pending_actions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    args TEXT NOT NULL,
    intent_hash TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    actor_subject TEXT,
    actor_type TEXT NOT NULL,
    actor_role TEXT,
    actor_label TEXT,
    request_method TEXT NOT NULL,
    request_path TEXT NOT NULL,
    request_ip TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_token_hash TEXT NOT NULL,
    decided_by TEXT,
    decided_at INTEGER,
    decision_note TEXT,
    notify_status TEXT NOT NULL DEFAULT 'queued',
    notify_attempts INTEGER NOT NULL DEFAULT 0,
    notified_at INTEGER,
    executed_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_pending_actions_actor ON pending_actions(actor_subject, created_at);

  -- Anonymous usage counts, aggregate-only by design: no IP, no user agent,
  -- no session/user id, no cookie — nothing linkable to a person. path is
  -- pathname-only, referrer_host is hostname-only. See trackRoutes.js and
  -- docs/ai/privacy-data-inventory.md.
  CREATE TABLE IF NOT EXISTS page_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    path TEXT,
    referrer_host TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_page_events_type_created ON page_events(event_type, created_at);
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

/**
 * What shape this build expects the database to be in.
 *
 * Bump it when a change would make an OLDER build misread this data — not for
 * every schema edit. Adding a column is invisible to older code, which simply
 * ignores it. Rewriting what a value MEANS is not: `v2_user_is_unrestricted`
 * turned every `spaces = 'null'` (the old spelling of "unrestricted") into
 * `'[]'` plus a flag, and a build from before that reads `'[]'` as "no access
 * to anything". It would not crash. It would quietly lock people out of their
 * own spaces, and nothing anywhere would say why.
 *
 * So the database says how far forward it has come, and a build that cannot
 * read that far refuses to open it rather than guessing. That refusal is the
 * whole point: `di update --rollback` restores the app, and the app is not the
 * only thing an update moved.
 *
 * 1 — the baseline, stamped 2026-08-19. Existing databases are stamped on
 *     first open; they are already at this shape.
 */
const SCHEMA_VERSION = 1

// The escape hatch, documented rather than hidden: if you have restored an old
// database on purpose, or you are recovering and you know what the difference
// is, this lets the build open data from the future anyway.
const ALLOW_OLDER_CODE = () => process.env.DI_ALLOW_OLDER_CODE === '1'

const readSchemaVersion = (db) => {
  const row = db.prepare('PRAGMA user_version').get()
  return Number(row?.user_version ?? 0)
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

// Before the per-space/per-project write lock (asyncLock.js) was added, a
// concurrent-write race could append two op rows sharing the same (id,
// version) — nothing ever rejected it, since the index on (id, version) was
// never UNIQUE. Dedupe any that already exist (keep the highest `seq`, i.e.
// the most recently inserted — insertion order via AUTOINCREMENT is the only
// ordering signal available once two rows share a version) before making the
// index UNIQUE, since CREATE UNIQUE INDEX fails outright on existing
// duplicates. Runs once (guarded by the migrations table).
function dedupeAndUniqueOps(db) {
  const KEY = 'v4_unique_ops_version'
  if (db.prepare('SELECT 1 FROM migrations WHERE key = ?').get(KEY)) return
  db.transaction(() => {
    db.exec('DELETE FROM space_ops WHERE seq NOT IN (SELECT MAX(seq) FROM space_ops GROUP BY space_id, version)')
    db.exec('DELETE FROM project_ops WHERE seq NOT IN (SELECT MAX(seq) FROM project_ops GROUP BY project_id, version)')
    db.exec('DROP INDEX IF EXISTS idx_space_ops')
    db.exec('DROP INDEX IF EXISTS idx_project_ops')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_space_ops ON space_ops(space_id, version)')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_ops ON project_ops(project_id, version)')
  })()
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
  // BEFORE any migration runs: is this data from a build newer than this one?
  const found = readSchemaVersion(db)
  if (found > SCHEMA_VERSION && !ALLOW_OLDER_CODE()) {
    try { db.close() } catch { /* closing a database we are refusing to use */ }
    throw new Error(
      `This di.iiii is older than its data.\n`
      + `  the database is at schema ${found}, this build reads ${SCHEMA_VERSION}\n`
      + `  ${dbPath}\n\n`
      + `Nothing has been changed. A newer version wrote this data, and reading it\n`
      + `with this one would not crash — it would misread it, quietly.\n\n`
      + `  go forward again:   di update\n`
      + `  or restore the snapshot taken before that update:  di restore --snapshot\n`
      + `  or, if you know the difference and accept it:      DI_ALLOW_OLDER_CODE=1`
    )
  }

  db.exec(SCHEMA)
  ensureColumn(db, 'ai_chats', 'claude_session_id', 'TEXT')
  ensureColumn(db, 'spaces', 'is_public', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'spaces', 'kind', "TEXT NOT NULL DEFAULT 'normal'")
  ensureColumn(db, 'spaces', 'owner_user_id', 'TEXT')
  ensureColumn(db, 'spaces', 'preview_image_asset_id', 'TEXT')
  ensureColumn(db, 'spaces', 'open_inscriptions', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'spaces', 'slug', 'TEXT')
  ensureColumn(db, 'projects', 'slug', 'TEXT')
  ensureColumn(db, 'users', 'spaces', 'TEXT')
  ensureColumn(db, 'users', 'is_unrestricted', 'INTEGER NOT NULL DEFAULT 0')
  // Bumped on logout so already-issued session cookies stop verifying — they
  // are self-contained and signature-valid until their TTL, so without this a
  // cookie copied before logout still worked on every other device.
  ensureColumn(db, 'users', 'token_version', 'INTEGER NOT NULL DEFAULT 0')
  backfillUserUnrestricted(db)
  backfillGlobalSpace(db)
  dedupeAndUniqueOps(db)
  // Nullable, independently-renameable public handle distinct from the
  // immutable id (docs/architecture/SPEC_space_urls_and_portability.md) —
  // WHERE slug IS NOT NULL so unset spaces/projects (the common case) never
  // collide against each other on the NULL value.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_slug ON spaces(slug) WHERE slug IS NOT NULL')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(space_id, slug) WHERE slug IS NOT NULL')
  // Stamped last, so a run that dies half way through leaves the old number and
  // the next start finishes the job rather than believing it already did.
  if (found !== SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
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

module.exports = { initDb, getDb, closeDb, SCHEMA_VERSION, readSchemaVersion }
