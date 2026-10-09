// projectMove.js — move one project from its space to another, in place.
//
// The one implementation behind both the product route
// (POST /api/projects/:projectId/move) and the offline script
// (scripts/project-move.mjs). Everything the script's header explains still
// holds: a project id is global, so the row is updated in place, project_ops
// (keyed by project_id only) needs no copying, and what actually moves is
//   - the `projects` row: space_id, collection_id cleared (a shelf belongs to
//     one space), position to the end of the target's order;
//   - the project directory `<space>/projects/<id>/`;
//   - the bytes the project needs from its OLD space: content-addressed blobs
//     (space blob store) and space-scoped assets its document links by URL
//     (`/api/spaces/<old>/assets/<id>`, rewritten to the new space).
//
// ATOMIC. Order matters, and every step before the database commit can be
// undone: (1) additive copies into the target space (blobs, space assets —
// harmless leftovers if a later step fails); (2) the directory is renamed;
// (3) the rewritten documents are written tmp-then-rename; (4) ONE database
// transaction changes the row, clears the front door if asked, and writes the
// project_moves line. If (2)–(4) throws, the directory and the document texts
// are put back exactly as they were and the error is rethrown.
//
// A slug clash is REFUSED by default (`onSlugClash: 'refuse'`, 409). The
// offline script keeps its older choice, `'drop'`.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

class MoveRefused extends Error {
  constructor(status, message, code) {
    super(message)
    this.name = 'MoveRefused'
    this.status = status
    this.code = code
  }
}

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i
const ASSET_ID_IN_URL_RE = /[a-f0-9-]{8,64}/i
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const remapSpaceUrls = (text, oldId, newId) =>
  oldId === newId ? text : text.split(`/api/spaces/${oldId}/`).join(`/api/spaces/${newId}/`)

const moveDir = async (from, to) => {
  try {
    await fsp.rename(from, to)
    return 'rename'
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fsp.cp(from, to, { recursive: true })
    await fsp.rm(from, { recursive: true, force: true })
    return 'copy'
  }
}

const copyIfMissing = async (from, to) => {
  if (!fs.existsSync(from) || fs.existsSync(to)) return false
  await fsp.mkdir(path.dirname(to), { recursive: true })
  await fsp.copyFile(from, to)
  return true
}

const writeAtomic = async (file, text) => {
  const tmp = `${file}.move-${process.pid}.tmp`
  await fsp.writeFile(tmp, text)
  await fsp.rename(tmp, file)
}

/**
 * @param {object} o
 * @param {object} o.db            node:sqlite-style handle (prepare, transaction)
 * @param {string} o.spacesDir
 * @param {string} o.projectId
 * @param {string} o.toSpaceId
 * @param {boolean} [o.unpublish]  allow moving the source space's front door project
 * @param {boolean} [o.dryRun]
 * @param {'refuse'|'drop'} [o.onSlugClash]
 * @returns the report: { dryRun, projectId, fromSpaceId, toSpaceId, position, slug, slugDropped, wasPublished, blobAssets, spaceAssets, urlsRewritten, blobsCopied, spaceAssetsCopied, movedAt }
 * @throws MoveRefused (status 400/404/409) when the move may not happen
 */
