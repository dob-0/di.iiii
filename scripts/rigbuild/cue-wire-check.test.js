import { describe, expect, it, vi, afterEach } from 'vitest'
import http from 'node:http'

// The room's pose of a look is mocked to a fixed level per lamp: these tests are about the checker, not the rig rules.
const LEVELS = new Map([['w1', 1], ['w2', 1], ['w3', 0], ['b1', 0.8]])
vi.mock('../../src/rigbuild/looks.js', async (orig) => {
    const real = await orig()
    return { ...real, lookPoses: () => new Map([...LEVELS].filter(([, v]) => v > 0).map(([id, level]) => [id, { level, rotation: [0, 0, 0], position: [0, 6, 0] }])) }
})

import { parseCueRange, statsOf, lampsOf, lookOfCue, expectationOf, measureOf, compareLamps, cueLine, nodeUniverseOf, nodeKindOf, main, MOVE_THRESHOLD, followNext, followMinutes } from './cue-wire-check.mjs'
import { TYPE_LIBRARY } from '../../src/rigbuild/types/index.js'

const lamp = (id, type, universe, address, extra = {}) => ({ id, type: 'spotLight', components: { transform: { position: [id === 'w2' ? 3 : 0, 6, 0] }, fixture: { type, universe, address }, ...extra } })
const ENTITIES = [
    lamp('w1', 'up-pl5403', 1, 1), lamp('w2', 'up-pl5403', 1, 9), lamp('w3', 'up-pl5403', 1, 17), lamp('b1', 'up-b380f', 2, 1),
    { id: 'rig-show', type: 'group', components: { rigLooks: { looks: [
        { id: 'hit', motion: { mode: 'strobe', bpm: 132, kinds: ['up-pl5403'], depth: 255, still: 0, spatial: 'patch' } },
        { id: 'calm' }
    ] } } }
]
const PROFILES = { 'UP-PL5403 8ch': { channels: ['dimmer', 'r', 'g', 'b', 'w', 'strobe', 'mode', 'speed'] }, 'UP-B380F 16ch': { channels: ['pan', 'tilt', 'panFine', 'tiltFine', 'speed', 'frost', 'strobe', 'dimmer', 'color', 'gobo', 'prism', 'rotation', 'aux1', 'aux2', 'focus', 'control'] } }
const DESK_FIXTURES = [
    { key: 'p:w1', id: 'd1', profile: 'UP-PL5403 8ch', universe: 1, address: 1 },
    { key: 'p:w2', id: 'd2', profile: 'UP-PL5403 8ch', universe: 1, address: 9 },
    { key: 'p:w3', id: 'd3', profile: 'UP-PL5403 8ch', universe: 1, address: 17 },
    { key: 'p:b1', id: 'd4', profile: 'UP-B380F 16ch', universe: 2, address: 1 },
    { key: 'p:ghost', id: 'd5', profile: 'UP-PL5403 8ch', universe: 1, address: 25 },
    { key: 'p:las', id: 'd6', profile: 'LASER 5ch', universe: 1, address: 33 }
]

describe('parseCueRange', () => {
    it('reads ranges, lists and mixes, clips to the cue count, sorts and de-duplicates', () => {
        expect(parseCueRange('0-3', 50)).toEqual([0, 1, 2, 3])
        expect(parseCueRange('14,41', 50)).toEqual([14, 41])
        expect(parseCueRange('9, 3-5,4', 50)).toEqual([3, 4, 5, 9])
        expect(parseCueRange('45-60', 50)).toEqual([45, 46, 47, 48, 49])
        expect(parseCueRange(undefined, 3)).toEqual([0, 1, 2])
        expect(parseCueRange(true, 2)).toEqual([0, 1])
    })
    it('refuses nonsense and backwards ranges', () => {
        expect(() => parseCueRange('a-b', 5)).toThrow(/cannot read/)
        expect(() => parseCueRange('5-2', 9)).toThrow(/backwards/)
    })
})

