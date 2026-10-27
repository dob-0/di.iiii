import { describe, expect, it } from 'vitest'
import { DEG, forwardOf, headingOf, headingQuat, perspective, quatToRows, rowsToQuat, toWorld, unprojectView } from './arMath.js'
import { addSamples, cellState, coverageSummary, createCoverage, viewSpread, STATE_GOOD, STATE_MISSED, STATE_THIN } from './coverage.js'
import { BLUR_LIMIT_PX, createWarningFilter, motionBlurPx, poseMotion, readWarnings } from './warnings.js'
import { arrowFor, nextSpot, spotWords, STANDOFF_METRES } from './nextSpot.js'
import { addFrame, createSidecar, intrinsicsFromProjection, projectPixels, sidecarReadiness } from './poseSidecar.js'
import { floorMapModel } from './floorMap.js'
import { boxRayDistance, playSession, sampleRoom, syntheticWalk, createSessionRecorder } from './recordedSession.js'
import { createScanBrain } from './scanBrain.js'

const level = (heading, position = [0, 1.5, 0]) => ({ position, orientation: headingQuat(heading) })

describe('arMath', () => {
    it('heading 0 looks down -z, +90° looks down +x (turning right)', () => {
        expect(headingOf(forwardOf(headingQuat(0)))).toBeCloseTo(0)
        const f = forwardOf(headingQuat(90 * DEG))
        expect(f[0]).toBeCloseTo(1)
        expect(headingOf(f)).toBeCloseTo(90 * DEG)
    })
    it('quaternion ⇄ rotation rows round-trips', () => {
        const q = headingQuat(37 * DEG)
        const back = rowsToQuat(quatToRows(q))
        back.forEach((v, i) => expect(v).toBeCloseTo(q[i]))
    })
})

describe('coverage', () => {
    it('a surface seen by no kept shot is missed', () => {
        const c = createCoverage()
        addSamples(c, [[0, 1, -3]], { cameraPosition: [0, 1.5, 0], kept: false })
        expect(coverageSummary(c)).toMatchObject({ missed: 1, thin: 0, good: 0, total: 1 })
    })
    it('three kept views from one spot stay thin; three spread ones are good', () => {
        const c = createCoverage()
        for (let k = 0; k < 3; k += 1) addSamples(c, [[0.1, 1.1, -3.1]], { cameraPosition: [0, 1.5, 0], kept: true })
        const cell = [...c.cells.values()][0]
        expect(cell.views.length).toBe(1)
        expect(cellState(cell)).toBe(STATE_THIN)
        addSamples(c, [[0.1, 1.1, -3.1]], { cameraPosition: [-1.5, 1.5, 0], kept: true })
        addSamples(c, [[0.1, 1.1, -3.1]], { cameraPosition: [1.5, 1.5, 0], kept: true })
        expect(viewSpread(cell.views)).toBeGreaterThan(15)
        expect(cellState(cell)).toBe(STATE_GOOD)
    })
    it('a kept shot from beyond 6 m adds no view', () => {
        const c = createCoverage()
        addSamples(c, [[0, 1, -10]], { cameraPosition: [0, 1.5, 0], kept: true })
        expect(cellState([...c.cells.values()][0])).toBe(STATE_MISSED)
    })
})

