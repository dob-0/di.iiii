// @vitest-environment node

// Opening a project is a read. It never writes document.json.
//
// Audit 2026-10-09 (06-data-integrity F3): readProjectDocument — what GET
// /api/projects/:id/document, the space listing and the place routes call —
// normalised the document and, when the result differed from the file, wrote it
// back with no project lock. Two things followed:
//   (a) a field this build does not know (written by a newer build, before a
//       `di update --rollback`) was deleted by the first view;
//   (b) a read racing a locked save could put the pre-save document back after
//       the save's rename, so the database said vN and document.json missed the
//       edit (2–6 of 300 tries in the audit's runs).
// What these tests hold: a read leaves the file's bytes and mtime alone; a
// field this build does not know rides through a read AND a save; a read
// racing a save loses no edit.

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./projectStore.js')
const { initDb, closeDb, getDb } = require('./db.js')
const { withProjectWriteLock, commitProjectWrite } = require('./projectWrite.js')
const { applyProjectOps } = require('../../shared/projectSchema.cjs')

const SPACE = 'room'
const PROJECT = 'piece'
const quietLog = { info() {}, warn() {}, error() {} }
const tempDirs = []

const makeSpacesDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-project-read-'))
    tempDirs.push(dir)
    return dir
}

const documentVersion = () => Number(getDb().prepare('SELECT document_version AS v FROM projects WHERE id = ?').get(PROJECT).v)

// A save, exactly as POST /api/projects/:id/ops does it: under the project's
// write lock, read the current document, apply the ops, commit staged.
const save = (spacesDir, ops) => withProjectWriteLock({ spacesDir, spaceId: SPACE, projectId: PROJECT, log: quietLog }, async () => {
    const baseVersion = documentVersion()
    const current = await store.readProjectDocument(spacesDir, SPACE, PROJECT)
    const versioned = ops.map((op, index) => ({ timestamp: Date.now(), ...op, version: baseVersion + index + 1 }))
    return commitProjectWrite({
        spacesDir, spaceId: SPACE, projectId: PROJECT, baseVersion, ops: versioned,
        document: applyProjectOps(current, versioned), log: quietLog
    })
})

// Put on disk what another build (newer, older) or an import left: a top-level
// section and an entity field this build does not know, and a known section
// missing, so the normalised form surely differs from the file.
const writeForeignDocument = async (documentPath, extra = {}) => {
    const doc = JSON.parse(await readFile(documentPath, 'utf8'))
    doc.timelineState = { cues: [{ id: 'cue-1', at: 12.5 }] }
    doc.entities.push({ id: 'from-newer', type: 'box', name: 'Box', futureField: { keep: true } })
    delete doc.showState
    Object.assign(doc, extra)
    await writeFile(documentPath, JSON.stringify(doc))
}

beforeEach(() => {
    initDb(':memory:')
})

afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('reading a project never writes its document', () => {
    it('leaves document.json byte-for-byte and its mtime unchanged', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'Piece' })
        const { documentPath } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        await writeForeignDocument(documentPath)
        const bytesBefore = await readFile(documentPath)
        const mtimeBefore = (await stat(documentPath)).mtimeMs

        const document = await store.readProjectDocument(spacesDir, SPACE, PROJECT)

        // The answer is the normalised document (the missing section is filled in)…
        expect(document.showState).toBeTruthy()
        expect(document.projectMeta.id).toBe(PROJECT)
        // …and the file is exactly what it was.
        expect((await readFile(documentPath)).equals(bytesBefore)).toBe(true)
        expect((await stat(documentPath)).mtimeMs).toBe(mtimeBefore)
    })

    it('keeps a field this build does not know through a read and then a save', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'Piece' })
        const { documentPath } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        await writeForeignDocument(documentPath)

        const read = await store.readProjectDocument(spacesDir, SPACE, PROJECT)
        expect(read.timelineState).toEqual({ cues: [{ id: 'cue-1', at: 12.5 }] })
        expect(read.entities.find(e => e.id === 'from-newer').futureField).toEqual({ keep: true })

        const result = await save(spacesDir, [{ opId: 'add-1', type: 'createEntity', payload: { entity: { id: 'added', type: 'sphere' } } }])
        expect(result.ok).toBe(true)

        const onDisk = JSON.parse(await readFile(documentPath, 'utf8'))
        expect(onDisk.timelineState).toEqual({ cues: [{ id: 'cue-1', at: 12.5 }] })
        expect(onDisk.entities.find(e => e.id === 'from-newer').futureField).toEqual({ keep: true })
        expect(onDisk.entities.some(e => e.id === 'added')).toBe(true)
        // The save is where normalisation lands on disk.
        expect(onDisk.showState).toBeTruthy()
    })

    it('a read racing a save loses no committed edit (300 tries)', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'Piece' })
        const { documentPath } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        const TRIES = 300
        const lost = []
        for (let i = 0; i < TRIES; i += 1) {
            // Each round the file differs from its normalised form, so a read
            // that writes back would write.
            const doc = JSON.parse(await readFile(documentPath, 'utf8'))
            delete doc.showState
            doc.legacyField = i
            await writeFile(documentPath, JSON.stringify(doc))

            const entityId = `e${i}`
            const writer = save(spacesDir, [{ opId: `op-${i}`, type: 'createEntity', payload: { entity: { id: entityId, type: 'box' } } }])
            const reader = (async () => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 3))
                return store.readProjectDocument(spacesDir, SPACE, PROJECT)
            })()
            const [written] = await Promise.all([writer, reader])
            expect(written.ok).toBe(true)
            const onDisk = JSON.parse(await readFile(documentPath, 'utf8'))
            if (!onDisk.entities.some(e => e.id === entityId)) lost.push(i)
        }
        const onDisk = JSON.parse(await readFile(documentPath, 'utf8'))
        expect(documentVersion()).toBe(TRIES)
        expect(lost).toEqual([])
        expect(onDisk.entities).toHaveLength(TRIES)
    }, 60_000)
})
