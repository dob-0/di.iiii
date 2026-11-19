// @vitest-environment node
// di show count: a made-up home, exact counts, read-only, no value, safe by default, the core piped, the path to another machine.
// Every string value of the made-up show holds ZZV and every id holds ZZID; the default output may hold neither.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main } from './cli.mjs'
import { count } from './lib/countCore.mjs'

const CORE = fileURLToPath(new URL('./lib/countCore.mjs', import.meta.url))
const ROOT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-count-'))
const HOME = path.join(ROOT, 'home')
const BIN = path.join(ROOT, 'bin')
const DATA = path.join(HOME, '.di', 'data')
const write = (rel, body) => { const f = path.join(DATA, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body, null, 2)) }
const lamp = (id) => ({ id, components: { fixture: { type: 'ZZV spot', universe: 1, address: 1 } } })
const doc = (extra = {}) => ({ entities: [], ...extra })

beforeAll(() => {
    fs.mkdirSync(BIN, { recursive: true })
    for (const name of ['ssh', 'di-ask', 'di-open', 'di-show']) { fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 97\n'); fs.chmodSync(path.join(BIN, name), 0o755) }
    const S = 'spaces'
    write(`${S}/ZZID-spaceA/projects/ZZID-p1/document.json`, doc({
        entities: [lamp('ZZID-l1'), lamp('ZZID-l2'), { id: 'ZZID-e3', components: { beam: { laser: { name: 'ZZV beam' } }, rigLooks: { looks: [{ id: 'ZZID-k1' }, { id: 'ZZID-k2' }] } } }],
        mappingState: { cues: [{ id: 'c1', name: 'ZZV one', lightLook: 'ZZID-lk' }, { id: 'c2', laserLook: 'ZZID-laser1' }, { id: 'c3', laserLook: 'ZZID-lasermissing' }] }
    }))
    write(`${S}/ZZID-spaceA/projects/ZZID-p2/document.json`, doc({ title: 'ZZV plain' }))
    write(`${S}/ZZID-spaceA/projects/ZZID-p3/document.json`, '{ not json ZZV')
    write(`${S}/ZZID-spaceB/projects/ZZID-p4/document.json`, doc({ entities: [lamp('ZZID-m1')] }))
    fs.mkdirSync(path.join(DATA, S, 'ZZID-spaceC'), { recursive: true })
    write(`${S}/ZZID-spaceC/lighting/show.json`, 'not json ZZV')
    write('lighting/show.json', {
        master: 255, blackout: false,
        fixtures: [{ id: 'ZZID-d1', name: 'ZZV one', rigKey: 'ZZID-p1:ZZID-l1' }, { id: 'ZZID-d2', rigKey: 'ZZID-p1:ZZID-gone' }, { id: 'ZZID-d3' }],
        looks: [{ id: 'rig-ZZID-k1', scope: 'each' }, { id: 'rig-ZZID-k2', scope: 'type' }, { id: 'rig-ZZID-nok', scope: 'global' }, { id: 'ZZV own' }],
        scenes: [{ id: 's1' }], layers: [{ id: 'y1' }], sets: [{ id: 't1' }], fx: { mode: 'ZZV', bpm: 120 }, lfos: [{}, {}],
        midi: { maps: [{}, {}, {}] }, customProfiles: [{ id: 'ZZID-cp' }], cues: { list: [{}, {}] }, zzextra: [1, 2],
        output: { host: 'ZZV wire', deep: { list: [{ x: 1 }, { x: 2 }, { x: 3 }] } }
    })
    write('spaces/ZZID-spaceA/lighting/show.json', { fixtures: [], looks: [] })
    write('laser/desk.json', { v: 1, followLight: true, looks: [{ id: 'ZZID-laser1', follows: 'ZZID-sc' }, { id: 'ZZID-x2' }], palette: ['ZZV a', 'ZZV b', 'ZZV c'], cubes: { 'ZZID-serial': { host: 'ZZV' } }, bpm: 120 })
    write('laser/laser.json', { cubes: { 'ZZID-serial': { host: 'ZZV rig' } } })
    fs.mkdirSync(path.join(HOME, '.local', 'share', 'di.iiii', 'data'), { recursive: true })
})
afterAll(() => { try { fs.chmodSync(ROOT, 0o755); fs.rmSync(ROOT, { recursive: true, force: true }) } catch { /* gone */ } })

const run = async (argv, deps = {}) => { const lines = []; const code = await main(argv, { env: {}, home: HOME, print: (s) => lines.push(s), ...deps }); return { code, text: lines.join('\n') } }
const withIds = () => count({ ids: true, home: HOME, env: {} })
const listing = (dir) => {
    const out = []
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { out.push(`${p} dir`); walk(p) } else { const s = fs.statSync(p); out.push(`${p} ${s.size} ${s.mtimeMs} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`) } } }
    walk(dir)
    return out.sort()
}

