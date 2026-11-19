// @vitest-environment node
// di show count: a made-up home, exact counts, read-only, no value, safe by default, the core piped, the path to another machine.
// Every string value of the made-up show holds ZZV and every id holds ZZID; the default output may hold neither.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main } from './cli.mjs'
import { count } from './lib/countCore.mjs'
import { makeTransport } from './lib/transport.mjs'

const CORE = path.join(path.dirname(new URL(import.meta.url).pathname), 'lib', 'countCore.mjs')
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
        expect(light.counts).toMatchObject({ lamps: 3, looks: 4, 'light scenes': 1, layers: 1, sets: 1, 'effects (keys of fx)': 2, LFOs: 2, 'MIDI map entries': 3, 'custom fixture types': 1, 'cue list': 2 })
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
    it('a bad flag is refused with exit 2', async () => {
        expect((await run(['count', '--venue', 'no-such-venue-zz'])).code).toBe(2)
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
    })
})

describe('the core on its own', () => {
    it('piped through node --input-type=module - it prints the same JSON as the import', () => {
        const opts = { ids: false, home: HOME, env: {}, diHome: path.join(HOME, '.di') }
        const piped = spawnSync(process.execPath, ['--input-type=module', '-', JSON.stringify(opts)], { input: fs.readFileSync(CORE), env: { PATH: BIN, HOME: HOME }, encoding: 'utf8' })
        expect(piped.status).toBe(0)
        const a = JSON.parse(piped.stdout); const b = JSON.parse(JSON.stringify(count(opts)))
        delete a.ms; delete b.ms
        expect(a).toEqual(b)
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
        for (const x of [a, b]) { delete x.ms; delete x.stores; delete x.saveTime }
        expect(a).toEqual(b)
    })
    it('a machine that cannot run it is refused with exit 2 and a reason', async () => {
        const transportFactory = () => ({ where: 'fake', run: async () => ({ code: 127, stdout: Buffer.alloc(0), stderr: 'no node on this machine' }) })
        const r = await run(['count', '--host', 'fake'], { transportFactory })
        expect(r.code).toBe(2)
        expect(r.text).toMatch(/no node/)
    })
    it('the real transport is not built by these tests', () => {
        expect(typeof makeTransport).toBe('function')
    })
})