describe('statsOf', () => {
    it('a steady dimmer is lit and still', () => {
        expect(statsOf([200, 200, 200], { seconds: 1 })).toMatchObject({ lit: true, moving: false, changes: 0, perSec: 0 })
    })
    it('a dark lamp is not lit', () => {
        expect(statsOf([0, 0, 0])).toMatchObject({ lit: false, moving: false })
    })
    it('a strobe is moving, and the changes per second count the steps over the threshold', () => {
        const s = statsOf([255, 0, 255, 0, 255, 0], { seconds: 0.5 })
        expect(s).toMatchObject({ lit: true, moving: true, changes: 5, perSec: 10, min: 0, max: 255 })
    })
    it(`a ripple of ${MOVE_THRESHOLD} or less is not motion`, () => {
        expect(statsOf([100, 110, 120]).moving).toBe(false)
        expect(statsOf([100, 110, 121]).moving).toBe(true)
    })
    it('no samples = nothing', () => {
        expect(statsOf([])).toMatchObject({ n: 0, lit: false, moving: false })
    })
})

describe('lampsOf', () => {
    const { lamps, skipped } = lampsOf({ deskFixtures: DESK_FIXTURES, profiles: PROFILES, entities: ENTITIES, library: TYPE_LIBRARY })
    it('takes the dimmer slot from the profile: wash offset 0, beam offset 7', () => {
        expect(lamps.map((l) => [l.entityId, l.kind, l.universe, l.index])).toEqual([['w1', 'UP-PL5403', 1, 0], ['w2', 'UP-PL5403', 1, 8], ['w3', 'UP-PL5403', 1, 16], ['b1', 'UP-B380F', 2, 7]])
    })
    it('says why a fixture is not measured', () => {
        expect(skipped.map((s) => s.id)).toEqual(['ghost', 'las'])
        expect(skipped[0].why).toMatch(/not in the document/)
        expect(skipped[1].why).toMatch(/not in the document/)
    })
})

describe('expectationOf', () => {
    const { lamps } = lampsOf({ deskFixtures: DESK_FIXTURES, profiles: PROFILES, entities: ENTITIES, library: TYPE_LIBRARY })
    const rigLooks = ENTITIES[4].components.rigLooks
    const cue = (lookId) => ({ id: 'c', name: 'Hit', lookId, fade: 2 })
    it('finds the document look of a desk cue', () => {
        expect(lookOfCue(cue('rig-hit'), rigLooks).id).toBe('hit')
        expect(lookOfCue(cue('rig-nope'), rigLooks)).toBeNull()
    })
    it('a strobe look: the lit washes of its kinds move, the beam (not a kind) is lit and still, the dark wash is dark', () => {
        const e = expectationOf({ cue: cue('rig-hit'), look: rigLooks.looks[0], lamps, entities: ENTITIES, library: TYPE_LIBRARY, rigLooks })
        const by = Object.fromEntries(e.lamps.map((l) => [l.entityId, l]))
        expect(e.motion).toMatchObject({ mode: 'strobe', bpm: 132 })
        expect([by.w1.lit, by.w1.moving, by.w2.lit, by.w2.moving]).toEqual([true, true, true, true])
        expect(by.w1.perSec).toBeGreaterThan(0)
        expect([by.w3.lit, by.w3.moving]).toEqual([false, false])
        expect([by.b1.lit, by.b1.moving]).toEqual([true, false])
        expect(by.b1.range).toEqual([204, 204])
    })
    it('a look with no motion: lit lamps, nothing moving', () => {
        const e = expectationOf({ cue: cue('rig-calm'), look: rigLooks.looks[1], lamps, entities: ENTITIES, library: TYPE_LIBRARY, rigLooks })
        expect(e.motion).toBeNull()
        expect(e.lamps.filter((l) => l.moving)).toHaveLength(0)
        expect(e.lamps.filter((l) => l.lit).map((l) => l.entityId)).toEqual(['w1', 'w2', 'b1'])
    })
    it('a cue whose look is not in the document is an error line, not a crash', () => {
        expect(expectationOf({ cue: cue('rig-nope'), look: null, lamps, entities: ENTITIES, library: TYPE_LIBRARY }).error).toMatch(/no document look/)
    })
})