describe('the stand-ins are the only tools in reach', () => {
    it('ssh, di-ask, di-open and di-show answer from the test bin', () => {
        const r = spawnSync('/bin/bash', ['-c', 'command -v ssh di-ask di-open di-show'], { env: { PATH: BIN, HOME: HOME }, encoding: 'utf8' })
        const lines = r.stdout.trim().split('\n')
        expect(lines).toHaveLength(4)
        for (const l of lines) expect(l.startsWith(BIN)).toBe(true)
    })
})

describe('exact counts on the made-up home', () => {
    it('project documents', () => {
        const d = withIds().documents
        expect(d).toMatchObject({ total: 4, spaces: 2, spacesFound: 3, holdingShow: 2, spacesHoldingShow: 2, largestShare: { inOneSpace: 1, of: 2 }, totals: { lamps: 3, designedLooks: 2, cues: 3, laserObjects: 1 }, cuesTotal: 3, cuesNaming: { lightLook: 1, lightScene: 0, laserLook: 2 }, withoutShow: 1 })
        const first = d.list[0]
        expect(first).toMatchObject({ n: 1, space: 1, lamps: 2, looks: 2, cues: 3, lasers: 1 })
        expect(first.gzipWith).toBeGreaterThan(first.gzipWithout)
        expect(first.partChars.lamps).toBeGreaterThan(0)
    })
    it('desk files, every kind, and a kind the list does not name', () => {
        const files = withIds().deskFiles
        const light = files[0]
        expect(light.counts).toMatchObject({ lamps: 3, looks: 4, 'light scenes': 1, layers: 1, sets: 1, 'effect settings (keys of fx)': 2, LFOs: 2, 'MIDI map entries': 3, 'custom fixture types': 1, 'cue list': 2 })
        expect(light.lookScopes).toEqual({ each: 1, type: 1, global: 1, 'not set': 1 })
        expect(light.otherKeys.zzextra).toBe(2)
        expect(light.output).toBe('there')
        const laser = files.find((f) => f.kind === 'laser desk file')
        expect(laser.counts).toEqual({ looks: 2, 'palette entries': 3 })
        expect(laser.link).toEqual({ followLight: 'on', looksThatFollowALightScene: 1 })
        expect(laser.otherKeys).toMatchObject({ cubes: 1, bpm: 'a single value' })
    })
    it('what names a project', () => {
        expect(withIds().names).toMatchObject({ lampsWithKey: 2, lampsKeyFound: 1, lampsNoKey: 1, copies: 3, copiesFound: 2, copiesMissing: 1, notCopies: 1 })
        expect(withIds().names.laser).toMatchObject({ deskFile: 'there', looksNamedByACue: 1, looksNamedByCues: 2, missingLookIds: 1, cuesNamingAMissingLook: 1 })
        expect(withIds().names.laser.rigFile).toMatch(/not opened/)
    })
    it('a file that is not JSON is counted and listed, and the exit code says 1', async () => {
        const r = withIds()
        expect(r.unread.map((u) => u.error)).toEqual(['ParseError', 'ParseError'])
        expect(r.unread.map((u) => u.label)).toEqual(['document 3 in space 1', 'desk file 3'])
        expect((await run(['count', '--di-home', path.join(HOME, '.di')])).code).toBe(1)
    })
    it('says which folder it read and the other candidate it saw', () => {
        const r = withIds()
        expect(r.data.rule).toMatch(/~\/\.di/)
        expect(r.data.others).toEqual([expect.objectContaining({ state: 'there, not read' })])
    })
    it('an unknown venue is refused with exit 2', async () => {
        expect((await run(['count', '--venue', 'no-such-venue-zz'])).code).toBe(2)
    })
    it('a flag or a word the count does not know is refused with exit 2, and nothing is counted', async () => {
        const there = path.join(HOME, '.di', 'data')
        for (const argv of [['count', '--data-dri', there], ['count', `--data-dri=${there}`], ['count', '--josn'], ['count', 'a-word']]) {
            const r = await run(argv)
            expect(r.code).toBe(2)
            expect(r.text).toMatch(/^!! REFUSED: di show count /)
            expect(r.text).not.toMatch(/=== 1|document \d/)
            expect(r.text).not.toContain(ROOT)
        }
        expect((await run(['count', '--data-dri', 'x'])).text).toContain('does not know --data-dri;')
        expect((await run(['count', 'a-word'])).text).toContain('takes no word after it (1 given)')
    })
    it('a value flag without a value and a switch with a value are refused with exit 2', async () => {
        for (const [argv, words] of [[['count', '--data-dir='], '--data-dir needs a value'], [['count', '--di-home='], '--di-home needs a value'], [['count', '--host='], '--host needs a value'], [['count', '--ids=1'], '--ids takes no value'], [['count', '--local=yes'], '--local takes no value'], [['count', '--json=true'], '--json takes no value']]) {
            const r = await run(argv)
            expect(r.code).toBe(2)
            expect(r.text).toBe(`!! REFUSED: ${words}`)
        }
    })
    it('--local is this machine, also beside --host', async () => {
        const transportFactory = () => { throw new Error('no transport here') }
        for (const argv of [['count', '--local'], ['count', '--host', 'ZZother', '--local']]) {
            const r = await run(argv, { transportFactory })
            expect(r.code).not.toBe(2)
            expect(r.text).toMatch(/^counted on this machine /)
        }
    })
})

