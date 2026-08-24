import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StructurePanel } from './StudioShellPanels.jsx'

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