describe('warnings', () => {
    it('blur = t · f · (ω + v/d): 1/60 s, 900 px, 0.2 rad/s → 3 px, too fast', () => {
        expect(motionBlurPx({ angular: 0.2, linear: 0 }, 3)).toBeCloseTo(3)
        expect(readWarnings({ motion: { angular: 0.2, linear: 0 }, distance: 3 }).active).toEqual(['fast'])
        expect(readWarnings({ motion: { angular: 0.05, linear: 0.1 }, distance: 3 }).clear).toBe(true)
    })
    it('too dark and too close', () => {
        const r = readWarnings({ motion: { angular: 0, linear: 0 }, distance: 0.3, luma: 0.05 })
        expect(r.active).toEqual(['dark', 'close'])
    })
    it('motion from two timed poses', () => {
        const m = poseMotion({ time: 0, pose: level(0) }, { time: 500, pose: level(45 * DEG, [0.5, 1.5, 0]) })
        expect(m.angular).toBeCloseTo((45 * DEG) / 0.5)
        expect(m.linear).toBeCloseTo(1)
    })
    it('a raised warning is held 700 ms for the eye', () => {
        const f = createWarningFilter()
        expect(f({ active: ['fast'] }, 0)).toEqual(['fast'])
        expect(f({ active: [] }, 500)).toEqual(['fast'])
        expect(f({ active: [] }, 800)).toEqual([])
    })
})

describe('next spot', () => {
    it('stands 2 m back from the gap, on the room side, and aims at it', () => {
        const c = createCoverage()
        // a well-seen floor patch round the person, a missed patch on the north wall
        for (let x = -2; x <= 2; x += 0.5) {
            for (let z = -2; z <= 2; z += 0.5) {
                for (const cam of [[-1, 1.5, 1], [1, 1.5, 1], [0, 1.5, -1]]) addSamples(c, [[x, 0.05, z]], { cameraPosition: cam, kept: true })
            }
        }
        addSamples(c, [[0, 1.5, -3.9], [0.3, 1.5, -3.9], [0, 1.8, -3.9]], { kept: false })
        const s = nextSpot(c, { position: [0, 1.5, 1] })
        expect(s.target[2]).toBeLessThan(-3.5)
        expect(s.spot[2] - s.target[2]).toBeGreaterThan(STANDOFF_METRES * 0.5)
        expect(Math.abs(s.heading)).toBeLessThan(10 * DEG) // looking north, -z
        const arrow = arrowFor(level(Math.PI, [0, 1.5, 1]), s.target)
        expect(Math.abs(arrow.turn)).toBeGreaterThan(170)
        expect(spotWords(s, arrow)).toMatch(/Walk to the square/)
    })
    it('nothing missing → no spot', () => {
        expect(nextSpot(createCoverage(), { position: [0, 0, 0] })).toBeNull()
        expect(spotWords(null)).toMatch(/covered/)
    })
})

describe('pose sidecar', () => {
    it('intrinsics from the projection reproject a point to the same pixel as the projection itself', () => {
        const P = perspective(60 * DEG, 16 / 9, 0.05, 100, 0.02, -0.03)
        const intr = intrinsicsFromProjection(P, 1920, 1080)
        const p = unprojectView(P, 0.7, 0.2, 2.5) // u right, v down
        const [u, v] = projectPixels(intr, p)
        expect(u).toBeCloseTo(0.7 * 1920, 0)
        expect(v).toBeCloseTo(0.2 * 1080, 0)
        expect(intr.fx).toBeCloseTo(P[0] * 960, 2)
    })
    it('records frames with pose, intrinsics and metric scale', () => {
        const s = createSidecar({ spaceId: 'a', walk: 'walk-1' })
        const P = perspective(60 * DEG, 16 / 9)
        addFrame(s, { file: 'ar-1.jpg', time: 12.34, pose: level(0.3), projection: P, width: 1920, height: 1080, sharpness: 12 })
        expect(s.frames[0]).toMatchObject({ index: 0, file: 'ar-1.jpg', intrinsics: { model: 'PINHOLE', width: 1920 } })
        expect(s.scale).toMatchObject({ metresPerUnit: 1, source: 'webxr-tracking' })
        expect(s.cameraImage).toEqual({ width: 1920, height: 1080 })
        expect(sidecarReadiness(s)).toMatchObject({ withFiles: 1, ready: false })
    })
})

