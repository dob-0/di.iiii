import { describe, expect, it } from 'vitest'
import { parseArgs, visitorExpectations, visitorProblems } from './space-publish.mjs'

describe('space-publish', () => {
    it('needs a space and refuses unknown options (a typo must not be ignored)', () => {
        expect(() => parseArgs([])).toThrow(/--space/)
        expect(() => parseArgs(['--space', 'moxir', '--skip', 'x'])).toThrow(/unknown option --skip/)
        expect(parseArgs(['--space', 'moxir', '--dry-run'])).toEqual({ space: 'moxir', dryRun: true, clock: true })
    })

    it('expects the published project visible and every private project hidden', () => {
        const expect_ = visitorExpectations({
            space: { publishedProjectId: 'hall-minimal' },
            projects: [{ id: 'hall-minimal', visibility: 'public' }, { id: 'sources', visibility: 'private' }, { id: 'hall' }]
        })
        expect(expect_).toEqual({ published: 'hall-minimal', hidden: ['sources'] })
    })

    it('passes when a visitor sees exactly that', () => {
        const expect_ = { published: 'hall-minimal', hidden: ['sources'] }
        const status = { 'meta:hall-minimal': 200, 'document:hall-minimal': 200, 'meta:sources': 404, 'document:sources': 404 }
        expect(visitorProblems({ expect: expect_, listed: ['hall-minimal', 'hall'], status })).toEqual([])
    })

    it('names every leak: a private project listed, or answering anything but 404', () => {
        const expect_ = { published: 'hall-minimal', hidden: ['sources'] }
        const status = { 'meta:hall-minimal': 404, 'meta:sources': 200, 'document:sources': 404 }
        const problems = visitorProblems({ expect: expect_, listed: ['sources'], status })
        expect(problems).toHaveLength(3)
        expect(problems.join('\n')).toMatch(/published project hall-minimal answers 404/)
        expect(problems.join('\n')).toMatch(/sources is in the visitor's list/)
        expect(problems.join('\n')).toMatch(/sources meta answers 200/)
    })
})
