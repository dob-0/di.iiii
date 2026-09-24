import { describe, expect, it } from 'vitest'
import * as plan from './entryPlan.js'

const {
    ENTRY_GROUND,
    entryTone,
    isDestinationPainted,
    planEntry,
    prefersReducedMotion,
    resolveEntrySlowdown
} = plan

const fixed = (value) => () => value

describe('which entry plays', () => {
    // Three candidates were reviewed and found "the same" (2026-09-15); the
    // glide is the one move. No address can ask for another.
    it('is always the glide, whatever the address says', () => {
        expect(plan.ENTRY_VARIANTS).toBeUndefined()
        expect(plan.resolveEntryVariant).toBeUndefined()
        expect(planEntry({ variant: 'b', hasScene: true }).kind).toBe('glide')
        expect(planEntry({ variant: 'c', hasScene: false }).kind).toBe('glide')
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

    // A visitor who asked for less motion gets a short plain fade: no glide,
    // no drift, no settle, no push — from a room or from a page.
    it.each([true, false])('turns the move into a short plain fade (room: %s)', (hasScene) => {
        const p = planEntry({ reducedMotion: true, hasScene })
        expect(p.kind).toBe('fade')
        expect(p.glideMs).toBe(0)
        expect(p.leadMs).toBe(0)
        expect(p.driftScale).toBe(1)
        expect(p.settleFrom).toBe(1)
        expect(p.revealMs).toBeLessThanOrEqual(300)
    })
})

describe('the glide', () => {
    it('glides the camera all the way in when there is a room to travel through', () => {
        const p = planEntry({ hasScene: true, random: fixed(0.5) })
        expect(p.kind).toBe('glide')
        expect(p.glideReach).toBe(1)
        expect(p.glideMs).toBe(1150)
        expect(p.coverMs).toBe(0)
        expect(p.leadMs).toBe(0)
        expect(p.driftScale).toBeGreaterThan(1)
    })

    // A front-page button: the page is held and pushed in, and the
    // destination may not come up before the push has read as a move.
    it('pushes the page in, for long enough to read as a move, when the door has no room behind it', () => {
        const p = planEntry({ hasScene: false, random: fixed(0.5) })
        expect(p.glideMs).toBe(0)
        expect(p.coverMs).toBeGreaterThan(0)
        expect(p.leadMs).toBeGreaterThanOrEqual(400)
        expect(p.driftMs).toBeGreaterThan(p.leadMs + p.revealMs)
        // Restrained: a push, not a zoom.
        expect(p.driftScale).toBeLessThan(1.12)
    })

    // Never the same play twice — but only a few percent apart, never a
    // different kind of move.
    it('varies timing subtly between visits', () => {
        const low = planEntry({ hasScene: true, random: fixed(0) })
        const high = planEntry({ hasScene: true, random: fixed(0.999) })
        expect(low.glideMs).not.toBe(high.glideMs)
        expect(low.kind).toBe(high.kind)
        expect(high.glideMs / low.glideMs).toBeLessThan(1.2)
    })

    it('stretches every authored duration by the review slowdown', () => {
        const normal = planEntry({ hasScene: false, random: fixed(0.5) })
        const slow = planEntry({ hasScene: false, random: fixed(0.5), slow: 10 })
        expect(slow.coverMs).toBe(normal.coverMs * 10)
        expect(slow.leadMs).toBe(normal.leadMs * 10)
        expect(slow.driftMs).toBe(normal.driftMs * 10)
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

describe('isDestinationPainted, what does not count yet', () => {
    // A room's loading veil stays in the DOM once loaded, faded to 0.
    it('does not wait on a loading veil that has faded out', () => {
        const veil = document.createElement('div')
        veil.className = 'live-scene-loading'
        veil.style.opacity = '0'
        const canvas = document.createElement('canvas')
        document.body.append(veil, canvas)
        try {
            expect(isDestinationPainted(document)).toBe(true)
            veil.style.opacity = '1'
            expect(isDestinationPainted(document)).toBe(false)
        } finally {
            veil.remove()
            canvas.remove()
        }
    })

    // /open_jam/scene: the canvas drew a dark empty room before its document
    // arrived, and the curtain let go onto it.
    it('does not count a room that is still waiting for its document', () => {
        const doc = document.implementation.createHTMLDocument('t')
        const wrapper = doc.createElement('div')
        wrapper.setAttribute(plan.ENTRY_PENDING_ATTR, 'document')
        wrapper.appendChild(doc.createElement('canvas'))
        doc.body.appendChild(wrapper)
        expect(isDestinationPainted(doc)).toBe(false)
        wrapper.removeAttribute(plan.ENTRY_PENDING_ATTR)
        expect(isDestinationPainted(doc)).toBe(true)
    })
})
