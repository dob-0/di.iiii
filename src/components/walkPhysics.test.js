import { describe, it, expect } from 'vitest'
import {
    createWalkSim, advanceWalkSim, stepWalk, createWalkBody, horizontalSpeed,
    teleportWalkSim, nextFlySpeedScale, bobOffset, smoothDamp, FLY_SPEED_SCALE_MAX,
} from './walkPhysics.js'
import {
    WALK_MAX_SPEED, WALK_SPRINT_FACTOR, EYE_HEIGHT, FLY_MAX_SPEED, FLY_MAX_ALT, BOB_AMPLITUDE,
} from './walkModeConfig.js'
import { confineToAreas } from './walkableAreas.js'

// Drive the simulator at a constant render frame rate for `seconds`, input
// chosen by time. Returns one sample per rendered frame.
function run({ fps, seconds, inputAt, sim = createWalkSim(0, EYE_HEIGHT, 0), env }) {
    const dt = 1 / fps
    const samples = []
    let t = 0
    const frames = Math.round(seconds * fps)
    for (let i = 0; i < frames; i++) {
        const pose = advanceWalkSim(sim, inputAt(t), dt, env)
        t += dt
        samples.push({ t, pose, speed: horizontalSpeed(sim.body), vy: sim.body.vy, y: sim.body.y })
    }
    return { sim, samples }
}

const firstTime = (samples, pred) => samples.find(pred)?.t ?? Infinity
const FPS = [30, 60, 144, 240]

describe('walkPhysics — walking (UE CharacterMovement model)', () => {
    it('clamps the COMBINED input: a diagonal is no faster than straight', () => {
        const straight = run({ fps: 60, seconds: 2, inputAt: () => ({ forward: 1 }) })
        const diag = run({ fps: 60, seconds: 2, inputAt: () => ({ forward: 1, strafe: 1 }) })
        expect(horizontalSpeed(straight.sim.body)).toBeCloseTo(WALK_MAX_SPEED, 4)
        expect(horizontalSpeed(diag.sim.body)).toBeCloseTo(WALK_MAX_SPEED, 4)
    })

    it('starts over about one step: top speed in 0.4-0.5 s, no instant jump', () => {
        const { samples } = run({ fps: 240, seconds: 1, inputAt: () => ({ forward: 1 }) })
        const tMax = firstTime(samples, (s) => s.speed >= WALK_MAX_SPEED - 1e-6)
        expect(tMax).toBeGreaterThan(0.4)
        expect(tMax).toBeLessThan(0.5)
        // first rendered frame (4 ms) is a small fraction of top speed
        expect(samples[0].speed).toBeLessThan(0.1 * WALK_MAX_SPEED)
    })

    it('stops in about one step: ~0.4 s, under 0.6 m, with a soft tail', () => {
        const { samples } = run({ fps: 240, seconds: 2, inputAt: (t) => (t < 1 ? { forward: 1 } : {}) })
        const i0 = samples.findIndex((s) => s.t >= 1)
        const atRelease = samples[i0 - 1]
        const stop = samples.find((s) => s.t > 1 && s.speed === 0)
        const stopTime = stop.t - atRelease.t
        expect(stopTime).toBeGreaterThan(0.3)
        expect(stopTime).toBeLessThan(0.5)
        expect(stop.pose.z - atRelease.pose.z).toBeLessThan(0.6)
        // soft tail: deceleration in the first 50 ms is larger than in the last 50 ms
        const at = (t) => samples.find((s) => s.t >= t).speed
        const early = at(atRelease.t) - at(atRelease.t + 0.05)
        const late = at(stop.t - 0.1) - at(stop.t - 0.05)
        expect(early).toBeGreaterThan(late)
    })

    it('keeps velocity in WORLD space: a 180-degree flick does not swing momentum', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        run({ sim, fps: 60, seconds: 1, inputAt: () => ({ forward: 1, yaw: 0 }) })
        const vz = sim.body.vz
        advanceWalkSim(sim, { yaw: Math.PI }, 1 / 60) // view flicked, keys released
        expect(sim.body.vz).toBeGreaterThan(0.7 * vz)
        expect(Math.abs(sim.body.vx)).toBeLessThan(1e-9)
    })

    it('turns without ice: a 90-degree change of direction settles in under 0.4 s', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        run({ sim, fps: 60, seconds: 1, inputAt: () => ({ forward: 1 }) })
        let t = 0
        while (Math.abs(sim.body.vz) >= 0.05 * WALK_MAX_SPEED && t < 2) {
            advanceWalkSim(sim, { strafe: -1 }, 1 / 240) // now wishing +x
            t += 1 / 240
        }
        expect(t).toBeLessThan(0.4)
    })

    it('Shift sprints at 1.5x, and releasing it eases back down without a snap', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        run({ sim, fps: 60, seconds: 2, inputAt: () => ({ forward: 1, sprint: true }) })
        expect(horizontalSpeed(sim.body)).toBeCloseTo(WALK_MAX_SPEED * WALK_SPRINT_FACTOR, 3)
        const { samples } = run({ sim, fps: 240, seconds: 1, inputAt: () => ({ forward: 1 }) })
        expect(samples[0].speed).toBeGreaterThan(WALK_MAX_SPEED * 1.4)
        for (let i = 1; i < samples.length; i++) {
            // bounded braking (<= 1 tick of ~35 m/s²), never an instant clamp of 1.8 m/s
            expect(samples[i - 1].speed - samples[i].speed).toBeLessThan(0.3)
        }
        expect(samples.at(-1).speed).toBeCloseTo(WALK_MAX_SPEED, 3)
    })

    it('analog joystick: half stick walks at half speed; easing the stick brakes, never snaps', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        run({ sim, fps: 60, seconds: 2, inputAt: () => ({ forward: 1 }) })
        const { samples } = run({ sim, fps: 240, seconds: 2, inputAt: () => ({ forward: 0.5 }) })
        for (let i = 1; i < samples.length; i++) expect(samples[i - 1].speed - samples[i].speed).toBeLessThan(0.3)
        expect(samples.at(-1).speed).toBeCloseTo(WALK_MAX_SPEED * 0.5, 3)
    })
})

