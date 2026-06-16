const path = require('node:path')
const fsp = require('node:fs/promises')
const { readJson } = require('./jsonStore')
const { getDb } = require('./db')

const MIGRATION_KEY = 'v1_filesystem'

async function migrateFromFilesystem(spacesDir) {
  const db = getDb()

  if (db.prepare('SELECT 1 FROM migrations WHERE key = ?').get(MIGRATION_KEY)) {
    return { skipped: true }
  }

  // Phase 1: read everything from disk (async)
  const spaces = []
  const entries = await fsp.readdir(spacesDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const spaceId = entry.name
    const spaceDir = path.join(spacesDir, spaceId)

    const meta = await readJson(path.join(spaceDir, 'meta.json'), null)
    if (!meta) continue

    const spaceOps = await readJson(path.join(spaceDir, 'ops.json'), [])
    const projects = []

    const projectEntries = await fsp.readdir(path.join(spaceDir, 'projects'), { withFileTypes: true }).catch(() => [])
    for (const pEntry of projectEntries) {
      if (!pEntry.isDirectory()) continue
      const projectId = pEntry.name
      const projectDir = path.join(spaceDir, 'projects', projectId)

      const projectMeta = await readJson(path.join(projectDir, 'project.json'), null)
      if (!projectMeta) continue

      const projectOps = await readJson(path.join(projectDir, 'ops.json'), [])
      projects.push({ projectId, meta: projectMeta, ops: projectOps })
    }

    spaces.push({ spaceId, meta, ops: spaceOps, projects })
  }

  // Phase 2: write everything to SQLite in one transaction (synchronous)
  let spacesImported = 0
  let projectsImported = 0
  let opsImported = 0

  const insertSpace = db.prepare(`
    INSERT OR IGNORE INTO spaces (id, label, permanent, allow_edits, published_project_id, scene_version, created_at, updated_at, last_touched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSpaceOp = db.prepare(
    'INSERT OR IGNORE INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)'
  )
  const insertProject = db.prepare(`
    INSERT OR IGNORE INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertProjectOp = db.prepare(
    'INSERT OR IGNORE INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)'
  )

  db.transaction(() => {
    for (const { spaceId, meta, ops, projects } of spaces) {
      try {
        insertSpace.run(
          spaceId,
          meta.label ?? spaceId,
          meta.permanent ? 1 : 0,
          meta.allowEdits !== false ? 1 : 0,
          meta.publishedProjectId ?? null,
          meta.sceneVersion ?? 0,
          meta.createdAt ?? Date.now(),
          meta.updatedAt ?? Date.now(),
          meta.lastTouchedAt ?? meta.updatedAt ?? Date.now()
        )
        spacesImported++
      } catch (err) {
        console.warn(`[migrate] Skipping space ${spaceId}: ${err.message}`)
        continue
      }

      if (Array.isArray(ops)) {
        for (const op of ops) {
          try {
            insertSpaceOp.run(spaceId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? Date.now())
            opsImported++
          } catch (err) {
            console.warn(`[migrate] Skipping space op v${op.version} in ${spaceId}: ${err.message}`)
          }
        }
      }

      for (const { projectId, meta: pm, ops: po } of projects) {
        try {
          insertProject.run(
            projectId,
            spaceId,
            pm.title ?? 'Untitled Project',
            pm.documentVersion ?? 0,
            pm.source ?? 'project',
            pm.createdAt ?? Date.now(),
            pm.updatedAt ?? Date.now(),
            pm.lastTouchedAt ?? pm.updatedAt ?? Date.now()
          )
          projectsImported++
        } catch (err) {
          console.warn(`[migrate] Skipping project ${projectId}: ${err.message}`)
          continue
        }

        if (Array.isArray(po)) {
          for (const op of po) {
            try {
              insertProjectOp.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? Date.now())
              opsImported++
            } catch (err) {
              console.warn(`[migrate] Skipping project op v${op.version} in ${projectId}: ${err.message}`)
            }
          }
        }
      }
    }

    db.prepare('INSERT OR REPLACE INTO migrations (key, completed_at) VALUES (?, ?)').run(MIGRATION_KEY, Date.now())
  })()

  console.log(`[migrate] Imported ${spacesImported} spaces, ${projectsImported} projects, ${opsImported} ops`)
  return { spacesImported, projectsImported, opsImported }
}

module.exports = { migrateFromFilesystem }
