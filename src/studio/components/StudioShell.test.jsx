import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioShell from './StudioShell.jsx'

vi.mock('./StudioViewportLayout.jsx', () => ({
    default: ({ shared }) => <output data-testid="gizmo-axis">{shared.gizmoAxis || 'all'}</output>
}))
vi.mock('./StudioFloatingPanel.jsx', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('./StudioControlCluster.jsx', () => ({
    default: ({ gizmoMode }) => <output data-testid="gizmo-mode">{gizmoMode}</output>
}))
vi.mock('./StudioQuickInsert.jsx', () => ({ default: () => null }))
vi.mock('./StudioInspector.jsx', () => ({ default: () => null }))
vi.mock('./StudioShellPanels.jsx', () => ({
    ActivityPanel: () => null,
    AssetsPanel: () => null,
    FilesPanel: () => null,
    LibraryPanel: () => null,
    PresentPanel: () => null,
    ProjectPanel: () => null,
    PublishPanel: () => null,
    StructurePanel: () => null,
}))

const renderShell = (overrides = {}) => render(
    <StudioShell
        document={{ projectMeta: {}, assets: [] }}
        selectedEntity={null}
        selectedEntityIds={[]}
        entities={[]}
        inspectorSections={[]}
        inspectorValues={{}}
        assetOptions={[]}
        {...overrides}
    />
)

describe('StudioShell transform shortcuts', () => {
    it.each([
        ['g', 'translate'],
        ['r', 'rotate'],
        ['s', 'scale'],
    ])('%s selects the same gizmo mode as its toolbar button', (key, mode) => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onStartTransform })

        fireEvent.keyDown(window, { key })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent(mode)
        expect(onStartTransform).not.toHaveBeenCalled()
    })

    it.each(['x', 'y', 'z'])('%s constrains the active gizmo and toggles back to all axes', (axis) => {
        renderShell({ selectedEntityIds: ['cube-1'] })

        fireEvent.keyDown(window, { key: 'r' })
        fireEvent.keyDown(window, { key: axis })
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent(axis)

        fireEvent.keyDown(window, { key: axis })
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('all')
    })

    it('clears the axis constraint when a different gizmo mode is selected', () => {
        renderShell({ selectedEntityIds: ['cube-1'] })

        fireEvent.keyDown(window, { key: 'r' })
        fireEvent.keyDown(window, { key: 'x' })
        fireEvent.keyDown(window, { key: 's' })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent('scale')
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('all')
    })
})