describe('read-only', () => {
    it('leaves every file, size, mtime and hash as it was, also with every write bit removed', async () => {
        const before = listing(HOME)
        const a = await run(['count', '--ids'])
        expect(listing(HOME)).toEqual(before)
        const all = (d, mode) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) all(p, mode); fs.chmodSync(p, e.isDirectory() ? 0o555 : 0o444) } fs.chmodSync(d, mode) }
        all(HOME, 0o555)
        try {
            const b = await run(['count', '--ids'])
            expect(b.text).toBe(a.text)
        } finally {
            const back = (d) => { fs.chmodSync(d, 0o755); for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) back(p); else fs.chmodSync(p, 0o644) } }
            back(HOME)
        }
        expect(listing(HOME)).toEqual(before)
    })
})

describe('no value, safe by default', () => {
    it('default and --json hold neither marker; --ids holds ZZID and no ZZV', async () => {
        for (const argv of [['count'], ['count', '--json']]) {
            const { text } = await run(argv)
            expect(text).not.toContain('ZZV')
            expect(text).not.toContain('ZZID')
            expect(text).not.toContain(ROOT)
        }
        for (const argv of [['count', '--ids'], ['count', '--ids', '--json']]) {
            const { text } = await run(argv)
            expect(text).toContain('ZZID')
            expect(text).not.toContain('ZZV')
        }
    })
    it('the wire is dropped unread: nothing under output is counted or printed', async () => {
        const { text } = await run(['count', '--ids'])
        expect(text).toContain('output: there')
        expect(text).not.toMatch(/deep|wire|host/)
        const r = withIds()
        expect(JSON.stringify(r)).not.toContain('"deep"')
        // E1: the key is dropped before the other keys are listed; without `delete d.output` these fail
        expect(Object.keys(r.deskFiles[0].otherKeys)).not.toContain('output')
        expect(text).not.toMatch(/other keys:.*output/)
    })
})

