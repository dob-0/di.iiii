import { describe, expect, it } from 'vitest'
import { buildSteps } from './place.mjs'

// What `place.mjs --…` actually runs, without running it. The five steps are
// separate processes and the only thing the one command contributes is the
// arguments it hands each of them — so that is what is pinned here.
const argsFor = (steps, name) => steps.find((step) => step.name === name)?.args || []

const base = { work: '/w', name: 'moxir' }

describe('buildSteps', () => {
    it('runs the five steps, in order', () => {
        const steps = buildSteps({ ...base, from: '/footage' })
        expect(steps.map((step) => step.name)).toEqual(['frames', 'build', 'crush', 'fit', 'import'])
    })

    it('reads a local folder when one is named', () => {
        const steps = buildSteps({ ...base, from: '/footage' })
        expect(argsFor(steps, 'frames')).toEqual(['--from', '/footage', '--work', '/w'])
    })

    // A walk a phone collected into the space, pulled back down for the
    // reconstruction — the studio machine may not be the machine the space is on.
    it('pulls a hosted space\'s own footage when that is what was asked for', () => {
        const steps = buildSteps({ ...base, fromSpace: 'moxir', api: 'https://dev.diiii.xyz/serverXR' })
        expect(argsFor(steps, 'frames')).toEqual([
            '--from-space', 'moxir',
            '--work', '/w',
            '--api', 'https://dev.diiii.xyz/serverXR'
        ])
        // Never a local folder as well: the caller chose one.
        expect(argsFor(steps, 'frames')).not.toContain('--from')
    })

    // THE ONE THAT WOULD HAVE HUNG EVERY PICTURE TWICE. The phone put the
    // footage on the sources wall as it walked; carrying it in again at the end
    // would leave two copies of every photograph in one room.
    it('does not carry the footage into the space it came out of', () => {
        const steps = buildSteps({ ...base, fromSpace: 'moxir' })
        expect(argsFor(steps, 'import')).toContain('--no-sources')
        expect(argsFor(steps, 'import')).not.toContain('--sources')
    })

    it('carries a local folder\'s footage in, as it always did', () => {
        const steps = buildSteps({ ...base, from: '/footage' })
        expect(argsFor(steps, 'import')).toEqual(['--work', '/w', '--name', 'moxir', '--sources', '/footage'])
    })

    it('takes --no-sources by hand too, for footage already in the space', () => {
        const steps = buildSteps({ ...base, from: '/footage', noSources: true })
        expect(argsFor(steps, 'import')).toContain('--no-sources')
        expect(argsFor(steps, 'import')).not.toContain('--sources')
    })

    // The guess/measured rule, as arguments: a measured number goes to the
    // fitter, and nothing invents one.
    it('passes a measured wall to the fitter, or the guess, or neither', () => {
        expect(argsFor(buildSteps({ ...base, from: '/f', scaleEdge: 8.3, edge: 'width' }), 'fit'))
            .toEqual(['--work', '/w', '--scale-edge', '8.3', '--edge', 'width'])
        expect(argsFor(buildSteps({ ...base, from: '/f', doorGuess: true }), 'fit'))
            .toEqual(['--work', '/w', '--door-guess'])
        expect(argsFor(buildSteps({ ...base, from: '/f' }), 'fit')).toEqual(['--work', '/w'])
    })

    it('sends the reconstruction to the GPU it was told to, or the rented default', () => {
        expect(argsFor(buildSteps({ ...base, from: '/f', gpu: 'local' }), 'build'))
            .toEqual(['--work', '/w', '--gpu', 'local'])
        expect(argsFor(buildSteps({ ...base, from: '/f' }), 'build'))
            .toEqual(['--work', '/w', '--gpu', 'L4'])
        // A mesh already in hand rents nothing.
        expect(argsFor(buildSteps({ ...base, from: '/f', localObj: '/m.obj' }), 'build'))
            .toEqual(['--work', '/w', '--local-obj', '/m.obj'])
    })
})