describe('compare and the cue line', () => {
    const exp = [{ entityId: 'a', kind: 'K', lit: true, moving: true, perSec: 6 }, { entityId: 'b', kind: 'K', lit: true, moving: false, perSec: 0 }, { entityId: 'c', kind: 'K', lit: false, moving: false, perSec: 0 }]
    const steady = [200, 200, 200]
    const wire = { a: [255, 0, 255, 0], b: steady, c: [0, 0, 0, 0] }
    it('matches when lit and moving agree', () => {
        const w = compareLamps(exp, measureOf(exp, (l) => wire[l.entityId]))
        expect(w).toMatchObject({ lit: 2, moving: 1, mismatches: [], unread: 0 })
    })
    it('lists the lamp that should move but sits still (the owner\'s "strobe not on the wire")', () => {
        const w = compareLamps(exp, measureOf(exp, (l) => (l.entityId === 'a' ? steady : wire[l.entityId])))
        expect(w.mismatches).toHaveLength(1)
        expect(w.mismatches[0]).toMatchObject({ entityId: 'a', expected: { moving: true }, measured: { lit: true, moving: false } })
    })
    it('a lamp that was not read is counted unread, never silently OK', () => {
        const w = compareLamps(exp, measureOf(exp, (l) => (l.entityId === 'b' ? null : wire[l.entityId])))
        expect(w.unread).toBe(1)
    })
    it('prints the owner\'s line', () => {
        const e = { cue: { name: 'Ice strobe' }, motion: { mode: 'strobe', bpm: 132 }, lamps: exp }
        const ok = compareLamps(exp, measureOf(exp, (l) => wire[l.entityId]))
        expect(cueLine(41, e, { desk: ok, node: ok })).toBe('41 Ice strobe  strobe 132bpm  expect lit 2 move 1 | desk lit 2 move 1 | node lit 2 move 1  OK')
        const bad = compareLamps(exp, measureOf(exp, () => steady))
        expect(cueLine(41, e, { desk: bad })).toMatch(/MISMATCH$/)
        expect(cueLine(3, { cue: { name: 'X' }, motion: null, lamps: exp })).toBe(' 3 X  still  expect lit 2 move 1')
    })
})

describe('what a node is', () => {
    const own = { config: { universes: [{ universe: 1 }] } }
    it('reads the desk universe from the node\'s own input config', () => {
        expect(nodeUniverseOf(own)).toBe(1)
        expect(nodeUniverseOf({})).toBeNull()
    })
    it('one buffer of two, with its own input = its own received buffer', () => {
        expect(nodeKindOf({ nodeDmxKeys: ['0'], deskDmxKeys: ['0', '1'], input: own, state: { fixtures: [] } })).toMatchObject({ kind: 'own buffer', universe: 1 })
    })
    it('every desk universe answered = a bridge until proven otherwise; no input config = unknown', () => {
        expect(nodeKindOf({ nodeDmxKeys: ['0', '1'], deskDmxKeys: ['0', '1'], input: own, state: null }).kind).toBe('bridge?')
        expect(nodeKindOf({ nodeDmxKeys: ['0'], deskDmxKeys: ['0', '1'], input: null, state: null }).kind).toBe('unknown')
    })
})

// ---- the live loop against a fake desk and a fake node: GO, wait, sample, compare, restore ---------------------------------
const serve = (handler) => new Promise((ok) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => ok(s)) })
const json = (res, body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }

const fakeHall = async ({ moving }) => {
    const log = { posts: [], gets: [] }
    const ticks = { desk: 0, node: 0 }   // one count per wire: each is read once per sample, so each strobes on its own
    const buffers = (who) => {
        const flip = (ticks[who]++ % 2) * 255
        const b0 = new Array(512).fill(0)
        const b1 = new Array(512).fill(0)
        b0[0] = b0[8] = moving ? flip : 255
        b1[7] = 204
        return { 0: b0, 1: b1 }
    }
        const node = await serve((req, res) => {
        if (req.url === '/api/dmx') return json(res, { dmx: { 0: buffers('node')[1] } })
        if (req.url === '/api/input') return json(res, { config: { universes: [{ universe: 1 }] } })
        if (req.url === '/api/state') return json(res, { fixtures: [] })
        res.statusCode = 404; res.end('{}')
    })
    const cues = { list: [{ id: 'c0', name: 'Hit', lookId: 'rig-hit', fade: 0 }, { id: 'c1', name: 'Calm', lookId: 'rig-calm', fade: 0 }], index: 1, running: true }
    const desk = await serve((req, res) => {
        const url = req.url.split('?')[0]
        if (req.method === 'POST') {
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', () => { log.posts.push(`${url} ${body}`); json(res, { cues }) })
            return
        }
        log.gets.push(url)
        if (url === '/api/projects/p/document') return json(res, { document: { entities: ENTITIES } })
        if (url === '/light/api/state') return json(res, { profiles: PROFILES, output: { targets: [] } })
        if (url === '/light/api/rig') return json(res, { fixtures: DESK_FIXTURES })
        if (url === '/light/api/cues') return json(res, { cues })
        if (url === '/light/api/dmx') return json(res, { dmx: buffers('desk') })
        res.statusCode = 404; res.end('{}')
    })
    const close = () => Promise.all([desk, node].map((s) => new Promise((ok) => s.close(ok))))
    return { log, close, base: `http://127.0.0.1:${desk.address().port}`, node: `127.0.0.1:${node.address().port}` }
}

