// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, getDb, closeDb } = require('./db.js')

afterEach(() => {
    closeDb()
})

describe('db: op-log version uniqueness (2026-07-16 audit fix)', () => {
    it('rejects a second row with the same (space_id, version) via the UNIQUE index', () => {
        const db = initDb(':memory:')
        const now = Date.now()
        db.prepare('INSERT INTO spaces (id, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?)')
            .run('space-a', now, now, now)
        db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run('space-a', 1, '{"a":1}', now)
        expect(() => {
            db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
                .run('space-a', 1, '{"b":2}', now)
        }).toThrow(/UNIQUE constraint/i)
    })

    it('rejects a second row with the same (project_id, version) via the UNIQUE index', () => {
        const db = initDb(':memory:')
        const now = Date.now()
        db.prepare('INSERT INTO spaces (id, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?)')
            .run('space-a', now, now, now)
        db.prepare('INSERT INTO projects (id, space_id, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?)')
            .run('project-a', 'space-a', now, now, now)
        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run('project-a', 1, '{"a":1}', now)
        expect(() => {
            db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
                .run('project-a', 1, '{"b":2}', now)
        }).toThrow(/UNIQUE constraint/i)
    })
})

describe('db: dedupeAndUniqueOps migration', () => {
    it('dedupes pre-existing duplicate-version rows (keeping the highest seq) before enforcing uniqueness', () => {
        // Simulate a DB that already has the pre-fix duplicate-version rows
        // the lost-update race could produce, by building the schema by hand
        // with the OLD non-unique index, inserting a real duplicate, then
        // running initDb again on the same file-backed db to trigger the
        // migration exactly as a real upgraded deployment would.
        const path = require('node:path')
        const os = require('node:os')
        const fs = require('node:fs')
        const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dii-db-migration-')), 'test.db')

        const pre = initDb(dbPath)
        const now = Date.now()
        pre.prepare('INSERT INTO spaces (id, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?)')
            .run('space-a', now, now, now)
        // Migration already ran once via this initDb call (making the index
        // UNIQUE) — drop back to a plain index so a duplicate insert is
        // possible, reproducing the pre-fix on-disk state.
        pre.exec('DROP INDEX IF EXISTS idx_space_ops')
        pre.exec('CREATE INDEX IF NOT EXISTS idx_space_ops ON space_ops(space_id, version)')
        pre.prepare('DELETE FROM migrations WHERE key = ?').run('v4_unique_ops_version')
        pre.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run('space-a', 1, '{"stale":true}', now)
        pre.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run('space-a', 1, '{"stale":false,"winner":true}', now + 1)
        closeDb()

        // Re-opening runs initDb's migrations again, including dedupeAndUniqueOps.
        const post = initDb(dbPath)
        const rows = post.prepare('SELECT data FROM space_ops WHERE space_id = ? AND version = 1').all('space-a')
        expect(rows).toHaveLength(1)
        expect(JSON.parse(rows[0].data)).toEqual({ stale: false, winner: true })

        // And the index is now genuinely unique — a fresh duplicate insert fails.
        expect(() => {
            post.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
                .run('space-a', 1, '{"another":true}', now)
        }).toThrow(/UNIQUE constraint/i)

        fs.rmSync(path.dirname(dbPath), { recursive: true, force: true })
    })
})