describe('the core on its own', () => {
    it('piped through node --input-type=module - it prints the same JSON as the import', () => {
        const opts = { ids: false, home: HOME, env: {}, diHome: path.join(HOME, '.di') }
        const piped = spawnSync(process.execPath, ['--input-type=module', '-', JSON.stringify(opts)], { input: fs.readFileSync(CORE), env: { PATH: BIN, HOME: HOME, DI_SHOW_COUNT_RUN: '1' }, encoding: 'utf8' })
        expect(piped.status).toBe(0)
        const a = JSON.parse(piped.stdout); const b = JSON.parse(JSON.stringify(count(opts)))
        delete a.ms; delete b.ms
        expect(a).toEqual(b)
    })
    it('options that are not one JSON object stop the run with exit 2, and nothing is counted', () => {
        for (const bad of ['{dataDir: 1}', '5', '[]', 'null']) {
            const r = spawnSync(process.execPath, ['--input-type=module', '-', bad], { input: fs.readFileSync(CORE), env: { PATH: BIN, HOME: HOME, DI_SHOW_COUNT_RUN: '1' }, encoding: 'utf8' })
            expect(r.status).toBe(2)
            expect(r.stdout).toBe('')
            expect(r.stderr).toBe('the options are not one JSON object\n')
        }
    })
    it('piped without options it counts the defaults', () => {
        const r = spawnSync(process.execPath, ['--input-type=module', '-'], { input: fs.readFileSync(CORE), env: { PATH: BIN, HOME: HOME, DI_SHOW_COUNT_RUN: '1' }, encoding: 'utf8' })
        expect(r.status).toBe(0)
        expect(JSON.parse(r.stdout).data.rule).toContain('~/.di')
    })
    it('evaluated without the marker it prints nothing', () => {
        const quiet = spawnSync(process.execPath, ['--input-type=module', '-e', fs.readFileSync(CORE, 'utf8'), '{}'], { env: { PATH: BIN, HOME: HOME }, encoding: 'utf8' })
        expect(quiet.status).toBe(0)
        expect(quiet.stdout).toBe('')
    })
    it('the core text is under 100,000 bytes', () => {
        expect(fs.statSync(CORE).size).toBeLessThan(100000)
    })
    it('imports only Node built-ins', () => {
        const imports = [...fs.readFileSync(CORE, 'utf8').matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
        expect(imports.length).toBeGreaterThan(0)
        for (const i of imports) expect(i.startsWith('node:')).toBe(true)
    })
})

describe('the path to another machine (transport faked)', () => {
    it('sends the core to bash and prints the same counts, with the host named nowhere', async () => {
        const seen = []
        const transportFactory = ({ host }) => ({
            where: host,
            run: async (script) => {
                seen.push(script)
                const r = spawnSync('bash', ['-s'], { input: script, env: { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: HOME } })
                return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr.toString() }
            }
        })
        const local = await run(['count', '--json'])
        const remote = await run(['count', '--json', '--host', 'ZZhost-fake'], { transportFactory })
        expect(seen).toHaveLength(1)
        expect(remote.text).not.toContain('ZZhost-fake')
        const a = JSON.parse(remote.text); const b = JSON.parse(local.text)
        for (const x of [a, b]) { delete x.ms; delete x.stores; delete x.saveTime; delete x.remote; delete x.ranOn }
        expect(a).toEqual(b)
    })
    it('a machine that cannot run it is refused with exit 2 and a reason', async () => {
        const transportFactory = () => ({ where: 'fake', run: async () => ({ code: 127, stdout: Buffer.alloc(0), stderr: 'no node on this machine' }) })
        const r = await run(['count', '--host', 'fake'], { transportFactory })
        expect(r.code).toBe(2)
        expect(r.text).toMatch(/no node/)
    })
})

