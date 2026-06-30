// space_links — binds a di.iiii space to a GitHub repo for the one-click sync
// flow. One link per space. Spec: docs/architecture/SPEC_github_app_one_click.md.

const { getDb } = require('./db')

const toPublic = (row) => row && ({
  spaceId: row.space_id,
  owner: row.owner,
  repo: row.repo,
  ref: row.ref || null,
  projectId: row.project_id,
  entry: row.entry || 'index.html',
  installationId: row.installation_id || null,
  lastSyncSha: row.last_sync_sha || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const upsertLink = ({ spaceId, owner, repo, ref = null, projectId, entry = 'index.html', installationId = null }) => {
  const now = Date.now()
  getDb().prepare(
    `INSERT INTO space_links (space_id, owner, repo, ref, project_id, entry, installation_id, last_sync_sha, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(space_id) DO UPDATE SET
       owner=excluded.owner, repo=excluded.repo, ref=excluded.ref,
       project_id=excluded.project_id, entry=excluded.entry,
       installation_id=excluded.installation_id, updated_at=excluded.updated_at`
  ).run(spaceId, owner, repo, ref, projectId, entry, installationId, now, now)
  return getLinkBySpace(spaceId)
}

const getLinkBySpace = (spaceId) =>
  toPublic(getDb().prepare('SELECT * FROM space_links WHERE space_id = ?').get(spaceId))

const getLinksByRepo = (owner, repo) =>
  getDb().prepare('SELECT * FROM space_links WHERE lower(owner) = lower(?) AND lower(repo) = lower(?)').all(owner, repo).map(toPublic)

const listLinks = () =>
  getDb().prepare('SELECT * FROM space_links ORDER BY updated_at DESC').all().map(toPublic)

const removeLink = (spaceId) =>
  getDb().prepare('DELETE FROM space_links WHERE space_id = ?').run(spaceId).changes > 0

const setLastSyncSha = (spaceId, sha) =>
  getDb().prepare('UPDATE space_links SET last_sync_sha = ?, updated_at = ? WHERE space_id = ?').run(sha, Date.now(), spaceId)

module.exports = { upsertLink, getLinkBySpace, getLinksByRepo, listLinks, removeLink, setLastSyncSha }
