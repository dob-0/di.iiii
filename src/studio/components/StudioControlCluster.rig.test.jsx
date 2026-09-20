import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioControlCluster from './StudioControlCluster.jsx'

const base = {
    spaceName: 'rig-mirror-test',
    projectName: 'room',
    editMode: 'navigate',
    onSetEditMode: () => {},
    gizmoMode: 'translate',
    onSetGizmoMode: () => {},
    openPanels: new Set(),
    onTogglePanel: () => {}
}

describe('the Rig button', () => {
    it('is not drawn when there is no lighting here (every hosted di.iiii)', () => {
        render(<StudioControlCluster {...base} />)
        expect(screen.getByText('Hide UI')).toBeInTheDocument()
        expect(screen.queryByText('Rig')).toBeNull()
    })

    it('is drawn when there is, off by default, and toggles', () => {
        const onToggleRigMirror = vi.fn()
        const { rerender } = render(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} />)
        const button = screen.getByText('Rig')
        expect(button).toHaveAttribute('aria-pressed', 'false')
        expect(button.className).not.toMatch(/active/)
        fireEvent.click(button)
        expect(onToggleRigMirror).toHaveBeenCalledTimes(1)

        rerender(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} rigMirrorOn />)
        expect(screen.getByText('Rig')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Rig').className).toMatch(/active/)
    })

    it('stays out of the simple jam view', () => {
        render(<StudioControlCluster {...base} minimal onToggleRigMirror={() => {}} />)
        expect(screen.queryByText('Rig')).toBeNull()
    })
})
