import { describe, expect, it, vi } from 'vitest'
import { RIG_FLOOR, rigFloorPosition, rigPlanPosition } from './rigFloor.js'
import { positionMoves, sendPositionsToDesk, worldPosition } from './sendPositions.js'

const lamp = (id, position, fixture, parentId = null) => ({
    id,
    type: 'pointLight',
    parentId,
    components: { transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, light: {}, ...(fixture ? { fixture: { index: fixture } } : {}) }
})

const FIXTURES = [
    { id: 'fx_a', index: 1, name: 'Back left', x: 0.2, y: 0.3, colour: { r: 0, g: 0, b: 0 }, level: 0 },
    { id: 'fx_b', index: 2, name: 'Wash', x: 0.8, y: 0.6, colour: { r: 0, g: 0, b: 0 }, level: 0 },
    { id: 'fx_b2', index: 2, name: 'Wash twin', x: 0.5, y: 0.5, colour: { r: 0, g: 0, b: 0 }, level: 0 }
]

const okResponse = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })

describe('the floor mapping reads both ways', () => {
    it('plan → world → plan is the identity, corners and centre alike', () => {
        for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.25], [-0.3, 1.4]]) {
            const back = rigPlanPosition(rigFloorPosition({ x, y }))
            expect(back.x).toBeCloseTo(x, 10)
            expect(back.y).toBeCloseTo(y, 10)
        }
    })

    it('a lamp at the world origin is the middle of the plan; height is dropped', () => {
        expect(rigPlanPosition([0, 4, 0])).toEqual({ x: 0.5, y: 0.5 })
        expect(rigPlanPosition([RIG_FLOOR.minX, 0, RIG_FLOOR.maxZ])).toEqual({ x: 0, y: 1 })
    })
})

describe('positionMoves — where each joined lamp stands, as the desk stores it', () => {
    it('one move per joined lamp, by the fixture id the index resolves to', () => {
        const entities = [lamp('l1', [-5, 3, -5], 1), lamp('l2', [0, 3, 0]), lamp('l3', [5, 2, 5], 9)]
        expect(positionMoves(entities, FIXTURES)).toEqual([{ id: 'fx_a', x: 0, y: 0 }])
    })

    it('two fixtures sharing an index both move — the desk does not enforce unique numbers', () => {
        const moves = positionMoves([lamp('l1', [0, 3, 0], 2)], FIXTURES)
        expect(moves).toEqual([{ id: 'fx_b', x: 0.5, y: 0.5 }, { id: 'fx_b2', x: 0.5, y: 0.5 }])
    })

    it('a lamp inside a group stands where the group offsets put it', () => {
        const group = { id: 'g', type: 'group', components: { transform: { position: [2.5, 0, -2.5] } } }
        const child = lamp('l1', [0, 3, 0], 1, 'g')
        expect(worldPosition(child, new Map([['g', group], ['l1', child]]))).toEqual([2.5, 3, -2.5])
        expect(positionMoves([group, child], FIXTURES)).toEqual([{ id: 'fx_a', x: 0.75, y: 0.25 }])
    })
})

describe('sendPositionsToDesk — one request, one sentence', () => {
    it('says why when there is no desk, and touches nothing', async () => {
        const fetchImpl = vi.fn()
        const result = await sendPositionsToDesk({ entities: [lamp('l1', [0, 0, 0], 1)], fixtures: [], present: false, fetchImpl })
        expect(result).toEqual({ ok: false, moved: 0, message: 'no desk on this machine' })
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('says so when no lamp is joined yet, and when the numbers match nothing patched', async () => {
        const fetchImpl = vi.fn()
        expect((await sendPositionsToDesk({ entities: [lamp('l1', [0, 0, 0])], fixtures: FIXTURES, present: true, fetchImpl })).message)
            .toBe('no lamp has a fixture number yet')
        expect((await sendPositionsToDesk({ entities: [lamp('l1', [0, 0, 0], 7)], fixtures: FIXTURES, present: true, fetchImpl })).message)
            .toBe('no patched fixture has those numbers')
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('POSTs the desk\'s own move shape and counts the lamps it moved', async () => {
        const fetchImpl = vi.fn(async () => okResponse())
        const entities = [lamp('l1', [-5, 3, -5], 1), lamp('l2', [0, 3, 0], 2), lamp('l3', [1, 1, 1])]
        const result = await sendPositionsToDesk({ entities, fixtures: FIXTURES, present: true, fetchImpl })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        const [url, init] = fetchImpl.mock.calls[0]
        expect(String(url)).toMatch(/\/light\/api\/fixtures\/move$/)
        expect(init.method).toBe('POST')
        expect(init.headers['content-type']).toBe('application/json')
        expect(JSON.parse(init.body)).toEqual({
            moves: [{ id: 'fx_a', x: 0, y: 0 }, { id: 'fx_b', x: 0.5, y: 0.5 }, { id: 'fx_b2', x: 0.5, y: 0.5 }]
        })
        expect(result).toEqual({ ok: true, moved: 3, message: '3 lamps moved' })
    })

    it('one lamp is singular', async () => {
        const fetchImpl = vi.fn(async () => okResponse())
        const result = await sendPositionsToDesk({ entities: [lamp('l1', [0, 0, 0], 1)], fixtures: FIXTURES, present: true, fetchImpl })
        expect(result.message).toBe('1 lamp moved')
    })

    it('a refusal and a dead socket are both a sentence, never a throw', async () => {
        const refused = await sendPositionsToDesk({
            entities: [lamp('l1', [0, 0, 0], 1)], fixtures: FIXTURES, present: true,
            fetchImpl: vi.fn(async () => ({ ok: false, status: 403 }))
        })
        expect(refused).toEqual({ ok: false, moved: 0, message: 'the desk did not take it (403)' })
        const dead = await sendPositionsToDesk({
            entities: [lamp('l1', [0, 0, 0], 1)], fixtures: FIXTURES, present: true,
            fetchImpl: vi.fn(async () => { throw new TypeError('Failed to fetch') })
        })
        expect(dead).toEqual({ ok: false, moved: 0, message: 'the desk did not answer' })
    })
})
