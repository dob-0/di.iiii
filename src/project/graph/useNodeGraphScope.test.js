import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { isNodeInScope, useNodeGraphScope } from './useNodeGraphScope.js'

const ROOT_TYPE = 'universe.node0'

describe('useNodeGraphScope', () => {
    it('starts at the root scope (null) with no root node', () => {
        const { result } = renderHook(() => useNodeGraphScope({ nodes: [], rootTypeId: ROOT_TYPE }))
        expect(result.current.navStack).toEqual([null])
        expect(result.current.currentScopeId).toBe(null)
    })

    it('auto-enters the root node once it appears', () => {
        const { result, rerender } = renderHook(
            ({ nodes }) => useNodeGraphScope({ nodes, rootTypeId: ROOT_TYPE }),
            { initialProps: { nodes: [] } }
        )
        expect(result.current.navStack).toEqual([null])

        rerender({ nodes: [{ id: 'node0', typeId: ROOT_TYPE }] })
        expect(result.current.navStack).toEqual([null, 'node0'])
        expect(result.current.currentScopeId).toBe('node0')
    })

    it('does not re-enter the root node if the user has already navigated away', () => {
        const nodes = [
            { id: 'node0', typeId: ROOT_TYPE },
            { id: 'child', typeId: 'geom.cube', parentId: 'node0' }
        ]
        const { result, rerender } = renderHook(
            ({ n }) => useNodeGraphScope({ nodes: n, rootTypeId: ROOT_TYPE }),
            { initialProps: { n: nodes } }
        )
        expect(result.current.navStack).toEqual([null, 'node0'])

        act(() => { result.current.enterNode('child') })
        expect(result.current.navStack).toEqual([null, 'node0', 'child'])

        // A re-render with the same node list (root still present) must not
        // reset the user back to the root — auto-enter only fires once.
        rerender({ n: [...nodes] })
        expect(result.current.navStack).toEqual([null, 'node0', 'child'])
    })

    it('navigateToScope truncates the stack to the target index', () => {
        const nodes = [{ id: 'node0', typeId: ROOT_TYPE }]
        const { result } = renderHook(() => useNodeGraphScope({ nodes, rootTypeId: ROOT_TYPE }))

        act(() => { result.current.enterNode('a') })
        act(() => { result.current.enterNode('b') })
        expect(result.current.navStack).toEqual([null, 'node0', 'a', 'b'])

        act(() => { result.current.navigateToScope(1) })
        expect(result.current.navStack).toEqual([null, 'node0'])
    })

    it('truncates the stack when a scoped node is deleted (no ghost scope)', () => {
        let nodes = [
            { id: 'node0', typeId: ROOT_TYPE },
            { id: 'child', typeId: 'geom.cube', parentId: 'node0' }
        ]
        const { result, rerender } = renderHook(
            ({ n }) => useNodeGraphScope({ nodes: n, rootTypeId: ROOT_TYPE }),
            { initialProps: { n: nodes } }
        )
        act(() => { result.current.enterNode('child') })
        expect(result.current.navStack).toEqual([null, 'node0', 'child'])

        // 'child' is deleted from the document
        nodes = [{ id: 'node0', typeId: ROOT_TYPE }]
        rerender({ n: nodes })
        expect(result.current.navStack).toEqual([null, 'node0'])
    })

    it('falls back to the root [null] frame if every scoped node is deleted at once', () => {
        let nodes = [{ id: 'node0', typeId: ROOT_TYPE }]
        const { result, rerender } = renderHook(
            ({ n }) => useNodeGraphScope({ nodes: n, rootTypeId: ROOT_TYPE }),
            { initialProps: { n: nodes } }
        )
        expect(result.current.navStack).toEqual([null, 'node0'])

        nodes = []
        rerender({ n: nodes })
        expect(result.current.navStack).toEqual([null])
    })

    it('reset() returns to the root [null] frame', () => {
        const nodes = [{ id: 'node0', typeId: ROOT_TYPE }]
        const { result } = renderHook(() => useNodeGraphScope({ nodes, rootTypeId: ROOT_TYPE }))
        act(() => { result.current.enterNode('a') })
        expect(result.current.navStack).toEqual([null, 'node0', 'a'])

        act(() => { result.current.reset() })
        expect(result.current.navStack).toEqual([null])
    })

    it('goToRoot replaces the whole stack regardless of prior depth', () => {
        const nodes = [{ id: 'node0', typeId: ROOT_TYPE }]
        const { result } = renderHook(() => useNodeGraphScope({ nodes, rootTypeId: ROOT_TYPE }))
        act(() => { result.current.enterNode('a') })
        act(() => { result.current.enterNode('b') })
        expect(result.current.navStack).toEqual([null, 'node0', 'a', 'b'])

        act(() => { result.current.goToRoot('node0') })
        expect(result.current.navStack).toEqual([null, 'node0'])
    })

    it('works with no rootTypeId at all (manual navigation only)', () => {
        const nodes = [{ id: 'x', typeId: 'geom.cube' }]
        const { result } = renderHook(() => useNodeGraphScope({ nodes }))
        expect(result.current.navStack).toEqual([null])
        act(() => { result.current.enterNode('x') })
        expect(result.current.navStack).toEqual([null, 'x'])
    })
})

describe('isNodeInScope — the one predicate selection visibility hangs off', () => {
    it('a root node is in the root scope, spelled null or undefined', () => {
        expect(isNodeInScope({ id: 'a' }, null)).toBe(true)
        expect(isNodeInScope({ id: 'a' }, undefined)).toBe(true)
        expect(isNodeInScope({ id: 'a', parentId: null }, null)).toBe(true)
    })

    it('a child is in its parent scope and nowhere else', () => {
        const child = { id: 'c', parentId: 'geo' }
        expect(isNodeInScope(child, 'geo')).toBe(true)
        expect(isNodeInScope(child, null)).toBe(false)
        expect(isNodeInScope(child, 'other')).toBe(false)
    })

    it('no node is in no scope', () => {
        expect(isNodeInScope(null, null)).toBe(false)
        expect(isNodeInScope(undefined, 'geo')).toBe(false)
    })
})
