// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    createShowPlayer, lineGroupsOf, groupOfLine, frameIndexAt, cubeFrameAt, defaultMap, stillBeamsOfGroup,
    eulerXYZ, fieldDirection, fieldPoint, aimAt, TICK_MS
} = require('./laserShow')
const { stillBeams } = require('./laserEngine')

const DEG = Math.PI / 180
// The rig's own convention (scripts/place): a line's rotation is [−π/2 − tilt, 0, yaw], forward −Y in the lamp's frame.
const aim = (yawDeg, tiltDeg = 0) => [-Math.PI / 2 - tiltDeg * DEG, 0, yawDeg * DEG]
const line = (id, list, { period = 10, rotation = aim(0), fieldHalfDeg } = {}) =>
    ({ id, type: 'spotLight', components: { transform: { rotation }, beam: { laser: { mW: [1], nm: [525], fieldHalfDeg, frames: { period, list } } } } })
const near = (a, b, eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= eps)

// Two cubes: cube 1 = two lines yawed ±2° (a comb of two), cube 2 = one line.
const DOC = {
    entities: [
        line('rig-laser-1a', [[[0, 0, 0, 0, 0]], [[0, 0, 1, 1, 1], [0.1, 0, 1, 1, 1]]], { rotation: aim(-2) }),
        line('rig-laser-1b', [[[0, 0, 0, 1, 0]], [[0, 0, 0, 0, 0]]], { rotation: aim(2) }),
        line('rig-laser-2a', [[[0, 0.1, 1, 0, 0]], [[0, 0.2, 1, 0, 0]]], { rotation: aim(30, 10) }),
        { id: 'lamp', type: 'spotLight', components: { beam: { laser: { mW: [1], nm: [525], frame: [[0, 0, 1, 1, 1]] } } } },
        { id: 'wall', type: 'mesh' }
    ]
}
const X2 = 2 / 18.5 // 2° of yaw in field units (small angles: tan ≈ linear to 1e-4)

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

