import { describe, expect, it } from 'vitest'
import { planArchive } from './archive-versions.mjs'

const p = (id, state = 'live', visibility = 'public') => ({ id, title: id, state, visibility })

describe('planArchive', () => {
    it('archives and hides every project not kept, and leaves the kept ones alone', () => {
        const plan = planArchive({ projects: [p('show'), p('old-a'), p('old-b', 'archived', 'public'), p('notes', 'live', 'private')], keep: ['show', 'notes'] })
        expect(plan.kept).toEqual(['show', 'notes'])
        expect(plan.steps.map((s) => [s.id, s.change])).toEqual([
            ['old-a', { state: 'archived', visibility: 'private' }],
            ['old-b', { visibility: 'private' }]
        ])
    })

    it('records the state before, so an undo can put it back', () => {
        const [step] = planArchive({ projects: [p('old', 'live', 'public')], keep: [] }).steps
        expect(step.before).toEqual({ state: 'live', visibility: 'public' })
    })

    it('names a kept id the server does not list instead of failing silently', () => {
        expect(planArchive({ projects: [p('a')], keep: ['a', 'gone'] }).missing).toEqual(['gone'])
    })

    it('plans nothing for a project already archived and private', () => {
        const [step] = planArchive({ projects: [p('done', 'archived', 'private')], keep: [] }).steps
        expect(step.change).toEqual({})
    })
})
