import { describe, expect, it } from 'vitest'
import { WORKS } from '../../works/works.js'
import { describeSpaceHolds } from './spaceHolds.js'

// What a space card says it holds. A work compiled into di.iiii's own code has
// no project row, so "0 projects" was never the whole answer for its space.
// The tests name no work: they take the first one the registry knows.
const compiled = WORKS.find((work) => work.codeSpace)

describe('describeSpaceHolds', () => {
    it('has a compiled work to test with (src/works/works.js, a work with a codeSpace block)', () => {
        expect(compiled).toBeTruthy()
    })

    it('a space with no project and no compiled work has nothing yet', () => {
        expect(describeSpaceHolds({ id: 'nothing-compiled-here', projectCount: 0, publishedCount: 0 })).toBe('No projects yet')
    })

    it('a compiled work is held even when the space has no project', () => {
        expect(describeSpaceHolds({ id: compiled.id, projectCount: 0, publishedCount: 0 })).toBe("a work in di.iiii's code")
    })

    it('projects and a compiled work are both counted', () => {
        expect(describeSpaceHolds({ id: compiled.id, projectCount: 3, publishedCount: 1 })).toBe("3 projects · 1 published · a work in di.iiii's code")
    })

    it('a space of projects reads as it did', () => {
        expect(describeSpaceHolds({ id: 'plain', projectCount: 1, publishedCount: 0 })).toBe('1 project · none published')
        expect(describeSpaceHolds({ id: 'plain', projectCount: 29, publishedCount: 9 })).toBe('29 projects · 9 published')
    })
})
