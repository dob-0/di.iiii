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

describe('the Lights button', () => {
    // Labelled "Lights", not "Rig": the wiki's "The rig" already names the
    // unrelated multi-machine feature (machines in one room finding each
    // other), and this button sat one click away from it in the same panel.
    it('is not drawn when there is no lighting here (every hosted di.iiii)', () => {
        render(<StudioControlCluster {...base} />)
        expect(screen.getByText('Hide UI')).toBeInTheDocument()
        expect(screen.queryByText('Lights')).toBeNull()
    })

    it('is drawn when there is, off by default, and toggles', () => {
        const onToggleRigMirror = vi.fn()
        const { rerender } = render(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} />)
        const button = screen.getByText('Lights')
        expect(button).toHaveAttribute('title', 'Show the real lighting rig in the room')
        expect(button).toHaveAttribute('aria-pressed', 'false')
        expect(button.className).not.toMatch(/active/)
        fireEvent.click(button)
        expect(onToggleRigMirror).toHaveBeenCalledTimes(1)

        rerender(<StudioControlCluster {...base} onToggleRigMirror={onToggleRigMirror} rigMirrorOn />)
        expect(screen.getByText('Lights')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Lights').className).toMatch(/active/)
    })

    it('stays out of the simple jam view', () => {
        render(<StudioControlCluster {...base} minimal onToggleRigMirror={() => {}} />)
        expect(screen.queryByText('Lights')).toBeNull()
    })
})