async function moveProjectBetweenSpaces({ db, spacesDir, projectId, toSpaceId, unpublish = false, dryRun = false, onSlugClash = 'refuse' }) {
  if (!projectId) throw new MoveRefused(400, 'project-move needs a project id', 'no_project')
  if (!toSpaceId) throw new MoveRefused(400, '--to <spaceId> is required', 'no_target')

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  if (!project) throw new MoveRefused(404, `project "${projectId}" not found`, 'project_not_found')
  const fromSpaceId = project.space_id

  const targetSpace = db.prepare('SELECT * FROM spaces WHERE id = ? AND deleted_at IS NULL').get(toSpaceId)
  if (!targetSpace) throw new MoveRefused(404, `target space "${toSpaceId}" not found`, 'target_not_found')
  if (fromSpaceId === toSpaceId) throw new MoveRefused(400, `project "${projectId}" is already in space "${toSpaceId}"`, 'same_space')

  const sourceSpace = db.prepare('SELECT * FROM spaces WHERE id = ?').get(fromSpaceId)
  if (!sourceSpace) throw new MoveRefused(409, `project "${projectId}" points at space "${fromSpaceId}", which does not exist — fix the data before moving it`, 'source_missing')

  const isPublished = sourceSpace.published_project_id === projectId
  if (isPublished && !unpublish) {
    throw new MoveRefused(409,
      `space "${fromSpaceId}" currently shows this project to visitors (published_project_id) — `
      + `moving it would silently change what the space's front door shows.\n`
      + `  pass --unpublish to move it anyway and clear the source space's published project`, 'is_published')
  }

  // (space_id, slug) is unique. The product route refuses a clash; the offline
  // script drops the slug (the id link and the project_moves pointer still work).
  const originalSlug = project.slug || null
  let slugDropped = false
  if (originalSlug) {
    const collision = db.prepare('SELECT id FROM projects WHERE space_id = ? AND slug = ? AND id != ?').get(toSpaceId, originalSlug, projectId)
    if (collision) {
      if (onSlugClash === 'drop') slugDropped = true
      else throw new MoveRefused(409, `space "${toSpaceId}" already has a project with the slug "${originalSlug}" ("${collision.id}") — rename one of them first`, 'slug_clash')
    }
  }

  const maxPos = db.prepare('SELECT MAX(position) AS top FROM projects WHERE space_id = ?').get(toSpaceId)
  const newPosition = (maxPos?.top ?? -1) + 1

  const sourceSpaceDir = path.join(spacesDir, fromSpaceId)
  const targetSpaceDir = path.join(spacesDir, toSpaceId)
  const sourceProjectDir = path.join(sourceSpaceDir, 'projects', projectId)
  const targetProjectDir = path.join(targetSpaceDir, 'projects', projectId)
  if (fs.existsSync(targetProjectDir)) throw new MoveRefused(409, `target already has a directory at ${targetProjectDir} — refusing to overwrite`, 'target_dir_exists')

  // ---- gather the asset work up front so a dry run reports it truthfully ----
  const blobAssetIds = []
  const projectAssetsDir = path.join(sourceProjectDir, 'assets')
  if (fs.existsSync(projectAssetsDir)) {
    for (const name of fs.readdirSync(projectAssetsDir)) {
      if (!name.endsWith('.json')) continue
      const assetId = name.slice(0, -'.json'.length)
      if (!SHA256_HEX_REGEX.test(assetId)) continue
      if (fs.existsSync(path.join(projectAssetsDir, assetId))) continue // legacy local binary — moves with the dir
      blobAssetIds.push(assetId)
    }
  }

  const docNames = ['document.json', 'project.json'].filter((name) => fs.existsSync(path.join(sourceProjectDir, name)))
  const docTexts = new Map()
  const spaceAssetIds = new Set()
  let needsUrlRewrite = false
  for (const name of docNames) {
    const text = fs.readFileSync(path.join(sourceProjectDir, name), 'utf8')
    docTexts.set(name, text)
    if (!text.includes(`/api/spaces/${fromSpaceId}/`)) continue
    needsUrlRewrite = true
    const re = new RegExp(`/api/spaces/${escapeRegExp(fromSpaceId)}/assets/(${ASSET_ID_IN_URL_RE.source})`, 'gi')
    let m
    while ((m = re.exec(text))) spaceAssetIds.add(m[1])
  }

  const report = {
    dryRun, projectId, fromSpaceId, toSpaceId,
    position: newPosition, slug: slugDropped ? null : originalSlug, originalSlug, slugDropped,
    wasPublished: isPublished,
    blobAssets: blobAssetIds.length, spaceAssets: spaceAssetIds.size, urlsRewritten: needsUrlRewrite,
    hadDirectory: fs.existsSync(sourceProjectDir),
    blobsCopied: 0, spaceAssetsCopied: 0, movedAt: null
  }
  if (dryRun) return report

  // (1) additive copies — nothing here is undone on failure (content-addressed
  // or space-scoped files nobody else reads from the target yet; gc handles them).
  if (blobAssetIds.length) {
    await fsp.mkdir(path.join(targetSpaceDir, 'blobs'), { recursive: true })
    for (const assetId of blobAssetIds) {
      if (await copyIfMissing(path.join(sourceSpaceDir, 'blobs', assetId), path.join(targetSpaceDir, 'blobs', assetId))) report.blobsCopied++
    }
  }
  if (needsUrlRewrite) {
    for (const assetId of spaceAssetIds) {
      const a = await copyIfMissing(path.join(sourceSpaceDir, 'assets', assetId), path.join(targetSpaceDir, 'assets', assetId))
      const b = await copyIfMissing(path.join(sourceSpaceDir, 'assets', `${assetId}.json`), path.join(targetSpaceDir, 'assets', `${assetId}.json`))
      if (a || b) report.spaceAssetsCopied++
    }
  }

  // (2)-(4) all-or-nothing.
  let movedDir = false
  let movedBy = null
  try {
    if (report.hadDirectory) {
      await fsp.mkdir(path.dirname(targetProjectDir), { recursive: true })
      movedBy = await moveDir(sourceProjectDir, targetProjectDir)
      movedDir = true
      if (needsUrlRewrite) {
        for (const [name, text] of docTexts) {
          const file = path.join(targetProjectDir, name)
          if (fs.existsSync(file)) await writeAtomic(file, remapSpaceUrls(text, fromSpaceId, toSpaceId))
        }
      }
    }
    const now = Date.now()
    db.transaction(() => {
      db.prepare('UPDATE projects SET space_id = ?, slug = ?, collection_id = NULL, position = ?, updated_at = ? WHERE id = ?')
        .run(toSpaceId, slugDropped ? null : originalSlug, newPosition, now, projectId)
      if (isPublished) db.prepare('UPDATE spaces SET published_project_id = NULL, updated_at = ? WHERE id = ?').run(now, fromSpaceId)
      db.prepare('INSERT INTO project_moves (project_id, from_space, to_space, old_slug, moved_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, fromSpaceId, toSpaceId, originalSlug, now)
    })()
    report.movedAt = now
  } catch (error) {
    if (movedDir) {
      // Put everything back as it was. Restore the document texts first (they
      // were read before any rewrite), then the directory.
      try {
        for (const [name, text] of docTexts) {
          const file = path.join(targetProjectDir, name)
          if (fs.existsSync(file)) await writeAtomic(file, text)
        }
        if (movedBy === 'rename') await fsp.rename(targetProjectDir, sourceProjectDir)
        else { await fsp.cp(targetProjectDir, sourceProjectDir, { recursive: true }); await fsp.rm(targetProjectDir, { recursive: true, force: true }) }
      } catch (undoError) {
        error.message += ` (and the undo failed: ${undoError.message} — the project directory is at ${targetProjectDir})`
      }
    }
    throw error
  }
  return report
}

module.exports = { moveProjectBetweenSpaces, MoveRefused }
