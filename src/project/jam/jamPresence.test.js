import { describe, expect, it } from 'vitest'
import {
    JAM_PRESENCE_HEARTBEAT_MS,
    buildJamCursorPayload,
    countPeopleHere,
    describePeopleHere,
    hasMovedEnough,
    readStandingVisitors,
    sameStandingVisitors,
    shouldEmitPose
} from './jamPresence.js'

describe('the payload a jam walker emits', () => {
    // The load-bearing one. `standing` is a SECOND field beside the existing
    // 2D cursor, never a replacement for it: Studio's EditorOverlays and the
    // node editor's RawViewport both read `cursor.x` / `cursor.y` with an
    // `|| 0` fallback, so a payload that dropped them would not error — it
    // would silently park every jam visitor in the top-left corner of somebody
    // else's screen, which is exactly the kind of break nobody notices.
    it('keeps the 2D cursor fields the existing readers depend on', () => {
        const payload = buildJamCursorPayload({ x: 4, z: -3, altY: 1.6, yaw: 1 })
        expect(payload).toHaveProperty('x')
        expect(payload).toHaveProperty('y')
        expect(Number.isFinite(payload.x)).toBe(true)
        expect(Number.isFinite(payload.y)).toBe(true)
        expect(payload.x).toBeGreaterThanOrEqual(0)
        expect(payload.x).toBeLessThanOrEqual(1)
        expect(payload.y).toBeGreaterThanOrEqual(0)
        expect(payload.y).toBeLessThanOrEqual(1)
    })

    it('adds where the person is standing, as its own field', () => {
        const payload = buildJamCursorPayload({ x: 4.004, z: -3.006, altY: 1.6, yaw: 1.2345 })
        // [x, y, z] in world order, rounded — presence is chatter, not a document.
        expect(payload.standing.position).toEqual([4, 1.6, -3.01])
        expect(payload.standing.heading).toBeCloseTo(1.23, 6)
    })

    it('emits a usable payload even when the pose has not settled yet', () => {
        const payload = buildJamCursorPayload({})
        expect(Number.isFinite(payload.x)).toBe(true)
        expect(payload.standing).toBeUndefined()
    })
})

describe('when to re-send a pose', () => {
    it('sends the first one', () => {
        expect(hasMovedEnough(null, { x: 0, z: 0, yaw: 0 })).toBe(true)
    })

    it('stays quiet while nothing changes', () => {
        const pose = { x: 1, z: 1, yaw: 0.5 }
        expect(hasMovedEnough(pose, { x: 1.01, z: 1.01, yaw: 0.5 })).toBe(false)
    })

    it('speaks up when the person walks', () => {
        expect(hasMovedEnough({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 0.4, yaw: 0 })).toBe(true)
    })

    it('speaks up when the person turns', () => {
        expect(hasMovedEnough({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0.3 })).toBe(true)
    })

    it('does not mistake a spin past a full turn for a huge turn', () => {
        const before = { x: 0, z: 0, yaw: 0.01 }
        const after = { x: 0, z: 0, yaw: Math.PI * 2 }
        expect(hasMovedEnough(before, after)).toBe(false)
    })

    // Somebody who stops to look at something is exactly the person whose
    // marker must not vanish. Presence drops a cursor after 3s of silence.
    it('sends a heartbeat for a person standing perfectly still', () => {
        const pose = { x: 1, z: 1, yaw: 0.5 }
        expect(shouldEmitPose(pose, pose, 0)).toBe(false)
        expect(shouldEmitPose(pose, pose, JAM_PRESENCE_HEARTBEAT_MS)).toBe(true)
    })

    it('keeps the heartbeat comfortably inside the 3s staleness window', () => {
        expect(JAM_PRESENCE_HEARTBEAT_MS).toBeLessThan(3000)
    })
})

