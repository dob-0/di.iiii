import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PanelShell from './PanelShell.jsx'

describe('PanelShell', () => {
    it('renders a sheet surface without drag and resize affordances', () => {
        const handleClose = vi.fn()

        const { container } = render(
            <PanelShell
                title="World Settings"
                onClose={handleClose}
                surfaceMode="sheet"
            >
                <div>Panel body</div>
            </PanelShell>
        )

        expect(container.querySelector('.sheet-panel')).toBeTruthy()
        expect(container.querySelector('.draggable-panel')).toBeNull()
        expect(container.querySelector('.panel-resizer')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'x' }))
        expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('renders a dock surface without drag and resize affordances', () => {
        const handleClose = vi.fn()

        const { container } = render(
            <PanelShell
                title="Inspector"
                onClose={handleClose}
                surfaceMode="dock"
            >
                <div>Dock body</div>
            </PanelShell>
        )

        expect(container.querySelector('.dock-panel')).toBeTruthy()
        expect(container.querySelector('.draggable-panel')).toBeNull()
        expect(container.querySelector('.panel-resizer')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'x' }))
        expect(handleClose).toHaveBeenCalledTimes(1)
    })
})
