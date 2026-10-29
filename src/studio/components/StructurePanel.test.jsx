import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StructurePanel } from './StudioShellPanels.jsx'
import { formatNumberDisplay } from '../utils/formatNumberDisplay.js'

const entities = [
    { id: 'visible', type: 'box', name: 'Visible', components: { runtime: { visible: true, locked: false } } },
    { id: 'locked', type: 'sphere', name: 'Locked', components: { runtime: { visible: true, locked: true } } },
    { id: 'hidden', type: 'cone', name: 'Hidden', components: { runtime: { visible: false, locked: false } } }
]

describe('StructurePanel selection', () => {
    it('shows the full selection and primary state', () => {
        render(
            <StructurePanel
                entities={entities}
                selectedEntityId="locked"
                selectedEntityIds={['visible', 'locked']}
                onSelectEntity={() => {}}
                onToggleSelectEntity={() => {}}
            />
        )

        expect(screen.getByRole('button', { name: /Visible/ })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: /Locked/ })).toHaveTextContent('· primary')
    })

    it('uses replacement click and additive modifier click consistently', () => {
        const onSelectEntity = vi.fn()
        const onToggleSelectEntity = vi.fn()
        render(
            <StructurePanel
                entities={entities}
                selectedEntityId="visible"
                selectedEntityIds={['visible']}
                onSelectEntity={onSelectEntity}
                onToggleSelectEntity={onToggleSelectEntity}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: /Locked/ }))
        fireEvent.click(screen.getByRole('button', { name: /Hidden/ }), { ctrlKey: true })

        expect(onSelectEntity).toHaveBeenCalledWith('locked')
        expect(onToggleSelectEntity).toHaveBeenCalledWith('hidden')
    })
})

describe('StructurePanel rename and runtime toggles', () => {
    const renderFull = (overrides = {}) => {
        const props = {
            entities,
            selectedEntityId: 'visible',
            selectedEntityIds: ['visible'],
            onSelectEntity: vi.fn(),
            onToggleSelectEntity: vi.fn(),
            onRenameEntity: vi.fn(),
            onToggleEntityVisible: vi.fn(),
            onToggleEntityLocked: vi.fn(),
            ...overrides
        }
        render(<StructurePanel {...props} />)
        return props
    }

    it('double-click renames via an inline input; Enter commits, Escape cancels', () => {
        const { onRenameEntity } = renderFull()

        fireEvent.doubleClick(screen.getByText('Visible'))
        const input = screen.getByLabelText('Object name')
        fireEvent.change(input, { target: { value: 'Hero Box' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onRenameEntity).toHaveBeenCalledWith('visible', 'Hero Box')

        fireEvent.doubleClick(screen.getByText('Locked'))
        const second = screen.getByLabelText('Object name')
        fireEvent.change(second, { target: { value: 'Discarded' } })
        fireEvent.keyDown(second, { key: 'Escape' })
        expect(onRenameEntity).toHaveBeenCalledTimes(1)
    })

    it('eye and lock toggles fire their callbacks without changing selection', () => {
        const { onToggleEntityVisible, onToggleEntityLocked, onSelectEntity } = renderFull()

        fireEvent.click(screen.getAllByRole('button', { name: 'Hide' })[0])
        expect(onToggleEntityVisible).toHaveBeenCalledWith('visible')

        fireEvent.click(screen.getByRole('button', { name: 'Show' }))
        expect(onToggleEntityVisible).toHaveBeenCalledWith('hidden')

        fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
        expect(onToggleEntityLocked).toHaveBeenCalledWith('locked')

        expect(onSelectEntity).not.toHaveBeenCalled()
    })

    it('reflects hidden/locked state on the toggles', () => {
        renderFull()
        expect(screen.getByRole('button', { name: 'Show' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Unlock' })).toHaveAttribute('aria-pressed', 'true')
    })
})

describe('StructurePanel markup (P17)', () => {
    it('never nests a button inside a button, and the row still selects by click and keyboard', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const onSelectEntity = vi.fn()
        const { container } = render(
            <StructurePanel entities={entities} selectedEntityId="visible" selectedEntityIds={['visible']} onSelectEntity={onSelectEntity} onToggleSelectEntity={() => {}} onToggleEntityVisible={() => {}} onToggleEntityLocked={() => {}} />
        )
        expect(container.querySelector('button button')).toBeNull()
        expect(err.mock.calls.some((c) => String(c[0]).includes('validateDOMNesting') || String(c.join(' ')).includes('descendant of <button>'))).toBe(false)
        err.mockRestore()
        const row = screen.getByText('Locked').closest('.spa-item')
        fireEvent.click(row)
        fireEvent.keyDown(row, { key: 'Enter' })
        expect(onSelectEntity).toHaveBeenCalledTimes(2)
    })
})

describe('formatNumberDisplay (P10)', () => {
    it('rounds only what is shown', () => {
        expect(formatNumberDisplay(0.5844327123)).toBe('0.5844')
        expect(formatNumberDisplay(2)).toBe('2')
        expect(formatNumberDisplay(-1.50004)).toBe('-1.5')
        expect(formatNumberDisplay('')).toBe('')
    })
})

describe('StructurePanel lists what the scene shows (UX audit F026)', () => {
    const nodeRows = [
        { id: 'n-sphere', name: 'Sphere', type: 'sphere', fromNodes: true, isGeo: false },
        { id: 'n-geo', name: 'Room', type: 'geo', fromNodes: true, isGeo: true }
    ]

    it('counts and lists standing nodes when the document has no entities', () => {
        render(<StructurePanel entities={[]} nodeRows={nodeRows} selectedEntityIds={[]} onSelectEntity={() => {}} onToggleSelectEntity={() => {}} />)

        expect(screen.getByText('Objects (2)')).toBeInTheDocument()
        expect(screen.queryByText('No objects yet.')).toBeNull()
        expect(screen.getByText('Sphere')).toBeInTheDocument()
    })

    it('adds node rows to the entities count', () => {
        render(<StructurePanel entities={entities} nodeRows={nodeRows} selectedEntityIds={[]} onSelectEntity={() => {}} onToggleSelectEntity={() => {}} />)
        expect(screen.getByText('Objects (5)')).toBeInTheDocument()
    })

    it('a Geo row opens that Geo on click', () => {
        const onOpenNodeRow = vi.fn()
        render(<StructurePanel entities={[]} nodeRows={nodeRows} onOpenNodeRow={onOpenNodeRow} selectedEntityIds={[]} onSelectEntity={() => {}} onToggleSelectEntity={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: /Room/ }))
        expect(onOpenNodeRow).toHaveBeenCalledWith('n-geo')
    })

    it('a row made in Nodes shows a visible Edit in Nodes button that opens Nodes', () => {
        const onEdit = vi.fn()
        render(<StructurePanel entities={[]} nodeRows={nodeRows} onOpenNodeRow={() => {}} onEditNodeRowInNodes={onEdit} selectedEntityIds={[]} onSelectEntity={() => {}} onToggleSelectEntity={() => {}} />)
        const buttons = screen.getAllByRole('button', { name: 'Edit in Nodes' })
        expect(buttons).toHaveLength(1)
        fireEvent.click(buttons[0])
        expect(onEdit).toHaveBeenCalledTimes(1)
    })
})