describe('walkPhysics — frame-rate independence (fixed tick + interpolation)', () => {
    it('same keys, same wall time => same place at 30/60/144/240 fps', () => {
        const input = (t) => (t < 0.6 ? { forward: 1, strafe: t > 0.2 ? 1 : 0 } : {})
        const ends = FPS.map((fps) => run({ fps, seconds: 1.5, inputAt: input }).sim.body)
        for (const b of ends) {
            // Input is sampled per render frame, so a key edge can land up to
            // one 30 fps frame (33 ms) late — at most ~12 cm of travel.
            expect(Math.abs(b.x - ends[3].x)).toBeLessThan(0.12)
            expect(Math.abs(b.z - ends[3].z)).toBeLessThan(0.12)
        }
    })

    it('with frame-aligned input edges the trajectories agree to the millimetre', () => {
        // edges at multiples of 1/30 s land on a frame boundary at every rate
        const input = (t) => (t < 0.5 - 1e-9 ? { forward: 1 } : {})
        const ends = FPS.map((fps) => run({ fps, seconds: 1.5, inputAt: input }).sim.body)
        for (const b of ends) expect(Math.abs(b.z - ends[0].z)).toBeLessThan(0.01)
    })

    it('interpolated pose is monotonic at 144/240 fps (no judder)', () => {
        for (const fps of [144, 240]) {
            const { samples } = run({ fps, seconds: 1, inputAt: () => ({ forward: 1 }) })
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i].pose.z).toBeGreaterThanOrEqual(samples[i - 1].pose.z - 1e-9)
            }
        }
    })

    it('keeps real-time pace at 5 fps (the iGPU in a heavy hall)', () => {
        const slow = run({ fps: 5, seconds: 3, inputAt: () => ({ forward: 1 }) }).sim.body.z
        const fast = run({ fps: 240, seconds: 3, inputAt: () => ({ forward: 1 }) }).sim.body.z
        expect(Math.abs(slow - fast)).toBeLessThan(0.05)
    })

    it('a 2-second stall is clamped, not replayed', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        advanceWalkSim(sim, { forward: 1 }, 2)
        expect(sim.ticks).toBeLessThanOrEqual(32) // 0.25 s at 128 Hz
    })
})

