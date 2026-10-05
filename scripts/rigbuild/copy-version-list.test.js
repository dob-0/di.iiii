import { describe, expect, it } from 'vitest'
import { copyListing, listStepFor } from './copy-version.mjs'

// copy-version.mjs lists what it makes in the production's version list, in the same run
// (docs/architecture/decisions/2026-10-04-production-versions.md).
const SET = 'moxir-2026-10-17'
const base = { api: 'https://dev.example/serverXR', 'token-file': '/t', to: 'moxir-hall-minimal-oldhall-0929' }

describe('copy-version: the list step', () => {
    it('a new labelled copy is a kept copy, made from its source version', () => {
        const mark = { set: SET, id: 'minimal-oldhall-0929', copyOf: { projectId: 'moxir-hall-minimal', id: 'minimal', label: 'old hall 09-29' } }
        expect(copyListing(mark, { from: 'moxir-hall-minimal', to: 'moxir-hall-minimal-oldhall-0929' })).toMatchObject({ production: SET, id: 'minimal-oldhall-0929', status: 'kept-copy', madeFrom: 'minimal' })
    })

    it('a version brought from another install under its own id (--from-api, from == to) is a candidate, not a kept copy', () => {
        const mark = { set: SET, id: 'known-full', copyOf: { projectId: 'moxir-hall-known-full', id: 'known-full', label: 'PONYO 10-04' } }
        const out = copyListing(mark, { from: 'moxir-hall-known-full', to: 'moxir-hall-known-full', fromApi: 'http://ponyo:4100/serverXR' })
        expect(out).toMatchObject({ status: 'candidate', madeFrom: null })
        expect(out.note).toMatch(/another install \(http:\/\/ponyo:4100\/serverXR\)/)
    })

    it('a copy of a project with no version mark is not a version and is not listed', () => {
        expect(copyListing(null, { from: 'a', to: 'b' })).toBe(null)
    })

    it('runs for a copy, an adopt and an undo — never for a dry run or arguments main refuses', () => {
        expect(listStepFor({ ...base, space: 'moxir', from: 'moxir-hall-minimal', label: 'old hall 09-29' })).toBe('copy')
        expect(listStepFor({ ...base, adopt: true, from: 'moxir-hall-minimal', label: 'old hall 09-29' })).toBe('adopt')
        expect(listStepFor({ ...base, undo: true })).toBe('undo')
        expect(listStepFor({ ...base, space: 'moxir', from: 'x', label: 'l', 'dry-run': true })).toBe(null)
        expect(listStepFor({ ...base, space: 'moxir', from: 'x', label: 'l', dryrun: true })).toBe(null)
        expect(listStepFor({ to: 'x' })).toBe(null)
    })
})
