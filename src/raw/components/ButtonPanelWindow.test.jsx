import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ButtonPanelWindow from './ButtonPanelWindow.jsx'
import { createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from '../../project/graph/nodeGraphRuntime.js'

const node = { id: 'go-1', typeId: 'view.button', label: 'Go', values: { presses: 2 } }

describe('ButtonPanelWindow', () => {
    it('a press is a live event and holds through the side channel', () => {
        const onPress = vi.fn()
        const onHeld = vi.fn()
        render(<ButtonPanelWindow node={node} presses={5} onPress={onPress} onHeld={onHeld} />)
        const button = screen.getByRole('button', { name: 'Go' })
        fireEvent.pointerDown(button)
        expect(onPress).toHaveBeenCalledWith('go-1')
        expect(onHeld).toHaveBeenCalledWith('go-1', true)
        fireEvent.pointerUp(button)
        expect(onHeld).toHaveBeenLastCalledWith('go-1', false)
        expect(screen.getByText('5 presses')).toBeTruthy()
    })

    it('without a writer the button is disabled, never a dead-looking live one', () => {
        render(<ButtonPanelWindow node={node} />)
        expect(screen.getByRole('button', { name: 'Go' }).disabled).toBe(true)
    })

    it('a window closed while held releases Pressed', () => {
        const onHeld = vi.fn()
        const { unmount } = render(<ButtonPanelWindow node={node} onPress={() => {}} onHeld={onHeld} />)
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Go' }))
        unmount()
        expect(onHeld).toHaveBeenLastCalledWith('go-1', false)
    })

    it('Presses reads the live count on top of any stored one — no document op per press', () => {
        const button = createNode('view.button', { id: 'b', values: { presses: 2 } })
        const read = (live) => evaluateNodeOutput(button, 'presses', createNodeGraphContext({ nodes: [button], edges: [] }, { liveOutputs: live }))
        expect(read(null)).toBe(2)
        expect(read(new Map([['b:presses', 3]]))).toBe(5)
    })
})
