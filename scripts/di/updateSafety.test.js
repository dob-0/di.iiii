// @vitest-environment node
//
// An update moves two things: the app, and sometimes the shape the work is
// stored in. `--rollback` only moves one of them back. These are the four
// checks that stand between an artist and finding that out afterwards.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import {
    buildSchemaVersion,
    dataSchemaVersion,
    isNewerVersion,
    listSnapshots,
    rehearseAgainst,
    restoreSnapshot,
    snapshotData
} from './install.mjs'
import { paths } from './paths.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const homes = []
const makeHome = ({ schema = null, files = {} } = {}) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-safety-'))
    homes.push(home)
    const p = paths(home)
    fs.mkdirSync(p.data, { recursive: true })
    if (schema !== null) {
        const db = new DatabaseSync(path.join(p.data, 'di.db'))
        db.exec(`PRAGMA user_version = ${schema}`)
        db.close()
    }
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(p.data, name)), { recursive: true })
        fs.writeFileSync(path.join(p.data, name), body)
    }
    return home
}

afterEach(async () => {
    while (homes.length) await fsp.rm(homes.pop(), { recursive: true, force: true })
})

describe('the update knows what shape the work is in', () => {
    it('reads the stamp serverXR leaves on the database', () => {
        expect(dataSchemaVersion(makeHome({ schema: 4 }))).toBe(4)
    })

    it('says "no database" rather than "version zero" on a first install', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-safety-'))
        homes.push(home)
        expect(dataSchemaVersion(home)).toBeNull()
    })

    it('reads what a build can handle out of its release.json', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-build-'))
        homes.push(dir)
        fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ version: '0.5.0', schemaVersion: 3 }))
        expect(buildSchemaVersion(dir)).toBe(3)
    })

    it('says unknown for a build from before the field existed, rather than assuming zero', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-build-'))
        homes.push(dir)
        fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ version: '0.3.1' }))
        // Zero would read as "older than everything" and make every rollback
        // look dangerous; unknown makes the caller say so instead.
        expect(buildSchemaVersion(dir)).toBeNull()
    })
})

describe('the rehearsal', () => {
    it('copies the whole data root, not just the database', async () => {
        const home = makeHome({ schema: 1, files: { 'spaces/open/scene.json': '{"v":1}' } })
        const scratch = await rehearseAgainst({ home })
        expect(fs.existsSync(path.join(scratch, 'di.db'))).toBe(true)
        // A rehearsal that copied only di.db would pass on an install whose
        // real boot reads space directories and assets too.
        expect(fs.readFileSync(path.join(scratch, 'spaces/open/scene.json'), 'utf8')).toBe('{"v":1}')
        await fsp.rm(scratch, { recursive: true, force: true })
    })

    it('leaves the real data alone whatever the rehearsal does to the copy', async () => {
        const home = makeHome({ schema: 1, files: { 'keep.txt': 'original' } })
        const scratch = await rehearseAgainst({ home })
        fs.writeFileSync(path.join(scratch, 'keep.txt'), 'migrated')
        expect(fs.readFileSync(path.join(paths(home).data, 'keep.txt'), 'utf8')).toBe('original')
        await fsp.rm(scratch, { recursive: true, force: true })
    })

    it('has nothing to rehearse on a first install, and says so rather than passing', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-safety-'))
        homes.push(home)
        expect(await rehearseAgainst({ home })).toBeNull()
    })
})

describe('the snapshot', () => {
    it('copies the work somewhere update cannot reach, and lists it', async () => {
        const home = makeHome({ schema: 1, files: { 'keep.txt': 'work' } })
        const dir = await snapshotData({ home, label: 'before-0.5.0' })
        expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('work')
        expect(dir.startsWith(paths(home).snapshots)).toBe(true)
        expect(listSnapshots(home).map((s) => s.name)).toContain(path.basename(dir))
    })

    it('moves the current work aside before restoring, so the wrong choice is survivable', async () => {
        const home = makeHome({ schema: 1, files: { 'keep.txt': 'old' } })
        const snapshot = await snapshotData({ home, label: 'before-0.5.0' })
        fs.writeFileSync(path.join(paths(home).data, 'keep.txt'), 'new')

        await restoreSnapshot({ home, dir: snapshot })
        expect(fs.readFileSync(path.join(paths(home).data, 'keep.txt'), 'utf8')).toBe('old')

        const replaced = listSnapshots(home).find((s) => s.name.startsWith('replaced-'))
        expect(replaced).toBeTruthy()
        expect(fs.readFileSync(path.join(replaced.dir, 'keep.txt'), 'utf8')).toBe('new')
    })
})

describe('the update refuses to walk backwards', () => {
    it('treats an ahead-of-the-feed install as nothing to do', () => {
        expect(isNewerVersion('0.3.1', '0.4.0-rc')).toBe(false)
        expect(isNewerVersion('0.4.0', '0.4.0-rc')).toBe(true)
    })

    it('is what cmdUpdate actually asks before staging anything', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        expect(source).toContain('!isNewerVersion(release.version, from) && !args.flags.force')
        // and the rollback path checks the schema before it moves the link
        expect(source).toContain('targetSchema < dataSchema')
        const rollbackAt = source.indexOf('const to = await rollback({ home })')
        const checkAt = source.indexOf('targetSchema < dataSchema')
        expect(checkAt).toBeGreaterThan(-1)
        expect(checkAt).toBeLessThan(rollbackAt)
    })
})