describe('floor map', () => {
    it('north (-z) is up and the person is drawn where they stand', () => {
        const c = createCoverage()
        addSamples(c, [[0, 0, -2], [0, 0, 2]])
        const m = floorMapModel({ coverage: c, path: [[0, 1.5, 0]], pose: level(0, [0, 1.5, 0]), width: 200, height: 200 })
        const north = m.cells.reduce((a, b) => (a.y < b.y ? a : b))
        expect(north.state).toBe(STATE_MISSED)
        expect(Math.abs(m.me.at[0] - 100)).toBeLessThan(6) // cell centres sit half a cell off the axes
        expect(Math.abs(m.me.at[1] - 100)).toBeLessThan(8)
    })
})

describe('recorded session', () => {
    it('box room ray distances and depth samples land on the walls', () => {
        const room = { width: 8, depth: 6, height: 3.2 }
        expect(boxRayDistance(room, [0, 1.5, 0], [0, 0, -1])).toBeCloseTo(3)
        const pose = level(0)
        const samples = sampleRoom(room, pose, perspective(60 * DEG, 16 / 9))
        expect(samples.length).toBe(192)
        for (const p of samples) {
            const onWall = Math.abs(Math.abs(p[0]) - 4) < 1e-6 || Math.abs(Math.abs(p[2]) - 3) < 1e-6 || Math.abs(p[1]) < 1e-6 || Math.abs(p[1] - 3.2) < 1e-6
            expect(onWall).toBe(true)
        }
        expect(toWorld(pose, [0, 0, -1])[2]).toBeCloseTo(-1)
    })
    it('plays every tick in order and records at 2 Hz', () => {
        const session = { ticks: [{ time: 0 }, { time: 100 }, { time: 600 }] }
        const seen = []
        const queue = []
        playSession(session, (t) => seen.push(t.time), { schedule: (fn) => queue.push(fn), cancel: () => {} })
        while (queue.length) queue.shift()()
        expect(seen).toEqual([0, 100, 600])
        const r = createSessionRecorder()
        session.ticks.forEach((t) => r.add({ ...t, samples: [[1.234, 0, 0]] }))
        expect(r.session().ticks.map((t) => t.time)).toEqual([0, 600])
    })
})

describe('the whole walk (synthetic, 120 s)', () => {
    const walk = syntheticWalk()
    const brain = createScanBrain()
    const kept = []
    let warnedFast = 0
    for (const tick of walk.ticks) {
        const out = brain.step(tick)
        if (out.keep) kept.push({ tick, blur: out.reading.blurPx })
        if (out.reading.active.includes('fast')) warnedFast += 1
    }
    // the comparison: one frame every 400 ms, no gate (what the camera mode does today)
    const naive = walk.ticks.filter((t, i) => i % 4 === 0)
    const naiveBrain = createScanBrain()
    let naiveBlurry = 0
    for (const tick of walk.ticks) {
        const out = naiveBrain.step(tick)
        if (naive.includes(tick) && out.reading.blurPx > BLUR_LIMIT_PX) naiveBlurry += 1
    }

    it('keeps no frame that would smear, none too close, none too dark', () => {
        expect(kept.length).toBeGreaterThan(30)
        expect(kept.every((k) => k.blur <= BLUR_LIMIT_PX)).toBe(true)
        expect(kept.some((k) => k.tick.time >= 18000 && k.tick.time < 20000)).toBe(false)
        expect(kept.some((k) => k.tick.time >= 46000 && k.tick.time < 49000)).toBe(false)
        expect(kept.every((k) => !(k.tick.centreDistance < 0.5))).toBe(true)
        expect(warnedFast).toBeGreaterThan(5)
        // the planted fast turn makes the un-gated camera keep smeared frames
        expect(naiveBlurry).toBeGreaterThan(0)
    })
    it('a lap of the room covers most of what it found, and says where the rest is', () => {
        const s = brain.summary()
        expect(s.total).toBeGreaterThan(200)
        expect(s.good + s.thin).toBeGreaterThan(s.missed)
        expect(brain.path.length).toBeGreaterThan(20)
        if (s.missed + s.thin > 0) expect(brain.spot).not.toBeNull()
    })
})
