// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createShowPlayer, lineGroupsOf, groupOfLine, frameIndexAt, cubeFrameAt, defaultMap, TICK_MS } = require('./laserShow')

const line = (id, list, period = 10) => ({ id, type: 'spotLight', components: { beam: { laser: { mW: [1], nm: [525], frames: { period, list } } } } })
const DOC = {
    entities: [
        line('rig-laser-1a', [[[0, 0, 0, 0, 0]], [[0.1, 0.2, 1, 1, 1], [0.2, 0.2, 1, 1, 1]]]),
        line('rig-laser-1b', [[[0.5, 0.5, 0, 1, 0]], [[0, 0, 0, 0, 0]]]),
        line('rig-laser-2a', [[[-0.5, 0.1, 1, 0, 0]], [[-0.5, 0.2, 1, 0, 0]]]),
        { id: 'lamp', type: 'spotLight', components: { beam: { laser: { mW: [1], nm: [525], frame: [[0, 0, 1, 1, 1]] } } } },
        { id: 'wall', type: 'mesh' }
    ]
}

const fakeEngine = (cubes = ['cube-1', 'cube-2'], { refuse = () => null } = {}) => {
    const calls = []
    return {
        calls,
        state: () => ({ cubes: cubes.map((id) => ({ id })) }),
        setFrame: (cube, points, out) => { const error = refuse(cube); calls.push(['set', cube, points, out]); return error ? { ok: false, error } : { ok: true } },
        alive: (cube, out) => { const error = refuse(cube); calls.push(['alive', cube, out]); return error ? { ok: false, error } : { ok: true } }
    }
}
const playerWith = (engine, { doc = DOC, t0 = 1000 } = {}) => {
    const clock = { t: t0 * 1000 }
    const timers = []
    const player = createShowPlayer({
        getEngine: () => engine,
        loadDocument: async (id) => (id === 'p' ? doc : null),
        now: () => clock.t,
        setInterval: (fn) => { timers.push(fn); return timers.length },
        clearInterval: (id) => { timers[id - 1] = null }
    })
    const at = (ms) => { clock.t += ms; for (const fn of timers) fn?.() }
    return { player, clock, timers, at }
}

describe('a project\'s laser lines, grouped by cube', () => {
    it('groups a line by its id without the trailing letters; a line named otherwise is its own group', () => {
        expect(groupOfLine('rig-laser-1a')).toBe('rig-laser-1')
        expect(groupOfLine('rig-laser-12f')).toBe('rig-laser-12')
        expect(groupOfLine('my-cube')).toBe('my-cube')
        expect(groupOfLine('')).toBe('')
    })
    it('keeps only lines with frames, sorted, and leaves a static frame and a wall out', () => {
        const groups = lineGroupsOf(DOC)
        expect([...groups.keys()]).toEqual(['rig-laser-1', 'rig-laser-2'])
        expect(groups.get('rig-laser-1').map((l) => l.id)).toEqual(['rig-laser-1a', 'rig-laser-1b'])
        expect(groups.get('rig-laser-1')[0].frames).toMatchObject({ period: 10 })
        expect(lineGroupsOf({}).size).toBe(0)
        expect(lineGroupsOf({ entities: [line('x', [], 10), line('y', [[[0, 0, 1, 1, 1]]], 0)] }).size).toBe(0)
    })
    it('picks the frame on now with the room\'s formula', () => {
        const frames = { period: 10, list: [[[0, 0, 0, 0, 0]], [[0, 0, 1, 1, 1]]] }
        expect(frameIndexAt(frames, 3)).toBe(0)
        expect(frameIndexAt(frames, 7)).toBe(1)
        expect(frameIndexAt(frames, 13)).toBe(0)
        expect(frameIndexAt(frames, -2)).toBe(1)
        expect(frameIndexAt(null, 3)).toBe(-1)
    })
    it('joins a cube\'s lit lines with blank moves and draws one blank point when nothing is lit', () => {
        const g = lineGroupsOf(DOC).get('rig-laser-1')
        expect(cubeFrameAt(g, 3)).toEqual([[0.5, 0.5, 0, 0, 0], [0.5, 0.5, 0, 1, 0], [0.5, 0.5, 0, 0, 0]])
        expect(cubeFrameAt(g, 7)).toEqual([[0.1, 0.2, 0, 0, 0], [0.1, 0.2, 1, 1, 1], [0.2, 0.2, 1, 1, 1], [0.2, 0.2, 0, 0, 0]])
        expect(cubeFrameAt([{ id: 'a', frames: { period: 10, list: [[[0, 0, 0, 0, 0]]] } }], 3)).toEqual([[0, 0, 0, 0, 0]])
    })
    it('maps cubes and groups side by side in sorted order', () => {
        expect(defaultMap(['cube-2', 'cube-1'], ['rig-laser-2', 'rig-laser-1'])).toEqual({ 'cube-1': 'rig-laser-1', 'cube-2': 'rig-laser-2' })
        expect(defaultMap(['cube-1', 'cube-2', 'cube-3'], ['g'])).toEqual({ 'cube-1': 'g' })
    })
})

