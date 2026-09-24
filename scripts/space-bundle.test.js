import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'space-bundle.mjs')

// Spawned as a real process, not imported — space-bundle.mjs's static
// `import … from 'node:sqlite'` (used only inside exportSpace) makes
// Vite's test transform fail to even load the module, the same reason
// gc-space-blobs.test.js spawns its script instead of importing it.
const run = (args) => execFileAsync(process.execPath, [SCRIPT, ...args], { cwd: ROOT_DIR })

// Seeds one `spaces` row directly, using the exact column list `importSpace`
// itself writes with (see space-bundle.mjs's `insertSpace`) — so this stays
// correct against the real, migrated schema without hand-guessing it.
const seedSpace = (dbPath, { id, updatedAt }) => {
    const { initDb, closeDb } = require('../serverXR/src/db.js')
    const db = initDb(dbPath)
    db.prepare(`INSERT INTO spaces
        (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, id, 1, 1, 0, 'normal', null, null, 0, updatedAt, updatedAt, updatedAt, null)
    closeDb()
}

const tempDirs = []
const mkTemp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('space-bundle import refuses a target that changed after the bundle was exported', () => {
    it('refuses --force when the target was touched after this bundle was exported', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])

        // Simulate "someone changed the target after this bundle was made":
        // the target's own updated_at is later than the bundle's exportedAt.
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: Date.now() + 60_000 })

        const err = await run(['import', bundlePath, '--data-root', targetRoot, '--force']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('changed after this bundle was exported')
        expect(err.stderr).toContain('--force --force-stale')
    })

    it('--force --force-stale overwrites anyway', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: Date.now() + 60_000 })

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot, '--force', '--force-stale'])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })

    it('--force alone is enough when the target has not changed since the export', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])
        // Target exists, but was last touched BEFORE the export ran.
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: 500 })

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot, '--force'])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })

    it('a brand-new target (no existing space) needs no staleness check at all', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })
})

// serverXR/Dockerfile copies the server to /app/src and this script to
// /app/scripts -- no serverXR/ directory above either. The two routes that
// spawn it (save a space to a file, open a file) answered 500 on every hosted
// tier from 2026-08-19 to 2026-09-17 because the image had no tool at all; a
// tool that then looked for ../serverXR/src would have failed the same way one
// step later. Staged here from the real files, so a Dockerfile that stops
// copying the script, or a script that forgets the layout, fails this test.
describe('space-bundle runs from the server image\'s layout', () => {
    const stageImage = () => {
        const image = mkTemp('space-bundle-image-')
        const app = path.join(image, 'app')
        fs.mkdirSync(path.join(app, 'src'), { recursive: true })
        fs.mkdirSync(path.join(app, 'scripts'), { recursive: true })
        fs.copyFileSync(path.join(ROOT_DIR, 'serverXR', 'src', 'db.js'), path.join(app, 'src', 'db.js'))
        fs.copyFileSync(SCRIPT, path.join(app, 'scripts', 'space-bundle.mjs'))
        // What the Dockerfile writes: deploy facts, no schemaVersion -- the tool
        // has to read that out of ./src/db.js.
        fs.writeFileSync(path.join(app, 'release.json'), JSON.stringify({ deployEnv: 'test', gitCommit: 'abc' }))
        return app
    }
    const runStaged = (app, args) => execFileAsync(process.execPath, [path.join(app, 'scripts', 'space-bundle.mjs'), ...args], { cwd: app })

    it('the Dockerfile ships the tool beside the server', () => {
        const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'serverXR', 'Dockerfile'), 'utf8')
        expect(dockerfile).toMatch(/^COPY scripts\/space-bundle\.mjs \.\/scripts\/space-bundle\.mjs$/m)
    })

    it('exports and imports with the server at ./src, stamping the real schema version', async () => {
        const app = stageImage()
        const sourceRoot = mkTemp('space-bundle-image-data-a-')
        const targetRoot = mkTemp('space-bundle-image-data-b-')
        const bundlePath = path.join(mkTemp('space-bundle-image-out-'), 'imaged.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'imaged', updatedAt: 1_000 })
        const { stdout: exported } = await runStaged(app, ['export', 'imaged', '--data-root', sourceRoot, '--out', bundlePath])
        expect(exported).toContain('exported space "imaged"')

        const dbSource = fs.readFileSync(path.join(ROOT_DIR, 'serverXR', 'src', 'db.js'), 'utf8')
        const schemaVersion = Number(/const SCHEMA_VERSION = (\d+)/.exec(dbSource)[1])
        const unpacked = mkTemp('space-bundle-image-unpacked-')
        await execFileAsync('tar', ['-xzf', path.basename(bundlePath), '-C', unpacked], { cwd: path.dirname(bundlePath) })
        const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'bundle.json'), 'utf8'))
        expect(manifest.schemaVersion).toBe(schemaVersion)

        const { stdout: imported } = await runStaged(app, ['import', bundlePath, '--data-root', targetRoot])
        expect(imported).toContain('imported "imaged" as "imaged"')
        expect(fs.existsSync(path.join(targetRoot, 'di.db'))).toBe(true)
    })
})

// 2026-09-18: a collaborator's WCC export was imported over a space that held
// eight projects the file did not carry. `INSERT OR REPLACE INTO spaces`
// deleted the row first, the cascade took all eight (and their op logs), the
// space directory was removed whole, and label + owner reset to the file's
// (id-as-label, no owner). Nothing said so. These guard each half.
describe('space-bundle forced replace keeps what the file does not carry', () => {
    const seedProject = (dbPath, dataRoot, spaceId, pid, body) => {
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(dbPath)
        const now = Date.now() - 60_000
        db.prepare('INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(pid, spaceId, pid, 1, 'project', now, now, now)
        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)').run(pid, 1, '{}', now)
        closeDb()
        const dir = path.join(dataRoot, 'spaces', spaceId, 'projects', pid)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify({ body }))
    }
    const read = (dbPath, sql, ...params) => {
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(dbPath)
        const rows = db.prepare(sql).all(...params)
        closeDb()
        return rows
    }
    const setUp = async () => {
        const past = Date.now() - 120_000
        // the collaborator's install: space `gallery`, label never set, one project
        const theirs = mkTemp('bundle-theirs-')
        seedSpace(path.join(theirs, 'di.db'), { id: 'gallery', updatedAt: past })
        seedProject(path.join(theirs, 'di.db'), theirs, 'gallery', 'gallery-main', 'theirs')
        const file = path.join(mkTemp('bundle-file-'), 'gallery.diiii')
        seedProject(path.join(theirs, 'di.db'), theirs, 'gallery', 'gallery-binned', 'binned')
        {
            const { initDb, closeDb } = require('../serverXR/src/db.js')
            const db = initDb(path.join(theirs, 'di.db'))
            db.prepare('UPDATE projects SET state = ?, deleted_at = ? WHERE id = ?').run('draft', 1789001446736, 'gallery-binned')
            closeDb()
        }
        await run(['export', 'gallery', '--data-root', theirs, '--out', file])
        // the tier: same space with a real label, the same project, and one more
        const tier = mkTemp('bundle-tier-')
        const tierDb = path.join(tier, 'di.db')
        seedSpace(tierDb, { id: 'gallery', updatedAt: past })
        seedProject(tierDb, tier, 'gallery', 'gallery-main', 'ours-old')
        seedProject(tierDb, tier, 'gallery', 'gallery-history', 'history')
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(tierDb)
        db.prepare('UPDATE spaces SET label = ? WHERE id = ?').run('The Gallery', 'gallery')
        closeDb()
        return { file, tier, tierDb }
    }

    it('keeps the extra project (row, op log, document), the label, and writes a before-copy', async () => {
        const { file, tier, tierDb } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--force-stale'])
        expect(stdout).toContain('gallery-history')
        expect(read(tierDb, 'SELECT id FROM projects WHERE space_id = ? ORDER BY id', 'gallery').map((r) => r.id))
            .toEqual(['gallery-binned', 'gallery-history', 'gallery-main'])
        // a trashed draft stays a trashed draft on the way in
        expect(read(tierDb, 'SELECT state, deleted_at FROM projects WHERE id = ?', 'gallery-binned')[0])
            .toEqual({ state: 'draft', deleted_at: 1789001446736 })
        expect(read(tierDb, 'SELECT count(*) AS n FROM project_ops WHERE project_id = ?', 'gallery-history')[0].n).toBe(1)
        expect(JSON.parse(fs.readFileSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-history', 'document.json'), 'utf8')).body).toBe('history')
        expect(JSON.parse(fs.readFileSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-main', 'document.json'), 'utf8')).body).toBe('theirs')
        expect(read(tierDb, 'SELECT label FROM spaces WHERE id = ?', 'gallery')[0].label).toBe('The Gallery')
        const backups = fs.readdirSync(path.join(tier, '_backups', 'space-replace'))
        expect(backups).toHaveLength(1)
        expect(backups[0]).toMatch(/^gallery-.*\.diiii$/)
    })

    it('--prune deletes the extra project, and says which', async () => {
        const { file, tier, tierDb } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--force-stale', '--prune'])
        expect(stdout).toMatch(/gallery-history[\s\S]*DELETED/)
        expect(read(tierDb, 'SELECT id FROM projects WHERE space_id = ?', 'gallery').map((r) => r.id).sort()).toEqual(['gallery-binned', 'gallery-main'])
        expect(fs.existsSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-history'))).toBe(false)
        expect(fs.readdirSync(path.join(tier, '_backups', 'space-replace'))).toHaveLength(1)
    })

    // 2026-09-17: meant for dev, landed on prod. The tool now has to be told the
    // tier, and refuses when the tier it is told is not the tier it is on.
    it('on a hosted tier, a forced replace must name the tier — and name the right one', async () => {
        const { file, tier, tierDb } = await setUp()
        const onProd = { ...process.env, DI_TIER_OVERRIDE: 'prod' }
        const args = ['import', file, '--data-root', tier, '--force', '--force-stale']
        const spawn = (extra) => execFileAsync(process.execPath, [SCRIPT, ...args, ...extra], { cwd: ROOT_DIR, env: onProd })
        await expect(spawn([])).rejects.toMatchObject({ stderr: expect.stringContaining('this is the PROD tier') })
        await expect(spawn(['--tier', 'dev'])).rejects.toMatchObject({ stderr: expect.stringContaining('you said --tier dev') })
        // refused means untouched: the old document is still there, no before-copy was made
        expect(JSON.parse(fs.readFileSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-main', 'document.json'), 'utf8')).body).toBe('ours-old')
        expect(fs.existsSync(path.join(tier, '_backups'))).toBe(false)
        const { stdout } = await spawn(['--tier', 'prod'])
        expect(stdout).toContain('on the PROD tier')
        expect(read(tierDb, 'SELECT label FROM spaces WHERE id = ?', 'gallery')[0].label).toBe('The Gallery')
    })
})

// ONE SHOW PER SPACE: the lighting desk keeps a space's light show beside its scene
// (spaces/<id>/lighting/show.json), and the .diiii file is how it travels to another
// install. The rig (`output`: which wire, which addresses) never travels — it is the
// machine's, and a file opened elsewhere must not send light at this venue's nodes.
describe('space-bundle carries the space\'s light show', () => {
    const SHOW = {
        master: 200,
        fixtures: [
            { id: 'fx1', index: 1, name: 'Wash L', universe: 0, address: 1, profile: 'drgb', values: { dimmer: 255 } },
            { id: 'fx2', index: 2, name: 'Wash R', universe: 0, address: 5, profile: 'drgb', values: { dimmer: 128 } }
        ],
        scenes: [{ id: 'sc1', name: 'Warm', fadeMs: 1000, fixtures: [{ id: 'fx1', on: true, values: { r: 255 } }], raw: {} }],
        looks: [],
        midi: { maps: [{ kind: 'cc', ch: 1, num: 7, target: 'master' }] },
        output: { driver: 'enttec', serialPort: '/dev/ttyUSB0', targets: ['2.0.0.10'], enabled: true }
    }
    const writeShow = (root, spaceId, show, name = 'show.json') => {
        const dir = path.join(root, 'spaces', spaceId, 'lighting')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, name), JSON.stringify(show))
    }
    const readShow = (root, spaceId, name = 'show.json') =>
        JSON.parse(fs.readFileSync(path.join(root, 'spaces', spaceId, 'lighting', name), 'utf8'))
    const manifestOf = async (file) => {
        const unpacked = mkTemp('space-bundle-unpacked-')
        await execFileAsync('tar', ['-xzf', file, '-C', unpacked])
        return {
            manifest: JSON.parse(fs.readFileSync(path.join(unpacked, 'bundle.json'), 'utf8')),
            show: fs.existsSync(path.join(unpacked, 'space', 'lighting', 'show.json'))
                ? JSON.parse(fs.readFileSync(path.join(unpacked, 'space', 'lighting', 'show.json'), 'utf8'))
                : null
        }
    }

    it('export → import: the same fixtures, scenes and MIDI map arrive, and the rig stays behind', async () => {
        const a = mkTemp('show-a-')
        const b = mkTemp('show-b-')
        const file = path.join(mkTemp('show-out-'), 'showtest.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'showtest', updatedAt: 1_000 })
        writeShow(a, 'showtest', SHOW)

        const { stdout: exported } = await run(['export', 'showtest', '--data-root', a, '--out', file])
        expect(exported).toContain('light show: 2 fixtures, 1 scene')
        const { manifest, show } = await manifestOf(file)
        expect(manifest.version).toBe(2)
        expect(manifest.lightShow).toEqual({ fixtures: 2, scenes: 1, looks: 0 })
        expect(show.output).toBeUndefined()

        const { stdout: imported } = await run(['import', file, '--data-root', b])
        expect(imported).toContain('imported "showtest" as "showtest"')
        expect(imported).toContain('light show: 2 fixtures, 1 scene')
        const arrived = readShow(b, 'showtest')
        expect(arrived.fixtures.map((f) => f.name)).toEqual(['Wash L', 'Wash R'])
        expect(arrived.scenes.map((s) => s.name)).toEqual(['Warm'])
        expect(arrived.midi).toEqual(SHOW.midi)
        expect(arrived.master).toBe(200)
        expect(arrived.output).toBeUndefined()
        // Nothing but the space's own directory was written: the machine's show is not touched.
        expect(fs.existsSync(path.join(b, 'lighting'))).toBe(false)
    })

    it('reads the newest complete copy the way the desk does, when show.json is broken', async () => {
        const a = mkTemp('show-a-')
        const file = path.join(mkTemp('show-out-'), 'showtest.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'showtest', updatedAt: 1_000 })
        writeShow(a, 'showtest', SHOW, 'show.prev.json')
        fs.writeFileSync(path.join(a, 'spaces', 'showtest', 'lighting', 'show.json'), '{"fixtures": [')
        await run(['export', 'showtest', '--data-root', a, '--out', file])
        expect((await manifestOf(file)).show.fixtures).toHaveLength(2)
    })

    it('a space with no show writes the file every di.iiii already opens (version 1, no show)', async () => {
        const a = mkTemp('show-a-')
        const file = path.join(mkTemp('show-out-'), 'plain.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'plain', updatedAt: 1_000 })
        const { stdout } = await run(['export', 'plain', '--data-root', a, '--out', file])
        expect(stdout).not.toContain('light show')
        const { manifest, show } = await manifestOf(file)
        expect(manifest.version).toBe(1)
        expect(manifest.lightShow).toBeNull()
        expect(show).toBeNull()
    })

    it('--force replaces the show the file carries and keeps the old one as show.prev.json', async () => {
        const a = mkTemp('show-a-')
        const b = mkTemp('show-b-')
        const file = path.join(mkTemp('show-out-'), 'showtest.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'showtest', updatedAt: 1_000 })
        writeShow(a, 'showtest', SHOW)
        await run(['export', 'showtest', '--data-root', a, '--out', file])
        seedSpace(path.join(b, 'di.db'), { id: 'showtest', updatedAt: 500 })
        writeShow(b, 'showtest', { fixtures: [], scenes: [{ id: 'old', name: 'Theirs', fixtures: [] }] })

        await run(['import', file, '--data-root', b, '--force'])
        expect(readShow(b, 'showtest').scenes.map((s) => s.name)).toEqual(['Warm'])
        expect(readShow(b, 'showtest', 'show.prev.json').scenes.map((s) => s.name)).toEqual(['Theirs'])
        // and the automatic before-copy carries the show that was replaced
        const backups = fs.readdirSync(path.join(b, '_backups', 'space-replace'))
        const before = await manifestOf(path.join(b, '_backups', 'space-replace', backups[0]))
        expect(before.show.scenes.map((s) => s.name)).toEqual(['Theirs'])
    })

    it('--force with a file that carries no show keeps the space\'s own show, and says so', async () => {
        const a = mkTemp('show-a-')
        const b = mkTemp('show-b-')
        const file = path.join(mkTemp('show-out-'), 'showtest.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'showtest', updatedAt: 1_000 })
        await run(['export', 'showtest', '--data-root', a, '--out', file])
        seedSpace(path.join(b, 'di.db'), { id: 'showtest', updatedAt: 500 })
        writeShow(b, 'showtest', SHOW)
        const { stdout } = await run(['import', file, '--data-root', b, '--force'])
        expect(stdout).toContain('keeps its own light show')
        expect(readShow(b, 'showtest').fixtures).toHaveLength(2)
    })

    it('a file with a broken light show opens nothing', async () => {
        const a = mkTemp('show-a-')
        const b = mkTemp('show-b-')
        const file = path.join(mkTemp('show-out-'), 'showtest.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'showtest', updatedAt: 1_000 })
        writeShow(a, 'showtest', SHOW)
        await run(['export', 'showtest', '--data-root', a, '--out', file])
        // Break the show inside the file, then pack it back up.
        const unpacked = mkTemp('show-broken-')
        await execFileAsync('tar', ['-xzf', file, '-C', unpacked])
        fs.writeFileSync(path.join(unpacked, 'space', 'lighting', 'show.json'), '{"fixtures": [')
        await execFileAsync('tar', ['-czf', file, '-C', unpacked, '.'])
        const err = await run(['import', file, '--data-root', b]).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('light show cannot be read')
        expect(fs.existsSync(path.join(b, 'spaces', 'showtest'))).toBe(false)
    })

    it('a file from a newer di.iiii is refused by name, with the way forward', async () => {
        const a = mkTemp('show-a-')
        const file = path.join(mkTemp('show-out-'), 'future.diiii')
        seedSpace(path.join(a, 'di.db'), { id: 'future', updatedAt: 1_000 })
        await run(['export', 'future', '--data-root', a, '--out', file])
        const unpacked = mkTemp('show-future-')
        await execFileAsync('tar', ['-xzf', file, '-C', unpacked])
        const manifestPath = path.join(unpacked, 'bundle.json')
        fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), version: 99 }))
        await execFileAsync('tar', ['-czf', file, '-C', unpacked, '.'])
        const err = await run(['import', file, '--data-root', mkTemp('show-b-')]).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('newer than this tool')
        expect(err.stderr).toContain('di update')
    })
})

// 2026-09-18: a whole-document carry removed 76 authored slides from prod's
// front room and nothing said so. `import --force` is the same kind of
// replace, a whole space at a time: it now says what it removes before it
// writes, and refuses media loss without the exact count.
describe('space-bundle import --force says what it removes, and refuses uncounted media loss', () => {
    const PID = 'main-dii-project'
    const hex = (n) => n.toString(16).padStart(64, '0')
    const image = (i) => ({ id: `slide-${i}`, type: 'image', name: `Slide ${i}`, components: { media: { assetId: hex(i + 1) } } })
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `text-${i}`, type: 'text', name: `Text ${i}`, components: {} }))
    const FULL = { projectMeta: { id: PID, spaceId: 'main' }, entities: [...Array.from({ length: 76 }, (_, i) => image(i)), ...nine] }
    const THIN = { projectMeta: { id: PID, spaceId: 'main' }, entities: nine }

    const seed = (root, document, updatedAt) => {
        seedSpace(path.join(root, 'di.db'), { id: 'main', updatedAt })
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(path.join(root, 'di.db'))
        db.prepare('INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(PID, 'main', 'Front room', 1, 'project', updatedAt, updatedAt, updatedAt)
        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)').run(PID, 1, '{"opId":"seed"}', updatedAt)
        closeDb()
        const dir = path.join(root, 'spaces', 'main', 'projects', PID)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(document))
    }
    const setUp = async () => {
        const past = Date.now() - 120_000
        const theirs = mkTemp('loss-theirs-')
        seed(theirs, THIN, past)
        const file = path.join(mkTemp('loss-file-'), 'main.diiii')
        await run(['export', 'main', '--data-root', theirs, '--out', file])
        const tier = mkTemp('loss-tier-')
        seed(tier, FULL, past)
        return { file, tier, docPath: path.join(tier, 'spaces', 'main', 'projects', PID, 'document.json') }
    }
    const entitiesAt = (docPath) => JSON.parse(fs.readFileSync(docPath, 'utf8')).entities.length

    it('the incident: 85 → 9 is REFUSED, and nothing is written', async () => {
        const { file, tier, docPath } = await setUp()
        const err = await run(['import', file, '--data-root', tier, '--force']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stdout).toContain(`main/${PID}: this replace REMOVES 76 of 85 items — 76 image (media)`)
        expect(err.stderr).toContain('--accept-loss 76')
        expect(entitiesAt(docPath)).toBe(85)
        expect(fs.existsSync(path.join(tier, '_backups'))).toBe(false)
    })

    it('a wrong number is refused again', async () => {
        const { file, tier, docPath } = await setUp()
        const err = await run(['import', file, '--data-root', tier, '--force', '--accept-loss', '75']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('does not match the 76')
        expect(entitiesAt(docPath)).toBe(85)
    })

    it('the exact number carries it out', async () => {
        const { file, tier, docPath } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--accept-loss', '76'])
        expect(stdout).toContain('REMOVES 76 of 85')
        expect(entitiesAt(docPath)).toBe(9)
        // …and the op rows it wrote have an author: the tool, not nobody.
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(path.join(tier, 'di.db'))
        const actors = db.prepare('SELECT DISTINCT actor FROM project_ops WHERE project_id = ?').all(PID).map((r) => r.actor)
        closeDb()
        expect(actors).toEqual(['server:space-bundle-import'])
    })

    it('--dry-run prints the summary and writes nothing', async () => {
        const { file, tier, docPath } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--dry-run'])
        expect(stdout).toContain('this replace REMOVES 76 of 85 items — 76 image (media)')
        expect(stdout).toContain('needs --force --accept-loss 76')
        expect(entitiesAt(docPath)).toBe(85)
        expect(fs.existsSync(path.join(tier, '_backups'))).toBe(false)
    })
})

// The show's Perform presets live in the project document (2026-09-24), so a
// .diiii file carries them without the tool knowing they exist. This proves
// it end to end: a preset given to the show on one install is a preset of
// the show on the install that opens the file, read the way the server reads
// a document (readProjectDocument → the schema mirror).
describe('space-bundle carries the show\'s Perform presets', () => {
    it('export → import: the presets arrive, in order, and read back through the server', async () => {
        const schema = require('../shared/projectSchema.cjs')
        const presets = [
            { id: 'show:sunday', name: 'sunday caller', base: 'caller', windows: [{ id: 'cues', kind: 'cues' }, { id: 'wall', kind: 'wall' }], wide: { cues: [1, 2, 34, 95], wall: [36, 2, 63, 95] }, narrow: { cues: [0, 0, 100, 100] } },
            { id: 'show:win', name: 'win projector', windows: [{ id: 'wallout', kind: 'wallout' }], wide: { wallout: [1, 2, 98, 95] }, narrow: {} }
        ]
        const source = mkTemp('bundle-perform-src-')
        seedSpace(path.join(source, 'di.db'), { id: 'stage', updatedAt: Date.now() - 60_000 })
        {
            const { initDb, closeDb } = require('../serverXR/src/db.js')
            const db = initDb(path.join(source, 'di.db'))
            const now = Date.now() - 60_000
            db.prepare('INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                .run('show', 'stage', 'show', 1, 'project', now, now, now)
            closeDb()
        }
        const dir = path.join(source, 'spaces', 'stage', 'projects', 'show')
        fs.mkdirSync(dir, { recursive: true })
        const document = schema.normalizeProjectDocument({ projectMeta: { id: 'show', spaceId: 'stage', title: 'show' }, performState: { presets } })
        fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(document))

        const file = path.join(mkTemp('bundle-perform-file-'), 'stage.diiii')
        await run(['export', 'stage', '--data-root', source, '--out', file])
        const target = mkTemp('bundle-perform-dst-')
        await run(['import', file, '--data-root', target])

        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const { readProjectDocument } = require('../serverXR/src/projectStore.js')
        initDb(path.join(target, 'di.db'))
        try {
            const arrived = await readProjectDocument(path.join(target, 'spaces'), 'stage', 'show')
            expect(arrived.performState.presets.map((p) => [p.id, p.name, p.source])).toEqual([
                ['show:sunday', 'sunday caller', 'show'],
                ['show:win', 'win projector', 'show']
            ])
            expect(arrived.performState.presets[0].wide).toEqual(presets[0].wide)
            expect(arrived.performState.presets[0].base).toBe('caller')
        } finally {
            closeDb()
        }
    })
})
