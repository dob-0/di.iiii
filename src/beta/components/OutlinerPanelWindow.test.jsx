import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OutlinerPanelWindow from './OutlinerPanelWindow.jsx'

vi.mock('../../project/nodeRegistry.js', () => ({
    getNodeType: (typeId) => {
        const map = {
            'geom.cube':   { id: 'geom.cube',   label: 'Cube',       category: 'geometry' },
            'view.text':   { id: 'view.text',   label: 'Text Panel', category: 'view' },
            'value.color': { id: 'value.color', label: 'Color',      category: 'math' }
        }
        return map[typeId] || null
    },
    getCategoryColor: (categoryId) => {
        const map = { geometry: '#8be9fd', view: '#ff79c6', math: '#f1fa8c' }
        return map[categoryId] || '#aaaaaa'
    }
}))

const makeNode = (id, typeId, label = '') => ({ id, typeId, label })

describe('OutlinerPanelWindow', () => {
    it('renders an empty state when there are no nodes', () => {
        render(<OutlinerPanelWindow nodes={[]} selectedNodeId={null} onSelectNode={vi.fn()} />)
        expect(screen.getByText(/no nodes/i)).toBeTruthy()
    })

    it('lists nodes with their type label and node label', () => {
        const nodes = [
            makeNode('n1', 'geom.cube', 'My Cube'),
            makeNode('n2', 'view.text', 'My Text')
        ]
        render(<OutlinerPanelWindow nodes={nodes} selectedNodeId={null} onSelectNode={vi.fn()} />)
        expect(screen.getByText('Cube')).toBeTruthy()
        expect(screen.getByText('My Cube')).toBeTruthy()
        expect(screen.getByText('Text Panel')).toBeTruthy()
        expect(screen.getByText('My Text')).toBeTruthy()
    })

    it('falls back to typeId when getNodeType returns null', () => {
        const nodes = [makeNode('n1', 'unknown.type', 'Fallback')]
        render(<OutlinerPanelWindow nodes={nodes} selectedNodeId={null} onSelectNode={vi.fn()} />)
        expect(screen.getByText('unknown.type')).toBeTruthy()
    })

    it('marks the selected node button with is-selected', () => {
        const nodes = [
            makeNode('n1', 'geom.cube', 'First'),
            makeNode('n2', 'view.text', 'Second')
        ]
        const { container } = render(
            <OutlinerPanelWindow nodes={nodes} selectedNodeId="n2" onSelectNode={vi.fn()} />
        )
        const buttons = container.querySelectorAll('button')
        expect(buttons[0].classList.contains('is-selected')).toBe(false)
        expect(buttons[1].classList.contains('is-selected')).toBe(true)
    })

    it('renders a coloured dot using the category colour', () => {
        const nodes = [makeNode('n1', 'geom.cube', 'Cube')]
        const { container } = render(
            <OutlinerPanelWindow nodes={nodes} selectedNodeId={null} onSelectNode={vi.fn()} />
        )
        const dot = container.querySelector('.beta-outliner-dot')
        expect(dot).toBeTruthy()
        expect(dot.style.background).toMatch(/8be9fd|rgb\(139,\s*233,\s*253\)/i)
    })

    it('calls onSelectNode with the node id when a row is clicked', () => {
        const onSelectNode = vi.fn()
        const nodes = [
            makeNode('n1', 'geom.cube', 'First'),
            makeNode('n2', 'view.text', 'Second')
        ]
        render(<OutlinerPanelWindow nodes={nodes} selectedNodeId={null} onSelectNode={onSelectNode} />)
        fireEvent.click(screen.getByText('First').closest('button'))
        expect(onSelectNode).toHaveBeenCalledWith('n1')
    })
})
