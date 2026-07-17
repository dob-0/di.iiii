import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NodePalette from './NodePalette.jsx'

const PLACEMENT = { clientX: 100, clientY: 100 }

describe('NodePalette getBlockReason', () => {
    it('shows the message and does not call onCreate when a type is blocked', () => {
        const onCreate = vi.fn()
        const getBlockReason = (definition) =>
            definition.id === 'universe.world' ? 'Only one World per scope — place it inside a different node to create another.' : null

        render(<NodePalette open surface="graph" placement={PLACEMENT} onClose={() => {}} onCreate={onCreate} getBlockReason={getBlockReason} />)
        fireEvent.change(screen.getByPlaceholderText('type a node name…'), { target: { value: 'World' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node name…'), { key: 'Enter' })

        expect(screen.getByText(/Only one World per scope/)).toBeTruthy()
        expect(onCreate).not.toHaveBeenCalled()
    })

    it('creates normally when getBlockReason returns null', () => {
        const onCreate = vi.fn()
        render(<NodePalette open surface="graph" placement={PLACEMENT} onClose={() => {}} onCreate={onCreate} getBlockReason={() => null} />)
        fireEvent.change(screen.getByPlaceholderText('type a node name…'), { target: { value: 'Cube' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node name…'), { key: 'Enter' })

        expect(onCreate).toHaveBeenCalledTimes(1)
        expect(screen.queryByText(/Only one/)).toBeNull()
    })

    it('clears the blocked message once the query changes again', () => {
        const getBlockReason = (definition) => (definition.id === 'universe.world' ? 'blocked' : null)
        render(<NodePalette open surface="graph" placement={PLACEMENT} onClose={() => {}} onCreate={() => {}} getBlockReason={getBlockReason} />)
        const input = screen.getByPlaceholderText('type a node name…')
        fireEvent.change(input, { target: { value: 'World' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(screen.getByText('blocked')).toBeTruthy()

        fireEvent.change(input, { target: { value: 'Cube' } })
        expect(screen.queryByText('blocked')).toBeNull()
    })

    it('defaults to never blocking when getBlockReason is not provided', () => {
        const onCreate = vi.fn()
        render(<NodePalette open surface="graph" placement={PLACEMENT} onClose={() => {}} onCreate={onCreate} />)
        fireEvent.change(screen.getByPlaceholderText('type a node name…'), { target: { value: 'Cube' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node name…'), { key: 'Enter' })

        expect(onCreate).toHaveBeenCalledTimes(1)
    })
})