// ---- round 2: each fixture is its own made-up home, so the numbers above stay as they were
let nHome = 0
const mk = (files, repoFiles = null) => {
    const home = path.join(ROOT, `h${nHome += 1}`)
    for (const [rel, body] of Object.entries(files)) { const f = path.join(home, '.di', 'data', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body, null, 2)) }
    fs.mkdirSync(path.join(home, '.di', 'data'), { recursive: true })
    const repo = path.join(ROOT, `r${nHome}`); fs.mkdirSync(repo, { recursive: true })
    for (const [rel, body] of Object.entries(repoFiles || {})) { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body) }
    return { home, repo }
}
const P = (s, p) => `spaces/${s}/projects/${p}/document.json`
const lampT = (id, extra = {}) => ({ id, components: { fixture: { type: 'ZZV spot', ...extra } } })
const cnt = (h, extra = {}) => count({ ids: true, home: h.home, env: {}, repo: h.repo, ...extra })
const runIn = (h, argv, deps = {}) => run(argv, { home: h.home, count: { repo: h.repo }, ...deps })

describe('round 2: counts', () => {
    it('A1 copies found in the file own space are summed and printed', async () => {
        const h = mk({
            [P('s1', 'p1')]: doc({ entities: [{ id: 'e1', components: { rigLooks: { looks: [{ id: 'ZZID-k1' }] } } }] }),
            [P('s2', 'p2')]: doc({ entities: [{ id: 'e2', components: { rigLooks: { looks: [{ id: 'ZZID-k2' }] } } }] }),
            'spaces/s1/lighting/show.json': { looks: [{ id: 'rig-ZZID-k1' }, { id: 'rig-ZZID-k2' }] }
        })
        const r = cnt(h)
        expect(r.deskFiles[0].names.copiesFoundInOwnSpace).toBe(1)
        expect(r.names).toMatchObject({ copiesFoundInOwnSpace: 1, copiesFound: 2 })
        expect((await runIn(h, ['count'])).text).toContain("found in the file's own space: 1")
    })
    it('A2 blankBytes is the count of 0x20 0x09 0x0A 0x0D as saved, printed after the bytes', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')], title: 'a b' }) })
        const file = path.join(h.home, '.di', 'data', P('s1', 'p1'))
        const buf = fs.readFileSync(file)
        const expected = buf.length - [...buf].filter((b) => ![32, 9, 10, 13].includes(b)).length
        const x = cnt(h).documents.list[0]
        expect(x.blankBytes).toBe(expected)
        expect(expected).toBeGreaterThan(20)
        expect((await runIn(h, ['count'])).text).toContain(`${buf.length.toLocaleString('en-US')} (${expected.toLocaleString('en-US')} spaces and line breaks)`)
    })
    it('A3 splits documents with a rig from documents with cues only', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')], mappingState: { cues: [{ id: 'c' }] } }), [P('s1', 'p2')]: doc({ mappingState: { cues: [{ id: 'a' }, { id: 'b' }] } }) })
        const d = cnt(h).documents
        expect(d).toMatchObject({ holdingShow: 2, withRig: { documents: 1, cues: 1 }, cuesOnly: { documents: 1, cues: 2 } })
        expect((await runIn(h, ['count'])).text).toContain('2 hold a show: 1 with a lamp, a designed look or a laser object (1 cues), 1 with cues only (2 cues); in 1 spaces')
    })
    it('A4 a lamp has a fixture type; the rest is counted apart; lamps off DMX are counted', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1'), lampT('e2', { dmx: false }), { id: 'e3', components: { fixture: {} } }] }) })
        const d = cnt(h).documents
        expect(d.totals).toMatchObject({ lamps: 2, lampsNotDmx: 1, fixtureNoType: 1 })
        const t = (await runIn(h, ['count'])).text
        expect(t).toContain('fixture marks without a type: 1, not counted as lamps')
        expect(t).toContain('of the lamps 1 are off DMX (the mark a network laser carries)')
    })
    it('A5 one project id in two spaces keeps the lamps of both', () => {
        const h = mk({
            [P('sa', 'ZZID-same')]: doc({ entities: [lampT('l-a')] }), [P('sb', 'ZZID-same')]: doc({ entities: [lampT('l-b')] }),
            'lighting/show.json': { fixtures: [{ id: 'd1', rigKey: 'ZZID-same:l-a' }, { id: 'd2', rigKey: 'ZZID-same:l-b' }] }
        })
        expect(cnt(h).names).toMatchObject({ lampsWithKey: 2, lampsKeyFound: 2 })
    })
    it('A6 a desk cue list that names a project: here or not here', async () => {
        const h = mk({
            [P('s1', 'ZZID-here')]: doc({ entities: [lampT('e1')] }),
            'lighting/show.json': { cues: { project: 'ZZID-here', missing: [1, 2] } },
            'spaces/s1/lighting/show.json': { cues: { project: 'ZZID-nothere' } }
        })
        const r = cnt(h)
        expect(r.deskFiles.map((f) => f.names.cueListProject)).toEqual(['here', 'not here'])
        expect(r.deskFiles[0].names.cueListMissing).toBe(2)
        expect(r.names).toMatchObject({ cueListsNamingAProject: 2, cueListProjectHere: 1, cueListMissing: 2 })
        expect((await runIn(h, ['count'])).text).toContain('desk cue lists that name a project: 2; that project is on this machine for 1')
    })
    it('B3 a project folder without a document is counted', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')] }), 'spaces/s1/projects/empty/.keep': '' })
        expect(cnt(h).documents).toMatchObject({ projectFolders: 2, withoutDocument: 1, total: 1 })
        expect((await runIn(h, ['count'])).text).toContain('project folders without a document file: 1')
    })
    it('B4 entities that are not a list are listed as unread', () => {
        const h = mk({ [P('s1', 'p1')]: { entities: 'ZZV' } })
        expect(cnt(h).unread.map((u) => u.error)).toEqual(['EntitiesNotAList'])
    })
    it('B5 a show file that parses but is not an object is a row, unread', () => {
        const h = mk({ 'lighting/show.json': '[1,2]' })
        const r = cnt(h)
        expect(r.deskFiles).toHaveLength(1)
        expect(r.deskFiles[0].unread).toBe(true)
        expect(r.unread[0].error).toBe('NotAnObject')
    })
    it('B5 a laser desk file that parses but is not an object is a row, unread', () => {
        const h = mk({ 'laser/desk.json': '[1,2]' })
        const r = cnt(h)
        expect(r.deskFiles).toEqual([expect.objectContaining({ kind: 'laser desk file', unread: true })])
        expect(r.unread.map((u) => u.error)).toEqual(['NotAnObject'])
    })
    it('B6 other files in the desk folders: counted, never opened, no name printed', async () => {
        const h = mk({
            'lighting/show.json': {}, 'lighting/show.prev.json': 'x'.repeat(7), 'lighting/backups/a.json': 'y'.repeat(3), 'lighting/backups/b.json': 'z'.repeat(5), 'lighting/ZZV-unknown.bin': 'q'.repeat(11)
        })
        const f = cnt(h).deskFolders
        expect(f).toEqual([{ label: '<data>/lighting', kinds: { 'previous copy': { files: 1, bytes: 7 }, backups: { files: 2, bytes: 8 }, other: { files: 1, bytes: 11 } } }])
        for (const argv of [['count'], ['count', '--ids']]) {
            const t = (await runIn(h, argv)).text
            expect(t).toContain('=== 2b. other files in the desk folders (not opened)')
            expect(t).toContain('previous copy 1 files, 7 bytes')
            expect(t).not.toContain('ZZV')
        }
    })
    it('E3 the save time: four numbers, and the text says without the disk write', async () => {
        const { text } = await run(['count'])
        expect(text).toContain('=== 6. save time of the largest document that holds a show, median of 5, without the disk write')
        const r = JSON.parse((await run(['count', '--json'])).text)
        for (const k of ['read', 'parse', 'normalise', 'serialise']) expect(typeof r.saveTime[k]).toBe('number')
    })
})

