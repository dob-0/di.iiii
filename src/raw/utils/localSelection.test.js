import { describe, expect, it } from 'vitest'
import { splitSelectionOps } from './localSelection.js'

// Selection is the viewer's own, not the project's (NOPA audit F4, 2026-10-02):
// a plain click on a card used to POST setWorkspaceState {selectedNodeId} to
// the shared op log and bump documentVersion for every viewer.
describe('splitSelectionOps', () => {
    it('takes a bare selection op off the shared batch entirely', () => {
        const { ops, selection } = splitSelectionOps({
            type: 'setWorkspaceState',
            payload: { patch: { selectedNodeId: 'n1' } }
        })
        expect(ops).toEqual([])
        expect(selection).toBe('n1')
    })

    it('keeps the rest of a mixed patch shared and strips only the selection', () => {
        const { ops, selection } = splitSelectionOps([
            { type: 'createNode', payload: { node: { id: 'n2' } } },
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: 'n2', liveWorldNodeIdByScope: { '': 'w1' } } } }
        ])
        expect(selection).toBe('n2')
        expect(ops).toEqual([
            { type: 'createNode', payload: { node: { id: 'n2' } } },
            { type: 'setWorkspaceState', payload: { patch: { liveWorldNodeIdByScope: { '': 'w1' } } } }
        ])
    })

    it('reports a clear as null and the last selection in a batch wins', () => {
        expect(splitSelectionOps({ type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } }).selection).toBeNull()
        expect(splitSelectionOps([
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: 'a' } } },
            { type: 'setWorkspaceState', payload: { patch: { selectedNodeId: 'b' } } }
        ]).selection).toBe('b')
    })

    it('leaves batches without a selection untouched (undefined = no change)', () => {
        const op = { type: 'updateNode', payload: { nodeId: 'n1', patch: { label: 'x' } } }
        const { ops, selection } = splitSelectionOps([op, null])
        expect(ops).toEqual([op])
        expect(selection).toBeUndefined()
    })
})
