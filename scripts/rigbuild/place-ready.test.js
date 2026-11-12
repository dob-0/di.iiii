// place-ready.mjs (owner N3921): every gap the owner found by hand is a named FAIL with a fix; a good chain passes.
import { describe, it, expect } from 'vitest'
import { checkChain } from './place-ready.mjs'

const lamp = (id, extra = {}) => ({ id, components: { fixture: { type: 't-bar' }, beam: { emitter: { shape: 'bar' } }, ...extra } })
const doc = {
    entities: [lamp('platina-pixel-01'), { id: 'platina-screen-live', components: {} }],
    nodes: [{ id: 'n1', typeId: 'vj.deck', values: { deck: { columnCues: ['c1', ''] } } }],
    mappingState: { cues: [{ id: 'c1' }], surfaces: [{ name: 'S1', source: { kind: 'network', ref: 'n1' } }] },
    presentationState: { entryView: 'fixed-camera' }
}
const good = { doc, project: 'p', space: 's', show: { space: 's' }, rig: { fixtures: [{ id: 'f1', key: 'p:platina-pixel-01', name: 'bar', profile: 'T 1ch' }] }, looks: [{ steps: [{ values: { f1: { level: 1 } } }] }], summary: { cues: { project: 'p', n: 1 } } }
const by = (rows, n) => rows.find((r) => r.name === n)

describe('checkChain', () => {
    it('passes a whole chain', () => { expect(checkChain(good).filter((r) => r.status !== 'PASS')).toEqual([]) })
    it('names the desk holding another show (N3898)', () => { expect(by(checkChain({ ...good, show: { space: 'moxir' } }), 'desk-show').status).toBe('FAIL') })
    it('names the bird view (N3905)', () => { expect(by(checkChain({ ...good, doc: { ...doc, presentationState: { entryView: 'scene' } } }), 'room-view').status).toBe('FAIL') })
    it('names bars without their shape (N3905)', () => { expect(by(checkChain({ ...good, doc: { ...doc, entities: [lamp('platina-pixel-01', { beam: {} })] } }), 'bar-shape').status).toBe('FAIL') })
    it('calls a lamp with no value OWED only when its type chart is owed (K15)', () => {
        const rig = { fixtures: [...good.rig.fixtures, { id: 'f2', key: 'p:k', name: 'K15', profile: 'CP-HY-BEYE-K15 112ch' }] }
        expect(by(checkChain({ ...good, rig, doc: { ...doc, entities: [...doc.entities, lamp('k')] }, owedTypes: ['cp-hy-beye-k15'] }), 'desk-looks').status).toBe('OWED')
        expect(by(checkChain({ ...good, rig, doc: { ...doc, entities: [...doc.entities, lamp('k')] }, owedTypes: [] }), 'desk-looks').status).toBe('FAIL')
    })
    it('names a missing lamp model in the serving tree (N3918)', () => { expect(by(checkChain({ ...good, tree: { glbTypes: new Set() } }), 'models').status).toBe('FAIL') })
})
