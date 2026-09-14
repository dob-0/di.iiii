import { describe, expect, it } from 'vitest'
import {
    DEFAULT_ENTRY_VARIANT,
    ENTRY_GROUND,
    entryTone,
    isDestinationPainted,
    planEntry,
    prefersReducedMotion,
    resolveEntrySlowdown,
    resolveEntryVariant
} from './entryPlan.js'

const fixed = (value) => () => value

describe('which entry plays', () => {
    it('is a when nothing is asked for', () => {
        expect(DEFAULT_ENTRY_VARIANT).toBe('a')
        expect(resolveEntryVariant('')).toBe('a')
        expect(resolveEntryVariant('?tour=1')).toBe('a')
    })

    it('is the one named by ?entry, in either case', () => {
        expect(resolveEntryVariant('?entry=b')).toBe('b')
        expect(resolveEntryVariant('?entry=C')).toBe('c')
        expect(resolveEntryVariant('?room=1&entry=a')).toBe('a')
    })

    // A typo in a review link must still play something professional, not
    // nothing — and never a fourth, unreviewed move.
    it('falls back to a for anything it does not know', () => {
        expect(resolveEntryVariant('?entry=d')).toBe('a')
        expect(resolveEntryVariant('?entry=')).toBe('a')
        expect(resolveEntryVariant('?entry=crack')).toBe('a')
    })

    it('only slows down inside a sane range', () => {
        expect(resolveEntrySlowdown('?entryslow=8')).toBe(8)
        expect(resolveEntrySlowdown('?entryslow=0.2')).toBe(1)
        expect(resolveEntrySlowdown('?entryslow=500')).toBe(1)
        expect(resolveEntrySlowdown('')).toBe(1)
    })
})

describe('reduced motion', () => {
    it('reads the system preference', () => {
        expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true)
        expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false)
        expect(prefersReducedMotion(null)).toBe(false)
    })

    // Whatever variant is under review, a visitor who asked for less motion
    // gets a short plain fade: no glide, no drift, no settle, no expanding panel.
    it.each(['a', 'b', 'c'])('turns variant %s into a short plain fade', (variant) => {
        const plan = planEntry({ variant, reducedMotion: true, hasScene: true })
        expect(plan.kind).toBe('fade')
        expect(plan.glideMs).toBe(0)
        expect(plan.driftScale).toBe(1)
        expect(plan.settleFrom).toBe(1)
        expect(plan.revealMs).toBeLessThanOrEqual(300)
    })
})

describe('the three moves', () => {
    it('a glides the camera all the way in when there is a room to travel through', () => {
        const plan = planEntry({ variant: 'a', hasScene: true, random: fixed(0.5) })
        expect(plan.kind).toBe('glide')
        expect(plan.glideReach).toBe(1)
        expect(plan.glideMs).toBe(1150)
        expect(plan.coverMs).toBe(0)
        expect(plan.driftScale).toBeGreaterThan(1)
    })

    it('a pushes the page instead when the door is a card', () => {
        const plan = planEntry({ variant: 'a', hasScene: false, random: fixed(0.5) })
        expect(plan.glideMs).toBe(0)
        expect(plan.coverMs).toBeGreaterThan(0)
    })

    it('b leans only part of the way while the colour rises, then settles slowly', () => {
        const plan = planEntry({ variant: 'b', hasScene: true, random: fixed(0.5) })
        expect(plan.kind).toBe('dissolve')
        expect(plan.glideReach).toBeGreaterThan(0)
        expect(plan.glideReach).toBeLessThan(0.5)
        expect(plan.settleMs).toBeGreaterThan(plan.revealMs)
    })

    it('c expands without a camera move', () => {
        const plan = planEntry({ variant: 'c', hasScene: true, random: fixed(0.5) })
        expect(plan.kind).toBe('expand')
        expect(plan.glideMs).toBe(0)
        expect(plan.coverMs).toBeGreaterThan(0)
    })

    // Never the same play twice — but only a few percent apart, never a
    // different kind of move.
    it('varies timing subtly between visits', () => {
        const low = planEntry({ variant: 'a', hasScene: true, random: fixed(0) })
        const high = planEntry({ variant: 'a', hasScene: true, random: fixed(0.999) })
        expect(low.glideMs).not.toBe(high.glideMs)
        expect(low.kind).toBe(high.kind)
        expect(high.glideMs / low.glideMs).toBeLessThan(1.2)
    })

    it('stretches every authored duration by the review slowdown', () => {
        const normal = planEntry({ variant: 'b', hasScene: true, random: fixed(0.5) })
        const slow = planEntry({ variant: 'b', hasScene: true, random: fixed(0.5), slow: 10 })
        expect(slow.coverMs).toBe(normal.coverMs * 10)
    })
})

describe('entryTone', () => {
    it('mixes a door colour down into the ground', () => {
        expect(entryTone('#ffffff', 0)).toBe(ENTRY_GROUND)
        expect(entryTone('#ffffff', 1)).toBe('#ffffff')
        const red = entryTone('#ff2a2a', 0.3)
        expect(red).toMatch(/^#[0-9a-f]{6}$/)
        expect(parseInt(red.slice(1, 3), 16)).toBeLessThan(0x70)
    })

    it('answers the ground for a colour it cannot read', () => {
        expect(entryTone(null)).toBe(ENTRY_GROUND)
        expect(entryTone('tomato')).toBe(ENTRY_GROUND)
    })
})

describe('isDestinationPainted', () => {
    const make = () => {
        const doc = document.implementation.createHTMLDocument('t')
        return doc
    }

    // The page being left has canvases of its own. Counting the landing room's
    // canvas would lift the curtain over nothing.
    it('ignores surfaces that were there before the door was pressed', () => {
        const doc = make()
        const old = doc.createElement('canvas')
        doc.body.appendChild(old)
        expect(isDestinationPainted(doc, { before: new Set([old]) })).toBe(false)
        doc.body.appendChild(doc.createElement('canvas'))
        expect(isDestinationPainted(doc, { before: new Set([old]) })).toBe(true)
    })

    it('waits while the loading screen is up', () => {
        const doc = make()
        doc.body.appendChild(doc.createElement('iframe'))
        const loading = doc.createElement('div')
        loading.className = 'loading-screen'
        doc.body.appendChild(loading)
        expect(isDestinationPainted(doc)).toBe(false)
        loading.remove()
        expect(isDestinationPainted(doc)).toBe(true)
    })

    it('does not count the curtain holding the old frame', () => {
        const doc = make()
        const curtain = doc.createElement('div')
        curtain.appendChild(doc.createElement('canvas'))
        doc.body.appendChild(curtain)
        expect(isDestinationPainted(doc, { curtain })).toBe(false)
    })
})
