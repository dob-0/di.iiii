import { describe, expect, it } from 'vitest'
import { flagsToForgetAfterLift, planBlackoutPress } from './blackoutPlan.js'

const base = { hasDeck: true, deckMaster: 1, lightOwn: true, laserUp: false, laserSetHere: false }

describe('planBlackoutPress', () => {
    it('darkens deck and reachable desks when not blacked out', () => {
        const plan = planBlackoutPress({ ...base, blackedOut: false, restore: null, pending: {}, laserUp: true })
        expect(plan.deck).toEqual({ level: 0, keep: 1 })
        expect(plan.sends).toEqual([['LIGHT', 'on'], ['LASER', 'on']])
    })
    it('desk failed on "on": the next press restores the picture and drops the pending target', () => {
        // press 1: deck is 0 with a kept level, LIGHT on-send failed
        const plan = planBlackoutPress({ ...base, deckMaster: 0, blackedOut: true, restore: 0.8, pending: { LIGHT: 'on' } })
        expect(plan.deck).toEqual({ level: 0.8, keep: null })
        expect(plan.sends).toEqual([])
    })
    it('lift failed: picture restored, then only the "off" is retried', () => {
        const first = planBlackoutPress({ ...base, deckMaster: 0, blackedOut: true, restore: 0.5, pending: {} })
        expect(first.deck).toEqual({ level: 0.5, keep: null })
        expect(first.sends).toEqual([['LIGHT', 'off']])
        // the lift failed: LIGHT pending 'off', deck is back (restore null)
        const next = planBlackoutPress({ ...base, blackedOut: true, restore: null, pending: { LIGHT: 'off' } })
        expect(next.deck).toBeNull()
        expect(next.sends).toEqual([['LIGHT', 'off']])
    })
    it('lifting the laser only happens when this page set it, and never arms', () => {
        const none = planBlackoutPress({ ...base, lightOwn: false, laserUp: true, blackedOut: true, restore: 1, pending: {} })
        expect(none.sends).toEqual([])
        const set = planBlackoutPress({ ...base, lightOwn: false, laserUp: true, laserSetHere: true, blackedOut: true, restore: 1, pending: {} })
        expect(set.sends).toEqual([['LASER', 'off']])
    })
})

describe('flagsToForgetAfterLift', () => {
    it('a lift that cannot reach the light desk forgets the light flag, so the next press darkens again', () => {
        const plan = planBlackoutPress({ blackedOut: true, restore: null, hasDeck: true, deckMaster: 1, pending: {}, lightOwn: false, laserUp: false, laserSetHere: false })
        expect(plan.sends).toEqual([])
        expect(flagsToForgetAfterLift(true, plan.sends.map(([n]) => n))).toEqual({ light: true, laser: true })
    })
    it('keeps the flag of a desk the lift was sent to, and forgets nothing on a blackout press', () => {
        expect(flagsToForgetAfterLift(true, ['LASER'])).toEqual({ light: true, laser: false })
        expect(flagsToForgetAfterLift(false, [])).toEqual({ light: false, laser: false })
    })
})

describe('laser set here, then its desk drops away', () => {
    const base = { blackedOut: true, restore: null, hasDeck: true, deckMaster: 1, lightOwn: false }
    it('the first lift is still sent (and kept to retry when it fails); the desk back, the next press lifts', () => {
        const first = planBlackoutPress({ ...base, pending: {}, laserUp: false, laserSetHere: true })
        expect(first.sends).toEqual([['LASER', 'off']])
        expect(flagsToForgetAfterLift(true, ['LASER']).laser).toBe(false)
        expect(planBlackoutPress({ ...base, pending: { LASER: 'off' }, laserUp: true, laserSetHere: true }).sends).toEqual([['LASER', 'off']])
    })
    it('a second press with the desk still gone lets go (the Laser page lifts it), so the button never goes dead', () => {
        const again = planBlackoutPress({ ...base, pending: { LASER: 'off' }, laserUp: false, laserSetHere: true })
        expect(again.sends).toEqual([])
        expect(flagsToForgetAfterLift(true, []).laser).toBe(true)
    })
})
