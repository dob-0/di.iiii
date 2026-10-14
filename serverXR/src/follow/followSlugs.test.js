import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { planSlugs } = require('./followSlugs.js')

const p = (id, slug = null, over = {}) => ({ id, slug, state: 'live', ...over })

describe('planSlugs — a short name chosen once reaches the other side', () => {
    it('carries a name set here to the host that has none', () => {
        expect(planSlugs({ local: [p('moxir-brief', 'brief')], host: [p('moxir-brief')] }))
            .toEqual({ toLocal: [], toHost: [{ id: 'moxir-brief', slug: 'brief' }], notes: [] })
    })

    it('carries the host\'s name here when this install has none', () => {
        expect(planSlugs({ local: [p('moxir-brief')], host: [p('moxir-brief', 'brief')] }).toLocal)
            .toEqual([{ id: 'moxir-brief', slug: 'brief' }])
    })

    it('treats a slug equal to the project id as "none chosen"', () => {
        const r = planSlugs({ local: [p('moxir-brief', 'moxir-brief')], host: [p('moxir-brief', 'brief')] })
        expect(r.toLocal).toEqual([{ id: 'moxir-brief', slug: 'brief' }])
        expect(r.toHost).toEqual([])
    })

    it('when both chose and differ, the host wins and nothing is pushed up', () => {
        const r = planSlugs({ local: [p('a1', 'mine')], host: [p('a1', 'theirs')] })
        expect(r.toLocal).toEqual([{ id: 'a1', slug: 'theirs' }])
        expect(r.toHost).toEqual([])
    })

    it('does nothing when they agree, or when neither chose', () => {
        expect(planSlugs({ local: [p('a1', 'x'), p('b2')], host: [p('a1', 'x'), p('b2', 'b2')] }))
            .toEqual({ toLocal: [], toHost: [], notes: [] })
    })

    it('never clears a name', () => {
        const r = planSlugs({ local: [p('a1')], host: [p('a1', 'x')] })
        expect(r.toHost).toEqual([])
    })

    it('only compares projects live on both sides', () => {
        const r = planSlugs({ local: [p('a1', 'x'), p('b2', 'y', { state: 'archive' }), p('c3', 'z')], host: [p('a1'), p('b2'), p('d4')] })
        expect(r.toHost).toEqual([{ id: 'a1', slug: 'x' }])
    })

    it('does not carry a name another project already holds on the target side', () => {
        const r = planSlugs({ local: [p('a1', 'brief')], host: [p('a1'), p('z9', 'brief')] })
        expect(r.toHost).toEqual([])
        expect(r.notes[0]).toContain('already z9')
    })

    it('does not give the same new name to two projects in one pass', () => {
        const r = planSlugs({ local: [p('a1', 'show'), p('a2', 'show')], host: [p('a1'), p('a2')] })
        expect(r.toHost).toHaveLength(1)
        expect(r.notes).toHaveLength(1)
    })

    it('a project on one side only is left to the make-missing step', () => {
        expect(planSlugs({ local: [p('a1', 'x')], host: [] })).toEqual({ toLocal: [], toHost: [], notes: [] })
    })
})
