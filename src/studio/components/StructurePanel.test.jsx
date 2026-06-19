import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StructurePanel } from './StudioShellPanels.jsx'

const entities = [
    { id: 'visible', type: 'box', name: 'Visible', components: { runtime: { visible: true, locked: false } } },
    { id: 'locked', type: 'sphere', name: 'Locked', components: { runtime: { visible: true, locked: true } } },
    { id: 'hidden', type: 'cone', name: 'Hidden', components: { runtime: { visible: false, locked: false } } }
]

describe('StructurePanel selection', () => {
    it('shows the full selection and primary/hidden/locked state', () => {
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
        expect(screen.getByRole('button', { name: /Locked/ })).toHaveTextContent('locked · primary')
        expect(screen.getByRole('button', { name: /Hidden/ })).toHaveTextContent('hidden')
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