describe('round 2: named folders and unreadable folders', () => {
    const good = () => mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')] }) })
    it('B1 --data-dir and --di-home to a missing folder stop the count', async () => {
        const h = good()
        for (const flag of ['--data-dir', '--di-home']) {
            const r = await runIn(h, ['count', flag, path.join(ROOT, 'nowhere-zz')])
            expect(r.code).toBe(1)
            expect(r.text).toContain(`the folder named by ${flag} is not there`)
            expect(r.text).not.toMatch(/=== 1|document \d/)
        }
        const j = await runIn(h, ['count', '--data-dir', path.join(ROOT, 'nowhere-zz'), '--json'])
        expect(j.text).not.toContain(h.home)
    })
    it('B1 the flag wins over the environment; no folder at all says so', async () => {
        const h = good()
        const other = mk({})
        const r = JSON.parse((await runIn(h, ['count', '--di-home', path.join(h.home, '.di'), '--json'], { env: { DATA_ROOT: path.join(other.home, '.di', 'data') } })).text)
        expect(r.documents.total).toBe(1)
        const bare = mk({}); fs.rmSync(path.join(bare.home, '.di'), { recursive: true })
        const n = await runIn(bare, ['count'])
        expect(n.code).toBe(1)
        expect(n.text).toContain('no data folder found')
    })
    it('B1 an unnamed default whose spaces folder is missing says so', async () => {
        const h = mk({ 'lighting/show.json': {} })
        expect(cnt(h).data.spacesState).toBe('not there')
        expect((await runIn(h, ['count'])).text).toContain('spaces folder: not there')
    })
    it.skipIf(process.getuid && process.getuid() === 0)('B2 a folder that cannot be read is listed, not taken as empty', async () => {
        const h = good()
        const dir = path.join(h.home, '.di', 'data', 'spaces', 's1', 'projects')
        fs.chmodSync(dir, 0o000)
        try {
            const r = cnt(h)
            expect(r.unread).toHaveLength(1)
            expect(r.unread[0].label).toBe('folder <spaces>/space 1/projects')
            expect((await runIn(h, ['count'])).code).toBe(1)
        } finally { fs.chmodSync(dir, 0o755) }
    })
    it.skipIf(process.getuid && process.getuid() === 0)('B3 a document that cannot be looked at is listed as unread, not counted as a folder without a document', () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')] }), [P('s1', 'p2')]: doc() })
        const dir = path.join(h.home, '.di', 'data', 'spaces', 's1', 'projects', 'p2')
        fs.chmodSync(dir, 0o000)
        try {
            const r = cnt(h)
            expect(r.documents).toMatchObject({ projectFolders: 2, withoutDocument: 0, total: 1 })
            expect(r.unread).toEqual([{ label: 'document of project folder 2 in space 1', bytes: null, error: 'EACCES' }])
        } finally { fs.chmodSync(dir, 0o755) }
    })
    it.skipIf(process.getuid && process.getuid() === 0)('the laser rig file and the other files of a desk folder are not opened: without a read bit they count the same', () => {
        const h = mk({ 'laser/laser.json': '{"ZZV":1}', 'lighting/show.prev.json': 'x'.repeat(7), 'lighting/backups/a.json': 'y'.repeat(3) })
        const files = ['laser/laser.json', 'lighting/show.prev.json', 'lighting/backups/a.json'].map((rel) => path.join(h.home, '.di', 'data', rel))
        const open = cnt(h)
        for (const f of files) fs.chmodSync(f, 0o000)
        try {
            const shut = cnt(h)
            expect(shut.unread).toEqual([])
            expect(shut.names.laser.rigFile).toBe('there, 9 bytes (not opened)')
            expect(shut.deskFolders).toEqual(open.deskFolders)
            expect(open.deskFolders[0].kinds).toMatchObject({ 'previous copy': { files: 1, bytes: 7 }, backups: { files: 1, bytes: 3 } })
        } finally { for (const f of files) fs.chmodSync(f, 0o644) }
    })
})

