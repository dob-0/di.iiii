import { describe, expect, it } from 'vitest'
import { INVITE, chevronPoints, inviteFrame } from './portalInvite.js'

describe('inviteFrame', () => {
    it('ripples are staggered by half a period, each grows and fades', () => {
        const f = inviteFrame(0)
        expect(f.ripples).toHaveLength(2)
        expect(f.ripples[0]).toEqual({ scale: 1, opacity: INVITE.rippleOpacity })
        expect(f.ripples[1].scale).toBeCloseTo(1 + INVITE.rippleGrow / 2)
        expect(f.ripples[1].opacity).toBeCloseTo(INVITE.rippleOpacity / 2)
    })
    it('the arrow slides in from far to near the ring, and is invisible at the jump', () => {
        expect(inviteFrame(0).arrow).toEqual({ distance: INVITE.arrowFrom, opacity: 0 })
        const late = inviteFrame(INVITE.period * 0.7).arrow
        expect(late.distance).toBeLessThan(INVITE.arrowFrom)
        expect(late.distance).toBeGreaterThanOrEqual(INVITE.arrowTo)
        expect(late.opacity).toBe(INVITE.arrowOpacity)
        expect(inviteFrame(INVITE.period * 0.999).arrow.opacity).toBeLessThan(0.01)
    })
    it('the same at any time with reduced motion', () => {
        expect(inviteFrame(0, { still: true })).toEqual(inviteFrame(7.3, { still: true }))
    })
    it('a negative clock still lands inside one period', () => {
        expect(inviteFrame(-1).ripples[0].opacity).toBeGreaterThan(0)
    })
})

describe('chevronPoints', () => {
    it('points toward +x', () => {
        const xs = chevronPoints().map(([x]) => x)
        expect(Math.max(...xs)).toBeGreaterThan(0)
        expect(chevronPoints()[1]).toEqual([0, 0])
    })
})