describe('the show player', () => {
    it('refuses what it cannot play, and says why', async () => {
        const { player } = playerWith(fakeEngine())
        expect(await player.start({})).toMatchObject({ ok: false, status: 400 })
        expect(await player.start({ project: 'nope' })).toMatchObject({ ok: false, status: 404 })
        expect(await player.start({ project: 'p', map: { 'cube-9': 'rig-laser-1' } })).toMatchObject({ ok: false, status: 400 })
        const noLoader = createShowPlayer({ getEngine: () => fakeEngine() })
        expect(await noLoader.start({ project: 'p' })).toMatchObject({ ok: false, status: 501 })
        expect(player.state()).toEqual({ playing: false })
    })
    it('keeps each cube\'s frame when it changes and keeps it alive in between; stop blanks its cubes', async () => {
        const engine = fakeEngine()
        const { player, at } = playerWith(engine)
        expect(await player.start({ project: 'p' })).toMatchObject({ ok: true, project: 'p', ignored: [] })
        // t = 1000 s: frame 0 on both lines of cube 1 (b lit), frame 0 of cube 2.
        expect(engine.calls.filter((c) => c[0] === 'set')).toEqual([
            ['set', 'cube-1', [[0.5, 0.5, 0, 0, 0], [0.5, 0.5, 0, 1, 0], [0.5, 0.5, 0, 0, 0]], 'show:p'],
            ['set', 'cube-2', [[-0.5, 0.1, 0, 0, 0], [-0.5, 0.1, 1, 0, 0], [-0.5, 0.1, 0, 0, 0]], 'show:p']
        ])
        expect(player.state()).toMatchObject({ playing: true, project: 'p', out: 'show:p', cubes: [{ cube: 'cube-1', group: 'rig-laser-1', lines: 2, index: 0, held: null }, { cube: 'cube-2', group: 'rig-laser-2', lines: 1, index: 0 }] })
        engine.calls.length = 0
        at(TICK_MS) // still frame 0: alive only
        expect(engine.calls).toEqual([['alive', 'cube-1', 'show:p'], ['alive', 'cube-2', 'show:p']])
        engine.calls.length = 0
        at(5000) // t = 1005.05 s: frame 1
        expect(engine.calls.map((c) => c.slice(0, 2))).toEqual([['set', 'cube-1'], ['set', 'cube-2']])
        expect(engine.calls[0][2]).toEqual([[0.1, 0.2, 0, 0, 0], [0.1, 0.2, 1, 1, 1], [0.2, 0.2, 1, 1, 1], [0.2, 0.2, 0, 0, 0]])
        expect(player.state().cubes[0].index).toBe(1)
        engine.calls.length = 0
        expect(player.stop()).toEqual({ stopped: true, project: 'p' })
        expect(engine.calls).toEqual([['set', 'cube-1', [[0, 0, 0, 0, 0]], 'show:p'], ['set', 'cube-2', [[0, 0, 0, 0, 0]], 'show:p']])
        expect(player.state()).toEqual({ playing: false })
        expect(player.stop()).toEqual({ stopped: false })
        engine.calls.length = 0
        at(TICK_MS)
        expect(engine.calls).toEqual([])
    })
    it('takes an explicit map, ignores what it cannot place, and shows a cube another Out holds', async () => {
        const engine = fakeEngine(['cube-1', 'cube-2'], { refuse: (cube) => (cube === 'cube-2' ? 'cube-2 is already driven by another Laser Out' : null) })
        const { player, at } = playerWith(engine)
        expect(await player.start({ project: 'p', map: { 'cube-1': 'rig-laser-2', 'cube-2': 'rig-laser-1', 'cube-7': 'rig-laser-1', 'cube-1x': 'nope' } }))
            .toMatchObject({ ok: true, ignored: ['no cube "cube-7"', 'no cube "cube-1x"'] })
        const s = player.state()
        expect(s.cubes).toMatchObject([{ cube: 'cube-1', group: 'rig-laser-2', held: null }, { cube: 'cube-2', group: 'rig-laser-1', held: 'cube-2 is already driven by another Laser Out' }])
        engine.calls.length = 0
        at(TICK_MS) // the held cube is tried again with its frame, the other kept alive
        expect(engine.calls.map((c) => c.slice(0, 2))).toEqual([['alive', 'cube-1'], ['set', 'cube-2']])
        player.stop()
    })
    it('reads the document again after reloadMs and plays an edit without a restart', async () => {
        const engine = fakeEngine()
        let doc = DOC
        const clock = { t: 1000 * 1000 }
        const timers = []
        const player = createShowPlayer({ getEngine: () => engine, loadDocument: async () => doc, now: () => clock.t, setInterval: (fn) => { timers.push(fn); return 1 }, clearInterval: () => {} })
        await player.start({ project: 'p', reloadMs: 1000 })
        doc = { entities: [line('rig-laser-1a', [[[0.9, 0.9, 1, 0, 0]]]), line('rig-laser-2a', [[[0, 0, 0, 0, 0]]])] }
        clock.t += 1100
        timers[0]()
        await new Promise((r) => setTimeout(r, 0))
        engine.calls.length = 0
        timers[0]()
        expect(engine.calls.map((c) => c.slice(0, 3))).toEqual([
            ['set', 'cube-1', [[0.9, 0.9, 0, 0, 0], [0.9, 0.9, 1, 0, 0], [0.9, 0.9, 0, 0, 0]]],
            ['set', 'cube-2', [[0, 0, 0, 0, 0]]]
        ])
        expect(player.state()).toMatchObject({ error: null, cubes: [{ lines: 1 }, { lines: 1 }] })
        player.stop()
    })
})