describe('round 2: the path to another machine', () => {
    const viaBash = (env, seen = []) => ({ where: 'ZZhost', run: async (script) => { seen.push(script); const r = spawnSync('/bin/bash', ['-s'], { input: script, env }); return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr.toString() } } })
    it('C1 the node of di is used when it is there, also when PATH holds another node', async () => {
        const h = mk({})
        const node = path.join(h.home, '.di', 'runtime', 'node', 'bin', 'node')
        fs.mkdirSync(path.dirname(node), { recursive: true })
        fs.writeFileSync(node, '#!/bin/sh\necho \'{"v":1,"node":"vSTANDIN","platform":"x","ids":false,"ok":false,"reason":"stand-in","data":{"read":null,"others":[]},"unread":[]}\'\n'); fs.chmodSync(node, 0o755)
        const r = await run(['count', '--json', '--host', 'x'], { home: h.home, transportFactory: () => viaBash({ PATH: `${BIN}:${path.dirname(process.execPath)}`, HOME: h.home }) })
        expect(JSON.parse(r.text).node).toBe('vSTANDIN')
    })
    it('C1 no node anywhere: exit 127 and the words', async () => {
        const h = mk({})
        const r = await run(['count', '--host', 'x'], { home: h.home, transportFactory: () => viaBash({ PATH: BIN, HOME: h.home }) })
        expect(r.code).toBe(2)
        expect(r.text).toMatch(/no node on this machine/)
    })
    it('C3 the folder option reaches the core as typed and ~/ is that machine\'s home; C4 the text names its limits', async () => {
        const seen = []
        const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME }
        const r = await run(['count', '--host', 'x', '--data-dir', '~/.di/data'], { transportFactory: () => viaBash(env, seen) })
        expect(seen[0]).toContain('"dataDir":"~/.di/data"')
        expect(r.text).toMatch(/^counted on another machine \(node [\d.]+, \w+\)/)
        expect(r.text).toContain('=== 5. per-browser stores: not listed for another machine (they come from this code tree)')
        expect(r.text).toContain('=== 6. save time: not measured on another machine (it needs the code tree there)')
        const j = JSON.parse((await run(['count', '--host', 'x', '--data-dir', '~/.di/data', '--json'], { transportFactory: () => viaBash(env) })).text)
        expect(j.documents.total).toBe(4)
    })
    it('C4 a local run names this machine first', async () => {
        expect((await run(['count'])).text).toMatch(/^counted on this machine \(node [\d.]+, \w+\)/)
    })
    it('C6 a local run never builds the transport; another host does', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')] }) })
        const transportFactory = () => { throw new Error('no transport here') }
        expect((await runIn(h, ['count'], { transportFactory })).code).toBe(0)
        expect((await runIn(h, ['count', '--host', 'local'], { transportFactory })).code).toBe(0)
        expect((await runIn(h, ['count', '--host', 'other'], { transportFactory })).code).toBe(2)
    })
})

