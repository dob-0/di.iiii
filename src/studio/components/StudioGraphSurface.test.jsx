import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createNode } from '../../project/nodeRegistry.js'
import StudioGraphSurface from './StudioGraphSurface.jsx'

const mkNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})

describe('StudioGraphSurface', () => {
    it('renders the document\'s graph nodes read-only, with a read-only badge', () => {
        const cube = mkNode('geom.cube', { label: 'My Cube' })
        render(<StudioGraphSurface document={{ nodes: [cube], edges: [] }} />)
        expect(screen.getByText('My Cube')).toBeInTheDocument()
        expect(screen.getByText('Read-only preview')).toBeInTheDocument()
    })

    it('shows the empty hint when the document has no graph nodes', () => {
        render(<StudioGraphSurface document={{ nodes: [], edges: [] }} />)
        expect(screen.getByText(/no nodes in this project yet/i)).toBeInTheDocument()
    })

    it('tolerates a missing document without crashing', () => {
        render(<StudioGraphSurface document={undefined} />)
        expect(screen.getByText('Read-only preview')).toBeInTheDocument()
    })

    it('selecting a node shows a local read-out but never mutates the document', () => {
        const cube = mkNode('geom.cube', { label: 'My Cube' })
        render(<StudioGraphSurface document={{ nodes: [cube], edges: [] }} />)
        fireEvent.click(screen.getByText('My Cube'))
        expect(screen.getAllByText('My Cube').length).toBeGreaterThan(1) // graph card + readout
        expect(screen.getByText('geom.cube')).toBeInTheDocument()

        // Delete/Backspace must be a no-op here — no onDeleteNode was passed to
        // RawGraphSurface, so nothing in this read-only view can remove a node.
        fireEvent.keyDown(window, { key: 'Delete' })
        expect(screen.getAllByText('My Cube').length).toBeGreaterThan(1)
    })
})