describe('main, against a fake hall (no network beyond 127.0.0.1)', () => {
    let hall
    const lines = []
    afterEach(async () => { await hall?.close(); vi.restoreAllMocks(); lines.length = 0 })
    const run = async (extra) => {
        vi.stubEnv('DI_API_TOKEN', 'test')
        vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')))
        return main(['--project', 'p', '--api', `${hall.base}`, '--desk', `${hall.base}/light/api`, '--seconds', '0.5', '--hz', '20', ...extra])
    }
    it('GO, sample, say OK when the wire strobes as the room does, then put the desk back where it was', async () => {
        hall = await fakeHall({ moving: true })
        const ok = await run(['--cues', '0', '--nodes', hall.node])
        expect(ok).toBe(1)
        expect(lines.join('\n')).toMatch(/0 Hit {2}strobe 132bpm {2}expect lit 3 move 2 \| desk lit 3 move 2 \| node lit 1 move 0 {2}OK/)
        expect(lines.join('\n')).toMatch(/node 127\.0\.0\.1:\d+: own buffer, desk universe 2/)
        expect(lines.join('\n')).toMatch(/cues OK 1\/1/)
        expect(hall.log.posts).toEqual(['/light/api/cues/go {"index":0}', '/light/api/cues/go {"index":1}'])
    })
    it('says MISMATCH and names the lamps when the wire stays still, and still restores', async () => {
        hall = await fakeHall({ moving: false })
        const ok = await run(['--cues', '0'])
        expect(ok).toBe(0)
        expect(lines.join('\n')).toMatch(/MISMATCH/)
        expect(lines.join('\n')).toMatch(/desk w1 \(UP-PL5403\): expected lit true move true · measured lit true move false/)
        expect(lines.join('\n')).toMatch(/cues OK 0\/1/)
        expect(hall.log.posts.at(-1)).toBe('/light/api/cues/go {"index":1}')
    })
    it('--dry-run sends nothing and reads no wire', async () => {
        hall = await fakeHall({ moving: true })
        await run(['--dry-run'])
        expect(hall.log.posts).toEqual([])
        expect(hall.log.gets).not.toContain('/light/api/dmx')
        expect(lines.join('\n')).toMatch(/1 Calm {2}still {2}expect lit 3 move 0/)
    })
})

describe('--follow: measure each cue while the desk plays the show (no GO)', () => {
    const cues = [{ fade: 6, hold: 30 }, { fade: 0, hold: 26 }, { fade: 4, hold: 28 }]
    it('waits for the playing cue\'s fade, counted from when the desk fired it', () => {
        expect(followNext({ runner: { index: 0, running: true, firedAt: 1000 }, todo: new Set([0, 1]), cues, nowMs: 2000 })).toEqual({ index: 0, waitMs: 5500 })
        expect(followNext({ runner: { index: 1, running: true, firedAt: 1000 }, todo: new Set([1]), cues, nowMs: 9000 })).toEqual({ index: 1, waitMs: 0 })
    })
    it('skips a stopped runner, a cue already measured and a cue not picked', () => {
        expect(followNext({ runner: { index: 0, running: false, firedAt: 1 }, todo: new Set([0]), cues, nowMs: 2 })).toBeNull()
        expect(followNext({ runner: { index: 2, running: true, firedAt: 1 }, todo: new Set([0, 1]), cues, nowMs: 2 })).toBeNull()
        expect(followNext({ runner: { index: -1, running: true }, todo: new Set([0]), cues, nowMs: 2 })).toBeNull()
    })
    it('gives one loop of the show and two minutes, unless told', () => {
        expect(followMinutes(cues)).toBe(Math.ceil((36 + 26 + 32) / 60) + 2)
        expect(followMinutes(cues, '5')).toBe(5)
    })
})