describe('round 2: the per-browser stores in the code', () => {
    it('D lists every file, with literal, constant, run-time and helper rows; test files are left out', async () => {
        const h = mk({ [P('s1', 'p1')]: doc({ entities: [lampT('e1')] }) }, {
            'src/a/showKey.js': "localStorage.setItem('ZZkey-lit', 1)\n",
            'src/ui/theme.js': "const THEME_KEY = 'ZZtheme'\nwindow.localStorage.getItem(THEME_KEY)\n",
            'src/ui/dyn.js': 'window.sessionStorage.setItem(prefix + id, 1)\n',
            'src/ui/helper.js': '// the value is kept in localStorage by store.js\n',
            'src/ui/db.js': "indexedDB.open('ZZdb')\n",
            'src/ui/x.test.js': "localStorage.setItem('ZZtest', 1)\n"
        })
        const r = JSON.parse((await runIn(h, ['count', '--json'])).text)
        const by = (k) => r.stores.find((s) => s.key === k)
        expect(by('ZZkey-lit')).toMatchObject({ kind: 'localStorage', show: true })
        expect(by('ZZtheme')).toMatchObject({ kind: 'key constant', show: false })
        expect(r.stores.find((s) => s.kind === 'key built at run time')).toMatchObject({ key: null, name: 'prefix + id' })
        expect(r.stores.find((s) => s.kind === 'store used through a helper')).toMatchObject({ key: null })
        expect(by('ZZdb')).toBeTruthy()
        expect(r.stores.some((s) => s.key === 'ZZtest')).toBe(false)
        expect(r.stores).toHaveLength(5)
        const t = (await runIn(h, ['count'])).text
        expect(t).toContain('=== 5. per-browser stores in the code: 5 rows in 5 files; 1 with a key built at run time (* = on show ground)')
        expect(t).toMatch(/\* ZZkey-lit/)
        expect(t).toMatch(/ {3}ZZtheme/)
    })
})
