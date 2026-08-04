// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { findIdlessCreateOp } = require('./opValidation.js')

// Regression guard for audit batch 2: the server fills in a missing opId but
// left the payload alone, so a create op with no entity/node/edge/asset id was
// applied with a server-minted id, persisted, then broadcast VERBATIM — every
// client re-applied it through the same shared code and minted a different id,
// forking the peers' documents until a full reload.
describe('findIdlessCreateOp', () => {
    it('passes a batch where every create carries an id', () => {
        expect(findIdlessCreateOp([
            { type: 'createEntity', payload: { entity: { id: 'e1', type: 'box' } } },
            { type: 'createNode', payload: { node: { id: 'n1', typeId: 'geom.cube' } } },
            { type: 'createEdge', payload: { edge: { id: 'ed1', fromNodeId: 'n1', toNodeId: 'n2' } } },
            { type: 'upsertAsset', payload: { asset: { id: 'a1', name: 'x.png' } } }
        ])).toBeNull()
    })

    it('catches a missing, empty or non-string id on every create op type', () => {
        const cases = [
            { type: 'createEntity', payload: { entity: { type: 'box' } } },
            { type: 'createEntity', payload: { entity: { id: '   ' } } },
            { type: 'createNode', payload: { node: { id: 42 } } },
            { type: 'createEdge', payload: { edge: {} } },
            { type: 'upsertAsset', payload: {} },
            { type: 'createNode' }
        ]
        for (const op of cases) {
            expect(findIdlessCreateOp([op])).toBe(op)
        }
    })

    it('ignores ops that do not create an identified thing', () => {
        expect(findIdlessCreateOp([
            { type: 'updateEntity', payload: { entityId: 'e1', patch: {} } },
            { type: 'deleteNode', payload: { nodeId: 'n1' } },
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } },
            { type: 'setPresentationState', payload: { patch: { mode: 'code' } } }
        ])).toBeNull()
    })

    it('returns the FIRST offender so the error names it', () => {
        const bad = { type: 'createNode', payload: { node: {} } }
        expect(findIdlessCreateOp([
            { type: 'createEntity', payload: { entity: { id: 'e1' } } },
            bad,
            { type: 'createEdge', payload: { edge: {} } }
        ])).toBe(bad)
    })

    it('tolerates junk input', () => {
        expect(findIdlessCreateOp()).toBeNull()
        expect(findIdlessCreateOp(null)).toBeNull()
        expect(findIdlessCreateOp('nope')).toBeNull()
        expect(findIdlessCreateOp([null, undefined])).toBeNull()
    })
})
