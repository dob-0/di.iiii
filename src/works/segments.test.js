import { describe, expect, it } from 'vitest'
import { buildSpaceDoorPath, isWorkSegment, workForSegment } from './segments.js'
import { WORKS } from './works.js'

// The ids come from the registry, never typed here: a work renamed or added
// must move this test with it rather than leave it asserting about a string
// nothing answers to.
const SHADOWED = WORKS[0].id
const PLAIN = 'a-space-no-work-shadows'

describe('a space card’s door', () => {
    it('has a work shadowing at least one segment, so this is not vacuous', () => {
        expect(WORKS.length).toBeGreaterThan(0)
        expect(isWorkSegment(SHADOWED)).toBe(true)
        expect(workForSegment(PLAIN)).toBeNull()
    })

    it('sends a work-shadowed space to its published project, not to the bare segment', () => {
        // The bug: /{work} bare is the coded piece — RootApp resolves it before
        // the space router sees it — so the bare path could never open the rows
        // the space actually holds.
        expect(buildSpaceDoorPath({ id: SHADOWED, publishedProjectId: 'alla-virabyan' }))
            .toBe(`/${SHADOWED}/p/alla-virabyan`)
    })

    it('leaves a space no work shadows exactly where it was', () => {
        expect(buildSpaceDoorPath({ id: PLAIN, publishedProjectId: 'p1' })).toBe(`/${PLAIN}`)
        expect(buildSpaceDoorPath({ id: PLAIN })).toBe(`/${PLAIN}`)
        expect(buildSpaceDoorPath(PLAIN)).toBe(`/${PLAIN}`)
    })

    it('falls back to the bare segment when a shadowed space publishes nothing', () => {
        // Nothing else to open — and this is the case HostedPieceStub's
        // "not in this copy" line was written for.
        expect(buildSpaceDoorPath({ id: SHADOWED })).toBe(`/${SHADOWED}`)
        expect(buildSpaceDoorPath({ id: SHADOWED, publishedProjectId: null })).toBe(`/${SHADOWED}`)
        expect(buildSpaceDoorPath(SHADOWED)).toBe(`/${SHADOWED}`)
    })

    it('survives a missing space', () => {
        expect(buildSpaceDoorPath(null)).toBe('/')
        expect(buildSpaceDoorPath({})).toBe('/')
    })
})