describe('the geometry: a line\'s field into its cube\'s field', () => {
    it('fieldDirection and fieldPoint undo each other, and a point behind or outside the field is null', () => {
        for (const [x, y] of [[0, 0], [0.5, -0.25], [-1, 1], [0.999, 0]]) expect(near(fieldPoint(fieldDirection(x, y)), [x, y], 1e-9)).toBe(true)
        expect(fieldPoint([0, 1, 0])).toBe(null)
        expect(fieldPoint([Math.tan(20 * DEG), -1, 0])).toBe(null)
        expect(fieldDirection(0, 0)).toEqual([0, -1, 0])
    })
    it('eulerXYZ turns the rig\'s rotation into the world direction the rig means: yaw toward +x, tilt up, forward +z', () => {
        const fwd = (r) => { const m = eulerXYZ(r); return [0, 1, 2].map((i) => m[i][0] * 0 + m[i][1] * -1 + m[i][2] * 0) }
        expect(near(fwd(aim(0)), [0, 0, 1])).toBe(true)
        expect(near(fwd(aim(90)), [1, 0, 0])).toBe(true)
        expect(near(fwd(aim(0, 90)), [0, 1, 0])).toBe(true)
        // XYZ order: the yaw turns the lamp first, the pitch then tips it about world X — not spherical angles.
        expect(near(fwd(aim(30, 10)), [Math.sin(30 * DEG), Math.sin(10 * DEG) * Math.cos(30 * DEG), Math.cos(10 * DEG) * Math.cos(30 * DEG)])).toBe(true)
        expect(near(aimAt(fwd(aim(30, 10))), aim(30, 10))).toBe(true)
        expect(near(aimAt([1, 0, 0]), aim(90))).toBe(true)
        expect(near(aimAt([0, Math.sin(10 * DEG), Math.cos(10 * DEG)]), aim(0, 10))).toBe(true)
    })
    it('aims the cube at the mean of its lines and places each line\'s points by their own yaw', () => {
        const g = lineGroupsOf(DOC).get('rig-laser-1')
        expect(near(g.cube.rotation, aim(0))).toBe(true)
        expect(g.cube.fieldHalfDeg).toBe(18.5)
        // t = 7: line a (yaw −2°) draws its centre and a point 0.1 to its right; line b is blank.
        const { points, outside } = cubeFrameAt(g, 7)
        expect(outside).toBe(0)
        expect(points.map((p) => p.slice(2))).toEqual([[0, 0, 0], [1, 1, 1], [1, 1, 1], [0, 0, 0]])
        expect(near(points[1].slice(0, 2), [-X2, 0])).toBe(true)
        expect(near(points[2].slice(0, 2), [-X2 + 0.1, 0])).toBe(true)
        // t = 3: line b (yaw +2°) lit at its centre → +2° in the cube's field.
        expect(near(cubeFrameAt(g, 3).points[1].slice(0, 2), [X2, 0])).toBe(true)
        // A cube of one line: its field is the cube's; a tilted, yawed aim changes nothing.
        const g2 = lineGroupsOf(DOC).get('rig-laser-2')
        expect(near(g2.cube.rotation, aim(30, 10))).toBe(true)
        expect(near(cubeFrameAt(g2, 3).points[1].slice(0, 2), [0, 0.1])).toBe(true)
    })
    it('zooms the picture about the cube\'s axis with `scale`, blanking what leaves the field', () => {
        const g = lineGroupsOf(DOC).get('rig-laser-1')
        const big = cubeFrameAt(g, 3, { scale: 4 })
        expect(near(big.points[1].slice(0, 2), [4 * X2, 0])).toBe(true)
        expect(big.outside).toBe(0)
        const gone = cubeFrameAt(g, 3, { scale: 10 }) // 20° of yaw: beyond the field
        expect(gone).toEqual({ points: [[0, 0, 0, 0, 0]], outside: 1 })
        expect(cubeFrameAt(g, 3, { scale: 'x' }).points[1]).toEqual(cubeFrameAt(g, 3).points[1])
        expect(stillBeamsOfGroup(g, stillBeams, { scale: 4 })[0].x).toBeCloseTo(4 * X2, 3)
    })
    it('\'fit\' fills the field with each picture about its own lit centre', () => {
        const g = lineGroupsOf(DOC).get('rig-laser-1')
        // t = 7: one stroke 0.1 wide at −2°: its centre goes to 0; the zoom is capped at ×10, so its ends reach ±0.5.
        const fit = cubeFrameAt(g, 7, { scale: 'fit' })
        expect(fit.outside).toBe(0)
        expect(near(fit.points[1].slice(0, 2), [-0.5, 0], 2e-3)).toBe(true)
        expect(near(fit.points[2].slice(0, 2), [0.5, 0], 2e-3)).toBe(true)
        // A stroke 0.4 wide fills to the edge: ±0.9.
        const wide = lineGroupsOf({ entities: [line('w-1a', [[[-0.2, 0.3, 1, 1, 1], [0.2, 0.3, 1, 1, 1]]])] }).get('w-1')
        const f2 = cubeFrameAt(wide, 1, { scale: 'fit' })
        expect(near(f2.points[1].slice(0, 2), [-0.9, 0], 1e-6)).toBe(true)
        expect(near(f2.points[2].slice(0, 2), [0.9, 0], 1e-6)).toBe(true)
        // A single dot: nothing to stretch, it moves to the centre.
        expect(cubeFrameAt(g, 3, { scale: 'fit' }).points[1].slice(0, 2)).toEqual([0, 0])
        expect(cubeFrameAt(g, 3, { scale: 'fit' }).points).toHaveLength(3)
    })
    it('blanks and counts a point that falls outside the cube\'s field', () => {
        const doc = { entities: [line('c-1a', [[[0.9, 0, 1, 1, 1], [0.95, 0, 1, 1, 1]]], { rotation: aim(10) }), line('c-1b', [[[0, 0, 1, 1, 1]]], { rotation: aim(-10) })] }
        const g = lineGroupsOf(doc).get('c-1')
        const { points, outside } = cubeFrameAt(g, 1)
        expect(outside).toBe(2) // line a's points sit 26.6°+ from the cube's aim: beyond ±18.5°
        expect(points.filter((p) => p[2] > 0)).toHaveLength(1)
        expect(near(points.find((p) => p[2] > 0).slice(0, 2), [-10 / 18.5, 0], 2e-3)).toBe(true)
    })
})

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
        expect(groups.get('rig-laser-1').lines.map((l) => l.id)).toEqual(['rig-laser-1a', 'rig-laser-1b'])
        expect(groups.get('rig-laser-1').lines[0].frames).toMatchObject({ period: 10 })
        expect(lineGroupsOf({}).size).toBe(0)
        expect(lineGroupsOf({ entities: [line('x', []), line('y', [[[0, 0, 1, 1, 1]]], { period: 0 })] }).size).toBe(0)
    })
    it('picks the frame on now with the room\'s formula', () => {
        const frames = { period: 10, list: [[[0, 0, 0, 0, 0]], [[0, 0, 1, 1, 1]]] }
        expect(frameIndexAt(frames, 3)).toBe(0)
        expect(frameIndexAt(frames, 7)).toBe(1)
        expect(frameIndexAt(frames, 13)).toBe(0)
        expect(frameIndexAt(frames, -2)).toBe(1)
        expect(frameIndexAt(null, 3)).toBe(-1)
    })
    it('draws one blank point when nothing is lit', () => {
        const g = lineGroupsOf({ entities: [line('a-1a', [[[0, 0, 0, 0, 0]]])] }).get('a-1')
        expect(cubeFrameAt(g, 3)).toEqual({ points: [[0, 0, 0, 0, 0]], outside: 0 })
    })
    it('maps cubes and groups side by side in sorted order', () => {
        expect(defaultMap(['cube-2', 'cube-1'], ['rig-laser-2', 'rig-laser-1'])).toEqual({ 'cube-1': 'rig-laser-1', 'cube-2': 'rig-laser-2' })
        expect(defaultMap(['cube-1', 'cube-2', 'cube-3'], ['g'])).toEqual({ 'cube-1': 'g' })
    })
    it('lists the show\'s still dots per cube once each, as the engine\'s guard sees them', () => {
        const g = lineGroupsOf(DOC).get('rig-laser-1')
        // frame 0: line b's dot at +2°; frame 1: line a's stroke 0.1 wide (1.85°) is no dot. One still beam in all.
        const dots = stillBeamsOfGroup(g, stillBeams)
        expect(dots).toHaveLength(1)
        expect(dots[0]).toMatchObject({ within: 0.01 })
        expect(near([dots[0].x, dots[0].y], [X2, 0])).toBe(true)
        // The same dot in two frames is listed once.
        const twice = lineGroupsOf({ entities: [line('d-1a', [[[0.3, 0.3, 1, 0, 0]], [[0.3, 0.3, 0, 1, 0]], [[0, 0, 0, 0, 0]]])] }).get('d-1')
        expect(stillBeamsOfGroup(twice, stillBeams)).toEqual([{ x: 0.3, y: 0.3, within: 0.01 }])
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
        // t = 1000 s: frame 0 on both cubes (cube 1: line b lit at +2°; cube 2: its line at y 0.1).
        const sets = engine.calls.filter((c) => c[0] === 'set')
        expect(sets.map((c) => [c[1], c[3]])).toEqual([['cube-1', 'show:p'], ['cube-2', 'show:p']])
        expect(sets[0][2].map((p) => p.slice(2))).toEqual([[0, 0, 0], [0, 1, 0], [0, 0, 0]])
        expect(near(sets[0][2][1].slice(0, 2), [X2, 0])).toBe(true)
        expect(near(sets[1][2][1].slice(0, 2), [0, 0.1])).toBe(true)
        expect(player.state()).toMatchObject({ playing: true, project: 'p', out: 'show:p', cubes: [{ cube: 'cube-1', group: 'rig-laser-1', lines: 2, index: 0, held: null, outside: 0 }, { cube: 'cube-2', group: 'rig-laser-2', lines: 1, index: 0 }] })
        engine.calls.length = 0
        at(TICK_MS) // still frame 0: alive only
        expect(engine.calls).toEqual([['alive', 'cube-1', 'show:p'], ['alive', 'cube-2', 'show:p']])
        engine.calls.length = 0
        at(5000) // t = 1005.05 s: frame 1
        expect(engine.calls.map((c) => c.slice(0, 2))).toEqual([['set', 'cube-1'], ['set', 'cube-2']])
        expect(engine.calls[0][2].map((p) => p.slice(2))).toEqual([[0, 0, 0], [1, 1, 1], [1, 1, 1], [0, 0, 0]])
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
        expect(engine.calls.map((c) => c.slice(0, 2))).toEqual([['set', 'cube-1'], ['set', 'cube-2']])
        expect(engine.calls[0][2].map((p) => p.slice(2))).toEqual([[0, 0, 0], [1, 0, 0], [0, 0, 0]])
        expect(near(engine.calls[0][2][1].slice(0, 2), [0.9, 0.9], 1e-9)).toBe(true)
        expect(engine.calls[1][2]).toEqual([[0, 0, 0, 0, 0]])
        expect(player.state()).toMatchObject({ error: null, cubes: [{ lines: 1 }, { lines: 1 }] })
        player.stop()
    })
})
