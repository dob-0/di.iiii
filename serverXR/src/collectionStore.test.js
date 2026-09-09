// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// require, not import: these stores are CommonJS, and an ESM import of ./db.js
// beside their require of it gives two module instances — the test initialises
// one database and the store looks in the other.
const require = createRequire(import.meta.url)
const api = () => require('./collectionStore.js')
const { initDb, closeDb, getDb } = require('./db.js')

// The shelf inside a space. These are the rules that keep a collection from
// quietly becoming a second, weaker kind of space.
beforeEach(() => {
    initDb(':memory:')
    const db = getDb()
    const space = db.prepare('INSERT OR IGNORE INTO spaces (id, label, permanent, allow_edits, scene_version, created_at, updated_at, last_touched_at) VALUES (?, ?, 1, 1, 0, ?, ?, ?)')
    space.run('main', 'main', 1, 1, 1)
    space.run('other', 'other', 1, 1, 1)
})

afterEach(() => { closeDb() })

describe('collections', () => {
    it('names a shelf as it was typed, and gives it an id nobody has to read', () => {
        const shelf = api().createCollection('main', '  Open call 2026  ')
        expect(shelf.label).toBe('Open call 2026')
        expect(shelf.id).toMatch(/^[a-z0-9-]+$/)
        expect(shelf.spaceId).toBe('main')
    })

    it('refuses a shelf with no name — an unnamed shelf is a pile', () => {
        expect(() => api().createCollection('main', '   ')).toThrow()
    })

    it('lets two spaces have a shelf of the same name without colliding', () => {
        const here = api().createCollection('main', 'Week one')
        const there = api().createCollection('other', 'Week one')
        expect(here.id).not.toBe(there.id)
        expect(api().listCollections('main').map(c => c.id)).toEqual([here.id])
        expect(api().listCollections('other').map(c => c.id)).toEqual([there.id])
    })

    it('lets one space have two shelves with the same name, because people do that', () => {
        const first = api().createCollection('main', 'Entries')
        const second = api().createCollection('main', 'Entries')
        expect(second.id).not.toBe(first.id)
        expect(second.label).toBe('Entries')
    })

    it('keeps the order it is given, whole — not as a series of swaps', () => {
        const a = api().createCollection('main', 'A')
        const b = api().createCollection('main', 'B')
        const c = api().createCollection('main', 'C')
        expect(api().listCollections('main').map(x => x.id)).toEqual([a.id, b.id, c.id])

        api().reorderCollections('main', [c.id, a.id, b.id])
        expect(api().listCollections('main').map(x => x.id)).toEqual([c.id, a.id, b.id])
    })

    it('ignores an id from another space in a reorder instead of stealing it', () => {
        const mine = api().createCollection('main', 'Mine')
        const theirs = api().createCollection('other', 'Theirs')
        api().reorderCollections('main', [theirs.id, mine.id])
        expect(api().listCollections('main').map(x => x.id)).toEqual([mine.id])
        expect(api().getCollection(theirs.id).spaceId).toBe('other')
    })

    it('renaming changes the name and never the id — a url outlives a title', () => {
        const shelf = api().createCollection('main', 'Untitled shelf')
        const renamed = api().renameCollection(shelf.id, 'The 2026 open call')
        expect(renamed.id).toBe(shelf.id)
        expect(renamed.label).toBe('The 2026 open call')
    })
})

describe('the archive that was five titles', () => {
    it('turns "[archived] ops board" into a real state and gives the name back', () => {
        const db = getDb()
        db.prepare("INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES ('ops-board','main','[archived] ops board',0,'project',1,1,1)").run()
        db.prepare("INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES ('live-one','main','ops board',0,'project',1,1,1)").run()
        // the migration runs on open; re-run it against this database
        db.prepare("DELETE FROM migrations WHERE key = 'v3_archived_title_to_state'").run()
        const { runArchiveBackfill } = require('./db.js')
        runArchiveBackfill(db)

        const archived = db.prepare("SELECT title, state FROM projects WHERE id = 'ops-board'").get()
        expect(archived.title).toBe('ops board')
        expect(archived.state).toBe('archived')

        const untouched = db.prepare("SELECT title, state FROM projects WHERE id = 'live-one'").get()
        expect(untouched.title).toBe('ops board')
        expect(untouched.state).toBe('live')
    })
})
