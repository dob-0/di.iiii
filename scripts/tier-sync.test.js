import { describe, it, expect } from 'vitest'
import { TIERS, documentSignature, isProductionTarget, planAudit, planSync } from './tier-sync.mjs'

describe('isProductionTarget', () => {
    // The whole reason this guard exists: a tool that can write to a tier must
    // not be able to reach production by inheriting a default.
    it('knows production from every other tier', () => {
        expect(isProductionTarget(TIERS.prod.base)).toBe(true)
        expect(isProductionTarget('https://www.di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget(TIERS.staging.base)).toBe(false)
        expect(isProductionTarget(TIERS.local.base)).toBe(false)
        expect(isProductionTarget('not a url')).toBe(false)
    })
})

describe('planSync', () => {
    it('moves only what the destination is missing', () => {
        const plan = planSync({
            source: { main: ['a', 'b', 'c'], wcc: ['x'] },
            destination: { main: ['a'], wcc: ['x'] }
        })
        expect(plan).toEqual([{ spaceId: 'main', createSpace: false, projects: ['b', 'c'] }])
    })

    it('creates a space the destination has never heard of', () => {
        const plan = planSync({
            source: { atlas: ['estate-map'] },
            destination: {}
        })
        expect(plan).toEqual([{ spaceId: 'atlas', createSpace: true, projects: ['estate-map'] }])
    })

    // Only ever adds. A project the destination has and the source does not is
    // that tier's own work — the dev box in particular holds things that exist
    // on no other tier — and a sync that deletes is a sync that loses work.
    it('never plans to remove what only the destination has', () => {
        const plan = planSync({
            source: { main: ['a'] },
            destination: { main: ['a', 'b', 'c'], dilijan: ['camp'] }
        })
        expect(plan).toEqual([])
    })

    it('leaves what is already there alone unless forced', () => {
        const same = { source: { main: ['a', 'b'] }, destination: { main: ['a', 'b'] } }
        expect(planSync(same)).toEqual([])
        expect(planSync({ ...same, force: true })).toEqual([
            { spaceId: 'main', createSpace: false, projects: ['a', 'b'] }
        ])
    })

    it('has nothing to do when the source is empty', () => {
        expect(planSync({ source: {}, destination: { main: ['a'] } })).toEqual([])
    })
})

describe('documentSignature', () => {
    it('counts a published page, which lives nowhere near the entities', () => {
        // The failure this exists to prevent: a 358KB brand guide and a 314KB
        // funding board both read as 0 entities, 0 nodes, 0 assets. Measuring
        // substance by entity count alone marks them empty, and a purge of
        // "empty" projects takes them.
        const page = documentSignature({ presentationState: { codeHtml: '<!doctype html>…' } })
        expect(page.entities).toBe(0)
        expect(page.page).toBe(16)
        expect(page.hash).not.toBe(documentSignature({}).hash)
    })

    it('ignores the fields that move without the work moving', () => {
        const a = { entities: [], publishState: { lastExportAt: 1 }, showState: { clockEpoch: 500 } }
        const b = { entities: [], publishState: { lastExportAt: 99999 }, showState: { clockEpoch: 0 } }
        expect(documentSignature(a).hash).toBe(documentSignature(b).hash)
    })

    it('does not care what order a server serialized its keys in', () => {
        const a = { entities: [{ id: 'x', type: 'box' }], worldState: { fog: 1, spawn: [0, 0, 0] } }
        const b = { worldState: { spawn: [0, 0, 0], fog: 1 }, entities: [{ type: 'box', id: 'x' }] }
        expect(documentSignature(a).hash).toBe(documentSignature(b).hash)
    })

    it('sees a page rewritten to the same length', () => {
        const a = documentSignature({ presentationState: { codeHtml: '<p>one</p>' } })
        const b = documentSignature({ presentationState: { codeHtml: '<p>two</p>' } })
        expect(a.page).toBe(b.page)
        expect(a.hash).not.toBe(b.hash)
    })
})

describe('planAudit', () => {
    const sig = (n) => documentSignature({ entities: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) })

    // The blindness this whole mode exists to end: planSync sees nothing here,
    // because both tiers hold the same slug.
    it('sees the same slug holding different work', () => {
        const source = { dilijan: { welcome: sig(0) } }
        const destination = { dilijan: { welcome: sig(265) } }
        expect(planSync({
            source: { dilijan: ['welcome'] },
            destination: { dilijan: ['welcome'] }
        })).toEqual([])

        const audit = planAudit({ source, destination })
        expect(audit.missing).toEqual([])
        expect(audit.extra).toEqual([])
        expect(audit.differs).toHaveLength(1)
        expect(audit.differs[0]).toMatchObject({ spaceId: 'dilijan', projectId: 'welcome' })
        expect(audit.differs[0].source.entities).toBe(0)
        expect(audit.differs[0].destination.entities).toBe(265)
    })

    // Unlike planSync, the audit reports both directions — a project only the
    // destination has is drift too, it just is not drift a sync may fix.
    it('reports what only the destination has', () => {
        const audit = planAudit({
            source: { open: { mini: sig(1) } },
            destination: { open: { mini: sig(1), 'open-jam': sig(47) } }
        })
        expect(audit.extra).toHaveLength(1)
        expect(audit.extra[0].projectId).toBe('open-jam')
        expect(audit.missing).toEqual([])
        expect(audit.differs).toEqual([])
    })

    it('reports a space one tier has never heard of', () => {
        const audit = planAudit({ source: { atlas: { 'estate-map': sig(0) } }, destination: {} })
        expect(audit.missing).toEqual([
            { spaceId: 'atlas', projectId: 'estate-map', source: sig(0) }
        ])
    })

    it('is quiet when the two tiers hold the same work', () => {
        const both = { main: { 'main-dii-project': sig(85) }, wcc: { arthur: sig(1) } }
        expect(planAudit({ source: both, destination: both }))
            .toEqual({ missing: [], extra: [], differs: [] })
    })
})