describe('walkPhysics — fly (free camera, drone rule)', () => {
    it('vertical and horizontal top speed are the same', () => {
        const up = run({ fps: 60, seconds: 2, inputAt: () => ({ fly: true, vert: 1 }) })
        const fwd = run({ fps: 60, seconds: 2, inputAt: () => ({ fly: true, forward: 1 }) })
        expect(up.sim.body.vy).toBeCloseTo(FLY_MAX_SPEED, 3)
        expect(horizontalSpeed(fwd.sim.body)).toBeCloseTo(FLY_MAX_SPEED, 3)
    })

    it('forward never changes altitude, whatever the pitch (drone, not jet)', () => {
        const { sim } = run({ fps: 60, seconds: 1, inputAt: () => ({ fly: true, forward: 1, pitch: -1.4 }) })
        expect(sim.body.y).toBe(EYE_HEIGHT)
    })

    it('clamps altitude to the fly ceiling', () => {
        const sim = createWalkSim(0, FLY_MAX_ALT - 0.1, 0)
        run({ sim, fps: 60, seconds: 1, inputAt: () => ({ fly: true, vert: 1 }) })
        expect(sim.body.y).toBe(FLY_MAX_ALT)
        expect(sim.body.vy).toBe(0)
    })

    it('fly speed scale multiplies top speed, keeps the stop TIME', () => {
        const stopTime = (scale) => {
            const { samples } = run({ fps: 240, seconds: 3, inputAt: (t) => (t < 2 ? { fly: true, forward: 1, flySpeedScale: scale } : { fly: true, flySpeedScale: scale }) })
            expect(samples.find((s) => s.t >= 1.99).speed).toBeCloseTo(FLY_MAX_SPEED * scale, 2)
            return samples.find((s) => s.t > 2 && s.speed === 0).t - 2
        }
        expect(Math.abs(stopTime(1) - stopTime(3))).toBeLessThan(0.05)
        expect(nextFlySpeedScale(1, 1)).toBeCloseTo(1.25)
        expect(nextFlySpeedScale(1, 100)).toBe(FLY_SPEED_SCALE_MAX)
    })

    it('leaving fly high up glides down to eye height without overshoot', () => {
        const sim = createWalkSim(0, 20, 0)
        const { samples } = run({ sim, fps: 60, seconds: 5, inputAt: () => ({}) })
        const landed = firstTime(samples, (s) => Math.abs(s.y - EYE_HEIGHT) < 0.005)
        expect(landed).toBeGreaterThan(1.5) // 18.4 m at <= 8 m/s
        expect(landed).toBeLessThan(3.5)
        for (const s of samples) expect(s.y).toBeGreaterThanOrEqual(EYE_HEIGHT - 1e-6)
    })

    it('rises back from under the floor too', () => {
        const sim = createWalkSim(0, -2, 0)
        run({ sim, fps: 60, seconds: 3, inputAt: () => ({}) })
        expect(sim.body.y).toBeCloseTo(EYE_HEIGHT, 3)
    })
})

describe('walkPhysics — walkable areas', () => {
    const areas = [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }]
    const env = { confine: (x0, z0, x1, z1) => confineToAreas(areas, x0, z0, x1, z1) }

    it('never leaves the areas and slides along a wall at an angle', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        const { samples } = run({ sim, env, fps: 144, seconds: 2, inputAt: () => ({ forward: 1, strafe: -1 }) })
        for (const s of samples) {
            expect(Math.abs(s.pose.x)).toBeLessThanOrEqual(2 + 1e-9)
            expect(Math.abs(s.pose.z)).toBeLessThanOrEqual(2 + 1e-9)
        }
        expect(sim.body.z).toBeCloseTo(2, 1)
        expect(sim.body.vz).toBe(0) // blocked axis clipped
    })

    it('teleport resets interpolation and velocity', () => {
        const sim = createWalkSim(0, EYE_HEIGHT, 0)
        run({ sim, fps: 60, seconds: 1, inputAt: () => ({ forward: 1 }) })
        teleportWalkSim(sim, 10, EYE_HEIGHT, 10)
        const pose = advanceWalkSim(sim, {}, 0.001)
        expect(pose.x).toBe(10)
        expect(horizontalSpeed(sim.body)).toBe(0)
    })
})

describe('walkPhysics — small parts', () => {
    it('head bob is zero unless the setting turns it on', () => {
        expect(bobOffset(undefined, Math.PI / 2, 1, BOB_AMPLITUDE)).toBe(0)
        expect(bobOffset(false, Math.PI / 2, 1, BOB_AMPLITUDE)).toBe(0)
        expect(bobOffset(true, Math.PI / 2, 1, BOB_AMPLITUDE)).toBeCloseTo(BOB_AMPLITUDE)
        expect(bobOffset(0.5, Math.PI / 2, 1, BOB_AMPLITUDE)).toBeCloseTo(BOB_AMPLITUDE / 2)
    })

    it('smoothDamp reaches the target without overshoot', () => {
        let x = 10, v = 0
        for (let i = 0; i < 600; i++) { [x, v] = smoothDamp(x, 0, v, 0.3, 100, 1 / 120); expect(x).toBeGreaterThanOrEqual(0) }
        expect(x).toBeCloseTo(0, 4)
    })

    it('single tick API is usable directly', () => {
        const b = createWalkBody()
        stepWalk(b, { forward: 1 }, 1 / 128)
        expect(b.vz).toBeGreaterThan(0)
    })
})