describe('reading everyone else out of the presence map', () => {
    const cursors = {
        'socket-a': { userId: 'u-a', userName: 'Ani', cursor: { x: 0.5, y: 0.5, standing: { position: [1, 1.6, 2], heading: 0.4 } } },
        'socket-b': { userId: 'u-b', userName: 'Bo', cursor: { x: 0.2, y: 0.3 } },
        'socket-me': { userId: 'u-me', userName: 'Me', cursor: { x: 0.5, y: 0.5, standing: { position: [9, 1.6, 9], heading: 0 } } }
    }

    it('returns the people who are standing somewhere', () => {
        const visitors = readStandingVisitors(cursors, { selfUserId: 'u-me' })
        expect(visitors).toHaveLength(1)
        expect(visitors[0]).toMatchObject({ key: 'socket-a', label: 'Ani', heading: 0.4 })
        expect(visitors[0].position).toEqual([1, 1.6, 2])
    })

    it('skips a laptop in Studio rather than dropping it at the origin', () => {
        const visitors = readStandingVisitors(cursors, { selfUserId: 'u-me' })
        expect(visitors.some((visitor) => visitor.key === 'socket-b')).toBe(false)
    })

    it('never marks your own feet', () => {
        const visitors = readStandingVisitors(cursors, { selfUserId: 'u-me' })
        expect(visitors.some((visitor) => visitor.key === 'socket-me')).toBe(false)
    })

    it('ignores a malformed position instead of drawing a marker at NaN', () => {
        const visitors = readStandingVisitors({
            bad: { userId: 'x', cursor: { standing: { position: [1, 'two', 3] } } },
            short: { userId: 'y', cursor: { standing: { position: [1, 2] } } }
        })
        expect(visitors).toEqual([])
    })

    it('copes with no cursors at all', () => {
        expect(readStandingVisitors()).toEqual([])
        expect(readStandingVisitors(null, {})).toEqual([])
    })
})

describe('throwing away a redraw that would change nothing', () => {
    const at = (key, position, heading = 0, label = 'Ani') => ({ key, position, heading, label })

    it('is true for the identical picture', () => {
        const a = [at('s1', [1, 1.6, 2])]
        const b = [at('s1', [1, 1.6, 2])]
        expect(sameStandingVisitors(a, b)).toBe(true)
        expect(sameStandingVisitors(a, a)).toBe(true)
        expect(sameStandingVisitors([], [])).toBe(true)
    })

    it('notices somebody arriving or leaving', () => {
        expect(sameStandingVisitors([], [at('s1', [0, 1.6, 0])])).toBe(false)
        expect(sameStandingVisitors([at('s1', [0, 1.6, 0])], [])).toBe(false)
    })

    it('notices somebody moving, turning, or being renamed', () => {
        const before = [at('s1', [1, 1.6, 2], 0.5, 'Ani')]
        expect(sameStandingVisitors(before, [at('s1', [1, 1.6, 2.5], 0.5, 'Ani')])).toBe(false)
        expect(sameStandingVisitors(before, [at('s1', [1, 1.6, 2], 0.9, 'Ani')])).toBe(false)
        expect(sameStandingVisitors(before, [at('s1', [1, 1.6, 2], 0.5, 'Bo')])).toBe(false)
        expect(sameStandingVisitors(before, [at('s2', [1, 1.6, 2], 0.5, 'Ani')])).toBe(false)
    })
})

describe('the count at the top', () => {
    it('counts you even when the socket list is empty', () => {
        expect(countPeopleHere([], { selfUserId: 'me' })).toBe(1)
        expect(countPeopleHere([])).toBe(1)
    })

    it('counts one person with two tabs open as one person', () => {
        const users = [
            { userId: 'a', socketId: 's1' },
            { userId: 'a', socketId: 's2' },
            { userId: 'b', socketId: 's3' }
        ]
        expect(countPeopleHere(users, { selfUserId: 'a' })).toBe(2)
    })

    it('says it in words a person reads', () => {
        expect(describePeopleHere(1)).toBe('Just you here')
        expect(describePeopleHere(7)).toBe('7 people here')
    })
})
