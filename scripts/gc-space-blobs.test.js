import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'gc-space-blobs.mjs')

const HELD_BY_MARKUP = 'a'.repeat(64)
const HELD_BY_ARCHIVE = 'b'.repeat(64)
const TRULY_UNREFERENCED = 'c'.repeat(64)

const tempDirs = []
afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

// An image dropped into a rich-text field is stored as
// <img src="/serverXR/api/projects/<pid>/assets/<sha>"> and appears in no asset
// list. When the project named in that URL has since been deleted its assets/
// manifest went with it, so a scan of manifests alone calls the blob garbage
// while a live document still displays it.
//
// On 2026-08-08 that put four stills of the br_id_ge rite on the deletion list.
// They existed nowhere else.
const makeSpaces = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-gc-'))
    tempDirs.push(root)
    const spaces = path.join(root, 'spaces')
    const space = path.join(spaces, 'a-space')

    fs.mkdirSync(path.join(space, 'blobs'), { recursive: true })
    for (const hash of [HELD_BY_MARKUP, HELD_BY_ARCHIVE, TRULY_UNREFERENCED]) {
        fs.writeFileSync(path.join(space, 'blobs', hash), hash)
    }

    // A live project whose own assets/ is empty: its only reference to the blob
    // is markup pointing at a project that no longer exists.
    const live = path.join(space, 'projects', 'still-here')
    fs.mkdirSync(path.join(live, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(live, 'document.json'), JSON.stringify({
        entities: {
            page: {
                html: `<figure><img src="/serverXR/api/projects/long-deleted/assets/${HELD_BY_MARKUP}" alt="Act I"></figure>`,
            },
        },
    }))

    // An archived document, kept so a deleted project stays restorable.
    const archived = path.join(space, 'projects', '_removed')
    fs.mkdirSync(archived, { recursive: true })
    fs.writeFileSync(path.join(archived, 'was-a-project.json'), JSON.stringify({
        entities: { page: { html: `<img src="/serverXR/api/projects/was-a-project/assets/${HELD_BY_ARCHIVE}">` } },
    }))

    return spaces
}

const runGc = (spacesDir) => execFileSync(
    process.execPath,
    [SCRIPT, '--spaces-dir', spacesDir, '--ignore-db'],
    { encoding: 'utf8' },
)

describe('gc-space-blobs sees references that live only in markup', () => {
    it('keeps a blob a live document points at through a deleted project’s path', () => {
        const out = runGc(makeSpaces())
        expect(out).not.toContain(HELD_BY_MARKUP)
    })

    it('keeps a blob only an archived document still references', () => {
        const out = runGc(makeSpaces())
        expect(out).not.toContain(HELD_BY_ARCHIVE)
    })

    it('still collects a blob nothing references at all', () => {
        const out = runGc(makeSpaces())
        expect(out).toContain(`would remove a-space/blobs/${TRULY_UNREFERENCED}`)
        expect(out).toMatch(/Would remove 1 blob\(s\)/)
    })
})

// A restore point keeps JSON, never bytes. An undo puts back a document that
// names its images by hash — so a blob only a kept snapshot mentions is still
// needed, or the undo brings back a page of broken pictures.
describe('gc-space-blobs keeps what a restore point still needs', () => {
    const HELD_BY_SNAPSHOT = 'd'.repeat(64)

    const makeWithSnapshot = () => {
        const spaces = makeSpaces()
        const root = path.dirname(spaces)
        fs.writeFileSync(path.join(spaces, 'a-space', 'blobs', HELD_BY_SNAPSHOT), 'bytes')
        const snapshots = path.join(root, 'snapshots', 'a-space')
        fs.mkdirSync(snapshots, { recursive: true })
        fs.writeFileSync(path.join(snapshots, '2026-09-16T10-00-00-000Z.json'), JSON.stringify({
            snapshotVersion: 2,
            reason: 'before-change',
            scene: null,
            projects: [{
                id: 'gone-now',
                document: { assets: [{ id: HELD_BY_SNAPSHOT, name: 'photo.jpg' }] },
                assets: { [HELD_BY_SNAPSHOT]: { id: HELD_BY_SNAPSHOT, mimeType: 'image/jpeg' } },
            }],
        }))
        return spaces
    }

    it('keeps a blob only a kept snapshot references (snapshots beside spaces/)', () => {
        const out = runGc(makeWithSnapshot())
        expect(out).toContain(`held by a restore point a-space/blobs/${HELD_BY_SNAPSHOT}`)
        expect(out).not.toContain(`would remove a-space/blobs/${HELD_BY_SNAPSHOT}`)
        expect(out).toMatch(/Would remove 1 blob\(s\)/)
    })

    it('deletes it with --apply once the restore point has aged out', () => {
        const spaces = makeWithSnapshot()
        fs.rmSync(path.join(path.dirname(spaces), 'snapshots'), { recursive: true, force: true })
        execFileSync(process.execPath, [SCRIPT, '--spaces-dir', spaces, '--ignore-db', '--apply'], { encoding: 'utf8' })
        expect(fs.existsSync(path.join(spaces, 'a-space', 'blobs', HELD_BY_SNAPSHOT))).toBe(false)
    })

    it('never deletes a snapshot-held blob with --apply', () => {
        const spaces = makeWithSnapshot()
        execFileSync(process.execPath, [SCRIPT, '--spaces-dir', spaces, '--ignore-db', '--apply'], { encoding: 'utf8' })
        expect(fs.existsSync(path.join(spaces, 'a-space', 'blobs', HELD_BY_SNAPSHOT))).toBe(true)
        expect(fs.existsSync(path.join(spaces, 'a-space', 'blobs', TRULY_UNREFERENCED))).toBe(false)
    })
})
