import { act, renderHook } from '@testing-library/react'
import { useMemo } from 'react'
import { describe, expect, it } from 'vitest'
import { createFrameMemory, createNodeGraphContext, evaluateNodeOutput } from '../../graph/nodeGraphRuntime.js'
import { createNode } from '../../nodeRegistry.js'
import { loadLampType } from './lampType.js'
import { useLampTypeVersion } from './useLampTypeVersion.js'

// The graph-context owners' shape (RawEditor, RawViewport, GraphRoomNodes): a Time-less document has a constant
// clock, so the context is rebuilt only when `lampTypes` moves.
describe('a Lamp whose type file arrives after the first evaluation', () => {
    it('is read again with no Time node and no edit: patch leaves "loading", dmx appears', async () => {
        const lamp = createNode('light.lamp', { id: 'l', values: { type: 'up-b380f', mode: '16ch' } })
        const document = { nodes: [lamp], edges: [] }
        const frameMemory = createFrameMemory()
        const read = (port) => renderedContext.current && evaluateNodeOutput(lamp, port, renderedContext.current)
        const renderedContext = { current: null }
        const { rerender } = renderHook(() => {
            const lampTypes = useLampTypeVersion()
            const context = useMemo(() => createNodeGraphContext(document, { now: 0, liveOutputs: {}, frameMemory }), [lampTypes]) // eslint-disable-line react-hooks/exhaustive-deps
            renderedContext.current = context
            return context
        })
        expect(read('patch')).toBe('loading type "up-b380f"')
        expect(read('dmx')).toBeNull()
        await act(async () => { await loadLampType('up-b380f') })
        rerender()
        expect(read('patch')).not.toMatch(/loading/)
        expect(read('dmx')?.values?.length).toBeGreaterThan(0)
    })
})
